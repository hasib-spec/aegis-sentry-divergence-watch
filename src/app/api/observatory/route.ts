import { NextRequest, NextResponse } from "next/server";
import { parseCADResponse } from "@/lib/engine/close-approach";
import {
  cadRecordToAlert,
  getObservatoryStatuses,
  sortAlertsBySeverity,
  generateSimulatedAlerts,
  type ObservatoryAlert,
} from "@/lib/engine/observatory";
import {
  checkRateLimit,
  extractClientIP,
  rateLimitHeaders,
  RATE_PRESETS,
} from "@/lib/engine/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAD_URL = "https://ssd-api.jpl.nasa.gov/cad.api";

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIP = extractClientIP(request.headers);
  const rl = checkRateLimit(`obs:${clientIP}`, RATE_PRESETS.live);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rl.retryAfterS },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "live";
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

  try {
    let alerts: ObservatoryAlert[] = [];

    if (mode === "live") {
      // Fetch real CAD data
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const now = new Date();
      const dateMin = now.toISOString().slice(0, 10);
      const futureDate = new Date(now.getTime() + 365.25 * 86400000);
      const dateMax = futureDate.toISOString().slice(0, 10);

      try {
        const cadRes = await fetch(
          `${CAD_URL}?dist-max=0.1&date-min=${dateMin}&date-max=${dateMax}&sort=dist&limit=50`,
          {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "User-Agent": "AegisSentry/4.0 (Research)",
            },
          }
        );
        clearTimeout(timeout);

        if (cadRes.ok) {
          const cadJson = await cadRes.json();
          const records = parseCADResponse(cadJson);
          alerts = records
            .filter((r) => r.body === "Earth" || r.body === "")
            .map(cadRecordToAlert);
        }
      } catch {
        clearTimeout(timeout);
        // Fall through to simulated alerts
      }
    }

    // Supplement with simulated alerts for demonstration
    if (alerts.length < 5) {
      const simulated = generateSimulatedAlerts(15);
      alerts = [...alerts, ...simulated];
    }

    alerts = sortAlertsBySeverity(alerts).slice(0, limit);

    const statuses = getObservatoryStatuses();

    return NextResponse.json(
      {
        alerts,
        count: alerts.length,
        observatories: statuses,
        timestamp: new Date().toISOString(),
        engine: "AEGIS·SENTRY v4.0",
      },
      {
        headers: {
          ...rateLimitHeaders(rl),
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Observatory fetch failed",
        alerts: [],
        count: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: rateLimitHeaders(rl) }
    );
  }
}