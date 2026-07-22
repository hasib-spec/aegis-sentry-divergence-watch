"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio, RefreshCw, Bell, BellOff, Filter,
  AlertTriangle, CheckCircle, Eye, ExternalLink,
} from "lucide-react";
import type {
  ObservatoryAlert,
  ObservatoryStatus,
  AlertSeverity,
  ObservatorySource,
} from "@/lib/engine/observatory";

interface Props {
  onSelectDesignation?: (des: string) => void;
}

const SEVERITY_STYLES: Record<AlertSeverity, { text: string; bg: string; border: string; dot: string }> = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/25", dot: "bg-red-500" },
  HIGH: { text: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/25", dot: "bg-orange-500" },
  ELEVATED: { text: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/25", dot: "bg-amber-500" },
  NOTABLE: { text: "text-cyan-400", bg: "bg-cyan-500/5", border: "border-cyan-500/20", dot: "bg-cyan-500" },
  ROUTINE: { text: "text-zinc-500", bg: "bg-zinc-800/20", border: "border-zinc-800/40", dot: "bg-zinc-600" },
};

const SOURCE_LABELS: Record<ObservatorySource, string> = {
  NASA_CAD: "NASA CAD",
  MPC_NEACP: "MPC NEACP",
  ATLAS: "ATLAS",
  RUBIN_LSST: "Rubin/LSST",
  PANSTARRS: "Pan-STARRS",
  NEOWISE: "NEOWISE",
  NEO_SURVEYOR: "NEO Surveyor",
  CATALINA: "Catalina",
  MANUAL: "Manual",
};

export default function ObservatoryFeed({ onSelectDesignation }: Props) {
  const [alerts, setAlerts] = useState<ObservatoryAlert[]>([]);
  const [observatories, setObservatories] = useState<ObservatoryStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minSeverity, setMinSeverity] = useState<AlertSeverity | "ALL">("ALL");
  const [sourceFilter, setSourceFilter] = useState<ObservatorySource | "ALL">("ALL");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/observatory?mode=live&limit=50", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setAlerts(json.alerts || []);
      setObservatories(json.observatories || []);
      setLastUpdate(new Date().toISOString().slice(11, 19));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feed error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchAlerts, 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchAlerts]);

  const filtered = alerts.filter((a) => {
    if (minSeverity !== "ALL") {
      const order: Record<string, number> = { CRITICAL: 5, HIGH: 4, ELEVATED: 3, NOTABLE: 2, ROUTINE: 1 };
      if ((order[a.severity] || 0) < (order[minSeverity] || 0)) return false;
    }
    if (sourceFilter !== "ALL" && a.source !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-zinc-800/50 flex items-center justify-between shrink-0">
        <p className="text-[8px] font-mono text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
          <Radio size={10} className={autoRefresh ? "animate-pulse" : ""} />
          OBSERVATORY LIVE FEED
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-mono text-zinc-700">
            {lastUpdate} UTC
          </span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded transition-colors ${autoRefresh ? "text-emerald-400" : "text-zinc-700"}`}
            title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          >
            {autoRefresh ? <Bell size={10} /> : <BellOff size={10} />}
          </button>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 py-1.5 border-b border-zinc-800/30 flex items-center gap-1.5 shrink-0 flex-wrap">
        <Filter size={8} className="text-zinc-700" />
        <select
          value={minSeverity}
          onChange={(e) => setMinSeverity(e.target.value as AlertSeverity | "ALL")}
          className="bg-zinc-900/60 border border-zinc-800/60 rounded px-1.5 py-0.5 text-[7px] font-mono text-zinc-400 focus:outline-none"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical+</option>
          <option value="HIGH">High+</option>
          <option value="ELEVATED">Elevated+</option>
          <option value="NOTABLE">Notable+</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as ObservatorySource | "ALL")}
          className="bg-zinc-900/60 border border-zinc-800/60 rounded px-1.5 py-0.5 text-[7px] font-mono text-zinc-400 focus:outline-none"
        >
          <option value="ALL">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="ml-auto text-[7px] font-mono text-zinc-700">
          {filtered.length} alerts
        </span>
      </div>

      {/* Observatory status strip */}
      {observatories.length > 0 && (
        <div className="px-3 py-1.5 border-b border-zinc-800/30 flex gap-2 overflow-x-auto shrink-0">
          {observatories.map((obs) => (
            <span
              key={obs.source}
              className={`inline-flex items-center gap-1 text-[6px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap ${
                obs.status === "ONLINE"
                  ? "text-emerald-400/70 bg-emerald-500/5"
                  : obs.status === "SCHEDULED"
                  ? "text-amber-400/70 bg-amber-500/5"
                  : "text-red-400/70 bg-red-500/5"
              }`}
            >
              <span
                className={`w-1 h-1 rounded-full ${
                  obs.status === "ONLINE" ? "bg-emerald-400" : obs.status === "SCHEDULED" ? "bg-amber-400" : "bg-red-400"
                }`}
              />
              {SOURCE_LABELS[obs.source]}
            </span>
          ))}
        </div>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {loading && alerts.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-[9px] font-mono text-zinc-600 animate-pulse">
              CONNECTING TO OBSERVATORY FEEDS...
            </p>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={10} className="text-red-400" />
            <span className="text-[8px] font-mono text-red-400">{error}</span>
          </div>
        )}

        {filtered.map((alert) => {
          const style = SEVERITY_STYLES[alert.severity];
          const timeAgo = getTimeAgo(alert.timestamp);

          return (
            <button
              key={alert.id}
              onClick={() => onSelectDesignation?.(alert.designation)}
              className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/20 ${style.bg} hover:brightness-125 transition-all`}
            >
              <div className="flex items-start gap-2">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${style.dot} ${alert.severity === "CRITICAL" ? "animate-pulse" : ""}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[9px] font-mono font-bold ${style.text} truncate`}>
                      {alert.title}
                    </span>
                    <span className="text-[6px] font-mono text-zinc-700 whitespace-nowrap shrink-0">
                      {timeAgo}
                    </span>
                  </div>
                  <p className="text-[8px] font-mono text-zinc-500 mt-0.5 line-clamp-2">
                    {alert.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[6px] font-mono text-zinc-700 px-1 py-0.5 rounded bg-zinc-800/40">
                      {SOURCE_LABELS[alert.source]}
                    </span>
                    {alert.distanceLD !== undefined && (
                      <span className={`text-[6px] font-mono ${alert.distanceLD < 5 ? "text-red-400/70" : "text-zinc-600"}`}>
                        {alert.distanceLD.toFixed(2)} LD
                      </span>
                    )}
                    {alert.magnitude !== undefined && (
                      <span className="text-[6px] font-mono text-zinc-700">
                        V={alert.magnitude.toFixed(1)}
                      </span>
                    )}
                    {alert.acknowledged && (
                      <CheckCircle size={7} className="text-emerald-500/50" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Eye size={16} className="text-zinc-800" />
            <p className="text-[8px] font-mono text-zinc-700">
              No alerts match current filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}