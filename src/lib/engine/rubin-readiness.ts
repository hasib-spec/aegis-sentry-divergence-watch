/**
 * AEGIS-SENTRY v3.0 — Rubin Readiness Score (RRS)
 *
 * Vera C. Rubin Observatory LSST alert stream: ~7M alerts/night (live 2026-02-24).
 * RRS triages which tracked objects deserve immediate follow-up observation.
 *
 *   RRS = 25·size + 25·urgency + 25·uncertainty + 25·coverage-gap
 *
 * Reference: LSST Solar System Science Collaboration (2018)
 */

export interface ReadinessInput {
  energyMt: number;
  yearsToImpact: number;
  ysi: number;
  probabilityRatio: number;
  sourceMatch: "BOTH" | "NASA_ONLY" | "ESA_ONLY";
  impactProbability: number;
  elementsEstimated: boolean;
}

export interface ReadinessOutput {
  score: number;
  priority: "ROUTINE" | "ELEVATED" | "URGENT" | "CRITICAL";
  nextWindowYears: number;
  factors: string[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function computeRubinReadiness(input: ReadinessInput): ReadinessOutput {
  const factors: string[] = [];

  const sizeFactor = clamp01(Math.log10(Math.max(input.energyMt, 0.001) * 1000) / 8);
  if (sizeFactor > 0.6) factors.push("CITY-CLASS ENERGY");

  const urgencyFactor = clamp01(1 - input.yearsToImpact / 100);
  if (input.yearsToImpact <= 20) factors.push("WINDOW < 20 YR");

  const uncertaintyFactor = clamp01(input.ysi / 3);
  if (input.ysi >= 1) factors.push("YARKOVSKY-DOMINATED σ");

  let coverageFactor = 0.15;
  if (input.sourceMatch !== "BOTH") {
    coverageFactor = 1.0;
    factors.push("SINGLE-AGENCY COVERAGE");
  } else if (input.probabilityRatio > 10 || input.probabilityRatio < 0.1) {
    coverageFactor = 0.7;
    factors.push("AGENCY IP DISAGREEMENT >10×");
  } else if (input.probabilityRatio > 2 || input.probabilityRatio < 0.5) {
    coverageFactor = 0.4;
  }

  if (input.elementsEstimated) factors.push("ELEMENTS SYNTHESIZED");
  if (input.impactProbability > 1e-3) factors.push("IP > 10⁻³");

  const score = Math.round(
    100 * (0.25 * sizeFactor + 0.25 * urgencyFactor + 0.25 * uncertaintyFactor + 0.25 * coverageFactor)
  );

  const priority: ReadinessOutput["priority"] =
    score >= 75 ? "CRITICAL" : score >= 55 ? "URGENT" : score >= 35 ? "ELEVATED" : "ROUTINE";

  return { score, priority, nextWindowYears: input.yearsToImpact, factors: factors.slice(0, 4) };
}
