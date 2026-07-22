"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AdvancedThreat } from "@/lib/engine/types";

interface Props {
  threats: AdvancedThreat[];
  selected: AdvancedThreat | null;
  onSelect?: (t: AdvancedThreat) => void;
}

/**
 * Palermo Scale Risk Matrix: Impact Probability vs Impact Energy
 * This is the standard diagram used by NASA/ESA for risk communication.
 * X-axis: log₁₀(Impact Probability)
 * Y-axis: log₁₀(Energy in Mt)
 * Diagonal lines: constant Palermo Scale values
 */
export default function RiskMatrix({ threats, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [hover, setHover] = useState<AdvancedThreat | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; threat: AdvancedThreat }>>([]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: AdvancedThreat | null = null;
    let bestD = 16;
    for (const p of pointsRef.current) {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) { bestD = d; best = p.threat; }
    }
    setHover(best);
  }, []);

  const handleClick = useCallback(() => {
    if (hover && onSelect) onSelect(hover);
  }, [hover, onSelect]);

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
    const ML = 50, MR = 20, MT = 35, MB = 40;
    const pw = W - ML - MR;
    const ph = H - MT - MB;

    // Axes: X = log10(IP) from -12 to 0, Y = log10(Energy Mt) from -3 to 8
    const X_MIN = -12, X_MAX = 0;
    const Y_MIN = -3, Y_MAX = 8;

    const sx = (logIP: number) => ML + ((logIP - X_MIN) / (X_MAX - X_MIN)) * pw;
    const sy = (logE: number) => MT + ph - ((logE - Y_MIN) / (Y_MAX - Y_MIN)) * ph;

    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Palermo Scale diagonal lines: PS = log10(IP / (0.03 × E^(-0.8) × T))
    // For T=50yr: PS = log10(IP) + 0.8×log10(E) - log10(0.03×50)
    // PS = logIP + 0.8×logE - 1.176
    // Lines of constant PS: logIP = PS - 0.8×logE + 1.176
    const psValues = [-4, -2, 0, 2];
    const psColors = ["rgba(52,211,153,0.15)", "rgba(251,191,36,0.2)", "rgba(251,146,60,0.25)", "rgba(248,113,113,0.3)"];

    psValues.forEach((ps, idx) => {
      ctx.strokeStyle = psColors[idx];
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let logE = Y_MIN; logE <= Y_MAX; logE += 0.1) {
        const logIP = ps - 0.8 * logE + 1.176;
        const x = sx(logIP);
        const y = sy(logE);
        if (logE === Y_MIN) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      const labelLogE = Y_MAX - 1;
      const labelLogIP = ps - 0.8 * labelLogE + 1.176;
      const lx = sx(labelLogIP);
      const ly = sy(labelLogE);
      if (lx > ML && lx < W - MR) {
        ctx.font = "8px monospace";
        ctx.fillStyle = psColors[idx].replace("0.", "0.6");
        ctx.fillText(`PS=${ps > 0 ? "+" : ""}${ps}`, lx + 4, ly - 4);
      }
    });

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let x = X_MIN; x <= X_MAX; x += 2) {
      ctx.beginPath(); ctx.moveTo(sx(x), MT); ctx.lineTo(sx(x), MT + ph); ctx.stroke();
    }
    for (let y = Y_MIN; y <= Y_MAX; y += 2) {
      ctx.beginPath(); ctx.moveTo(ML, sy(y)); ctx.lineTo(ML + pw, sy(y)); ctx.stroke();
    }

    // Axis labels
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let x = X_MIN; x <= X_MAX; x += 2) {
      ctx.fillText(`10${supStr(x)}`, sx(x) - 8, H - MB + 14);
    }
    for (let y = Y_MIN; y <= Y_MAX; y += 2) {
      ctx.fillText(`10${supStr(y)}`, ML - 30, sy(y) + 3);
    }

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("IMPACT PROBABILITY", ML + pw / 2 - 50, H - 6);
    ctx.save();
    ctx.translate(12, MT + ph / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("ENERGY (Mt)", 0, 0);
    ctx.restore();

    // Points
    pointsRef.current = [];
    const validThreats = threats.filter((th) => {
      const ip = Math.max(th.nasa.ip, th.esa.ipCum);
      return ip > 0 && th.nasa.energyMt > 0;
    });

    for (const th of validThreats.slice(0, 200)) {
      const ip = Math.max(th.nasa.ip, th.esa.ipCum);
      const energy = th.nasa.energyMt;
      const logIP = Math.max(X_MIN, Math.min(X_MAX, Math.log10(ip)));
      const logE = Math.max(Y_MIN, Math.min(Y_MAX, Math.log10(energy)));
      const x = sx(logIP);
      const y = sy(logE);

      const isSel = selected?.designation === th.designation;
      const isHov = hover?.designation === th.designation;

      // Color by severity
      const rgb = th.divergenceSeverity === "CRITICAL" ? "248,113,113" :
        th.divergenceSeverity === "HIGH" ? "251,146,60" :
        th.divergenceSeverity === "MODERATE" ? "251,191,36" :
        th.divergenceSeverity === "LOW" ? "52,211,153" : "100,116,139";

      const alpha = isSel || isHov ? 1 : 0.5;

      if (isSel) {
        const ring = 9 + 2 * Math.sin(t * 3);
        ctx.strokeStyle = `rgba(${rgb},0.9)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, isSel || isHov ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();

      pointsRef.current.push({ x, y, threat: th });
    }

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("PALERMO SCALE RISK MATRIX", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText(`${validThreats.length} objects • PS = log₁₀(IP / (f_B × T))`, 12, 28);

    // Tooltip
    if (hover) {
      const ip = Math.max(hover.nasa.ip, hover.esa.ipCum);
      const lines = [
        hover.designation,
        `IP: ${ip.toExponential(2)}`,
        `Energy: ${hover.nasa.energyMt.toExponential(2)} Mt`,
        `PS: ${hover.palermoNasaRecomputed.toFixed(2)}`,
        `YSI: ${hover.ysi.ysi.toFixed(2)}`,
      ];
      const p = pointsRef.current.find((pp) => pp.threat === hover);
      const tw = 160;
      const th2 = lines.length * 13 + 10;
      const tx = Math.min(W - tw - 8, (p?.x ?? 0) + 14);
      const ty = Math.max(8, (p?.y ?? 0) - th2 - 8);
      ctx.fillStyle = "rgba(7,7,15,0.94)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(tx, ty, tw, th2);
      ctx.strokeRect(tx, ty, tw, th2);
      ctx.font = "9px monospace";
      lines.forEach((ln, i) => {
        ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.6)";
        ctx.fillText(ln, tx + 8, ty + 16 + i * 13);
      });
    }

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [threats, selected, hover]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
      onClick={handleClick}
      className="w-full h-full block cursor-crosshair"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function supStr(n: number): string {
  const sups: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(n).split("").map((c) => sups[c] || c).join("");
}