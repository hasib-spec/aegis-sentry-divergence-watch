import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AEGIS-SENTRY v3.5 — Public REST API Documentation
 *
 * Serves OpenAPI-style documentation for all engine endpoints.
 * Enables third-party integration, research reproducibility,
 * and institutional adoption.
 */
export async function GET() {
  const docs = {
    info: {
      title: "AEGIS·SENTRY Planetary Defense Readiness Engine API",
      version: "3.5.0",
      description:
        "Real-time multi-agency asteroid risk divergence engine. " +
        "Compares NASA Sentry-II and ESA NEOCC/Aegis impact probability calculations. " +
        "Includes Yarkovsky sensitivity, gravitational keyhole detection, " +
        "impact corridor projection, deflection planning, and Rubin LSST triage.",
      contact: {
        name: "AEGIS·SENTRY Research",
        url: "https://aegis-sentry.vercel.app",
      },
      license: {
        name: "Research Use Only — NOT FOR OPERATIONAL DECISIONS",
      },
    },
    servers: [
      {
        url: "https://aegis-sentry.vercel.app",
        description: "Production (Vercel Edge, IAD1)",
      },
    ],
    endpoints: [
      {
        path: "/api/threats",
        method: "GET",
        summary: "Full threat catalogue with multi-agency divergence",
        description:
          "Fetches NASA Sentry-II and ESA NEOCC risk lists, cross-matches objects, " +
          "computes Palermo Scale divergence, Yarkovsky Sensitivity Index, " +
          "gravitational keyhole susceptibility, impact corridors, and Rubin Readiness Score.",
        parameters: [],
        response: {
          threats: "Array<AdvancedThreat> (up to 300 objects)",
          metadata: {
            nasaCount: "number — NASA Sentry objects",
            esaCount: "number — ESA NEOCC objects",
            matchedCount: "number — Dual-agency matched pairs",
            criticalCount: "number — CRITICAL divergence severity",
            ysiDominantCount: "number — Yarkovsky-dominated orbits",
            keyholeAlertCount: "number — Keyhole σ-overlap alerts",
            corridorCount: "number — Impact corridors projected",
            readinessCriticalCount: "number — Rubin CRITICAL priority",
          },
        },
        cache: "s-maxage=300, stale-while-revalidate=600",
        example: "GET /api/threats",
      },
      {
        path: "/api/object/{designation}",
        method: "GET",
        summary: "Deep dossier for a single object",
        description:
          "Fetches full orbital elements from NASA SBDB + ESA .ke1, " +
          "propagates 1/10/50-year divergence, computes Palermo Scale, " +
          "Yarkovsky drift, keyhole field, impact corridor, and readiness.",
        parameters: [
          { name: "designation", in: "path", required: true, type: "string", example: "2024 YR4" },
        ],
        response: {
          nasa: "Sentry data + SBDB elements + non-grav params",
          esa: "Orbital elements + risk file",
          propagation: "1yr, 10yr, 50yr position divergence",
          palermo: "Full Palermo Scale computation",
          advanced: "YSI + Keyhole + Corridor + Readiness",
        },
        example: "GET /api/object/2024%20YR4",
      },
      {
        path: "/api/approaches",
        method: "GET",
        summary: "Close approach data from NASA CAD",
        description:
          "Fetches all Earth close approaches within 0.05 AU for the next 100 years. " +
          "Returns per-object summaries with next approach date, distance, velocity, and MOID.",
        parameters: [
          { name: "des", in: "query", required: false, type: "string", description: "Specific object designation" },
        ],
        response: {
          approaches: "Array<CloseApproachSummary>",
          count: "number",
        },
        example: "GET /api/approaches?des=Apophis",
      },
      {
        path: "/api/deflect",
        method: "GET",
        summary: "Deflection Δv calculator with keyhole-aware safety check",
        description:
          "Computes the velocity change required to deflect an asteroid, " +
          "checks whether the deflection pushes it into a gravitational keyhole, " +
          "and computes the safe deflection cone.",
        parameters: [
          { name: "des", in: "query", required: true, type: "string" },
          { name: "method", in: "query", required: false, type: "string", enum: ["KINETIC", "GRAVITY_TRACTOR", "NUCLEAR_STANDOFF"] },
          { name: "warning", in: "query", required: false, type: "number", description: "Warning time (years)" },
          { name: "scMass", in: "query", required: false, type: "number", description: "Spacecraft mass (kg)" },
          { name: "scVel", in: "query", required: false, type: "number", description: "Impact velocity (km/s)" },
          { name: "beta", in: "query", required: false, type: "number", description: "Momentum enhancement factor" },
        ],
        response: {
          mission: "Δv achieved, miss distance, margin, launch lead time",
          keyholeSafety: "Safe/unsafe, danger keyholes, safe cone",
          asteroid: "Mass, diameter, energy comparisons",
          recommendation: "Actionable mission assessment",
        },
        example: "GET /api/deflect?des=2024%20YR4&method=KINETIC&warning=10&scMass=500",
      },
      {
        path: "/api/evolution",
        method: "GET",
        summary: "Risk evolution timeline + observation arc analysis",
        description:
          "Models how impact probability evolves over time, tracks observation arc quality, " +
          "computes loss date, and identifies Yarkovsky dominance time.",
        parameters: [
          { name: "des", in: "query", required: true, type: "string" },
        ],
        response: {
          observationArc: "Arc length, quality, U parameter, loss date",
          riskEvolution: "IP(t) timeline, trend, NASA-ESA divergence trend",
          current: "Current IP, diameter, Yarkovsky status",
        },
        example: "GET /api/evolution?des=Apophis",
      },
      {
        path: "/api/docs",
        method: "GET",
        summary: "This documentation",
        description: "Returns the full API documentation in JSON format.",
        parameters: [],
        example: "GET /api/docs",
      },
    ],
    rateLimiting: {
      policy: "100 requests per minute per IP",
      burst: "20 requests per second",
      note: "NASA/ESA upstream APIs have their own rate limits. Cache responses.",
    },
    dataSources: [
      { name: "NASA CNEOS Sentry-II", url: "https://ssd-api.jpl.nasa.gov/sentry.api", refresh: "Real-time" },
      { name: "NASA SBDB", url: "https://ssd-api.jpl.nasa.gov/sbdb.api", refresh: "Daily" },
      { name: "NASA CAD", url: "https://ssd-api.jpl.nasa.gov/cad.api", refresh: "Daily" },
      { name: "ESA NEOCC Risk List", url: "https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list", refresh: "Daily" },
      { name: "ESA Keplerian Catalogue", url: "https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat", refresh: "Weekly" },
    ],
    scientificReferences: [
      "Chesley et al. (2002) — Palermo Technical Impact Hazard Scale",
      "Vokrouhlický et al. (1998, 2000) — Yarkovsky diurnal thermal model",
      "Fenucci et al. (2024) §7.4 — NASA IOBS vs ESA LOV methodology",
      "Chodas (2015) — Gravitational keyhole theory",
      "Carusi et al. (2002) — Asteroid deflection Δv computation",
      "Thomas et al. (2023) — DART β = 3.61 ± 0.19",
      "Muinonen et al. (2001) — Monte Carlo orbital sampling",
      "NASA OIG IG-25-006 — Planetary defense strategic gaps",
    ],
    disclaimer:
      "This tool is for RESEARCH AND EDUCATIONAL purposes only. " +
      "It is NOT authorized for operational planetary defense decisions. " +
      "All risk assessments should be verified through official channels: " +
      "NASA CNEOS (https://cneos.jpl.nasa.gov) and ESA NEOCC (https://neo.ssa.esa.int).",
    engine: {
      version: "3.5.0",
      keplerSolver: "Newton-Raphson + Halley's, ε=10⁻¹⁴",
      yarkovskyModel: "Vokrouhlický 1998 diurnal thermal",
      keyholeModel: "Greenberg 2002 resonant return",
      deflectionModel: "Carusi 2002 + DART β calibration",
      corridorModel: "Chodas 2015 b-plane projection + Monte Carlo",
      consensusModel: "Weighted multi-component disagreement index",
    },
  };

  return NextResponse.json(docs, {
    headers: {
      "Cache-Control": "public, s-maxage=3600",
      "Content-Type": "application/json",
      "X-Engine-Version": "3.5.0",
    },
  });
}