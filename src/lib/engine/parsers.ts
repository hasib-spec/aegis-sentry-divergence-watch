/**
 * AEGIS-SENTRY DIVERGENCE WATCH v2.0
 * Data Parsers: NASA Sentry JSON, NASA SBDB, ESA Risk List, ESA OEF 2.0
 */

import {
  NasaSentryRecord,
  EsaRiskRecord,
  EsaKeplerianRecord,
  KeplerianElements,
  KeplerianWithCovariance,
} from "./types";
import { mjdToJD } from "./kepler";
import { DEG_TO_RAD } from "./constants";

export function parseNasaSentryResponse(json: {
  count?: number;
  data?: NasaSentryRecord[];
}): NasaSentryRecord[] {
  if (!json.data || !Array.isArray(json.data)) return [];
  return json.data;
}

export function parseEsaRiskList(rawText: string): EsaRiskRecord[] {
  const records: EsaRiskRecord[] = [];
  const lines = rawText.split("\n");
  let dataStarted = false;
  let headerLinesSeen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Last Update:")) continue;

    if (
      trimmed.includes("Object") ||
      trimmed.includes("Num/des.") ||
      trimmed.startsWith("AAAA")
    ) {
      headerLinesSeen++;
      if (headerLinesSeen >= 3) dataStarted = true;
      continue;
    }

    if (!dataStarted) continue;

    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 9) continue;

    try {
      const objField = parts[0].trim();
      const tokens = objField.split(/\s+/);
      let designation = "";
      let name = "";

      if (
        tokens.length >= 2 &&
        /^\d+$/.test(tokens[0]) &&
        tokens[0].length <= 6
      ) {
        designation = tokens[0];
        name = tokens.slice(1).join(" ");
      } else {
        designation = tokens[0];
        name = tokens.slice(1).join(" ") || tokens[0];
      }

      const diameterStr = parts[1]?.trim() || "0";
      const diameter_m = parseFloat(diameterStr) || 0;
      const diameterEstimated = (parts[2]?.trim() || "").includes("*");
      const viMaxDate = parts[3]?.trim() || "";
      const ipMax = parseScientific(parts[4]);
      const psMax = parseFloat(parts[5]?.trim() || "-99") || -99;
      const torinoScale = parseInt(parts[6]?.trim() || "0") || 0;
      const velocityKmS = parseFloat(parts[7]?.trim() || "0") || 0;
      const yearsRange = parts[8]?.trim() || "";
      const ipCum = parts.length > 9 ? parseScientific(parts[9]) : ipMax;
      const psCum =
        parts.length > 10
          ? parseFloat(parts[10]?.trim() || "-99") || -99
          : psMax;

      records.push({
        designation,
        name,
        diameter_m,
        diameterEstimated,
        viMaxDate,
        ipMax,
        psMax,
        torinoScale,
        velocityKmS,
        yearsRange,
        ipCum,
        psCum,
      });
    } catch {
      continue;
    }
  }

  return records;
}

export function parseEsaKeplerianCatalogue(
  rawText: string
): Map<string, EsaKeplerianRecord> {
  const catalogue = new Map<string, EsaKeplerianRecord>();
  const lines = rawText.split("\n");
  let pastHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "END_OF_HEADER") {
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    if (trimmed.startsWith("!")) continue;
    if (
      trimmed.startsWith("format") ||
      trimmed.startsWith("rectype") ||
      trimmed.startsWith("elem") ||
      trimmed.startsWith("refsys")
    )
      continue;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 11) continue;

    try {
      const designation = tokens[0];
      const epochMJD = parseFloat(tokens[1]);
      const a = parseFloat(tokens[2]);
      const e = parseFloat(tokens[3]);
      const iDeg = parseFloat(tokens[4]);
      const omegaDeg = parseFloat(tokens[5]);
      const wDeg = parseFloat(tokens[6]);
      const mDeg = parseFloat(tokens[7]);
      const H = parseFloat(tokens[8]);
      const G = parseFloat(tokens[9]);
      const nonGravFlag = parseInt(tokens[10]) || 0;

      if (isNaN(epochMJD) || isNaN(a) || isNaN(e)) continue;

      catalogue.set(normalizeDesignation(designation), {
        designation,
        epochMJD,
        semiMajorAxisAU: a,
        eccentricity: e,
        inclinationDeg: iDeg,
        longitudeNodeDeg: omegaDeg,
        argumentPericenterDeg: wDeg,
        meanAnomalyDeg: mDeg,
        absoluteMagnitudeH: H,
        slopeParameterG: G,
        nonGravFlag,
      });
    } catch {
      continue;
    }
  }

  return catalogue;
}

export function extractNasaSBDBElements(orbitData: {
  epoch: string;
  elements: Array<{
    name: string;
    value: string;
    sigma: string;
    units: string | null;
  }>;
  model_pars?: Array<{
    name: string;
    value: string;
    sigma: string;
    kind: string;
  }>;
}): KeplerianWithCovariance | null {
  try {
    const elemMap = new Map<string, { value: number; sigma: number }>();
    for (const el of orbitData.elements) {
      elemMap.set(el.name, {
        value: parseFloat(el.value),
        sigma: parseFloat(el.sigma) || 0,
      });
    }

    const a = elemMap.get("a");
    const e = elemMap.get("e");
    const i = elemMap.get("i");
    const om = elemMap.get("om");
    const w = elemMap.get("w");
    const ma = elemMap.get("ma");

    if (!a || !e || !i || !om || !w || !ma) return null;

    const epochJD = parseFloat(orbitData.epoch);

    let nonGravParams: { A1?: number; A2?: number; A3?: number } | undefined;
    if (orbitData.model_pars && orbitData.model_pars.length > 0) {
      nonGravParams = {};
      for (const mp of orbitData.model_pars) {
        if (mp.name === "A1") nonGravParams.A1 = parseFloat(mp.value);
        if (mp.name === "A2") nonGravParams.A2 = parseFloat(mp.value);
        if (mp.name === "A3") nonGravParams.A3 = parseFloat(mp.value);
      }
    }

    return {
      semiMajorAxisAU: a.value,
      eccentricity: e.value,
      inclinationRad: i.value * DEG_TO_RAD,
      longitudeAscendingNodeRad: om.value * DEG_TO_RAD,
      argumentOfPerihelionRad: w.value * DEG_TO_RAD,
      meanAnomalyAtEpochRad: ma.value * DEG_TO_RAD,
      epochJD,
      sigmas: [
        a.sigma,
        e.sigma,
        i.sigma * DEG_TO_RAD,
        om.sigma * DEG_TO_RAD,
        w.sigma * DEG_TO_RAD,
        ma.sigma * DEG_TO_RAD,
      ],
      nonGravParams,
    };
  } catch {
    return null;
  }
}

export function esaRecordToKeplerian(
  record: EsaKeplerianRecord
): KeplerianElements {
  return {
    semiMajorAxisAU: record.semiMajorAxisAU,
    eccentricity: record.eccentricity,
    inclinationRad: record.inclinationDeg * DEG_TO_RAD,
    longitudeAscendingNodeRad: record.longitudeNodeDeg * DEG_TO_RAD,
    argumentOfPerihelionRad: record.argumentPericenterDeg * DEG_TO_RAD,
    meanAnomalyAtEpochRad: record.meanAnomalyDeg * DEG_TO_RAD,
    epochJD: mjdToJD(record.epochMJD),
    absoluteMagnitudeH: record.absoluteMagnitudeH,
    slopeParameterG: record.slopeParameterG,
    nonGravFlag: record.nonGravFlag,
  };
}

export function normalizeDesignation(des: string): string {
  return des
    .replace(/\s+/g, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .toUpperCase();
}

function parseScientific(str: string | undefined): number {
  if (!str) return 0;
  const cleaned = str.trim().replace(/\s/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}