/**
 * AEGIS-SENTRY v4.0 — Historical Risk Database
 *
 * Client-side IndexedDB storage for tracking risk assessment history.
 * No external database required. Persists across browser sessions.
 *
 * Stores:
 * - Historical IP snapshots per object
 * - Anomaly event log
 * - Trend computations
 *
 * This enables "risk over time" visualization without any server-side
 * database dependency. Data persists in the user's browser.
 */

import { HistoricalSnapshot, AnomalyEvent } from "./anomaly-detection";

const DB_NAME = "aegis-sentry-history";
const DB_VERSION = 1;
const SNAPSHOTS_STORE = "snapshots";
const ANOMALIES_STORE = "anomalies";
const MAX_SNAPSHOTS_PER_OBJECT = 200;
const MAX_ANOMALIES = 500;

let dbInstance: IDBDatabase | null = null;

/** Helper: wait for an IDBTransaction to complete (native API has no .done) */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const snapshotStore = db.createObjectStore(SNAPSHOTS_STORE, {
          keyPath: "id",
        });
        snapshotStore.createIndex("designation", "designation", { unique: false });
        snapshotStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(ANOMALIES_STORE)) {
        const anomalyStore = db.createObjectStore(ANOMALIES_STORE, {
          keyPath: "id",
        });
        anomalyStore.createIndex("designation", "designation", { unique: false });
        anomalyStore.createIndex("timestamp", "timestamp", { unique: false });
        anomalyStore.createIndex("severity", "severity", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Stores a historical snapshot.
 */
export async function storeSnapshot(
  snapshot: HistoricalSnapshot
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOTS_STORE);

    const record = {
      id: `${snapshot.designation}-${snapshot.timestamp}`,
      ...snapshot,
    };

    store.put(record);

    // Prune old snapshots for this designation
    const index = store.index("designation");
    const countReq = index.count(snapshot.designation);
    countReq.onsuccess = () => {
      if (countReq.result > MAX_SNAPSHOTS_PER_OBJECT) {
        const cursorReq = index.openCursor(snapshot.designation);
        let deleteCount = countReq.result - MAX_SNAPSHOTS_PER_OBJECT;
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleteCount > 0) {
            cursor.delete();
            deleteCount--;
            cursor.continue();
          }
        };
      }
    };

    await txDone(tx);
  } catch {
    // Silent fail — non-critical
  }
}

/**
 * Retrieves historical snapshots for a designation.
 */
export async function getHistory(
  designation: string
): Promise<HistoricalSnapshot[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const index = store.index("designation");

    return new Promise((resolve) => {
      const request = index.getAll(designation);
      request.onsuccess = () => {
        const results = (request.result as Array<{ id: string } & HistoricalSnapshot>)
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Stores an anomaly event.
 */
export async function storeAnomaly(anomaly: AnomalyEvent): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(ANOMALIES_STORE, "readwrite");
    const store = tx.objectStore(ANOMALIES_STORE);
    store.put(anomaly);

    // Prune old anomalies
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ANOMALIES) {
        const cursorReq = store.index("timestamp").openCursor();
        let deleteCount = countReq.result - MAX_ANOMALIES;
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleteCount > 0) {
            cursor.delete();
            deleteCount--;
            cursor.continue();
          }
        };
      }
    };

    await txDone(tx);
  } catch {
    // Silent fail
  }
}

/**
 * Retrieves recent anomalies.
 */
export async function getRecentAnomalies(
  limit: number = 50
): Promise<AnomalyEvent[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(ANOMALIES_STORE, "readonly");
    const store = tx.objectStore(ANOMALIES_STORE);
    const index = store.index("timestamp");

    return new Promise((resolve) => {
      const results: AnomalyEvent[] = [];
      const cursorReq = index.openCursor(null, "prev");
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < limit) {
          results.push(cursor.value as AnomalyEvent);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Gets all tracked designations.
 */
export async function getTrackedDesignations(): Promise<string[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const index = store.index("designation");

    return new Promise((resolve) => {
      const keys = new Set<string>();
      const cursorReq = index.openKeyCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursor>).result;
        if (cursor) {
          keys.add(cursor.key as string);
          cursor.continue();
        } else {
          resolve(Array.from(keys));
        }
      };
      cursorReq.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}