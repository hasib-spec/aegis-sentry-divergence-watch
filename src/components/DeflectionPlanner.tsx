"use client";

import { useState, useCallback } from "react";
import { Rocket, Shield, AlertTriangle, CheckCircle, Zap, Clock, Weight, Target } from "lucide-react";
import type { AdvancedThreat } from "@/lib/engine/types";

interface Props {
  threats: AdvancedThreat[];
  selected: AdvancedThreat | null;
}

interface DeflectionResult {
  designation: string;
  method: string;
  mission: {
    deltaVAchievedKmS: number;
    deltaVRequiredKmS: number;
    missDistanceKm: number;
    missDistanceLD: number;
    missDistanceEarthRadii: number;
    isSufficient: boolean;
    marginEarthRadii: number;
    warningTimeYears: number;
    spacecraftMassKg: number;
    launchLeadTimeYears: number;
    transitTimeYears: number;
  };
  keyholeSafety: {
    isSafe: boolean;
    dangerKeyholes: Array<{ resonance: string; earthOrbits: number; warning: string }>;
    recommendedMissKm: number;
    warning: string;
  };
  safeCone: {
    safeAngleRangeDeg: { min: number; max: number };
    optimalAngleDeg: number;
    coneWidthDeg: number;
    hasSafeSolution: boolean;
  };
  asteroid: { diameterKm: number; massKg: number; massTons: number };
  comparison: { chelyabinskEquivalent: number; tunguskaEquivalent: number; hiroshimaEquivalent: number };
  recommendation: string;
  minWarningTimeYears: { kinetic: number; gravityTractor: number; nuclear: number };
  minSpacecraftMassKg: number;
}

export default function DeflectionPlanner({ threats, selected }: Props) {
  const [targetDes, setTargetDes] = useState(selected?.designation || "");
  const [method, setMethod] = useState<"KINETIC" | "GRAVITY_TRACTOR" | "NUCLEAR_STANDOFF">("KINETIC");
  const [warningYears, setWarningYears] = useState(10);
  const [scMass, setScMass] = useState(500);
  const [scVel, setScVel] = useState(10);
  const [beta, setBeta] = useState(3.6);
  const [gtMass, setGtMass] = useState(10000);
  const [gtHover, setGtHover] = useState(1);
  const [gtDuration, setGtDuration] = useState(7);
  const [nucYield, setNucYield] = useState(1);
  const [nucCoupling, setNucCoupling] = useState(0.01);
  const [nucEjecta, setNucEjecta] = useState(3);
  const [result, setResult] = useState<DeflectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!targetDes) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        des: targetDes,
        method,
        warning: String(warningYears),
        scMass: String(scMass),
        scVel: String(scVel),
        beta: String(beta),
        gtMass: String(gtMass),
        gtHover: String(gtHover),
        gtDuration: String(gtDuration),
        nucYield: String(nucYield),
        nucCoupling: String(nucCoupling),
        nucEjecta: String(nucEjecta),
      });
      const res = await fetch(`/api/deflect?${params.toString()}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [targetDes, method, warningYears, scMass, scVel, beta, gtMass, gtHover, gtDuration, nucYield, nucCoupling, nucEjecta]);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* TARGET SELECTOR */}
      <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
        <p className="text-[8px] font-mono text-cyan-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
          <Target size={10} /> TARGET SELECTION
        </p>
        <select
          value={targetDes}
          onChange={(e) => setTargetDes(e.target.value)}
          className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded px-2.5 py-1.5 text-[10px] font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/40"
        >
          <option value="">— SELECT OBJECT —</option>
          {threats.slice(0, 50).map((t) => (
            <option key={t.designation} value={t.designation}>
              {t.designation} ({(t.nasa.diameterKm > 0 ? t.nasa.diameterKm : t.esa.diameterM / 1000).toFixed(3)} km)
            </option>
          ))}
        </select>
      </div>

      {/* METHOD SELECTOR */}
      <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
        <p className="text-[8px] font-mono text-amber-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
          <Rocket size={10} /> DEFLECTION METHOD
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: "KINETIC" as const, label: "KINETIC IMPACTOR", icon: "💥" },
            { id: "GRAVITY_TRACTOR" as const, label: "GRAVITY TRACTOR", icon: "🛰️" },
            { id: "NUCLEAR_STANDOFF" as const, label: "NUCLEAR STANDOFF", icon: "☢️" },
          ]).map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`px-2 py-2 rounded text-[8px] font-mono border transition-all ${
                method === m.id
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : "border-zinc-700/40 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="block text-sm mb-0.5">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* PARAMETERS */}
      <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3 space-y-2.5">
        <p className="text-[8px] font-mono text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
          <Clock size={10} /> MISSION PARAMETERS
        </p>

        <SliderRow label="WARNING TIME" value={warningYears} min={1} max={50} step={1} unit="yr" onChange={setWarningYears} />

        {method === "KINETIC" && (
          <>
            <SliderRow label="SC MASS" value={scMass} min={50} max={50000} step={50} unit="kg" onChange={setScMass} />
            <SliderRow label="IMPACT VEL" value={scVel} min={3} max={30} step={0.5} unit="km/s" onChange={setScVel} />
            <SliderRow label="β FACTOR" value={beta} min={1} max={6} step={0.1} unit="" onChange={setBeta} />
            <p className="text-[7px] font-mono text-zinc-700">β=3.61 measured by DART (Thomas et al. 2023)</p>
          </>
        )}

        {method === "GRAVITY_TRACTOR" && (
          <>
            <SliderRow label="SC MASS" value={gtMass} min={1000} max={100000} step={1000} unit="kg" onChange={setGtMass} />
            <SliderRow label="HOVER DIST" value={gtHover} min={0.1} max={10} step={0.1} unit="km" onChange={setGtHover} />
            <SliderRow label="TOW DURATION" value={gtDuration} min={1} max={30} step={1} unit="yr" onChange={setGtDuration} />
          </>
        )}

        {method === "NUCLEAR_STANDOFF" && (
          <>
            <SliderRow label="YIELD" value={nucYield} min={0.1} max={100} step={0.1} unit="Mt" onChange={setNucYield} />
            <SliderRow label="COUPLING η" value={nucCoupling} min={0.001} max={0.1} step={0.001} unit="" onChange={setNucCoupling} />
            <SliderRow label="EJECTA VEL" value={nucEjecta} min={1} max={15} step={0.5} unit="km/s" onChange={setNucEjecta} />
          </>
        )}
      </div>

      {/* RUN BUTTON */}
      <button
        onClick={runAnalysis}
        disabled={loading || !targetDes}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600/20 to-emerald-600/20 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold tracking-wider hover:border-cyan-400/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "⟳ COMPUTING TRAJECTORY..." : "▶ RUN DEFLECTION ANALYSIS"}
      </button>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 flex items-center gap-2">
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
          <span className="font-mono text-[9px] text-red-400">{error}</span>
        </div>
      )}

      {/* RESULTS */}
      {result && (
        <div className="space-y-2.5">
          {/* VERDICT */}
          <div className={`rounded-lg border p-3 ${
            result.mission.isSufficient && result.keyholeSafety.isSafe
              ? "border-emerald-500/30 bg-emerald-500/5"
              : result.mission.isSufficient && !result.keyholeSafety.isSafe
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.mission.isSufficient && result.keyholeSafety.isSafe ? (
                <CheckCircle size={14} className="text-emerald-400" />
              ) : result.mission.isSufficient ? (
                <AlertTriangle size={14} className="text-amber-400" />
              ) : (
                <AlertTriangle size={14} className="text-red-400" />
              )}
              <span className={`font-mono text-[10px] font-bold ${
                result.mission.isSufficient && result.keyholeSafety.isSafe ? "text-emerald-400"
                : result.mission.isSufficient ? "text-amber-400" : "text-red-400"
              }`}>
                {result.mission.isSufficient && result.keyholeSafety.isSafe ? "MISSION VIABLE"
                : result.mission.isSufficient ? "KEYHOLE CONFLICT" : "INSUFFICIENT Δv"}
              </span>
            </div>
            <p className="text-[8px] font-mono text-zinc-400 leading-relaxed">{result.recommendation}</p>
          </div>

          {/* METRICS GRID */}
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Δv ACHIEVED" value={`${(result.mission.deltaVAchievedKmS * 1000).toFixed(4)} m/s`} color="text-cyan-400" />
            <MetricCard label="Δv REQUIRED" value={`${(result.mission.deltaVRequiredKmS * 1000).toFixed(4)} m/s`} color="text-amber-400" />
            <MetricCard label="MISS DISTANCE" value={`${result.mission.missDistanceEarthRadii.toFixed(1)} R⊕`} color={result.mission.isSufficient ? "text-emerald-400" : "text-red-400"} />
            <MetricCard label="MISS (km)" value={`${result.mission.missDistanceKm.toFixed(0)} km`} color="text-zinc-300" />
            <MetricCard label="MARGIN" value={`${result.mission.marginEarthRadii.toFixed(1)} R⊕`} color={result.mission.marginEarthRadii > 0 ? "text-emerald-400" : "text-red-400"} />
            <MetricCard label="LAUNCH LEAD" value={`${result.mission.launchLeadTimeYears.toFixed(1)} yr`} color="text-zinc-300" />
          </div>

          {/* ASTEROID INFO */}
          <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
            <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
              <Weight size={10} /> TARGET PHYSICS
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <RowKV l="Diameter" v={`${(result.asteroid.diameterKm * 1000).toFixed(0)} m`} />
              <RowKV l="Mass" v={`${result.asteroid.massTons.toExponential(2)} t`} />
              <RowKV l="Chelyabinsk equiv" v={`${result.comparison.chelyabinskEquivalent.toFixed(1)}×`} />
              <RowKV l="Tunguska equiv" v={`${result.comparison.tunguskaEquivalent.toFixed(2)}×`} />
              <RowKV l="Hiroshima equiv" v={`${result.comparison.hiroshimaEquivalent.toFixed(0)}×`} />
              <RowKV l="Min SC mass" v={`${result.minSpacecraftMassKg.toFixed(0)} kg`} />
            </div>
          </div>

          {/* KEYHOLE SAFETY */}
          <div className={`rounded-lg border p-3 ${result.keyholeSafety.isSafe ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-red-500/20 bg-red-500/[0.02]"}`}>
            <p className={`text-[8px] font-mono uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5 ${result.keyholeSafety.isSafe ? "text-emerald-400" : "text-red-400"}`}>
              <Shield size={10} /> KEYHOLE SAFETY CHECK
            </p>
            {result.keyholeSafety.isSafe ? (
              <p className="text-[9px] font-mono text-emerald-400/80">✓ No resonant keyhole conflicts. Deflected trajectory is safe.</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[9px] font-mono text-red-400">{result.keyholeSafety.warning}</p>
                {result.keyholeSafety.dangerKeyholes.map((kh, i) => (
                  <p key={i} className="text-[8px] font-mono text-red-400/70">
                    ⚠ {kh.resonance} keyhole at ξ={kh.xiKm.toFixed(1)} km (width {kh.widthKm.toFixed(2)} km)
                  </p>
                ))}
                <p className="text-[8px] font-mono text-amber-400 mt-1">
                  Safe cone: {result.safeCone.safeAngleRangeDeg.min.toFixed(1)}°–{result.safeCone.safeAngleRangeDeg.max.toFixed(1)}° (width {result.safeCone.coneWidthDeg.toFixed(1)}°)
                </p>
              </div>
            )}
          </div>

          {/* MIN WARNING TIMES */}
          <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/50 p-3">
            <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2">MINIMUM WARNING TIME</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-mono text-[11px] font-bold text-cyan-400">{result.minWarningTimeYears.kinetic.toFixed(1)} yr</p>
                <p className="text-[7px] font-mono text-zinc-600">KINETIC</p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold text-emerald-400">{result.minWarningTimeYears.gravityTractor.toFixed(1)} yr</p>
                <p className="text-[7px] font-mono text-zinc-600">GRAV TRACTOR</p>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold text-orange-400">{result.minWarningTimeYears.nuclear.toFixed(1)} yr</p>
                <p className="text-[7px] font-mono text-zinc-600">NUCLEAR</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-zinc-500 w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-cyan-500"
      />
      <span className="text-[9px] font-mono text-cyan-300 w-20 text-right shrink-0">
        {value >= 1000 ? value.toFixed(0) : value.toFixed(step < 1 ? (step < 0.01 ? 3 : 1) : 0)} {unit}
      </span>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/40 bg-[#0a0a14]/60 px-2.5 py-2">
      <p className="text-[7px] font-mono text-zinc-600 uppercase">{label}</p>
      <p className={`font-mono text-[11px] font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RowKV({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[8px] text-zinc-600">{l}</span>
      <span className="font-mono text-[9px] text-zinc-300">{v}</span>
    </div>
  );
}