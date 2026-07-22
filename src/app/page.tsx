"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
  Wifi, WifiOff, Filter, Search, LayoutDashboard, Table2,
  Target, KeyRound, Zap, Activity, ArrowUpRight, Radar, Crosshair, Rocket, Clock, Eye, Share2, Bell,
} from "lucide-react";
import OrbitsViewer from "@/components/OrbitsViewer";
import CorridorMap from "@/components/CorridorMap";
import BPlaneDiagram from "@/components/BPlaneDiagram";
import YarkovskyScatter from "@/components/YarkovskyScatter";
import ObjectDossier from "@/components/ObjectDossier";
import ApproachTimeline from "@/components/ApproachTimeline";
import RiskMatrix from "@/components/RiskMatrix";
import DeflectionPlanner from "@/components/DeflectionPlanner";
import RiskTimeline from "@/components/RiskTimeline";
import BlindSpotMap from "@/components/BlindSpotMap";
import ThreatCard from "@/components/ThreatCard"; /* v3.5 */
import LiveFeed from "@/components/LiveFeed"; /* v4.0 */
import Orbital3D from "@/components/Orbital3D"; /* v4.0 */
import { computeConsensus } from "@/lib/engine/consensus"; /* v3.5 */
import type { AdvancedThreat, ThreatsApiResponse } from "@/lib/engine/types";

type TabId = "overview" | "matrix" | "corridors" | "keyholes" | "yarkovsky" | "rubin" | "approaches" | "risk" | "deflect" | "timeline" | "blindspot" | "live" | "3d";

interface ApproachData {
  designation: string;
  nextApproachDate: string;
  nextApproachLD: number;
  nextApproachKm: number;
  nextApproachVelocityKmS: number;
  approachesWithin10LD: number;
  approachesWithin1LD: number;
  minDistanceLD: number;
  minDistanceDate: string;
  moidAU?: number | null;
  allApproaches: Array<{ approachDate: string; distLD: number; vRelKmS: number }>;
}

interface TimelineData {
  observationArc: {
    arc: { arcLengthDays: number; arcQuality: string; uncertaintyParameterU: number; currentSigmaArcsec: number; daysSinceLastObs: number; isStale: boolean; firstObsDate: string; lastObsDate: string };
    lossDateYearsFromNow: number;
    yarkovskyDominanceYears: number;
    recommendation: string;
    urgency: string;
  };
  riskEvolution: {
    timeline: Array<{ yearsFromNow: number; ipNasa: number; ipEsa: number; palermoNasa: number; palermoEsa: number; sigmaKm: number; missDistanceKm: number; isProjection: boolean }>;
    trend: { direction: string; ratePerYear: number; characteristicTimeYears: number; yearsToSafe: number; confidence: number };
    nasaEsaDivergenceTrend: string;
    peakIP: number;
    peakIPYear: number;
    currentIP: number;
    recommendation: string;
  };
  current: { ip: number; diameterKm: number; daDtAUMyr: number; hasYarkovsky: boolean };
}

function sci(val: number): string {
  if (!val || val === 0) return "—";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) return val.toExponential(2);
  return val.toFixed(6);
}
function safeNum(val: unknown): number {
  return typeof val === "number" && isFinite(val) ? val : 0;
}

export default function Home() {
  const [data, setData] = useState<ThreatsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [sortKey, setSortKey] = useState("absPalermoDelta");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<AdvancedThreat | null>(null);
  const [dossierTarget, setDossierTarget] = useState<AdvancedThreat | null>(null);
  const [filter, setFilter] = useState<"BOTH" | "ALL" | "NASA_ONLY" | "ESA_ONLY">("BOTH");
  const [query, setQuery] = useState("");
  const [utc, setUtc] = useState("--:--:--");
  const [approachData, setApproachData] = useState<ApproachData[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<string>("");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [shareCard, setShareCard] = useState<AdvancedThreat | null>(null); /* v3.5 */

  useEffect(() => {
    const f = () => setUtc(new Date().toISOString().slice(11, 19));
    f();
    const iv = setInterval(f, 1000);
    return () => clearInterval(iv);
  }, []);

  const fetchThreats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/threats", { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreats();
    const iv = setInterval(fetchThreats, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchThreats]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/approaches", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.approaches) setApproachData(json.approaches);
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const fetchTimeline = useCallback(async (des: string) => {
    if (!des) return;
    setTimelineLoading(true);
    setTimelineData(null);
    try {
      const res = await fetch(`/api/evolution?des=${encodeURIComponent(des)}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (!json.error) setTimelineData(json);
      }
    } catch { /* non-critical */ }
    finally { setTimelineLoading(false); }
  }, []);

  /* v3.5: Compute consensus for matched objects */
  const consensusMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const t of data.threats) {
      if (t.sourceMatch === "BOTH" && t.nasa.ip > 0 && t.esa.ipCum > 0) {
        const c = computeConsensus(t, t.ysi.ysi, t.nasa.hasNonGrav, 365);
        map.set(t.designation, c.consensusScore);
      }
    }
    return map;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.threats;
    if (filter !== "ALL") list = list.filter((t) => t.sourceMatch === filter);
    if (query.trim()) {
      const q = query.trim().toUpperCase();
      list = list.filter((t) => t.designation.toUpperCase().includes(q) || t.fullname.toUpperCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "designation": return sortAsc ? a.designation.localeCompare(b.designation) : b.designation.localeCompare(a.designation);
        case "nasaIp": av = safeNum(a.nasa?.ip); bv = safeNum(b.nasa?.ip); break;
        case "esaIp": av = safeNum(a.esa?.ipCum); bv = safeNum(b.esa?.ipCum); break;
        case "absPalermoDelta": av = Math.abs(safeNum(a.palermoDelta)); bv = Math.abs(safeNum(b.palermoDelta)); break;
        case "ysi": av = safeNum(a.ysi?.ysi); bv = safeNum(b.ysi?.ysi); break;
        case "rrs": av = safeNum(a.readiness?.score); bv = safeNum(b.readiness?.score); break;
        default: av = Math.abs(safeNum(a.palermoDelta)); bv = Math.abs(safeNum(b.palermoDelta));
      }
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, filter, query, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: string }) =>
    sortKey === col ? (sortAsc ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : null;

  const openDossier = (t: AdvancedThreat) => { setSelected(t); setDossierTarget(t); };

  const md = data?.metadata;
  const topReadiness = useMemo(() => data ? [...data.threats].sort((a, b) => b.readiness.score - a.readiness.score).slice(0, 8) : [], [data]);
  const topKeyholes = useMemo(() => data ? [...data.threats].filter((t) => t.keyhole.keyholeCount > 0).sort((a, b) => a.keyhole.sigmaFromKeyhole - b.keyhole.sigmaFromKeyhole).slice(0, 12) : [], [data]);
  const topYsi = useMemo(() => data ? [...data.threats].sort((a, b) => b.ysi.ysi - a.ysi.ysi).slice(0, 12) : [], [data]);
  const topCorridors = useMemo(() => data ? [...data.threats].filter((t) => t.corridor.hasCorridor).sort((a, b) => b.corridor.lengthKm - a.corridor.lengthKm).slice(0, 10) : [], [data]);
  const keyholeFocus = selected ?? topKeyholes[0] ?? null;

  /* v3.5: Consensus statistics */
  const consensusStats = useMemo(() => {
    if (!data) return { mean: 0, critical: 0, yarkDriven: 0 };
    const matched = data.threats.filter((t) => t.sourceMatch === "BOTH" && t.nasa.ip > 0 && t.esa.ipCum > 0);
    if (matched.length === 0) return { mean: 0, critical: 0, yarkDriven: 0 };
    let sum = 0, crit = 0, yark = 0;
    for (const t of matched) {
      const c = computeConsensus(t, t.ysi.ysi, t.nasa.hasNonGrav, 365);
      sum += c.consensusScore;
      if (c.verificationPriority === "CRITICAL") crit++;
      if (c.rootCause === "YARKOVSKY_MODELING") yark++;
    }
    return { mean: Math.round(sum / matched.length), critical: crit, yarkDriven: yark };
  }, [data]);

  const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "OVERVIEW", icon: <LayoutDashboard size={11} /> },
    { id: "matrix", label: "MATRIX", icon: <Table2 size={11} /> },
    { id: "approaches", label: "APPROACHES", icon: <Radar size={11} /> },
    { id: "corridors", label: "CORRIDORS", icon: <Target size={11} /> },
    { id: "keyholes", label: "KEYHOLES", icon: <KeyRound size={11} /> },
    { id: "yarkovsky", label: "YARKOVSKY", icon: <Zap size={11} /> },
    { id: "risk", label: "RISK MATRIX", icon: <Crosshair size={11} /> },
    { id: "deflect", label: "DEFLECTION", icon: <Rocket size={11} /> },
    { id: "timeline", label: "TIMELINE", icon: <Clock size={11} /> },
    { id: "blindspot", label: "BLIND SPOT", icon: <Eye size={11} /> },
    { id: "live", label: "LIVE FEED", icon: <Bell size={11} /> },
    { id: "3d", label: "3D ORBITS", icon: <Activity size={11} /> },
    { id: "rubin", label: "RUBIN FEED", icon: <Activity size={11} /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#030308]">
      {/* HEADER */}
      <header className="border-b border-zinc-800/50 bg-[#080810]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <Shield className="w-8 h-8 text-cyan-400" strokeWidth={1.5} />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-none truncate">
                AEGIS<span className="text-cyan-400">·</span>SENTRY
                <span className="ml-2 text-[10px] sm:text-xs font-normal text-zinc-500 tracking-wide">READINESS ENGINE</span>
                <span className="ml-2 text-[8px] font-mono text-cyan-400/60 border border-cyan-500/20 rounded px-1 py-0.5 align-middle">v4.0</span>
              </h1>
              <p className="text-[8px] sm:text-[9px] font-mono text-zinc-600 tracking-[0.15em] uppercase mt-0.5 truncate">
                NASA Sentry-II ↔ ESA NEOCC/Aegis ↔ Rubin LSST Triage
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden md:block font-mono text-[10px] text-zinc-500">{utc} <span className="text-zinc-700">UTC</span></span>
            {md && (
              <div className="hidden sm:flex items-center gap-1.5">
                <Pill ok={md.nasaApiStatus === "OK"} label="NASA" />
                <Pill ok={md.esaApiStatus === "OK"} label="ESA" />
              </div>
            )}
            <button onClick={fetchThreats} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[10px] font-mono text-zinc-400 disabled:opacity-40">
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{loading ? "SYNC" : "REFRESH"}</span>
            </button>
          </div>
        </div>
        <div className="max-w-[1920px] mx-auto px-4 sm:px-5 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-[9px] font-mono tracking-wider border-b-2 transition-all whitespace-nowrap ${tab === t.id ? "border-cyan-400 text-cyan-300" : "border-transparent text-zinc-600 hover:text-zinc-400"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* BODY */}
      <main className="flex-1 max-w-[1920px] mx-auto w-full p-3 sm:p-4">
        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 flex items-center gap-2 mb-3">
            <AlertTriangle size={12} className="text-red-400 shrink-0" />
            <span className="font-mono text-[10px] text-red-400">{error}</span>
          </div>
        )}

        {loading && !data && (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="font-mono text-[10px] space-y-1.5 text-zinc-600">
              <p className="text-cyan-400 animate-pulse">▸ CNEOS SENTRY-II UPLINK</p>
              <p className="text-orange-400 animate-pulse" style={{ animationDelay: "0.15s" }}>▸ ESA NEOCC/AEGIS UPLINK</p>
              <p style={{ animationDelay: "0.3s" }}>▸ KEPLER SOLVER ε=10⁻¹⁴</p>
              <p style={{ animationDelay: "0.45s" }}>▸ YARKOVSKY SENSITIVITY FIELD</p>
              <p style={{ animationDelay: "0.6s" }}>▸ KEYHOLE RESONANCE SCAN</p>
              <p style={{ animationDelay: "0.75s" }}>▸ CORRIDOR GROUND-TRACK SWEEP</p>
              <p style={{ animationDelay: "0.85s" }}>▸ CLOSE APPROACH RADAR (CAD)</p>
              <p style={{ animationDelay: "0.9s" }}>▸ DEFLECTION Δv ENGINE</p>
              <p style={{ animationDelay: "0.95s" }}>▸ RISK EVOLUTION + ARC TRACKER</p>
              <p style={{ animationDelay: "1s" }}>▸ MONTE CARLO CORRIDOR + BLIND SPOT</p>
              <p style={{ animationDelay: "1.05s" }}>▸ CONSENSUS ENGINE + PUBLIC API</p>
              <p style={{ animationDelay: "1.1s" }}>▸ LIVE FEED + 3D ORBITAL VIEWER</p>
              <p className="text-emerald-400" style={{ animationDelay: "1.15s" }}>▸ READINESS ENGINE READY</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* KPI STRIP */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mb-3">
              <Kpi label="TRACKED" value={md?.nasaCount ?? 0} color="text-white" />
              <Kpi label="MATCHED" value={md?.matchedCount ?? 0} color="text-cyan-400" />
              <Kpi label="CRITICAL" value={md?.criticalCount ?? 0} color="text-red-400" />
              <Kpi label="YSI-HIGH" value={md?.ysiDominantCount ?? 0} color="text-amber-400" />
              <Kpi label="KEYHOLES" value={md?.keyholeAlertCount ?? 0} color="text-purple-400" />
              <Kpi label="CORRIDORS" value={md?.corridorCount ?? 0} color="text-orange-400" />
              <Kpi label="CONSENSUS" value={consensusStats.mean} color={consensusStats.mean > 70 ? "text-emerald-400" : consensusStats.mean > 40 ? "text-amber-400" : "text-red-400"} />
              <Kpi label="TOP RRS" value={md?.topReadinessScore ?? 0} color="text-emerald-400" />
            </div>

            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-3 rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  <OrbitsViewer threats={data.threats} selected={selected} />
                </div>
                <div className="lg:col-span-2 space-y-3">
                  <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-1.5">
                      <Activity size={10} className="text-emerald-400" /> PRIORITY DOSSIERS — RUBIN RRS
                    </p>
                    <div className="space-y-1">
                      {topReadiness.map((t) => (
                        <button key={t.designation} onClick={() => openDossier(t)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/30 transition-colors text-left group">
                          <span className={`font-mono text-[10px] font-bold w-7 ${t.readiness.priority === "CRITICAL" ? "text-red-400" : t.readiness.priority === "URGENT" ? "text-orange-400" : t.readiness.priority === "ELEVATED" ? "text-amber-400" : "text-emerald-400"}`}>{t.readiness.score}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-[10px] text-zinc-300 truncate">{t.designation}</p>
                            <div className="h-1 rounded-full bg-zinc-800 mt-0.5 overflow-hidden">
                              <div className={`h-full ${t.readiness.priority === "CRITICAL" ? "bg-red-500" : t.readiness.priority === "URGENT" ? "bg-orange-500" : t.readiness.priority === "ELEVATED" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${t.readiness.score}%` }} />
                            </div>
                          </div>
                          <ArrowUpRight size={10} className="text-zinc-700 group-hover:text-cyan-400 transition-colors shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* v3.5: CONSENSUS PANEL */}
                  <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                      <Share2 size={10} className="text-cyan-400" /> MULTI-AGENCY CONSENSUS
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div>
                        <p className={`font-mono text-sm font-bold ${consensusStats.mean > 70 ? "text-emerald-400" : consensusStats.mean > 40 ? "text-amber-400" : "text-red-400"}`}>{consensusStats.mean}</p>
                        <p className="text-[7px] font-mono text-zinc-700">MEAN SCORE</p>
                      </div>
                      <div>
                        <p className="font-mono text-sm font-bold text-red-400">{consensusStats.critical}</p>
                        <p className="text-[7px] font-mono text-zinc-700">CRITICAL GAP</p>
                      </div>
                      <div>
                        <p className="font-mono text-sm font-bold text-amber-400">{consensusStats.yarkDriven}</p>
                        <p className="text-[7px] font-mono text-zinc-700">YARK-DRIVEN</p>
                      </div>
                    </div>
                    <p className="text-[7px] font-mono text-zinc-700">
                      NASA IOBS+Yarkovsky vs ESA LOV grav-only • Fenucci 2024 §7.4
                    </p>
                  </div>

                  <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2">ENGINE LOG</p>
                    <div className="font-mono text-[9px] space-y-1 text-zinc-600">
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-cyan-400/70">SENTRY-II</span> {md?.nasaCount} objects locked</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-orange-400/70">NEOCC</span> {md?.esaCount} risk entries parsed</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-emerald-400/70">CROSS-MATCH</span> {md?.matchedCount} dual-agency pairs</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-amber-400/70">YARKOVSKY</span> {md?.ysiDominantCount} σ-dominated orbits</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-purple-400/70">KEYHOLE</span> {md?.keyholeAlertCount} resonance alerts</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-red-400/70">CORRIDOR</span> {md?.corridorCount} ground tracks projected</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-cyan-400/70">CAD</span> {approachData.length} close approaches tracked</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-emerald-400/70">DEFLECT</span> Δv engine + keyhole-aware planner online</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-cyan-400/70">TIMELINE</span> risk evolution + arc tracker online</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-purple-400/70">MC-CORRIDOR</span> Cholesky sampler + blind spot mapper online</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-emerald-400/70">CONSENSUS</span> multi-agency agreement engine v3.5 online</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-cyan-400/70">LIVE FEED</span> real-time alert stream v4.0 online</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-emerald-400/70">3D ORBITS</span> WebGL orbital renderer v4.0 online</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MATRIX */}
            {tab === "matrix" && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter size={10} className="text-zinc-700" />
                  {(["BOTH", "ALL", "NASA_ONLY", "ESA_ONLY"] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded text-[9px] font-mono transition-all border ${filter === f ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25" : "text-zinc-600 border-transparent hover:text-zinc-400"}`}>{f}</button>
                  ))}
                  <div className="relative ml-auto">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-700" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SEARCH DESIGNATION..." className="bg-zinc-900/60 border border-zinc-800/60 rounded pl-6 pr-2 py-1 text-[9px] font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-cyan-500/40 w-44" />
                  </div>
                  <span className="text-[9px] font-mono text-zinc-700">{filtered.length} obj</span>
                </div>
                <div className="rounded-lg border border-zinc-800/40 bg-[#080810]/50 overflow-hidden">
                  <div className="overflow-auto max-h-[62vh]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#080810] z-10">
                        <tr className="border-b border-zinc-800/50 text-[8px] font-mono text-zinc-600 uppercase tracking-wider">
                          <th className="px-2.5 py-2 text-left cursor-pointer hover:text-white" onClick={() => handleSort("designation")}><span className="flex items-center gap-0.5">Object <SortIcon col="designation" /></span></th>
                          <th className="px-2.5 py-2 text-right">km</th>
                          <th className="px-2.5 py-2 text-right cursor-pointer hover:text-cyan-400" onClick={() => handleSort("nasaIp")}><span className="flex items-center gap-0.5 justify-end text-cyan-400/50">NASA IP <SortIcon col="nasaIp" /></span></th>
                          <th className="px-2.5 py-2 text-right cursor-pointer hover:text-orange-400" onClick={() => handleSort("esaIp")}><span className="flex items-center gap-0.5 justify-end text-orange-400/50">ESA IP <SortIcon col="esaIp" /></span></th>
                          <th className="px-2.5 py-2 text-right cursor-pointer hover:text-white" onClick={() => handleSort("absPalermoDelta")}><span className="flex items-center gap-0.5 justify-end">ΔPS <SortIcon col="absPalermoDelta" /></span></th>
                          <th className="px-2.5 py-2 text-right cursor-pointer hover:text-amber-400" onClick={() => handleSort("ysi")}><span className="flex items-center gap-0.5 justify-end text-amber-400/50">YSI <SortIcon col="ysi" /></span></th>
                          <th className="px-2.5 py-2 text-right cursor-pointer hover:text-emerald-400" onClick={() => handleSort("rrs")}><span className="flex items-center gap-0.5 justify-end text-emerald-400/50">RRS <SortIcon col="rrs" /></span></th>
                          <th className="px-2.5 py-2 text-center">Sev</th>
                          <th className="px-2.5 py-2 text-center">{/* v3.5: Share */}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 100).map((t, i) => {
                          const isSel = selected?.designation === t.designation;
                          const sev = t.divergenceSeverity;
                          const sevCls = sev === "CRITICAL" ? "text-red-400 bg-red-500/10" : sev === "HIGH" ? "text-orange-400 bg-orange-500/10" : sev === "MODERATE" ? "text-amber-400 bg-amber-500/10" : sev === "LOW" ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-600 bg-zinc-800/30";
                          return (
                            <tr key={`${t.designation}-${i}`} onClick={() => openDossier(t)} className={`border-b border-zinc-800/20 cursor-pointer transition-colors ${isSel ? "bg-cyan-500/[0.05]" : "hover:bg-zinc-800/20"}`}>
                              <td className="px-2.5 py-1.5"><span className="font-mono text-[11px] text-zinc-200">{t.designation}</span><span className="block text-[8px] text-zinc-700 truncate max-w-[130px]">{t.fullname}</span></td>
                              <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-zinc-500">{(t.nasa.diameterKm > 0 ? t.nasa.diameterKm : t.esa.diameterM / 1000).toFixed(3)}</td>
                              <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-cyan-400/80">{sci(t.nasa.ip)}</td>
                              <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-orange-400/80">{sci(t.esa.ipCum)}</td>
                              <td className={`px-2.5 py-1.5 text-right font-mono text-[10px] ${Math.abs(safeNum(t.palermoDelta)) > 1 ? "text-red-400" : Math.abs(safeNum(t.palermoDelta)) > 0.3 ? "text-amber-400" : "text-emerald-400"}`}>{safeNum(t.palermoDelta) !== 0 ? (safeNum(t.palermoDelta) > 0 ? "+" : "") + safeNum(t.palermoDelta).toFixed(3) : "—"}</td>
                              <td className={`px-2.5 py-1.5 text-right font-mono text-[10px] ${t.ysi.classification === "DOMINANT" ? "text-red-400" : t.ysi.classification === "HIGH" ? "text-orange-400" : t.ysi.classification === "MODERATE" ? "text-amber-400" : "text-emerald-400/70"}`}>{t.ysi.ysi.toFixed(2)}</td>
                              <td className="px-2.5 py-1.5 text-right"><span className={`font-mono text-[10px] font-bold ${t.readiness.priority === "CRITICAL" ? "text-red-400" : t.readiness.priority === "URGENT" ? "text-orange-400" : t.readiness.priority === "ELEVATED" ? "text-amber-400" : "text-emerald-400/80"}`}>{t.readiness.score}</span></td>
                              <td className="px-2.5 py-1.5 text-center"><span className={`text-[7px] font-mono px-1 py-0.5 rounded ${sevCls}`}>{sev.slice(0, 4)}</span></td>
                              <td className="px-1.5 py-1.5 text-center">
                                <button onClick={(e) => { e.stopPropagation(); setShareCard(t); }} className="text-zinc-700 hover:text-cyan-400 transition-colors" title="Share threat card">
                                  <Share2 size={10} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* APPROACHES */}
            {tab === "approaches" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  {approachData.length > 0 ? (
                    <ApproachTimeline approaches={approachData} onSelect={(des) => { const found = data?.threats.find((t) => t.designation === des); if (found) openDossier(found); }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><div className="text-center"><Radar size={24} className="text-zinc-700 mx-auto mb-2 animate-pulse" /><p className="font-mono text-[10px] text-zinc-600">LOADING CLOSE APPROACH DATA FROM NASA CAD...</p><p className="font-mono text-[8px] text-zinc-700 mt-1">ssd-api.jpl.nasa.gov/cad.api</p></div></div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniKpi label="APPROACHES TRACKED" value={String(approachData.length)} color="text-cyan-400" />
                  <MiniKpi label="WITHIN 10 LD" value={String(approachData.filter((a) => a.approachesWithin10LD > 0).length)} color="text-amber-400" />
                  <MiniKpi label="WITHIN 1 LD" value={String(approachData.filter((a) => a.approachesWithin1LD > 0).length)} color="text-red-400" />
                  <MiniKpi label="NEAREST" value={approachData.length > 0 ? `${Math.min(...approachData.map((a) => a.nextApproachLD)).toFixed(2)} LD` : "—"} color="text-red-400" />
                </div>
              </div>
            )}

            {/* CORRIDORS */}
            {tab === "corridors" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "560px" }}>
                  <CorridorMap threats={data.threats} selected={selected} onSelect={openDossier} />
                </div>
                <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3 overflow-y-auto" style={{ maxHeight: "560px" }}>
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-1.5"><Target size={10} className="text-red-400" /> LONGEST GROUND TRACKS</p>
                  <div className="space-y-1">
                    {topCorridors.map((t) => (
                      <button key={t.designation} onClick={() => openDossier(t)} className={`w-full text-left px-2 py-1.5 rounded transition-colors hover:bg-zinc-800/30 ${selected?.designation === t.designation ? "bg-red-500/[0.06]" : ""}`}>
                        <div className="flex justify-between items-baseline"><span className="font-mono text-[10px] text-zinc-200">{t.designation}</span><span className="font-mono text-[9px] text-red-400/80">{t.corridor.lengthKm.toFixed(0)} km</span></div>
                        <p className="text-[8px] font-mono text-zinc-700">{t.corridor.centerLatDeg.toFixed(1)}°, {t.corridor.centerLonDeg.toFixed(1)}° • entry {t.corridor.entryVelocityKmS.toFixed(1)} km/s</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* KEYHOLES */}
            {tab === "keyholes" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  {keyholeFocus ? <BPlaneDiagram keyhole={keyholeFocus.keyhole} designation={keyholeFocus.designation} /> : <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-zinc-700">NO KEYHOLE CANDIDATES</div>}
                </div>
                <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3 overflow-y-auto" style={{ maxHeight: "520px" }}>
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-1.5"><KeyRound size={10} className="text-purple-400" /> RESONANT KEYHOLE SUSCEPTIBILITY</p>
                  <div className="space-y-1">
                    {topKeyholes.map((t) => (
                      <button key={t.designation} onClick={() => setSelected(t)} className={`w-full text-left px-2 py-1.5 rounded transition-colors hover:bg-zinc-800/30 ${selected?.designation === t.designation ? "bg-purple-500/[0.06]" : ""}`}>
                        <div className="flex justify-between items-baseline"><span className="font-mono text-[10px] text-zinc-200">{t.designation}</span><span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${t.keyhole.susceptibility === "HIGH" ? "text-red-400 bg-red-500/10" : t.keyhole.susceptibility === "ELEVATED" ? "text-amber-400 bg-amber-500/10" : "text-zinc-500 bg-zinc-800/40"}`}>{t.keyhole.susceptibility}</span></div>
                        <p className="text-[8px] font-mono text-zinc-700">{t.keyhole.keyholeCount} resonances • nearest {t.keyhole.nearestResonance}{isFinite(t.keyhole.sigmaFromKeyhole) ? ` • ${t.keyhole.sigmaFromKeyhole.toFixed(1)}σ` : ""}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* YARKOVSKY */}
            {tab === "yarkovsky" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  <YarkovskyScatter threats={data.threats} selected={selected} onSelect={openDossier} />
                </div>
                <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3 overflow-y-auto" style={{ maxHeight: "520px" }}>
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-1.5"><Zap size={10} className="text-amber-400" /> TOP YSI — MODEL DIVERGENCE DRIVERS</p>
                  <div className="space-y-1">
                    {topYsi.map((t) => (
                      <button key={t.designation} onClick={() => openDossier(t)} className="w-full text-left px-2 py-1.5 rounded transition-colors hover:bg-zinc-800/30">
                        <div className="flex justify-between items-baseline"><span className="font-mono text-[10px] text-zinc-200">{t.designation}</span><span className={`font-mono text-[10px] font-bold ${t.ysi.classification === "DOMINANT" ? "text-red-400" : t.ysi.classification === "HIGH" ? "text-orange-400" : "text-amber-400"}`}>{t.ysi.ysi.toFixed(2)}</span></div>
                        <p className="text-[8px] font-mono text-zinc-700">da/dt {t.ysi.daDtAUMyr.toExponential(2)} AU/Myr • Δs {t.ysi.alongTrackShiftKm.toExponential(1)} km</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RISK MATRIX */}
            {tab === "risk" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  <RiskMatrix threats={data.threats} selected={selected} onSelect={openDossier} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniKpi label="PS > 0 (CONCERNING)" value={String(data.threats.filter((t) => t.palermoNasaRecomputed > 0).length)} color="text-red-400" />
                  <MiniKpi label="PS > -2 (MONITOR)" value={String(data.threats.filter((t) => t.palermoNasaRecomputed > -2).length)} color="text-amber-400" />
                  <MiniKpi label="ENERGY > 1 Mt" value={String(data.threats.filter((t) => t.nasa.energyMt > 1).length)} color="text-orange-400" />
                  <MiniKpi label="ENERGY > 1000 Mt" value={String(data.threats.filter((t) => t.nasa.energyMt > 1000).length)} color="text-red-400" />
                </div>
              </div>
            )}

            {/* DEFLECTION */}
            {tab === "deflect" && (
              <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "640px" }}>
                <DeflectionPlanner threats={data.threats} selected={selected} />
              </div>
            )}

            {/* TIMELINE */}
            {tab === "timeline" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select value={timelineTarget} onChange={(e) => { setTimelineTarget(e.target.value); fetchTimeline(e.target.value); }} className="bg-zinc-900/80 border border-zinc-700/50 rounded px-2.5 py-1.5 text-[10px] font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/40 w-64">
                    <option value="">— SELECT OBJECT FOR TIMELINE —</option>
                    {data.threats.slice(0, 50).map((t) => (
                      <option key={t.designation} value={t.designation}>{t.designation} (IP: {t.nasa.ip > 0 ? t.nasa.ip.toExponential(1) : "—"})</option>
                    ))}
                  </select>
                  {timelineLoading && <span className="text-[9px] font-mono text-cyan-400 animate-pulse">COMPUTING EVOLUTION...</span>}
                </div>
                {timelineData ? (
                  <>
                    <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "440px" }}>
                      <RiskTimeline timeline={timelineData.riskEvolution.timeline} trend={timelineData.riskEvolution.trend} arc={timelineData.observationArc.arc} designation={timelineTarget} currentIP={timelineData.current.ip} lossDateYearsFromNow={timelineData.observationArc.lossDateYearsFromNow} yarkovskyDominanceYears={timelineData.observationArc.yarkovskyDominanceYears} recommendation={timelineData.riskEvolution.recommendation} nasaEsaDivergenceTrend={timelineData.riskEvolution.nasaEsaDivergenceTrend} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <MiniKpi label="ARC LENGTH" value={`${timelineData.observationArc.arc.arcLengthDays.toFixed(0)} d`} color="text-cyan-400" />
                      <MiniKpi label="ARC QUALITY" value={timelineData.observationArc.arc.arcQuality} color={timelineData.observationArc.arc.arcQuality === "EXCELLENT" || timelineData.observationArc.arc.arcQuality === "GOOD" ? "text-emerald-400" : timelineData.observationArc.arc.arcQuality === "MODERATE" ? "text-amber-400" : "text-red-400"} />
                      <MiniKpi label="LOSS IN" value={isFinite(timelineData.observationArc.lossDateYearsFromNow) ? `${timelineData.observationArc.lossDateYearsFromNow.toFixed(1)} yr` : "—"} color={timelineData.observationArc.lossDateYearsFromNow < 5 ? "text-red-400" : "text-emerald-400"} />
                      <MiniKpi label="TREND" value={timelineData.riskEvolution.trend.direction} color={timelineData.riskEvolution.trend.direction === "RISING" ? "text-red-400" : timelineData.riskEvolution.trend.direction === "FALLING" ? "text-emerald-400" : "text-amber-400"} />
                    </div>
                    <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                      <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1.5">ENGINE RECOMMENDATION</p>
                      <p className="text-[9px] font-mono text-zinc-300 leading-relaxed">{timelineData.riskEvolution.recommendation}</p>
                      <p className="text-[8px] font-mono text-zinc-600 mt-2">{timelineData.observationArc.recommendation}</p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-8 text-center">
                    <Clock size={24} className="text-zinc-700 mx-auto mb-2" />
                    <p className="font-mono text-[10px] text-zinc-600">Select an object to compute its risk evolution timeline</p>
                    <p className="font-mono text-[8px] text-zinc-700 mt-1">Models IP(t) from uncertainty growth + Yarkovsky drift + geometric convergence</p>
                  </div>
                )}
              </div>
            )}

            {/* BLIND SPOT */}
            {tab === "blindspot" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "520px" }}>
                  <BlindSpotMap />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniKpi label="140m+ UNDISCOVERED" value="~15,000" color="text-red-400" />
                  <MiniKpi label="SOLAR BLIND ZONE" value="±45° elongation" color="text-amber-400" />
                  <MiniKpi label="NEO SURVEYOR" value="2027-2028" color="text-cyan-400" />
                  <MiniKpi label="RUBIN FIRST LIGHT" value="2026" color="text-emerald-400" />
                </div>
                <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1.5">BLIND SPOT ANALYSIS</p>
                  <p className="text-[9px] font-mono text-zinc-300 leading-relaxed">
                    Only 43% of 140m+ near-Earth asteroids have been discovered. The remaining ~15,000 objects
                    are concentrated in the solar elongation blind zone (within ±45° of the Sun) where ground-based
                    surveys cannot observe. The southern ecliptic hemisphere is under-covered until Rubin/LSST
                    achieves full operations. A city-killer approaching from the sunward direction would provide
                    less than 24 hours warning. NEO Surveyor (IR space telescope, 2027-2028) will address this gap.
                  </p>
                  <p className="text-[7px] font-mono text-zinc-700 mt-2">Reference: NASA OIG IG-25-006 • Mainzer et al. (2019) • Chesley et al. (2024)</p>
                </div>
              </div>
            )}

            {/* LIVE FEED — Phase 4.0 */}
            {tab === "live" && (
              <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "560px" }}>
                <LiveFeed />
              </div>
            )}

            {/* 3D ORBITS — Phase 4.0 */}
            {tab === "3d" && (
              <div className="rounded-lg border border-zinc-800/50 overflow-hidden" style={{ height: "560px" }}>
                <Orbital3D threats={data.threats} selected={selected} onSelect={openDossier} />
              </div>
            )}

            {/* RUBIN FEED */}
            {tab === "rubin" && (
              <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-zinc-800/50 flex items-center justify-between">
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-1.5"><Activity size={10} className="text-emerald-400" /> RUBIN FOLLOW-UP PRIORITY QUEUE</p>
                  <span className="text-[8px] font-mono text-zinc-700">LSST 7M alerts/night triage</span>
                </div>
                <div className="overflow-auto max-h-[62vh]">
                  {[...data.threats].sort((a, b) => b.readiness.score - a.readiness.score).slice(0, 60).map((t, rank) => (
                    <button key={t.designation} onClick={() => openDossier(t)} className="w-full flex items-center gap-3 px-3 py-2 border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors text-left">
                      <span className="font-mono text-[10px] text-zinc-700 w-6">#{rank + 1}</span>
                      <div className="w-40 min-w-0"><p className="font-mono text-[11px] text-zinc-200 truncate">{t.designation}</p><p className="text-[8px] font-mono text-zinc-700 truncate">{t.fullname}</p></div>
                      <div className="flex-1 h-2 rounded-full bg-zinc-800/60 overflow-hidden">
                        <div className={`h-full rounded-full ${t.readiness.priority === "CRITICAL" ? "bg-gradient-to-r from-red-600 to-red-400" : t.readiness.priority === "URGENT" ? "bg-gradient-to-r from-orange-600 to-orange-400" : t.readiness.priority === "ELEVATED" ? "bg-gradient-to-r from-amber-600 to-amber-400" : "bg-gradient-to-r from-emerald-700 to-emerald-500"}`} style={{ width: `${t.readiness.score}%` }} />
                      </div>
                      <span className={`font-mono text-sm font-black w-8 text-right ${t.readiness.priority === "CRITICAL" ? "text-red-400" : t.readiness.priority === "URGENT" ? "text-orange-400" : t.readiness.priority === "ELEVATED" ? "text-amber-400" : "text-emerald-400"}`}>{t.readiness.score}</span>
                      <span className={`hidden sm:inline text-[7px] font-mono px-1.5 py-0.5 rounded w-16 text-center ${t.readiness.priority === "CRITICAL" ? "text-red-400 bg-red-500/10" : t.readiness.priority === "URGENT" ? "text-orange-400 bg-orange-500/10" : t.readiness.priority === "ELEVATED" ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>{t.readiness.priority}</span>
                      <div className="hidden md:flex gap-1 w-56">
                        {t.readiness.factors.slice(0, 2).map((f) => (
                          <span key={f} className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-800 whitespace-nowrap">{f}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800/30 px-5 py-2 mt-2">
        <div className="max-w-[1920px] mx-auto flex flex-wrap justify-between gap-2 text-[7px] font-mono text-zinc-800">
          <span>PS = log₁₀(IP/(0.03·E^(-4/5)·T)) • KEPLER ε=10⁻¹⁴ • YARKOVSKY: VOKROUHLICKÝ 1998 • CORRIDORS: CHODAS 2015 • KEYHOLES: GREENBERG 2002 • CAD: CNEOS 2026 • DEFLECTION: CARUSI 2002 / DART β=3.61 • ARC: BOWELL 2002 • RISK EVOLUTION: CHESLEY 2005 • MC-CORRIDOR: MUINONEN 2001 • CHOLESKY: PRESS 2007 • BLIND SPOT: NASA OIG IG-25-006 • CONSENSUS: FENUCCI 2024 §7.4</span>
          <span>ENGINE v4.0 • NOT FOR OPERATIONAL USE • API: /api/docs</span>
        </div>
      </footer>

      {/* DOSSIER */}
      {dossierTarget && <ObjectDossier threat={dossierTarget} onClose={() => setDossierTarget(null)} />}

      {/* v3.5: SHARE CARD MODAL */}
      {shareCard && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShareCard(null)} />
          <div className="relative w-full max-w-sm">
            <ThreatCard
              threat={shareCard}
              consensusScore={consensusMap.get(shareCard.designation)}
              onClose={() => setShareCard(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/40 bg-[#080810]/50 px-2 py-1.5">
      <p className="text-[7px] font-mono text-zinc-700 uppercase tracking-wider truncate">{label}</p>
      <p className={`font-mono text-sm sm:text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/40 bg-[#080810]/50 px-2.5 py-2">
      <p className="text-[7px] font-mono text-zinc-700 uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border ${ok ? "text-emerald-400 border-emerald-500/15 bg-emerald-500/5" : "text-red-400 border-red-500/15 bg-red-500/5"}`}>
      {ok ? <Wifi size={8} /> : <WifiOff size={8} />}{label}
    </span>
  );
}