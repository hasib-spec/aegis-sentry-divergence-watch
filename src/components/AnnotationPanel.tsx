"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare, Plus, Check, Trash2, Flag, Tag,
  ChevronDown, ChevronUp, Send,
} from "lucide-react";
import {
  loadAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationsForObject,
  getAnnotationStats,
  type Annotation,
  type AnnotationType,
  type AnnotationPriority,
} from "@/lib/engine/collaboration";

interface Props {
  designation: string;
}

const TYPE_LABELS: Record<AnnotationType, string> = {
  COMMENT: "Comment",
  RISK_ASSESSMENT: "Risk Assessment",
  OBSERVATION_LOG: "Observation Log",
  DEFLECTION_NOTE: "Deflection Note",
  YARKOVSKY_NOTE: "Yarkovsky Note",
  KEYHOLE_NOTE: "Keyhole Note",
  CORRIDOR_NOTE: "Corridor Note",
  FLAG: "Flag",
  RESOLUTION: "Resolution",
};

const PRIORITY_COLORS: Record<AnnotationPriority, string> = {
  INFO: "text-zinc-500 bg-zinc-800/40",
  LOW: "text-emerald-400 bg-emerald-500/10",
  MODERATE: "text-amber-400 bg-amber-500/10",
  HIGH: "text-orange-400 bg-orange-500/10",
  CRITICAL: "text-red-400 bg-red-500/10",
};

export default function AnnotationPanel({ designation }: Props) {
  const [threads, setThreads] = useState<ReturnType<typeof getAnnotationsForObject>>([]);
  const [stats, setStats] = useState<ReturnType<typeof getAnnotationStats> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnotationType>("COMMENT");
  const [priority, setPriority] = useState<AnnotationPriority>("INFO");
  const [author, setAuthor] = useState("");
  const [expanded, setExpanded] = useState(true);

  const refresh = useCallback(() => {
    setThreads(getAnnotationsForObject(designation));
    setStats(getAnnotationStats(designation));
  }, [designation]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = useCallback(() => {
    if (!body.trim() || !author.trim()) return;
    createAnnotation({
      targetDesignation: designation,
      type,
      priority,
      author: author.trim(),
      authorRole: "ANALYST",
      body: body.trim(),
    });
    setBody("");
    setShowForm(false);
    refresh();
  }, [designation, type, priority, author, body, refresh]);

  const handleResolve = useCallback(
    (id: string) => {
      updateAnnotation(id, { resolved: true });
      refresh();
    },
    [refresh]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteAnnotation(id);
      refresh();
    },
    [refresh]
  );

  return (
    <div className="rounded-lg border border-zinc-800/50 bg-[#080810]/80 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors"
      >
        <p className="text-[8px] font-mono text-purple-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
          <MessageSquare size={10} /> COLLABORATION
          {stats && stats.total > 0 && (
            <span className="text-zinc-600">({stats.total})</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {stats && stats.critical > 0 && (
            <span className="text-[7px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              {stats.critical} CRITICAL
            </span>
          )}
          {expanded ? <ChevronUp size={10} className="text-zinc-600" /> : <ChevronDown size={10} className="text-zinc-600" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          {/* Stats bar */}
          {stats && stats.total > 0 && (
            <div className="flex gap-3 text-[7px] font-mono text-zinc-600">
              <span>{stats.total} annotations</span>
              <span>{stats.unresolved} open</span>
              <span>{stats.contributors} contributors</span>
              {stats.lastActivity && (
                <span>Last: {new Date(stats.lastActivity).toLocaleDateString()}</span>
              )}
            </div>
          )}

          {/* New annotation form */}
          {showForm ? (
            <div className="space-y-2 rounded-md border border-zinc-700/40 bg-zinc-900/40 p-2.5">
              <div className="flex gap-2">
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className="flex-1 bg-zinc-900/60 border border-zinc-800/60 rounded px-2 py-1 text-[9px] font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-purple-500/40"
                />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AnnotationType)}
                  className="bg-zinc-900/60 border border-zinc-800/60 rounded px-1.5 py-1 text-[8px] font-mono text-zinc-400 focus:outline-none"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as AnnotationPriority)}
                  className="bg-zinc-900/60 border border-zinc-800/60 rounded px-1.5 py-1 text-[8px] font-mono text-zinc-400 focus:outline-none"
                >
                  {(["INFO", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add annotation..."
                rows={3}
                className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded px-2 py-1.5 text-[9px] font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-purple-500/40 resize-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSubmit}
                  disabled={!body.trim() || !author.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[8px] font-mono hover:bg-purple-500/20 transition-all disabled:opacity-40"
                >
                  <Send size={8} /> POST
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded text-[8px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-zinc-700/40 text-[8px] font-mono text-zinc-600 hover:text-zinc-400 hover:border-zinc-600/40 transition-all"
            >
              <Plus size={10} /> ADD ANNOTATION
            </button>
          )}

          {/* Annotation threads */}
          {threads.length === 0 && !showForm && (
            <p className="text-[8px] font-mono text-zinc-700 text-center py-3">
              No annotations yet. Be the first to add analysis notes.
            </p>
          )}

          {threads.map((thread) => (
            <div key={thread.root.id} className="space-y-1">
              <AnnotationCard
                annotation={thread.root}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
              {thread.replies.map((reply) => (
                <div key={reply.id} className="ml-4">
                  <AnnotationCard
                    annotation={reply}
                    onResolve={handleResolve}
                    onDelete={handleDelete}
                    isReply
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnotationCard({
  annotation,
  onResolve,
  onDelete,
  isReply,
}: {
  annotation: Annotation;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  isReply?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2 ${
        annotation.resolved
          ? "border-emerald-500/15 bg-emerald-500/[0.02] opacity-60"
          : "border-zinc-800/40 bg-zinc-900/30"
      } ${isReply ? "border-l-2 border-l-purple-500/30" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-mono text-zinc-400 font-bold">
            {annotation.author}
          </span>
          <span className={`text-[6px] font-mono px-1 py-0.5 rounded ${PRIORITY_COLORS[annotation.priority]}`}>
            {annotation.priority}
          </span>
          <span className="text-[6px] font-mono text-zinc-700">
            {TYPE_LABELS[annotation.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!annotation.resolved && (
            <button
              onClick={() => onResolve(annotation.id)}
              className="text-zinc-700 hover:text-emerald-400 transition-colors"
              title="Mark resolved"
            >
              <Check size={9} />
            </button>
          )}
          <button
            onClick={() => onDelete(annotation.id)}
            className="text-zinc-700 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>
      <p className="text-[9px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {annotation.body}
      </p>
      <p className="text-[6px] font-mono text-zinc-800 mt-1">
        {new Date(annotation.createdAt).toLocaleString()}
        {annotation.tags.length > 0 && (
          <span className="ml-2">
            {annotation.tags.map((t) => `#${t}`).join(" ")}
          </span>
        )}
      </p>
    </div>
  );
}