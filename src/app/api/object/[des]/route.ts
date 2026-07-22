import { NextRequest, NextResponse } from "next/server";
import {
  extractNasaSBDBElements,
  normalizeDesignation,
} from "@/lib/engine/parsers";
import {
  propagateKeplerianToState,
  vectorDistance,
} from "@/lib/engine/kepler";
import {
  computeYarkovskyDrift,
  computeYarkovskyPositionShift,
  defaultYarkovskyParams,
} from "@/lib/engine/yarkovsky";
import { fullPalermoComputation } from "@/lib/engine/palermo";
import { JD_J2000, SECONDS_PER_DAY } from "@/lib/engine/constants";
import { KeplerianElements } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const NASA_SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api";
const ESA_BASE_URL = "https://neo.ssa.esa.int/PSDB-portlet/download";

export async function GET(
  request: NextRequest,
  { params }: { params: { des: string } }
) {
  const designation = decodeURIComponent(params.des);
  const normalizedDes = normalizeDesignation(designation);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const nowJD = JD_J2000 + Date.now() / 1000 / SECONDS_PER_DAY;

  try {
    const [sentryRes, sbdbRes, esaKe1Res, esaRiskRes] =
      await Promise.allSettled([
        fetch(
          `${NASA_SENTRY_URL}?des=${encodeURIComponent(designation)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        ),
        fetch(
          `${NASA_SBDB_URL}?sstr=${encodeURIComponent(designation)}&full-prec=1&cov=vec&phys-par=1`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        ),
        fetch(
          `${ESA_BASE_URL}?file=${encodeURIComponent(designation)}.ke1`,
          { signal: controller.signal, headers: { Accept: "text/plain" } }
        ),
        fetch(
          `${ESA_BASE_URL}?file=${encodeURIComponent(designation)}.risk`,
          { signal: controller.signal, headers: { Accept: "text/plain" } }
        ),
      ]);

    let sentryData: {
      summary?: Record<string, string>;
      data?: Array<Record<string, string>>;
    } | null = null;

    if (sentryRes.status === "fulfilled" && sentryRes.value.ok) {
      try {
        sentryData = await sentryRes.value.json();
      } catch {
        /* parse error */
      }
    }

    let nasaElements: ReturnType<typeof extractNasaSBDBElements> = null;
    let nasaNonGrav:
      | { A1?: number; A2?: number; A3?: number }
      | undefined;

    if (sbdbRes.status === "fulfilled" && sbdbRes.value.ok) {
      try {
        const sbdbJson = await sbdbRes.value.json();
        if (sbdbJson.orbit) {
          nasaElements = extractNasaSBDBElements(sbdbJson.orbit);
          if (nasaElements?.nonGravParams) {
            nasaNonGrav = nasaElements.nonGravParams;
          }
        }
      } catch {
        /* parse error */
      }
    }

    let esaElements: KeplerianElements | null = null;
    if (esaKe1Res.status === "fulfilled" && esaKe1Res.value.ok) {
      try {
        const ke1Text = await esaKe1Res.value.text();
        esaElements = parseEsaKe1File(ke1Text);
      } catch {
        /* parse error */
      }
    }

    let esaRiskData: string | null = null;
    if (esaRiskRes.status === "fulfilled" && esaRiskRes.value.ok) {
      try {
        esaRiskData = await esaRiskRes.value.text();
      } catch {
        /* parse error */
      }
    }

    const propagationTargets = [
      nowJD + 365.25,
      nowJD + 3652.5,
      nowJD + 18262.5,
    ];

    const propagationResults = propagationTargets.map((targetJD) => {
      let nasaPos = null;
      let esaPos = null;
      let yarkovskyShift = 0;
      let daDt = 0;

      if (nasaElements) {
        if (nasaNonGrav && (nasaNonGrav.A1 || nasaNonGrav.A2)) {
          const diameterKm = sentryData?.summary
            ? parseFloat(sentryData.summary.diameter) || 0.1
            : 0.1;
          const yarkParams = defaultYarkovskyParams(diameterKm);
          const yarkResult = computeYarkovskyDrift(nasaElements, yarkParams);
          daDt = yarkResult.daDtAUDay;
        }
        const nasaState = propagateKeplerianToState(
          nasaElements,
          targetJD,
          daDt
        );
        nasaPos = nasaState.position;
        const deltaT = Math.abs(targetJD - nasaElements.epochJD);
        yarkovskyShift = computeYarkovskyPositionShift(
          daDt,
          nasaElements.semiMajorAxisAU,
          deltaT
        );
      }

      if (esaElements) {
        const esaState = propagateKeplerianToState(esaElements, targetJD, 0);
        esaPos = esaState.position;
      }

      const spatialDiv =
        nasaPos && esaPos ? vectorDistance(nasaPos, esaPos) : 0;

      return {
        targetJD,
        yearsFromNow: (targetJD - nowJD) / 365.25,
        nasaPosition: nasaPos,
        esaPosition: esaPos,
        spatialDivergenceKm: spatialDiv,
        yarkovskyPositionShiftKm: yarkovskyShift,
        daDtAUDay: daDt,
      };
    });

    let palermoAnalysis = null;
    if (sentryData?.summary) {
      const s = sentryData.summary;
      const ip = parseFloat(s.ip) || 0;
      const diameterKm = parseFloat(s.diameter) || 0;
      const vInf = parseFloat(s.v_inf) || 15;
      const rangeMatch = (s as Record<string, string>).range?.match(/(\d{4})/);
      const years = rangeMatch
        ? Math.max(parseInt(rangeMatch[1]) - new Date().getFullYear(), 1)
        : 50;

      palermoAnalysis = fullPalermoComputation({
        impactProbability: ip,
        diameterKm,
        vInfKmS: vInf,
        yearsToImpact: years,
      });
    }

    return NextResponse.json({
      designation,
      normalizedDesignation: normalizedDes,
      engineVersion: "2.0.0-scientific-exact",
      timestamp: new Date().toISOString(),
      nasa: {
        sentry: sentryData,
        orbitalElements: nasaElements,
        nonGravParams: nasaNonGrav,
        hasYarkovskyModeling: !!(
          nasaNonGrav &&
          (nasaNonGrav.A1 || nasaNonGrav.A2)
        ),
      },
      esa: {
        orbitalElements: esaElements,
        riskFileRaw: esaRiskData,
        hasNonGravModeling: false,
      },
      propagation: propagationResults,
      palermo: palermoAnalysis,
      divergence: {
        spatialDivergence1yr:
          propagationResults[0]?.spatialDivergenceKm || 0,
        spatialDivergence10yr:
          propagationResults[1]?.spatialDivergenceKm || 0,
        spatialDivergence50yr:
          propagationResults[2]?.spatialDivergenceKm || 0,
        yarkovskyShift50yr:
          propagationResults[2]?.yarkovskyPositionShiftKm || 0,
        daDtAUDay: propagationResults[0]?.daDtAUDay || 0,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal engine error",
        designation,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseEsaKe1File(text: string): KeplerianElements | null {
  try {
    const lines = text.split("\n");
    let pastHeader = false;
    let kepValues: number[] | null = null;
    let epochMJD: number | null = null;
    let H: number | null = null;
    let G: number | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "END_OF_HEADER") {
        pastHeader = true;
        continue;
      }
      if (!pastHeader) continue;

      if (trimmed.startsWith("KEP")) {
        const tokens = trimmed.split(/\s+/).slice(1);
        kepValues = tokens.map(parseFloat);
      } else if (trimmed.startsWith("MJD")) {
        const tokens = trimmed.split(/\s+/);
        epochMJD = parseFloat(tokens[1]);
      } else if (trimmed.startsWith("MAG")) {
        const tokens = trimmed.split(/\s+/);
        H = parseFloat(tokens[1]);
        G = parseFloat(tokens[2]);
      }
    }

    if (!kepValues || kepValues.length < 6 || epochMJD === null) return null;

    const [a, e, iDeg, omegaDeg, wDeg, mDeg] = kepValues;
    const D2R = Math.PI / 180;

    return {
      semiMajorAxisAU: a,
      eccentricity: e,
      inclinationRad: iDeg * D2R,
      longitudeAscendingNodeRad: omegaDeg * D2R,
      argumentOfPerihelionRad: wDeg * D2R,
      meanAnomalyAtEpochRad: mDeg * D2R,
      epochJD: epochMJD + 2400000.5,
      absoluteMagnitudeH: H ?? undefined,
      slopeParameterG: G ?? undefined,
    };
  } catch {
    return null;
  }
}