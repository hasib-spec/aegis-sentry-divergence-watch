"use client";

import { useEffect, useRef, useState } from "react";
import { Orbit, AlertTriangle } from "lucide-react";
import type { DivergenceMetrics } from "@/lib/engine/types";

declare global {
  interface Window {
    Cesium: any;
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
    let resizeObserver: ResizeObserver | null = null;

    function tryInit() {
      if (!mounted) return;
      const el = containerRef.current;
      if (!el) return;

      // CRITICAL: Container must have actual pixel dimensions
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      if (!window.Cesium) {
        // CesiumJS CDN not loaded yet, retry
        setTimeout(tryInit, 300);
        return;
      }

      try {
        createViewer();
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "WebGL init failed");
        }
      }
    }

    function createViewer() {
      const Cesium = window.Cesium;
      const el = containerRef.current;
      if (!Cesium || !el || viewerRef.current) return;

      const viewer = new Cesium.Viewer(el, {
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
        contextOptions: {
          webgl: {
            alpha: false,
            depth: true,
            stencil: false,
            antialias: true,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          },
        },
      });

      // Dark globe appearance
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1628");
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030308");
      viewer.scene.globe.showGroundAtmosphere = false;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;

      // Remove default imagery and add dark texture
      viewer.imageryLayers.removeAll();
      try {
        const provider = new Cesium.TileMapServiceImageryProvider({
          url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        });
        viewer.imageryLayers.addImageryProvider(provider);
        viewer.imageryLayers.get(0).alpha = 0.35;
      } catch {
        // Stay dark if texture unavailable
      }

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 3.5e8),
      });

      viewerRef.current = viewer;
      setReady(true);
    }

    // Use ResizeObserver to detect when container gets real dimensions
    const el = containerRef.current;
    if (el) {
      resizeObserver = new ResizeObserver(() => {
        if (!ready && !viewerRef.current) {
          tryInit();
        }
      });
      resizeObserver.observe(el);
    }

    // Also try after a delay as fallback
    const fallbackTimer = setTimeout(tryInit, 1500);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      if (resizeObserver) resizeObserver.disconnect();
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

  // Render orbits when data changes
  useEffect(() => {
    if (!ready || !viewerRef.current || !window.Cesium) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    for (const entity of entitiesRef.current) {
      try {
        viewer.entities.remove(entity);
      } catch {
        /* */
      }
    }
    entitiesRef.current = [];

    const SCALE = 1e5;
    const items = threats
      .filter((t) => t.nasaPosition || t.esaPosition)
      .slice(0, 40);

    for (const t of items) {
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

    // Sun
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
        <div className="text-center p-6 max-w-xs">
          <AlertTriangle className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="font-mono text-[10px] text-zinc-500 mb-1">3D GLOBE UNAVAILABLE</p>
          <p className="font-mono text-[9px] text-zinc-700 leading-relaxed">
            {error}. Try Chrome/Firefox with hardware acceleration enabled.
            The data table remains fully functional.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Container with explicit dimensions for WebGL */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          minWidth: "200px",
          minHeight: "200px",
        }}
      />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030308] z-10">
          <div className="text-center">
            <Orbit className="w-7 h-7 text-cyan-400 animate-spin mx-auto" style={{ animationDuration: "2s" }} />
            <p className="font-mono text-[9px] text-zinc-700 mt-2">INITIALIZING WEBGL2...</p>
          </div>
        </div>
      )}
      {ready && (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3">
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
      )}
    </div>
  );
}
