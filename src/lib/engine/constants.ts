/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Physical Constants — IAU 2015 Resolution B3, JPL DE440, Palermo Scale (Chesley et al. 2002)
 */

/** Sun gravitational parameter μ☉ (km³/s²) — JPL DE440 */
export const MU_SUN = 1.32712440041e11;

/** Earth gravitational parameter μ⊕ (km³/s²) */
export const MU_EARTH = 3.986004418e5;

/** Astronomical Unit (km) — IAU 2012 exact */
export const AU_KM = 1.495978707e8;

/** Earth equatorial radius (km) */
export const EARTH_RADIUS_KM = 6378.137;

/** Earth radius with atmosphere allowance (km) — Sentry convention */
export const EARTH_RADIUS_WITH_ATMOS_KM = 6420.0;

/** Speed of light (km/s) */
export const SPEED_OF_LIGHT_KMS = 299792.458;

/** Stefan-Boltzmann constant (W/m²/K⁴) */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Solar luminosity (W) — IAU 2015 */
export const SOLAR_LUMINOSITY = 3.828e26;

/** Solar radiation flux at 1 AU (W/m²) */
export const SOLAR_FLUX_1AU =
  SOLAR_LUMINOSITY / (4 * Math.PI * Math.pow(AU_KM * 1000, 2));

/** Megaton TNT equivalent (Joules) */
export const MT_TNT_JOULES = 4.184e15;

/** Default asteroid bulk density (kg/m³) — Palermo Scale convention */
export const DEFAULT_DENSITY_KG_M3 = 2600.0;

/** Default visual albedo for diameter estimation */
export const DEFAULT_ALBEDO = 0.154;

/** Julian Date of J2000.0 epoch */
export const JD_J2000 = 2451545.0;

/** MJD offset: MJD = JD - 2400000.5 */
export const MJD_OFFSET = 2400000.5;

/** Seconds per day */
export const SECONDS_PER_DAY = 86400.0;

/** Degrees to radians */
export const DEG_TO_RAD = Math.PI / 180.0;

/** Radians to degrees */
export const RAD_TO_DEG = 180.0 / Math.PI;

/** Palermo Scale background frequency: f_B = 0.03 × E^(-4/5) yr⁻¹ */
export const PALERMO_FB_COEFFICIENT = 0.03;
export const PALERMO_FB_EXPONENT = -0.8;

/** Yarkovsky typical da/dt range (AU/Myr) */
export const YARKOVSKY_DA_DT_TYPICAL_MIN = 1e-4;
export const YARKOVSKY_DA_DT_TYPICAL_MAX = 1e-3;

/** Yarkovsky thermal model defaults — Vokrouhlický et al. (2000) */
export const YARKOVSKY_DEFAULT_CONDUCTIVITY = 0.01;
export const YARKOVSKY_DEFAULT_HEAT_CAPACITY = 800.0;
export const YARKOVSKY_DEFAULT_SURFACE_DENSITY = 1500.0;
export const YARKOVSKY_DEFAULT_ROTATION_PERIOD_H = 8.0;
export const YARKOVSKY_DEFAULT_OBLIQUITY_DEG = 45.0;
export const YARKOVSKY_DEFAULT_ABSORPTIVITY = 0.9;

/** Kepler solver convergence */
export const KEPLER_TOLERANCE = 1e-14;
export const KEPLER_MAX_ITERATIONS = 100;

/** Gravitational constant G (m³ kg⁻¹ s⁻²) */
export const G_NEWTON = 6.67430e-11;