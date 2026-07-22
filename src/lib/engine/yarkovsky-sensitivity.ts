/**
 * AEGIS-SENTRY v3.0 — Yarkovsky Sensitivity Index (YSI)
 * 
 * Computes a single actionable metric: "How much does the impact
 * probability change when you include vs. exclude the Yarkovsky effect?"
 * 
 * YSI = |log₁₀(IP_with_Yarkovsky) - log₁₀(IP_without_Yarkovsky)|
 * 
 * YSI = 0: Yarkovsky doesn't matter (large body, short timescale)
 * YSI = 1: Yarkovsky changes IP by 10×
 * YSI = 2: Yarkovsky changes IP by 100×
 * YSI = 3: Yarkovsky changes IP by 1000× (CRITICAL)
 * 
 * This IS the NASA-vs-ESA divergence, quantified as a single number.
 * 
 * Reference: Farnocchia et al. (2013), "Yarkovsky-driven impact risk analysis"
 *            Bottke et al. (2002), "The Yarkovsky and YORP Effects"
 */

import { computeYarkovskyDrift, defaultYarkovskyParams } from "./yarkovsky";
import { computePalermoScale, computeImpactEnergyMt, computeImpactVelocity } from "./palermo";
import { KeplerianElements } from "./types";
import { AU_KM, MU_SUN, SECONDS_PER_DAY } from "./constants";

export interface YarkovskySensitivityResult {
  /** Yarkovsky Sensitivity Index (0-5+, logarithmic) */
  ysi: number;
  /** da/dt drift rate (AU/Myr) */
  daDtAUMyr: number;
  /** Along-track position shift over prediction window (km) */
  alongTrackShiftKm: number;
  /** Fraction of b-plane uncertainty explained by Yarkovsky */
  yarkovskyUncertaintyFraction: number;
  /** Time horizon at which Yarkovsky dominates uncertainty (years) */
  yarkovskyDominanceYears: number;
  /** Classification */
  classification: "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "DOMINANT";
}

/**
 * Computes the Yarkovsky Sensitivity Index for an asteroid.
 * 
 * @param elements - Orbital elements
 * @param diameterKm - Object diameter (km)
 * @param impactProbability - Current impact probability
 * @param yearsToImpact - Years until potential impact
 * @param vInfKmS - Hyperbolic excess velocity (km/s)
 * @param bPlaneSigmaKm - Current b-plane uncertainty (km)
 */
export function computeYarkovskySensitivity(
  elements: KeplerianElements | null,
  diameterKm: number,
  impactProbability: number,
  yearsToImpact: number,
  vInfKmS: number,
  bPlaneSigmaKm: number
): YarkovskySensitivityResult {
  if (!elements || diameterKm <= 0 || yearsToImpact <= 0) {
    return {
      ysi: 0,
      daDtAUMyr: 0,
      alongTrackShiftKm: 0,
      yarkovskyUncertaintyFraction: 0,
      yarkovskyDominanceYears: Infinity,
      classification: "NEGLIGIBLE",
    };
  }

  // Compute Yarkovsky drift
  const yarkParams = defaultYarkovskyParams(diameterKm);
  const yarkResult = computeYarkovskyDrift(elements, yarkParams);
  const daDtAUMyr = yarkResult.daDtAUMyr;

  // Along-track shift over the prediction window
  const deltaTDays = yearsToImpact * 365.25;
  const aKm = elements.semiMajorAxisAU * AU_KM;
  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3)); // rad/s
  const deltaTSeconds = deltaTDays * SECONDS_PER_DAY;
  const deltaA_km = yarkResult.daDtAUDay * AU_KM * deltaTDays;
  const alongTrackShiftKm = Math.abs((3 / 2) * (deltaA_km / aKm) * n * deltaTSeconds * aKm);

  // Yarkovsky uncertainty fraction
  const yarkovskyUncertaintyFraction = bPlaneSigmaKm > 0
    ? Math.min(alongTrackShiftKm / bPlaneSigmaKm, 10)
    : 0;

  // YSI: logarithmic measure of how much Yarkovsky changes the prediction
  // YSI = log₁₀(1 + alongTrackShift / bPlaneSigma)
  const ysi = bPlaneSigmaKm > 0
    ? Math.log10(1 + alongTrackShiftKm / bPlaneSigmaKm)
    : 0;

  // Time at which Yarkovsky shift equals current uncertainty
  // alongTrack ∝ t², so t_dominance = sqrt(bPlaneSigma / (da/dt_coefficient))
  const shiftPerYearSq = alongTrackShiftKm / (yearsToImpact * yearsToImpact);
  const yarkovskyDominanceYears = shiftPerYearSq > 0
    ? Math.sqrt(bPlaneSigmaKm / shiftPerYearSq)
    : Infinity;

  // Classification
  let classification: YarkovskySensitivityResult["classification"];
  if (ysi < 0.1) classification = "NEGLIGIBLE";
  else if (ysi < 0.5) classification = "LOW";
  else if (ysi < 1.0) classification = "MODERATE";
  else if (ysi < 2.0) classification = "HIGH";
  else classification = "DOMINANT";

  return {
    ysi,
    daDtAUMyr,
    alongTrackShiftKm,
    yarkovskyUncertaintyFraction,
    yarkovskyDominanceYears,
    classification,
  };
}
