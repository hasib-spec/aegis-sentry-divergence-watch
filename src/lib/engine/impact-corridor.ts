/**
 * AEGIS-SENTRY v3.0 — Impact Corridor Predictor
 * 
 * Computes the geographic ground track (corridor) on Earth's surface
 * where an asteroid impact could occur, given the b-plane uncertainty.
 * 
 * Reference: Chesley (2005), "Potential Impact Detection for Near-Earth Asteroids"
 *            CNEOS PDC Exercise methodology [[82]]
 * 
 * The impact corridor is the projection of the b-plane uncertainty ellipse
 * onto Earth's surface along the approach velocity vector.
 */

import { Vector3D } from "./types";
import { EARTH_RADIUS_KM, MU_EARTH, DEG_TO_RAD } from "./constants";

export interface ImpactCorridor {
  /** Center latitude of corridor (degrees) */
  centerLatDeg: number;
  /** Center longitude of corridor (degrees) */
  centerLonDeg: number;
  /** Corridor width at center (km) */
  widthKm: number;
  /** Corridor length (km) */
  lengthKm: number;
  /** Orientation angle from north (degrees) */
  orientationDeg: number;
  /** Entry velocity (km/s) */
  entryVelocityKmS: number;
  /** Entry angle from horizontal (degrees) */
  entryAngleDeg: number;
  /** Confidence: fraction of corridor within ±1σ */
  confidence1Sigma: number;
}

/**
 * Computes the impact corridor from b-plane parameters.
 * 
 * The b-plane is the plane perpendicular to the incoming asymptotic
 * velocity vector, passing through Earth's center. The uncertainty
 * ellipse on this plane maps to a corridor on Earth's surface.
 * 
 * @param bPlaneCenter - Center of uncertainty on b-plane (ξ, ζ) in km
 * @param bPlaneSigma - 1-sigma uncertainties (σξ, σζ) in km
 * @param vInfKmS - Hyperbolic excess velocity (km/s)
 * @param approachRA - Right ascension of approach direction (degrees)
 * @param approachDec - Declination of approach direction (degrees)
 */
export function computeImpactCorridor(
  bPlaneCenter: { xi: number; zeta: number },
  bPlaneSigma: { sigmaXi: number; sigmaZeta: number },
  vInfKmS: number,
  approachRA: number,
  approachDec: number
): ImpactCorridor {
  // Impact velocity including gravitational focusing
  const vEsc = Math.sqrt(2 * MU_EARTH / EARTH_RADIUS_KM);
  const vImpact = Math.sqrt(vInfKmS * vInfKmS + vEsc * vEsc);

  // Entry angle from horizontal
  const sinEntryAngle = Math.sqrt(1 - Math.pow(EARTH_RADIUS_KM * vInfKmS / (EARTH_RADIUS_KM * vImpact), 2));
  const entryAngleDeg = Math.asin(Math.min(sinEntryAngle, 1)) / DEG_TO_RAD;

  // Corridor width = 2σ projected onto surface
  // The projection factor depends on entry angle
  const projectionFactor = 1 / Math.max(Math.sin(entryAngleDeg * DEG_TO_RAD), 0.1);
  const widthKm = 2 * bPlaneSigma.sigmaXi * projectionFactor;
  const lengthKm = 2 * bPlaneSigma.sigmaZeta * projectionFactor;

  // Center point: project b-plane center to surface
  const raRad = approachRA * DEG_TO_RAD;
  const decRad = approachDec * DEG_TO_RAD;

  // Convert approach direction to lat/lon of sub-impact point
  const centerLatDeg = 90 - (decRad / DEG_TO_RAD);
  const centerLonDeg = raRad / DEG_TO_RAD - 180;

  // Orientation from the b-plane ellipse orientation
  const orientationDeg = Math.atan2(bPlaneCenter.zeta, bPlaneCenter.xi) / DEG_TO_RAD;

  return {
    centerLatDeg: ((centerLatDeg + 90) % 180) - 90,
    centerLonDeg: ((centerLonDeg + 180) % 360) - 180,
    widthKm,
    lengthKm,
    orientationDeg,
    entryVelocityKmS: vImpact,
    entryAngleDeg,
    confidence1Sigma: 0.6827, // ±1σ for Gaussian
  };
}

/**
 * Estimates b-plane parameters from orbital uncertainty.
 * Simplified model using along-track and cross-track uncertainties.
 */
export function estimateBPlaneFromUncertainty(
  alongTrackSigmaKm: number,
  crossTrackSigmaKm: number,
  vInfKmS: number
): { xi: number; zeta: number; sigmaXi: number; sigmaZeta: number } {
  // Simplified: b-plane coordinates approximate the cross-track plane
  const focusing = 1 + (2 * MU_EARTH) / (EARTH_RADIUS_KM * vInfKmS * vInfKmS);
  return {
    xi: 0,
    zeta: 0,
    sigmaXi: crossTrackSigmaKm * Math.sqrt(focusing),
    sigmaZeta: alongTrackSigmaKm * Math.sqrt(focusing),
  };
}
