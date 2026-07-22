"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
  Wifi, WifiOff, Filter, Search, LayoutDashboard, Table2,
  Target, KeyRound, Zap, Activity, ArrowUpRight,
} from "lucide-react";
import OrbitsViewer from "@/components/OrbitsViewer";
import CorridorMap from "@/components/CorridorMap";
import BPlaneDiagram from "@/components/BPlaneDiagram";
import YarkovskyScatter from "@/components/YarkovskyScatter";
import ObjectDossier from "@/components/ObjectDossier";
import type { AdvancedThreat, ThreatsApiResponse } from "@/lib/engine/types";

type TabId = "overview" | "matrix" | "corridors" | "keyholes" | "yarkovsky" | "rubin";

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

  const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "OVERVIEW", icon: <LayoutDashboard size={11} /> },
    { id: "matrix", label: "MATRIX", icon: <Table2 size={11} /> },
    { id: "corridors", label: "CORRIDORS", icon: <Target size={11} /> },
    { id: "keyholes", label: "KEYHOLES", icon: <KeyRound size={11} /> },
    { id: "yarkovsky", label: "YARKOVSKY", icon: <Zap size={11} /> },
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
                <span className="ml-2 text-[8px] font-mono text-cyan-400/60 border border-cyan-500/20 rounded px-1 py-0.5 align-middle">v3.0</span>
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
              <p className="text-emerald-400" style={{ animationDelay: "0.9s" }}>▸ READINESS ENGINE READY</p>
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
              <Kpi label="RRS CRIT" value={md?.readinessCriticalCount ?? 0} color="text-red-400" />
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
                  <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2">ENGINE LOG</p>
                    <div className="font-mono text-[9px] space-y-1 text-zinc-600">
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-cyan-400/70">SENTRY-II</span> {md?.nasaCount} objects locked</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-orange-400/70">NEOCC</span> {md?.esaCount} risk entries parsed</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-emerald-400/70">CROSS-MATCH</span> {md?.matchedCount} dual-agency pairs</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-amber-400/70">YARKOVSKY</span> {md?.ysiDominantCount} σ-dominated orbits</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-purple-400/70">KEYHOLE</span> {md?.keyholeAlertCount} resonance alerts</p>
                      <p><span className="text-zinc-700">[{utc}]</span> <span className="text-red-400/70">CORRIDOR</span> {md?.corridorCount} ground tracks projected</p>
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
          <span>PS = log₁₀(IP/(0.03·E^(-4/5)·T)) • KEPLER ε=10⁻¹⁴ • YARKOVSKY: VOKROUHLICKÝ 1998 • CORRIDORS: CHODAS 2015 • KEYHOLES: GREENBERG 2002</span>
          <span>ENGINE v3.0 • NOT FOR OPERATIONAL USE</span>
        </div>
      </footer>

      {/* DOSSIER */}
      {dossierTarget && <ObjectDossier threat={dossierTarget} onClose={() => setDossierTarget(null)} />}
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

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border ${ok ? "text-emerald-400 border-emerald-500/15 bg-emerald-500/5" : "text-red-400 border-red-500/15 bg-red-500/5"}`}>
      {ok ? <Wifi size={8} /> : <WifiOff size={8} />}{label}
    </span>
  );
}
