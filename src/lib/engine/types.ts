/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Type Definitions
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface StateVector {
  position: Vector3D;
  velocity: Vector3D;
}

export interface KeplerianElements {
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationRad: number;
  longitudeAscendingNodeRad: number;
  argumentOfPerihelionRad: number;
  meanAnomalyAtEpochRad: number;
  epochJD: number;
  absoluteMagnitudeH?: number;
  slopeParameterG?: number;
  nonGravFlag?: number;
}

export interface KeplerianWithCovariance extends KeplerianElements {
  sigmas: [number, number, number, number, number, number];
  covarianceVector?: number[];
  nonGravParams?: {
    A1?: number;
    A2?: number;
    A3?: number;
  };
}

export interface NasaSentryRecord {
  des: string;
  fullname: string;
  diameter: string;
  h: string;
  id: string;
  ip: string;
  last_obs: string;
  last_obs_jd: string;
  n_imp: string;
  ps_cum: string;
  ps_max: string;
  range: string;
  ts_max: string;
  v_inf: string;
}

export interface EsaRiskRecord {
  designation: string;
  name: string;
  diameter_m: number;
  diameterEstimated: boolean;
  viMaxDate: string;
  ipMax: number;
  psMax: number;
  torinoScale: number;
  velocityKmS: number;
  yearsRange: string;
  ipCum: number;
  psCum: number;
}

export interface EsaKeplerianRecord {
  designation: string;
  epochMJD: number;
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeNodeDeg: number;
  argumentPericenterDeg: number;
  meanAnomalyDeg: number;
  absoluteMagnitudeH: number;
  slopeParameterG: number;
  nonGravFlag: number;
}

export interface DivergenceMetrics {
  designation: string;
  fullname: string;
  nasa: {
    ip: number;
    psCum: number;
    psMax: number;
    tsMax: number;
    vInfKmS: number;
    vImpKmS: number;
    diameterKm: number;
    energyMt: number;
    massKg: number;
    nImp: number;
    range: string;
    method: string;
    elements: KeplerianWithCovariance | null;
    hasNonGrav: boolean;
  };
  esa: {
    ipCum: number;
    ipMax: number;
    psCum: number;
    psMax: number;
    torinoScale: number;
    velocityKmS: number;
    diameterM: number;
    yearsRange: string;
    viMaxDate: string;
    elements: KeplerianElements | null;
    hasNonGrav: boolean;
  };
  spatialDivergenceKm: number;
  probabilityRatio: number;
  probabilityDeltaAbs: number;
  palermoDelta: number;
  palermoNasaRecomputed: number;
  palermoEsaRecomputed: number;
  yarkovskyDriftAUDay: number;
  yarkovskyPositionShiftKm: number;
  divergenceSeverity: "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  sourceMatch: "BOTH" | "NASA_ONLY" | "ESA_ONLY";
  nasaPosition: Vector3D | null;
  esaPosition: Vector3D | null;
  propagationEpochJD: number;
}

export interface ThreatsApiResponse {
  threats: DivergenceMetrics[];
  metadata: {
    nasaCount: number;
    esaCount: number;
    matchedCount: number;
    nasaOnlyCount: number;
    esaOnlyCount: number;
    maxSpatialDivergenceKm: number;
    maxPalermoDelta: number;
    maxProbabilityRatio: number;
    criticalCount: number;
    fetchTimestamp: string;
    nasaApiStatus: "OK" | "ERROR" | "RATE_LIMITED";
    esaApiStatus: "OK" | "ERROR" | "RATE_LIMITED";
    esaCatalogueStatus: "OK" | "ERROR" | "RATE_LIMITED";
    engineVersion: string;
    propagationEpochJD: number;
  };
}