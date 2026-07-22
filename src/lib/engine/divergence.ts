/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Multi-Agency Divergence Computation Engine
 *
 * Sentry-II: IOBS method + Yarkovsky (A1, A2)
 * Aegis: LOV method + gravitational-only
 * Reference: Fenucci et al. (2024) §7.4
 */

import { propagateKeplerianToPosition, vectorDistance } from "./kepler";
import {
  computeYarkovskyDrift,
  computeYarkovskyPositionShift,
  defaultYarkovskyParams,
} from "./yarkovsky";
import {
  computePalermoScale,
  computeImpactEnergyMt,
  computeImpactVelocity,
} from "./palermo";
import { KeplerianElements, Vector3D, DivergenceMetrics } from "./types";

export interface DivergenceInput {
  designation: string;
  fullname: string;
  nasaIp: number;
  nasaPsCum: number;
  nasaPsMax: number;
  nasaTsMax: number;
  nasaVInfKmS: number;
  nasaDiameterKm: number;
  nasaEnergyMt: number;
  nasaMassKg: number;
  nasaNImp: number;
  nasaRange: string;
  nasaMethod: string;
  nasaElements: KeplerianElements | null;
  nasaHasNonGrav: boolean;
  esaIpCum: number;
  esaIpMax: number;
  esaPsCum: number;
  esaPsMax: number;
  esaTorinoScale: number;
  esaVelocityKmS: number;
  esaDiameterM: number;
  esaYearsRange: string;
  esaViMaxDate: string;
  esaElements: KeplerianElements | null;
  esaHasNonGrav: boolean;
}

export function computeFullDivergence(
  input: DivergenceInput,
  propagationEpochJD: number
): DivergenceMetrics {
  const {
    designation,
    fullname,
    nasaIp,
    nasaPsCum,
    nasaPsMax,
    nasaTsMax,
    nasaVInfKmS,
    nasaDiameterKm,
    nasaEnergyMt,
    nasaMassKg,
    nasaNImp,
    nasaRange,
    nasaMethod,
    nasaElements,
    nasaHasNonGrav,
    esaIpCum,
    esaIpMax,
    esaPsCum,
    esaPsMax,
    esaTorinoScale,
    esaVelocityKmS,
    esaDiameterM,
    esaYearsRange,
    esaViMaxDate,
    esaElements,
    esaHasNonGrav,
  } = input;

  let spatialDivergenceKm = 0;
  let nasaPosition: Vector3D | null = null;
  let esaPosition: Vector3D | null = null;
  let yarkovskyDriftAUDay = 0;
  let yarkovskyPositionShiftKm = 0;

  if (nasaElements && esaElements) {
    if (nasaHasNonGrav && nasaDiameterKm > 0.01) {
      const yarkParams = defaultYarkovskyParams(nasaDiameterKm);
      const yarkResult = computeYarkovskyDrift(nasaElements, yarkParams);
      yarkovskyDriftAUDay = yarkResult.daDtAUDay;
      const deltaTDays = Math.abs(propagationEpochJD - nasaElements.epochJD);
      yarkovskyPositionShiftKm = computeYarkovskyPositionShift(
        yarkovskyDriftAUDay,
        nasaElements.semiMajorAxisAU,
        deltaTDays
      );
    }

    nasaPosition = propagateKeplerianToPosition(
      nasaElements,
      propagationEpochJD,
      yarkovskyDriftAUDay
    );

    esaPosition = propagateKeplerianToPosition(
      esaElements,
      propagationEpochJD,
      0
    );

    spatialDivergenceKm = vectorDistance(nasaPosition, esaPosition);
  } else if (nasaElements) {
    nasaPosition = propagateKeplerianToPosition(
      nasaElements,
      propagationEpochJD,
      0
    );
  } else if (esaElements) {
    esaPosition = propagateKeplerianToPosition(
      esaElements,
      propagationEpochJD,
      0
    );
  }

  const probabilityRatio =
    nasaIp > 0 && esaIpCum > 0
      ? nasaIp / esaIpCum
      : nasaIp > 0
        ? 999
        : esaIpCum > 0
          ? 0.001
          : 1;

  const probabilityDeltaAbs = Math.abs(nasaIp - esaIpCum);
  const palermoDelta = nasaPsCum - esaPsCum;

  const yearsToImpactNasa = parseYearsFromRange(nasaRange);
  const yearsToImpactEsa = parseYearsFromRange(esaYearsRange);

  const vImpNasa = computeImpactVelocity(nasaVInfKmS);
  const vImpEsa = esaVelocityKmS;

  const energyNasa =
    nasaEnergyMt > 0
      ? nasaEnergyMt
      : computeImpactEnergyMt(nasaDiameterKm, vImpNasa);

  const esaDiameterKm = esaDiameterM / 1000;
  const energyEsa = computeImpactEnergyMt(esaDiameterKm, vImpEsa);

  const palermoNasaRecomputed = computePalermoScale(
    nasaIp,
    energyNasa,
    yearsToImpactNasa
  );
  const palermoEsaRecomputed = computePalermoScale(
    esaIpCum,
    energyEsa,
    yearsToImpactEsa
  );

  const divergenceSeverity = classifyDivergence(
    spatialDivergenceKm,
    probabilityDeltaAbs,
    Math.abs(palermoDelta),
    probabilityRatio
  );

  const sourceMatch: "BOTH" | "NASA_ONLY" | "ESA_ONLY" =
    nasaIp > 0 && esaIpCum > 0
      ? "BOTH"
      : nasaIp > 0
        ? "NASA_ONLY"
        : "ESA_ONLY";

  return {
    designation,
    fullname,
    nasa: {
      ip: nasaIp,
      psCum: nasaPsCum,
      psMax: nasaPsMax,
      tsMax: nasaTsMax,
      vInfKmS: nasaVInfKmS,
      vImpKmS: vImpNasa,
      diameterKm: nasaDiameterKm,
      energyMt: energyNasa,
      massKg: nasaMassKg,
      nImp: nasaNImp,
      range: nasaRange,
      method: nasaMethod,
      elements: nasaElements
        ? { ...nasaElements, sigmas: [0, 0, 0, 0, 0, 0] }
        : null,
      hasNonGrav: nasaHasNonGrav,
    },
    esa: {
      ipCum: esaIpCum,
      ipMax: esaIpMax,
      psCum: esaPsCum,
      psMax: esaPsMax,
      torinoScale: esaTorinoScale,
      velocityKmS: esaVelocityKmS,
      diameterM: esaDiameterM,
      yearsRange: esaYearsRange,
      viMaxDate: esaViMaxDate,
      elements: esaElements,
      hasNonGrav: esaHasNonGrav,
    },
    spatialDivergenceKm,
    probabilityRatio,
    probabilityDeltaAbs,
    palermoDelta,
    palermoNasaRecomputed,
    palermoEsaRecomputed,
    yarkovskyDriftAUDay,
    yarkovskyPositionShiftKm,
    divergenceSeverity,
    sourceMatch,
    nasaPosition,
    esaPosition,
    propagationEpochJD,
  };
}

function classifyDivergence(
  spatialKm: number,
  probDelta: number,
  palermoDelta: number,
  probRatio: number
): "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (Math.abs(palermoDelta) > 1.0 || probRatio > 10 || probRatio < 0.1) {
    return "CRITICAL";
  }
  if (Math.abs(palermoDelta) > 0.5 || spatialKm > 100000 || probRatio > 5) {
    return "HIGH";
  }
  if (Math.abs(palermoDelta) > 0.2 || spatialKm > 10000 || probRatio > 2) {
    return "MODERATE";
  }
  if (Math.abs(palermoDelta) > 0.05 || spatialKm > 1000) {
    return "LOW";
  }
  return "NEGLIGIBLE";
}

function parseYearsFromRange(rangeStr: string): number {
  if (!rangeStr) return 50;
  const match = rangeStr.match(/(\d{4})\s*-\s*(\d{4})/);
  if (match) {
    const midYear = (parseInt(match[1]) + parseInt(match[2])) / 2;
    return Math.max(midYear - new Date().getFullYear(), 1);
  }
  const singleYear = rangeStr.match(/(\d{4})/);
  if (singleYear) {
    return Math.max(parseInt(singleYear[1]) - new Date().getFullYear(), 1);
  }
  return 50;
}