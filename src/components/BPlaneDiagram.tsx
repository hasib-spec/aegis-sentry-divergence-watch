"use client";

import { useEffect, useRef, useCallback } from "react";
import type { KeyholeMetrics } from "@/lib/engine/types";
import { EARTH_RADIUS_KM } from "@/lib/engine/constants";

interface Props {
  keyhole: KeyholeMetrics;
  designation: string;
}

export default function BPlaneDiagram({ keyhole, designation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 10 || H < 10) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = timeRef.current;
    const cx = W / 2;
    const cy = H / 2 + 14;

    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    const rangeKm = Math.max(
      4 * EARTH_RADIUS_KM,
      keyhole.missDistanceKm + 3 * keyhole.sigmaZetaKm,
      3 * keyhole.sigmaXiKm
    );
    const scale = (Math.min(W, H) / 2 - 34) / rangeKm;
    const toX = (xiKm: number) => cx + xiKm * scale;
    const toY = (zetaKm: number) => cy - zetaKm * scale;

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(16, cy);
    ctx.lineTo(W - 16, cy);
    ctx.moveTo(cx, 24);
    ctx.lineTo(cx, H - 10);
    ctx.stroke();
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText("ξ (km) →", W - 58, cy - 6);
    ctx.fillText("ζ (km) ↑", cx + 6, 30);

    // R⊕ ticks
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const x = toX(k * EARTH_RADIUS_KM);
      if (x > 20 && x < W - 20) {
        ctx.fillRect(x, cy - 2, 1, 4);
        ctx.fillText(`${k}R⊕`, x - 8, cy + 14);
      }
    }

    // Focusing radius
    const vEsc = 11.186;
    const bMax = EARTH_RADIUS_KM * Math.sqrt(1 + (vEsc / Math.max(keyhole.vInfKmS, 1)) ** 2);
    ctx.strokeStyle = "rgba(100,150,255,0.25)";
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, bMax * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(100,150,255,0.4)";
    ctx.fillText("b_max", cx + bMax * scale * 0.72, cy - bMax * scale * 0.72);

    // Earth
    const earthR = Math.max(EARTH_RADIUS_KM * scale, 4);
    const earthGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, earthR * 2.2);
    earthGrad.addColorStop(0, "rgba(68,136,255,0.55)");
    earthGrad.addColorStop(0.5, "rgba(68,136,255,0.18)");
    earthGrad.addColorStop(1, "rgba(68,136,255,0)");
    ctx.fillStyle = earthGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, earthR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b6cb0";
    ctx.beginPath();
    ctx.arc(cx, cy, earthR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,180,255,0.6)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("EARTH", cx - 16, cy + earthR + 12);

    // Keyholes (width ×50 for visibility)
    const EXAG = 50;
    keyhole.keyholes.forEach((kh, i) => {
      const x = toX(kh.xiKm);
      const wPx = Math.max(2.5, kh.widthKm * scale * EXAG);
      const isAlert = keyhole.isAlert && i === 0;
      const pulse = 0.5 + 0.4 * Math.sin(t * 3 + i);
      ctx.fillStyle = isAlert ? `rgba(255,60,80,${pulse})` : "rgba(251,191,36,0.45)";
      ctx.fillRect(x - wPx / 2, cy - 10, wPx, 20);
      ctx.strokeStyle = isAlert ? "rgba(255,120,130,0.9)" : "rgba(251,191,36,0.6)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x - wPx / 2, cy - 10, wPx, 20);
      ctx.fillStyle = isAlert ? "rgba(255,150,160,0.95)" : "rgba(251,191,36,0.7)";
      ctx.font = "8px monospace";
      ctx.fillText(kh.resonance, x - 10, cy - 16);
    });

    // Nominal trajectory
    const nomY = toY(keyhole.missDistanceKm);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, nomY);
    ctx.lineTo(cx + 6, nomY);
    ctx.moveTo(cx, nomY - 6);
    ctx.lineTo(cx, nomY + 6);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("NOMINAL", cx + 10, nomY - 4);

    // Uncertainty ellipse 1σ 2σ 3σ
    const rx = keyhole.sigmaXiKm * scale;
    const ry = keyhole.sigmaZetaKm * scale;
    for (let s = 1; s <= 3; s++) {
      ctx.strokeStyle =
        s === 1 ? "rgba(0,229,255,0.65)" : s === 2 ? "rgba(0,229,255,0.35)" : "rgba(0,229,255,0.18)";
      ctx.lineWidth = s === 1 ? 1.4 : 0.8;
      if (s === 3) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, nomY, Math.max(rx * s, 2), Math.max(ry * s, 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "rgba(0,229,255,0.7)";
    ctx.fillText("1σ", cx + rx + 4, nomY);

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(`B-PLANE — ${designation}`, 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText(
      `v∞ ${keyhole.vInfKmS.toFixed(2)} km/s • miss ${keyhole.missDistanceKm.toFixed(0)} km • keyhole width ×50`,
      12, 28
    );

    if (keyhole.isAlert) {
      const flash = 0.6 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(255,60,80,${flash})`;
      ctx.font = "bold 9px monospace";
      ctx.fillText("⚠ σ-OVERLAP WITH RESONANT KEYHOLE", 12, H - 12);
    }

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [keyhole, designation]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
