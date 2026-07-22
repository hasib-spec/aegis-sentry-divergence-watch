"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AdvancedThreat } from "@/lib/engine/types";

interface Props {
  threats: AdvancedThreat[];
  selected: AdvancedThreat | null;
  onSelect?: (t: AdvancedThreat) => void;
}

const CLASS_COLORS: Record<string, string> = {
  NEGLIGIBLE: "52,211,153",
  LOW: "163,230,53",
  MODERATE: "251,191,36",
  HIGH: "251,146,60",
  DOMINANT: "248,113,113",
};

const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function sup(n: number): string {
  return String(n).split("").map((c) => SUPS[parseInt(c)] || c).join("");
}

export default function YarkovskyScatter({ threats, selected, onSelect }: Props) {
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
    let bestD = 14;
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
    const ML = 46, MR = 16, MT = 30, MB = 38;
    const pw = W - ML - MR;
    const ph = H - MT - MB;
    const X_MIN = 0.7, X_MAX = 4.7;
    const Y_MIN = 0, Y_MAX = 4;
    const sx = (logD: number) => ML + ((logD - X_MIN) / (X_MAX - X_MIN)) * pw;
    const sy = (ysi: number) => MT + ph - ((ysi - Y_MIN) / (Y_MAX - Y_MIN)) * ph;

    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.5;
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let d = 1; d <= 4; d++) {
      ctx.beginPath(); ctx.moveTo(sx(d), MT); ctx.lineTo(sx(d), MT + ph); ctx.stroke();
      ctx.fillText(`10${sup(d)}`, sx(d) - 8, H - MB + 14);
    }
    for (let y = 0; y <= 4; y++) {
      ctx.beginPath(); ctx.moveTo(ML, sy(y)); ctx.lineTo(ML + pw, sy(y)); ctx.stroke();
      ctx.fillText(String(y), ML - 14, sy(y) + 3);
    }

    // Thresholds
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(251,191,36,0.35)";
    ctx.beginPath(); ctx.moveTo(ML, sy(1)); ctx.lineTo(ML + pw, sy(1)); ctx.stroke();
    ctx.strokeStyle = "rgba(248,113,113,0.4)";
    ctx.beginPath(); ctx.moveTo(ML, sy(2)); ctx.lineTo(ML + pw, sy(2)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(251,191,36,0.5)";
    ctx.fillText("10× IP shift", ML + pw - 74, sy(1) - 5);
    ctx.fillStyle = "rgba(248,113,113,0.55)";
    ctx.fillText("100× IP shift", ML + pw - 80, sy(2) - 5);

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("DIAMETER (m, log₁₀)", ML + pw / 2 - 55, H - 6);
    ctx.save();
    ctx.translate(12, MT + ph / 2 + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("YSI = log₁₀(1 + Δs/σ)", 0, 0);
    ctx.restore();

    // Points
    pointsRef.current = [];
    const pts = threats.filter((th) => (th.nasa.diameterKm > 0 || th.esa.diameterM > 0) && th.ysi);
    for (const th of pts.slice(0, 250)) {
      const dM = Math.max(5, (th.nasa.diameterKm > 0 ? th.nasa.diameterKm : th.esa.diameterM / 1000) * 1000);
      const logD = Math.max(X_MIN, Math.min(X_MAX, Math.log10(dM)));
      const ysi = Math.max(0, Math.min(Y_MAX, th.ysi.ysi));
      const x = sx(logD);
      const y = sy(ysi);
      const isSel = selected?.designation === th.designation;
      const isHov = hover?.designation === th.designation;
      const rgb = CLASS_COLORS[th.ysi.classification] || "52,211,153";
      const alpha = isSel || isHov ? 1 : 0.55;

      if (isSel) {
        const ring = 8 + 2 * Math.sin(t * 3);
        ctx.strokeStyle = `rgba(${rgb},0.9)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, isSel || isHov ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      pointsRef.current.push({ x, y, threat: th });
    }

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("YARKOVSKY SENSITIVITY FIELD", 12, 16);

    // Tooltip
    if (hover) {
      const dM = (hover.nasa.diameterKm > 0 ? hover.nasa.diameterKm : hover.esa.diameterM / 1000) * 1000;
      const lines = [
        hover.designation,
        `YSI ${hover.ysi.ysi.toFixed(2)} (${hover.ysi.classification})`,
        `da/dt ${hover.ysi.daDtAUMyr.toExponential(2)} AU/Myr`,
        `Ø ${dM.toFixed(0)} m`,
      ];
      const p = pointsRef.current.find((pp) => pp.threat === hover);
      const tw = 170;
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
