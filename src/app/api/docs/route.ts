import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AEGIS·SENTRY v4.0 — Public REST API Documentation
 *
 * OpenAPI 3.1-style documentation for all engine endpoints.
 * Enables third-party integration, research reproducibility,
 * and institutional adoption.
 *
 * Rate limits:
 *   - Catalogue endpoints: 100 req/min, 20 burst
 *   - Compute endpoints:   30 req/min, 5 burst
 *   - Live feeds:          120 req/min, 30 burst
 *   - Collaboration:       60 req/min, 15 burst
 */
export async function GET() {
  const docs = {
    openapi: "3.1.0",
    info: {
      title: "AEGIS·SENTRY Planetary Defense Readiness Engine API",
      version: "4.0.0",
      description:
        "Real-time multi-agency asteroid risk divergence engine. " +
        "Compares NASA Sentry-II and ESA NEOCC/Aegis impact probability calculations. " +
        "Includes Yarkovsky sensitivity, gravitational keyhole detection, " +
        "impact corridor projection, deflection planning, Rubin LSST triage, " +
        "observatory integration, collaboration, and export.",
      contact: {
        name: "AEGIS·SENTRY Research",
        url: "https://aegis-sentry.vercel.app",
      },
      license: {
        name: "CC BY-NC 4.0 — Research Use Only",
        url: "https://creativecommons.org/licenses/by-nc/4.0/",
      },
    },
    servers: [
      {
        url: "https://aegis-sentry.vercel.app",
        description: "Production (Vercel, IAD1)",
      },
    ],
    paths: {
      "/api/threats": {
        get: {
          summary: "Full threat catalogue with multi-agency divergence",
          description:
            "Fetches NASA Sentry-II and ESA NEOCC risk lists, cross-matches objects, " +
            "computes Palermo Scale divergence, YSI, keyholes, corridors, readiness, " +
            "and consensus scores.",
          tags: ["Catalogue"],
          parameters: [],
          responses: {
            "200": {
              description: "Threat catalogue (up to 300 objects)",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { threats: { type: "array" }, metadata: { type: "object" } } },
                },
              },
            },
          },
          "x-rate-limit": "100/min, 20 burst",
        },
      },
      "/api/object/{designation}": {
        get: {
          summary: "Deep dossier for a single object",
          tags: ["Catalogue"],
          parameters: [
            { name: "designation", in: "path", required: true, schema: { type: "string" }, example: "2024 YR4" },
          ],
          "x-rate-limit": "60/min, 10 burst",
        },
      },
      "/api/approaches": {
        get: {
          summary: "Close approach data from NASA CAD",
          tags: ["Catalogue"],
          parameters: [
            { name: "des", in: "query", required: false, schema: { type: "string" } },
          ],
          "x-rate-limit": "100/min, 20 burst",
        },
      },
      "/api/deflect": {
        get: {
          summary: "Deflection Δv calculator with keyhole-aware safety check",
          tags: ["Computation"],
          parameters: [
            { name: "des", in: "query", required: true, schema: { type: "string" } },
            { name: "method", in: "query", schema: { type: "string", enum: ["KINETIC", "GRAVITY_TRACTOR", "NUCLEAR_STANDOFF"] } },
            { name: "warning", in: "query", schema: { type: "number" } },
            { name: "scMass", in: "query", schema: { type: "number" } },
            { name: "scVel", in: "query", schema: { type: "number" } },
            { name: "beta", in: "query", schema: { type: "number" } },
          ],
          "x-rate-limit": "30/min, 5 burst",
        },
      },
      "/api/evolution": {
        get: {
          summary: "Risk evolution timeline + observation arc analysis",
          tags: ["Computation"],
          parameters: [
            { name: "des", in: "query", required: true, schema: { type: "string" } },
          ],
          "x-rate-limit": "30/min, 5 burst",
        },
      },
      "/api/observatory": {
        get: {
          summary: "Live observatory alert feed",
          description:
            "Unified alert stream from NASA CAD, MPC NEACP, ATLAS, Rubin/LSST, " +
            "Pan-STARRS, and Catalina Sky Survey.",
          tags: ["Live Feeds"],
          parameters: [
            { name: "mode", in: "query", schema: { type: "string", enum: ["live", "simulated"] } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } },
          ],
          "x-rate-limit": "120/min, 30 burst",
        },
      },
      "/api/annotations": {
        get: {
          summary: "List annotations for an object",
          tags: ["Collaboration"],
          parameters: [
            { name: "des", in: "query", schema: { type: "string" } },
          ],
          "x-rate-limit": "60/min, 15 burst",
        },
        post: {
          summary: "Create a new annotation",
          tags: ["Collaboration"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["targetDesignation", "body", "author"],
                  properties: {
                    targetDesignation: { type: "string" },
                    type: { type: "string", enum: ["COMMENT", "RISK_ASSESSMENT", "OBSERVATION_LOG", "DEFLECTION_NOTE", "YARKOVSKY_NOTE", "KEYHOLE_NOTE", "CORRIDOR_NOTE", "FLAG", "RESOLUTION"] },
                    priority: { type: "string", enum: ["INFO", "LOW", "MODERATE", "HIGH", "CRITICAL"] },
                    author: { type: "string" },
                    authorRole: { type: "string" },
                    body: { type: "string", maxLength: 5000 },
                    tags: { type: "array", items: { type: "string" } },
                    parentId: { type: "string" },
                  },
                },
              },
            },
          },
          "x-rate-limit": "60/min, 15 burst",
        },
        patch: {
          summary: "Update an annotation",
          tags: ["Collaboration"],
          "x-rate-limit": "60/min, 15 burst",
        },
        delete: {
          summary: "Delete an annotation",
          tags: ["Collaboration"],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string" } },
          ],
          "x-rate-limit": "60/min, 15 burst",
        },
      },
      "/api/docs": {
        get: {
          summary: "This documentation",
          tags: ["Meta"],
        },
      },
    },
    components: {
      securitySchemes: {
        rateLimit: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Optional API key for higher rate limits (contact for access)",
        },
      },
    },
    rateLimiting: {
      policy: "Token bucket per IP",
      presets: {
        catalogue: "100 req/min, 20 burst",
        compute: "30 req/min, 5 burst",
        live: "120 req/min, 30 burst",
        collab: "60 req/min, 15 burst",
      },
      headers: [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After (on 429)",
      ],
    },
    dataSources: [
      { name: "NASA CNEOS Sentry-II", url: "https://ssd-api.jpl.nasa.gov/sentry.api", refresh: "Real-time" },
      { name: "NASA SBDB", url: "https://ssd-api.jpl.nasa.gov/sbdb.api", refresh: "Daily" },
      { name: "NASA CAD", url: "https://ssd-api.jpl.nasa.gov/cad.api", refresh: "Daily" },
      { name: "ESA NEOCC Risk List", url: "https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list", refresh: "Daily" },
      { name: "ESA Keplerian Catalogue", url: "https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat", refresh: "Weekly" },
      { name: "MPC NEACP", url: "https://www.minorplanetcenter.net/iau/NEACP.html", refresh: "Continuous" },
      { name: "ATLAS", url: "https://fallingstar-data.com/forcedphot/", refresh: "Nightly" },
      { name: "Rubin/LSST", url: "https://rubin-obs.lsst.io/", refresh: "Real-time (2026+)" },
    ],
    scientificReferences: [
      "Chesley et al. (2002) — Palermo Technical Impact Hazard Scale",
      "Vokrouhlický et al. (1998, 2000) — Yarkovsky diurnal thermal model",
      "Fenucci et al. (2024) §7.4 — NASA IOBS vs ESA LOV methodology",
      "Chodas (2015) — Gravitational keyhole theory",
      "Carusi et al. (2002) — Asteroid deflection Δv computation",
      "Thomas et al. (2023) — DART β = 3.61 ± 0.19",
      "Muinonen et al. (2001) — Monte Carlo orbital sampling",
      "Tonry et al. (2018) — ATLAS survey system",
      "Ivezić et al. (2019) — LSST reference design",
      "Wilkinson et al. (2016) — FAIR Data Principles",
      "W3C Web Annotation Data Model (2017)",
      "NASA OIG IG-25-006 — Planetary defense strategic gaps",
    ],
    disclaimer:
      "This tool is for RESEARCH AND EDUCATIONAL purposes only. " +
      "It is NOT authorized for operational planetary defense decisions. " +
      "All risk assessments should be verified through official channels: " +
      "NASA CNEOS (https://cneos.jpl.nasa.gov) and ESA NEOCC (https://neo.ssa.esa.int).",
    engine: {
      version: "4.0.0",
      keplerSolver: "Newton-Raphson + Halley's, ε=10⁻¹⁴",
      yarkovskyModel: "Vokrouhlický 1998 diurnal thermal",
      keyholeModel: "Greenberg 2002 resonant return",
      deflectionModel: "Carusi 2002 + DART β calibration",
      corridorModel: "Chodas 2015 b-plane projection + Monte Carlo",
      consensusModel: "Weighted multi-component disagreement index",
      rateLimiter: "Token bucket (RFC 6749 pattern)",
      pwa: "Service Worker + Web App Manifest",
    },
  };

  return NextResponse.json(docs, {
    headers: {
      "Cache-Control": "public, s-maxage=3600",
      "Content-Type": "application/json",
      "X-Engine-Version": "4.0.0",
    },
  });
}