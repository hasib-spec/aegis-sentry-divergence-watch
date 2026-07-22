/**
 * AEGIS-SENTRY v4.0 — Collaboration & Annotation Engine
 *
 * Enables multi-user annotations, comments, and shared analysis
 * on individual asteroid threat objects. Designed for team-based
 * planetary defense research workflows.
 *
 * Storage: localStorage (offline-first) + optional server sync.
 * In production, replace with a database (Postgres, Supabase, etc.)
 *
 * Data model follows the W3C Web Annotation Data Model:
 *   https://www.w3.org/TR/annotation-model/
 *
 * Reference:
 *   W3C Web Annotation Working Group (2017)
 *   IAU MPC collaborative observation campaigns
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: DATA TYPES
   ═══════════════════════════════════════════════════════════ */

export type AnnotationType =
  | "COMMENT"        // Free-text comment
  | "RISK_ASSESSMENT" // Analyst risk judgment
  | "OBSERVATION_LOG" // Observation record
  | "DEFLECTION_NOTE" // Deflection planning note
  | "YARKOVSKY_NOTE"  // Yarkovsky analysis note
  | "KEYHOLE_NOTE"    // Keyhole analysis note
  | "CORRIDOR_NOTE"   // Corridor analysis note
  | "FLAG"            // Flag for review
  | "RESOLUTION";     // Mark as resolved

export type AnnotationPriority =
  | "INFO"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export interface Annotation {
  /** UUID v4 */
  id: string;
  /** Target object designation (e.g., "2024 YR4") */
  targetDesignation: string;
  /** Annotation type */
  type: AnnotationType;
  /** Priority level */
  priority: AnnotationPriority;
  /** Author identifier (name, email, or anonymous ID) */
  author: string;
  /** Author role */
  authorRole: "ANALYST" | "RESEARCHER" | "OBSERVER" | "ADMIN" | "ANONYMOUS";
  /** Annotation body text */
  body: string;
  /** Optional structured data (key-value pairs) */
  metadata?: Record<string, string | number>;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last modification timestamp */
  updatedAt: string;
  /** Whether this annotation has been resolved */
  resolved: boolean;
  /** Parent annotation ID (for threaded replies) */
  parentId?: string;
  /** Tags for filtering */
  tags: string[];
}

export interface AnnotationThread {
  root: Annotation;
  replies: Annotation[];
}

export interface CollaborationSession {
  sessionId: string;
  designation: string;
  participants: string[];
  startedAt: string;
  annotations: Annotation[];
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: ANNOTATION CRUD
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = "aegis-sentry-annotations-v4";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Loads all annotations from localStorage.
 */
export function loadAnnotations(): Annotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Annotation[];
  } catch {
    return [];
  }
}

/**
 * Saves all annotations to localStorage.
 */
function saveAnnotations(annotations: Annotation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  } catch {
    console.warn("[AEGIS] Failed to save annotations to localStorage");
  }
}

/**
 * Creates a new annotation.
 */
export function createAnnotation(params: {
  targetDesignation: string;
  type: AnnotationType;
  priority?: AnnotationPriority;
  author: string;
  authorRole?: Annotation["authorRole"];
  body: string;
  metadata?: Record<string, string | number>;
  parentId?: string;
  tags?: string[];
}): Annotation {
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: generateUUID(),
    targetDesignation: params.targetDesignation,
    type: params.type,
    priority: params.priority ?? "INFO",
    author: params.author,
    authorRole: params.authorRole ?? "ANONYMOUS",
    body: params.body,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    parentId: params.parentId,
    tags: params.tags ?? [],
  };

  const all = loadAnnotations();
  all.push(annotation);
  saveAnnotations(all);

  return annotation;
}

/**
 * Updates an existing annotation.
 */
export function updateAnnotation(
  id: string,
  updates: Partial<Pick<Annotation, "body" | "priority" | "resolved" | "tags" | "metadata">>
): Annotation | null {
  const all = loadAnnotations();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  all[idx] = {
    ...all[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveAnnotations(all);
  return all[idx];
}

/**
 * Deletes an annotation and its replies.
 */
export function deleteAnnotation(id: string): boolean {
  const all = loadAnnotations();
  const filtered = all.filter((a) => a.id !== id && a.parentId !== id);
  if (filtered.length === all.length) return false;
  saveAnnotations(filtered);
  return true;
}

/**
 * Gets all annotations for a specific object, threaded.
 */
export function getAnnotationsForObject(
  designation: string
): AnnotationThread[] {
  const all = loadAnnotations().filter(
    (a) => a.targetDesignation === designation
  );

  const roots = all.filter((a) => !a.parentId);
  const threads: AnnotationThread[] = roots.map((root) => ({
    root,
    replies: all
      .filter((a) => a.parentId === root.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));

  return threads.sort((a, b) =>
    b.root.createdAt.localeCompare(a.root.createdAt)
  );
}

/**
 * Gets annotation statistics for an object.
 */
export function getAnnotationStats(designation: string): {
  total: number;
  unresolved: number;
  critical: number;
  contributors: number;
  lastActivity: string | null;
} {
  const all = loadAnnotations().filter(
    (a) => a.targetDesignation === designation
  );
  const contributors = new Set(all.map((a) => a.author));
  const lastActivity =
    all.length > 0
      ? all
          .map((a) => a.updatedAt)
          .sort()
          .pop() ?? null
      : null;

  return {
    total: all.length,
    unresolved: all.filter((a) => !a.resolved).length,
    critical: all.filter((a) => a.priority === "CRITICAL" && !a.resolved).length,
    contributors: contributors.size,
    lastActivity,
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: EXPORT / IMPORT
   ═══════════════════════════════════════════════════════════ */

/**
 * Exports all annotations for an object as JSON.
 */
export function exportAnnotations(designation: string): string {
  const threads = getAnnotationsForObject(designation);
  return JSON.stringify(
    {
      designation,
      exportedAt: new Date().toISOString(),
      engine: "AEGIS·SENTRY v4.0",
      threads,
    },
    null,
    2
  );
}

/**
 * Imports annotations from JSON.
 */
export function importAnnotations(json: string): number {
  try {
    const data = JSON.parse(json);
    if (!data.threads || !Array.isArray(data.threads)) return 0;

    const all = loadAnnotations();
    let count = 0;

    for (const thread of data.threads) {
      if (thread.root && !all.find((a) => a.id === thread.root.id)) {
        all.push(thread.root);
        count++;
      }
      if (thread.replies) {
        for (const reply of thread.replies) {
          if (!all.find((a) => a.id === reply.id)) {
            all.push(reply);
            count++;
          }
        }
      }
    }

    saveAnnotations(all);
    return count;
  } catch {
    return 0;
  }
}