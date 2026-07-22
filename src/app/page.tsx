"use client";

import { useState, useEffect, useCallback } from "react";
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
  Orbit,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wifi,
  WifiOff,
} from "lucide-react";
import OrbitsViewer from "@/components/OrbitsViewer";
import type { DivergenceMetrics, ThreatsApiResponse } from "@/lib/engine/types";

function formatSciNotation(val: number): string {
  if (val === 0) return "0";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) {
    return val.toExponential(3);
  }
  return val.toFixed(6);
}

function DivergenceGauge({ ratio }: { ratio: number }) {
  const pct = Math.min((Math.abs(Math.log10(ratio || 1)) / 3) * 100, 100);
  const color =
    pct > 66 ? "bg-red-500" : pct > 33 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
      <div className={`divergence-bar ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: "OK" | "ERROR" | "RATE_LIMITED";
  label: string;
}) {
  const styles = {
    OK: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    ERROR: "bg-red-500/10 text-red-400 border-red-500/30",
    RATE_LIMITED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${styles[status]}`}
    >
      {status === "OK" ? <Wifi size={10} /> : <WifiOff size={10} />}
      {label}: {status}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "nasa" | "esa" | "white" | "red";
}) {
  const accentStyles = {
    nasa: "text-nasa border-nasa/20 bg-nasa/5",
    esa: "text-esa border-esa/20 bg-esa/5",
    white: "text-zinc-200 border-zinc-700 bg-zinc-800/30",
    red: "text-red-400 border-red-500/20 bg-red-500/5",
  };
  return (
    <div
      className={`panel-glass p-2.5 flex flex-col gap-1 border ${accentStyles[accent]}`}
    >
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="data-readout text-zinc-200">{value}</span>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<ThreatsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] =
    useState<keyof DivergenceMetrics>("palermoDelta");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedThreat, setSelectedThreat] =
    useState<DivergenceMetrics | null>(null);
  const [showGlobe, setShowGlobe] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchThreats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/threats", {
        cache: "no-store",
        headers: { "x-request-ts": Date.now().toString() },
      });
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const json: ThreatsApiResponse = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreats();
    const interval = setInterval(fetchThreats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchThreats]);

  const sortedThreats = data
    ? [...data.threats].sort((a, b) => {
        const aVal = a[sortField] as number;
        const bVal = b[sortField] as number;
        if (typeof aVal !== "number" || typeof bVal !== "number") return 0;
        return sortAsc ? aVal - bVal : bVal - aVal;
      })
    : [];

  const handleSort = (field: keyof DivergenceMetrics) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="border-b border-panel-border bg-panel/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Shield className="w-8 h-8 text-nasa" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-esa rounded-full animate-pulse-slow" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                AEGIS-SENTRY{" "}
                <span className="text-nasa font-light">DIVERGENCE</span>{" "}
                <span className="text-esa font-light">WATCH</span>
              </h1>
              <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
                Planetary Defense Risk Reconciliation Engine • NASA Sentry-II ↔
                ESA NEOCC/Aegis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <div className="hidden md:flex items-center gap-2">
                <StatusBadge
                  status={data.metadata.nasaApiStatus}
                  label="NASA"
                />
                <StatusBadge status={data.metadata.esaApiStatus} label="ESA" />
              </div>
            )}
            <button
              onClick={fetchThreats}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800/80 border border-zinc-700 hover:border-nasa/50 hover:bg-zinc-800 transition-all text-xs font-mono disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={loading ? "animate-spin" : ""}
              />
              {loading ? "SYNCING..." : "REFRESH"}
            </button>
            {lastRefresh && (
              <span className="text-[10px] font-mono text-zinc-600 hidden lg:block">
                LAST:{" "}
                {lastRefresh.toLocaleTimeString("en-US", { hour12: false })} UTC
              </span>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1920px] mx-auto w-full">
        {/* LEFT: DATA */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-y-auto max-h-[calc(100vh-64px)]">
          {/* STATS */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
              <StatCard
                icon={<Database size={14} />}
                label="NASA OBJECTS"
                value={data.metadata.nasaCount.toString()}
                accent="nasa"
              />
              <StatCard
                icon={<Database size={14} />}
                label="ESA OBJECTS"
                value={data.metadata.esaCount.toString()}
                accent="esa"
              />
              <StatCard
                icon={<Crosshair size={14} />}
                label="MATCHED"
                value={data.metadata.matchedCount.toString()}
                accent="white"
              />
              <StatCard
                icon={<AlertTriangle size={14} />}
                label="NASA ONLY"
                value={data.metadata.nasaOnlyCount.toString()}
                accent="nasa"
              />
              <StatCard
                icon={<AlertTriangle size={14} />}
                label="ESA ONLY"
                value={data.metadata.esaOnlyCount.toString()}
                accent="esa"
              />
              <StatCard
                icon={<TrendingUp size={14} />}
                label="MAX Δ PS"
                value={data.metadata.maxPalermoDelta.toFixed(3)}
                accent="red"
              />
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div className="panel-glass p-4 border-red-500/30">
              <div className="flex items-center gap-2 text-red-400 text-sm font-mono">
                <AlertTriangle size={16} />
                <span>DATA LINK ERROR: {error}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Retrying in 5 minutes. Globe displays last known state.
              </p>
            </div>
          )}

          {/* LOADING */}
          {loading && !data && (
            <div className="flex-1 flex items-center justify-center">
              <div className="font-mono text-xs text-zinc-500 space-y-1 max-w-md">
                <p className="text-nasa animate-pulse">
                  ▸ ESTABLISHING UPLINK TO CNEOS SENTRY-II...
                </p>
                <p
                  className="text-esa animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                >
                  ▸ CONNECTING TO ESA NEOCC/AEGIS RISK SERVER...
                </p>
                <p
                  className="text-zinc-600"
                  style={{ animationDelay: "0.6s" }}
                >
                  ▸ PARSING PIPE-DELIMITED ESA TELEMETRY...
                </p>
                <p
                  className="text-zinc-600"
                  style={{ animationDelay: "0.9s" }}
                >
                  ▸ SOLVING KEPLER&apos;S EQUATION (NEWTON-RAPHSON, ε=10⁻¹⁴)...
                </p>
                <p
                  className="text-zinc-600"
                  style={{ animationDelay: "1.2s" }}
                >
                  ▸ COMPUTING YARKOVSKY THERMAL DRIFT da/dt...
                </p>
                <p
                  className="text-zinc-600"
                  style={{ animationDelay: "1.5s" }}
                >
                  ▸ PROPAGATING ORBITS TO EPOCH +30d...
                </p>
                <p
                  className="text-emerald-400"
                  style={{ animationDelay: "1.8s" }}
                >
                  ▸ DIVERGENCE MATRIX READY.
                </p>
              </div>
            </div>
          )}

          {/* TABLE */}
          {data && data.threats.length > 0 && (
            <div className="panel-glass overflow-hidden flex-1 flex flex-col">
              <div className="px-4 py-2 border-b border-panel-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-nasa" />
                  <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    Divergence Matrix • {data.threats.length} objects
                  </span>
                </div>
                <button
                  onClick={() => setShowGlobe(!showGlobe)}
                  className="lg:hidden flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-white transition-colors"
                >
                  <Globe2 size={12} />
                  {showGlobe ? "HIDE" : "SHOW"} GLOBE
                </button>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-panel z-10">
                    <tr className="border-b border-panel-border text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                      <th
                        className="px-3 py-2 cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort("designation")}
                      >
                        <span className="flex items-center gap-1">
                          OBJECT
                          {sortField === "designation" &&
                            (sortAsc ? (
                              <ChevronUp size={10} />
                            ) : (
                              <ChevronDown size={10} />
                            ))}
                        </span>
                      </th>
                      <th className="px-3 py-2">DIA (km)</th>
                      <th className="px-3 py-2">
                        <span className="text-nasa/70">NASA IP</span>
                      </th>
                      <th className="px-3 py-2">
                        <span className="text-esa/70">ESA IP</span>
                      </th>
                      <th
                        className="px-3 py-2 cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort("palermoDelta")}
                      >
                        <span className="flex items-center gap-1">
                          Δ PS
                          {sortField === "palermoDelta" &&
                            (sortAsc ? (
                              <ChevronUp size={10} />
                            ) : (
                              <ChevronDown size={10} />
                            ))}
                        </span>
                      </th>
                      <th className="px-3 py-2">DIVERGENCE</th>
                      <th className="px-3 py-2">SRC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedThreats.map((threat, idx) => (
                      <tr
                        key={`${threat.designation}-${idx}`}
                        onClick={() => setSelectedThreat(threat)}
                        className={`border-b border-panel-border/50 cursor-pointer transition-colors hover:bg-zinc-800/40 ${
                          selectedThreat?.designation === threat.designation
                            ? "bg-zinc-800/60"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-white">
                            {threat.designation}
                          </div>
                          <div className="text-[10px] text-zinc-600">
                            {threat.fullname}
                          </div>
                        </td>
                        <td className="px-3 py-2 data-readout text-zinc-400">
                          {threat.nasa.diameterKm > 0
                            ? threat.nasa.diameterKm.toFixed(3)
                            : (threat.esa.diameterM / 1000).toFixed(3)}
                        </td>
                        <td className="px-3 py-2 data-readout text-nasa">
                          {threat.nasa.ip > 0
                            ? formatSciNotation(threat.nasa.ip)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 data-readout text-esa">
                          {threat.esa.ipCum > 0
                            ? formatSciNotation(threat.esa.ipCum)
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`data-readout ${
                              Math.abs(threat.palermoDelta) > 1
                                ? "text-red-400"
                                : Math.abs(threat.palermoDelta) > 0.3
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                            }`}
                          >
                            {threat.palermoDelta > 0 ? "+" : ""}
                            {threat.palermoDelta.toFixed(3)}
                          </span>
                        </td>
                        <td className="px-3 py-2 w-24">
                          <DivergenceGauge ratio={threat.probabilityRatio} />
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              threat.sourceMatch === "BOTH"
                                ? "bg-zinc-700/50 text-zinc-300"
                                : threat.sourceMatch === "NASA_ONLY"
                                  ? "bg-nasa/10 text-nasa"
                                  : "bg-esa/10 text-esa"
                            }`}
                          >
                            {threat.sourceMatch}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DETAIL PANEL */}
          {selectedThreat && (
            <div className="panel-glass p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-sm text-white flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  DEEP DIVE: {selectedThreat.designation}
                </h3>
                <button
                  onClick={() => setSelectedThreat(null)}
                  className="text-zinc-500 hover:text-white text-xs"
                >
                  ✕ CLOSE
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* NASA */}
                <div className="space-y-2 p-3 rounded-md bg-nasa/5 border border-nasa/20">
                  <h4 className="text-[10px] font-mono text-nasa uppercase tracking-widest flex items-center gap-1">
                    <Radio size={10} /> NASA SENTRY-II
                  </h4>
                  <DetailRow
                    label="Impact Prob"
                    value={formatSciNotation(selectedThreat.nasa.ip)}
                  />
                  <DetailRow
                    label="Palermo (reported)"
                    value={selectedThreat.nasa.psCum.toFixed(3)}
                  />
                  <DetailRow
                    label="Palermo (recomputed)"
                    value={selectedThreat.palermoNasaRecomputed.toFixed(4)}
                  />
                  <DetailRow
                    label="Torino Scale"
                    value={selectedThreat.nasa.tsMax.toString()}
                  />
                  <DetailRow
                    label="V∞ (km/s)"
                    value={selectedThreat.nasa.vInfKmS.toFixed(2)}
                  />
                  <DetailRow
                    label="V impact (km/s)"
                    value={selectedThreat.nasa.vImpKmS.toFixed(2)}
                  />
                  <DetailRow
                    label="Energy (Mt)"
                    value={selectedThreat.nasa.energyMt.toExponential(2)}
                  />
                  <DetailRow
                    label="N Impactors"
                    value={selectedThreat.nasa.nImp.toString()}
                  />
                  <DetailRow
                    label="Method"
                    value={selectedThreat.nasa.method}
                  />
                  <DetailRow label="Range" value={selectedThreat.nasa.range} />
                  <div className="pt-1 border-t border-nasa/10">
                    <span className="text-[9px] font-mono text-nasa/60">
                      {selectedThreat.nasa.hasNonGrav
                        ? "✓ YARKOVSKY EFFECT MODELED (A1, A2)"
                        : "✗ NO NON-GRAV MODELING"}
                    </span>
                  </div>
                </div>

                {/* ESA */}
                <div className="space-y-2 p-3 rounded-md bg-esa/5 border border-esa/20">
                  <h4 className="text-[10px] font-mono text-esa uppercase tracking-widest flex items-center gap-1">
                    <Radio size={10} /> ESA NEOCC/AEGIS
                  </h4>
                  <DetailRow
                    label="Impact Prob (cum)"
                    value={formatSciNotation(selectedThreat.esa.ipCum)}
                  />
                  <DetailRow
                    label="Impact Prob (max)"
                    value={formatSciNotation(selectedThreat.esa.ipMax)}
                  />
                  <DetailRow
                    label="Palermo (reported)"
                    value={selectedThreat.esa.psCum.toFixed(3)}
                  />
                  <DetailRow
                    label="Palermo (recomputed)"
                    value={selectedThreat.palermoEsaRecomputed.toFixed(4)}
                  />
                  <DetailRow
                    label="Torino Scale"
                    value={selectedThreat.esa.torinoScale.toString()}
                  />
                  <DetailRow
                    label="V impact (km/s)"
                    value={selectedThreat.esa.velocityKmS.toFixed(2)}
                  />
                  <DetailRow
                    label="Diameter (m)"
                    value={selectedThreat.esa.diameterM.toFixed(0)}
                  />
                  <DetailRow
                    label="VI Max Date"
                    value={selectedThreat.esa.viMaxDate}
                  />
                  <div className="pt-1 border-t border-esa/10">
                    <span className="text-[9px] font-mono text-esa/60">
                      ✗ GRAVITATIONAL-ONLY MODEL (NO A3)
                    </span>
                  </div>
                </div>

                {/* DIVERGENCE + YARKOVSKY */}
                <div className="space-y-2 p-3 rounded-md bg-red-500/5 border border-red-500/20">
                  <h4 className="text-[10px] font-mono text-red-400 uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle size={10} /> DIVERGENCE + YARKOVSKY
                  </h4>
                  <DetailRow
                    label="IP Ratio (NASA/ESA)"
                    value={selectedThreat.probabilityRatio.toFixed(4) + "×"}
                  />
                  <DetailRow
                    label="Δ Palermo Scale"
                    value={selectedThreat.palermoDelta.toFixed(4)}
                  />
                  <DetailRow
                    label="Spatial Δr (km)"
                    value={selectedThreat.spatialDivergenceKm.toFixed(1)}
                  />
                  <DetailRow
                    label="da/dt (AU/Myr)"
                    value={(
                      selectedThreat.yarkovskyDriftAUDay * 365.25e6
                    ).toExponential(3)}
                  />
                  <DetailRow
                    label="Yarkovsky shift (km)"
                    value={selectedThreat.yarkovskyPositionShiftKm.toFixed(1)}
                  />
                  <DetailRow
                    label="Severity"
                    value={selectedThreat.divergenceSeverity}
                  />
                  <div className="pt-2 border-t border-red-500/10">
                    <p className="text-[9px] font-mono text-zinc-500 leading-relaxed">
                      Sentry-II IOBS includes Yarkovsky thermal acceleration
                      (da/dt ~ 10⁻⁴ AU/Myr). Aegis LOV runs gravitational N-body
                      only. Spatial divergence grows as Δr ∝ (da/dt)·t² via
                      mean-motion coupling.
                    </p>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <a
                      href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(selectedThreat.designation)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-nasa/70 hover:text-nasa transition-colors"
                    >
                      <ExternalLink size={9} /> NASA RAW
                    </a>
                    <a
                      href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(selectedThreat.designation)}.risk`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-esa/70 hover:text-esa transition-colors"
                    >
                      <ExternalLink size={9} /> ESA RAW
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: GLOBE */}
        {showGlobe && (
          <div className="w-full lg:w-[45%] xl:w-[40%] h-[40vh] lg:h-[calc(100vh-64px)] border-l border-panel-border relative">
            <OrbitsViewer
              threats={data?.threats ?? []}
              selected={selectedThreat}
            />
            <div className="absolute top-3 left-3 z-10 panel-glass px-3 py-1.5">
              <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
                <Globe2 size={10} className="text-nasa" />
                TRAJECTORY DIVERGENCE VIEW
              </span>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-panel-border bg-panel/40 px-4 py-2">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between text-[9px] font-mono text-zinc-600">
          <span>
            AEGIS-SENTRY v2.0 • PS = log₁₀(IP / (f_B × T)) • f_B = 0.03 ×
            E^(-4/5) yr⁻¹ • Kepler ε=10⁻¹⁴
          </span>
          <span>
            DATA: NASA/JPL CNEOS Sentry-II + ESA NEOCC/Aegis • NOT FOR
            OPERATIONAL USE
          </span>
        </div>
      </footer>
    </div>
  );
}