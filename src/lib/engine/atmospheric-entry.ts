/**
 * AEGIS-SENTRY v3.1 — Atmospheric Entry Physics
 *
 * Determines whether an impactor will:
 * - Airburst (disintegrate in atmosphere)
 * - Reach the ground (crater-forming)
 * - Cause regional vs global effects
 *
 * Reference: Chyba et al. (1993), "Deflection and fragmentation of
 *            near-Earth asteroids"; Collins et al. (2005) "Earth Impact
 *            Effects Program"
 *
 * Key physics:
 * - Ram pressure at altitude h: P = ρ_atm(h) × v²
 * - Fragmentation when P > material strength (1-10 MPa for stony)
 * - Airburst altitude depends on size, speed, angle, strength
 */

export interface EntryResult {
  willAirburst: boolean;
  airburstAltitudeKm: number;
  peakOverpressureKPa: number;
  thermalRadiationKm: number;
  craterDiameterKm: number;
  ejectaThicknessKm: number;
  seismicMagnitude: number;
  effectRadius: "LOCAL" | "REGIONAL" | "CONTINENTAL" | "GLOBAL";
  comparisonEvent: string;
  groundImpactEnergyMt: number;
}

const ATMOSPHERE_SCALE_HEIGHT = 8.5; // km
const SEA_LEVEL_DENSITY = 1.225; // kg/m³
const STONY_STRENGTH_MPA = 5; // MPa (typical stony asteroid)
const IRON_STRENGTH_MPA = 50; // MPa

function atmosphericDensity(altitudeKm: number): number {
  return SEA_LEVEL_DENSITY * Math.exp(-altitudeKm / ATMOSPHERE_SCALE_HEIGHT);
}

export function computeAtmosphericEntry(
  diameterKm: number,
  velocityKmS: number,
  entryAngleDeg: number,
  densityKgM3: number = 2600
): EntryResult {
  const diameterM = diameterKm * 1000;
  const velocityMs = velocityKmS * 1000;
  const angleRad = Math.max(entryAngleDeg * Math.PI / 180, 0.1);
  const sinAngle = Math.sin(angleRad);

  // Kinetic energy
  const volume = (4 / 3) * Math.PI * Math.pow(diameterM / 2, 3);
  const mass = densityKgM3 * volume;
  const energyJ = 0.5 * mass * velocityMs * velocityMs;
  const energyMt = energyJ / 4.184e15;

  // Fragmentation altitude: where ram pressure = material strength
  // P_ram = ρ_atm × v² = strength
  // ρ_atm = strength / v²
  const strengthPa = STONY_STRENGTH_MPA * 1e6;
  const criticalDensity = strengthPa / (velocityMs * velocityMs);

  // Solve for altitude: ρ₀ × exp(-h/H) = criticalDensity
  let airburstAltKm = 0;
  if (criticalDensity < SEA_LEVEL_DENSITY) {
    airburstAltKm = -ATMOSPHERE_SCALE_HEIGHT * Math.log(criticalDensity / SEA_LEVEL_DENSITY);
  }

  // Will it airburst? (small objects disintegrate, large ones reach ground)
  // Threshold: ~50m stony objects typically airburst; larger reach ground
  const willAirburst = diameterM < 100 && airburstAltKm > 5;

  // Ground impact energy (reduced if airburst)
  const groundEnergyMt = willAirburst ? energyMt * 0.1 : energyMt;

  // Peak overpressure at ground (simplified point-source model)
  // ΔP ≈ 0.1 × (E / d³)^(1/3) for distance d from burst
  const burstHeight = willAirburst ? airburstAltKm * 1000 : 0;
  const peakOverpressureKPa = willAirburst
    ? 0.1 * Math.pow(groundEnergyMt * 4.184e15 / Math.pow(burstHeight + 1000, 3), 1 / 3) / 1000
    : 1000; // Ground impact: extreme

  // Thermal radiation radius (3rd degree burns: ~10 kW/m² for 10s)
  const thermalRadiationKm = Math.pow(groundEnergyMt, 0.4) * 2;

  // Crater diameter (Pi-scaling, simplified)
  // D_crater ≈ 1.8 × (E/ρ_target)^(1/3.4) for simple craters
  const craterDiameterKm = willAirburst
    ? 0
    : 1.8 * Math.pow(groundEnergyMt * 4.184e15 / 2700, 1 / 3.4) / 1000;

  // Seismic magnitude (approximate)
  const seismicMagnitude = groundEnergyMt > 0
    ? 0.67 * Math.log10(groundEnergyMt * 4.184e15) - 5.87
    : 0;

  // Effect classification
  let effectRadius: EntryResult["effectRadius"];
  if (groundEnergyMt < 0.001) effectRadius = "LOCAL";
  else if (groundEnergyMt < 1) effectRadius = "REGIONAL";
  else if (groundEnergyMt < 1000) effectRadius = "CONTINENTAL";
  else effectRadius = "GLOBAL";

  // Historical comparison
  let comparisonEvent: string;
  if (groundEnergyMt < 0.0005) comparisonEvent = "Fireball (no damage)";
  else if (groundEnergyMt < 0.02) comparisonEvent = "Chelyabinsk 2013 (~500 kt)";
  else if (groundEnergyMt < 0.5) comparisonEvent = "Tunguska-class (~10-15 Mt)";
  else if (groundEnergyMt < 10) comparisonEvent = "City-killer (~100 Mt+)";
  else if (groundEnergyMt < 1000) comparisonEvent = "Regional devastation (100+ Mt)";
  else if (groundEnergyMt < 1e6) comparisonEvent = "Civilization-threat (>1 Gt)";
  else comparisonEvent = "Chicxulub-class (>1000 Gt)";

  return {
    willAirburst,
    airburstAltitudeKm: willAirburst ? airburstAltKm : 0,
    peakOverpressureKPa,
    thermalRadiationKm,
    craterDiameterKm,
    ejectaThicknessKm: craterDiameterKm > 0 ? craterDiameterKm * 0.01 : 0,
    seismicMagnitude: Math.max(0, seismicMagnitude),
    effectRadius,
    comparisonEvent,
    groundImpactEnergyMt: groundEnergyMt,
  };
}