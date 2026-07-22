import { NextRequest, NextResponse } from "next/server";
import { parseCADResponse, summarizeApproaches } from "@/lib/engine/close-approach";
import { quickMOIDEstimate } from "@/lib/engine/moid";
import { computeAtmosphericEntry } from "@/lib/engine/atmospheric-entry";
import {
  parseEsaKeplerianCatalogue,
  esaRecordToKeplerian,
  normalizeDesignation,
} from "@/lib/engine/parsers";
import { KeplerianElements } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAD_URL = "https://ssd-api.jpl.nasa.gov/cad.api";
const ESA_KEPLERIAN_CAT_URL =
  "https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const des = searchParams.get("des");

  // ─── SINGLE OBJECT MODE ───
  if (des) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const cadRes = await fetch(
        `${CAD_URL}?des=${encodeURIComponent(des)}&dist-max=0.5&sort=cd`,
        { signal: controller.signal, headers: { Accept: "application/json" } }
      );
      clearTimeout(timeout);

      if (!cadRes.ok) {
        return NextResponse.json(
          { error: "CAD API error", designation: des },
          { status: 502 }
        );
      }

      const cadJson = await cadRes.json();
      const records = parseCADResponse(cadJson);
      const summary = summarizeApproaches(des, records);

      // Get elements for MOID + entry physics
      let moid = null;
      let entry = null;

      try {
        const sbdbRes = await fetch(
          `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(des)}&phys-par=1`,
          { headers: { Accept: "application/json" } }
        );
        if (sbdbRes.ok) {
          const sbdb = await sbdbRes.json();
          if (sbdb.orbit?.elements) {
            const D2R = Math.PI / 180;
            const elemMap = new Map<string, number>();
            for (const el of sbdb.orbit.elements) {
              elemMap.set(el.name, parseFloat(el.value));
            }
            const elements: KeplerianElements = {
              semiMajorAxisAU: elemMap.get("a") || 1.5,
              eccentricity: elemMap.get("e") || 0.3,
              inclinationRad: (elemMap.get("i") || 10) * D2R,
              longitudeAscendingNodeRad: (elemMap.get("om") || 0) * D2R,
              argumentOfPerihelionRad: (elemMap.get("w") || 0) * D2R,
              meanAnomalyAtEpochRad: (elemMap.get("ma") || 0) * D2R,
              epochJD: parseFloat(sbdb.orbit.epoch) || 2451545,
            };

            moid = quickMOIDEstimate(elements);

            const diameter = sbdb.phys_par?.find(
              (p: { name: string }) => p.name === "diameter"
            );
            const diameterKm = diameter
              ? parseFloat(diameter.value) / 1000
              : 0.05;
            const vInf =
              summary.nextApproachVelocityKmS > 0
                ? summary.nextApproachVelocityKmS
                : 15;
            entry = computeAtmosphericEntry(diameterKm, vInf, 45);
          }
        }
      } catch {
        /* SBDB optional */
      }

      return NextResponse.json({
        designation: des,
        closeApproaches: summary,
        moid,
        entry,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed",
          designation: des,
        },
        { status: 500 }
      );
    }
  }

  // ─── BATCH MODE: Single CAD call for ALL close approaches ───
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // ONE call: get all Earth close approaches within 0.05 AU (~19 LD)
    // for the next 100 years, sorted by distance (closest first)
    const now = new Date();
    const dateMin = now.toISOString().slice(0, 10);
    const futureDate = new Date(now.getTime() + 100 * 365.25 * 86400000);
    const dateMax = futureDate.toISOString().slice(0, 10);

    const cadRes = await fetch(
      `${CAD_URL}?dist-max=0.05&date-min=${dateMin}&date-max=${dateMax}&sort=dist&limit=50`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "AegisSentry/3.1 (Research)",
        },
      }
    );
    clearTimeout(timeout);

    if (!cadRes.ok) {
      return NextResponse.json(
        { error: `CAD API returned ${cadRes.status}`, approaches: [], count: 0 },
        { status: 200 }
      );
    }

    const cadJson = await cadRes.json();
    const allRecords = parseCADResponse(cadJson);

    // Group by designation and summarize
    const byDesignation = new Map<
      string,
      ReturnType<typeof parseCADResponse>
    >();
    for (const rec of allRecords) {
      const key = rec.designation;
      if (!byDesignation.has(key)) byDesignation.set(key, []);
      byDesignation.get(key)!.push(rec);
    }

    // Try to get MOID from ESA catalogue (non-blocking, best-effort)
    const esaCat = new Map<string, KeplerianElements>();
    try {
      const catController = new AbortController();
      const catTimeout = setTimeout(() => catController.abort(), 5000);
      const esaCatRes = await fetch(ESA_KEPLERIAN_CAT_URL, {
        signal: catController.signal,
        headers: { Accept: "text/plain" },
      });
      clearTimeout(catTimeout);
      if (esaCatRes.ok) {
        const rawCat = parseEsaKeplerianCatalogue(await esaCatRes.text());
        for (const [key, record] of rawCat) {
          esaCat.set(key, esaRecordToKeplerian(record));
        }
      }
    } catch {
      /* ESA catalogue optional */
    }

    // Build response: one entry per unique object
    const approaches = Array.from(byDesignation.entries())
      .map(([designation, records]) => {
        const summary = summarizeApproaches(designation, records);
        const elements = esaCat.get(normalizeDesignation(designation));
        const moidAU = elements ? quickMOIDEstimate(elements) : null;
        return { ...summary, moidAU };
      })
      .sort((a, b) => a.nextApproachLD - b.nextApproachLD)
      .slice(0, 30);

    return NextResponse.json({
      approaches,
      count: approaches.length,
      totalRecords: allRecords.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Return empty but valid response so frontend doesn't break
    return NextResponse.json({
      error: err instanceof Error ? err.message : "CAD fetch failed",
      approaches: [],
      count: 0,
      timestamp: new Date().toISOString(),
    });
  }
}