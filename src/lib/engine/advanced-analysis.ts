/**
 * AEGIS-SENTRY v3.0 — Advanced Analysis Orchestrator
 * Integrates: YSI, Keyhole Scan, Impact Corridor, Rubin Readiness.
 */

import { computeYarkovskySensitivity } from "./yarkovsky-sensitivity";
import { computeImpactCorridor, estimateBPlaneFromUncertainty } from "./impact-corridor";
import { computeKeyholes, computeKeyholeProximity } from "./keyhole";
import { computeRubinReadiness } from "./rubin-readiness";
import { computeOrbitalPeriodDays } from "./kepler";
import { EARTH_RADIUS_KM, DEG_TO_RAD, RAD_TO_DEG, JD_J2000 } from "./constants";
import {
  KeplerianElements,
  YsiMetrics,
  KeyholeMetrics,
  KeyholeInfo,
  CorridorMetrics,
  ReadinessMetrics,
} from "./types";

export interface AdvancedBundle {
  ysi: YsiMetrics;
  keyhole: KeyholeMetrics;
  corridor: CorridorMetrics;
  readiness: ReadinessMetrics;
  elementsEstimated: boolean;
}

export interface AdvancedInput {
  designation: string;
  elements: KeplerianElements | null;
  diameterKm: number;
  impactProbability: number;
  yearsToImpact: number;
  vInfKmS: number;
  energyMt: number;
  probabilityRatio: number;
  sourceMatch: "BOTH" | "NASA_ONLY" | "ESA_ONLY";
}

function hashDesignation(des: string): number {
  let h = 2166136261;
  for (let i = 0; i < des.length; i++) {
    h ^= des.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function synthesizeElements(designation: string, epochJD: number): KeplerianElements {
  const h = hashDesignation(designation);
  const h2 = hashDesignation(designation + "::2");
  const h3 = hashDesignation(designation + "::3");
  return {
    semiMajorAxisAU: 1.2 + h * 1.4,
    eccentricity: 0.25 + h2 * 0.4,
    inclinationRad: (4 + h3 * 20) * DEG_TO_RAD,
    longitudeAscendingNodeRad: h * 2 * Math.PI,
    argumentOfPerihelionRad: h2 * 2 * Math.PI,
    meanAnomalyAtEpochRad: h3 * 2 * Math.PI,
    epochJD,
  };
}

function estimateBPlaneSigma(diameterKm: number, yearsToImpact: number): number {
  const d = Math.max(diameterKm, 0.005);
  const t = Math.max(yearsToImpact, 1);
  const sigma = 2500 * Math.pow(t / 20, 1.5) * Math.pow(0.3 / d, 0.25);
  return Math.max(300, Math.min(500000, sigma));
}

function encounterGeometry(elements: KeplerianElements, yearsToImpact: number, nowJD: number) {
  const OMEGA_EARTH_RATE = 0.9856474;
  const LAMBDA_EARTH_J2000 = 100.46;
  const EPSILON = 23.44 * DEG_TO_RAD;
  const nodeLon = elements.longitudeAscendingNodeRad * RAD_TO_DEG;
  const lambdaEarth = (LAMBDA_EARTH_J2000 + OMEGA_EARTH_RATE * (nowJD - JD_J2000 + yearsToImpact * 365.25)) % 360;
  const decDeg = Math.asin(Math.sin(EPSILON) * Math.sin(nodeLon * DEG_TO_RAD)) * RAD_TO_DEG;
  let lonDeg = nodeLon - lambdaEarth;
  while (lonDeg > 180) lonDeg -= 360;
  while (lonDeg < -180) lonDeg += 360;
  return { raDeg: nodeLon, decDeg, latDeg: decDeg, lonDeg };
}

export function computeAdvancedBundle(input: AdvancedInput, nowJD: number): AdvancedBundle {
  const elements = input.elements ?? synthesizeElements(input.designation, nowJD);
  const elementsEstimated = input.elements === null;
  const diameterKm = input.diameterKm > 0 ? input.diameterKm : 0.03;
  const yearsToImpact = Math.max(input.yearsToImpact, 1);
  const vInfKmS = input.vInfKmS > 0 ? input.vInfKmS : 12;
  const ip = input.impactProbability > 0 ? input.impactProbability : 1e-9;

  // 1. YSI
  const bPlaneSigma = estimateBPlaneSigma(diameterKm, yearsToImpact);
  const ysiRaw = computeYarkovskySensitivity(elements, diameterKm, ip, yearsToImpact, vInfKmS, bPlaneSigma);
  const ysi: YsiMetrics = {
    ysi: ysiRaw.ysi,
    daDtAUMyr: ysiRaw.daDtAUMyr,
    alongTrackShiftKm: ysiRaw.alongTrackShiftKm,
    uncertaintyFraction: ysiRaw.yarkovskyUncertaintyFraction,
    dominanceYears: ysiRaw.yarkovskyDominanceYears,
    classification: ysiRaw.classification,
    bPlaneSigmaKm: bPlaneSigma,
  };

  // 2. Keyholes
  const periodYears = computeOrbitalPeriodDays(elements.semiMajorAxisAU) / 365.25;
  const missDistanceKm = EARTH_RADIUS_KM * (1.5 + 6 / (1 + ip * 1e7));
  const keyholesRaw = computeKeyholes(vInfKmS, missDistanceKm, periodYears, 60);
  const sigmaXi = bPlaneSigma * 0.4;
  const sigmaZeta = bPlaneSigma;
  const proximity = computeKeyholeProximity(0, sigmaXi, keyholesRaw);
  const keyholeList: KeyholeInfo[] = keyholesRaw.slice(0, 3).map((k) => ({
    resonance: `${k.earthOrbits}:${k.asteroidOrbits}`,
    xiKm: k.xiCenterKm,
    widthKm: k.widthKm,
    earthOrbits: k.earthOrbits,
    asteroidOrbits: k.asteroidOrbits,
  }));
  const susceptibility: KeyholeMetrics["susceptibility"] =
    proximity.isAlert && ysi.ysi >= 1 ? "HIGH" : proximity.isAlert || ysi.ysi >= 1.5 ? "ELEVATED" : "LOW";
  const keyhole: KeyholeMetrics = {
    keyholeCount: keyholesRaw.length,
    nearestResonance: proximity.nearestKeyhole ? `${proximity.nearestKeyhole.earthOrbits}:${proximity.nearestKeyhole.asteroidOrbits}` : "—",
    nearestXiKm: proximity.nearestKeyhole?.xiCenterKm ?? 0,
    nearestWidthKm: proximity.nearestKeyhole?.widthKm ?? 0,
    sigmaFromKeyhole: proximity.sigmaFromKeyhole,
    passageProbability: proximity.keyholePassageProbability,
    isAlert: proximity.isAlert,
    susceptibility,
    keyholes: keyholeList,
    missDistanceKm,
    sigmaXiKm: sigmaXi,
    sigmaZetaKm: sigmaZeta,
    vInfKmS,
  };

  // 3. Corridor
  const geo = encounterGeometry(elements, yearsToImpact, nowJD);
  const bPlane = estimateBPlaneFromUncertainty(sigmaZeta, sigmaXi, vInfKmS);
  const corridorRaw = computeImpactCorridor(
    { xi: bPlane.xi, zeta: bPlane.zeta },
    { sigmaXi: bPlane.sigmaXi, sigmaZeta: bPlane.sigmaZeta },
    vInfKmS, geo.raDeg, geo.decDeg
  );
  const corridor: CorridorMetrics = {
    hasCorridor: ip > 0,
    centerLatDeg: Math.max(-85, Math.min(85, corridorRaw.centerLatDeg)),
    centerLonDeg: corridorRaw.centerLonDeg,
    widthKm: Math.max(50, Math.min(3000, corridorRaw.widthKm)),
    lengthKm: Math.max(200, Math.min(15000, corridorRaw.lengthKm)),
    orientationDeg: corridorRaw.orientationDeg,
    entryVelocityKmS: corridorRaw.entryVelocityKmS,
    entryAngleDeg: corridorRaw.entryAngleDeg,
  };

  // 4. Readiness
  const readinessRaw = computeRubinReadiness({
    energyMt: input.energyMt > 0 ? input.energyMt : 0.01,
    yearsToImpact,
    ysi: ysi.ysi,
    probabilityRatio: input.probabilityRatio,
    sourceMatch: input.sourceMatch,
    impactProbability: ip,
    elementsEstimated,
  });
  const readiness: ReadinessMetrics = {
    score: readinessRaw.score,
    priority: readinessRaw.priority,
    nextWindowYears: readinessRaw.nextWindowYears,
    factors: readinessRaw.factors,
  };

  return { ysi, keyhole, corridor, readiness, elementsEstimated };
}

export function parseYearsFromRange(rangeStr: string): number {
  if (!rangeStr) return 50;
  const match = rangeStr.match(/(\d{4})\s*-\s*(\d{4})/);
  if (match) {
    const midYear = (parseInt(match[1]) + parseInt(match[2])) / 2;
    return Math.max(midYear - new Date().getFullYear(), 1);
  }
  const singleYear = rangeStr.match(/(\d{4})/);
  if (singleYear) return Math.max(parseInt(singleYear[1]) - new Date().getFullYear(), 1);
  return 50;
}
