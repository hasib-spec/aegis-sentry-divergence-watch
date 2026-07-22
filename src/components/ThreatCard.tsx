"use client";

import { useState, useCallback } from "react";
import { Share2, Copy, Check, ExternalLink, Shield, Zap, Target, KeyRound, Clock } from "lucide-react";
import type { AdvancedThreat } from "@/lib/engine/types";

interface Props {
  threat: AdvancedThreat;
  consensusScore?: number;
  onClose?: () => void;
}

function sci(val: number): string {
  if (!val || val === 0) return "—";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6) return val.toExponential(2);
  return val.toFixed(6);
}

/**
 * AEGIS-SENTRY v3.5 — Shareable Threat Card
 *
 * Compact, visually rich card summarizing a single asteroid threat.
 * Designed for sharing on social media, research communications,
 * and institutional briefings.
 *
 * Features:
 * - One-click copy as formatted text
 * - Shareable URL generation
 * - Visual severity indicators
 * - NASA vs ESA comparison
 * - Key metrics at a glance
 */
export default function ThreatCard({ threat, consensusScore, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const diameterKm = threat.nasa.diameterKm > 0 ? threat.nasa.diameterKm : threat.esa.diameterM / 1000;
  const maxIp = Math.max(threat.nasa.ip, threat.esa.ipCum);
  const energyMt = threat.nasa.energyMt;

  const severityColor = threat.divergenceSeverity === "CRITICAL" ? "#f87171" :
    threat.divergenceSeverity === "HIGH" ? "#fb923c" :
    threat.divergenceSeverity === "MODERATE" ? "#fbbf24" : "#34d399";

  const copyAsText = useCallback(() => {
    const text = [
      `⚠️ AEGIS·SENTRY THREAT CARD — ${threat.designation}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Impact Probability: NASA ${sci(threat.nasa.ip)} | ESA ${sci(threat.esa.ipCum)}`,
      `Palermo Scale: NASA ${threat.palermoNasaRecomputed.toFixed(3)} | ESA ${threat.palermoEsaRecomputed.toFixed(3)}`,
      `ΔPS (divergence): ${threat.palermoDelta.toFixed(3)}`,
      `Diameter: ${(diameterKm * 1000).toFixed(0)} m | Energy: ${energyMt.toExponential(2)} Mt`,
      `Yarkovsky YSI: ${threat.ysi.ysi.toFixed(2)} (${threat.ysi.classification})`,
      `Keyholes: ${threat.keyhole.keyholeCount} | Alert: ${threat.keyhole.isAlert ? "YES ⚠️" : "No"}`,
      `Corridor: ${threat.corridor.hasCorridor ? `${threat.corridor.lengthKm.toFixed(0)}×${threat.corridor.widthKm.toFixed(0)} km` : "—"}`,
      `Readiness: ${threat.readiness.score}/100 (${threat.readiness.priority})`,
      consensusScore !== undefined ? `Consensus: ${consensusScore}/100` : "",
      `Severity: ${threat.divergenceSeverity}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Source: NASA Sentry-II ↔ ESA NEOCC/Aegis`,
      `Engine: AEGIS·SENTRY v3.5 | NOT FOR OPERATIONAL USE`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [threat, consensusScore, diameterKm, energyMt]);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/api/object/${encodeURIComponent(threat.designation)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [threat.designation]);

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-gradient-to-br from-[#0a0a14] to-[#070710] overflow-hidden shadow-2xl shadow-black/50">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between" style={{ borderTopColor: severityColor, borderTopWidth: 3 }}>
        <div className="flex items-center gap-2.5">
          <Shield size={16} style={{ color: severityColor }} />
          <div>
            <h3 className="font-mono text-sm font-bold text-white">{threat.designation}</h3>
            <p className="text-[8px] font-mono text-zinc-600">{threat.fullname}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] font-mono px-2 py-0.5 rounded-full border" style={{ color: severityColor, borderColor: `${severityColor}40`, backgroundColor: `${severityColor}10` }}>
            {threat.divergenceSeverity}
          </span>
          {onClose && (
            <button onClick={onClose} className="text-zinc-600 hover:text-white text-xs ml-1">✕</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* IP Comparison */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-2.5 text-center">
            <p className="text-[7px] font-mono text-cyan-400/60 uppercase tracking-wider">NASA IP</p>
            <p className="font-mono text-base font-bold text-cyan-300 mt-0.5">{sci(threat.nasa.ip)}</p>
            <p className="text-[7px] font-mono text-zinc-700 mt-0.5">PS {threat.palermoNasaRecomputed.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-orange-500/15 bg-orange-500/[0.03] p-2.5 text-center">
            <p className="text-[7px] font-mono text-orange-400/60 uppercase tracking-wider">ESA IP</p>
            <p className="font-mono text-base font-bold text-orange-300 mt-0.5">{sci(threat.esa.ipCum)}</p>
            <p className="text-[7px] font-mono text-zinc-700 mt-0.5">PS {threat.palermoEsaRecomputed.toFixed(2)}</p>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <MetricMini icon={<Zap size={9} />} label="YSI" value={threat.ysi.ysi.toFixed(2)} color={
            threat.ysi.classification === "DOMINANT" ? "text-red-400" :
            threat.ysi.classification === "HIGH" ? "text-orange-400" : "text-amber-400"
          } />
          <MetricMini icon={<KeyRound size={9} />} label="KEYHOLES" value={String(threat.keyhole.keyholeCount)} color={
            threat.keyhole.isAlert ? "text-red-400" : "text-purple-400"
          } />
          <MetricMini icon={<Target size={9} />} label="CORRIDOR" value={threat.corridor.hasCorridor ? `${threat.corridor.lengthKm.toFixed(0)}km` : "—"} color="text-orange-400" />
          <MetricMini icon={<Clock size={9} />} label="RRS" value={String(threat.readiness.score)} color={
            threat.readiness.priority === "CRITICAL" ? "text-red-400" :
            threat.readiness.priority === "URGENT" ? "text-orange-400" : "text-emerald-400"
          } />
        </div>

        {/* Physical properties */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[8px] font-mono text-zinc-600">
            Ø {(diameterKm * 1000).toFixed(0)}m • {energyMt.toExponential(1)} Mt • v∞ {threat.nasa.vInfKmS.toFixed(1)} km/s
          </span>
          {consensusScore !== undefined && (
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
              consensusScore > 70 ? "text-emerald-400 bg-emerald-500/10" :
              consensusScore > 40 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10"
            }`}>
              CONSENSUS {consensusScore}/100
            </span>
          )}
        </div>

        {/* Divergence bar */}
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[7px] font-mono text-zinc-700">AGENCY DIVERGENCE</span>
            <span className="text-[7px] font-mono text-zinc-500">ΔPS {threat.palermoDelta.toFixed(3)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.abs(threat.palermoDelta) * 33)}%`,
                backgroundColor: severityColor,
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={copyAsText}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[9px] font-mono text-zinc-400"
          >
            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
            {copied ? "COPIED" : "COPY CARD"}
          </button>
          <button
            onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[9px] font-mono text-zinc-400"
          >
            {linkCopied ? <Check size={10} className="text-emerald-400" /> : <Share2 size={10} />}
            {linkCopied ? "LINK COPIED" : "SHARE LINK"}
          </button>
          <a
            href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(threat.designation)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[9px] font-mono text-cyan-400/60"
          >
            <ExternalLink size={10} /> NASA
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800/40 flex items-center justify-between">
        <span className="text-[7px] font-mono text-zinc-800">AEGIS·SENTRY v3.5 • NOT FOR OPERATIONAL USE</span>
        <span className="text-[7px] font-mono text-zinc-800">{new Date().toISOString().slice(0, 10)}</span>
      </div>
    </div>
  );
}

function MetricMini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/40 bg-[#0a0a14]/60 px-1.5 py-1.5 text-center">
      <div className={`flex items-center justify-center gap-0.5 mb-0.5 ${color}`}>{icon}</div>
      <p className={`font-mono text-[10px] font-bold ${color}`}>{value}</p>
      <p className="text-[6px] font-mono text-zinc-700 uppercase">{label}</p>
    </div>
  );
}