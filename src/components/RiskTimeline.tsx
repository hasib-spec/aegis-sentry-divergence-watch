"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface TimelinePoint {
  yearsFromNow: number;
  ipNasa: number;
  ipEsa: number;
  palermoNasa: number;
  palermoEsa: number;
  sigmaKm: number;
  missDistanceKm: number;
  isProjection: boolean;
}

interface TrendData {
  direction: string;
  ratePerYear: number;
  characteristicTimeYears: number;
  yearsToSafe: number;
  confidence: number;
}

interface ArcData {
  arcLengthDays: number;
  arcQuality: string;
  uncertaintyParameterU: number;
  currentSigmaArcsec: number;
  daysSinceLastObs: number;
  isStale: boolean;
}

interface Props {
  timeline: TimelinePoint[];
  trend: TrendData;
  arc: ArcData;
  designation: string;
  currentIP: number;
  lossDateYearsFromNow: number;
  yarkovskyDominanceYears: number;
  recommendation: string;
  nasaEsaDivergenceTrend: string;
}

export default function RiskTimeline({
  timeline, trend, arc, designation, currentIP,
  lossDateYearsFromNow, yarkovskyDominanceYears,
  recommendation, nasaEsaDivergenceTrend,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [hover, setHover] = useState<TimelinePoint | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; pt: TimelinePoint }>>([]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best: TimelinePoint | null = null;
    let bestD = 20;
    for (const p of pointsRef.current) {
      const d = Math.abs(p.x - mx);
      if (d < bestD) { bestD = d; best = p.pt; }
    }
    setHover(best);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 10 || H < 10) { animRef.current = requestAnimationFrame(draw); return; }
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = timeRef.current;
    const ML = 60, MR = 20, MT = 50, MB = 50;
    const pw = W - ML - MR;
    const ph = H - MT - MB;

    // Time range
    const minYear = timeline.length > 0 ? timeline[0].yearsFromNow : -5;
    const maxYear = timeline.length > 0 ? timeline[timeline.length - 1].yearsFromNow : 50;
    const yearRange = maxYear - minYear || 1;

    // IP range (log scale)
    const allIPs = timeline.flatMap((p) => [p.ipNasa, p.ipEsa]).filter((v) => v > 0);
    const minLogIP = allIPs.length > 0 ? Math.max(-12, Math.floor(Math.log10(Math.min(...allIPs))) - 1) : -12;
    const maxLogIP = allIPs.length > 0 ? Math.min(0, Math.ceil(Math.log10(Math.max(...allIPs))) + 1) : 0;
    const logRange = maxLogIP - minLogIP || 1;

    const sx = (yr: number) => ML + ((yr - minYear) / yearRange) * pw;
    const sy = (logIP: number) => MT + ph - ((logIP - minLogIP) / logRange) * ph;

    // Background
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(`RISK EVOLUTION — ${designation}`, 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText(
      `Arc: ${arc.arcLengthDays.toFixed(0)}d (${arc.arcQuality}) • U=${arc.uncertaintyParameterU} • ` +
      `Trend: ${trend.direction} • NASA-ESA: ${nasaEsaDivergenceTrend}`,
      12, 28
    );

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";

    // Y-axis grid (log IP)
    for (let logIP = minLogIP; logIP <= maxLogIP; logIP += 2) {
      const y = sy(logIP);
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + pw, y); ctx.stroke();
      ctx.fillText(`10${supStr(logIP)}`, ML - 32, y + 3);
    }

    // X-axis grid (years)
    const yearStep = yearRange > 40 ? 10 : yearRange > 15 ? 5 : yearRange > 5 ? 2 : 1;
    for (let yr = Math.ceil(minYear / yearStep) * yearStep; yr <= maxYear; yr += yearStep) {
      const x = sx(yr);
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ph); ctx.stroke();
      ctx.fillText(yr === 0 ? "NOW" : `${yr > 0 ? "+" : ""}${yr}yr`, x - 10, H - MB + 14);
    }

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("IMPACT PROBABILITY (log₁₀)", ML + pw / 2 - 60, H - 6);
    ctx.save();
    ctx.translate(12, MT + ph / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("TIME (years)", 0, 0);
    ctx.restore();

    // "NOW" vertical line
    const nowX = sx(0);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(nowX, MT); ctx.lineTo(nowX, MT + ph); ctx.stroke();
    ctx.setLineDash([]);

    // Safe threshold line (IP = 10⁻⁶)
    if (minLogIP <= -6 && -6 <= maxLogIP) {
      const safeY = sy(-6);
      ctx.strokeStyle = "rgba(52,211,153,0.3)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(ML, safeY); ctx.lineTo(ML + pw, safeY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(52,211,153,0.5)";
      ctx.fillText("SAFE (10⁻⁶)", ML + pw - 70, safeY - 5);
    }

    // Loss date marker
    if (lossDateYearsFromNow < maxYear && lossDateYearsFromNow > minYear) {
      const lossX = sx(lossDateYearsFromNow);
      ctx.strokeStyle = "rgba(248,113,113,0.4)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(lossX, MT); ctx.lineTo(lossX, MT + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(248,113,113,0.6)";
      ctx.font = "7px monospace";
      ctx.fillText("LOST", lossX - 10, MT + 10);
    }

    // Yarkovsky dominance marker
    if (isFinite(yarkovskyDominanceYears) && yarkovskyDominanceYears < maxYear && yarkovskyDominanceYears > 0) {
      const yarkX = sx(yarkovskyDominanceYears);
      ctx.strokeStyle = "rgba(251,191,36,0.3)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(yarkX, MT); ctx.lineTo(yarkX, MT + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(251,191,36,0.5)";
      ctx.font = "7px monospace";
      ctx.fillText("YARK DOM", yarkX - 14, MT + 20);
    }

    // Draw IP curves
    pointsRef.current = [];

    // NASA line (cyan)
    ctx.strokeStyle = "rgba(0,229,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const pt of timeline) {
      if (pt.ipNasa <= 0) continue;
      const x = sx(pt.yearsFromNow);
      const y = sy(Math.max(minLogIP, Math.log10(pt.ipNasa)));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
      pointsRef.current.push({ x, y, pt });
    }
    ctx.stroke();

    // NASA glow
    ctx.strokeStyle = "rgba(0,229,255,0.15)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    started = false;
    for (const pt of timeline) {
      if (pt.ipNasa <= 0) continue;
      const x = sx(pt.yearsFromNow);
      const y = sy(Math.max(minLogIP, Math.log10(pt.ipNasa)));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ESA line (orange, dashed)
    ctx.strokeStyle = "rgba(255,109,0,0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    started = false;
    for (const pt of timeline) {
      if (pt.ipEsa <= 0) continue;
      const x = sx(pt.yearsFromNow);
      const y = sy(Math.max(minLogIP, Math.log10(pt.ipEsa)));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Current point marker
    const currentPt = timeline.find((p) => Math.abs(p.yearsFromNow) < 0.01);
    if (currentPt && currentPt.ipNasa > 0) {
      const cx = sx(0);
      const cy = sy(Math.max(minLogIP, Math.log10(currentPt.ipNasa)));
      const pulse = 4 + 2 * Math.sin(t * 3);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 8px monospace";
      ctx.fillText(`IP: ${currentPt.ipNasa.toExponential(2)}`, cx + 10, cy - 6);
    }

    // Trend arrow
    const trendColor = trend.direction === "RISING" ? "rgba(248,113,113,0.8)" :
      trend.direction === "FALLING" ? "rgba(52,211,153,0.8)" : "rgba(251,191,36,0.6)";
    ctx.fillStyle = trendColor;
    ctx.font = "bold 9px monospace";
    const trendSymbol = trend.direction === "RISING" ? "▲" : trend.direction === "FALLING" ? "▼" : "◆";
    ctx.fillText(`${trendSymbol} ${trend.direction}`, ML + pw - 80, MT + 14);

    // Legend
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(0,229,255,0.7)";
    ctx.fillText("— NASA (Yarkovsky)", 12, H - 24);
    ctx.fillStyle = "rgba(255,109,0,0.7)";
    ctx.fillText("--- ESA (Grav-only)", 12, H - 12);

    // Tooltip
    if (hover) {
      const hx = sx(hover.yearsFromNow);
      const hy = hover.ipNasa > 0 ? sy(Math.max(minLogIP, Math.log10(hover.ipNasa))) : MT + ph / 2;
      const lines = [
        `t = ${hover.yearsFromNow > 0 ? "+" : ""}${hover.yearsFromNow.toFixed(1)} yr`,
        `NASA IP: ${hover.ipNasa.toExponential(2)}`,
        `ESA IP: ${hover.ipEsa.toExponential(2)}`,
        `σ: ${hover.sigmaKm.toExponential(1)} km`,
        `Miss: ${hover.missDistanceKm.toFixed(0)} km`,
        `PS: ${hover.palermoNasa.toFixed(2)}`,
      ];
      const tw = 155;
      const th2 = lines.length * 12 + 10;
      const tx = Math.min(W - tw - 8, hx + 14);
      const ty = Math.max(8, hy - th2 - 8);
      ctx.fillStyle = "rgba(7,7,15,0.94)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(tx, ty, tw, th2);
      ctx.strokeRect(tx, ty, tw, th2);
      ctx.font = "8px monospace";
      lines.forEach((ln, i) => {
        ctx.fillStyle = i === 0 ? "#ffffff" : i === 1 ? "rgba(0,229,255,0.8)" : i === 2 ? "rgba(255,109,0,0.8)" : "rgba(255,255,255,0.6)";
        ctx.fillText(ln, tx + 8, ty + 14 + i * 12);
      });
    }

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [timeline, trend, arc, designation, currentIP, lossDateYearsFromNow, yarkovskyDominanceYears, nasaEsaDivergenceTrend, hover]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
      className="w-full h-full block cursor-crosshair"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function supStr(n: number): string {
  const sups: Record<string, string> = {
    "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³",
    "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  return String(n).split("").map((c) => sups[c] || c).join("");
}