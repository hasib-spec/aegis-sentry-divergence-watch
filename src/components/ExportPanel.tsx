"use client";

import { useState, useCallback } from "react";
import {
  Download, Copy, Check, FileText, FileJson, FileSpreadsheet,
  Share2, Link2, Printer, ExternalLink,
} from "lucide-react";
import type { AdvancedThreat, ThreatsApiResponse } from "@/lib/engine/types";
import {
  generateThreatBriefing,
  generateCSV,
  generateJSONExport,
  generateMarkdownReport,
  generateShareURL,
  downloadFile,
  copyToClipboard,
} from "@/lib/engine/export";

interface Props {
  threat?: AdvancedThreat | null;
  data?: ThreatsApiResponse | null;
  consensusScore?: number;
  onClose?: () => void;
}

export default function ExportPanel({ threat, data, consensusScore, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const flash = useCallback((key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleCopyBriefing = useCallback(() => {
    if (!threat) return;
    const text = generateThreatBriefing(threat, consensusScore);
    copyToClipboard(text).then(() => flash("briefing"));
  }, [threat, consensusScore, flash]);

  const handleDownloadBriefing = useCallback(() => {
    if (!threat) return;
    const text = generateThreatBriefing(threat, consensusScore);
    downloadFile(text, `AEGIS-SENTRY_${threat.designation.replace(/\s/g, "_")}_briefing.txt`, "text/plain");
  }, [threat, consensusScore]);

  const handleDownloadCSV = useCallback(() => {
    if (!data) return;
    const csv = generateCSV(data.threats);
    downloadFile(csv, `AEGIS-SENTRY_catalogue_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  }, [data]);

  const handleDownloadJSON = useCallback(() => {
    if (!data) return;
    const json = generateJSONExport(data);
    downloadFile(json, `AEGIS-SENTRY_catalogue_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  }, [data]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!data) return;
    const md = generateMarkdownReport(data);
    downloadFile(md, `AEGIS-SENTRY_report_${new Date().toISOString().slice(0, 10)}.md`, "text/markdown");
  }, [data]);

  const handleCopyShareURL = useCallback(() => {
    if (!threat) return;
    const url = generateShareURL(threat.designation, window.location.origin);
    copyToClipboard(url).then(() => flash("share"));
  }, [threat, flash]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-mono text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
          <Download size={10} /> EXPORT & SHARE
        </p>
        {onClose && (
          <button onClick={onClose} className="text-zinc-600 hover:text-white text-xs">✕</button>
        )}
      </div>

      {/* Single-object actions */}
      {threat && (
        <div className="space-y-1.5">
          <p className="text-[7px] font-mono text-zinc-600 uppercase">
            Object: {threat.designation}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <ExportButton
              icon={copied === "briefing" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
              label={copied === "briefing" ? "COPIED" : "COPY BRIEFING"}
              onClick={handleCopyBriefing}
            />
            <ExportButton
              icon={<FileText size={10} />}
              label="DOWNLOAD .TXT"
              onClick={handleDownloadBriefing}
            />
            <ExportButton
              icon={copied === "share" ? <Check size={10} className="text-emerald-400" /> : <Link2 size={10} />}
              label={copied === "share" ? "COPIED" : "COPY API URL"}
              onClick={handleCopyShareURL}
            />
            <ExportButton
              icon={<Printer size={10} />}
              label="PRINT / PDF"
              onClick={handlePrint}
            />
          </div>
        </div>
      )}

      {/* Catalogue-level actions */}
      {data && (
        <div className="space-y-1.5">
          <p className="text-[7px] font-mono text-zinc-600 uppercase">
            Full Catalogue ({data.threats.length} objects)
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <ExportButton
              icon={<FileSpreadsheet size={10} />}
              label="CSV"
              onClick={handleDownloadCSV}
            />
            <ExportButton
              icon={<FileJson size={10} />}
              label="JSON (FAIR)"
              onClick={handleDownloadJSON}
            />
            <ExportButton
              icon={<FileText size={10} />}
              label="MARKDOWN"
              onClick={handleDownloadMarkdown}
            />
          </div>
        </div>
      )}

      {/* External links */}
      {threat && (
        <div className="flex gap-2 pt-1 border-t border-zinc-800/40">
          <a
            href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(threat.designation)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[8px] font-mono text-cyan-400/60 hover:text-cyan-400 transition-colors"
          >
            <ExternalLink size={8} /> NASA Sentry
          </a>
          <a
            href={`https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(threat.designation)}.risk`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[8px] font-mono text-orange-400/60 hover:text-orange-400 transition-colors"
          >
            <ExternalLink size={8} /> ESA .risk
          </a>
        </div>
      )}

      <p className="text-[6px] font-mono text-zinc-800">
        AEGIS·SENTRY v4.0 • CC BY-NC 4.0 • NOT FOR OPERATIONAL USE
      </p>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-md bg-zinc-800/40 border border-zinc-700/40 hover:border-cyan-500/30 transition-all text-[8px] font-mono text-zinc-400 hover:text-zinc-200"
    >
      {icon}
      {label}
    </button>
  );
}