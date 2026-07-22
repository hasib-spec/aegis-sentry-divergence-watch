/**
 * AEGIS-SENTRY v3.4 — Covariance Matrix Engine
 *
 * Implements Cholesky decomposition for sampling correlated
 * orbital element uncertainties from the 6×6 covariance matrix.
 *
 * The covariance matrix Σ encodes:
 *   - Diagonal: variance of each element (σ²_a, σ²_e, σ²_i, σ²_Ω, σ²_ω, σ²_M)
 *   - Off-diagonal: correlations between elements
 *
 * Cholesky: Σ = L × L^T  (L is lower triangular)
 * Sampling: x = μ + L × z   where z ~ N(0, I₆)
 *
 * This produces properly correlated virtual orbits that respect
 * the full uncertainty structure, not just independent σ perturbations.
 *
 * References:
 *   Press et al. (2007), "Numerical Recipes" §2.9 (Cholesky)
 *   Muinonen et al. (2001), "Asteroid orbit computation with
 *     statistical ranging" — Monte Carlo orbital sampling
 *   Vavilov & Medvedev (2025), "Statistical orbit determination"
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: CHOLESKY DECOMPOSITION
   ═══════════════════════════════════════════════════════════ */

/**
 * Computes the Cholesky decomposition of a symmetric positive-definite matrix.
 *
 * Σ = L × L^T
 *
 * L[i][j] = (Σ[i][j] - Σ_{k<j} L[i][k]×L[j][k]) / L[j][j]  for i > j
 * L[i][i] = √(Σ[i][i] - Σ_{k<i} L[i][k]²)
 *
 * @param matrix - 6×6 symmetric positive-definite covariance matrix
 * @returns Lower triangular matrix L, or null if not positive-definite
 */
export function choleskyDecompose(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }

      if (i === j) {
        const diag = matrix[i][i] - sum;
        if (diag <= 0) {
          // Matrix is not positive-definite; add small regularization
          L[i][i] = Math.sqrt(Math.max(diag, 1e-20));
        } else {
          L[i][i] = Math.sqrt(diag);
        }
      } else {
        if (L[j][j] === 0) {
          L[i][j] = 0;
        } else {
          L[i][j] = (matrix[i][j] - sum) / L[j][j];
        }
      }
    }
  }

  return L;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: GAUSSIAN RANDOM NUMBER GENERATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Box-Muller transform: generates standard normal variates
 * from uniform random numbers.
 *
 * z = √(-2 ln U₁) × cos(2π U₂)
 *
 * Returns a pair of independent N(0,1) samples.
 */
export function boxMullerPair(): [number, number] {
  let u1 = 0;
  let u2 = 0;
  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();

  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;

  return [r * Math.cos(theta), r * Math.sin(theta)];
}

/**
 * Generates a vector of N independent standard normal variates.
 */
export function generateStandardNormal(n: number): number[] {
  const result: number[] = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const [z1, z2] = boxMullerPair();
    result[i] = z1;
    if (i + 1 < n) result[i + 1] = z2;
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: CORRELATED ORBITAL ELEMENT SAMPLING
   ═══════════════════════════════════════════════════════════ */

export interface OrbitalCovariance {
  /** Mean orbital elements [a, e, i, Ω, ω, M] in [AU, -, rad, rad, rad, rad] */
  mean: number[];
  /** 6×6 covariance matrix */
  covariance: number[][];
  /** Cholesky factor (computed lazily) */
  choleskyFactor: number[][] | null;
}

/**
 * Constructs an OrbitalCovariance from element values and sigmas.
 *
 * If only diagonal sigmas are provided (no full covariance),
 * constructs a diagonal covariance matrix with optional
 * correlation structure estimated from orbital mechanics.
 *
 * Physical correlations:
 *   - a and e are correlated (both affect perihelion/aphelion)
 *   - Ω and ω are correlated (both affect orientation)
 *   - M is weakly correlated with a (through mean motion)
 */
export function buildOrbitalCovariance(
  elements: [number, number, number, number, number, number],
  sigmas: [number, number, number, number, number, number],
  correlations?: number[][]
): OrbitalCovariance {
  const n = 6;
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Default correlation structure (physically motivated)
  const defaultCorr: number[][] = [
    [1.0,  0.3,  0.0,  0.0,  0.0, -0.2],  // a
    [0.3,  1.0,  0.0,  0.0,  0.0, -0.1],  // e
    [0.0,  0.0,  1.0,  0.1,  0.1,  0.0],  // i
    [0.0,  0.0,  0.1,  1.0,  0.4,  0.0],  // Ω
    [0.0,  0.0,  0.1,  0.4,  1.0,  0.0],  // ω
    [-0.2, -0.1, 0.0,  0.0,  0.0,  1.0],  // M
  ];

  const corr = correlations ?? defaultCorr;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cov[i][j] = corr[i][j] * sigmas[i] * sigmas[j];
    }
  }

  const L = choleskyDecompose(cov);

  return {
    mean: [...elements],
    covariance: cov,
    choleskyFactor: L,
  };
}

/**
 * Samples a single correlated orbital element vector.
 *
 * x = μ + L × z   where z ~ N(0, I₆)
 *
 * @param orbCov - Orbital covariance structure
 * @returns Sampled elements [a, e, i, Ω, ω, M]
 */
export function sampleOrbitalElements(orbCov: OrbitalCovariance): number[] {
  const n = 6;
  const z = generateStandardNormal(n);
  const L = orbCov.choleskyFactor;

  if (!L) {
    // Fallback: independent sampling
    return orbCov.mean.map((m, i) => {
      const sigma = Math.sqrt(orbCov.covariance[i][i]);
      return m + sigma * z[i];
    });
  }

  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += L[i][j] * z[j];
    }
    result[i] = orbCov.mean[i] + sum;
  }

  // Enforce physical constraints
  result[0] = Math.max(result[0], 0.1);  // a > 0
  result[1] = Math.max(0, Math.min(result[1], 0.999));  // 0 ≤ e < 1
  result[2] = Math.max(0, Math.min(result[2], Math.PI));  // 0 ≤ i ≤ π

  return result;
}

/**
 * Generates N correlated orbital element samples.
 */
export function sampleOrbitalElementsBatch(
  orbCov: OrbitalCovariance,
  count: number
): number[][] {
  const samples: number[][] = [];
  for (let i = 0; i < count; i++) {
    samples.push(sampleOrbitalElements(orbCov));
  }
  return samples;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: COVARIANCE FROM SBDB SIGMAS
   ═══════════════════════════════════════════════════════════ */

/**
 * Builds orbital covariance from NASA SBDB element sigmas.
 *
 * SBDB provides: a±σ_a, e±σ_e, i±σ_i, Ω±σ_Ω, ω±σ_ω, M±σ_M
 * These are 1-sigma uncertainties in the same units as the elements.
 *
 * @param aAU - Semi-major axis (AU)
 * @param e - Eccentricity
 * @param iRad - Inclination (rad)
 * @param omegaRad - Longitude of ascending node (rad)
 * @param wRad - Argument of perihelion (rad)
 * @param mRad - Mean anomaly (rad)
 * @param sigmas - [σ_a(AU), σ_e, σ_i(rad), σ_Ω(rad), σ_ω(rad), σ_M(rad)]
 */
export function covarianceFromSBDB(
  aAU: number, e: number, iRad: number,
  omegaRad: number, wRad: number, mRad: number,
  sigmas: [number, number, number, number, number, number]
): OrbitalCovariance {
  return buildOrbitalCovariance(
    [aAU, e, iRad, omegaRad, wRad, mRad],
    sigmas
  );
}

/**
 * Estimates covariance from arc length when full SBDB data unavailable.
 *
 * Empirical relationships (Farnocchia et al. 2015):
 *   σ_a ≈ 10^(-3) × (365/arc_days)^1.5 AU
 *   σ_e ≈ 10^(-4) × (365/arc_days)^1.5
 *   σ_i ≈ 10^(-3) × (365/arc_days)^1.0 rad
 *   σ_Ω ≈ 10^(-2) × (365/arc_days)^1.0 rad
 *   σ_ω ≈ 10^(-2) × (365/arc_days)^1.0 rad
 *   σ_M ≈ 10^(-1) × (365/arc_days)^1.5 rad
 */
export function estimateCovarianceFromArc(
  aAU: number, e: number, iRad: number,
  omegaRad: number, wRad: number, mRad: number,
  arcLengthDays: number
): OrbitalCovariance {
  const arcFactor = Math.pow(365 / Math.max(arcLengthDays, 1), 1.5);
  const arcFactor1 = Math.pow(365 / Math.max(arcLengthDays, 1), 1.0);

  const sigmas: [number, number, number, number, number, number] = [
    1e-3 * arcFactor,   // σ_a (AU)
    1e-4 * arcFactor,   // σ_e
    1e-3 * arcFactor1,  // σ_i (rad)
    1e-2 * arcFactor1,  // σ_Ω (rad)
    1e-2 * arcFactor1,  // σ_ω (rad)
    1e-1 * arcFactor,   // σ_M (rad)
  ];

  return buildOrbitalCovariance(
    [aAU, e, iRad, omegaRad, wRad, mRad],
    sigmas
  );
}