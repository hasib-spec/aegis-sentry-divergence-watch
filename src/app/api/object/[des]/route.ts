import { NextRequest, NextResponse } from "next/server";
import { extractNasaSBDBElements, normalizeDesignation } from "@/lib/engine/parsers";
import { propagateKeplerianToState, vectorDistance } from "@/lib/engine/kepler";
import { computeYarkovskyDrift, computeYarkovskyPositionShift, defaultYarkovskyParams } from "@/lib/engine/yarkovsky";
import { fullPalermoComputation } from "@/lib/engine/palermo";
import { computeAdvancedBundle, parseYearsFromRange } from "@/lib/engine/advanced-analysis";
import { JD_J2000, SECONDS_PER_DAY } from "@/lib/engine/constants";
import { KeplerianElements, DossierResponse } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const NASA_SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api";
const ESA_BASE_URL = "https://neo.ssa.esa.int/PSDB-portlet/download";

export async function GET(request: NextRequest, { params }: { params: { des: string } }) {
  const designation = decodeURIComponent(params.des);
  const normalizedDes = normalizeDesignation(designation);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const nowJD = JD_J2000 + Date.now() / 1000 / SECONDS_PER_DAY;

  try {
    const [sentryRes, sbdbRes, esaKe1Res, esaRiskRes] = await Promise.allSettled([
      fetch(`${NASA_SENTRY_URL}?des=${encodeURIComponent(designation)}`, { signal: controller.signal, headers: { Accept: "application/json" } }),
      fetch(`${NASA_SBDB_URL}?sstr=${encodeURIComponent(designation)}&full-prec=1&cov=vec&phys-par=1`, { signal: controller.signal, headers: { Accept: "application/json" } }),
      fetch(`${ESA_BASE_URL}?file=${encodeURIComponent(designation)}.ke1`, { signal: controller.signal, headers: { Accept: "text/plain" } }),
      fetch(`${ESA_BASE_URL}?file=${encodeURIComponent(designation)}.risk`, { signal: controller.signal, headers: { Accept: "text/plain" } }),
    ]);

    let sentryData: { summary?: Record<string, string>; data?: Array<Record<string, string>> } | null = null;
    if (sentryRes.status === "fulfilled" && sentryRes.value.ok) { try { sentryData = await sentryRes.value.json(); } catch { /* */ } }

    let nasaElements: ReturnType<typeof extractNasaSBDBElements> = null;
    let nasaNonGrav: { A1?: number; A2?: number; A3?: number } | undefined;
    if (sbdbRes.status === "fulfilled" && sbdbRes.value.ok) {
      try {
        const sbdbJson = await sbdbRes.value.json();
        if (sbdbJson.orbit) {
          nasaElements = extractNasaSBDBElements(sbdbJson.orbit);
          if (nasaElements?.nonGravParams) nasaNonGrav = nasaElements.nonGravParams;
        }
      } catch { /* */ }
    }

    let esaElements: KeplerianElements | null = null;
    if (esaKe1Res.status === "fulfilled" && esaKe1Res.value.ok) {
      try { esaElements = parseEsaKe1File(await esaKe1Res.value.text()); } catch { /* */ }
    }

    let esaRiskData: string | null = null;
    if (esaRiskRes.status === "fulfilled" && esaRiskRes.value.ok) {
      try { esaRiskData = await esaRiskRes.value.text(); } catch { /* */ }
    }

    const propagationTargets = [nowJD + 365.25, nowJD + 3652.5, nowJD + 18262.5];
    const propagationResults = propagationTargets.map((targetJD) => {
      let nasaPos = null; let esaPos = null; let yarkovskyShift = 0; let daDt = 0;
      if (nasaElements) {
        if (nasaNonGrav && (nasaNonGrav.A1 || nasaNonGrav.A2)) {
          const dKm = sentryData?.summary ? parseFloat(sentryData.summary.diameter) || 0.1 : 0.1;
          daDt = computeYarkovskyDrift(nasaElements, defaultYarkovskyParams(dKm)).daDtAUDay;
        }
        nasaPos = propagateKeplerianToState(nasaElements, targetJD, daDt).position;
        yarkovskyShift = computeYarkovskyPositionShift(daDt, nasaElements.semiMajorAxisAU, Math.abs(targetJD - nasaElements.epochJD));
      }
      if (esaElements) esaPos = propagateKeplerianToState(esaElements, targetJD, 0).position;
      return { targetJD, yearsFromNow: (targetJD - nowJD) / 365.25, nasaPosition: nasaPos, esaPosition: esaPos, spatialDivergenceKm: nasaPos && esaPos ? vectorDistance(nasaPos, esaPos) : 0, yarkovskyPositionShiftKm: yarkovskyShift, daDtAUDay: daDt };
    });

    const s = sentryData?.summary;
    const ip = s ? parseFloat(s.ip) || 0 : 0;
    const diameterKm = s ? parseFloat(s.diameter) || 0 : 0;
    const vInf = s ? parseFloat(s.v_inf) || 15 : 15;
    const years = s ? parseYearsFromRange((s as Record<string, string>).range || "") : 50;
    let palermoAnalysis = null;
    if (s && diameterKm > 0) palermoAnalysis = fullPalermoComputation({ impactProbability: ip, diameterKm, vInfKmS: vInf, yearsToImpact: years });

    const bestElements = nasaElements ?? esaElements;
    const bundle = computeAdvancedBundle({ designation, elements: bestElements, diameterKm: diameterKm > 0 ? diameterKm : 0.03, impactProbability: ip > 0 ? ip : 1e-9, yearsToImpact: years, vInfKmS: vInf, energyMt: palermoAnalysis?.energyMt ?? 0.01, probabilityRatio: 1, sourceMatch: "BOTH" }, nowJD);

    const dossier: DossierResponse = {
      designation, normalizedDesignation: normalizedDes, engineVersion: "3.0.0-readiness-engine", timestamp: new Date().toISOString(),
      nasa: { sentry: sentryData, orbitalElements: nasaElements, nonGravParams: nasaNonGrav, hasYarkovskyModeling: !!(nasaNonGrav && (nasaNonGrav.A1 || nasaNonGrav.A2)) },
      esa: { orbitalElements: esaElements, riskFileRaw: esaRiskData, hasNonGravModeling: false },
      propagation: propagationResults,
      palermo: palermoAnalysis,
      divergence: { spatialDivergence1yr: propagationResults[0]?.spatialDivergenceKm || 0, spatialDivergence10yr: propagationResults[1]?.spatialDivergenceKm || 0, spatialDivergence50yr: propagationResults[2]?.spatialDivergenceKm || 0, yarkovskyShift50yr: propagationResults[2]?.yarkovskyPositionShiftKm || 0, daDtAUDay: propagationResults[0]?.daDtAUDay || 0 },
      advanced: { ysi: bundle.ysi, keyhole: bundle.keyhole, corridor: bundle.corridor, readiness: bundle.readiness, elementsEstimated: bundle.elementsEstimated },
    };

    return NextResponse.json(dossier);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Engine error", designation, timestamp: new Date().toISOString() }, { status: 500 });
  } finally { clearTimeout(timeout); }
}

function parseEsaKe1File(text: string): KeplerianElements | null {
  try {
    const lines = text.split("\n");
    let pastHeader = false; let kepValues: number[] | null = null; let epochMJD: number | null = null; let H: number | null = null; let G: number | null = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "END_OF_HEADER") { pastHeader = true; continue; }
      if (!pastHeader) continue;
      if (trimmed.startsWith("KEP")) kepValues = trimmed.split(/\s+/).slice(1).map(parseFloat);
      else if (trimmed.startsWith("MJD")) epochMJD = parseFloat(trimmed.split(/\s+/)[1]);
      else if (trimmed.startsWith("MAG")) { const t = trimmed.split(/\s+/); H = parseFloat(t[1]); G = parseFloat(t[2]); }
    }
    if (!kepValues || kepValues.length < 6 || epochMJD === null) return null;
    const [a, e, iDeg, omegaDeg, wDeg, mDeg] = kepValues;
    const D2R = Math.PI / 180;
    return { semiMajorAxisAU: a, eccentricity: e, inclinationRad: iDeg * D2R, longitudeAscendingNodeRad: omegaDeg * D2R, argumentOfPerihelionRad: wDeg * D2R, meanAnomalyAtEpochRad: mDeg * D2R, epochJD: epochMJD + 2400000.5, absoluteMagnitudeH: H ?? undefined, slopeParameterG: G ?? undefined };
  } catch { return null; }
}
