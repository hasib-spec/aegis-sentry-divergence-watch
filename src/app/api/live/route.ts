/**
 * AEGIS-SENTRY v4.0 — Server-Sent Events (SSE) Real-time Endpoint
 *
 * Provides a streaming connection for live risk updates.
 * Polls NASA Sentry + ESA NEOCC every 60 seconds and pushes
 * changes to connected clients via SSE.
 *
 * SSE is supported on Vercel and provides true "live" updates
 * without WebSocket infrastructure.
 *
 * Client connects via: EventSource('/api/live')
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const ESA_RISK_LIST_URL =
  "https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list";

interface LiveUpdate {
  type: "HEARTBEAT" | "DATA_UPDATE" | "ANOMALY" | "ERROR";
  timestamp: string;
  data?: unknown;
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: LiveUpdate) => {
        if (closed) return;
        try {
          const data = JSON.stringify(event);
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // Send initial heartbeat
      send({
        type: "HEARTBEAT",
        timestamp: new Date().toISOString(),
        data: { message: "Connected to AEGIS-SENTRY live feed" },
      });

      // Poll loop
      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // Fetch NASA Sentry (top risks only for speed)
          const nasaRes = await fetch(`${NASA_SENTRY_URL}?ps-min=-4`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
          });

          if (nasaRes.ok) {
            const nasaData = await nasaRes.json();
            const topRisks = (nasaData.data || [])
              .slice(0, 20)
              .map((r: Record<string, string>) => ({
                des: r.des,
                ip: parseFloat(r.ip) || 0,
                ps: parseFloat(r.ps_cum) || -99,
                ts: parseInt(r.ts_max) || 0,
                diameter: parseFloat(r.diameter) || 0,
              }));

            send({
              type: "DATA_UPDATE",
              timestamp: new Date().toISOString(),
              data: {
                source: "NASA_SENTRY",
                count: topRisks.length,
                topRisks,
              },
            });
          }

          // Fetch ESA Risk List (lightweight check)
          const esaRes = await fetch(ESA_RISK_LIST_URL, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(10000),
          });

          if (esaRes.ok) {
            const esaText = await esaRes.text();
            const lines = esaText.split("\n").filter((l) => l.includes("|"));
            const esaCount = lines.length;

            send({
              type: "DATA_UPDATE",
              timestamp: new Date().toISOString(),
              data: {
                source: "ESA_NEOCC",
                count: esaCount,
                status: "OK",
              },
            });
          }
        } catch {
          send({
            type: "ERROR",
            timestamp: new Date().toISOString(),
            data: { message: "Upstream API timeout" },
          });
        }

        // Heartbeat every cycle
        send({
          type: "HEARTBEAT",
          timestamp: new Date().toISOString(),
        });
      }, 60000); // Poll every 60 seconds

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}