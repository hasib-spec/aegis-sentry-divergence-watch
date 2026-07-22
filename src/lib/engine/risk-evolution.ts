/**
 * AEGIS-SENTRY v3.3 — Risk Evolution Timeline Engine
 *
 * Models how impact probability evolves over time for a tracked NEO.
 * Combines three physical effects:
 *
 *   1. Uncertainty evolution: σ(t) changes as observations accumulate
 *      or as the object recedes (fewer observations → σ grows)
 *
 *   2. Yarkovsky drift: systematic along-track displacement that
 *      moves the nominal trajectory relative to Earth
 *
 *   3. Geometric convergence: as the object approaches the next
 *      close encounter, the IP naturally increases (funnel effect)
 *
 * The 2024 YR4 case demonstrated all three effects:
 *   IP went 1.2% → 3.1% → 0.28% → 0.004% over weeks as
 *   new observations refined the orbit and Yarkovsky shifted the path.
 *
 * References:
 *   Chesley (2005), "Potential Impact Detection for NEAs"
 *   Farnocchia et al. (2013), "Yarkovsky-driven impact risk analysis"
 *   Vokrouhlický et al. (2015), "Yarkovsky/YORP effects"
 */

import { AU_KM, MU_SUN, SECONDS_PER_DAY, EARTH_RADIUS_KM } from "./constants";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: RISK EVOLUTION MODEL
   ═══════════════════════════════════════════════════════════ */

export interface RiskEvolutionPoint {
  /** Years from now (negative = past, positive = future) */
  yearsFromNow: number;
  /** Julian Date */
  jd: number;
  /** Modeled impact probability (NASA-like, with Yarkovsky) */
  ipNasa: number;
  /** Modeled impact probability (ESA-like, gravity-only) */
  ipEsa: number;
  /** Palermo Scale (NASA model) */
  palermoNasa: number;
  /** Palermo Scale (ESA model) */
  palermoEsa: number;
  /** 1-sigma positional uncertainty (km) */
  sigmaKm: number;
  /** Nominal miss distance (km) */
  missDistanceKm: number;
  /** Is this a past reconstruction or future projection? */
  isProjection: boolean;
}

export interface RiskTrend {
  /** Current trend direction */
  direction: "RISING" | "FALLING" | "STABLE" | "OSCILLATING";
  /** Rate of change: dIP/dt (per year) */
  ratePerYear: number;
  /** Doubling/halving time (years) */
  characteristicTimeYears: number;
  /** Years until IP drops below 10⁻⁶ (safe threshold) */
  yearsToSafe: number;
  /** Confidence in trend (0-1) */
  confidence: number;
}

export interface RiskEvolutionResult {
  designation: string;
  timeline: RiskEvolutionPoint[];
  trend: RiskTrend;
  nasaEsaDivergenceTrend: "GROWING" | "SHRINKING" | "STABLE";
  peakIP: number;
  peakIPYear: number;
  currentIP: number;
  recommendation: string;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: IP EVOLUTION PHYSICS
   ═══════════════════════════════════════════════════════════ */

/**
 * Models impact probability as a function of time.
 *
 * IP(t) ≈ (R⊕² / (2 × σ(t)²)) × exp(-d(t)² / (2 × σ(t)²))
 *
 * Where:
 *   σ(t) = positional uncertainty at time t (grows without observations)
 *   d(t) = nominal miss distance at time t (changes due to Yarkovsky)
 *   R⊕ = Earth radius (target cross-section)
 *
 * This is the 2D Gaussian probability density at Earth's position,
 * integrated over Earth's cross-sectional area.
 *
 * @param currentIP - Current impact probability (anchor point)
 * @param currentSigmaKm - Current 1-sigma uncertainty (km)
 * @param currentMissKm - Current nominal miss distance (km)
 * @param daDtAUDay - Yarkovsky drift rate (AU/day)
 * @param semiMajorAxisAU - Semi-major axis (AU)
 * @param yearsToImpact - Years to closest approach
 * @param arcLengthDays - Observation arc length (days)
 * @param nowJD - Current Julian Date
 * @param energyMt - Impact energy (Mt) for Palermo Scale
 */
export function modelRiskEvolution(
  designation: string,
  currentIP: number,
  currentSigmaKm: number,
  currentMissKm: number,
  daDtAUDay: number,
  semiMajorAxisAU: number,
  yearsToImpact: number,
  arcLengthDays: number,
  nowJD: number,
  energyMt: number
): RiskEvolutionResult {
  const timeline: RiskEvolutionPoint[] = [];
  const aKm = semiMajorAxisAU * AU_KM;
  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3));

  // Uncertainty growth parameters
  const beta = arcLengthDays < 365 ? 2.0 : arcLengthDays < 1825 ? 1.2 : 0.5;
  const tArc = Math.max(arcLengthDays, 1);

  // Observation rate assumption: ~30 observations per year for tracked NEOs
  // Each observation reduces uncertainty by factor ~1/sqrt(N)
  const obsPerYear = 30;
  const sigmaReductionPerObs = 1 / Math.sqrt(obsPerYear);

  // Time points: past 5 years to future (yearsToImpact + 5)
  const futureYears = Math.min(yearsToImpact + 5, 100);
  const timePoints: number[] = [];

  // Past: -5 to 0 (reconstruction)
  for (let y = -5; y < 0; y += 0.5) timePoints.push(y);
  // Present
  timePoints.push(0);
  // Future: 0 to futureYears
  const step = futureYears > 20 ? 2 : futureYears > 5 ? 1 : 0.5;
  for (let y = step; y <= futureYears; y += step) timePoints.push(y);

  for (const yearsFromNow of timePoints) {
    const jd = nowJD + yearsFromNow * 365.25;
    const isProjection = yearsFromNow > 0;
    const absYears = Math.abs(yearsFromNow);
    const absDays = absYears * 365.25;

    // --- Uncertainty evolution ---
    let sigmaKm: number;
    if (yearsFromNow <= 0) {
      // Past: uncertainty was LARGER (fewer observations)
      // σ_past = σ_now × (1 + |t|/t_arc)^β (running backward)
      sigmaKm = currentSigmaKm * Math.pow(1 + absDays / tArc, beta);
    } else {
      // Future: uncertainty grows without new observations
      // But if object is being tracked, observations slow the growth
      const growthFactor = Math.pow(1 + absDays / tArc, beta * 0.3);
      // Observation benefit (diminishing returns)
      const obsBenefit = Math.pow(sigmaReductionPerObs, absYears * 0.5);
      sigmaKm = currentSigmaKm * growthFactor * Math.max(obsBenefit, 0.1);
    }

    // --- Yarkovsky drift ---
    const tSeconds = yearsFromNow * 365.25 * SECONDS_PER_DAY;
    const deltaAKm = daDtAUDay * AU_KM * absDays;
    const yarkovskyShiftKm = Math.abs(
      (3 / 2) * (deltaAKm / aKm) * n * Math.abs(tSeconds) * aKm
    );

    // --- Miss distance evolution ---
    // Yarkovsky shifts the nominal trajectory
    // For past: the shift was smaller (less time for drift)
    // For future: the shift grows
    const missDistanceKm = Math.max(
      EARTH_RADIUS_KM * 0.1,
      currentMissKm + (yearsFromNow > 0 ? yarkovskyShiftKm : -yarkovskyShiftKm * 0.5)
    );

    // --- Impact probability model ---
    // IP ≈ (R⊕² / (2σ²)) × exp(-d² / (2σ²))
    // Normalized so that IP(0) = currentIP
    const earthCrossSection = Math.PI * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
    const gaussianFactor = Math.exp(
      -(missDistanceKm * missDistanceKm) / (2 * sigmaKm * sigmaKm)
    );
    const geometricFactor = earthCrossSection / (2 * Math.PI * sigmaKm * sigmaKm);

    // Normalize to current IP at t=0
    const currentGaussian = Math.exp(
      -(currentMissKm * currentMissKm) / (2 * currentSigmaKm * currentSigmaKm)
    );
    const currentGeometric = earthCrossSection / (2 * Math.PI * currentSigmaKm * currentSigmaKm);
    const normalizationFactor = currentIP / Math.max(currentGaussian * currentGeometric, 1e-30);

    let ipNasa = normalizationFactor * gaussianFactor * geometricFactor;
    ipNasa = Math.max(0, Math.min(1, ipNasa));

    // ESA model: no Yarkovsky → different miss distance evolution
    const missEsaKm = Math.max(EARTH_RADIUS_KM * 0.1, currentMissKm);
    const gaussianEsa = Math.exp(
      -(missEsaKm * missEsaKm) / (2 * sigmaKm * sigmaKm)
    );
    let ipEsa = normalizationFactor * gaussianEsa * geometricFactor;
    ipEsa = Math.max(0, Math.min(1, ipEsa));

    // Palermo Scale
    const palermoNasa = computePS(ipNasa, energyMt, Math.max(yearsToImpact - yearsFromNow, 0.1));
    const palermoEsa = computePS(ipEsa, energyMt, Math.max(yearsToImpact - yearsFromNow, 0.1));

    timeline.push({
      yearsFromNow,
      jd,
      ipNasa,
      ipEsa,
      palermoNasa,
      palermoEsa,
      sigmaKm,
      missDistanceKm,
      isProjection,
    });
  }

  // --- Trend analysis ---
  const trend = analyzeTrend(timeline, currentIP);

  // --- NASA-ESA divergence trend ---
  const earlyDiv = Math.abs(
    Math.log10(Math.max(timeline[0]?.ipNasa ?? 1e-10, 1e-10)) -
    Math.log10(Math.max(timeline[0]?.ipEsa ?? 1e-10, 1e-10))
  );
  const lateDiv = Math.abs(
    Math.log10(Math.max(timeline[timeline.length - 1]?.ipNasa ?? 1e-10, 1e-10)) -
    Math.log10(Math.max(timeline[timeline.length - 1]?.ipEsa ?? 1e-10, 1e-10))
  );
  const nasaEsaDivergenceTrend =
    lateDiv > earlyDiv * 1.2 ? "GROWING" : lateDiv < earlyDiv * 0.8 ? "SHRINKING" : "STABLE";

  // --- Peak IP ---
  let peakIP = 0;
  let peakIPYear = 0;
  for (const pt of timeline) {
    if (pt.ipNasa > peakIP) {
      peakIP = pt.ipNasa;
      peakIPYear = pt.yearsFromNow;
    }
  }

  // --- Recommendation ---
  let recommendation: string;
  if (trend.direction === "RISING" && trend.ratePerYear > 0) {
    recommendation =
      `RISK RISING at ${trend.ratePerYear.toExponential(2)}/yr. ` +
      `Peak IP: ${peakIP.toExponential(2)} in ${peakIPYear.toFixed(1)} yr. ` +
      `Priority: increase observation cadence to constrain orbit.`;
  } else if (trend.direction === "FALLING") {
    recommendation =
      `RISK FALLING. IP will drop below 10⁻⁶ in ~${trend.yearsToSafe.toFixed(1)} yr ` +
      `at current rate. Continue monitoring but no urgent action needed.`;
  } else {
    recommendation =
      `RISK STABLE at ~${currentIP.toExponential(2)}. ` +
      `NASA-ESA divergence: ${nasaEsaDivergenceTrend}. ` +
      `Yarkovsky modeling ${daDtAUDay > 0 ? "active" : "not available"} — ` +
      `${daDtAUDay > 0 ? "primary source of long-term uncertainty." : "ESA gravity-only model may diverge."}`;
  }

  return {
    designation,
    timeline,
    trend,
    nasaEsaDivergenceTrend,
    peakIP,
    peakIPYear,
    currentIP,
    recommendation,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: TREND ANALYSIS
   ═══════════════════════════════════════════════════════════ */

function analyzeTrend(
  timeline: RiskEvolutionPoint[],
  currentIP: number
): RiskTrend {
  if (timeline.length < 3) {
    return {
      direction: "STABLE",
      ratePerYear: 0,
      characteristicTimeYears: Infinity,
      yearsToSafe: Infinity,
      confidence: 0,
    };
  }

  // Find the current point (yearsFromNow ≈ 0)
  const currentIdx = timeline.findIndex((p) => Math.abs(p.yearsFromNow) < 0.01);
  const idx = currentIdx >= 0 ? currentIdx : Math.floor(timeline.length / 2);

  // Compute rate of change using central difference
  const before = timeline[Math.max(0, idx - 2)];
  const after = timeline[Math.min(timeline.length - 1, idx + 2)];
  const dt = after.yearsFromNow - before.yearsFromNow;

  let ratePerYear = 0;
  if (dt > 0 && before.ipNasa > 0 && after.ipNasa > 0) {
    // Use log-space for rate (more meaningful for exponential changes)
    ratePerYear = (Math.log10(after.ipNasa) - Math.log10(before.ipNasa)) / dt;
  }

  // Classify direction
  let direction: RiskTrend["direction"];
  const absRate = Math.abs(ratePerYear);
  if (absRate < 0.01) {
    direction = "STABLE";
  } else if (ratePerYear > 0) {
    direction = "RISING";
  } else {
    direction = "FALLING";
  }

  // Check for oscillation (sign changes in derivative)
  let signChanges = 0;
  for (let i = 2; i < timeline.length - 1; i++) {
    const d1 = Math.log10(Math.max(timeline[i].ipNasa, 1e-30)) -
               Math.log10(Math.max(timeline[i - 1].ipNasa, 1e-30));
    const d2 = Math.log10(Math.max(timeline[i + 1].ipNasa, 1e-30)) -
               Math.log10(Math.max(timeline[i].ipNasa, 1e-30));
    if (d1 * d2 < 0) signChanges++;
  }
  if (signChanges > timeline.length * 0.3) {
    direction = "OSCILLATING";
  }

  // Characteristic time (doubling/halving time)
  const characteristicTimeYears = absRate > 0.001 ? 1 / absRate : Infinity;

  // Years until IP < 10⁻⁶
  let yearsToSafe = Infinity;
  for (const pt of timeline) {
    if (pt.yearsFromNow > 0 && pt.ipNasa < 1e-6) {
      yearsToSafe = pt.yearsFromNow;
      break;
    }
  }

  // Confidence: based on data quality and model consistency
  const confidence = Math.min(1, Math.max(0.1,
    0.5 + 0.3 * (1 - absRate) + 0.2 * (direction === "STABLE" ? 1 : 0.5)
  ));

  return {
    direction,
    ratePerYear,
    characteristicTimeYears,
    yearsToSafe,
    confidence,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: PALERMO SCALE HELPER
   ═══════════════════════════════════════════════════════════ */

function computePS(ip: number, energyMt: number, years: number): number {
  if (ip <= 0 || energyMt <= 0 || years <= 0) return -Infinity;
  const fB = 0.03 * Math.pow(energyMt, -0.8);
  return Math.log10(ip / (fB * years));
}