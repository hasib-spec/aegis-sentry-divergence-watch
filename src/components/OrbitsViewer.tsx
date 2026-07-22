"use client";

import { useEffect, useRef, useState } from "react";
import { Orbit, AlertTriangle } from "lucide-react";
import type { OrbitsViewerProps } from "@/lib/engine/types";
import type { Entity, Viewer } from "cesium";

export default function OrbitsViewer({
  threats,
  selected,
}: OrbitsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesRef = useRef<Entity[]>([]);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [cesiumError, setCesiumError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initCesium() {
      try {
        if (typeof window === "undefined") return;

        (window as unknown as Record<string, unknown>).CESIUM_BASE_URL =
          "/cesium/";

        const Cesium = await import("cesium");
        if (!mounted || !containerRef.current) return;

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

        viewer.scene.globe.baseColor =
          Cesium.Color.fromCssColorString("#0a1628");
        viewer.scene.backgroundColor =
          Cesium.Color.fromCssColorString("#030308");
        viewer.scene.globe.showGroundAtmosphere = false;

        if (viewer.scene.skyAtmosphere) {
          viewer.scene.skyAtmosphere.show = false;
        }
        if (viewer.scene.sun) {
          viewer.scene.sun.show = false;
        }
        if (viewer.scene.moon) {
          viewer.scene.moon.show = false;
        }

        try {
          const provider =
            await Cesium.TileMapServiceImageryProvider.fromUrl(
              Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
            );
          viewer.imageryLayers.add(
            new Cesium.ImageryLayer(provider, { alpha: 0.4 })
          );
        } catch {
          // Globe stays dark — acceptable fallback
        }

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 20, 3.5e8),
        });

        viewerRef.current = viewer;
        setCesiumLoaded(true);
      } catch (err) {
        if (mounted) {
          setCesiumError(
            err instanceof Error ? err.message : "CesiumJS init failed"
          );
        }
      }
    }

    initCesium();
    return () => {
      mounted = false;
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* already destroyed */
        }
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current) return;

    async function renderOrbits() {
      try {
        const Cesium = await import("cesium");
        const viewer = viewerRef.current;
        if (!viewer) return;

        for (const entity of entitiesRef.current) {
          viewer.entities.remove(entity);
        }
        entitiesRef.current = [];

        const SCALE = 1e5;

        const threatsWithPositions = threats
          .filter((t) => t.nasaPosition || t.esaPosition)
          .slice(0, 40);

        for (let i = 0; i < threatsWithPositions.length; i++) {
          const threat = threatsWithPositions[i];
          const isSelected =
            selected?.designation === threat.designation;

          if (threat.nasaPosition) {
            const pos = threat.nasaPosition;
            const nasaPoint = viewer.entities.add({
              position: new Cesium.Cartesian3(
                pos.x / SCALE,
                pos.y / SCALE,
                pos.z / SCALE
              ),
              point: {
                pixelSize: isSelected ? 10 : 5,
                color: Cesium.Color.fromCssColorString("#00e5ff").withAlpha(
                  isSelected ? 1.0 : 0.6
                ),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
                outlineWidth: 1,
              },
            });
            entitiesRef.current.push(nasaPoint);
          }

          if (threat.esaPosition) {
            const pos = threat.esaPosition;
            const esaPoint = viewer.entities.add({
              position: new Cesium.Cartesian3(
                pos.x / SCALE,
                pos.y / SCALE,
                pos.z / SCALE
              ),
              point: {
                pixelSize: isSelected ? 10 : 4,
                color: Cesium.Color.fromCssColorString("#ff6d00").withAlpha(
                  isSelected ? 1.0 : 0.5
                ),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.2),
                outlineWidth: 1,
              },
            });
            entitiesRef.current.push(esaPoint);
          }

          if (
            threat.nasaPosition &&
            threat.esaPosition &&
            threat.spatialDivergenceKm > 0
          ) {
            const divLine = viewer.entities.add({
              polyline: {
                positions: [
                  new Cesium.Cartesian3(
                    threat.nasaPosition.x / SCALE,
                    threat.nasaPosition.y / SCALE,
                    threat.nasaPosition.z / SCALE
                  ),
                  new Cesium.Cartesian3(
                    threat.esaPosition.x / SCALE,
                    threat.esaPosition.y / SCALE,
                    threat.esaPosition.z / SCALE
                  ),
                ],
                width: isSelected ? 3 : 1,
                material: Cesium.Color.fromCssColorString("#ff0044").withAlpha(
                  isSelected ? 0.9 : 0.3
                ),
              },
            });
            entitiesRef.current.push(divLine);
          }

          if (isSelected && threat.nasaPosition) {
            const label = viewer.entities.add({
              position: new Cesium.Cartesian3(
                threat.nasaPosition.x / SCALE,
                threat.nasaPosition.y / SCALE,
                threat.nasaPosition.z / SCALE
              ),
              label: {
                text: `${threat.designation}\nΔPS: ${threat.palermoDelta.toFixed(3)} | Δr: ${threat.spatialDivergenceKm.toFixed(0)} km\nYarkovsky da/dt: ${(threat.yarkovskyDriftAUDay * 1e6).toExponential(2)} AU/Myr`,
                font: "11px JetBrains Mono, monospace",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(15, -15),
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString(
                  "#0a0a12"
                ).withAlpha(0.95),
                backgroundPadding: new Cesium.Cartesian2(10, 6),
              },
            });
            entitiesRef.current.push(label);
          }
        }

        const sun = viewer.entities.add({
          position: Cesium.Cartesian3.ZERO,
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString("#ffdd00"),
            outlineColor: Cesium.Color.fromCssColorString("#ff8800"),
            outlineWidth: 3,
          },
        });
        entitiesRef.current.push(sun);

        viewer.scene.requestRender();
      } catch {
        /* non-fatal render error */
      }
    }

    renderOrbits();
  }, [threats, selected, cesiumLoaded]);

  if (cesiumError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-void">
        <div className="text-center p-6">
          <AlertTriangle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="font-mono text-xs text-zinc-500">
            WEBGL RENDERER OFFLINE
          </p>
          <p className="font-mono text-[10px] text-zinc-700 mt-1">
            {cesiumError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {!cesiumLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-void">
          <Orbit
            className="w-8 h-8 text-nasa animate-spin mx-auto"
            style={{ animationDuration: "2s" }}
          />
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3">
        <span className="flex items-center gap-1 text-[9px] font-mono text-nasa/70">
          <span className="w-2 h-2 rounded-full bg-nasa inline-block" />
          NASA (Yarkovsky)
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-esa/70">
          <span className="w-2 h-2 rounded-full bg-esa inline-block" />
          ESA (Grav-only)
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400/70">
          <span className="w-3 h-0.5 bg-red-500 inline-block" />
          Δr divergence
        </span>
      </div>
    </div>
  );
}