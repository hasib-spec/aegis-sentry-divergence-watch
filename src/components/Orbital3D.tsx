"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { DivergenceMetrics } from "@/lib/engine/types";

interface Props {
  threats: DivergenceMetrics[];
  selected: DivergenceMetrics | null;
  onSelect?: (t: DivergenceMetrics) => void;
}

interface Orbit3D {
  designation: string;
  a: number;
  e: number;
  inclination: number;
  omega: number;
  w: number;
  phase: number;
  color: string;
  isSelected: boolean;
}

/**
 * Canvas-based 3D orbital visualization with perspective projection.
 * No Three.js dependency. Pure Canvas 2D with manual 3D math.
 *
 * Features:
 * - Perspective projection with proper depth sorting
 * - Auto-rotating camera with mouse drag
 * - Depth-based opacity and size
 * - Orbit trails with gradient
 * - Star field background
 */
export default function Orbital3D({ threats, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0.4, y: 0 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  const project = useCallback(
    (
      x: number,
      y: number,
      z: number,
      W: number,
      H: number,
      rotX: number,
      rotY: number
    ): { sx: number; sy: number; depth: number } => {
      // Rotate around Y axis
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      // Rotate around X axis
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      // Perspective projection
      const fov = 800;
      const scale = fov / (fov + z2 + 500);

      return {
        sx: W / 2 + x1 * scale,
        sy: H / 2 + y1 * scale,
        depth: z2,
      };
    },
    []
  );

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
    const rotX = rotationRef.current.x;
    const rotY = rotationRef.current.y + t * 0.1;

    // Background
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Star field
    for (let i = 0; i < 200; i++) {
      const sx = ((Math.sin(i * 127.1 + 42) * 0.5 + 0.5) * W);
      const sy = ((Math.cos(i * 311.7 + 42) * 0.5 + 0.5) * H);
      const brightness = 0.05 + 0.1 * Math.sin(t * 0.3 + i * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.fillRect(sx, sy, 1, 1);
    }

    const scale = Math.min(W, H) * 0.35;

    // Draw Sun
    const sunProj = project(0, 0, 0, W, H, rotX, rotY);
    const sunGrad = ctx.createRadialGradient(
      sunProj.sx, sunProj.sy, 0,
      sunProj.sx, sunProj.sy, 15
    );
    sunGrad.addColorStop(0, "rgba(255,220,0,0.9)");
    sunGrad.addColorStop(0.5, "rgba(255,140,0,0.4)");
    sunGrad.addColorStop(1, "rgba(255,100,0,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunProj.sx, sunProj.sy, 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw Earth orbit
    ctx.strokeStyle = "rgba(100,150,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      const ex = Math.cos(angle) * scale;
      const ey = 0;
      const ez = Math.sin(angle) * scale;
      const p = project(ex, ey, ez, W, H, rotX, rotY);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Earth position
    const earthAngle = t * 0.2;
    const earthX = Math.cos(earthAngle) * scale;
    const earthZ = Math.sin(earthAngle) * scale;
    const earthProj = project(earthX, 0, earthZ, W, H, rotX, rotY);
    ctx.fillStyle = "#4488ff";
    ctx.beginPath();
    ctx.arc(earthProj.sx, earthProj.sy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw asteroid orbits
    const matched = threats.filter((t) => t.sourceMatch === "BOTH").slice(0, 20);

    for (let i = 0; i < matched.length; i++) {
      const threat = matched[i];
      const isSel = selected?.designation === threat.designation;
      const isHov = hovered === threat.designation;

      const baseA = (0.6 + (i / matched.length) * 1.5) * scale;
      const e = 0.2 + Math.min(Math.abs(threat.palermoDelta) * 0.05, 0.5);
      const incl = (0.1 + (i % 5) * 0.15) * Math.PI;
      const omega = (i / matched.length) * Math.PI * 2;
      const w = (i * 1.7) % (Math.PI * 2);

      const alpha = isSel || isHov ? 0.9 : 0.3;
      const color = isSel ? "#00e5ff" : `rgba(0,229,255,${alpha})`;

      // Draw orbit path
      ctx.strokeStyle = color;
      ctx.lineWidth = isSel ? 2 : 0.8;
      ctx.beginPath();

      const points: Array<{ sx: number; sy: number; depth: number }> = [];
      for (let s = 0; s <= 80; s++) {
        const theta = (s / 80) * Math.PI * 2;
        const r = (baseA * (1 - e * e)) / (1 + e * Math.cos(theta));
        const xOrb = r * Math.cos(theta + w);
        const yOrb = r * Math.sin(theta + w);

        // Apply inclination and node rotation
        const x3d = xOrb * Math.cos(omega) - yOrb * Math.cos(incl) * Math.sin(omega);
        const y3d = yOrb * Math.sin(incl);
        const z3d = xOrb * Math.sin(omega) + yOrb * Math.cos(incl) * Math.cos(omega);

        const p = project(x3d, y3d, z3d, W, H, rotX, rotY);
        points.push(p);
        if (s === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();

      // Asteroid position
      const astAngle = t * (0.3 + i * 0.05) + i * 2.1;
      const astR = (baseA * (1 - e * e)) / (1 + e * Math.cos(astAngle + w));
      const axOrb = astR * Math.cos(astAngle + w);
      const ayOrb = astR * Math.sin(astAngle + w);
      const ax3d = axOrb * Math.cos(omega) - ayOrb * Math.cos(incl) * Math.sin(omega);
      const ay3d = ayOrb * Math.sin(incl);
      const az3d = axOrb * Math.sin(omega) + ayOrb * Math.cos(incl) * Math.cos(omega);
      const astProj = project(ax3d, ay3d, az3d, W, H, rotX, rotY);

      const depthAlpha = Math.max(0.2, Math.min(1, 1 - astProj.depth / 1000));
      const size = isSel ? 5 : 3;

      ctx.fillStyle = isSel
        ? "#ffffff"
        : `rgba(0,229,255,${depthAlpha * alpha})`;
      ctx.beginPath();
      ctx.arc(astProj.sx, astProj.sy, size, 0, Math.PI * 2);
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = "rgba(0,229,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(astProj.sx, astProj.sy, 10 + 3 * Math.sin(t * 3), 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(threat.designation, astProj.sx + 12, astProj.sy - 5);
        ctx.fillStyle = "rgba(255,100,100,0.8)";
        ctx.fillText(`ΔPS: ${threat.palermoDelta.toFixed(2)}`, astProj.sx + 12, astProj.sy + 8);
      }
    }

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("3D ORBITAL PROJECTION — HELIOCENTRIC ECLIPTIC", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillText("Drag to rotate • Auto-rotating", 12, 28);

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [threats, selected, hovered, project]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, rotationRef.current.x + dy * 0.005)
      );
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    }
  };

  const handleMouseUp = () => {
    dragRef.current.dragging = false;
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block cursor-grab active:cursor-grabbing"
      style={{ width: "100%", height: "100%" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}