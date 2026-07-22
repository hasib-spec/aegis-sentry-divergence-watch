/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Palermo Technical Impact Hazard Scale — Chesley et al. (2002)
 *
 * PS = log₁₀(IP / (f_B × T))
 * f_B = 0.03 × E^(-4/5) yr⁻¹
 */

import {
  PALERMO_FB_COEFFICIENT,
  PALERMO_FB_EXPONENT,
  MT_TNT_JOULES,
  DEFAULT_DENSITY_KG_M3,
} from "./constants";

export function computeBackgroundFrequency(energyMt: number): number {
  if (energyMt <= 0) return Infinity;
  return PALERMO_FB_COEFFICIENT * Math.pow(energyMt, PALERMO_FB_EXPONENT);
}

export function computePalermoScale(
  impactProbability: number,
  energyMt: number,
  yearsToImpact: number
): number {
  if (impactProbability <= 0 || energyMt <= 0 || yearsToImpact <= 0) {
    return -Infinity;
  }
  const fB = computeBackgroundFrequency(energyMt);
  const denominator = fB * yearsToImpact;
  if (denominator <= 0) return -Infinity;
  return Math.log10(impactProbability / denominator);
}

export function computeImpactEnergyMt(
  diameterKm: number,
  velocityKmS: number,
  densityKgM3: number = DEFAULT_DENSITY_KG_M3
): number {
  const radiusM = (diameterKm * 1000) / 2;
  const volumeM3 = (4 / 3) * Math.PI * Math.pow(radiusM, 3);
  const massKg = densityKgM3 * volumeM3;
  const vMs = velocityKmS * 1000;
  const energyJoules = 0.5 * massKg * vMs * vMs;
  return energyJoules / MT_TNT_JOULES;
}

export function computeImpactVelocity(vInfKmS: number): number {
  const vEscKmS = 11.186;
  return Math.sqrt(vInfKmS * vInfKmS + vEscKmS * vEscKmS);
}

export function diameterFromH(H: number, albedo: number = 0.154): number {
  return (1329 / Math.sqrt(albedo)) * Math.pow(10, -H / 5);
}

export function computeTorinoScale(
  impactProbability: number,
  energyMt: number,
  yearsToImpact: number
): number {
  if (impactProbability <= 0 || energyMt <= 0) return 0;
  const ps = computePalermoScale(impactProbability, energyMt, yearsToImpact);
  if (impactProbability < 1e-6 || ps < -2) return 0;
  if (impactProbability < 1e-4 && ps < -1) return 1;
  if (impactProbability < 1e-2 && ps < 0) return 2;
  if (impactProbability < 1e-1 && ps < 0) return 3;
  if (impactProbability < 1 && ps < 0) return 4;
  if (impactProbability < 1 && ps >= 0 && ps < 1) return 5;
  if (impactProbability < 1 && ps >= 1 && ps < 2) return 6;
  if (impactProbability < 1 && ps >= 2) return 7;
  if (impactProbability >= 1 && energyMt < 1) return 8;
  if (impactProbability >= 1 && energyMt < 1000) return 9;
  return 10;
}

export function fullPalermoComputation(params: {
  impactProbability: number;
  diameterKm: number;
  vInfKmS: number;
  yearsToImpact: number;
  densityKgM3?: number;
}): {
  palermoScale: number;
  backgroundFreq: number;
  energyMt: number;
  vImpKmS: number;
  torinoScale: number;
} {
  const vImp = computeImpactVelocity(params.vInfKmS);
  const energyMt = computeImpactEnergyMt(
    params.diameterKm,
    vImp,
    params.densityKgM3 ?? DEFAULT_DENSITY_KG_M3
  );
  const fB = computeBackgroundFrequency(energyMt);
  const ps = computePalermoScale(
    params.impactProbability,
    energyMt,
    params.yearsToImpact
  );
  const ts = computeTorinoScale(
    params.impactProbability,
    energyMt,
    params.yearsToImpact
  );

  return {
    palermoScale: ps,
    backgroundFreq: fB,
    energyMt,
    vImpKmS: vImp,
    torinoScale: ts,
  };
}