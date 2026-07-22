/**
 * AEGIS-SENTRY v3.2 — Deflection Δv Calculator & Keyhole-Aware Mission Planner
 *
 * Computes the velocity change required to deflect a near-Earth asteroid
 * from an impact trajectory, checks whether the deflection is safe
 * (does not push the object into a gravitational keyhole), and
 * optimizes mission parameters.
 *
 * References:
 *   Ahrens & Harris (1992), "Deflection and fragmentation of NEAs"
 *   Carusi et al. (2002), "Deflecting NEOs in route of collision with Earth"
 *   Chesley (2004), "Potential impact detection for NEAs"
 *   Thomas et al. (2023), "DART: β = 3.61 ± 0.19 for Dimorphos"
 *   Paek et al. (2020), MIT — "Deflection by kinetic impact"
 *   Vavilov & Medvedev (2025), "Keyhole-aware deflection planning"
 *   Wie (2007), "Hypervelocity nuclear interceptors for NEO disruption"
 *   Melosh et al. (1994), "Deflecting asteroids by nuclear explosions"
 */

import { KeplerianElements, Vector3D } from "./types";
import { KeyholeParams } from "./keyhole";
import {
  AU_KM,
  MU_SUN,
  MU_EARTH,
  EARTH_RADIUS_KM,
  SECONDS_PER_DAY,
  DEG_TO_RAD,
  RAD_TO_DEG,
  G_NEWTON,
  DEFAULT_DENSITY_KG_M3,
} from "./constants";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: DEFLECTION METHOD PHYSICS
   ═══════════════════════════════════════════════════════════ */

export type DeflectionMethod = "KINETIC" | "GRAVITY_TRACTOR" | "NUCLEAR_STANDOFF";

export interface KineticImpactorParams {
  /** Spacecraft mass at impact (kg) */
  spacecraftMassKg: number;
  /** Spacecraft velocity relative to asteroid at impact (km/s) */
  impactVelocityKmS: number;
  /** Momentum enhancement factor β (DART measured 3.61 ± 0.19) */
  beta: number;
}

export interface GravityTractorParams {
  /** Spacecraft mass (kg) */
  spacecraftMassKg: number;
  /** Hover distance from asteroid center (km) */
  hoverDistanceKm: number;
  /** Duration of gravitational towing (years) */
  durationYears: number;
}

export interface NuclearStandoffParams {
  /** Device yield (Mt TNT) */
  yieldMt: number;
  /** Fraction of yield coupling to surface ablation (0.001–0.05) */
  couplingEfficiency: number;
  /** Surface ejecta velocity (km/s), typically 1–10 */
  ejectaVelocityKmS: number;
  /** Standoff distance (km) */
  standoffDistanceKm: number;
}

export interface AsteroidPhysicalParams {
  diameterKm: number;
  densityKgM3: number;
  massKg: number;
  rotationPeriodH: number;
}

export function computeAsteroidMass(
  diameterKm: number,
  densityKgM3: number = DEFAULT_DENSITY_KG_M3
): number {
  const radiusM = (diameterKm * 1000) / 2;
  const volumeM3 = (4 / 3) * Math.PI * Math.pow(radiusM, 3);
  return densityKgM3 * volumeM3;
}

/**
 * Kinetic Impactor Δv
 *
 * Δv = (m_sc × v_sc × β) / m_ast
 *
 * β accounts for ejecta momentum enhancement.
 * DART (2022): β = 3.61 ± 0.19 for Dimorphos (Thomas et al. 2023).
 * For rubble piles: β ≈ 2–5. For monolithic: β ≈ 1–2.
 */
export function computeKineticImpactorDeltaV(
  params: KineticImpactorParams,
  asteroidMassKg: number
): { deltaVKmS: number; momentumNs: number; betaEffective: number } {
  const { spacecraftMassKg, impactVelocityKmS, beta } = params;
  const vScMs = impactVelocityKmS * 1000;

  // Total momentum delivered (including ejecta enhancement)
  const momentumNs = spacecraftMassKg * vScMs * beta;

  // Δv imparted to asteroid
  const deltaVMs = momentumNs / asteroidMassKg;
  const deltaVKmS = deltaVMs / 1000;

  return { deltaVKmS, momentumNs, betaEffective: beta };
}

/**
 * Gravity Tractor Δv
 *
 * Continuous gravitational towing:
 *   a_gt = G × m_sc / d²
 *   Δv = a_gt × T
 *
 * The spacecraft hovers at distance d from the asteroid center,
 * using thrusters to maintain position. The mutual gravitational
 * attraction slowly pulls the asteroid off course.
 *
 * Reference: Lu & Love (2005), "Gravitational tractor for towing asteroids"
 */
export function computeGravityTractorDeltaV(
  params: GravityTractorParams,
  asteroidMassKg: number
): { deltaVKmS: number; accelerationMs2: number; thrustRequiredN: number } {
  const { spacecraftMassKg, hoverDistanceKm, durationYears } = params;
  const dM = hoverDistanceKm * 1000;
  const durationS = durationYears * 365.25 * SECONDS_PER_DAY;

  // Gravitational acceleration on asteroid toward spacecraft
  const accelerationMs2 = (G_NEWTON * spacecraftMassKg) / (dM * dM);

  // Accumulated Δv over duration
  const deltaVMs = accelerationMs2 * durationS;
  const deltaVKmS = deltaVMs / 1000;

  // Thrust required to maintain hover (must counteract asteroid gravity on SC)
  const thrustRequiredN = (G_NEWTON * spacecraftMassKg * asteroidMassKg) / (dM * dM);

  return { deltaVKmS, accelerationMs2, thrustRequiredN };
}

/**
 * Nuclear Standoff Δv
 *
 * A nuclear device detonated at standoff distance ablates the
 * asteroid surface, creating a rocket-like thrust from ejecta.
 *
 * Δv ≈ (2 × η × E_yield) / (m_ast × v_ejecta)
 *
 * η = coupling efficiency (fraction of X-ray/neutron energy deposited)
 * v_ejecta = characteristic ejecta velocity (~1-10 km/s)
 *
 * Reference: Melosh et al. (1994), Wie (2007)
 */
export function computeNuclearStandoffDeltaV(
  params: NuclearStandoffParams,
  asteroidMassKg: number
): { deltaVKmS: number; energyCoupledJ: number; ablatedMassKg: number } {
  const { yieldMt, couplingEfficiency, ejectaVelocityKmS } = params;

  // Total energy released (Joules)
  const energyJ = yieldMt * 4.184e15;

  // Energy coupled to asteroid surface
  const energyCoupledJ = energyJ * couplingEfficiency;

  // Ablated mass (from energy = 0.5 × m_ablated × v_ejecta²)
  const vEjectaMs = ejectaVelocityKmS * 1000;
  const ablatedMassKg = (2 * energyCoupledJ) / (vEjectaMs * vEjectaMs);

  // Momentum from ejecta: p = m_ablated × v_ejecta
  // Δv = p / m_ast
  const deltaVMs = (ablatedMassKg * vEjectaMs) / asteroidMassKg;
  const deltaVKmS = deltaVMs / 1000;

  return { deltaVKmS, energyCoupledJ, ablatedMassKg };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: MISS DISTANCE COMPUTATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Computes the miss distance achieved by a tangential Δv
 * applied T years before the close approach.
 *
 * From Carusi et al. (2002) and Ahrens & Harris (1992):
 *
 * For a tangential Δv at the asteroid's current position:
 *   Δa = (2a²/v_orb) × Δv_tangential
 *   Δn = -(3n/2a) × Δa
 *   Along-track drift at encounter: Δs = a × |Δn| × T
 *
 * Simplified:
 *   δ ≈ 3 × (a / v_orb) × Δv × T
 *
 * where T is in seconds, a in km, v_orb in km/s → δ in km.
 *
 * The geometry factor accounts for where in the orbit the push
 * is applied (perihelion is optimal for tangential pushes).
 */
export function computeMissDistance(
  deltaVKmS: number,
  semiMajorAxisAU: number,
  warningTimeYears: number,
  pushGeometry: "TANGENTIAL" | "RADIAL" | "NORMAL" | "OPTIMAL" = "OPTIMAL"
): { missDistanceKm: number; missDistanceLD: number; missDistanceEarthRadii: number } {
  const aKm = semiMajorAxisAU * AU_KM;
  const vOrbKmS = Math.sqrt(MU_SUN / aKm); // Circular approximation
  const TSeconds = warningTimeYears * 365.25 * SECONDS_PER_DAY;

  // Geometry efficiency factor
  // Tangential at perihelion is most efficient for changing encounter timing
  let geometryFactor: number;
  switch (pushGeometry) {
    case "TANGENTIAL": geometryFactor = 1.0; break;
    case "RADIAL": geometryFactor = 0.3; break;
    case "NORMAL": geometryFactor = 0.15; break;
    case "OPTIMAL": geometryFactor = 1.0; break; // Assumes optimal application
  }

  // Miss distance: δ = 3 × (a/v) × Δv × T × geometry
  const missDistanceKm = 3 * (aKm / vOrbKmS) * deltaVKmS * TSeconds * geometryFactor;

  return {
    missDistanceKm,
    missDistanceLD: missDistanceKm / 384400,
    missDistanceEarthRadii: missDistanceKm / EARTH_RADIUS_KM,
  };
}

/**
 * Computes the Δv required to achieve a specified miss distance.
 *
 * Inverse of computeMissDistance:
 *   Δv_required = δ_target / (3 × (a/v) × T × geometry)
 */
export function computeRequiredDeltaV(
  targetMissKm: number,
  semiMajorAxisAU: number,
  warningTimeYears: number,
  pushGeometry: "TANGENTIAL" | "RADIAL" | "NORMAL" | "OPTIMAL" = "OPTIMAL"
): number {
  const aKm = semiMajorAxisAU * AU_KM;
  const vOrbKmS = Math.sqrt(MU_SUN / aKm);
  const TSeconds = warningTimeYears * 365.25 * SECONDS_PER_DAY;

  let geometryFactor: number;
  switch (pushGeometry) {
    case "TANGENTIAL": geometryFactor = 1.0; break;
    case "RADIAL": geometryFactor = 0.3; break;
    case "NORMAL": geometryFactor = 0.15; break;
    case "OPTIMAL": geometryFactor = 1.0; break;
  }

  const denominator = 3 * (aKm / vOrbKmS) * TSeconds * geometryFactor;
  if (denominator <= 0) return Infinity;

  return targetMissKm / denominator;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: MISSION PARAMETER SOLVER
   ═══════════════════════════════════════════════════════════ */

export interface MissionSolution {
  method: DeflectionMethod;
  deltaVAchievedKmS: number;
  deltaVRequiredKmS: number;
  missDistanceKm: number;
  missDistanceLD: number;
  missDistanceEarthRadii: number;
  isSufficient: boolean;
  marginEarthRadii: number;
  warningTimeYears: number;
  spacecraftMassKg: number;
  launchLeadTimeYears: number;
  transitTimeYears: number;
  totalMissionYears: number;
}

/**
 * Solves the complete deflection mission for a kinetic impactor.
 * Determines if the given spacecraft can achieve safe miss distance.
 */
export function solveKineticMission(
  asteroidDiameterKm: number,
  semiMajorAxisAU: number,
  warningTimeYears: number,
  scParams: KineticImpactorParams,
  densityKgM3: number = DEFAULT_DENSITY_KG_M3,
  safeMissEarthRadii: number = 2
): MissionSolution {
  const asteroidMassKg = computeAsteroidMass(asteroidDiameterKm, densityKgM3);
  const { deltaVKmS } = computeKineticImpactorDeltaV(scParams, asteroidMassKg);
  const miss = computeMissDistance(deltaVKmS, semiMajorAxisAU, warningTimeYears, "OPTIMAL");
  const deltaVRequired = computeRequiredDeltaV(
    safeMissEarthRadii * EARTH_RADIUS_KM,
    semiMajorAxisAU,
    warningTimeYears,
    "OPTIMAL"
  );

  // Transit time estimate (Hohmann-like, simplified)
  const transitTimeYears = Math.min(warningTimeYears * 0.3, 3);
  const launchLeadTimeYears = warningTimeYears - transitTimeYears;

  return {
    method: "KINETIC",
    deltaVAchievedKmS: deltaVKmS,
    deltaVRequiredKmS: deltaVRequired,
    missDistanceKm: miss.missDistanceKm,
    missDistanceLD: miss.missDistanceLD,
    missDistanceEarthRadii: miss.missDistanceEarthRadii,
    isSufficient: miss.missDistanceKm >= safeMissEarthRadii * EARTH_RADIUS_KM,
    marginEarthRadii: miss.missDistanceEarthRadii - safeMissEarthRadii,
    warningTimeYears,
    spacecraftMassKg: scParams.spacecraftMassKg,
    launchLeadTimeYears: Math.max(0, launchLeadTimeYears),
    transitTimeYears,
    totalMissionYears: warningTimeYears,
  };
}

/**
 * Solves the complete deflection mission for a gravity tractor.
 */
export function solveGravityTractorMission(
  asteroidDiameterKm: number,
  semiMajorAxisAU: number,
  warningTimeYears: number,
  gtParams: GravityTractorParams,
  densityKgM3: number = DEFAULT_DENSITY_KG_M3,
  safeMissEarthRadii: number = 2
): MissionSolution {
  const asteroidMassKg = computeAsteroidMass(asteroidDiameterKm, densityKgM3);
  const { deltaVKmS } = computeGravityTractorDeltaV(gtParams, asteroidMassKg);
  const miss = computeMissDistance(deltaVKmS, semiMajorAxisAU, warningTimeYears, "TANGENTIAL");
  const deltaVRequired = computeRequiredDeltaV(
    safeMissEarthRadii * EARTH_RADIUS_KM,
    semiMajorAxisAU,
    warningTimeYears,
    "TANGENTIAL"
  );

  const transitTimeYears = Math.min(warningTimeYears * 0.2, 2);

  return {
    method: "GRAVITY_TRACTOR",
    deltaVAchievedKmS: deltaVKmS,
    deltaVRequiredKmS: deltaVRequired,
    missDistanceKm: miss.missDistanceKm,
    missDistanceLD: miss.missDistanceLD,
    missDistanceEarthRadii: miss.missDistanceEarthRadii,
    isSufficient: miss.missDistanceKm >= safeMissEarthRadii * EARTH_RADIUS_KM,
    marginEarthRadii: miss.missDistanceEarthRadii - safeMissEarthRadii,
    warningTimeYears,
    spacecraftMassKg: gtParams.spacecraftMassKg,
    launchLeadTimeYears: Math.max(0, warningTimeYears - gtParams.durationYears - transitTimeYears),
    transitTimeYears,
    totalMissionYears: gtParams.durationYears + transitTimeYears,
  };
}

/**
 * Solves the complete deflection mission for nuclear standoff.
 */
export function solveNuclearMission(
  asteroidDiameterKm: number,
  semiMajorAxisAU: number,
  warningTimeYears: number,
  nucParams: NuclearStandoffParams,
  densityKgM3: number = DEFAULT_DENSITY_KG_M3,
  safeMissEarthRadii: number = 2
): MissionSolution {
  const asteroidMassKg = computeAsteroidMass(asteroidDiameterKm, densityKgM3);
  const { deltaVKmS } = computeNuclearStandoffDeltaV(nucParams, asteroidMassKg);
  const miss = computeMissDistance(deltaVKmS, semiMajorAxisAU, warningTimeYears, "OPTIMAL");
  const deltaVRequired = computeRequiredDeltaV(
    safeMissEarthRadii * EARTH_RADIUS_KM,
    semiMajorAxisAU,
    warningTimeYears,
    "OPTIMAL"
  );

  const transitTimeYears = Math.min(warningTimeYears * 0.15, 1.5);

  return {
    method: "NUCLEAR_STANDOFF",
    deltaVAchievedKmS: deltaVKmS,
    deltaVRequiredKmS: deltaVRequired,
    missDistanceKm: miss.missDistanceKm,
    missDistanceLD: miss.missDistanceLD,
    missDistanceEarthRadii: miss.missDistanceEarthRadii,
    isSufficient: miss.missDistanceKm >= safeMissEarthRadii * EARTH_RADIUS_KM,
    marginEarthRadii: miss.missDistanceEarthRadii - safeMissEarthRadii,
    warningTimeYears,
    spacecraftMassKg: 0, // Nuclear device mass not specified
    launchLeadTimeYears: Math.max(0, warningTimeYears - transitTimeYears),
    transitTimeYears,
    totalMissionYears: warningTimeYears,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: KEYHOLE-AWARE DEFLCTION SAFETY CHECK
   ═══════════════════════════════════════════════════════════ */

export interface KeyholeSafetyResult {
  isSafe: boolean;
  dangerKeyholes: Array<{
    resonance: string;
    earthOrbits: number;
    asteroidOrbits: number;
    xiKm: number;
    widthKm: number;
    sigmaOverlap: number;
  }>;
  safeDeflectionRangeKm: { min: number; max: number };
  recommendedMissKm: number;
  warning: string;
}

/**
 * Checks whether a proposed deflection pushes the asteroid
 * into a gravitational keyhole.
 *
 * After deflection, the asteroid's b-plane coordinate shifts by:
 *   Δξ ≈ δ × cos(θ)  (component along b-plane ξ-axis)
 *
 * If the new ξ falls within any keyhole's [ξ_k - w/2, ξ_k + w/2],
 * the deflection is DANGEROUS — it creates a future resonant return.
 *
 * Reference: Vavilov & Medvedev (2025), Carusi et al. (2002)
 */
export function checkDeflectionKeyholeSafety(
  missDistanceKm: number,
  deflectionAngleDeg: number,
  keyholes: KeyholeParams[],
  originalMissKm: number
): KeyholeSafetyResult {
  const dangerKeyholes: KeyholeSafetyResult["dangerKeyholes"] = [];

  // The deflection shifts the b-plane crossing point
  // ξ_new = ξ_original + Δξ, where Δξ = miss × cos(angle)
  const angleRad = deflectionAngleDeg * DEG_TO_RAD;
  const deltaXi = missDistanceKm * Math.cos(angleRad);
  const newXi = deltaXi; // Original nominal is at ξ=0 (centered on Earth)

  for (const kh of keyholes) {
    const khMin = kh.xiCenterKm - kh.widthKm / 2;
    const khMax = kh.xiCenterKm + kh.widthKm / 2;

    // Check if new trajectory falls within keyhole
    // Add uncertainty margin (1σ ≈ 10% of miss distance for planning)
    const uncertaintyMargin = Math.max(missDistanceKm * 0.1, 50);

    if (newXi + uncertaintyMargin > khMin && newXi - uncertaintyMargin < khMax) {
      const sigmaOverlap = Math.abs(newXi - kh.xiCenterKm) / Math.max(kh.widthKm, 0.1);
      dangerKeyholes.push({
        resonance: `${kh.earthOrbits}:${kh.asteroidOrbits}`,
        earthOrbits: kh.earthOrbits,
        asteroidOrbits: kh.asteroidOrbits,
        xiKm: kh.xiCenterKm,
        widthKm: kh.widthKm,
        sigmaOverlap,
      });
    }
  }

  // Compute safe deflection range (ξ values that avoid all keyholes)
  let safeMin = -Infinity;
  let safeMax = Infinity;

  // Sort keyholes by ξ position
  const sortedKH = [...keyholes].sort((a, b) => a.xiCenterKm - b.xiCenterKm);

  // Find the gap closest to required miss that avoids all keyholes
  let recommendedMissKm = missDistanceKm;
  if (dangerKeyholes.length > 0) {
    // Find nearest safe ξ that's beyond the required miss
    const requiredXi = missDistanceKm;
    let bestSafeXi = requiredXi;

    // Check gaps between keyholes
    for (let i = 0; i < sortedKH.length; i++) {
      const khRight = sortedKH[i].xiCenterKm + sortedKH[i].widthKm / 2 + 100; // 100km safety margin
      if (khRight > requiredXi) {
        // Check if this gap is safe (not inside next keyhole)
        const nextKhLeft = i < sortedKH.length - 1
          ? sortedKH[i + 1].xiCenterKm - sortedKH[i + 1].widthKm / 2 - 100
          : Infinity;
        if (khRight < nextKhLeft) {
          bestSafeXi = khRight;
          break;
        }
      }
    }

    recommendedMissKm = Math.max(bestSafeXi, requiredXi);
    safeMin = recommendedMissKm - 50;
    safeMax = recommendedMissKm + 500;
  }

  const isSafe = dangerKeyholes.length === 0;
  let warning = "";
  if (!isSafe) {
    const worst = dangerKeyholes[0];
    warning = `DEFLCTION INTO ${worst.resonance} KEYHOLE — asteroid would return for impact after ${worst.earthOrbits} Earth orbits. Increase miss to ${recommendedMissKm.toFixed(0)} km or change deflection angle.`;
  }

  return {
    isSafe,
    dangerKeyholes,
    safeDeflectionRangeKm: { min: safeMin, max: safeMax },
    recommendedMissKm,
    warning,
  };
}

/**
 * Computes the safe deflection cone — the range of deflection
 * angles that achieve the required miss WITHOUT hitting any keyhole.
 *
 * This is the constrained optimization:
 *   maximize: miss distance
 *   subject to: miss > required AND ξ_new ∉ any keyhole
 *
 * Returns the angular range [θ_min, θ_max] for safe deflection.
 */
export function computeSafeDeflectionCone(
  requiredMissKm: number,
  keyholes: KeyholeParams[],
  vInfKmS: number
): {
  safeAngleRangeDeg: { min: number; max: number };
  optimalAngleDeg: number;
  coneWidthDeg: number;
  hasSafeSolution: boolean;
} {
  // The deflection angle determines the ξ-component of the miss:
  // ξ = miss × cos(θ)
  // For the miss to avoid keyholes, ξ must not fall in any [ξ_k ± w/2]

  // Compute forbidden ξ ranges
  const forbiddenRanges: Array<{ min: number; max: number }> = keyholes.map((kh) => ({
    min: kh.xiCenterKm - kh.widthKm / 2 - 100, // 100km safety margin
    max: kh.xiCenterKm + kh.widthKm / 2 + 100,
  }));

  // For a given miss distance M and angle θ:
  // ξ = M × cos(θ)
  // We need ξ ∉ forbidden ranges AND M ≥ requiredMiss

  // Find angles where ξ falls in forbidden ranges
  const forbiddenAngles: Array<{ min: number; max: number }> = [];
  for (const range of forbiddenRanges) {
    // cos(θ) = ξ/M → θ = acos(ξ/M)
    // For ξ in [range.min, range.max] and M = requiredMiss:
    const cosMin = range.min / requiredMissKm;
    const cosMax = range.max / requiredMissKm;

    if (Math.abs(cosMin) <= 1 || Math.abs(cosMax) <= 1) {
      const clampedMin = Math.max(-1, Math.min(1, cosMin));
      const clampedMax = Math.max(-1, Math.min(1, cosMax));
      const angleMin = Math.acos(clampedMax) * RAD_TO_DEG;
      const angleMax = Math.acos(clampedMin) * RAD_TO_DEG;
      forbiddenAngles.push({ min: angleMin, max: angleMax });
    }
  }

  // Find the widest safe angular range
  // Default: full 360° is safe if no forbidden angles
  let safeMin = 0;
  let safeMax = 360;
  let optimalAngle = 0; // Pure tangential (maximum ξ shift)

  if (forbiddenAngles.length > 0) {
    // Sort forbidden ranges
    forbiddenAngles.sort((a, b) => a.min - b.min);

    // Find largest gap
    let bestGapStart = 0;
    let bestGapSize = forbiddenAngles[0].min;

    for (let i = 0; i < forbiddenAngles.length - 1; i++) {
      const gapStart = forbiddenAngles[i].max;
      const gapEnd = forbiddenAngles[i + 1].min;
      const gapSize = gapEnd - gapStart;
      if (gapSize > bestGapSize) {
        bestGapSize = gapSize;
        bestGapStart = gapStart;
      }
    }

    // Check last gap (wrapping around)
    const lastGap = 360 - forbiddenAngles[forbiddenAngles.length - 1].max + forbiddenAngles[0].min;
    if (lastGap > bestGapSize) {
      bestGapSize = lastGap;
      bestGapStart = forbiddenAngles[forbiddenAngles.length - 1].max;
    }

    safeMin = bestGapStart;
    safeMax = bestGapStart + bestGapSize;
    optimalAngle = bestGapStart + bestGapSize / 2;
  }

  return {
    safeAngleRangeDeg: { min: safeMin, max: safeMax },
    optimalAngleDeg: optimalAngle,
    coneWidthDeg: safeMax - safeMin,
    hasSafeSolution: safeMax - safeMin > 5, // At least 5° of safe cone
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: COMPLETE DEFLCTION ANALYSIS
   ═══════════════════════════════════════════════════════════ */

export interface DeflectionAnalysisInput {
  designation: string;
  diameterKm: number;
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationRad: number;
  vInfKmS: number;
  warningTimeYears: number;
  method: DeflectionMethod;
  kinetic?: KineticImpactorParams;
  gravityTractor?: GravityTractorParams;
  nuclear?: NuclearStandoffParams;
  keyholes: KeyholeParams[];
  densityKgM3?: number;
  safeMissEarthRadii?: number;
}

export interface DeflectionAnalysisResult {
  designation: string;
  method: DeflectionMethod;
  mission: MissionSolution;
  keyholeSafety: KeyholeSafetyResult;
  safeCone: ReturnType<typeof computeSafeDeflectionCone>;
  asteroid: {
    diameterKm: number;
    massKg: number;
    massTons: number;
    densityKgM3: number;
  };
  comparison: {
    chelyabinskEquivalent: number;
    tunguskaEquivalent: number;
    hiroshimaEquivalent: number;
  };
  recommendation: string;
  timestamp: string;
}

/**
 * Runs the complete deflection analysis pipeline:
 * 1. Compute Δv from chosen method
 * 2. Compute miss distance achieved
 * 3. Check keyhole safety
 * 4. Compute safe deflection cone
 * 5. Generate recommendation
 */
export function runDeflectionAnalysis(input: DeflectionAnalysisInput): DeflectionAnalysisResult {
  const density = input.densityKgM3 ?? DEFAULT_DENSITY_KG_M3;
  const safeMiss = input.safeMissEarthRadii ?? 2;
  const asteroidMassKg = computeAsteroidMass(input.diameterKm, density);

  // 1. Solve mission based on method
  let mission: MissionSolution;
  switch (input.method) {
    case "KINETIC":
      mission = solveKineticMission(
        input.diameterKm, input.semiMajorAxisAU, input.warningTimeYears,
        input.kinetic ?? { spacecraftMassKg: 500, impactVelocityKmS: 10, beta: 3.6 },
        density, safeMiss
      );
      break;
    case "GRAVITY_TRACTOR":
      mission = solveGravityTractorMission(
        input.diameterKm, input.semiMajorAxisAU, input.warningTimeYears,
        input.gravityTractor ?? { spacecraftMassKg: 10000, hoverDistanceKm: input.diameterKm * 2, durationYears: input.warningTimeYears * 0.7 },
        density, safeMiss
      );
      break;
    case "NUCLEAR_STANDOFF":
      mission = solveNuclearMission(
        input.diameterKm, input.semiMajorAxisAU, input.warningTimeYears,
        input.nuclear ?? { yieldMt: 1, couplingEfficiency: 0.01, ejectaVelocityKmS: 3, standoffDistanceKm: input.diameterKm * 3 },
        density, safeMiss
      );
      break;
  }

  // 2. Check keyhole safety
  const keyholeSafety = checkDeflectionKeyholeSafety(
    mission.missDistanceKm,
    0, // Default: pure tangential (maximum ξ shift)
    input.keyholes,
    0
  );

  // 3. Compute safe deflection cone
  const requiredMissKm = safeMiss * EARTH_RADIUS_KM;
  const safeCone = computeSafeDeflectionCone(requiredMissKm, input.keyholes, input.vInfKmS);

  // 4. Energy comparisons
  const energyMt = 0.5 * asteroidMassKg * Math.pow(input.vInfKmS * 1000, 2) / 4.184e15;
  const comparison = {
    chelyabinskEquivalent: energyMt / 0.5, // Chelyabinsk ≈ 500 kt = 0.5 Mt
    tunguskaEquivalent: energyMt / 15, // Tunguska ≈ 15 Mt
    hiroshimaEquivalent: energyMt / 0.015, // Hiroshima ≈ 15 kt = 0.015 Mt
  };

  // 5. Generate recommendation
  let recommendation: string;
  if (!mission.isSufficient) {
    const factorNeeded = mission.deltaVRequiredKmS / Math.max(mission.deltaVAchievedKmS, 1e-15);
    recommendation = `INSUFFICIENT DEFLECTION. Need ${factorNeeded.toFixed(1)}× more Δv. ` +
      `Options: increase spacecraft mass to ${(mission.spacecraftMassKg * factorNeeded).toFixed(0)} kg, ` +
      `increase warning time, or use nuclear standoff.`;
  } else if (!keyholeSafety.isSafe) {
    recommendation = `DEFLECTION ACHIEVES MISS BUT HITS KEYHOLE. ${keyholeSafety.warning} ` +
      `Safe deflection cone: ${safeCone.safeAngleRangeDeg.min.toFixed(1)}°–${safeCone.safeAngleRangeDeg.max.toFixed(1)}°. ` +
      `Recommended miss: ${keyholeSafety.recommendedMissKm.toFixed(0)} km at angle ${safeCone.optimalAngleDeg.toFixed(1)}°.`;
  } else {
    recommendation = `DEFLECTION SUCCESSFUL. Miss distance: ${mission.missDistanceEarthRadii.toFixed(1)} R⊕ ` +
      `(${mission.missDistanceKm.toFixed(0)} km). Margin: ${mission.marginEarthRadii.toFixed(1)} R⊕ beyond safe threshold. ` +
      `No keyhole conflicts detected. Mission viable with ${input.warningTimeYears.toFixed(1)} yr warning.`;
  }

  return {
    designation: input.designation,
    method: input.method,
    mission,
    keyholeSafety,
    safeCone,
    asteroid: {
      diameterKm: input.diameterKm,
      massKg: asteroidMassKg,
      massTons: asteroidMassKg / 1000,
      densityKgM3: density,
    },
    comparison,
    recommendation,
    timestamp: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6: UTILITY — MINIMUM WARNING TIME
   ═══════════════════════════════════════════════════════════ */

/**
 * Computes the minimum warning time needed for a given
 * spacecraft to achieve safe deflection.
 *
 * From δ = 3(a/v)ΔvT, solving for T:
 *   T_min = δ_required / (3 × (a/v) × Δv)
 */
export function computeMinimumWarningTime(
  deltaVKmS: number,
  semiMajorAxisAU: number,
  safeMissEarthRadii: number = 2
): number {
  const aKm = semiMajorAxisAU * AU_KM;
  const vOrbKmS = Math.sqrt(MU_SUN / aKm);
  const requiredMissKm = safeMissEarthRadii * EARTH_RADIUS_KM;

  const denominator = 3 * (aKm / vOrbKmS) * deltaVKmS;
  if (denominator <= 0) return Infinity;

  const TSeconds = requiredMissKm / denominator;
  return TSeconds / (365.25 * SECONDS_PER_DAY); // Convert to years
}

/**
 * Computes the minimum spacecraft mass for kinetic impactor
 * to achieve required Δv within given warning time.
 *
 * From Δv = (m_sc × v_sc × β) / m_ast:
 *   m_sc = Δv_required × m_ast / (v_sc × β)
 */
export function computeMinimumSpacecraftMass(
  deltaVRequiredKmS: number,
  asteroidMassKg: number,
  impactVelocityKmS: number,
  beta: number
): number {
  const vScMs = impactVelocityKmS * 1000;
  const deltaVMs = deltaVRequiredKmS * 1000;
  return (deltaVMs * asteroidMassKg) / (vScMs * beta);
}