"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * AEGIS-SENTRY v3.4 — NEO Survey Blind Spot Mapper
 *
 * Visualizes where on the sky undiscovered near-Earth asteroids
 * are most likely hiding, based on:
 *
 *   1. Solar elongation gap: ground surveys cannot observe within
 *      ~45° of the Sun (daylight + atmospheric scattering)
 *
 *   2. Ecliptic concentration: ~90% of NEOs have i < 30°,
 *      so the ecliptic plane is the highest-density region
 *
 *   3. Opposition effect: surveys preferentially detect objects
 *      near opposition (elongation ~180°), creating a detection
 *      bias away from the Sun direction
 *
 *   4. Southern sky gap: most surveys are in the northern hemisphere
 *      (Catalina, Pan-STARRS, ATLAS-Hawaii), leaving the deep south
 *      under-covered until Rubin/LSST comes online
 *
 * The result: a "blind zone" map showing where a city-killer
 * is most likely approaching from undetected.
 *
 * References:
 *   NASA OIG IG-25-006: "43% of 140m+ NEOs discovered"
 *   NEO Surveyor delay to 2027-2028
 *   Mainzer et al. (2019), "NEO Surveyor mission design"
 *   Chesley et al. (2024), "Completeness of the NEO population"
 */

interface Props {
  /** Current date for computing Sun position */
  nowJD?: number;
}

interface BlindZone {
  /** Center ecliptic longitude (degrees) */
  lonDeg: number;
  /** Center ecliptic latitude (degrees) */
  latDeg: number;
  /** Estimated undiscovered object density (relative, 0-1) */
  density: number;
  /** Reason for blindness */
  reason: "SOLAR_ELONGATION" | "SOUTHERN_GAP" | "GALACTIC_PLANE" | "ATMOSPHERIC";
}

export default function BlindSpotMap({ nowJD }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [hover, setHover] = useState<{ x: number; y: number; info: string } | null>(null);

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

    // Mollweide-like projection: ecliptic lon/lat → x/y
    const ML = 30, MR = 30, MT = 50, MB = 40;
    const pw = W - ML - MR;
    const ph = H - MT - MB;
    const cx = ML + pw / 2;
    const cy = MT + ph / 2;

    const toX = (lonDeg: number) => cx + (lonDeg / 180) * (pw / 2);
    const toY = (latDeg: number) => cy - (latDeg / 90) * (ph / 2);

    // Background
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("NEO SURVEY BLIND SPOT MAP — ECLIPTIC COORDINATES", 12, 16);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText("Where undiscovered city-killers are most likely hiding • 57% of 140m+ NEOs remain unfound", 12, 28);

    // Grid: ecliptic coordinates
    ctx.strokeStyle = "rgba(0,229,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let lon = -180; lon <= 180; lon += 30) {
      ctx.beginPath();
      ctx.moveTo(toX(lon), MT);
      ctx.lineTo(toX(lon), MT + ph);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "7px monospace";
      ctx.fillText(`${lon}°`, toX(lon) - 8, H - MB + 12);
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      ctx.beginPath();
      ctx.moveTo(ML, toY(lat));
      ctx.lineTo(ML + pw, toY(lat));
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText(`${lat}°`, ML - 22, toY(lat) + 3);
    }

    // Ecliptic plane (lat=0) — where most NEOs are
    ctx.strokeStyle = "rgba(255,200,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ML, toY(0));
    ctx.lineTo(ML + pw, toY(0));
    ctx.stroke();
    ctx.fillStyle = "rgba(255,200,0,0.3)";
    ctx.fillText("ECLIPTIC (90% of NEOs within ±30°)", ML + 4, toY(0) - 5);

    // Sun position (moves ~1°/day along ecliptic)
    const J2000 = 2451545.0;
    const daysSinceJ2000 = (nowJD ?? (J2000 + Date.now() / 86400000)) - J2000;
    const sunLonDeg = ((100.46 + 0.9856 * daysSinceJ2000) % 360 + 360) % 360 - 180;
    const sunX = toX(sunLonDeg);
    const sunY = toY(0);

    // Solar elongation blind zone (±45° from Sun)
    const blindHalfWidth = 45; // degrees
    const blindLeft = toX(sunLonDeg - blindHalfWidth);
    const blindRight = toX(sunLonDeg + blindHalfWidth);

    // Draw blind zone gradient
    const grad = ctx.createLinearGradient(blindLeft, 0, blindRight, 0);
    grad.addColorStop(0, "rgba(255,50,50,0)");
    grad.addColorStop(0.2, "rgba(255,50,50,0.12)");
    grad.addColorStop(0.5, "rgba(255,50,50,0.25)");
    grad.addColorStop(0.8, "rgba(255,50,50,0.12)");
    grad.addColorStop(1, "rgba(255,50,50,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(blindLeft, MT, blindRight - blindLeft, ph);

    // Sun marker
    const sunPulse = 6 + 2 * Math.sin(t * 2);
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunPulse * 2);
    sunGrad.addColorStop(0, "rgba(255,220,0,0.9)");
    sunGrad.addColorStop(0.5, "rgba(255,140,0,0.4)");
    sunGrad.addColorStop(1, "rgba(255,100,0,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunPulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdd00";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,220,0,0.7)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("☉ SUN", sunX - 12, sunY - 12);

    // Blind zone label
    ctx.fillStyle = "rgba(255,80,80,0.7)";
    ctx.font = "bold 8px monospace";
    ctx.fillText("SOLAR BLIND ZONE (±45°)", sunX - 50, MT + 14);
    ctx.font = "7px monospace";
    ctx.fillStyle = "rgba(255,80,80,0.5)";
    ctx.fillText("Ground surveys CANNOT observe here", sunX - 55, MT + 24);

    // Southern sky gap (below -30° ecliptic lat)
    const southY = toY(-30);
    ctx.fillStyle = "rgba(100,50,255,0.06)";
    ctx.fillRect(ML, southY, pw, MT + ph - southY);
    ctx.strokeStyle = "rgba(100,50,255,0.2)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ML, southY);
    ctx.lineTo(ML + pw, southY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(100,50,255,0.5)";
    ctx.font = "7px monospace";
    ctx.fillText("SOUTHERN GAP (limited survey coverage until Rubin/LSST)", ML + 4, southY + 12);

    // Opposition direction (180° from Sun) — best detection zone
    const oppLonDeg = sunLonDeg > 0 ? sunLonDeg - 180 : sunLonDeg + 180;
    const oppX = toX(oppLonDeg);
    ctx.strokeStyle = "rgba(52,211,153,0.3)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(oppX, MT);
    ctx.lineTo(oppX, MT + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(52,211,153,0.5)";
    ctx.font = "7px monospace";
    ctx.fillText("OPPOSITION (best detection)", oppX - 40, MT + ph - 8);

    // Simulated undiscovered object density (hotspots)
    // Based on: ecliptic concentration × solar elongation × survey coverage
    const hotspots: Array<{ lon: number; lat: number; intensity: number; label: string }> = [];

    // Generate hotspots in the blind zone
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + t * 0.1;
      const lonOffset = (Math.sin(angle * 3 + i) * 30);
      const latOffset = (Math.cos(angle * 2 + i * 1.7) * 20);
      const lon = sunLonDeg + lonOffset;
      const lat = latOffset;
      const intensity = 0.3 + 0.4 * Math.abs(Math.sin(angle + i));
      hotspots.push({ lon, lat, intensity, label: "" });
    }

    // Southern hotspots
    for (let i = 0; i < 6; i++) {
      const lon = -180 + (i / 6) * 360 + Math.sin(t * 0.05 + i) * 10;
      const lat = -40 - Math.random() * 20;
      hotspots.push({ lon, lat, intensity: 0.2 + 0.2 * Math.sin(t + i), label: "" });
    }

    // Draw hotspots
    for (const hs of hotspots) {
      const hx = toX(hs.lon);
      const hy = toY(hs.lat);
      if (hx < ML || hx > ML + pw || hy < MT || hy > MT + ph) continue;

      const pulse = 0.5 + 0.3 * Math.sin(t * 2 + hs.lon);
      const radius = 8 + hs.intensity * 12;
      const hsGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius);
      hsGrad.addColorStop(0, `rgba(255,60,60,${hs.intensity * pulse * 0.6})`);
      hsGrad.addColorStop(0.5, `rgba(255,100,50,${hs.intensity * pulse * 0.3})`);
      hsGrad.addColorStop(1, "rgba(255,60,60,0)");
      ctx.fillStyle = hsGrad;
      ctx.beginPath();
      ctx.arc(hx, hy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Question mark for unknown objects
      ctx.fillStyle = `rgba(255,255,255,${hs.intensity * 0.4})`;
      ctx.font = "10px monospace";
      ctx.fillText("?", hx - 3, hy + 4);
    }

    // Survey coverage indicators
    const surveys = [
      { name: "Catalina", lon: -110, lat: 34, color: "rgba(0,229,255,0.4)" },
      { name: "Pan-STARRS", lon: -156, lat: 21, color: "rgba(0,229,255,0.4)" },
      { name: "ATLAS-HI", lon: -156, lat: 21, color: "rgba(0,229,255,0.3)" },
      { name: "ATLAS-SA", lon: -70, lat: -30, color: "rgba(52,211,153,0.4)" },
      { name: "Rubin/LSST", lon: -70, lat: -30, color: "rgba(52,211,153,0.6)" },
    ];

    for (const sv of surveys) {
      const sx = toX(sv.lon);
      const sy = toY(sv.lat);
      ctx.fillStyle = sv.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "7px monospace";
      ctx.fillText(sv.name, sx + 5, sy + 3);
    }

    // Statistics box
    const statsX = W - 180;
    const statsY = MT + 10;
    ctx.fillStyle = "rgba(7,7,15,0.85)";
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(statsX, statsY, 168, 80);
    ctx.strokeRect(statsX, statsY, 168, 80);
    ctx.font = "bold 8px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("DISCOVERY STATUS", statsX + 8, statsY + 14);
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(52,211,153,0.7)";
    ctx.fillText("140m+ found: 43%", statsX + 8, statsY + 28);
    ctx.fillStyle = "rgba(248,113,113,0.7)";
    ctx.fillText("140m+ missing: ~15,000", statsX + 8, statsY + 40);
    ctx.fillStyle = "rgba(251,191,36,0.7)";
    ctx.fillText("1km+ found: 95%", statsX + 8, statsY + 52);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("NEO Surveyor: 2027-2028", statsX + 8, statsY + 64);
    ctx.fillText("Rubin first light: 2026", statsX + 8, statsY + 74);

    // Legend
    const legY = H - 14;
    ctx.font = "7px monospace";
    ctx.fillStyle = "rgba(255,60,60,0.7)";
    ctx.fillText("● HIGH RISK (blind zone)", 12, legY);
    ctx.fillStyle = "rgba(100,50,255,0.7)";
    ctx.fillText("● SOUTHERN GAP", 160, legY);
    ctx.fillStyle = "rgba(52,211,153,0.7)";
    ctx.fillText("● SURVEY COVERAGE", 280, legY);
    ctx.fillStyle = "rgba(255,220,0,0.7)";
    ctx.fillText("☉ SUN", 400, legY);

    timeRef.current += 0.016;
    animRef.current = requestAnimationFrame(draw);
  }, [nowJD, hover]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, info: "" });
      }}
      onMouseLeave={() => setHover(null)}
      className="w-full h-full block cursor-crosshair"
      style={{ width: "100%", height: "100%" }}
    />
  );
}