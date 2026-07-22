/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Keplerian Orbital Mechanics Engine
 *
 * Newton-Raphson + Halley's method Kepler solver.
 * Full Euler rotation Rz(-Ω)·Rx(-i)·Rz(-ω) to heliocentric ecliptic J2000.
 * Supports elliptic, hyperbolic, and parabolic orbits.
 */

import {
  MU_SUN,
  AU_KM,
  SECONDS_PER_DAY,
  KEPLER_TOLERANCE,
  KEPLER_MAX_ITERATIONS,
  DEG_TO_RAD,
} from "./constants";
import { Vector3D, StateVector, KeplerianElements } from "./types";

export function solveKeplerEquation(
  M: number,
  e: number,
  tolerance: number = KEPLER_TOLERANCE
): number {
  let Mnorm = M % (2 * Math.PI);
  if (Mnorm > Math.PI) Mnorm -= 2 * Math.PI;
  if (Mnorm < -Math.PI) Mnorm += 2 * Math.PI;

  if (e < 1.0) {
    return solveKeplerElliptic(Mnorm, e, tolerance);
  } else if (e > 1.0) {
    return solveKeplerHyperbolic(Mnorm, e, tolerance);
  } else {
    return solveBarkerEquation(Mnorm);
  }
}

function solveKeplerElliptic(M: number, e: number, tol: number): number {
  let E: number;
  if (e < 0.8) {
    E = M + (e * Math.sin(M)) / (1 - Math.sin(M + e) + Math.sin(M));
  } else {
    E = Math.PI;
  }

  for (let iter = 0; iter < KEPLER_MAX_ITERATIONS; iter++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const f = E - e * sinE - M;
    const fPrime = 1 - e * cosE;
    let delta = f / fPrime;

    if (Math.abs(delta) < 0.1) {
      const fDoublePrime = e * sinE;
      delta = (2 * f * fPrime) / (2 * fPrime * fPrime - f * fDoublePrime);
    }

    E -= delta;
    if (Math.abs(delta) < tol) return E;
  }
  return E;
}

function solveKeplerHyperbolic(M: number, e: number, tol: number): number {
  let H = Math.asinh(M / e);
  for (let iter = 0; iter < KEPLER_MAX_ITERATIONS; iter++) {
    const sinhH = Math.sinh(H);
    const coshH = Math.cosh(H);
    const f = e * sinhH - H - M;
    const fPrime = e * coshH - 1;
    const delta = f / fPrime;
    H -= delta;
    if (Math.abs(delta) < tol) return H;
  }
  return H;
}

function solveBarkerEquation(M: number): number {
  const W = 3 * M;
  const Y = Math.cbrt(W + Math.sqrt(W * W + 1));
  const D = Y - 1 / Y;
  return 2 * Math.atan(D);
}

export function eccentricToTrueAnomaly(E: number, e: number): number {
  if (e < 1.0) {
    return 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );
  } else if (e > 1.0) {
    return 2 * Math.atan2(
      Math.sqrt(e + 1) * Math.sinh(E / 2),
      Math.sqrt(e - 1) * Math.cosh(E / 2)
    );
  } else {
    return E;
  }
}

export function computeRadius(
  semiMajorAxisKm: number,
  e: number,
  E: number
): number {
  if (e < 1.0) {
    return semiMajorAxisKm * (1 - e * Math.cos(E));
  } else if (e > 1.0) {
    return semiMajorAxisKm * (e * Math.cosh(E) - 1);
  } else {
    const q = semiMajorAxisKm;
    return q * (1 + Math.tan(E / 2) ** 2);
  }
}

export function propagateKeplerianToState(
  elements: KeplerianElements,
  targetEpochJD: number,
  daDtAUDay: number = 0
): StateVector {
  const aAU = elements.semiMajorAxisAU;
  const e = elements.eccentricity;
  const i = elements.inclinationRad;
  const Omega = elements.longitudeAscendingNodeRad;
  const omega = elements.argumentOfPerihelionRad;
  const M0 = elements.meanAnomalyAtEpochRad;
  const epochJD = elements.epochJD;

  const deltaTDays = targetEpochJD - epochJD;
  const deltaTSeconds = deltaTDays * SECONDS_PER_DAY;

  const aAUDrifted = aAU + daDtAUDay * deltaTDays;
  const aKm = aAUDrifted * AU_KM;

  const n = Math.sqrt(MU_SUN / Math.pow(aKm, 3));
  const M = M0 + n * deltaTSeconds;

  const E = solveKeplerEquation(M, e);
  const nu = eccentricToTrueAnomaly(E, e);
  const r = computeRadius(aKm, e, E);

  const xPeri = r * Math.cos(nu);
  const yPeri = r * Math.sin(nu);

  const p = aKm * (1 - e * e);
  const h = Math.sqrt(MU_SUN * Math.abs(p));
  const vxPeri = -(MU_SUN / h) * Math.sin(nu);
  const vyPeri = (MU_SUN / h) * (e + Math.cos(nu));

  const cosO = Math.cos(Omega);
  const sinO = Math.sin(Omega);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);

  const R11 = cosO * cosw - sinO * sinw * cosi;
  const R12 = -cosO * sinw - sinO * cosw * cosi;
  const R21 = sinO * cosw + cosO * sinw * cosi;
  const R22 = -sinO * sinw + cosO * cosw * cosi;
  const R31 = sinw * sini;
  const R32 = cosw * sini;

  const position: Vector3D = {
    x: R11 * xPeri + R12 * yPeri,
    y: R21 * xPeri + R22 * yPeri,
    z: R31 * xPeri + R32 * yPeri,
  };

  const velocity: Vector3D = {
    x: R11 * vxPeri + R12 * vyPeri,
    y: R21 * vxPeri + R22 * vyPeri,
    z: R31 * vxPeri + R32 * vyPeri,
  };

  return { position, velocity };
}

export function propagateKeplerianToPosition(
  elements: KeplerianElements,
  targetEpochJD: number,
  daDtAUDay: number = 0
): Vector3D {
  const state = propagateKeplerianToState(elements, targetEpochJD, daDtAUDay);
  return state.position;
}

export function computeOrbitalPeriodDays(semiMajorAxisAU: number): number {
  const aKm = semiMajorAxisAU * AU_KM;
  const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(aKm, 3) / MU_SUN);
  return periodSeconds / SECONDS_PER_DAY;
}

export function mjdToJD(mjd: number): number {
  return mjd + 2400000.5;
}

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function vectorDistance(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vectorMagnitude(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}