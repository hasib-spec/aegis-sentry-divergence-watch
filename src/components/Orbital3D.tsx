"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AdvancedThreat } from "@/lib/engine/types";

/* ═══════════════════════════════════════════════════════════
   FIX: Props use AdvancedThreat (not DivergenceMetrics)
   so onSelect matches openDossier's signature in page.tsx
   ═══════════════════════════════════════════════════════════ */
interface Props {
  threats: AdvancedThreat[];
  selected: AdvancedThreat | null;
  onSelect?: (t: AdvancedThreat) => void;
}

interface Orbit3D {
  designation: string;
  a: number;
  e: number;
  incl: number;
  omega: number;
  phase: number;
  speed: number;
  color: string;
  severity: string;
  ysi: number;
  rrs: number;
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "248,113,113",
  HIGH: "251,146,60",
  MODERATE: "251,191,36",
  LOW: "52,211,153",
  NEGLIGIBLE: "100,116,139",
};

export default function Orbital3D({ threats, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const rotRef = useRef<{ rx: number; ry: number }>({ rx: -0.45, ry: 0.3 });
  const zoomRef = useRef<number>(1);
  const [hover, setHover] = useState<AdvancedThreat | null>(null);
  const hitRef = useRef<Array<{ x: number; y: number; threat: AdvancedThreat }>>([]);

  const project = useCallback(
    (x3: number, y3: number, z3: number, cx: number, cy: number, scale: number): [number, number, number] => {
      const { rx, ry } = rotRef.current;
      const zoom = zoomRef.current;
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = x3 * cosY - z3 * sinY;
      const z1 = x3 * sinY + z3 * cosY;
      const y1 = y3;
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const x2 = x1;
      const perspective = 800;
      const pFactor = perspective / (perspective + z2 * scale * zoom);
      const sx = cx + x2 * scale * zoom * pFactor;
      const sy = cy + y2 * scale * zoom * pFactor;
      return [sx, sy, z2];
    },
    []
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      rotRef.current.ry += dx * 0.005;
      rotRef.current.rx += dy * 0.005;
      rotRef.current.rx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotRef.current.rx));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: AdvancedThreat | null = null;
    let bestD = 16;
    for (const h of hitRef.current) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d < bestD) { bestD = d; best = h.threat; }
    }
    setHover(best);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleClick = useCallback(() => {
    if (hover && onSelect) onSelect(hover);
  }, [hover, onSelect]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current - e.deltaY * 0.001));
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
    const cx = W / 2;
    const cy = H / 2;
    const baseScale = Math.min(W, H) * 0.32;

    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Starfield
    for (let i = 0; i < 150; i++) {
      const sx = (Math.sin(i * 127.1 + 42) * 0.5 + 0.5) * W;
      const sy = (Math.cos(i * 311.7 + 42) * 0.5 + 0.5) * H;
      const brightness = 0.08 + 0.12 * Math.sin(t * 0.4 + i * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Ecliptic grid
    ctx.strokeStyle = "rgba(0,229,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= 4; r++) {
      const gridR = r * 0.5;
      ctx.beginPath();
      for (let a = 0; a <= 360; a += 5) {
        const rad = (a * Math.PI) / 180;
        const [px, py] = project(gridR * Math.cos(rad), 0, gridR * Math.sin(rad), cx, cy, baseScale);
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Sun
    const [sunX, sunY] = project(0, 0, 0, cx, cy, baseScale);
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 14);
    sunGrad.addColorStop(0, "rgba(255,220,0,0.95)");
    sunGrad.addColorStop(0.4, "rgba(255,160,0,0.5)");
    sunGrad.addColorStop(1, "rgba(255,100,0,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Earth orbit
    ctx.strokeStyle = "rgba(100,150,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let a = 0; a <= 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      const [px, py] = project(Math.cos(rad), 0, Math.sin(rad), cx, cy, baseScale);
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Earth
    const earthAngle = t * 0.15;
    const [earthX, earthY] = project(Math.cos(earthAngle), 0, Math.sin(earthAngle), cx, cy, baseScale);
    ctx.fillStyle = "#4488ff";
    ctx.beginPath();
    ctx.arc(earthX, earthY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(68,136,255,0.25)";
    ctx.beginPath();
    ctx.arc(earthX, earthY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(100,150,255,0.6)";
    ctx.fillText("EARTH", earthX + 10, earthY - 4);

    // Orbits
    const matched = threats.filter((th) => th.sourceMatch === "BOTH" || th.nasa.ip > 0).slice(0, 30);
    hitRef.current = [];

    for (let i = 0; i < matched.length; i++) {
      const th = matched[i];
      const isSel = selected?.designation === th.designation;
      const isHov = hover?.designation === th.designation;

      let h = 2166136261;
      for (let c = 0; c < th.designation.length; c++) { h ^= th.designation.charCodeAt(c); h = Math.imul(h, 16777619); }
      const hNorm = (h >>> 0) / 4294967295;

      const a = 0.6 + hNorm * 1.6;
      const e = 0.15 + Math.min(Math.abs(th.palermoDelta) * 0.08, 0.55);
      const incl = (0.05 + hNorm * 0.5) * (th.ysi?.ysi > 1 ? 1.3 : 1);
      const omega = hNorm * Math.PI * 2;
      const speed = 0.08 + (1 / (a * a)) * 0.12;
      const phase = hNorm * Math.PI * 2;

      const rgb = SEV_COLORS[th.divergenceSeverity] || "100,116,139";
      const alpha = isSel || isHov ? 0.9 : 0.3;
      const lineW = isSel ? 2 : isHov ? 1.5 : 0.7;

      // NASA orbit
      ctx.strokeStyle = `rgba(${rgb},${alpha})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      for (let s = 0; s <= 120; s++) {
        const theta = (s / 120) * Math.PI * 2;
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
        const xOrb = r * Math.cos(theta);
        const yOrb = r * Math.sin(theta);
        const cosO = Math.cos(omega); const sinO = Math.sin(omega);
        const cosI = Math.cos(incl); const sinI = Math.sin(incl);
        const x3 = xOrb * cosO - yOrb * sinO * cosI;
        const z3 = xOrb * sinO + yOrb * cosO * cosI;
        const y3 = yOrb * sinI;
        const [px, py] = project(x3, y3, z3, cx, cy, baseScale);
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // ESA offset orbit
      if (th.sourceMatch === "BOTH" && Math.abs(th.palermoDelta) > 0.1) {
        const offset = Math.min(Math.abs(th.palermoDelta) * 0.02, 0.06);
        ctx.strokeStyle = `rgba(255,109,0,${alpha * 0.5})`;
        ctx.lineWidth = lineW * 0.6;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        for (let s = 0; s <= 120; s++) {
          const theta = (s / 120) * Math.PI * 2;
          const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta)) + offset;
          const xOrb = r * Math.cos(theta + offset * 0.3);
          const yOrb = r * Math.sin(theta + offset * 0.3);
          const cosO = Math.cos(omega); const sinO = Math.sin(omega);
          const cosI = Math.cos(incl); const sinI = Math.sin(incl);
          const x3 = xOrb * cosO - yOrb * sinO * cosI;
          const z3 = xOrb * sinO + yOrb * cosO * cosI;
          const y3 = yOrb * sinI;
          const [px, py] = project(x3, y3, z3, cx, cy, baseScale);
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Asteroid dot
      const astTheta = t * speed + phase;
      const astR = (a * (1 - e * e)) / (1 + e * Math.cos(astTheta));
      const xOrb = astR * Math.cos(astTheta);
      const yOrb = astR * Math.sin(astTheta);
      const cosO = Math.cos(omega); const sinO = Math.sin(omega);
      const cosI = Math.cos(incl); const sinI = Math.sin(incl);
      const ax3 = xOrb * cosO - yOrb * sinO * cosI;
      const az3 = xOrb * sinO + yOrb * cosO * cosI;
      const ay3 = yOrb * sinI;
      const [astX, astY] = project(ax3, ay3, az3, cx, cy, baseScale);

      if (isSel || isHov) {
        const glowR = 10 + 3 * Math.sin(t * 3);
        const glow = ctx.createRadialGradient(astX, astY, 0, astX, astY, glowR);
        glow.addColorStop(0, `rgba(${rgb},0.6)`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(astX, astY, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      const dotR = isSel ? 5 : isHov ? 4 : 2.5;
      ctx.fillStyle = isSel || isHov ? `rgba(${rgb},1)` : `rgba(${rgb},${alpha + 0.2})`;
      ctx.beginPath();
      ctx.arc(astX, astY, dotR, 0, Math.PI * 2);
      ctx.fill();

      if (isSel || isHov || i < 5) {
        ctx.font = `${isSel ? "bold " : ""}${isSel ? 10 : 8}px monospace`;
        ctx.fillStyle = isSel ? "#ffffff" : `rgba(${rgb},0.75)`;
        ctx.fillText(th.designation, astX + 8, astY - 6);
        if (isSel) {
          ctx.font = "8px monospace";
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText(
            `ΔPS ${th.palermoDelta.toFixed(2)} • YSI ${th.ysi?.ysi?.toFixed(2) ?? "—"} • RRS ${th.readiness?.score ?? "—"}`,
            astX + 8, astY + 6
          );
        }
      }

      hitRef.current.push({ x: astX, y: astY, threat: th });
    }

    // HUD
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("3D ORBITAL DIVERGENCE — HELIOCENTRIC ECLIPTIC", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText(`${matched.length} objects • drag to rotate • scroll to zoom • click to inspect`, 12, 28);

    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(0,229,255,0.6)";
    ctx.fillText("— NASA Sentry-II (Yarkovsky)", 12, H - 28);
    ctx.fillStyle = "rgba(255,109,0,0.6)";
    ctx.fillText("--- ESA NEOCC/Aegis (Grav-only)", 12, H - 16);

    // Tooltip
    if (hover) {
      const lines = [
        hover.designation,
        `NASA IP: ${hover.nasa.ip > 0 ? hover.nasa.ip.toExponential(2) : "—"}`,
        `ESA IP: ${hover.esa.ipCum > 0 ? hover.esa.ipCum.toExponential(2) : "—"}`,
        `ΔPS: ${hover.palermoDelta.toFixed(3)}`,
        `YSI: ${hover.ysi?.ysi?.toFixed(2) ?? "—"} (${hover.ysi?.classification ?? "—"})`,
        `RRS: ${hover.readiness?.score ?? "—"} (${hover.readiness?.priority ?? "—"})`,
      ];
      const tw = 185;
      const th2 = lines.length * 13 + 10;
      const p = hitRef.current.find((hh) => hh.threat === hover);
      const tx = Math.min(W - tw - 8, (p?.x ?? 0) + 16);
      const ty = Math.max(8, (p?.y ?? 0) - th2 - 8);
      ctx.fillStyle = "rgba(7,7,15,0.94)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(tx, ty, tw, th2);
      ctx.strokeRect(tx, ty, tw, th2);
      ctx.font = "9px monospace";
      lines.forEach((ln, i) => {
        ctx.fillStyle = i === 0 ? "#ffffff" : i === 1 ? "rgba(0,229,255,0.8)" : i === 2 ? "rgba(255,109,0,0.8)" : "rgba(255,255,255,0.6)";
        ctx.fillText(ln, tx + 8, ty + 16 + i * 13);
      });
    }

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [threats, selected, hover, project]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { handleMouseUp(); setHover(null); }}
      onClick={handleClick}
      onWheel={handleWheel}
      className="w-full h-full block cursor-grab active:cursor-grabbing"
      style={{ width: "100%", height: "100%" }}
    />
  );
}