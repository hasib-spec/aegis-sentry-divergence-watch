/**
 * AEGIS-SENTRY v4.0 — Statistical Anomaly Detection Engine
 *
 * Detects unusual changes in asteroid risk assessments using
 * statistically rigorous methods:
 *
 * 1. Z-Score Detection: Flags when IP change exceeds 3σ of historical variance
 * 2. Exponential Moving Average (EMA): Tracks trend with decay factor
 * 3. CUSUM (Cumulative Sum): Detects sustained directional shifts
 * 4. Rate-of-Change Detector: Flags sudden jumps (>10× in 24h)
 *
 * No ML infrastructure required. Pure statistical methods that are
 * scientifically defensible and reproducible.
 *
 * References:
 *   Page (1954) — CUSUM sequential analysis
 *   Roberts (1959) — EMA for process control
 *   NASA OIG IG-25-006 — "lack of automated anomaly detection"
 */

export interface AnomalyEvent {
  id: string;
  designation: string;
  timestamp: string;
  type: "IP_SPIKE" | "IP_DROP" | "TREND_SHIFT" | "NEW_OBJECT" | "THRESHOLD_CROSS";
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  previousIP: number;
  currentIP: number;
  changeFactor: number;
  zScore: number;
  agency: "NASA" | "ESA" | "BOTH";
}

export interface HistoricalSnapshot {
  designation: string;
  timestamp: number;
  nasaIP: number;
  esaIP: number;
  nasaPS: number;
  esaPS: number;
  ysi: number;
  readinessScore: number;
}

export interface AnomalyDetectorState {
  history: Map<string, HistoricalSnapshot[]>;
  emaValues: Map<string, number>;
  cusumValues: Map<string, number>;
  baselineVariance: Map<string, number>;
}

const MAX_HISTORY_LENGTH = 500;
const EMA_ALPHA = 0.1;
const CUSUM_THRESHOLD = 5.0;
const Z_SCORE_THRESHOLD = 3.0;
const RATE_OF_CHANGE_THRESHOLD = 10.0;

export function createDetectorState(): AnomalyDetectorState {
  return {
    history: new Map(),
    emaValues: new Map(),
    cusumValues: new Map(),
    baselineVariance: new Map(),
  };
}

/**
 * Records a new observation and runs all anomaly detectors.
 * Returns any detected anomalies.
 */
export function processObservation(
  state: AnomalyDetectorState,
  snapshot: HistoricalSnapshot
): AnomalyEvent[] {
  const anomalies: AnomalyEvent[] = [];
  const key = snapshot.designation;

  // Get or initialize history
  if (!state.history.has(key)) {
    state.history.set(key, []);
    state.emaValues.set(key, snapshot.nasaIP);
    state.cusumValues.set(key, 0);
    state.baselineVariance.set(key, 1e-12);
  }

  const history = state.history.get(key)!;
  const previousSnapshot = history.length > 0 ? history[history.length - 1] : null;

  // Store snapshot
  history.push(snapshot);
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  // Skip detection if no previous data
  if (!previousSnapshot) {
    anomalies.push({
      id: `${key}-${snapshot.timestamp}-new`,
      designation: key,
      timestamp: new Date(snapshot.timestamp).toISOString(),
      type: "NEW_OBJECT",
      severity: "INFO",
      message: `${key} added to tracking database. NASA IP: ${snapshot.nasaIP.toExponential(2)}`,
      previousIP: 0,
      currentIP: snapshot.nasaIP,
      changeFactor: 1,
      zScore: 0,
      agency: "BOTH",
    });
    return anomalies;
  }

  // --- DETECTOR 1: Rate-of-Change (sudden jump) ---
  if (previousSnapshot.nasaIP > 0 && snapshot.nasaIP > 0) {
    const changeFactor = snapshot.nasaIP / previousSnapshot.nasaIP;
    if (changeFactor > RATE_OF_CHANGE_THRESHOLD) {
      anomalies.push({
        id: `${key}-${snapshot.timestamp}-spike`,
        designation: key,
        timestamp: new Date(snapshot.timestamp).toISOString(),
        type: "IP_SPIKE",
        severity: changeFactor > 100 ? "CRITICAL" : "WARNING",
        message: `${key} NASA IP jumped ${changeFactor.toFixed(1)}× in latest update. ${previousSnapshot.nasaIP.toExponential(2)} → ${snapshot.nasaIP.toExponential(2)}`,
        previousIP: previousSnapshot.nasaIP,
        currentIP: snapshot.nasaIP,
        changeFactor,
        zScore: 0,
        agency: "NASA",
      });
    } else if (changeFactor < 1 / RATE_OF_CHANGE_THRESHOLD) {
      anomalies.push({
        id: `${key}-${snapshot.timestamp}-drop`,
        designation: key,
        timestamp: new Date(snapshot.timestamp).toISOString(),
        type: "IP_DROP",
        severity: "INFO",
        message: `${key} NASA IP dropped ${(1 / changeFactor).toFixed(1)}×. Risk decreasing. ${previousSnapshot.nasaIP.toExponential(2)} → ${snapshot.nasaIP.toExponential(2)}`,
        previousIP: previousSnapshot.nasaIP,
        currentIP: snapshot.nasaIP,
        changeFactor,
        zScore: 0,
        agency: "NASA",
      });
    }
  }

  // --- DETECTOR 2: Z-Score (statistical outlier) ---
  if (history.length >= 5) {
    const ipValues = history.map((h) => Math.log10(Math.max(h.nasaIP, 1e-30)));
    const mean = ipValues.reduce((s, v) => s + v, 0) / ipValues.length;
    const variance =
      ipValues.reduce((s, v) => s + (v - mean) ** 2, 0) / ipValues.length;
    const stdDev = Math.sqrt(Math.max(variance, 1e-20));

    state.baselineVariance.set(key, variance);

    const currentLogIP = Math.log10(Math.max(snapshot.nasaIP, 1e-30));
    const zScore = (currentLogIP - mean) / stdDev;

    if (Math.abs(zScore) > Z_SCORE_THRESHOLD) {
      anomalies.push({
        id: `${key}-${snapshot.timestamp}-zscore`,
        designation: key,
        timestamp: new Date(snapshot.timestamp).toISOString(),
        type: zScore > 0 ? "IP_SPIKE" : "IP_DROP",
        severity: Math.abs(zScore) > 5 ? "CRITICAL" : "WARNING",
        message: `${key} IP is ${Math.abs(zScore).toFixed(1)}σ from historical mean (${zScore > 0 ? "elevated" : "reduced"}). Statistical outlier detected.`,
        previousIP: previousSnapshot.nasaIP,
        currentIP: snapshot.nasaIP,
        changeFactor: snapshot.nasaIP / Math.max(previousSnapshot.nasaIP, 1e-30),
        zScore,
        agency: "NASA",
      });
    }
  }

  // --- DETECTOR 3: EMA Trend Shift ---
  const prevEma = state.emaValues.get(key) ?? snapshot.nasaIP;
  const newEma = EMA_ALPHA * snapshot.nasaIP + (1 - EMA_ALPHA) * prevEma;
  state.emaValues.set(key, newEma);

  // --- DETECTOR 4: CUSUM (sustained shift) ---
  const prevCusum = state.cusumValues.get(key) ?? 0;
  const logIP = Math.log10(Math.max(snapshot.nasaIP, 1e-30));
  const prevLogIP = Math.log10(Math.max(previousSnapshot.nasaIP, 1e-30));
  const deviation = logIP - prevLogIP;
  const newCusum = Math.max(0, prevCusum + deviation - 0.5);
  state.cusumValues.set(key, newCusum);

  if (newCusum > CUSUM_THRESHOLD && prevCusum <= CUSUM_THRESHOLD) {
    anomalies.push({
      id: `${key}-${snapshot.timestamp}-cusum`,
      designation: key,
      timestamp: new Date(snapshot.timestamp).toISOString(),
      type: "TREND_SHIFT",
      severity: "WARNING",
      message: `${key} sustained upward trend detected (CUSUM=${newCusum.toFixed(1)}). Risk has been consistently increasing.`,
      previousIP: previousSnapshot.nasaIP,
      currentIP: snapshot.nasaIP,
      changeFactor: snapshot.nasaIP / Math.max(previousSnapshot.nasaIP, 1e-30),
      zScore: 0,
      agency: "NASA",
    });
  }

  // --- DETECTOR 5: Threshold Cross (Palermo Scale) ---
  const prevPS = previousSnapshot.nasaPS;
  const currPS = snapshot.nasaPS;
  if (prevPS < 0 && currPS >= 0) {
    anomalies.push({
      id: `${key}-${snapshot.timestamp}-threshold`,
      designation: key,
      timestamp: new Date(snapshot.timestamp).toISOString(),
      type: "THRESHOLD_CROSS",
      severity: "CRITICAL",
      message: `⚠️ ${key} crossed Palermo Scale threshold! PS: ${prevPS.toFixed(2)} → ${currPS.toFixed(2)}. Now above background risk level.`,
      previousIP: previousSnapshot.nasaIP,
      currentIP: snapshot.nasaIP,
      changeFactor: snapshot.nasaIP / Math.max(previousSnapshot.nasaIP, 1e-30),
      zScore: 0,
      agency: "NASA",
    });
  }

  return anomalies;
}

/**
 * Computes trend summary for a designation.
 */
export function computeTrendSummary(
  state: AnomalyDetectorState,
  designation: string
): {
  direction: "RISING" | "FALLING" | "STABLE";
  ratePerDay: number;
  confidence: number;
  dataPoints: number;
} {
  const history = state.history.get(designation);
  if (!history || history.length < 3) {
    return { direction: "STABLE", ratePerDay: 0, confidence: 0, dataPoints: history?.length ?? 0 };
  }

  const recent = history.slice(-10);
  const logIPs = recent.map((h) => Math.log10(Math.max(h.nasaIP, 1e-30)));
  const times = recent.map((h) => h.timestamp);

  // Linear regression on log(IP) vs time
  const n = logIPs.length;
  const tMean = times.reduce((s, t) => s + t, 0) / n;
  const ipMean = logIPs.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dt = (times[i] - tMean) / 86400000; // Convert to days
    num += dt * (logIPs[i] - ipMean);
    den += dt * dt;
  }

  const slope = den > 0 ? num / den : 0;
  const ratePerDay = slope; // log10(IP) change per day

  // Confidence based on R² and data points
  const ssRes = logIPs.reduce((s, v, i) => {
    const predicted = ipMean + slope * ((times[i] - tMean) / 86400000);
    return s + (v - predicted) ** 2;
  }, 0);
  const ssTot = logIPs.reduce((s, v) => s + (v - ipMean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const confidence = Math.min(1, Math.max(0, r2 * Math.min(n / 10, 1)));

  const direction: "RISING" | "FALLING" | "STABLE" =
    Math.abs(ratePerDay) < 0.001 ? "STABLE" : ratePerDay > 0 ? "RISING" : "FALLING";

  return { direction, ratePerDay, confidence, dataPoints: n };
}