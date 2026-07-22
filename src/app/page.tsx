"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  Activity,
  Radio,
  Globe2,
  TrendingUp,
  Database,
  Zap,
  Crosshair,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wifi,
  WifiOff,
  Filter,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { DivergenceMetrics, ThreatsApiResponse } from "@/lib/engine/types";

const OrbitsViewer = dynamic(() => import("@/components/OrbitsViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#030308]">
      <p className="font-mono text-xs text-zinc-600 animate-pulse">
        INITIALIZING WEBGL...
      </p>
    </div>
  ),
});

function sci(val: number): string {
  if (val === 0) return "0";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) return val.toExponential(2);
  return val.toFixed(6);
}

function safeNum(val: unknown): number {
  if (typeof val === "number" && isFinite(val)) return val;
  return 0;
}

export default function Home() {
  const [data, setData] = useState<ThreatsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("palermoDelta");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<DivergenceMetrics | null>(null);
  const [showGlobe, setShowGlobe] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "BOTH" | "NASA_ONLY" | "ESA_ONLY">("BOTH");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchThreats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/threats", { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json: ThreatsApiResponse = await res.json();
      setData(json);
      setLastRefresh(new Date());
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
    if (filter !== "ALL") {
      list = list.filter((t) => t.sourceMatch === filter);
    }
    return [...list].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "designation":
          return sortAsc
            ? a.designation.localeCompare(b.designation)
            : b.designation.localeCompare(a.designation);
        case "nasaIp":
          av = safeNum(a.nasa?.ip);
          bv = safeNum(b.nasa?.ip);
          break;
        case "esaIp":
          av = safeNum(a.esa?.ipCum);
          bv = safeNum(b.esa?.ipCum);
          break;
        case "palermoDelta":
          av = safeNum(a.palermoDelta);
          bv = safeNum(b.palermoDelta);
          break;
        case "probabilityRatio":
          av = safeNum(a.probabilityRatio);
          bv = safeNum(b.probabilityRatio);
          break;
        case "spatialDivergenceKm":
          av = safeNum(a.spatialDivergenceKm);
          bv = safeNum(b.spatialDivergenceKm);
          break;
        default:
          av = safeNum(a.palermoDelta);
          bv = safeNum(b.palermoDelta);
      }
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, filter, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: string }) =>
    sortKey === col ? (
      sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />
    ) : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#030308]">
      {/* ═══ HEADER ═══ */}
      <header className="border-b border-zinc-800/60 bg-[#0a0a12]/90 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Shield className="w-9 h-9 text-cyan-400" strokeWidth={1.5} />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white leading-none">
                AEGIS<span className="text-cyan-400">-</span>SENTRY
                <span className="ml-2 text-sm font-light text-zinc-500">
                  DIVERGENCE WATCH
                </span>
              </h1>
              <p className="text-[10px] font-mono text-zinc-600 tracking-[0.2em] uppercase mt-0.5">
                Planetary Defense Risk Reconciliation • NASA Sentry-II ↔ ESA NEOCC/Aegis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <div className="hidden md:flex items-center gap-2">
                <StatusPill ok={data.metadata.nasaApiStatus === "OK"} label="NASA" />
                <StatusPill ok={data.metadata.esaApiStatus === "OK"} label="ESA" />
              </div>
            )}
            <button
              onClick={fetchThreats}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 hover:border-cyan-500/40 hover:bg-zinc-800 transition-all text-xs font-mono text-zinc-300 disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "SYNCING" : "REFRESH"}
            </button>
          </div>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1920px] mx-auto w-full">
        {/* LEFT PANEL */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-y-auto max-h-[calc(100vh-60px)]">
          {/* STAT CARDS */}
          {data && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <Stat label="NASA" value={data.metadata.nasaCount} color="text-cyan-400" />
              <Stat label="ESA" value={data.metadata.esaCount} color="text-orange-400" />
              <Stat label="MATCHED" value={data.metadata.matchedCount} color="text-white" />
              <Stat label="NASA ONLY" value={data.metadata.nasaOnlyCount} color="text-cyan-400/60" />
              <Stat label="ESA ONLY" value={data.metadata.esaOnlyCount} color="text-orange-400/60" />
              <Stat label="CRITICAL" value={data.metadata.criticalCount} color="text-red-400" />
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span className="font-mono text-xs text-red-400">{error}</span>
            </div>
          )}

          {/* LOADING */}
          {loading && !data && (
            <div className="flex-1 flex items-center justify-center">
              <div className="font-mono text-xs space-y-1.5 text-zinc-600">
                <p className="text-cyan-400 animate-pulse">▸ UPLINK → CNEOS SENTRY-II</p>
                <p className="text-orange-400 animate-pulse" style={{ animationDelay: "0.2s" }}>▸ UPLINK → ESA NEOCC/AEGIS</p>
                <p style={{ animationDelay: "0.4s" }}>▸ KEPLER SOLVER ε=10⁻¹⁴</p>
                <p style={{ animationDelay: "0.6s" }}>▸ YARKOVSKY da/dt COMPUTE</p>
                <p className="text-emerald-400" style={{ animationDelay: "0.8s" }}>▸ DIVERGENCE MATRIX READY</p>
              </div>
            </div>
          )}

          {/* FILTER BAR */}
          {data && data.threats.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter size={12} className="text-zinc-600" />
              {(["BOTH", "ALL", "NASA_ONLY", "ESA_ONLY"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-[10px] font-mono transition-all ${
                    filter === f
                      ? f === "BOTH"
                        ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                        : f === "NASA_ONLY"
                        ? "bg-cyan-500/10 text-cyan-400/80 border border-cyan-500/20"
                        : f === "ESA_ONLY"
                        ? "bg-orange-500/10 text-orange-400/80 border border-orange-500/20"
                        : "bg-zinc-700/50 text-white border border-zinc-600/50"
                      : "bg-transparent text-zinc-600 border border-transparent hover:text-zinc-400"
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto text-[10px] font-mono text-zinc-600">
                {filtered.length} objects
              </span>
            </div>
          )}

          {/* TABLE */}
          {data && filtered.length > 0 && (
            <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a12]/60 backdrop-blur overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto flex-1">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#0a0a12] z-10">
                    <tr className="border-b border-zinc-800/60 text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left cursor-pointer hover:text-white" onClick={() => handleSort("designation")}>
                        <span className="flex items-center gap-1">Object <SortIcon col="designation" /></span>
                      </th>
                      <th className="px-3 py-2.5 text-right">Dia km</th>
                      <th className="px-3 py-2.5 text-right cursor-pointer hover:text-cyan-400" onClick={() => handleSort("nasaIp")}>
                        <span className="flex items-center gap-1 justify-end text-cyan-400/60">NASA IP <SortIcon col="nasaIp" /></span>
                      </th>
                      <th className="px-3 py-2.5 text-right cursor-pointer hover:text-orange-400" onClick={() => handleSort("esaIp")}>
                        <span className="flex items-center gap-1 justify-end text-orange-400/60">ESA IP <SortIcon col="esaIp" /></span>
                      </th>
                      <th className="px-3 py-2.5 text-right cursor-pointer hover:text-white" onClick={() => handleSort("palermoDelta")}>
                        <span className="flex items-center gap-1 justify-end">ΔPS <SortIcon col="palermoDelta" /></span>
                      </th>
                      <th className="px-3 py-2.5 text-right cursor-pointer hover:text-white" onClick={() => handleSort("probabilityRatio")}>
                        <span className="flex items-center gap-1 justify-end">Ratio <SortIcon col="probabilityRatio" /></span>
                      </th>
                      <th className="px-3 py-2.5 text-center">Sev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 100).map((t, i) => {
                      const isSel = selected?.designation === t.designation;
                      const sevColor =
                        t.divergenceSeverity === "CRITICAL" ? "text-red-400 bg-red-500/10" :
                        t.divergenceSeverity === "HIGH" ? "text-orange-400 bg-orange-500/10" :
                        t.divergenceSeverity === "MODERATE" ? "text-amber-400 bg-amber-500/10" :
                        t.divergenceSeverity === "LOW" ? "text-emerald-400 bg-emerald-500/10" :
                        "text-zinc-500 bg-zinc-700/20";
                      return (
                        <tr
                          key={`${t.designation}-${i}`}
                          onClick={() => setSelected(isSel ? null : t)}
                          className={`border-b border-zinc-800/30 cursor-pointer transition-colors ${
                            isSel ? "bg-cyan-500/[0.06]" : "hover:bg-zinc-800/30"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-white">{t.designation}</span>
                            <span className="block text-[9px] text-zinc-600 truncate max-w-[140px]">{t.fullname}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11px] text-zinc-400">
                            {(t.nasa.diameterKm > 0 ? t.nasa.diameterKm : t.esa.diameterM / 1000).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11px] text-cyan-400">
                            {t.nasa.ip > 0 ? sci(t.nasa.ip) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11px] text-orange-400">
                            {t.esa.ipCum > 0 ? sci(t.esa.ipCum) : "—"}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono text-[11px] ${
                            Math.abs(safeNum(t.palermoDelta)) > 1 ? "text-red-400" :
                            Math.abs(safeNum(t.palermoDelta)) > 0.3 ? "text-amber-400" : "text-emerald-400"
                          }`}>
                            {safeNum(t.palermoDelta) > 0 ? "+" : ""}{safeNum(t.palermoDelta).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11px] text-zinc-400">
                            {safeNum(t.probabilityRatio) > 0 && safeNum(t.probabilityRatio) < 900
                              ? safeNum(t.probabilityRatio).toFixed(2) + "×"
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${sevColor}`}>
                              {t.divergenceSeverity.slice(0, 4)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DETAIL PANEL */}
          {selected && (
            <div className="rounded-lg border border-zinc-700/50 bg-[#0a0a12]/80 backdrop-blur p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-sm text-white flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  {selected.designation}
                  <span className="text-zinc-600 text-xs font-normal">{selected.fullname}</span>
                </h3>
                <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-white text-xs font-mono">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* NASA */}
                <div className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.03] p-3 space-y-1.5">
                  <p className="text-[9px] font-mono text-cyan-400 uppercase tracking-[0.15em] flex items-center gap-1">
                    <Radio size={9} /> NASA Sentry-II
                  </p>
                  <Row l="Impact Prob" v={sci(safeNum(selected.nasa.ip))} />
                  <Row l="Palermo (rep)" v={safeNum(selected.nasa.psCum).toFixed(3)} />
                  <Row l="Palermo (calc)" v={safeNum(selected.palermoNasaRecomputed).toFixed(4)} />
                  <Row l="Torino" v={String(selected.nasa.tsMax)} />
                  <Row l="V∞ km/s" v={safeNum(selected.nasa.vInfKmS).toFixed(2)} />
                  <Row l="Energy Mt" v={safeNum(selected.nasa.energyMt).toExponential(2)} />
                  <Row l="Method" v={selected.nasa.method || "IOBS"} />
                  <p className="text-[8px] font-mono text-cyan-400/50 pt-1 border-t border-cyan-500/10">
                    {selected.nasa.hasNonGrav ? "✓ YARKOVSKY A1,A2" : "✗ NO NON-GRAV"}
                  </p>
                </div>

                {/* ESA */}
                <div className="rounded-md border border-orange-500/15 bg-orange-500/[0.03] p-3 space-y-1.5">
                  <p className="text-[9px] font-mono text-orange-400 uppercase tracking-[0.15em] flex items-center gap-1">
                    <Radio size={9} /> ESA NEOCC/Aegis
                  </p>
                  <Row l="Impact Prob" v={sci(safeNum(selected.esa.ipCum))} />
                  <Row l="Palermo (rep)" v={safeNum(selected.esa.psCum).toFixed(3)} />
                  <Row l="Palermo (calc)" v={safeNum(selected.palermoEsaRecomputed).toFixed(4)} />
                  <Row l="Torino" v={String(selected.esa.torinoScale)} />
                  <Row l="V imp km/s" v={safeNum(selected.esa.velocityKmS).toFixed(2)} />
                  <Row l="Diameter m" v={safeNum(selected.esa.diameterM).toFixed(0)} />
                  <Row l="VI Date" v={selected.esa.viMaxDate || "—"} />
                  <p className="text-[8px] font-mono text-orange-400/50 pt-1 border-t border-orange-500/10">
                    ✗ GRAV-ONLY (NO A3)
                  </p>
                </div>

                {/* DIVERGENCE */}
                <div className="rounded-md border border-red-500/15 bg-red-500/[0.03] p-3 space-y-1.5">
                  <p className="text-[9px] font-mono text-red-400 uppercase tracking-[0.15em] flex items-center gap-1">
                    <AlertTriangle size={9} /> Divergence
                  </p>
                  <Row l="IP Ratio" v={safeNum(selected.probabilityRatio).toFixed(3) + "×"} />
                  <Row l="ΔPS" v={safeNum(selected.palermoDelta).toFixed(4)} />
                  <Row l="Δr km" v={safeNum(selected.spatialDivergenceKm).toFixed(1)} />
                  <Row l="da/dt AU/Myr" v={(safeNum(selected.yarkovskyDriftAUDay) * 365.25e6).toExponential(2)} />
                  <Row l="Severity" v={selected.divergenceSeverity} />
                  <div className="flex gap-3 pt-1 border-t border-red-500/10">
                    <a href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(selected.designation)}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-cyan-400/60 hover:text-cyan-400 flex items-center gap-0.5">
                      <ExternalLink size={8} /> NASA
                    </a>
                    <a href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(selected.designation)}.risk`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-orange-400/60 hover:text-orange-400 flex items-center gap-0.5">
                      <ExternalLink size={8} /> ESA
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: GLOBE */}
        {showGlobe && (
          <div className="w-full lg:w-[42%] h-[35vh] lg:h-[calc(100vh-60px)] border-l border-zinc-800/40 relative">
            <OrbitsViewer threats={data?.threats ?? []} selected={selected} />
            <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-md bg-[#0a0a12]/80 border border-zinc-800/50 backdrop-blur">
              <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                <Globe2 size={9} className="text-cyan-400" /> TRAJECTORY VIEW
              </span>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800/40 bg-[#0a0a12]/60 px-6 py-2">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between text-[8px] font-mono text-zinc-700">
          <span>PS = log₁₀(IP / (0.03·E^(-4/5)·T)) • Kepler ε=10⁻¹⁴ • Yarkovsky: Vokrouhlický (1998)</span>
          <span>NASA/JPL CNEOS + ESA NEOCC • NOT FOR OPERATIONAL USE</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/50 bg-[#0a0a12]/60 px-3 py-2">
      <p className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[9px] text-zinc-600">{l}</span>
      <span className="font-mono text-[11px] text-zinc-300">{v}</span>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border ${
      ok ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-red-400 border-red-500/20 bg-red-500/5"
    }`}>
      {ok ? <Wifi size={9} /> : <WifiOff size={9} />}
      {label}
    </span>
  );
}