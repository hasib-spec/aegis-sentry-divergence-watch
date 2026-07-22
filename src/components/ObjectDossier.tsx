"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink, Radio, AlertTriangle, Zap, Target, KeyRound, Activity } from "lucide-react";
import type { AdvancedThreat, DossierResponse } from "@/lib/engine/types";
import CorridorMap from "./CorridorMap";
import BPlaneDiagram from "./BPlaneDiagram";

interface Props {
  threat: AdvancedThreat;
  onClose: () => void;
}

function sci(val: number): string {
  if (!val || val === 0) return "—";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) return val.toExponential(2);
  return val.toFixed(6);
}

export default function ObjectDossier({ threat, onClose }: Props) {
  const [dossier, setDossier] = useState<DossierResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    let cancel = false;
    setDossier(null);
    setLoadErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/object/${encodeURIComponent(threat.designation)}`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const j: DossierResponse = await res.json();
        if (!cancel) setDossier(j);
      } catch (e) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : "Dossier fetch failed");
      }
    })();
    return () => { cancel = true; };
  }, [threat.designation]);

  const adv = dossier?.advanced;
  const ysi = adv?.ysi ?? threat.ysi;
  const kh = adv?.keyhole ?? threat.keyhole;
  const cor = adv?.corridor ?? threat.corridor;
  const rrs = adv?.readiness ?? threat.readiness;

  const sevColor =
    threat.divergenceSeverity === "CRITICAL" ? "text-red-400 border-red-500/30 bg-red-500/10"
    : threat.divergenceSeverity === "HIGH" ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
    : "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[540px] bg-[#07070f] border-l border-zinc-800/70 overflow-y-auto dossier-in">
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-[#07070f]/95 backdrop-blur border-b border-zinc-800/60 px-5 py-3.5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-mono text-base font-bold text-white">{threat.designation}</h2>
              <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${sevColor}`}>
                {threat.divergenceSeverity}
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{threat.fullname}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loadErr && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="font-mono text-[10px] text-red-400">{loadErr}</span>
            </div>
          )}

          {/* READINESS */}
          <Section title="RUBIN READINESS" icon={<Activity size={10} />} accent="text-emerald-400">
            <div className="flex items-center gap-4">
              <ScoreRing score={rrs.score} priority={rrs.priority} />
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[9px] text-zinc-600">PRIORITY</span>
                  <span className={`font-mono text-[10px] font-bold ${
                    rrs.priority === "CRITICAL" ? "text-red-400" : rrs.priority === "URGENT" ? "text-orange-400"
                    : rrs.priority === "ELEVATED" ? "text-amber-400" : "text-emerald-400"
                  }`}>{rrs.priority}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {rrs.factors.map((f) => (
                    <span key={f} className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/40">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* AGENCY SPLIT */}
          <Section title="AGENCY SPLIT" icon={<Radio size={10} />} accent="text-cyan-400">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
                <p className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest mb-1.5">NASA SENTRY-II</p>
                <p className="font-mono text-lg font-bold text-cyan-300">{sci(threat.nasa.ip)}</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-1">PS {threat.nasa.psCum.toFixed(3)} • TS {threat.nasa.tsMax}</p>
                <p className="text-[7px] font-mono text-cyan-400/40 mt-1">{threat.nasa.hasNonGrav ? "✓ YARKOVSKY A1,A2" : "✗ NO NON-GRAV"}</p>
              </div>
              <div className="rounded-md border border-orange-500/15 bg-orange-500/[0.03] p-3">
                <p className="text-[8px] font-mono text-orange-400 uppercase tracking-widest mb-1.5">ESA NEOCC</p>
                <p className="font-mono text-lg font-bold text-orange-300">{sci(threat.esa.ipCum)}</p>
                <p className="text-[8px] font-mono text-zinc-600 mt-1">PS {threat.esa.psCum.toFixed(3)} • TS {threat.esa.torinoScale}</p>
                <p className="text-[7px] font-mono text-orange-400/40 mt-1">✗ GRAV-ONLY</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="ΔPS" value={threat.palermoDelta.toFixed(3)} color={Math.abs(threat.palermoDelta) > 1 ? "text-red-400" : "text-emerald-400"} />
              <MiniStat label="IP RATIO" value={threat.probabilityRatio < 900 ? threat.probabilityRatio.toFixed(2) + "×" : "—"} color="text-zinc-300" />
              <MiniStat label="Δr (30d)" value={threat.spatialDivergenceKm.toFixed(0) + " km"} color="text-zinc-300" />
            </div>
          </Section>

          {/* YARKOVSKY */}
          <Section title="YARKOVSKY ENGINE" icon={<Zap size={10} />} accent="text-amber-400">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-zinc-600">SENSITIVITY INDEX</span>
              <span className={`font-mono text-sm font-bold ${
                ysi.classification === "DOMINANT" ? "text-red-400" : ysi.classification === "HIGH" ? "text-orange-400"
                : ysi.classification === "MODERATE" ? "text-amber-400" : "text-emerald-400"
              }`}>{ysi.ysi.toFixed(2)} <span className="text-[8px] font-normal">{ysi.classification}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-3">
              <div className={`h-full rounded-full ${
                ysi.classification === "DOMINANT" ? "bg-red-500" : ysi.classification === "HIGH" ? "bg-orange-500"
                : ysi.classification === "MODERATE" ? "bg-amber-500" : "bg-emerald-500"
              }`} style={{ width: `${Math.min(100, (ysi.ysi / 4) * 100)}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <RowKV l="da/dt" v={`${ysi.daDtAUMyr.toExponential(2)} AU/Myr`} />
              <RowKV l="Δs (along-track)" v={`${ysi.alongTrackShiftKm.toExponential(2)} km`} />
              <RowKV l="σ b-plane (est)" v={`${ysi.bPlaneSigmaKm.toFixed(0)} km`} />
              <RowKV l="Yarkovsky dominates" v={isFinite(ysi.dominanceYears) ? `~${ysi.dominanceYears.toFixed(0)} yr` : "—"} />
            </div>
          </Section>

          {/* CORRIDOR */}
          <Section title="IMPACT CORRIDOR" icon={<Target size={10} />} accent="text-red-400">
            <div className="h-44 rounded-md overflow-hidden border border-zinc-800/60 mb-2">
              <CorridorMap threats={[threat]} selected={threat} compact />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <RowKV l="Center" v={`${cor.centerLatDeg.toFixed(1)}°, ${cor.centerLonDeg.toFixed(1)}°`} />
              <RowKV l="Footprint" v={`${cor.widthKm.toFixed(0)} × ${cor.lengthKm.toFixed(0)} km`} />
              <RowKV l="Entry velocity" v={`${cor.entryVelocityKmS.toFixed(2)} km/s`} />
              <RowKV l="Entry angle" v={`${cor.entryAngleDeg.toFixed(1)}°`} />
            </div>
            <p className="text-[7px] font-mono text-zinc-700 mt-2">FIRST-ORDER NODAL PROJECTION — refine with SBDB covariance</p>
          </Section>

          {/* KEYHOLE */}
          <Section title="GRAVITATIONAL KEYHOLE FIELD" icon={<KeyRound size={10} />} accent="text-purple-400">
            <div className="h-56 rounded-md overflow-hidden border border-zinc-800/60 mb-2">
              <BPlaneDiagram keyhole={kh} designation={threat.designation} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <RowKV l="Resonances found" v={String(kh.keyholeCount)} />
              <RowKV l="Nearest" v={kh.nearestResonance} />
              <RowKV l="σ from keyhole" v={isFinite(kh.sigmaFromKeyhole) ? kh.sigmaFromKeyhole.toFixed(2) + "σ" : "—"} />
              <RowKV l="Passage P" v={kh.passageProbability > 0 ? kh.passageProbability.toExponential(2) : "—"} />
            </div>
            {kh.isAlert && (
              <p className="text-[8px] font-mono text-red-400 mt-2 animate-pulse">⚠ UNCERTAINTY ELLIPSE OVERLAPS RESONANT RETURN KEYHOLE</p>
            )}
          </Section>

          {/* PROPAGATION */}
          {dossier && (
            <Section title="PROPAGATION DIVERGENCE (SBDB ELEMENTS)" icon={<Activity size={10} />} accent="text-cyan-400">
              <div className="space-y-1.5">
                <DivBar label="+1 yr" km={dossier.divergence.spatialDivergence1yr} max={Math.max(dossier.divergence.spatialDivergence50yr, 1)} />
                <DivBar label="+10 yr" km={dossier.divergence.spatialDivergence10yr} max={Math.max(dossier.divergence.spatialDivergence50yr, 1)} />
                <DivBar label="+50 yr" km={dossier.divergence.spatialDivergence50yr} max={Math.max(dossier.divergence.spatialDivergence50yr, 1)} />
              </div>
              <p className="text-[8px] font-mono text-zinc-600 mt-2">
                Yarkovsky shift @50yr: {dossier.divergence.yarkovskyShift50yr.toExponential(2)} km
                {dossier.nasa.hasYarkovskyModeling ? " • A1/A2 fitted" : ""}
              </p>
            </Section>
          )}

          {!dossier && !loadErr && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-zinc-900/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* SOURCES */}
          <div className="flex flex-wrap gap-2 pb-6">
            <SourceLink href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(threat.designation)}`} label="SENTRY" color="text-cyan-400/60 hover:text-cyan-400" />
            <SourceLink href={`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(threat.designation)}`} label="SBDB" color="text-cyan-400/60 hover:text-cyan-400" />
            <SourceLink href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(threat.designation)}.risk`} label="ESA .risk" color="text-orange-400/60 hover:text-orange-400" />
            <SourceLink href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(threat.designation)}.ke1`} label="ESA .ke1" color="text-orange-400/60 hover:text-orange-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a14]/60 p-3.5">
      <p className={`text-[8px] font-mono uppercase tracking-[0.2em] flex items-center gap-1.5 mb-2.5 ${accent}`}>{icon} {title}</p>
      {children}
    </div>
  );
}

function RowKV({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[8px] text-zinc-600">{l}</span>
      <span className="font-mono text-[10px] text-zinc-300">{v}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-zinc-900/50 border border-zinc-800/50 py-1.5">
      <p className="text-[7px] font-mono text-zinc-600">{label}</p>
      <p className={`font-mono text-[11px] font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DivBar({ label, km, max }: { label: string; km: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-zinc-600 w-10">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyan-500 to-red-500 rounded-full" style={{ width: `${Math.max(2, Math.min(100, (km / max) * 100))}%` }} />
      </div>
      <span className="text-[9px] font-mono text-zinc-400 w-24 text-right">{km.toExponential(2)} km</span>
    </div>
  );
}

function ScoreRing({ score, priority }: { score: number; priority: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = priority === "CRITICAL" ? "#f87171" : priority === "URGENT" ? "#fb923c" : priority === "ELEVATED" ? "#fbbf24" : "#34d399";
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" className="shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" stroke="#18181b" strokeWidth="7" />
      <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 46 46)" />
      <text x="46" y="51" textAnchor="middle" fill="#fff" fontSize="19" fontFamily="monospace" fontWeight="bold">{score}</text>
    </svg>
  );
}

function SourceLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[9px] font-mono border border-zinc-800/60 rounded px-2 py-1 transition-colors ${color}`}>
      <ExternalLink size={8} /> {label}
    </a>
  );
}
