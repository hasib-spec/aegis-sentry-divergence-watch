/**
 * AEGIS-SENTRY v3.3 — Observation Arc Quality & Ephemeris Uncertainty Engine
 *
 * Tracks the observational history of each NEO and models how
 * positional uncertainty grows over time. Determines when an object
 * will be "lost" (uncertainty exceeds recovery survey capability).
 *
 * Key physics:
 *   - Short arcs (< 30d): σ(t) ∝ t² (quadratic growth — catastrophic)
 *   - Long arcs (> 1yr):  σ(t) ∝ t^0.5 (diffusive — manageable)
 *   - Yarkovsky adds systematic drift: Δs_yark ∝ t² (always growing)
 *
 * The MPC Uncertainty Parameter U (0–9):
 *   U = 0: σ < 0.01″ (decades of data)
 *   U = 9: σ > 10⁶″ (single-night detection)
 *
 * References:
 *   Bowell et al. (2002), "Application of photometric models to asteroids"
 *   Chesley (2005), "Potential Impact Detection for NEAs"
 *   Farnocchia et al. (2015), "Asteroid orbit determination with short arcs"
 *   NASA OIG IG-25-006: "73% of NEOs have short arcs and large uncertainties"
 */

import { AU_KM, MU_SUN, SECONDS_PER_DAY, EARTH_RADIUS_KM } from "./constants";
import { KeplerianElements } from "./types";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: ARC QUALITY CLASSIFICATION
   ═══════════════════════════════════════════════════════════ */

export type ArcQuality =
  | "EXCELLENT"   // > 10 years — decadal baseline
  | "GOOD"        // 1–10 years — multi-apparition
  | "MODERATE"    // 30–365 days — single apparition, good coverage
  | "POOR"        // 7–30 days — partial arc
  | "CRITICAL"    // 1–7 days — very short arc
  | "EPHEMERAL";  // < 1 day — single-night detection

export interface ObservationArcData {
  designation: string;
  firstObsJD: number;
  lastObsJD: number;
  arcLengthDays: number;
  arcQuality: ArcQuality;
  uncertaintyParameterU: number;
  currentSigmaArcsec: number;
  currentSigmaKm: number;
  numObservations: number;
  daysSinceLastObs: number;
  isStale: boolean;
}

export interface UncertaintyProjection {
  /** Days from now */
  daysFromNow: number;
  /** 1-sigma positional uncertainty (arcseconds) */
  sigmaArcsec: number;
  /** 1-sigma positional uncertainty (km at 1 AU) */
  sigmaKm: number;
  /** Yarkovsky systematic drift component (km) */
  yarkovskyDriftKm: number;
  /** Total uncertainty including Yarkovsky (km) */
  totalSigmaKm: number;
  /** Is the object recoverable at this epoch? */
  isRecoverable: boolean;
}

export interface ArcAnalysisResult {
  arc: ObservationArcData;
  projection: UncertaintyProjection[];
  lossDateJD: number;
  lossDateYearsFromNow: number;
  isLost: boolean;
  yarkovskyDominanceYears: number;
  recommendation: string;
  urgency: "ROUTINE" | "SOON" | "URGENT" | "CRITICAL";
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: ARC QUALITY FROM SENTRY DATA
   ═══════════════════════════════════════════════════════════ */

/**
 * Estimates observation arc parameters from NASA Sentry record fields.
 *
 * Sentry provides: last_obs (date string), last_obs_jd (JD number).
 * We estimate first_obs from the orbit epoch and typical arc coverage.
 *
 * @param lastObsJD - Julian Date of last observation
 * @param orbitEpochJD - Epoch of orbital elements
 * @param elementSigmas - 1-sigma uncertainties of orbital elements [a,e,i,Ω,ω,M]
 * @param nowJD - Current Julian Date
 */
export function estimateObservationArc(
  designation: string,
  lastObsJD: number,
  orbitEpochJD: number,
  elementSigmas: number[],
  nowJD: number
): ObservationArcData {
  // Estimate arc length from element uncertainties
  // The along-track sigma (from M sigma) is the best indicator of arc quality
  const mSigmaRad = elementSigmas.length > 5 ? elementSigmas[5] : 0.1;
  const aSigmaAU = elementSigmas.length > 0 ? elementSigmas[0] : 0.01;

  // Convert mean anomaly sigma to along-track uncertainty (km)
  // σ_along ≈ a × σ_M (for small σ_M)
  const aKm = (elementSigmas.length > 0 ? 1.5 : 1.5) * AU_KM; // Approximate
  const sigmaAlongKm = aKm * Math.abs(mSigmaRad);

  // Estimate arc length from uncertainty
  // Empirical: σ_M ≈ k / arc_length^α where α ≈ 1.5 for good arcs
  // Inverting: arc_length ≈ (k / σ_M)^(1/α)
  // k ≈ 0.1 rad·day^1.5 (calibrated from typical NEO observations)
  const k = 0.1;
  const alpha = 1.5;
  let estimatedArcDays: number;
  if (Math.abs(mSigmaRad) > 1e-10) {
    estimatedArcDays = Math.pow(k / Math.abs(mSigmaRad), 1 / alpha);
  } else {
    estimatedArcDays = 3650; // Very well determined
  }
  estimatedArcDays = Math.max(0.5, Math.min(estimatedArcDays, 36500));

  const firstObsJD = lastObsJD - estimatedArcDays;
  const daysSinceLastObs = Math.max(0, nowJD - lastObsJD);

  // MPC Uncertainty Parameter U
  // U ≈ 9 - 2×log10(arc_days) for typical NEO observations
  // Calibrated: U=0 for 10yr arc, U=9 for <1 day
  const U = Math.max(0, Math.min(9, Math.round(9 - 2 * Math.log10(Math.max(estimatedArcDays, 0.1)))));

  // Current positional uncertainty (arcseconds)
  // σ_arcsec ≈ 10^(U-4) approximately
  const currentSigmaArcsec = Math.pow(10, U - 4);

  // Convert to km at 1 AU: 1 arcsec at 1 AU ≈ 725 km
  const currentSigmaKm = currentSigmaArcsec * 725;

  // Classify arc quality
  const arcQuality = classifyArcQuality(estimatedArcDays);

  // Estimate number of observations (rough: ~2 per night of arc)
  const numObservations = Math.max(3, Math.round(estimatedArcDays * 0.7));

  // Stale if last observation > 180 days ago
  const isStale = daysSinceLastObs > 180;

  return {
    designation,
    firstObsJD,
    lastObsJD,
    arcLengthDays: estimatedArcDays,
    arcQuality,
    uncertaintyParameterU: U,
    currentSigmaArcsec,
    currentSigmaKm,
    numObservations,
    daysSinceLastObs,
    isStale,
  };
}

function classifyArcQuality(arcDays: number): ArcQuality {
  if (arcDays > 3650) return "EXCELLENT";
  if (arcDays > 365) return "GOOD";
  if (arcDays > 30) return "MODERATE";
  if (arcDays > 7) return "POOR";
  if (arcDays > 1) return "CRITICAL";
  return "EPHEMERAL";
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: UNCERTAINTY GROWTH MODEL
   ═══════════════════════════════════════════════════════════ */

/**
 * Models how positional uncertainty grows over time.
 *
 * Two regimes:
 *   1. Short arc (arc < 1 year): σ(t) = σ₀ × (1 + t/t_arc)^β
 *      where β ≈ 2 (quadratic growth — the orbit is poorly constrained)
 *
 *   2. Long arc (arc > 1 year): σ(t) = σ₀ × (1 + t/t_arc)^0.5
 *      (diffusive growth — random walk in orbital elements)
 *
 * Yarkovsky adds: Δs_yark = (3/2)×(Δa/a)×n×t²×a
 *   where Δa = da/dt × t (semi-major axis drift)
 *
 * @param arcData - Current arc quality data
 * @param daDtAUDay - Yarkovsky drift rate (AU/day), 0 if not modeled
 * @param semiMajorAxisAU - Semi-major axis (AU)
 * @param projectionDays - Array of future times to project (days from now)
 */
export function projectUncertainty(
  arcData: ObservationArcData,
  daDtAUDay: number,
  semiMajorAxisAU: number,
  projectionDays: number[]
): UncertaintyProjection[] {
  const sigma0Km = arcData.currentSigmaKm;
  const arcDays = arcData.arcLengthDays;
  const aKm = semiMajorAxisAU * AU_KM;
  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3)); // mean motion (rad/s)

  // Growth exponent: short arcs grow quadratically, long arcs diffusively
  const beta = arcDays < 365 ? 2.0 : arcDays < 1825 ? 1.2 : 0.5;

  // Characteristic timescale for growth
  const tArc = Math.max(arcDays, 1);

  const projections: UncertaintyProjection[] = [];

  for (const days of projectionDays) {
    const tSeconds = days * SECONDS_PER_DAY;
    const tYears = days / 365.25;

    // Astrometric uncertainty growth
    const growthFactor = Math.pow(1 + days / tArc, beta);
    const sigmaAstrometricKm = sigma0Km * growthFactor;

    // Yarkovsky systematic drift
    // Δa = da/dt × t (in km)
    const deltaAKm = daDtAUDay * AU_KM * days;
    // Along-track shift: Δs = (3/2) × (Δa/a) × n × t × a
    const yarkovskyDriftKm = Math.abs(
      (3 / 2) * (deltaAKm / aKm) * n * tSeconds * aKm
    );

    // Total uncertainty (RSS combination)
    const totalSigmaKm = Math.sqrt(
      sigmaAstrometricKm * sigmaAstrometricKm +
      yarkovskyDriftKm * yarkovskyDriftKm
    );

    // Convert back to arcseconds (at 1 AU: 1 arcsec ≈ 725 km)
    const sigmaArcsec = totalSigmaKm / 725;

    // Recoverable if uncertainty < ~2 degrees (7200 arcsec)
    // This is the typical FOV of recovery surveys (Catalina, ATLAS, Pan-STARRS)
    const isRecoverable = sigmaArcsec < 7200;

    projections.push({
      daysFromNow: days,
      sigmaArcsec,
      sigmaKm: sigmaAstrometricKm,
      yarkovskyDriftKm,
      totalSigmaKm,
      isRecoverable,
    });
  }

  return projections;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: LOSS DATE COMPUTATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Computes the "loss date" — when the object's positional uncertainty
 * exceeds the recovery survey field of view, making recovery impossible
 * without a dedicated search campaign.
 *
 * Loss criterion: σ(t) > FOV_recovery / 2
 * Typical FOV: ATLAS = 30 deg², Catalina = 8 deg², Pan-STARRS = 7 deg²
 * Effective search radius: ~1–2 degrees = 3600–7200 arcsec
 *
 * @param arcData - Current arc data
 * @param daDtAUDay - Yarkovsky drift rate
 * @param semiMajorAxisAU - Semi-major axis
 * @param nowJD - Current Julian Date
 * @param recoveryFOVArcsec - Recovery survey FOV radius (arcsec), default 3600 (1°)
 */
export function computeLossDate(
  arcData: ObservationArcData,
  daDtAUDay: number,
  semiMajorAxisAU: number,
  nowJD: number,
  recoveryFOVArcsec: number = 3600
): { lossDateJD: number; lossDateYearsFromNow: number; isAlreadyLost: boolean } {
  // Binary search for the loss date
  let lo = 0;
  let hi = 36500; // 100 years max

  // Check if already lost
  if (arcData.currentSigmaArcsec > recoveryFOVArcsec) {
    return {
      lossDateJD: nowJD,
      lossDateYearsFromNow: 0,
      isAlreadyLost: true,
    };
  }

  // Binary search
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const proj = projectUncertainty(arcData, daDtAUDay, semiMajorAxisAU, [mid]);
    if (proj[0].sigmaArcsec > recoveryFOVArcsec) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const lossDays = (lo + hi) / 2;
  return {
    lossDateJD: nowJD + lossDays,
    lossDateYearsFromNow: lossDays / 365.25,
    isAlreadyLost: false,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: YARKOVSKY DOMINANCE ANALYSIS
   ═══════════════════════════════════════════════════════════ */

/**
 * Determines when Yarkovsky drift exceeds astrometric uncertainty.
 *
 * Before this time: astrometric errors dominate → more observations help
 * After this time: Yarkovsky dominates → need physical characterization
 *                  (thermal model, rotation state, shape model)
 *
 * This is the key insight: for well-observed objects, Yarkovsky
 * becomes the LIMITING FACTOR in prediction accuracy.
 *
 * @param arcData - Current arc data
 * @param daDtAUDay - Yarkovsky drift rate (AU/day)
 * @param semiMajorAxisAU - Semi-major axis (AU)
 */
export function computeYarkovskyDominance(
  arcData: ObservationArcData,
  daDtAUDay: number,
  semiMajorAxisAU: number
): number {
  if (daDtAUDay <= 0) return Infinity;

  const aKm = semiMajorAxisAU * AU_KM;
  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3));
  const sigma0Km = arcData.currentSigmaKm;
  const arcDays = arcData.arcLengthDays;
  const beta = arcDays < 365 ? 2.0 : arcDays < 1825 ? 1.2 : 0.5;
  const tArc = Math.max(arcDays, 1);

  // Find t where yarkovsky_drift(t) = astrometric_sigma(t)
  // Binary search
  let lo = 0;
  let hi = 36500;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const tSeconds = mid * SECONDS_PER_DAY;
    const deltaAKm = daDtAUDay * AU_KM * mid;
    const yarkKm = Math.abs((3 / 2) * (deltaAKm / aKm) * n * tSeconds * aKm);
    const astromKm = sigma0Km * Math.pow(1 + mid / tArc, beta);

    if (yarkKm > astromKm) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return (lo + hi) / 2 / 365.25; // Convert to years
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6: COMPLETE ARC ANALYSIS
   ═══════════════════════════════════════════════════════════ */

/**
 * Runs the complete observation arc analysis pipeline.
 */
export function analyzeObservationArc(
  designation: string,
  lastObsJD: number,
  orbitEpochJD: number,
  elementSigmas: number[],
  semiMajorAxisAU: number,
  daDtAUDay: number,
  nowJD: number
): ArcAnalysisResult {
  const arc = estimateObservationArc(
    designation, lastObsJD, orbitEpochJD, elementSigmas, nowJD
  );

  // Project uncertainty at key intervals
  const projectionDays = [
    7, 30, 90, 180, 365, 730, 1825, 3650, 7300, 18250,
  ];
  const projection = projectUncertainty(
    arc, daDtAUDay, semiMajorAxisAU, projectionDays
  );

  // Compute loss date
  const loss = computeLossDate(arc, daDtAUDay, semiMajorAxisAU, nowJD);

  // Yarkovsky dominance
  const yarkovskyDominanceYears = computeYarkovskyDominance(
    arc, daDtAUDay, semiMajorAxisAU
  );

  // Generate recommendation
  let recommendation: string;
  let urgency: ArcAnalysisResult["urgency"];

  if (loss.isAlreadyLost) {
    recommendation =
      `OBJECT LOST — uncertainty (${arc.currentSigmaArcsec.toFixed(0)}″) exceeds recovery FOV. ` +
      `Requires dedicated search campaign. Arc: ${arc.arcLengthDays.toFixed(0)} days (${arc.arcQuality}).`;
    urgency = "CRITICAL";
  } else if (loss.lossDateYearsFromNow < 1) {
    recommendation =
      `OBSERVE IMMEDIATELY — object will be lost in ${loss.lossDateYearsFromNow.toFixed(2)} years. ` +
      `Current arc: ${arc.arcLengthDays.toFixed(0)} days. ` +
      `${arc.isStale ? `STALE: last observed ${arc.daysSinceLastObs.toFixed(0)} days ago.` : ""}`;
    urgency = "CRITICAL";
  } else if (loss.lossDateYearsFromNow < 5) {
    recommendation =
      `Observe within ${loss.lossDateYearsFromNow.toFixed(1)} years to maintain tracking. ` +
      `Arc: ${arc.arcLengthDays.toFixed(0)} days (${arc.arcQuality}). ` +
      (daDtAUDay > 0
        ? `Yarkovsky dominates in ${yarkovskyDominanceYears.toFixed(1)} yr — need thermal/rotation data.`
        : "");
    urgency = "URGENT";
  } else if (arc.isStale) {
    recommendation =
      `Object not observed for ${arc.daysSinceLastObs.toFixed(0)} days. ` +
      `Recovery observation recommended to refresh ephemeris. ` +
      `Loss in ${loss.lossDateYearsFromNow.toFixed(1)} years at current rate.`;
    urgency = "SOON";
  } else {
    recommendation =
      `Arc quality: ${arc.arcQuality} (${arc.arcLengthDays.toFixed(0)} days). ` +
      `Loss in ${loss.lossDateYearsFromNow.toFixed(1)} years. ` +
      (yarkovskyDominanceYears < 50
        ? `Yarkovsky will dominate uncertainty in ${yarkovskyDominanceYears.toFixed(1)} yr.`
        : "Astrometric uncertainty dominates for foreseeable future.");
    urgency = "ROUTINE";
  }

  return {
    arc,
    projection,
    lossDateJD: loss.lossDateJD,
    lossDateYearsFromNow: loss.lossDateYearsFromNow,
    isLost: loss.isAlreadyLost,
    yarkovskyDominanceYears,
    recommendation,
    urgency,
  };
}