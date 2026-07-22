"use client";

import { useEffect, useRef, useState } from "react";
import { Orbit, AlertTriangle } from "lucide-react";
import type { DivergenceMetrics } from "@/lib/engine/types";

declare global {
  interface Window {
    Cesium: any;
    CESIUM_BASE_URL: string;
  }
}

interface Props {
  threats: DivergenceMetrics[];
  selected: DivergenceMetrics | null;
}

export default function OrbitsViewer({ threats, selected }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let attempts = 0;

    function waitForCesium() {
      if (!mounted) return;
      attempts++;

      if (window.Cesium && containerRef.current) {
        try {
          initViewer();
        } catch (err) {
          if (mounted) {
            setError(err instanceof Error ? err.message : "Init failed");
          }
        }
        return;
      }

      if (attempts > 50) {
        if (mounted) setError("CesiumJS CDN failed to load");
        return;
      }

      setTimeout(waitForCesium, 200);
    }

    function initViewer() {
      const Cesium = window.Cesium;
      if (!Cesium || !containerRef.current) return;

      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement("div"),
        baseLayer: false,
      });

      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1628");
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030308");
      viewer.scene.globe.showGroundAtmosphere = false;

      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 3.5e8),
      });

      viewerRef.current = viewer;
      setReady(true);
    }

    waitForCesium();

    return () => {
      mounted = false;
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* */
        }
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !viewerRef.current || !window.Cesium) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    for (const entity of entitiesRef.current) {
      viewer.entities.remove(entity);
    }
    entitiesRef.current = [];

    const SCALE = 1e5;
    const items = threats
      .filter((t) => t.nasaPosition || t.esaPosition)
      .slice(0, 40);

    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      const isSel = selected?.designation === t.designation;

      if (t.nasaPosition) {
        const p = t.nasaPosition;
        entitiesRef.current.push(
          viewer.entities.add({
            position: new Cesium.Cartesian3(p.x / SCALE, p.y / SCALE, p.z / SCALE),
            point: {
              pixelSize: isSel ? 10 : 5,
              color: Cesium.Color.fromCssColorString("#00e5ff").withAlpha(isSel ? 1 : 0.6),
              outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
              outlineWidth: 1,
            },
          })
        );
      }

      if (t.esaPosition) {
        const p = t.esaPosition;
        entitiesRef.current.push(
          viewer.entities.add({
            position: new Cesium.Cartesian3(p.x / SCALE, p.y / SCALE, p.z / SCALE),
            point: {
              pixelSize: isSel ? 10 : 4,
              color: Cesium.Color.fromCssColorString("#ff6d00").withAlpha(isSel ? 1 : 0.5),
              outlineColor: Cesium.Color.WHITE.withAlpha(0.2),
              outlineWidth: 1,
            },
          })
        );
      }

      if (t.nasaPosition && t.esaPosition && t.spatialDivergenceKm > 0) {
        entitiesRef.current.push(
          viewer.entities.add({
            polyline: {
              positions: [
                new Cesium.Cartesian3(t.nasaPosition.x / SCALE, t.nasaPosition.y / SCALE, t.nasaPosition.z / SCALE),
                new Cesium.Cartesian3(t.esaPosition.x / SCALE, t.esaPosition.y / SCALE, t.esaPosition.z / SCALE),
              ],
              width: isSel ? 3 : 1,
              material: Cesium.Color.fromCssColorString("#ff0044").withAlpha(isSel ? 0.9 : 0.3),
            },
          })
        );
      }

      if (isSel && t.nasaPosition) {
        entitiesRef.current.push(
          viewer.entities.add({
            position: new Cesium.Cartesian3(t.nasaPosition.x / SCALE, t.nasaPosition.y / SCALE, t.nasaPosition.z / SCALE),
            label: {
              text: `${t.designation}\nΔPS: ${t.palermoDelta.toFixed(3)} | Δr: ${t.spatialDivergenceKm.toFixed(0)} km`,
              font: "11px monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(15, -15),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("#0a0a12").withAlpha(0.95),
            },
          })
        );
      }
    }

    entitiesRef.current.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.ZERO,
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString("#ffdd00"),
          outlineColor: Cesium.Color.fromCssColorString("#ff8800"),
          outlineWidth: 3,
        },
      })
    );

    viewer.scene.requestRender();
  }, [threats, selected, ready]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#030308]">
        <div className="text-center p-6">
          <AlertTriangle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="font-mono text-xs text-zinc-500">WEBGL OFFLINE</p>
          <p className="font-mono text-[10px] text-zinc-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030308]">
          <Orbit className="w-8 h-8 text-cyan-400 animate-spin" style={{ animationDuration: "2s" }} />
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3">
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyan-400/70">
          <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> NASA
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-orange-400/70">
          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> ESA
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400/70">
          <span className="w-3 h-0.5 bg-red-500 inline-block" /> Δr
        </span>
      </div>
    </div>
  );
}