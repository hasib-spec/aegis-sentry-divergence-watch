/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Yarkovsky Effect Perturbation Model
 *
 * Vokrouhlický (1998a, 1999) diurnal thermal model.
 * da/dt = -(8α/9n) · Φ(a) · [G·sin(δ)/(1+λ)] · cos(γ)
 *
 * NASA Sentry-II includes this via A1, A2 estimation.
 * ESA Aegis runs gravitational-only (Fenucci et al. 2024, §7.4.1).
 */

import {
  AU_KM,
  SPEED_OF_LIGHT_KMS,
  SOLAR_FLUX_1AU,
  STEFAN_BOLTZMANN,
  DEFAULT_DENSITY_KG_M3,
  YARKOVSKY_DEFAULT_CONDUCTIVITY,
  YARKOVSKY_DEFAULT_HEAT_CAPACITY,
  YARKOVSKY_DEFAULT_SURFACE_DENSITY,
  YARKOVSKY_DEFAULT_ROTATION_PERIOD_H,
  YARKOVSKY_DEFAULT_OBLIQUITY_DEG,
  YARKOVSKY_DEFAULT_ABSORPTIVITY,
  MU_SUN,
  SECONDS_PER_DAY,
  DEG_TO_RAD,
} from "./constants";
import { KeplerianElements } from "./types";

export interface YarkovskyParams {
  absorptivity: number;
  radiusKm: number;
  densityKgM3: number;
  conductivity: number;
  heatCapacity: number;
  surfaceDensity: number;
  rotationPeriodH: number;
  obliquityDeg: number;
}

export interface YarkovskyResult {
  daDtAUDay: number;
  daDtAUMyr: number;
  diurnalAccelerationKmS2: number;
  thermalParameterTheta: number;
  penetrationDepthM: number;
  subsolarTemperatureK: number;
  radiationForceFactor: number;
}

export function defaultYarkovskyParams(diameterKm: number): YarkovskyParams {
  return {
    absorptivity: YARKOVSKY_DEFAULT_ABSORPTIVITY,
    radiusKm: diameterKm / 2,
    densityKgM3: DEFAULT_DENSITY_KG_M3,
    conductivity: YARKOVSKY_DEFAULT_CONDUCTIVITY,
    heatCapacity: YARKOVSKY_DEFAULT_HEAT_CAPACITY,
    surfaceDensity: YARKOVSKY_DEFAULT_SURFACE_DENSITY,
    rotationPeriodH: YARKOVSKY_DEFAULT_ROTATION_PERIOD_H,
    obliquityDeg: YARKOVSKY_DEFAULT_OBLIQUITY_DEG,
  };
}

export function computeYarkovskyDrift(
  elements: KeplerianElements,
  params: YarkovskyParams
): YarkovskyResult {
  const aKm = elements.semiMajorAxisAU * AU_KM;
  const aM = aKm * 1000;
  const e = elements.eccentricity;

  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3));
  const fluxAtA = SOLAR_FLUX_1AU / Math.pow(elements.semiMajorAxisAU, 2);

  const emissivity = 0.9;
  const subsolarT = Math.pow(
    (params.absorptivity * fluxAtA) / (emissivity * STEFAN_BOLTZMANN),
    0.25
  );

  const omega = (2 * Math.PI) / (params.rotationPeriodH * 3600);
  const l_d = Math.sqrt(
    params.conductivity / (params.surfaceDensity * params.heatCapacity * omega)
  );

  const Theta =
    Math.sqrt(
      params.conductivity * params.surfaceDensity * params.heatCapacity * omega
    ) / (emissivity * STEFAN_BOLTZMANN * Math.pow(subsolarT, 3));

  const R_m = params.radiusKm * 1000;
  const X = (Math.SQRT2 * R_m) / l_d;
  const lambda = Theta / X;

  const phiA =
    (3 * fluxAtA) /
    (4 * R_m * params.densityKgM3 * SPEED_OF_LIGHT_KMS * 1000);

  const { A, B, C, D } = computeThermalFunctions(X, lambda);

  const denom = C * C + D * D;
  const GcosDelta = denom !== 0 ? (A * C + B * D) / denom : 0;
  const GsinDelta = denom !== 0 ? (B * C - A * D) / denom : 0;
  const G = Math.sqrt(GcosDelta * GcosDelta + GsinDelta * GsinDelta);
  const sinDelta = G > 0 ? GsinDelta / G : 0;

  const gammaRad = params.obliquityDeg * DEG_TO_RAD;
  const cosGamma = Math.cos(gammaRad);

  let daDt_m_s =
    (-(8 * params.absorptivity) / (9 * n)) *
    phiA *
    ((G * sinDelta) / (1 + lambda)) *
    cosGamma;

  const eccCorrection = 1 + (5 * e * e) / 2;
  daDt_m_s *= eccCorrection;

  const daDt_AU_day = (daDt_m_s / (AU_KM * 1000)) * SECONDS_PER_DAY;
  const daDt_AU_Myr = daDt_AU_day * 365.25 * 1e6;
  const diurnalAccel = (phiA * (G / (1 + lambda))) / 1000;

  return {
    daDtAUDay: daDt_AU_day,
    daDtAUMyr: daDt_AU_Myr,
    diurnalAccelerationKmS2: diurnalAccel,
    thermalParameterTheta: Theta,
    penetrationDepthM: l_d,
    subsolarTemperatureK: subsolarT,
    radiationForceFactor: phiA / 1000,
  };
}

function computeThermalFunctions(
  x: number,
  lambda: number
): { A: number; B: number; C: number; D: number } {
  const xClamped = Math.min(x, 50);
  const expX = Math.exp(xClamped);
  const cosX = Math.cos(xClamped);
  const sinX = Math.sin(xClamped);

  const A =
    -(xClamped + 2) - expX * ((xClamped - 2) * cosX - xClamped * sinX);
  const B =
    -xClamped - expX * (xClamped * cosX + (xClamped - 2) * sinX);

  const lambdaFactor = lambda / (1 + lambda);

  const aFunc =
    3 * (xClamped + 2) +
    expX * (3 * (xClamped - 2) * cosX + xClamped * (xClamped - 3) * sinX);
  const bFunc =
    xClamped * (xClamped + 3) -
    expX * (xClamped * (xClamped - 3) * cosX - 3 * (xClamped - 2) * sinX);

  const C = A + lambdaFactor * aFunc;
  const D = B + lambdaFactor * bFunc;

  return { A, B, C, D };
}

export function computeYarkovskyPositionShift(
  daDtAUDay: number,
  semiMajorAxisAU: number,
  deltaTDays: number
): number {
  const aKm = semiMajorAxisAU * AU_KM;
  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3));
  const deltaTSeconds = deltaTDays * SECONDS_PER_DAY;
  const deltaA_km = daDtAUDay * AU_KM * deltaTDays;
  const alongTrackShift =
    (3 / 2) * (deltaA_km / aKm) * n * deltaTSeconds * aKm;
  return Math.abs(alongTrackShift);
}

export function estimateYarkovskyModeling(
  diameterKm: number,
  agency: "NASA" | "ESA"
): { modeled: boolean; confidence: string } {
  if (agency === "NASA") {
    if (diameterKm > 0.05) {
      return {
        modeled: true,
        confidence: "HIGH — Sentry-II IOBS includes A1,A2 estimation",
      };
    } else if (diameterKm > 0.01) {
      return {
        modeled: true,
        confidence: "MODERATE — limited by astrometric precision",
      };
    }
    return {
      modeled: false,
      confidence: "LOW — too small for reliable Yarkovsky detection",
    };
  } else {
    return {
      modeled: false,
      confidence: "NOT MODELED — Aegis uses gravitational-only for most NEAs",
    };
  }
}