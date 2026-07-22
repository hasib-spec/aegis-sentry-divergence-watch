import { NextRequest, NextResponse } from "next/server";
import { analyzeObservationArc } from "@/lib/engine/observation-arc";
import { modelRiskEvolution } from "@/lib/engine/risk-evolution";
import { computeYarkovskyDrift, defaultYarkovskyParams } from "@/lib/engine/yarkovsky";
import { computeImpactEnergyMt, computeImpactVelocity } from "@/lib/engine/palermo";
import { extractNasaSBDBElements, normalizeDesignation } from "@/lib/engine/parsers";
import { JD_J2000, SECONDS_PER_DAY, AU_KM, DEG_TO_RAD } from "@/lib/engine/constants";
import { KeplerianElements } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const NASA_SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api";
const ESA_BASE_URL = "https://neo.ssa.esa.int/PSDB-portlet/download";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const des = searchParams.get("des");

  if (!des) {
    return NextResponse.json({ error: "Missing 'des' parameter" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const nowJD = JD_J2000 + Date.now() / 1000 / SECONDS_PER_DAY;

  try {
    // Fetch data from NASA Sentry + SBDB + ESA
    const [sentryRes, sbdbRes, esaKe1Res] = await Promise.allSettled([
      fetch(`${NASA_SENTRY_URL}?des=${encodeURIComponent(des)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      fetch(`${NASA_SBDB_URL}?sstr=${encodeURIComponent(des)}&full-prec=1&cov=vec&phys-par=1`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      fetch(`${ESA_BASE_URL}?file=${encodeURIComponent(des)}.ke1`, {
        signal: controller.signal,
        headers: { Accept: "text/plain" },
      }),
    ]);
    clearTimeout(timeout);

    // --- Parse Sentry ---
    let lastObsJD = nowJD - 30;
    let currentIP = 1e-9;
    let diameterKm = 0.05;
    let vInfKmS = 15;
    let yearsToImpact = 50;
    let sentrySummary: Record<string, string> | null = null;

    if (sentryRes.status === "fulfilled" && sentryRes.value.ok) {
      try {
        const sentryJson = await sentryRes.value.json();
        if (sentryJson.data && sentryJson.data.length > 0) {
          const rec = sentryJson.data[0];
          sentrySummary = rec;
          currentIP = parseFloat(rec.ip) || 1e-9;
          diameterKm = parseFloat(rec.diameter) || 0.05;
          vInfKmS = parseFloat(rec.v_inf) || 15;
          if (rec.last_obs_jd) lastObsJD = parseFloat(rec.last_obs_jd);
          const rangeMatch = (rec.range || "").match(/(\d{4})/);
          if (rangeMatch) {
            yearsToImpact = Math.max(parseInt(rangeMatch[1]) - new Date().getFullYear(), 1);
          }
        }
      } catch { /* parse error */ }
    }

    // --- Parse SBDB for orbital elements + covariance ---
    let semiMajorAxisAU = 1.5;
    let elementSigmas: number[] = [0.01, 0.01, 0.1, 0.1, 0.1, 0.1];
    let orbitEpochJD = nowJD - 30;
    let daDtAUDay = 0;
    let nasaElements: ReturnType<typeof extractNasaSBDBElements> = null;

    if (sbdbRes.status === "fulfilled" && sbdbRes.value.ok) {
      try {
        const sbdbJson = await sbdbRes.value.json();
        if (sbdbJson.orbit) {
          nasaElements = extractNasaSBDBElements(sbdbJson.orbit);
          if (nasaElements) {
            semiMajorAxisAU = nasaElements.semiMajorAxisAU;
            elementSigmas = [...nasaElements.sigmas];
            orbitEpochJD = nasaElements.epochJD;

            // Compute Yarkovsky drift if non-grav params available
            if (nasaElements.nonGravParams && (nasaElements.nonGravParams.A1 || nasaElements.nonGravParams.A2)) {
              const yarkResult = computeYarkovskyDrift(nasaElements, defaultYarkovskyParams(diameterKm));
              daDtAUDay = yarkResult.daDtAUDay;
            }
          }
          // Try to get epoch from orbit data directly
          if (sbdbJson.orbit.epoch) {
            orbitEpochJD = parseFloat(sbdbJson.orbit.epoch);
          }
        }
      } catch { /* parse error */ }
    }

    // --- Parse ESA .ke1 for comparison ---
    let esaElements: KeplerianElements | null = null;
    if (esaKe1Res.status === "fulfilled" && esaKe1Res.value.ok) {
      try {
        const ke1Text = await esaKe1Res.value.text();
        esaElements = parseEsaKe1(ke1Text);
      } catch { /* parse error */ }
    }

    // --- Compute impact energy for Palermo Scale ---
    const vImp = computeImpactVelocity(vInfKmS);
    const energyMt = computeImpactEnergyMt(diameterKm, vImp);

    // --- Estimate current miss distance and sigma ---
    // Use IP to back-calculate approximate miss distance
    // IP ≈ (R⊕²/(2σ²)) × exp(-d²/(2σ²))
    // For small IP: d ≈ σ × sqrt(-2×ln(IP × 2σ²/R⊕²))
    const currentSigmaKm = Math.max(
      1000,
      elementSigmas[5] * semiMajorAxisAU * AU_KM // M sigma × a
    );
    const earthCrossSection = Math.PI * 6378.137 * 6378.137;
    const geometricFactor = earthCrossSection / (2 * Math.PI * currentSigmaKm * currentSigmaKm);
    let currentMissKm: number;
    if (currentIP > 0 && geometricFactor > 0) {
      const arg = currentIP / geometricFactor;
      if (arg > 0 && arg < 1) {
        currentMissKm = currentSigmaKm * Math.sqrt(-2 * Math.log(arg));
      } else {
        currentMissKm = currentSigmaKm * 2;
      }
    } else {
      currentMissKm = currentSigmaKm * 3;
    }
    currentMissKm = Math.max(currentMissKm, 6378.137);

    // --- Run observation arc analysis ---
    const arcAnalysis = analyzeObservationArc(
      des, lastObsJD, orbitEpochJD, elementSigmas,
      semiMajorAxisAU, daDtAUDay, nowJD
    );

    // --- Run risk evolution model ---
    const riskEvolution = modelRiskEvolution(
      des, currentIP, currentSigmaKm, currentMissKm,
      daDtAUDay, semiMajorAxisAU, yearsToImpact,
      arcAnalysis.arc.arcLengthDays, nowJD, energyMt
    );

    return NextResponse.json({
      designation: des,
      timestamp: new Date().toISOString(),
      observationArc: {
        ...arcAnalysis,
        arc: {
          ...arcAnalysis.arc,
          firstObsDate: jdToDate(arcAnalysis.arc.firstObsJD),
          lastObsDate: jdToDate(arcAnalysis.arc.lastObsJD),
        },
        lossDate: jdToDate(arcAnalysis.lossDateJD),
      },
      riskEvolution,
      current: {
        ip: currentIP,
        diameterKm,
        vInfKmS,
        energyMt,
        semiMajorAxisAU,
        daDtAUDay,
        daDtAUMyr: daDtAUDay * 365.25 * 1e6,
        currentSigmaKm,
        currentMissKm,
        yearsToImpact,
        hasYarkovsky: daDtAUDay > 0,
      },
      sources: {
        nasa: sentrySummary !== null,
        sbdb: nasaElements !== null,
        esa: esaElements !== null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Evolution analysis failed", designation: des },
      { status: 500 }
    );
  }
}

function jdToDate(jd: number): string {
  const ms = (jd - 2440587.5) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseEsaKe1(text: string): KeplerianElements | null {
  try {
    const lines = text.split("\n");
    let pastHeader = false;
    let kepValues: number[] | null = null;
    let epochMJD: number | null = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "END_OF_HEADER") { pastHeader = true; continue; }
      if (!pastHeader) continue;
      if (trimmed.startsWith("KEP")) kepValues = trimmed.split(/\s+/).slice(1).map(parseFloat);
      else if (trimmed.startsWith("MJD")) epochMJD = parseFloat(trimmed.split(/\s+/)[1]);
    }
    if (!kepValues || kepValues.length < 6 || epochMJD === null) return null;
    const [a, e, iDeg, omegaDeg, wDeg, mDeg] = kepValues;
    return {
      semiMajorAxisAU: a, eccentricity: e,
      inclinationRad: iDeg * DEG_TO_RAD,
      longitudeAscendingNodeRad: omegaDeg * DEG_TO_RAD,
      argumentOfPerihelionRad: wDeg * DEG_TO_RAD,
      meanAnomalyAtEpochRad: mDeg * DEG_TO_RAD,
      epochJD: epochMJD + 2400000.5,
    };
  } catch { return null; }
}