"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Radio, AlertTriangle, TrendingUp, TrendingDown, Minus, Bell, BellOff } from "lucide-react";
import {
  createDetectorState,
  processObservation,
  AnomalyEvent,
  HistoricalSnapshot,
  AnomalyDetectorState,
} from "@/lib/engine/anomaly-detection";
import { storeSnapshot, storeAnomaly, getRecentAnomalies } from "@/lib/engine/historical-store";

interface LiveUpdate {
  type: "HEARTBEAT" | "DATA_UPDATE" | "ANOMALY" | "ERROR";
  timestamp: string;
  data?: {
    source?: string;
    count?: number;
    message?: string;
    topRisks?: Array<{
      des: string;
      ip: number;
      ps: number;
      ts: number;
      diameter: number;
    }>;
  };
}

interface Props {
  onAnomaly?: (anomaly: AnomalyEvent) => void;
}

export default function LiveFeed({ onAnomaly }: Props) {
  const [connected, setConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("");
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [feedLog, setFeedLog] = useState<Array<{ time: string; message: string; type: string }>>([]);
  const detectorRef = useRef<AnomalyDetectorState>(createDetectorState());
  const eventSourceRef = useRef<EventSource | null>(null);

  const addLog = useCallback((message: string, type: string) => {
    setFeedLog((prev) => [
      { time: new Date().toISOString().slice(11, 19), message, type },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleAnomaly = useCallback(
    (anomaly: AnomalyEvent) => {
      setAnomalies((prev) => [anomaly, ...prev.slice(0, 49)]);
      storeAnomaly(anomaly);
      onAnomaly?.(anomaly);

      // Browser notification for critical anomalies
      if (
        notificationsEnabled &&
        anomaly.severity === "CRITICAL" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(`⚠️ ${anomaly.designation} — ${anomaly.type}`, {
          body: anomaly.message,
          icon: "/favicon.ico",
        });
      }
    },
    [notificationsEnabled, onAnomaly]
  );

  // Connect to SSE
  useEffect(() => {
    const es = new EventSource("/api/live");
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      addLog("Connected to live feed", "CONNECT");
    };

    es.onmessage = (event) => {
      try {
        const update: LiveUpdate = JSON.parse(event.data);

        if (update.type === "HEARTBEAT") {
          setLastHeartbeat(update.timestamp);
        } else if (update.type === "DATA_UPDATE" && update.data) {
          const { source, count, topRisks } = update.data;
          addLog(
            `${source}: ${count} objects updated`,
            "DATA"
          );

          // Process top risks through anomaly detector
          if (topRisks) {
            for (const risk of topRisks) {
              const snapshot: HistoricalSnapshot = {
                designation: risk.des,
                timestamp: Date.now(),
                nasaIP: risk.ip,
                esaIP: 0,
                nasaPS: risk.ps,
                esaPS: 0,
                ysi: 0,
                readinessScore: 0,
              };

              storeSnapshot(snapshot);
              const detected = processObservation(
                detectorRef.current,
                snapshot
              );

              for (const anomaly of detected) {
                if (anomaly.type !== "NEW_OBJECT") {
                  handleAnomaly(anomaly);
                }
              }
            }
          }
        } else if (update.type === "ERROR") {
          addLog(`Error: ${update.data?.message}`, "ERROR");
        }
      } catch {
        // Parse error — ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      addLog("Connection lost. Reconnecting...", "ERROR");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [addLog, handleAnomaly]);

  // Load historical anomalies on mount
  useEffect(() => {
    getRecentAnomalies(20).then(setAnomalies);
  }, []);

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          setNotificationsEnabled(true);
          addLog("Browser notifications enabled", "INFO");
        }
      }
    } else {
      setNotificationsEnabled(false);
      addLog("Browser notifications disabled", "INFO");
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800/50 bg-[#080810]/50">
        <div className="flex items-center gap-2">
          <Radio
            size={12}
            className={connected ? "text-emerald-400 animate-pulse" : "text-red-400"}
          />
          <span className="text-[9px] font-mono text-zinc-400">
            {connected ? "LIVE FEED CONNECTED" : "DISCONNECTED"}
          </span>
          {lastHeartbeat && (
            <span className="text-[8px] font-mono text-zinc-700">
              Last: {lastHeartbeat.slice(11, 19)} UTC
            </span>
          )}
        </div>
        <button
          onClick={toggleNotifications}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[8px] font-mono border transition-colors ${
            notificationsEnabled
              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
              : "text-zinc-600 border-zinc-700/50 hover:text-zinc-400"
          }`}
        >
          {notificationsEnabled ? <Bell size={10} /> : <BellOff size={10} />}
          {notificationsEnabled ? "ALERTS ON" : "ALERTS OFF"}
        </button>
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {anomalies.slice(0, 10).map((a) => (
            <div
              key={a.id}
              className={`px-3 py-2 rounded-md border text-[9px] font-mono ${
                a.severity === "CRITICAL"
                  ? "border-red-500/30 bg-red-500/5 text-red-300"
                  : a.severity === "WARNING"
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                    : "border-zinc-700/50 bg-zinc-800/30 text-zinc-400"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {a.severity === "CRITICAL" ? (
                  <AlertTriangle size={10} />
                ) : a.type === "IP_SPIKE" ? (
                  <TrendingUp size={10} />
                ) : a.type === "IP_DROP" ? (
                  <TrendingDown size={10} />
                ) : (
                  <Minus size={10} />
                )}
                <span className="font-bold">{a.designation}</span>
                <span className="text-zinc-600">{a.timestamp.slice(11, 19)}</span>
              </div>
              <p className="text-zinc-500 leading-relaxed">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Feed Log */}
      <div className="flex-1 rounded-lg border border-zinc-800/50 bg-[#080810]/50 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800/50">
          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider">
            SYSTEM LOG
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {feedLog.map((log, i) => (
            <div key={i} className="flex gap-2 text-[8px] font-mono">
              <span className="text-zinc-700 shrink-0">[{log.time}]</span>
              <span
                className={
                  log.type === "ERROR"
                    ? "text-red-400"
                    : log.type === "DATA"
                      ? "text-cyan-400/70"
                      : log.type === "CONNECT"
                        ? "text-emerald-400"
                        : "text-zinc-500"
                }
              >
                {log.message}
              </span>
            </div>
          ))}
          {feedLog.length === 0 && (
            <p className="text-[8px] font-mono text-zinc-700 text-center py-4">
              Waiting for data...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}