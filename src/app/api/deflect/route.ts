import { NextRequest, NextResponse } from "next/server";
import { runDeflectionAnalysis, computeMinimumWarningTime, computeMinimumSpacecraftMass, computeAsteroidMass, DeflectionMethod } from "@/lib/engine/deflection";
import { computeKeyholes } from "@/lib/engine/keyhole";
import { computeOrbitalPeriodDays } from "@/lib/engine/kepler";
import { EARTH_RADIUS_KM, AU_KM, MU_SUN, DEG_TO_RAD } from "@/lib/engine/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api";
const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const des = searchParams.get("des");
  const method = (searchParams.get("method") || "KINETIC") as DeflectionMethod;
  const warningYears = parseFloat(searchParams.get("warning") || "10");
  const scMass = parseFloat(searchParams.get("scMass") || "500");
  const scVel = parseFloat(searchParams.get("scVel") || "10");
  const beta = parseFloat(searchParams.get("beta") || "3.6");
  const gtMass = parseFloat(searchParams.get("gtMass") || "10000");
  const gtHover = parseFloat(searchParams.get("gtHover") || "1");
  const gtDuration = parseFloat(searchParams.get("gtDuration") || "7");
  const nucYield = parseFloat(searchParams.get("nucYield") || "1");
  const nucCoupling = parseFloat(searchParams.get("nucCoupling") || "0.01");
  const nucEjecta = parseFloat(searchParams.get("nucEjecta") || "3");

  if (!des) {
    return NextResponse.json({ error: "Missing 'des' parameter" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Fetch orbital elements + physical params from SBDB
    const [sbdbRes, sentryRes] = await Promise.allSettled([
      fetch(`${NASA_SBDB_URL}?sstr=${encodeURIComponent(des)}&full-prec=1&phys-par=1`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      fetch(`${NASA_SENTRY_URL}?des=${encodeURIComponent(des)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
    ]);
    clearTimeout(timeout);

    let semiMajorAxisAU = 1.5;
    let eccentricity = 0.3;
    let inclinationRad = 10 * DEG_TO_RAD;
    let diameterKm = 0.05;
    let vInfKmS = 15;
    let densityKgM3 = 2600;

    if (sbdbRes.status === "fulfilled" && sbdbRes.value.ok) {
      const sbdb = await sbdbRes.value.json();
      if (sbdb.orbit?.elements) {
        const elemMap = new Map<string, number>();
        for (const el of sbdb.orbit.elements) {
          elemMap.set(el.name, parseFloat(el.value));
        }
        semiMajorAxisAU = elemMap.get("a") || 1.5;
        eccentricity = elemMap.get("e") || 0.3;
        inclinationRad = (elemMap.get("i") || 10) * DEG_TO_RAD;
      }
      if (sbdb.phys_par) {
        const diam = sbdb.phys_par.find((p: { name: string }) => p.name === "diameter");
        if (diam) diameterKm = parseFloat(diam.value) / 1000;
        const dens = sbdb.phys_par.find((p: { name: string }) => p.name === "density");
        if (dens) densityKgM3 = parseFloat(dens.value);
      }
    }

    if (sentryRes.status === "fulfilled" && sentryRes.value.ok) {
      const sentry = await sentryRes.value.json();
      if (sentry.data && sentry.data.length > 0) {
        vInfKmS = parseFloat(sentry.data[0].v_inf) || 15;
        const diamStr = sentry.data[0].diameter;
        if (diamStr) diameterKm = parseFloat(diamStr) || diameterKm;
      }
    }

    // Compute keyholes for this object
    const periodYears = computeOrbitalPeriodDays(semiMajorAxisAU) / 365.25;
    const missDistanceKm = EARTH_RADIUS_KM * 3; // Nominal close approach
    const keyholes = computeKeyholes(vInfKmS, missDistanceKm, periodYears, 60);

    // Run full deflection analysis
    const result = runDeflectionAnalysis({
      designation: des,
      diameterKm,
      semiMajorAxisAU,
      eccentricity,
      inclinationRad,
      vInfKmS,
      warningTimeYears: warningYears,
      method,
      kinetic: { spacecraftMassKg: scMass, impactVelocityKmS: scVel, beta },
      gravityTractor: { spacecraftMassKg: gtMass, hoverDistanceKm: gtHover, durationYears: gtDuration },
      nuclear: { yieldMt: nucYield, couplingEfficiency: nucCoupling, ejectaVelocityKmS: nucEjecta, standoffDistanceKm: diameterKm * 3 },
      keyholes,
      densityKgM3,
      safeMissEarthRadii: 2,
    });

    // Additional: compute minimum warning time and minimum SC mass
    const asteroidMassKg = computeAsteroidMass(diameterKm, densityKgM3);
    const minWarningKinetic = computeMinimumWarningTime(
      (scMass * scVel * beta * 1000) / (asteroidMassKg * 1000),
      semiMajorAxisAU
    );
    const deltaVReq = result.mission.deltaVRequiredKmS;
    const minScMass = computeMinimumSpacecraftMass(deltaVReq, asteroidMassKg, scVel, beta);

    return NextResponse.json({
      ...result,
      orbitalElements: { semiMajorAxisAU, eccentricity, inclinationDeg: inclinationRad / DEG_TO_RAD },
      vInfKmS,
      keyholeCount: keyholes.length,
      minWarningTimeYears: {
        kinetic: minWarningKinetic,
        gravityTractor: minWarningKinetic * 3,
        nuclear: minWarningKinetic * 0.3,
      },
      minSpacecraftMassKg: minScMass,
      allMethodsComparison: {
        kinetic: {
          deltaV: (scMass * scVel * beta * 1000) / (asteroidMassKg * 1000),
          missER: result.mission.missDistanceEarthRadii,
        },
        gravityTractor: {
          deltaV: (6.674e-11 * gtMass * gtDuration * 365.25 * 86400) / Math.pow(gtHover * 1000, 2) / 1000,
          missER: 0,
        },
        nuclear: {
          deltaV: 0,
          missER: 0,
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deflection analysis failed", designation: des },
      { status: 500 }
    );
  }
}