"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface ApproachData {
  designation: string;
  nextApproachDate: string;
  nextApproachLD: number;
  nextApproachKm: number;
  nextApproachVelocityKmS: number;
  approachesWithin10LD: number;
  approachesWithin1LD: number;
  minDistanceLD: number;
  minDistanceDate: string;
  moidAU?: number | null;
  allApproaches: Array<{
    approachDate: string;
    distLD: number;
    vRelKmS: number;
  }>;
}

interface Props {
  approaches: ApproachData[];
  onSelect?: (designation: string) => void;
}

export default function ApproachTimeline({ approaches, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [hover, setHover] = useState<ApproachData | null>(null);
  const rowsRef = useRef<Array<{ y: number; h: number; data: ApproachData }>>([]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    let found: ApproachData | null = null;
    for (const row of rowsRef.current) {
      if (my >= row.y && my <= row.y + row.h) {
        found = row.data;
        break;
      }
    }
    setHover(found);
  }, []);

  const handleClick = useCallback(() => {
    if (hover && onSelect) onSelect(hover.designation);
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
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("CLOSE APPROACH TIMELINE — NASA CAD", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText("Distances in Lunar Distances (LD) • 1 LD = 384,400 km", 12, 28);

    // Column headers
    const colX = { des: 12, date: 140, dist: 260, vel: 360, moid: 440, bar: 520 };
    const headerY = 48;
    ctx.font = "bold 8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText("OBJECT", colX.des, headerY);
    ctx.fillText("NEXT APPROACH", colX.date, headerY);
    ctx.fillText("DISTANCE", colX.dist, headerY);
    ctx.fillText("V_REL", colX.vel, headerY);
    ctx.fillText("MOID", colX.moid, headerY);
    ctx.fillText("PROXIMITY", colX.bar, headerY);

    // Rows
    rowsRef.current = [];
    const rowH = 32;
    const startY = 60;

    approaches.slice(0, 15).forEach((ap, i) => {
      const y = startY + i * rowH;
      const isHov = hover?.designation === ap.designation;

      // Row background
      if (isHov) {
        ctx.fillStyle = "rgba(0,229,255,0.04)";
        ctx.fillRect(0, y, W, rowH);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(0, y + rowH);
      ctx.lineTo(W, y + rowH);
      ctx.stroke();

      // Designation
      ctx.font = `${isHov ? "bold " : ""}10px monospace`;
      ctx.fillStyle = isHov ? "#00e5ff" : "rgba(255,255,255,0.7)";
      ctx.fillText(ap.designation, colX.des, y + 20);

      // Date
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const dateStr = ap.nextApproachDate !== "—" ? ap.nextApproachDate.slice(0, 17) : "—";
      ctx.fillText(dateStr, colX.date, y + 20);

      // Distance (color-coded)
      const distColor = ap.nextApproachLD < 1 ? "rgba(248,113,113,0.9)" :
        ap.nextApproachLD < 5 ? "rgba(251,191,36,0.9)" :
        ap.nextApproachLD < 20 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.35)";
      ctx.fillStyle = distColor;
      ctx.fillText(`${ap.nextApproachLD.toFixed(2)} LD`, colX.dist, y + 20);

      // Velocity
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(`${ap.nextApproachVelocityKmS.toFixed(1)} km/s`, colX.vel, y + 20);

      // MOID
      if (ap.moidAU !== null && ap.moidAU !== undefined) {
        const moidColor = ap.moidAU < 0.005 ? "rgba(248,113,113,0.9)" :
          ap.moidAU < 0.05 ? "rgba(251,191,36,0.8)" : "rgba(52,211,153,0.7)";
        ctx.fillStyle = moidColor;
        ctx.fillText(`${ap.moidAU.toFixed(4)} AU`, colX.moid, y + 20);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("—", colX.moid, y + 20);
      }

      // Proximity bar (log scale: 0.1 LD → full, 100 LD → empty)
      const barW = W - colX.bar - 20;
      const barH = 6;
      const barY = y + 14;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(colX.bar, barY, barW, barH);

      const logDist = Math.log10(Math.max(ap.nextApproachLD, 0.01));
      const fill = Math.max(0, Math.min(1, 1 - logDist / 2)); // 0.01 LD → 1, 100 LD → 0
      const barColor = fill > 0.7 ? "rgba(248,113,113,0.8)" :
        fill > 0.4 ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.5)";
      ctx.fillStyle = barColor;
      ctx.fillRect(colX.bar, barY, barW * fill, barH);

      // Pulse for very close approaches
      if (ap.nextApproachLD < 1) {
        const pulse = 0.3 + 0.3 * Math.sin(t * 3 + i);
        ctx.fillStyle = `rgba(248,113,113,${pulse})`;
        ctx.beginPath();
        ctx.arc(colX.bar - 8, barY + 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      rowsRef.current.push({ y, h: rowH, data: ap });
    });

    // Legend
    const legendY = H - 20;
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(248,113,113,0.7)";
    ctx.fillText("● < 1 LD (within Moon's orbit)", 12, legendY);
    ctx.fillStyle = "rgba(251,191,36,0.7)";
    ctx.fillText("● < 5 LD", 200, legendY);
    ctx.fillStyle = "rgba(52,211,153,0.7)";
    ctx.fillText("● > 5 LD (safe)", 280, legendY);

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [approaches, hover]);

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
      className="w-full h-full block cursor-pointer"
      style={{ width: "100%", height: "100%" }}
    />
  );
}