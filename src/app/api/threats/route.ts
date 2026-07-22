import { NextRequest, NextResponse } from "next/server";
import {
  parseNasaSentryResponse,
  parseEsaRiskList,
  parseEsaKeplerianCatalogue,
  esaRecordToKeplerian,
  normalizeDesignation,
} from "@/lib/engine/parsers";
import { computeFullDivergence, DivergenceInput } from "@/lib/engine/divergence";
import {
  DivergenceMetrics,
  ThreatsApiResponse,
  NasaSentryRecord,
  EsaRiskRecord,
  KeplerianElements,
} from "@/lib/engine/types";
import { JD_J2000, SECONDS_PER_DAY } from "@/lib/engine/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const ESA_RISK_LIST_URL = "https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list";
const ESA_KEPLERIAN_CAT_URL = "https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat";
const ENGINE_VERSION = "2.0.0-scientific-exact";
const FETCH_TIMEOUT_MS = 30000;

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const nowJD = JD_J2000 + Date.now() / 1000 / SECONDS_PER_DAY + 30;

  let nasaRecords: NasaSentryRecord[] = [];
  let esaRecords: EsaRiskRecord[] = [];
  const esaKeplerianCat = new Map<string, KeplerianElements>();

  let nasaStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";
  let esaStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";
  let esaCatStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";

  try {
    const [nasaResult, esaRiskResult, esaCatResult] = await Promise.allSettled([
      fetchWithRetry(`${NASA_SENTRY_URL}?ps-min=-10`, {
        signal: controller.signal,
        headers: { "User-Agent": "AegisSentryDivergenceWatch/2.0 (Research)", Accept: "application/json" },
      }),
      fetchWithRetry(ESA_RISK_LIST_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "AegisSentryDivergenceWatch/2.0 (Research)", Accept: "text/plain" },
      }),
      fetchWithRetry(ESA_KEPLERIAN_CAT_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "AegisSentryDivergenceWatch/2.0 (Research)", Accept: "text/plain" },
      }),
    ]);

    if (nasaResult.status === "fulfilled") {
      const res = nasaResult.value;
      if (res.status === 429) nasaStatus = "RATE_LIMITED";
      else if (res.ok) {
        try { nasaRecords = parseNasaSentryResponse(await res.json()); } catch { nasaStatus = "ERROR"; }
      } else nasaStatus = "ERROR";
    } else nasaStatus = "ERROR";

    if (esaRiskResult.status === "fulfilled") {
      const res = esaRiskResult.value;
      if (res.status === 429) esaStatus = "RATE_LIMITED";
      else if (res.ok) {
        try { esaRecords = parseEsaRiskList(await res.text()); } catch { esaStatus = "ERROR"; }
      } else esaStatus = "ERROR";
    } else esaStatus = "ERROR";

    if (esaCatResult.status === "fulfilled") {
      const res = esaCatResult.value;
      if (res.status === 429) esaCatStatus = "RATE_LIMITED";
      else if (res.ok) {
        try {
          const rawCat = parseEsaKeplerianCatalogue(await res.text());
          for (const [key, record] of rawCat) {
            esaKeplerianCat.set(key, esaRecordToKeplerian(record));
          }
        } catch { esaCatStatus = "ERROR"; }
      } else esaCatStatus = "ERROR";
    } else esaCatStatus = "ERROR";
  } catch {
    nasaStatus = "ERROR"; esaStatus = "ERROR"; esaCatStatus = "ERROR";
  } finally {
    clearTimeout(timeout);
  }

  const nasaMap = new Map<string, NasaSentryRecord>();
  for (const rec of nasaRecords) nasaMap.set(normalizeDesignation(rec.des), rec);

  const esaMap = new Map<string, EsaRiskRecord>();
  for (const rec of esaRecords) esaMap.set(normalizeDesignation(rec.designation), rec);

  const allKeys = new Set([...nasaMap.keys(), ...esaMap.keys()]);
  const threats: DivergenceMetrics[] = [];

  for (const key of allKeys) {
    const nasa = nasaMap.get(key);
    const esa = esaMap.get(key);

    const nasaIp = nasa ? parseFloat(nasa.ip) || 0 : 0;
    const esaIpCum = esa ? esa.ipCum : 0;
    const nasaPsCum = nasa ? parseFloat(nasa.ps_cum) || 0 : 0;
    const esaPsCum = esa ? esa.psCum : 0;

    // FIX: Only compute palermoDelta for MATCHED objects
    // For unmatched, set to 0 (not nasaPS - (-99) = +98 nonsense)
    const isMatched = nasaIp > 0 && esaIpCum > 0;
    const palermoDelta = isMatched ? nasaPsCum - esaPsCum : 0;

    const input: DivergenceInput = {
      designation: nasa?.des || esa?.designation || key,
      fullname: nasa?.fullname || esa?.name || key,
      nasaIp,
      nasaPsCum: nasa ? parseFloat(nasa.ps_cum) || -99 : -99,
      nasaPsMax: nasa ? parseFloat(nasa.ps_max) || -99 : -99,
      nasaTsMax: nasa ? parseInt(nasa.ts_max) || 0 : 0,
      nasaVInfKmS: nasa ? parseFloat(nasa.v_inf) || 0 : 0,
      nasaDiameterKm: nasa ? parseFloat(nasa.diameter) || 0 : 0,
      nasaEnergyMt: 0,
      nasaMassKg: 0,
      nasaNImp: nasa ? parseInt(nasa.n_imp) || 0 : 0,
      nasaRange: nasa?.range || "",
      nasaMethod: "IOBS",
      nasaElements: null,
      nasaHasNonGrav: nasa ? parseFloat(nasa.diameter) > 0.05 : false,
      esaIpCum,
      esaIpMax: esa ? esa.ipMax : 0,
      esaPsCum: esa ? esa.psCum : -99,
      esaPsMax: esa ? esa.psMax : -99,
      esaTorinoScale: esa ? esa.torinoScale : 0,
      esaVelocityKmS: esa ? esa.velocityKmS : 0,
      esaDiameterM: esa ? esa.diameter_m : 0,
      esaYearsRange: esa?.yearsRange || "",
      esaViMaxDate: esa?.viMaxDate || "",
      esaElements: esaKeplerianCat.get(key) || null,
      esaHasNonGrav: false,
    };

    const metrics = computeFullDivergence(input, nowJD);
    // Override palermoDelta with our corrected value
    metrics.palermoDelta = palermoDelta;
    threats.push(metrics);
  }

  // SORT: Matched objects first (by |ΔPS| desc), then unmatched
  threats.sort((a, b) => {
    const aMatched = a.sourceMatch === "BOTH" ? 1 : 0;
    const bMatched = b.sourceMatch === "BOTH" ? 1 : 0;
    if (aMatched !== bMatched) return bMatched - aMatched;
    return Math.abs(b.palermoDelta) - Math.abs(a.palermoDelta);
  });

  const matchedCount = threats.filter((t) => t.sourceMatch === "BOTH").length;
  const nasaOnlyCount = threats.filter((t) => t.sourceMatch === "NASA_ONLY").length;
  const esaOnlyCount = threats.filter((t) => t.sourceMatch === "ESA_ONLY").length;
  const criticalCount = threats.filter((t) => t.divergenceSeverity === "CRITICAL").length;
  const maxPalermo = threats.reduce((max, t) => Math.max(max, Math.abs(t.palermoDelta)), 0);
  const maxSpatial = threats.reduce((max, t) => Math.max(max, t.spatialDivergenceKm), 0);
  const maxProbRatio = threats.reduce((max, t) => Math.max(max, t.probabilityRatio), 0);

  const response: ThreatsApiResponse = {
    threats: threats.slice(0, 300),
    metadata: {
      nasaCount: nasaRecords.length,
      esaCount: esaRecords.length,
      matchedCount,
      nasaOnlyCount,
      esaOnlyCount,
      maxSpatialDivergenceKm: maxSpatial,
      maxPalermoDelta: maxPalermo,
      maxProbabilityRatio: maxProbRatio,
      criticalCount,
      fetchTimestamp: new Date().toISOString(),
      nasaApiStatus: nasaStatus,
      esaApiStatus: esaStatus,
      esaCatalogueStatus: esaCatStatus,
      engineVersion: ENGINE_VERSION,
      propagationEpochJD: nowJD,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "X-Engine-Version": ENGINE_VERSION,
    },
  });
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}
