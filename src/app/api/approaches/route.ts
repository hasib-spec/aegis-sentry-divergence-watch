import { NextRequest, NextResponse } from "next/server";
import { parseCADResponse, summarizeApproaches } from "@/lib/engine/close-approach";
import { computeMOID, quickMOIDEstimate } from "@/lib/engine/moid";
import { computeAtmosphericEntry } from "@/lib/engine/atmospheric-entry";
import {
  parseNasaSentryResponse,
  parseEsaKeplerianCatalogue,
  esaRecordToKeplerian,
  normalizeDesignation,
} from "@/lib/engine/parsers";
import { KeplerianElements } from "@/lib/engine/types";
import { AU_KM } from "@/lib/engine/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAD_URL = "https://ssd-api.jpl.nasa.gov/cad.api";
const NASA_SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api";
const ESA_KEPLERIAN_CAT_URL = "https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const des = searchParams.get("des");

  // If specific object requested, get its close approaches
  if (des) {
    try {
      const cadRes = await fetch(
        `${CAD_URL}?des=${encodeURIComponent(des)}&dist-max=0.5&v-inf-min=0&v-inf-max=100&sort=cd&body=E`,
        { headers: { Accept: "application/json" } }
      );

      if (!cadRes.ok) {
        return NextResponse.json({ error: "CAD API error", designation: des }, { status: 502 });
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

            moid = computeMOID(elements);

            // Entry physics
            const diameter = sbdb.phys_par?.find((p: { name: string }) => p.name === "diameter");
            const diameterKm = diameter ? parseFloat(diameter.value) / 1000 : 0.05;
            const vInf = summary.nextApproachVelocityKmS > 0 ? summary.nextApproachVelocityKmS : 15;
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
        { error: err instanceof Error ? err.message : "Failed", designation: des },
        { status: 500 }
      );
    }
  }

  // Batch mode: get top threats' close approaches
  try {
    const [sentryRes, esaCatRes] = await Promise.allSettled([
      fetch(`${NASA_SENTRY_URL}?ps-min=-4`, { headers: { Accept: "application/json" } }),
      fetch(ESA_KEPLERIAN_CAT_URL, { headers: { Accept: "text/plain" } }),
    ]);

    let topDesignations: string[] = [];
    if (sentryRes.status === "fulfilled" && sentryRes.value.ok) {
      const records = parseNasaSentryResponse(await sentryRes.value.json());
      topDesignations = records.slice(0, 15).map((r) => r.des);
    }

    const esaCat = new Map<string, KeplerianElements>();
    if (esaCatRes.status === "fulfilled" && esaCatRes.value.ok) {
      try {
        const rawCat = parseEsaKeplerianCatalogue(await esaCatRes.value.text());
        for (const [key, record] of rawCat) {
          esaCat.set(key, esaRecordToKeplerian(record));
        }
      } catch { /* */ }
    }

    // Fetch close approaches for top objects (parallel, limited)
    const approachResults = await Promise.allSettled(
      topDesignations.slice(0, 10).map(async (des) => {
        const res = await fetch(
          `${CAD_URL}?des=${encodeURIComponent(des)}&dist-max=0.2&sort=cd&body=E`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const json = await res.json();
        const records = parseCADResponse(json);
        const summary = summarizeApproaches(des, records);

        // Quick MOID from catalogue
        const elements = esaCat.get(normalizeDesignation(des));
        const moidAU = elements ? quickMOIDEstimate(elements) : null;

        return { designation: des, ...summary, moidAU };
      })
    );

    const approaches = approachResults
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<unknown>).value);

    return NextResponse.json({
      approaches,
      count: approaches.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}