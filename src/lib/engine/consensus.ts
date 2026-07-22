/**
 * AEGIS-SENTRY v3.5 — Multi-Agency Consensus Engine
 *
 * Quantifies the degree of agreement between NASA Sentry-II and
 * ESA NEOCC/Aegis risk assessments. Decomposes disagreement into
 * physical root causes and generates actionable recommendations.
 *
 * The 2024 YR4 case demonstrated that NASA and ESA produced
 * different probabilities at every stage (1.2% vs 0.8% → 3.1% vs 2.1%).
 * No public tool quantifies this disagreement in real-time.
 *
 * Consensus Score (0-100):
 *   100 = Perfect agreement (IP ratio = 1, ΔPS = 0, same Yarkovsky)
 *   50  = Moderate disagreement (needs monitoring)
 *   0   = Complete disagreement (needs independent verification)
 *
 * References:
 *   Fenucci et al. (2024) §7.4 — NASA IOBS vs ESA LOV methodology
 *   NASA OIG IG-25-006 — "lack of key interagency collaboration"
 *   Chesley et al. (2002) — Palermo Scale definition
 *   2024 YR4 case — real-world multi-agency divergence
 */

import { DivergenceMetrics } from "./types";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: CONSENSUS SCORE COMPUTATION
   ═══════════════════════════════════════════════════════════ */

export interface ConsensusMetrics {
  /** Overall consensus score (0-100, 100 = perfect agreement) */
  consensusScore: number;
  /** Disagreement index (0-1, 0 = perfect, 1 = maximum) */
  disagreementIndex: number;
  /** IP ratio component of disagreement (0-1) */
  ipRatioComponent: number;
  /** Palermo Scale component of disagreement (0-1) */
  palermoComponent: number;
  /** Yarkovsky modeling component (0-1) */
  yarkovskyComponent: number;
  /** Temporal component (different epochs/observations) (0-1) */
  temporalComponent: number;
  /** Root cause classification */
  rootCause: DivergenceRootCause;
  /** Confidence in the consensus assessment (0-1) */
  confidence: number;
  /** Actionable recommendation */
  recommendation: string;
  /** Priority for independent verification */
  verificationPriority: "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
}

export type DivergenceRootCause =
  | "YARKOVSKY_MODELING"      // NASA includes A1/A2, ESA doesn't
  | "OBSERVATION_EPOCH"       // Different last observation dates
  | "METHODOLOGY"             // IOBS vs LOV impact search
  | "DIAMETER_DISAGREEMENT"   // Different size estimates
  | "TEMPORAL_OFFSET"         // Data not synchronized
  | "NUMERICAL_PRECISION"     // Floating-point / convergence
  | "AGREEMENT"               // Agencies agree
  | "INSUFFICIENT_DATA";      // Can't determine

/**
 * Computes the full consensus analysis for a tracked object.
 *
 * @param threat - The divergence metrics for this object
 * @param ysiValue - Yarkovsky Sensitivity Index (0-5+)
 * @param hasNasaYarkovsky - Whether NASA is modeling Yarkovsky
 * @param arcLengthDays - Observation arc length (days)
 */
export function computeConsensus(
  threat: DivergenceMetrics,
  ysiValue: number,
  hasNasaYarkovsky: boolean,
  arcLengthDays: number
): ConsensusMetrics {
  const nasaIp = threat.nasa.ip;
  const esaIp = threat.esa.ipCum;

  // Only compute for matched objects
  if (nasaIp <= 0 || esaIp <= 0) {
    return {
      consensusScore: 0,
      disagreementIndex: 1,
      ipRatioComponent: 1,
      palermoComponent: 0,
      yarkovskyComponent: 0,
      temporalComponent: 0,
      rootCause: "INSUFFICIENT_DATA",
      confidence: 0,
      recommendation: "Single-agency coverage only. Independent verification required for risk assessment.",
      verificationPriority: "HIGH",
    };
  }

  // --- Component 1: IP Ratio ---
  const ipRatio = Math.max(nasaIp, esaIp) / Math.max(Math.min(nasaIp, esaIp), 1e-30);
  const ipRatioComponent = Math.min(1, Math.log10(ipRatio) / 3); // 1000× ratio → 1.0

  // --- Component 2: Palermo Scale Difference ---
  const palermoDelta = Math.abs(threat.palermoNasaRecomputed - threat.palermoEsaRecomputed);
  const palermoComponent = Math.min(1, palermoDelta / 3); // ΔPS = 3 → 1.0

  // --- Component 3: Yarkovsky Modeling Gap ---
  // If NASA models Yarkovsky and ESA doesn't, this is a systematic bias
  let yarkovskyComponent = 0;
  if (hasNasaYarkovsky && !threat.esa.hasNonGrav) {
    yarkovskyComponent = Math.min(1, ysiValue / 3); // YSI = 3 → 1.0
  }

  // --- Component 4: Temporal/Epoch Offset ---
  // Short arcs → larger epoch sensitivity
  const temporalComponent = arcLengthDays < 30 ? 0.6 :
    arcLengthDays < 180 ? 0.3 :
    arcLengthDays < 365 ? 0.15 : 0.05;

  // --- Weighted Disagreement Index ---
  const weights = { ip: 0.35, palermo: 0.25, yarkovsky: 0.25, temporal: 0.15 };
  const disagreementIndex = Math.min(1,
    weights.ip * ipRatioComponent +
    weights.palermo * palermoComponent +
    weights.yarkovsky * yarkovskyComponent +
    weights.temporal * temporalComponent
  );

  const consensusScore = Math.round((1 - disagreementIndex) * 100);

  // --- Root Cause Analysis ---
  const rootCause = determineRootCause(
    ipRatioComponent, palermoComponent,
    yarkovskyComponent, temporalComponent,
    hasNasaYarkovsky, threat.esa.hasNonGrav,
    threat.nasa.diameterKm, threat.esa.diameterM
  );

  // --- Confidence ---
  const confidence = Math.min(1, Math.max(0.1,
    0.4 +
    0.3 * (arcLengthDays > 365 ? 1 : arcLengthDays / 365) +
    0.2 * (threat.sourceMatch === "BOTH" ? 1 : 0) +
    0.1 * (1 - temporalComponent)
  ));

  // --- Verification Priority ---
  const verificationPriority = determineVerificationPriority(
    consensusScore, disagreementIndex, nasaIp, esaIp, ysiValue
  );

  // --- Recommendation ---
  const recommendation = generateRecommendation(
    rootCause, consensusScore, disagreementIndex,
    nasaIp, esaIp, ysiValue, verificationPriority
  );

  return {
    consensusScore,
    disagreementIndex,
    ipRatioComponent,
    palermoComponent,
    yarkovskyComponent,
    temporalComponent,
    rootCause,
    confidence,
    recommendation,
    verificationPriority,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: ROOT CAUSE DETERMINATION
   ═══════════════════════════════════════════════════════════ */

function determineRootCause(
  ipComp: number,
  palermoComp: number,
  yarkComp: number,
  temporalComp: number,
  nasaHasYark: boolean,
  esaHasYark: boolean,
  nasaDiamKm: number,
  esaDiamM: number
): DivergenceRootCause {
  // Check diameter disagreement first
  const esaDiamKm = esaDiamM / 1000;
  if (nasaDiamKm > 0 && esaDiamKm > 0) {
    const diamRatio = Math.max(nasaDiamKm, esaDiamKm) / Math.min(nasaDiamKm, esaDiamKm);
    if (diamRatio > 2) return "DIAMETER_DISAGREEMENT";
  }

  // Yarkovsky modeling gap is the dominant cause
  if (yarkComp > 0.4 && nasaHasYark && !esaHasYark) {
    return "YARKOVSKY_MODELING";
  }

  // Methodology difference (IOBS vs LOV)
  if (ipComp > 0.5 && palermoComp > 0.3 && yarkComp < 0.3) {
    return "METHODOLOGY";
  }

  // Temporal offset (short arc, different epochs)
  if (temporalComp > 0.4) {
    return "OBSERVATION_EPOCH";
  }

  // Small disagreement → numerical precision
  if (ipComp < 0.1 && palermoComp < 0.1) {
    return "AGREEMENT";
  }

  // Default: methodology
  return "METHODOLOGY";
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: VERIFICATION PRIORITY
   ═══════════════════════════════════════════════════════════ */

function determineVerificationPriority(
  consensusScore: number,
  disagreementIndex: number,
  nasaIp: number,
  esaIp: number,
  ysi: number
): ConsensusMetrics["verificationPriority"] {
  const maxIp = Math.max(nasaIp, esaIp);

  // Critical: high IP + large disagreement
  if (maxIp > 1e-3 && disagreementIndex > 0.5) return "CRITICAL";
  if (maxIp > 1e-4 && disagreementIndex > 0.7) return "CRITICAL";

  // High: moderate IP + significant disagreement
  if (maxIp > 1e-4 && disagreementIndex > 0.4) return "HIGH";
  if (consensusScore < 30 && maxIp > 1e-5) return "HIGH";

  // Moderate: some disagreement
  if (disagreementIndex > 0.3) return "MODERATE";
  if (consensusScore < 50 && ysi > 1.5) return "MODERATE";

  // Low: minor disagreement
  if (disagreementIndex > 0.15) return "LOW";

  return "NONE";
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: RECOMMENDATION GENERATION
   ═══════════════════════════════════════════════════════════ */

function generateRecommendation(
  rootCause: DivergenceRootCause,
  consensusScore: number,
  disagreementIndex: number,
  nasaIp: number,
  esaIp: number,
  ysi: number,
  priority: ConsensusMetrics["verificationPriority"]
): string {
  const ipRatio = Math.max(nasaIp, esaIp) / Math.max(Math.min(nasaIp, esaIp), 1e-30);

  switch (rootCause) {
    case "YARKOVSKY_MODELING":
      return `Divergence driven by Yarkovsky modeling gap (YSI=${ysi.toFixed(2)}). ` +
        `NASA includes A1/A2 non-gravitational parameters; ESA runs gravity-only. ` +
        `Recommendation: ${ysi > 2 ? "URGENT — request ESA re-analysis with non-grav model." :
        "Monitor — Yarkovsky effect is secondary at current precision."} ` +
        `IP ratio: ${ipRatio.toFixed(1)}×.`;

    case "METHODOLOGY":
      return `Divergence from methodology difference (NASA IOBS vs ESA LOV). ` +
        `IP ratio: ${ipRatio.toFixed(1)}×, ΔPS: ${Math.abs(Math.log10(nasaIp) - Math.log10(esaIp)).toFixed(2)}. ` +
        `Recommendation: ${priority === "CRITICAL" ? "Independent third-party orbit determination required." :
        "Continue dual-agency monitoring. Disagreement within expected methodology bounds."}`;

    case "OBSERVATION_EPOCH":
      return `Divergence from observation epoch mismatch. ` +
        `Agencies using different astrometric datasets. ` +
        `Recommendation: New observations will synchronize solutions. ` +
        `Priority: ${priority}.`;

    case "DIAMETER_DISAGREEMENT":
      return `Divergence from diameter/size estimate disagreement. ` +
        `Different H-magnitude or albedo assumptions. ` +
        `Recommendation: Request photometric characterization to resolve size.`;

    case "TEMPORAL_OFFSET":
      return `Minor temporal offset in data synchronization. ` +
        `Will resolve with next data refresh cycle.`;

    case "AGREEMENT":
      return `Agencies in strong agreement (consensus: ${consensusScore}/100). ` +
        `No independent verification needed. Continue standard monitoring.`;

    case "INSUFFICIENT_DATA":
      return `Insufficient data for consensus analysis. ` +
        `Object tracked by single agency only. ` +
        `Recommendation: Cross-match with second agency catalogue.`;

    default:
      return `Consensus score: ${consensusScore}/100. ` +
        `Disagreement index: ${(disagreementIndex * 100).toFixed(0)}%. ` +
        `Verification priority: ${priority}.`;
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: BATCH CONSENSUS STATISTICS
   ═══════════════════════════════════════════════════════════ */

export interface ConsensusStatistics {
  totalMatched: number;
  meanConsensusScore: number;
  medianConsensusScore: number;
  criticalDisagreements: number;
  yarkovskyDrivenCount: number;
  methodologyDrivenCount: number;
  topDivergent: Array<{ designation: string; consensusScore: number; rootCause: string }>;
}

/**
 * Computes aggregate consensus statistics across all tracked objects.
 */
export function computeConsensusStatistics(
  consensusResults: Array<{ designation: string; metrics: ConsensusMetrics }>
): ConsensusStatistics {
  if (consensusResults.length === 0) {
    return {
      totalMatched: 0,
      meanConsensusScore: 0,
      medianConsensusScore: 0,
      criticalDisagreements: 0,
      yarkovskyDrivenCount: 0,
      methodologyDrivenCount: 0,
      topDivergent: [],
    };
  }

  const scores = consensusResults.map((r) => r.metrics.consensusScore).sort((a, b) => a - b);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const median = scores[Math.floor(scores.length / 2)];

  const topDivergent = [...consensusResults]
    .sort((a, b) => a.metrics.consensusScore - b.metrics.consensusScore)
    .slice(0, 10)
    .map((r) => ({
      designation: r.designation,
      consensusScore: r.metrics.consensusScore,
      rootCause: r.metrics.rootCause,
    }));

  return {
    totalMatched: consensusResults.length,
    meanConsensusScore: Math.round(mean),
    medianConsensusScore: median,
    criticalDisagreements: consensusResults.filter(
      (r) => r.metrics.verificationPriority === "CRITICAL"
    ).length,
    yarkovskyDrivenCount: consensusResults.filter(
      (r) => r.metrics.rootCause === "YARKOVSKY_MODELING"
    ).length,
    methodologyDrivenCount: consensusResults.filter(
      (r) => r.metrics.rootCause === "METHODOLOGY"
    ).length,
    topDivergent,
  };
}