"use client";
import { useEffect, useRef, useCallback } from "react";
import type { AdvancedThreat } from "@/lib/engine/types";

interface Props { threats: AdvancedThreat[]; selected: AdvancedThreat | null; onSelect?: (t: AdvancedThreat) => void; compact?: boolean; }

const CONTINENTS: number[][][] = [
  [[-166,68],[-160,70],[-148,70],[-140,69],[-130,71],[-118,72],[-104,73],[-92,72],[-82,69],[-74,62],[-58,53],[-55,47],[-66,44],[-70,41],[-75,35],[-80,31],[-80,25],[-84,30],[-90,29],[-97,26],[-97,21],[-94,16],[-87,13],[-83,8],[-79,9],[-84,15],[-92,17],[-100,19],[-106,24],[-111,29],[-117,33],[-122,38],[-124,44],[-124,50],[-130,55],[-136,59],[-146,60],[-154,58],[-160,55],[-166,60],[-168,65],[-166,68]],
  [[-78,8],[-72,12],[-64,10],[-56,6],[-50,2],[-44,-3],[-37,-8],[-35,-12],[-39,-18],[-44,-23],[-48,-28],[-53,-34],[-57,-39],[-62,-42],[-65,-47],[-68,-53],[-72,-55],[-74,-50],[-72,-44],[-70,-36],[-69,-28],[-67,-20],[-70,-15],[-75,-8],[-79,-2],[-80,3],[-78,8]],
  [[-17,14],[-16,20],[-12,27],[-6,33],[0,36],[8,37],[15,35],[22,32],[30,31],[34,28],[36,22],[38,15],[43,11],[48,11],[51,10],[46,3],[42,-5],[39,-12],[36,-19],[33,-26],[27,-34],[20,-35],[16,-29],[13,-20],[12,-12],[9,-4],[5,2],[-2,5],[-8,4],[-13,8],[-17,14]],
  [[-9,36],[-8,44],[-2,48],[-5,53],[0,57],[8,57],[14,55],[22,55],[28,58],[36,56],[44,52],[52,50],[60,50],[68,52],[76,54],[84,52],[92,47],[100,44],[108,40],[116,36],[122,32],[128,34],[132,38],[136,42],[140,46],[142,52],[148,56],[156,60],[164,62],[172,65],[179,67],[179,70],[170,70],[158,71],[144,72],[128,73],[110,74],[92,73],[74,72],[58,70],[44,68],[34,70],[26,71],[18,69],[10,64],[4,60],[-4,57],[-9,50],[-9,42],[-9,36]],
  [[114,-22],[113,-28],[116,-33],[121,-34],[127,-32],[132,-32],[137,-35],[140,-38],[146,-39],[150,-37],[153,-32],[153,-26],[150,-22],[146,-18],[142,-12],[137,-12],[132,-13],[128,-15],[122,-17],[117,-20],[114,-22]],
  [[-46,60],[-43,63],[-38,67],[-32,70],[-24,72],[-20,76],[-26,80],[-38,82],[-50,81],[-57,77],[-58,72],[-52,65],[-46,60]],
  [[-180,-70],[-150,-73],[-120,-72],[-90,-74],[-60,-73],[-30,-70],[0,-69],[30,-70],[60,-68],[90,-69],[120,-70],[150,-72],[180,-70],[180,-90],[-180,-90],[-180,-70]],
];

export default function CorridorMap({ threats, selected, onSelect, compact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const clickRef = useRef<Array<{ x: number; y: number; threat: AdvancedThreat }>>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: AdvancedThreat | null = null; let bestD = 24;
    for (const t of clickRef.current) { const d = Math.hypot(t.x - mx, t.y - my); if (d < bestD) { bestD = d; best = t.threat; } }
    if (best) onSelect(best);
  }, [onSelect]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (W < 10 || H < 10) { animRef.current = requestAnimationFrame(draw); return; }
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) { canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = timeRef.current;
    const px = (lon: number) => ((lon + 180) / 360) * W;
    const py = (lat: number) => ((90 - lat) / 180) * H;

    ctx.fillStyle = "#030308"; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 0.5;
    for (let lon = -180; lon <= 180; lon += 30) { ctx.strokeStyle = lon === 0 ? "rgba(0,229,255,0.12)" : "rgba(0,229,255,0.04)"; ctx.beginPath(); ctx.moveTo(px(lon), 0); ctx.lineTo(px(lon), H); ctx.stroke(); }
    for (let lat = -90; lat <= 90; lat += 30) { ctx.strokeStyle = lat === 0 ? "rgba(0,229,255,0.14)" : "rgba(0,229,255,0.04)"; ctx.beginPath(); ctx.moveTo(0, py(lat)); ctx.lineTo(W, py(lat)); ctx.stroke(); }

    for (const poly of CONTINENTS) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) { const x = px(poly[i][0]), y = py(poly[i][1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fillStyle = "rgba(140,180,220,0.055)"; ctx.fill(); ctx.strokeStyle = "rgba(140,180,220,0.16)"; ctx.lineWidth = 0.8; ctx.stroke();
    }

    clickRef.current = [];
    const withCorridor = threats.filter((th) => th.corridor.hasCorridor).sort((a, b) => b.corridor.lengthKm - a.corridor.lengthKm).slice(0, 30);
    withCorridor.forEach((th, i) => {
      const c = th.corridor; const isSel = selected?.designation === th.designation;
      const cxp = px(c.centerLonDeg), cyp = py(c.centerLatDeg);
      const kmPerPxY = 110.57 / (H / 180);
      const cosLat = Math.max(Math.cos((c.centerLatDeg * Math.PI) / 180), 0.15);
      const kmPerPxX = 111.32 * cosLat / (W / 360);
      let rx = Math.max(6, Math.min(c.lengthKm / 2 / kmPerPxX, W / 3));
      let ry = Math.max(2.5, Math.min(c.widthKm / 2 / kmPerPxY, H / 4));
      const rot = (c.orientationDeg * Math.PI) / 180;
      const pulse = 0.22 + 0.14 * Math.sin(t * 2 + i * 0.7);
      const alpha = isSel ? 0.75 : pulse;

      ctx.save(); ctx.beginPath(); ctx.ellipse(cxp, cyp, rx, ry, rot, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, Math.max(rx, ry));
      grad.addColorStop(0, `rgba(255,40,70,${alpha})`); grad.addColorStop(1, `rgba(255,40,70,${alpha * 0.15})`);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = isSel ? "rgba(255,120,140,0.95)" : `rgba(255,80,100,${alpha + 0.2})`;
      ctx.lineWidth = isSel ? 1.6 : 0.8; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 12; ctx.stroke(); ctx.setLineDash([]); ctx.restore();

      ctx.strokeStyle = isSel ? "#fff" : `rgba(255,160,170,${alpha + 0.3})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cxp - 5, cyp); ctx.lineTo(cxp + 5, cyp); ctx.moveTo(cxp, cyp - 5); ctx.lineTo(cxp, cyp + 5); ctx.stroke();

      if (isSel || (!compact && i < 5)) { ctx.font = `${isSel ? "bold " : ""}${compact ? 8 : 9}px monospace`; ctx.fillStyle = isSel ? "#fff" : "rgba(255,170,180,0.75)"; ctx.fillText(th.designation, cxp + 8, cyp - 6); }
      clickRef.current.push({ x: cxp, y: cyp, threat: th });
    });

    if (!compact) { ctx.font = "bold 10px monospace"; ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillText("IMPACT CORRIDOR PROJECTION — EQUIRECTANGULAR", 12, 16); ctx.font = "8px monospace"; ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillText(`${withCorridor.length} ground tracks • b-plane σ projection (Chodas 2015)`, 12, 28); }
    timeRef.current += 0.016; animRef.current = requestAnimationFrame(draw);
  }, [threats, selected, compact]);

  useEffect(() => { animRef.current = requestAnimationFrame(draw); return () => cancelAnimationFrame(animRef.current); }, [draw]);
  return <canvas ref={canvasRef} onClick={handleClick} className="w-full h-full block cursor-crosshair" style={{ width: "100%", height: "100%" }} />;
}
