"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  Radio,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wifi,
  WifiOff,
  Filter,
} from "lucide-react";
import OrbitsViewer from "@/components/OrbitsViewer";
import type { DivergenceMetrics, ThreatsApiResponse } from "@/lib/engine/types";

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
  const [sortKey, setSortKey] = useState("absPalermoDelta");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<DivergenceMetrics | null>(null);
  const [showGlobe, setShowGlobe] = useState(true);
  const [filter, setFilter] = useState<"BOTH" | "ALL" | "NASA_ONLY" | "ESA_ONLY">("BOTH");

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
        case "absPalermoDelta":
          av = Math.abs(safeNum(a.palermoDelta));
          bv = Math.abs(safeNum(b.palermoDelta));
          break;
        case "probabilityRatio":
          av = safeNum(a.probabilityRatio);
          bv = safeNum(b.probabilityRatio);
          break;
        default:
          av = Math.abs(safeNum(a.palermoDelta));
          bv = Math.abs(safeNum(b.palermoDelta));
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
      sortAsc ? <ChevronUp size={9} /> : <ChevronDown size={9} />
    ) : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#030308]">
      {/* HEADER */}
      <header className="border-b border-zinc-800/50 bg-[#080810]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Shield className="w-8 h-8 text-cyan-400" strokeWidth={1.5} />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white leading-none">
                AEGIS<span className="text-cyan-400">·</span>SENTRY
                <span className="ml-2 text-xs font-normal text-zinc-500 tracking-wide">
                  DIVERGENCE WATCH
                </span>
              </h1>
              <p className="text-[9px] font-mono text-zinc-600 tracking-[0.15em] uppercase mt-0.5">
                NASA Sentry-II ↔ ESA NEOCC/Aegis • Palermo Scale Reconciliation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="hidden sm:flex items-center gap-1.5">
                <Pill ok={data.metadata.nasaApiStatus === "OK"} label="NASA" />
                <Pill ok={data.metadata.esaApiStatus === "OK"} label="ESA" />
              </div>
            )}
            <button
              onClick={fetchThreats}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[10px] font-mono text-zinc-400 disabled:opacity-40"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              {loading ? "SYNC" : "REFRESH"}
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1920px] mx-auto w-full">
        {/* LEFT */}
        <div className="flex-1 flex flex-col min-w-0 p-3 gap-2.5 overflow-y-auto max-h-[calc(100vh-52px)]">
          {/* STATS */}
          {data && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              <Stat label="NASA" value={data.metadata.nasaCount} color="text-cyan-400" />
              <Stat label="ESA" value={data.metadata.esaCount} color="text-orange-400" />
              <Stat label="MATCHED" value={data.metadata.matchedCount} color="text-white" />
              <Stat label="NASA ONLY" value={data.metadata.nasaOnlyCount} color="text-cyan-400/50" />
              <Stat label="ESA ONLY" value={data.metadata.esaOnlyCount} color="text-orange-400/50" />
              <Stat label="CRITICAL" value={data.metadata.criticalCount} color="text-red-400" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 flex items-center gap-2">
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
              <span className="font-mono text-[10px] text-red-400">{error}</span>
            </div>
          )}

          {loading && !data && (
            <div className="flex-1 flex items-center justify-center">
              <div className="font-mono text-[10px] space-y-1 text-zinc-600">
                <p className="text-cyan-400 animate-pulse">▸ CNEOS SENTRY-II UPLINK</p>
                <p className="text-orange-400 animate-pulse" style={{ animationDelay: "0.2s" }}>
                  ▸ ESA NEOCC/AEGIS UPLINK
                </p>
                <p style={{ animationDelay: "0.4s" }}>▸ KEPLER SOLVER ε=10⁻¹⁴</p>
                <p style={{ animationDelay: "0.6s" }}>▸ YARKOVSKY da/dt</p>
                <p className="text-emerald-400" style={{ animationDelay: "0.8s" }}>▸ READY</p>
              </div>
            </div>
          )}

          {/* FILTERS */}
          {data && (
            <div className="flex items-center gap-1.5">
              <Filter size={10} className="text-zinc-700" />
              {(["BOTH", "ALL", "NASA_ONLY", "ESA_ONLY"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-[9px] font-mono transition-all border ${
                    filter === f
                      ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25"
                      : "text-zinc-600 border-transparent hover:text-zinc-400"
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto text-[9px] font-mono text-zinc-700">
                {filtered.length} obj
              </span>
            </div>
          )}

          {/* TABLE */}
          {data && filtered.length > 0 && (
            <div className="rounded-lg border border-zinc-800/40 bg-[#080810]/50 overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto flex-1">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#080810] z-10">
                    <tr className="border-b border-zinc-800/50 text-[8px] font-mono text-zinc-600 uppercase tracking-wider">
                      <th
                        className="px-2.5 py-2 text-left cursor-pointer hover:text-white"
                        onClick={() => handleSort("designation")}
                      >
                        <span className="flex items-center gap-0.5">
                          Object <SortIcon col="designation" />
                        </span>
                      </th>
                      <th className="px-2.5 py-2 text-right">km</th>
                      <th
                        className="px-2.5 py-2 text-right cursor-pointer hover:text-cyan-400"
                        onClick={() => handleSort("nasaIp")}
                      >
                        <span className="flex items-center gap-0.5 justify-end text-cyan-400/50">
                          NASA IP <SortIcon col="nasaIp" />
                        </span>
                      </th>
                      <th
                        className="px-2.5 py-2 text-right cursor-pointer hover:text-orange-400"
                        onClick={() => handleSort("esaIp")}
                      >
                        <span className="flex items-center gap-0.5 justify-end text-orange-400/50">
                          ESA IP <SortIcon col="esaIp" />
                        </span>
                      </th>
                      <th
                        className="px-2.5 py-2 text-right cursor-pointer hover:text-white"
                        onClick={() => handleSort("absPalermoDelta")}
                      >
                        <span className="flex items-center gap-0.5 justify-end">
                          ΔPS <SortIcon col="absPalermoDelta" />
                        </span>
                      </th>
                      <th
                        className="px-2.5 py-2 text-right cursor-pointer hover:text-white"
                        onClick={() => handleSort("probabilityRatio")}
                      >
                        <span className="flex items-center gap-0.5 justify-end">
                          Ratio <SortIcon col="probabilityRatio" />
                        </span>
                      </th>
                      <th className="px-2.5 py-2 text-center">Sev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 80).map((t, i) => {
                      const isSel = selected?.designation === t.designation;
                      const sev = t.divergenceSeverity;
                      const sevCls =
                        sev === "CRITICAL"
                          ? "text-red-400 bg-red-500/10"
                          : sev === "HIGH"
                            ? "text-orange-400 bg-orange-500/10"
                            : sev === "MODERATE"
                              ? "text-amber-400 bg-amber-500/10"
                              : sev === "LOW"
                                ? "text-emerald-400 bg-emerald-500/10"
                                : "text-zinc-600 bg-zinc-800/30";
                      return (
                        <tr
                          key={`${t.designation}-${i}`}
                          onClick={() => setSelected(isSel ? null : t)}
                          className={`border-b border-zinc-800/20 cursor-pointer transition-colors ${
                            isSel ? "bg-cyan-500/[0.05]" : "hover:bg-zinc-800/20"
                          }`}
                        >
                          <td className="px-2.5 py-1.5">
                            <span className="font-mono text-[11px] text-zinc-200">
                              {t.designation}
                            </span>
                            <span className="block text-[8px] text-zinc-700 truncate max-w-[120px]">
                              {t.fullname}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-zinc-500">
                            {(t.nasa.diameterKm > 0
                              ? t.nasa.diameterKm
                              : t.esa.diameterM / 1000
                            ).toFixed(3)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-cyan-400/80">
                            {sci(t.nasa.ip)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-orange-400/80">
                            {sci(t.esa.ipCum)}
                          </td>
                          <td
                            className={`px-2.5 py-1.5 text-right font-mono text-[10px] ${
                              Math.abs(safeNum(t.palermoDelta)) > 1
                                ? "text-red-400"
                                : Math.abs(safeNum(t.palermoDelta)) > 0.3
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                            }`}
                          >
                            {safeNum(t.palermoDelta) !== 0
                              ? (safeNum(t.palermoDelta) > 0 ? "+" : "") +
                                safeNum(t.palermoDelta).toFixed(3)
                              : "—"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[10px] text-zinc-500">
                            {safeNum(t.probabilityRatio) > 0 &&
                            safeNum(t.probabilityRatio) < 900
                              ? safeNum(t.probabilityRatio).toFixed(2) + "×"
                              : "—"}
                          </td>
                          <td className="px-2.5 py-1.5 text-center">
                            <span className={`text-[7px] font-mono px-1 py-0.5 rounded ${sevCls}`}>
                              {sev.slice(0, 4)}
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

          {/* DETAIL */}
          {selected && (
            <div className="rounded-lg border border-zinc-700/40 bg-[#080810]/80 p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-mono text-xs text-white flex items-center gap-2">
                  <Zap size={12} className="text-amber-400" />
                  {selected.designation}
                  <span className="text-zinc-600 font-normal">{selected.fullname}</span>
                </h3>
                <button
                  onClick={() => setSelected(null)}
                  className="text-zinc-700 hover:text-white text-[10px] font-mono"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="rounded-md border border-cyan-500/10 bg-cyan-500/[0.02] p-2.5 space-y-1">
                  <p className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                    <Radio size={8} /> NASA SENTRY-II
                  </p>
                  <Row l="IP" v={sci(safeNum(selected.nasa.ip))} />
                  <Row l="PS (rep)" v={safeNum(selected.nasa.psCum).toFixed(3)} />
                  <Row l="PS (calc)" v={safeNum(selected.palermoNasaRecomputed).toFixed(4)} />
                  <Row l="Torino" v={String(selected.nasa.tsMax)} />
                  <Row l="V∞" v={safeNum(selected.nasa.vInfKmS).toFixed(2) + " km/s"} />
                  <Row l="Energy" v={safeNum(selected.nasa.energyMt).toExponential(2) + " Mt"} />
                  <p className="text-[7px] font-mono text-cyan-400/40 pt-1 border-t border-cyan-500/5">
                    {selected.nasa.hasNonGrav ? "✓ YARKOVSKY A1,A2" : "✗ NO NON-GRAV"}
                  </p>
                </div>
                <div className="rounded-md border border-orange-500/10 bg-orange-500/[0.02] p-2.5 space-y-1">
                  <p className="text-[8px] font-mono text-orange-400 uppercase tracking-widest flex items-center gap-1">
                    <Radio size={8} /> ESA NEOCC
                  </p>
                  <Row l="IP" v={sci(safeNum(selected.esa.ipCum))} />
                  <Row l="PS (rep)" v={safeNum(selected.esa.psCum).toFixed(3)} />
                  <Row l="PS (calc)" v={safeNum(selected.palermoEsaRecomputed).toFixed(4)} />
                  <Row l="Torino" v={String(selected.esa.torinoScale)} />
                  <Row l="V imp" v={safeNum(selected.esa.velocityKmS).toFixed(2) + " km/s"} />
                  <Row l="Dia" v={safeNum(selected.esa.diameterM).toFixed(0) + " m"} />
                  <p className="text-[7px] font-mono text-orange-400/40 pt-1 border-t border-orange-500/5">
                    ✗ GRAV-ONLY
                  </p>
                </div>
                <div className="rounded-md border border-red-500/10 bg-red-500/[0.02] p-2.5 space-y-1">
                  <p className="text-[8px] font-mono text-red-400 uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle size={8} /> DIVERGENCE
                  </p>
                  <Row l="IP Ratio" v={safeNum(selected.probabilityRatio).toFixed(3) + "×"} />
                  <Row l="ΔPS" v={safeNum(selected.palermoDelta).toFixed(4)} />
                  <Row l="Δr" v={safeNum(selected.spatialDivergenceKm).toFixed(1) + " km"} />
                  <Row
                    l="da/dt"
                    v={(safeNum(selected.yarkovskyDriftAUDay) * 365.25e6).toExponential(2) + " AU/Myr"}
                  />
                  <Row l="Severity" v={selected.divergenceSeverity} />
                  <div className="flex gap-2 pt-1 border-t border-red-500/5">
                    <a
                      href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(selected.designation)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] font-mono text-cyan-400/50 hover:text-cyan-400 flex items-center gap-0.5"
                    >
                      <ExternalLink size={7} /> NASA
                    </a>
                    <a
                      href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(selected.designation)}.risk`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] font-mono text-orange-400/50 hover:text-orange-400 flex items-center gap-0.5"
                    >
                      <ExternalLink size={7} /> ESA
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: ORBITAL DISPLAY */}
        {showGlobe && (
          <div
            className="w-full lg:w-[40%] h-[35vh] lg:h-[calc(100vh-52px)] border-l border-zinc-800/30 relative"
            style={{ minHeight: "300px" }}
          >
            <OrbitsViewer threats={data?.threats ?? []} selected={selected} />
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800/30 px-5 py-1.5">
        <div className="max-w-[1920px] mx-auto flex justify-between text-[7px] font-mono text-zinc-800">
          <span>
            PS = log₁₀(IP/(0.03·E^(-4/5)·T)) • Kepler ε=10⁻¹⁴ • Yarkovsky: Vokrouhlický 1998
          </span>
          <span>NOT FOR OPERATIONAL USE</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/40 bg-[#080810]/50 px-2.5 py-1.5">
      <p className="text-[7px] font-mono text-zinc-700 uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[8px] text-zinc-600">{l}</span>
      <span className="font-mono text-[10px] text-zinc-300">{v}</span>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border ${
        ok
          ? "text-emerald-400 border-emerald-500/15 bg-emerald-500/5"
          : "text-red-400 border-red-500/15 bg-red-500/5"
      }`}
    >
      {ok ? <Wifi size={8} /> : <WifiOff size={8} />}
      {label}
    </span>
  );
}
