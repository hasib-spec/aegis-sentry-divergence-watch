/**
 * AEGIS-SENTRY v3.1 — Minimum Orbit Intersection Distance (MOID)
 *
 * Computes the minimum distance between an asteroid's orbit and
 * Earth's orbit. MOID < 0.05 AU is the NEO definition threshold.
 *
 * Method: Sample both orbits at N points, find minimum 3D distance.
 * Reference: Sitarski (1968), "Close encounters with minor planets"
 *
 * MOID is the SINGLE most important geometric risk indicator:
 * - MOID > 0.05 AU: Not a NEO
 * - MOID < 0.05 AU: Potential Earth-crosser
 * - MOID < 0.005 AU: PHA (Potentially Hazardous Asteroid)
 * - MOID < 0.0001 AU: Extreme risk (within Earth's radius)
 */

import { KeplerianElements } from "./types";
import { AU_KM } from "./constants";

export interface MOIDResult {
  moidAU: number;
  moidKm: number;
  asteroidTrueAnomalyAtMOID: number;
  earthTrueAnomalyAtMOID: number;
  classification: "PHA" | "NEO" | "NON_NEO";
  isEarthCrossing: boolean;
}

const EARTH_A_AU = 1.00000011;
const EARTH_E = 0.01671022;

function orbitPosition(
  aAU: number,
  e: number,
  iRad: number,
  omegaRad: number,
  wRad: number,
  nu: number
): [number, number, number] {
  const r = (aAU * (1 - e * e)) / (1 + e * Math.cos(nu));

  // Perifocal coordinates
  const xPeri = r * Math.cos(nu);
  const yPeri = r * Math.sin(nu);

  // Rotation to ecliptic
  const cosO = Math.cos(omegaRad);
  const sinO = Math.sin(omegaRad);
  const cosi = Math.cos(iRad);
  const sini = Math.sin(iRad);
  const cosw = Math.cos(wRad);
  const sinw = Math.sin(wRad);

  const x = (cosO * cosw - sinO * sinw * cosi) * xPeri + (-cosO * sinw - sinO * cosw * cosi) * yPeri;
  const y = (sinO * cosw + cosO * sinw * cosi) * xPeri + (-sinO * sinw + cosO * cosw * cosi) * yPeri;
  const z = (sinw * sini) * xPeri + (cosw * sini) * yPeri;

  return [x, y, z];
}

export function computeMOID(elements: KeplerianElements): MOIDResult {
  const N = 720; // Sample points (0.5° resolution)
  let minDist = Infinity;
  let astNuAtMin = 0;
  let earthNuAtMin = 0;

  for (let i = 0; i < N; i++) {
    const astNu = (i / N) * 2 * Math.PI;
    const [ax, ay, az] = orbitPosition(
      elements.semiMajorAxisAU,
      elements.eccentricity,
      elements.inclinationRad,
      elements.longitudeAscendingNodeRad,
      elements.argumentOfPerihelionRad,
      astNu
    );

    for (let j = 0; j < N; j++) {
      const earthNu = (j / N) * 2 * Math.PI;
      const [ex, ey, ez] = orbitPosition(EARTH_A_AU, EARTH_E, 0, 0, 0, earthNu);

      const dx = ax - ex;
      const dy = ay - ey;
      const dz = az - ez;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < minDist) {
        minDist = dist;
        astNuAtMin = astNu;
        earthNuAtMin = earthNu;
      }
    }
  }

  // Refine with local search around minimum
  const refineN = 100;
  const astStep = (2 * Math.PI) / N;
  const earthStep = (2 * Math.PI) / N;

  for (let i = -refineN; i <= refineN; i++) {
    const astNu = astNuAtMin + (i / refineN) * astStep;
    const [ax, ay, az] = orbitPosition(
      elements.semiMajorAxisAU,
      elements.eccentricity,
      elements.inclinationRad,
      elements.longitudeAscendingNodeRad,
      elements.argumentOfPerihelionRad,
      astNu
    );

    for (let j = -refineN; j <= refineN; j++) {
      const earthNu = earthNuAtMin + (j / refineN) * earthStep;
      const [ex, ey, ez] = orbitPosition(EARTH_A_AU, EARTH_E, 0, 0, 0, earthNu);

      const dx = ax - ex;
      const dy = ay - ey;
      const dz = az - ez;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < minDist) {
        minDist = dist;
        astNuAtMin = astNu;
        earthNuAtMin = earthNu;
      }
    }
  }

  const moidAU = minDist;
  const moidKm = moidAU * AU_KM;

  let classification: MOIDResult["classification"];
  if (moidAU < 0.05 && elements.semiMajorAxisAU > 0.5) {
    classification = moidAU < 0.005 ? "PHA" : "NEO";
  } else {
    classification = "NON_NEO";
  }

  return {
    moidAU,
    moidKm,
    asteroidTrueAnomalyAtMOID: astNuAtMin,
    earthTrueAnomalyAtMOID: earthNuAtMin,
    classification,
    isEarthCrossing: moidAU < 0.05,
  };
}

/** Fast MOID estimate using perihelion/aphelion crossing check */
export function quickMOIDEstimate(elements: KeplerianElements): number {
  const q = elements.semiMajorAxisAU * (1 - elements.eccentricity);
  const Q = elements.semiMajorAxisAU * (1 + elements.eccentricity);

  // If orbit doesn't cross 1 AU, MOID is at least the gap
  if (Q < 1.0) return 1.0 - Q;
  if (q > 1.0) return q - 1.0;

  // Orbit crosses Earth's orbital radius — MOID depends on inclination
  // Approximate: MOID ≈ a * (1-cos(i)) for low-e orbits crossing 1 AU
  const iRad = elements.inclinationRad;
  return elements.semiMajorAxisAU * (1 - Math.cos(iRad)) * 0.5;
}