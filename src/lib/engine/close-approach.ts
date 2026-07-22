/**
 * AEGIS-SENTRY v3.1 — Close Approach Data Engine
 *
 * NASA CNEOS Close-Approach Data (CAD) API integration.
 * Provides real close approach dates, distances, and velocities.
 *
 * API: https://ssd-api.jpl.nasa.gov/cad.api
 * Reference: https://cneos.jpl.nasa.gov/ca/
 */

export interface CloseApproachRecord {
  designation: string;
  approachDate: string;
  approachDateJD: number;
  distLD: number;
  distKm: number;
  distAu: number;
  vRelKmS: number;
  vInfKmS: number;
  tSigmaMin: number;
  tSigmaMax: number;
  body: string;
}

export interface CloseApproachSummary {
  designation: string;
  nextApproachDate: string;
  nextApproachLD: number;
  nextApproachKm: number;
  nextApproachVelocityKmS: number;
  approachesWithin10LD: number;
  approachesWithin1LD: number;
  minDistanceLD: number;
  minDistanceDate: string;
  allApproaches: CloseApproachRecord[];
}

const LD_KM = 384400; // 1 Lunar Distance in km
const AU_KM = 1.495978707e8;

export function parseCADResponse(json: {
  data?: Array<Array<string | number>>;
  fields?: string[];
  count?: number;
}): CloseApproachRecord[] {
  if (!json.data || !Array.isArray(json.data)) return [];

  const fields = json.fields || [];
  const desIdx = fields.indexOf("des");
  const dateIdx = fields.indexOf("cd");
  const distIdx = fields.indexOf("dist");
  const distMinIdx = fields.indexOf("dist_min");
  const distMaxIdx = fields.indexOf("dist_max");
  const vRelIdx = fields.indexOf("v_rel");
  const vInfIdx = fields.indexOf("v_inf");
  const tSigmaMinIdx = fields.indexOf("t_sigma_min");
  const tSigmaMaxIdx = fields.indexOf("t_sigma_max");
  const bodyIdx = fields.indexOf("body");

  const records: CloseApproachRecord[] = [];

  for (const row of json.data) {
    try {
      const distAu = parseFloat(String(row[distIdx])) || 0;
      const distLD = distAu * (AU_KM / LD_KM);
      const dateStr = String(row[dateIdx]);

      // Parse date to JD (approximate: YYYY-MMM-DD HH:MM)
      const dateObj = new Date(dateStr.replace(" ", "T") + "Z");
      const approachDateJD = dateObj.getTime() / 86400000 + 2440587.5;

      records.push({
        designation: String(row[desIdx]).trim(),
        approachDate: dateStr,
        approachDateJD,
        distLD,
        distKm: distAu * AU_KM,
        distAu,
        vRelKmS: parseFloat(String(row[vRelIdx])) || 0,
        vInfKmS: parseFloat(String(row[vInfIdx])) || 0,
        tSigmaMin: parseFloat(String(row[tSigmaMinIdx])) || 0,
        tSigmaMax: parseFloat(String(row[tSigmaMaxIdx])) || 0,
        body: bodyIdx >= 0 ? String(row[bodyIdx]) : "Earth",
      });
    } catch {
      continue;
    }
  }

  return records;
}

export function summarizeApproaches(
  designation: string,
  records: CloseApproachRecord[]
): CloseApproachSummary {
  const earthApproaches = records
    .filter((r) => r.body === "Earth" || r.body === "")
    .sort((a, b) => a.approachDateJD - b.approachDateJD);

  const now = Date.now() / 86400000 + 2440587.5;
  const future = earthApproaches.filter((r) => r.approachDateJD > now);

  const next = future[0] || earthApproaches[0];
  const within10LD = future.filter((r) => r.distLD <= 10).length;
  const within1LD = future.filter((r) => r.distLD <= 1).length;

  let minDist = Infinity;
  let minDate = "";
  for (const r of future) {
    if (r.distLD < minDist) {
      minDist = r.distLD;
      minDate = r.approachDate;
    }
  }

  return {
    designation,
    nextApproachDate: next?.approachDate || "—",
    nextApproachLD: next?.distLD ?? 0,
    nextApproachKm: next?.distKm ?? 0,
    nextApproachVelocityKmS: next?.vRelKmS ?? 0,
    approachesWithin10LD: within10LD,
    approachesWithin1LD: within1LD,
    minDistanceLD: minDist === Infinity ? 0 : minDist,
    minDistanceDate: minDate,
    allApproaches: future.slice(0, 20),
  };
}

export function formatDistance(distLD: number): string {
  if (distLD <= 0) return "—";
  if (distLD < 1) return `${(distLD * LD_KM).toFixed(0)} km (${distLD.toFixed(3)} LD)`;
  if (distLD < 10) return `${distLD.toFixed(2)} LD`;
  return `${distLD.toFixed(1)} LD`;
}

export function daysUntil(dateStr: string): number {
  try {
    const d = new Date(dateStr.replace(" ", "T") + "Z");
    return Math.max(0, Math.floor((d.getTime() - Date.now()) / 86400000));
  } catch {
    return -1;
  }
}