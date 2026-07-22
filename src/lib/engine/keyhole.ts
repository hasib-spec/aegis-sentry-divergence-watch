/**
 * AEGIS-SENTRY v3.0 — Gravitational Keyhole Proximity Detector
 * 
 * A gravitational keyhole is a tiny region in the b-plane where,
 * if an asteroid passes through during a close approach, Earth's
 * gravity modifies its orbit to produce a future impact.
 * 
 * Reference: Chodas (2015), "Asteroid Impacts and Orbits"
 *            Paek et al. (2020) MIT — "How to deflect an asteroid" [[109]]
 *            Vavilov & Medvedev (2025) — keyhole-based deflection [[105]]
 * 
 * For Apophis: the 2036 keyhole is ~600m wide in the 2029 b-plane [[66]].
 */

import { MU_EARTH, EARTH_RADIUS_KM, AU_KM } from "./constants";

export interface KeyholeParams {
  /** Resonant return period (years) e.g., 7 for 7:6 resonance */
  resonanceYears: number;
  /** Keyhole center on b-plane (ξ coordinate, km) */
  xiCenterKm: number;
  /** Keyhole width (km) */
  widthKm: number;
  /** Required number of Earth orbits for return */
  earthOrbits: number;
  /** Required number of asteroid orbits for return */
  asteroidOrbits: number;
}

export interface KeyholeProximityResult {
  /** Distance from uncertainty center to nearest keyhole (km) */
  distanceToKeyholeKm: number;
  /** Number of keyhole widths the uncertainty center is from keyhole */
  sigmaFromKeyhole: number;
  /** Probability of passing through keyhole (approximate) */
  keyholePassageProbability: number;
  /** Whether the object is within 3σ of any keyhole */
  isAlert: boolean;
  /** Resonance info for the nearest keyhole */
  nearestKeyhole: KeyholeParams | null;
}

/**
 * Computes gravitational keyhole positions for a given close approach.
 * 
 * A keyhole exists at b-plane coordinate ξ where the gravitational
 * deflection produces a resonant return after N Earth orbits.
 * 
 * The keyhole position is approximately:
 *   ξ_k = R⊕ × √(1 + 2μ/(R⊕·v∞²)) × sin(α_k)
 * 
 * where α_k is the deflection angle for the k-th resonance.
 * 
 * @param vInfKmS - Hyperbolic excess velocity (km/s)
 * @param missDistanceKm - Nominal miss distance (km)
 * @param periodYears - Asteroid orbital period (years)
 * @param maxResonanceYears - Maximum resonance period to search (years)
 */
export function computeKeyholes(
  vInfKmS: number,
  missDistanceKm: number,
  periodYears: number,
  maxResonanceYears: number = 100
): KeyholeParams[] {
  const keyholes: KeyholeParams[] = [];
  const vEsc = Math.sqrt(2 * MU_EARTH / EARTH_RADIUS_KM);
  const focusing = 1 + (vEsc * vEsc) / (vInfKmS * vInfKmS);

  // Search for resonant returns: p Earth orbits = q asteroid orbits
  for (let p = 1; p <= Math.floor(maxResonanceYears / periodYears) + 1; p++) {
    for (let q = 1; q <= p + 2; q++) {
      const resonanceYears = p; // Earth orbits
      const asteroidPeriodResonant = p / q; // Required asteroid period (years)

      // Semi-major axis for resonant period (Kepler's 3rd law)
      const aResonant = Math.pow(asteroidPeriodResonant * asteroidPeriodResonant, 1 / 3); // AU
      const aResonantKm = aResonant * AU_KM;

      // Required velocity change for resonance
      const vCirc = Math.sqrt(MU_EARTH / EARTH_RADIUS_KM);
      const deltaV = Math.abs(vCirc - vInfKmS) * 0.01; // Simplified

      // Keyhole position on b-plane
      const deflectionAngle = 2 * Math.asin(1 / (1 + (missDistanceKm / EARTH_RADIUS_KM) * (vInfKmS * vInfKmS) / (MU_EARTH / EARTH_RADIUS_KM)));
      const xiCenter = EARTH_RADIUS_KM * Math.sqrt(focusing) * Math.sin(deflectionAngle * q / p);

      // Keyhole width (scales inversely with approach velocity and resonance order)
      const widthKm = Math.max(
        0.1,
        (EARTH_RADIUS_KM * 0.001) / (p * vInfKmS)
      );

      if (Math.abs(xiCenter) < EARTH_RADIUS_KM * Math.sqrt(focusing) * 2) {
        keyholes.push({
          resonanceYears,
          xiCenterKm: xiCenter,
          widthKm,
          earthOrbits: p,
          asteroidOrbits: q,
        });
      }
    }
  }

  return keyholes;
}

/**
 * Computes proximity of an asteroid's uncertainty ellipse to gravitational keyholes.
 * 
 * @param bPlaneXi - B-plane ξ coordinate of uncertainty center (km)
 * @param bPlaneSigmaXi - 1-sigma uncertainty in ξ (km)
 * @param keyholes - Array of computed keyholes
 */
export function computeKeyholeProximity(
  bPlaneXi: number,
  bPlaneSigmaXi: number,
  keyholes: KeyholeParams[]
): KeyholeProximityResult {
  if (keyholes.length === 0) {
    return {
      distanceToKeyholeKm: Infinity,
      sigmaFromKeyhole: Infinity,
      keyholePassageProbability: 0,
      isAlert: false,
      nearestKeyhole: null,
    };
  }

  let nearestDist = Infinity;
  let nearestKeyhole: KeyholeParams | null = null;

  for (const kh of keyholes) {
    const dist = Math.abs(bPlaneXi - kh.xiCenterKm);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestKeyhole = kh;
    }
  }

  const sigmaFromKeyhole = bPlaneSigmaXi > 0 ? nearestDist / bPlaneSigmaXi : Infinity;

  // Approximate probability of passing through keyhole
  // P ≈ (keyhole_width / (σ√(2π))) × exp(-d²/(2σ²))
  let keyholePassageProbability = 0;
  if (nearestKeyhole && bPlaneSigmaXi > 0) {
    const exponent = -(nearestDist * nearestDist) / (2 * bPlaneSigmaXi * bPlaneSigmaXi);
    keyholePassageProbability =
      (nearestKeyhole.widthKm / (bPlaneSigmaXi * Math.sqrt(2 * Math.PI))) *
      Math.exp(exponent);
  }

  return {
    distanceToKeyholeKm: nearestDist,
    sigmaFromKeyhole,
    keyholePassageProbability,
    isAlert: sigmaFromKeyhole < 3,
    nearestKeyhole,
  };
}
