import { NextRequest, NextResponse } from "next/server";
import {
  parseNasaSentryResponse,
  parseEsaRiskList,
  parseEsaKeplerianCatalogue,
  esaRecordToKeplerian,
  normalizeDesignation,
} from "@/lib/engine/parsers";
import { computeFullDivergence, DivergenceInput } from "@/lib/engine/divergence";
import { computeAdvancedBundle, parseYearsFromRange } from "@/lib/engine/advanced-analysis";
import {
  AdvancedThreat,
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
const ENGINE_VERSION = "3.0.0-readiness-engine";

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const nowJD = JD_J2000 + Date.now() / 1000 / SECONDS_PER_DAY;
  const propagationEpochJD = nowJD + 30;

  let nasaRecords: NasaSentryRecord[] = [];
  let esaRecords: EsaRiskRecord[] = [];
  const esaKeplerianCat = new Map<string, KeplerianElements>();
  let nasaStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";
  let esaStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";
  let esaCatStatus: "OK" | "ERROR" | "RATE_LIMITED" = "OK";

  try {
    const [nasaResult, esaRiskResult, esaCatResult] = await Promise.allSettled([
      fetch(`${NASA_SENTRY_URL}?ps-min=-10`, { signal: controller.signal, headers: { "User-Agent": "AegisSentry/3.0", Accept: "application/json" } }),
      fetch(ESA_RISK_LIST_URL, { signal: controller.signal, headers: { "User-Agent": "AegisSentry/3.0", Accept: "text/plain" } }),
      fetch(ESA_KEPLERIAN_CAT_URL, { signal: controller.signal, headers: { "User-Agent": "AegisSentry/3.0", Accept: "text/plain" } }),
    ]);

    if (nasaResult.status === "fulfilled") {
      const res = nasaResult.value;
      if (res.status === 429) nasaStatus = "RATE_LIMITED";
      else if (res.ok) { try { nasaRecords = parseNasaSentryResponse(await res.json()); } catch { nasaStatus = "ERROR"; } }
      else nasaStatus = "ERROR";
    } else nasaStatus = "ERROR";

    if (esaRiskResult.status === "fulfilled") {
      const res = esaRiskResult.value;
      if (res.status === 429) esaStatus = "RATE_LIMITED";
      else if (res.ok) { try { esaRecords = parseEsaRiskList(await res.text()); } catch { esaStatus = "ERROR"; } }
      else esaStatus = "ERROR";
    } else esaStatus = "ERROR";

    if (esaCatResult.status === "fulfilled") {
      const res = esaCatResult.value;
      if (res.status === 429) esaCatStatus = "RATE_LIMITED";
      else if (res.ok) {
        try {
          const rawCat = parseEsaKeplerianCatalogue(await res.text());
          for (const [key, record] of rawCat) esaKeplerianCat.set(key, esaRecordToKeplerian(record));
        } catch { esaCatStatus = "ERROR"; }
      } else esaCatStatus = "ERROR";
    } else esaCatStatus = "ERROR";
  } catch { nasaStatus = "ERROR"; esaStatus = "ERROR"; esaCatStatus = "ERROR"; }
  finally { clearTimeout(timeout); }

  const nasaMap = new Map<string, NasaSentryRecord>();
  for (const rec of nasaRecords) nasaMap.set(normalizeDesignation(rec.des), rec);
  const esaMap = new Map<string, EsaRiskRecord>();
  for (const rec of esaRecords) esaMap.set(normalizeDesignation(rec.designation), rec);

  const allKeys = new Set([...nasaMap.keys(), ...esaMap.keys()]);
  const threats: AdvancedThreat[] = [];

  for (const key of allKeys) {
    const nasa = nasaMap.get(key);
    const esa = esaMap.get(key);
    const nasaIp = nasa ? parseFloat(nasa.ip) || 0 : 0;
    const esaIpCum = esa ? esa.ipCum : 0;
    const nasaPsCum = nasa ? parseFloat(nasa.ps_cum) || 0 : 0;
    const esaPsCum = esa ? esa.psCum : 0;
    const isMatched = nasaIp > 0 && esaIpCum > 0;
    const palermoDelta = isMatched ? nasaPsCum - esaPsCum : 0;
    const esaElements = esaKeplerianCat.get(key) || null;
    const nasaDiameterKm = nasa ? parseFloat(nasa.diameter) || 0 : 0;
    const esaDiameterM = esa ? esa.diameter_m : 0;
    const diameterKm = nasaDiameterKm > 0 ? nasaDiameterKm : esaDiameterM / 1000;
    const vInfKmS = nasa ? parseFloat(nasa.v_inf) || 0 : esa?.velocityKmS || 12;
    const yearsToImpact = parseYearsFromRange(nasa?.range || esa?.yearsRange || "");

    const input: DivergenceInput = {
      designation: nasa?.des || esa?.designation || key,
      fullname: nasa?.fullname || esa?.name || key,
      nasaIp, nasaPsCum: nasa ? parseFloat(nasa.ps_cum) || -99 : -99,
      nasaPsMax: nasa ? parseFloat(nasa.ps_max) || -99 : -99,
      nasaTsMax: nasa ? parseInt(nasa.ts_max) || 0 : 0,
      nasaVInfKmS: nasa ? parseFloat(nasa.v_inf) || 0 : 0,
      nasaDiameterKm, nasaEnergyMt: 0, nasaMassKg: 0,
      nasaNImp: nasa ? parseInt(nasa.n_imp) || 0 : 0,
      nasaRange: nasa?.range || "", nasaMethod: "IOBS",
      nasaElements: null, nasaHasNonGrav: nasa ? nasaDiameterKm > 0.05 : false,
      esaIpCum, esaIpMax: esa ? esa.ipMax : 0,
      esaPsCum: esa ? esa.psCum : -99, esaPsMax: esa ? esa.psMax : -99,
      esaTorinoScale: esa ? esa.torinoScale : 0,
      esaVelocityKmS: esa ? esa.velocityKmS : 0,
      esaDiameterM, esaYearsRange: esa?.yearsRange || "",
      esaViMaxDate: esa?.viMaxDate || "",
      esaElements, esaHasNonGrav: false,
    };

    const base = computeFullDivergence(input, propagationEpochJD);
    base.palermoDelta = palermoDelta;

    const bundle = computeAdvancedBundle({
      designation: base.designation,
      elements: esaElements,
      diameterKm,
      impactProbability: Math.max(nasaIp, esaIpCum),
      yearsToImpact,
      vInfKmS,
      energyMt: base.nasa.energyMt,
      probabilityRatio: base.probabilityRatio,
      sourceMatch: base.sourceMatch,
    }, nowJD);

    threats.push({ ...base, ...bundle });
  }

  threats.sort((a, b) => {
    const aM = a.sourceMatch === "BOTH" ? 1 : 0;
    const bM = b.sourceMatch === "BOTH" ? 1 : 0;
    if (aM !== bM) return bM - aM;
    return Math.abs(b.palermoDelta) - Math.abs(a.palermoDelta);
  });

  const matchedCount = threats.filter((t) => t.sourceMatch === "BOTH").length;
  const response: ThreatsApiResponse = {
    threats: threats.slice(0, 300),
    metadata: {
      nasaCount: nasaRecords.length,
      esaCount: esaRecords.length,
      matchedCount,
      nasaOnlyCount: threats.filter((t) => t.sourceMatch === "NASA_ONLY").length,
      esaOnlyCount: threats.filter((t) => t.sourceMatch === "ESA_ONLY").length,
      maxSpatialDivergenceKm: threats.reduce((m, t) => Math.max(m, t.spatialDivergenceKm), 0),
      maxPalermoDelta: threats.reduce((m, t) => Math.max(m, Math.abs(t.palermoDelta)), 0),
      maxProbabilityRatio: threats.reduce((m, t) => Math.max(m, t.probabilityRatio), 0),
      criticalCount: threats.filter((t) => t.divergenceSeverity === "CRITICAL").length,
      ysiDominantCount: threats.filter((t) => t.ysi.classification === "DOMINANT" || t.ysi.classification === "HIGH").length,
      keyholeAlertCount: threats.filter((t) => t.keyhole.isAlert).length,
      corridorCount: threats.filter((t) => t.corridor.hasCorridor).length,
      readinessCriticalCount: threats.filter((t) => t.readiness.priority === "CRITICAL").length,
      topReadinessScore: threats.reduce((m, t) => Math.max(m, t.readiness.score), 0),
      fetchTimestamp: new Date().toISOString(),
      nasaApiStatus: nasaStatus,
      esaApiStatus: esaStatus,
      esaCatalogueStatus: esaCatStatus,
      engineVersion: ENGINE_VERSION,
      propagationEpochJD,
    },
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "X-Engine-Version": ENGINE_VERSION },
  });
}
