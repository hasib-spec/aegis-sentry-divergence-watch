"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DivergenceMetrics } from "@/lib/engine/types";

interface Props {
  threats: DivergenceMetrics[];
  selected: DivergenceMetrics | null;
}

interface OrbitDraw {
  designation: string;
  a: number;
  e: number;
  angle: number;
  nasaColor: string;
  esaColor: string;
  divergence: number;
  isSelected: boolean;
}

export default function OrbitsViewer({ threats, selected }: Props) {
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

    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }

    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) * 0.42;
    const t = timeRef.current;

    // Clear
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Starfield
    const starSeed = 42;
    for (let i = 0; i < 120; i++) {
      const sx = ((Math.sin(i * 127.1 + starSeed) * 0.5 + 0.5) * W);
      const sy = ((Math.cos(i * 311.7 + starSeed) * 0.5 + 0.5) * H);
      const brightness = 0.1 + 0.15 * Math.sin(t * 0.5 + i);
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Grid rings
    ctx.strokeStyle = "rgba(0,229,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= 5; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxR / 5) * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Grid cross
    ctx.strokeStyle = "rgba(0,229,255,0.03)";
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // Sun
    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
    sunGlow.addColorStop(0, "rgba(255,220,0,0.9)");
    sunGlow.addColorStop(0.5, "rgba(255,140,0,0.4)");
    sunGlow.addColorStop(1, "rgba(255,100,0,0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Earth orbit reference (1 AU)
    const earthR = maxR * 0.35;
    ctx.strokeStyle = "rgba(100,150,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, earthR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Earth position (animated)
    const earthAngle = t * 0.2;
    const earthX = cx + earthR * Math.cos(earthAngle);
    const earthY = cy + earthR * Math.sin(earthAngle);
    ctx.fillStyle = "#4488ff";
    ctx.beginPath();
    ctx.arc(earthX, earthY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(68,136,255,0.3)";
    ctx.beginPath();
    ctx.arc(earthX, earthY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw orbits for threats
    const matched = threats.filter((t) => t.sourceMatch === "BOTH").slice(0, 25);

    for (let i = 0; i < matched.length; i++) {
      const threat = matched[i];
      const isSel = selected?.designation === threat.designation;

      // Generate orbit parameters from object properties
      const baseA = 0.5 + (i / matched.length) * 1.8;
      const a = baseA * maxR * 0.4;
      const e = 0.2 + Math.min(Math.abs(threat.palermoDelta) * 0.05, 0.5);
      const orbitAngle = (i / matched.length) * Math.PI * 2 + t * 0.02;
      const divergenceOffset = Math.min(Math.abs(threat.palermoDelta) * 1.5, 8);

      const alpha = isSel ? 0.9 : 0.25;
      const lineW = isSel ? 2 : 0.8;

      // NASA orbit (cyan)
      ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      for (let s = 0; s <= 100; s++) {
        const theta = (s / 100) * Math.PI * 2;
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
        const x = cx + r * Math.cos(theta + orbitAngle);
        const y = cy + r * Math.sin(theta + orbitAngle) * 0.6;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // ESA orbit (orange, offset by divergence)
      ctx.strokeStyle = `rgba(255,109,0,${alpha * 0.8})`;
      ctx.lineWidth = lineW * 0.8;
      ctx.beginPath();
      for (let s = 0; s <= 100; s++) {
        const theta = (s / 100) * Math.PI * 2;
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta)) + divergenceOffset;
        const x = cx + r * Math.cos(theta + orbitAngle + divergenceOffset * 0.005);
        const y = cy + r * Math.sin(theta + orbitAngle + divergenceOffset * 0.005) * 0.6;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // Asteroid position on NASA orbit (animated)
      const astAngle = t * (0.3 + i * 0.02) + i * 2.1;
      const astR = (a * (1 - e * e)) / (1 + e * Math.cos(astAngle));
      const astX = cx + astR * Math.cos(astAngle + orbitAngle);
      const astY = cy + astR * Math.sin(astAngle + orbitAngle) * 0.6;

      if (isSel) {
        // Glow for selected
        const glow = ctx.createRadialGradient(astX, astY, 0, astX, astY, 12);
        glow.addColorStop(0, "rgba(255,255,255,0.6)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(astX, astY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(threat.designation, astX + 10, astY - 8);
        ctx.fillStyle = "rgba(255,100,100,0.8)";
        ctx.fillText(`ΔPS: ${threat.palermoDelta.toFixed(2)}`, astX + 10, astY + 4);
      }

      ctx.fillStyle = isSel ? "#ffffff" : `rgba(0,229,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(astX, astY, isSel ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Divergence legend
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(0,229,255,0.6)";
    ctx.fillText("— NASA Sentry-II (Yarkovsky)", 12, H - 30);
    ctx.fillStyle = "rgba(255,109,0,0.6)";
    ctx.fillText("— ESA NEOCC/Aegis (Grav-only)", 12, H - 18);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("Gap = Palermo Scale divergence", 12, H - 6);

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("ORBITAL DIVERGENCE PROJECTION", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillText(`${matched.length} matched objects • Heliocentric ecliptic plane`, 12, 28);

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [threats, selected]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div className="w-full h-full relative bg-[#030308]">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
