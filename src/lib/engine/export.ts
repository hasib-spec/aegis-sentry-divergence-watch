/**
 * AEGIS-SENTRY v4.0 — Export & Report Engine
 *
 * Generates:
 *   1. Plain-text threat briefing (copyable)
 *   2. CSV export of the full threat catalogue
 *   3. JSON export (machine-readable, FAIR principles)
 *   4. Markdown report (for GitHub / wikis)
 *   5. Shareable URL with encoded state
 *
 * PDF generation is handled client-side via the browser print API
 * (window.print with @media print CSS) to avoid server dependencies.
 *
 * Reference:
 *   FAIR Data Principles (Wilkinson et al. 2016, Sci Data 3:160018)
 *   IAU Minor Planet Center data exchange formats
 */

import type { AdvancedThreat, ThreatsApiResponse } from "./types";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: TEXT BRIEFING
   ═══════════════════════════════════════════════════════════ */

export function generateThreatBriefing(
  threat: AdvancedThreat,
  consensusScore?: number
): string {
  const dKm =
    threat.nasa.diameterKm > 0
      ? threat.nasa.diameterKm
      : threat.esa.diameterM / 1000;
  const maxIp = Math.max(threat.nasa.ip, threat.esa.ipCum);

  const lines = [
    `═══════════════════════════════════════════════════════════`,
    `  AEGIS·SENTRY v4.0 — THREAT BRIEFING`,
    `  NOT FOR OPERATIONAL USE — RESEARCH ONLY`,
    `═══════════════════════════════════════════════════════════`,
    ``,
    `  OBJECT:        ${threat.designation}`,
    `  FULL NAME:     ${threat.fullname}`,
    `  SEVERITY:      ${threat.divergenceSeverity}`,
    `  GENERATED:     ${new Date().toISOString()}`,
    ``,
    `  ── PHYSICAL PROPERTIES ──`,
    `  Diameter:      ${(dKm * 1000).toFixed(0)} m (${dKm.toFixed(4)} km)`,
    `  Impact Energy: ${threat.nasa.energyMt.toExponential(3)} Mt TNT`,
    `  V-infinity:    ${threat.nasa.vInfKmS.toFixed(2)} km/s`,
    `  V-impact:      ${threat.nasa.vImpKmS.toFixed(2)} km/s`,
    ``,
    `  ── NASA SENTRY-II (IOBS + Yarkovsky) ──`,
    `  IP:            ${sciFmt(threat.nasa.ip)}`,
    `  Palermo (cum): ${threat.nasa.psCum.toFixed(4)}`,
    `  Palermo (max): ${threat.nasa.psMax.toFixed(4)}`,
    `  Torino Scale:  ${threat.nasa.tsMax}`,
    `  Impactors:     ${threat.nasa.nImp}`,
    `  Range:         ${threat.nasa.range}`,
    `  Non-grav:      ${threat.nasa.hasNonGrav ? "YES (A1, A2 fitted)" : "NO"}`,
    ``,
    `  ── ESA NEOCC / AEGIS (LOV, grav-only) ──`,
    `  IP (cum):      ${sciFmt(threat.esa.ipCum)}`,
    `  IP (max):      ${sciFmt(threat.esa.ipMax)}`,
    `  Palermo (cum): ${threat.esa.psCum.toFixed(4)}`,
    `  Torino Scale:  ${threat.esa.torinoScale}`,
    `  Velocity:      ${threat.esa.velocityKmS.toFixed(2)} km/s`,
    `  Diameter:      ${threat.esa.diameterM.toFixed(0)} m`,
    ``,
    `  ── DIVERGENCE ANALYSIS ──`,
    `  ΔPS:           ${threat.palermoDelta.toFixed(4)}`,
    `  IP Ratio:      ${threat.probabilityRatio < 900 ? threat.probabilityRatio.toFixed(2) + "×" : ">900×"}`,
    `  Spatial Δr:    ${threat.spatialDivergenceKm.toFixed(1)} km (30d propagation)`,
    `  Source Match:  ${threat.sourceMatch}`,
    ``,
    `  ── YARKOVSKY SENSITIVITY ──`,
    `  YSI:           ${threat.ysi.ysi.toFixed(3)} (${threat.ysi.classification})`,
    `  da/dt:         ${threat.ysi.daDtAUMyr.toExponential(3)} AU/Myr`,
    `  Along-track:   ${threat.ysi.alongTrackShiftKm.toExponential(2)} km`,
    `  σ b-plane:     ${threat.ysi.bPlaneSigmaKm.toFixed(0)} km`,
    `  Dominance:     ${isFinite(threat.ysi.dominanceYears) ? "~" + threat.ysi.dominanceYears.toFixed(0) + " yr" : "—"}`,
    ``,
    `  ── GRAVITATIONAL KEYHOLES ──`,
    `  Count:         ${threat.keyhole.keyholeCount}`,
    `  Nearest:       ${threat.keyhole.nearestResonance}`,
    `  σ from KH:     ${isFinite(threat.keyhole.sigmaFromKeyhole) ? threat.keyhole.sigmaFromKeyhole.toFixed(2) + "σ" : "—"}`,
    `  Alert:         ${threat.keyhole.isAlert ? "⚠ YES" : "No"}`,
    `  Susceptibility:${threat.keyhole.susceptibility}`,
    ``,
    `  ── IMPACT CORRIDOR ──`,
    `  Active:        ${threat.corridor.hasCorridor ? "YES" : "No"}`,
    `  Center:        ${threat.corridor.centerLatDeg.toFixed(2)}°, ${threat.corridor.centerLonDeg.toFixed(2)}°`,
    `  Footprint:     ${threat.corridor.widthKm.toFixed(0)} × ${threat.corridor.lengthKm.toFixed(0)} km`,
    `  Entry vel:     ${threat.corridor.entryVelocityKmS.toFixed(2)} km/s`,
    `  Entry angle:   ${threat.corridor.entryAngleDeg.toFixed(1)}°`,
    ``,
    `  ── RUBIN READINESS ──`,
    `  Score:         ${threat.readiness.score}/100`,
    `  Priority:      ${threat.readiness.priority}`,
    `  Factors:       ${threat.readiness.factors.join(", ")}`,
    ``,
  ];

  if (consensusScore !== undefined) {
    lines.push(
      `  ── MULTI-AGENCY CONSENSUS ──`,
      `  Score:         ${consensusScore}/100`,
      ``
    );
  }

  lines.push(
    `  ── SOURCES ──`,
    `  NASA Sentry:   https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(threat.designation)}`,
    `  NASA SBDB:     https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(threat.designation)}`,
    `  ESA .risk:     https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(threat.designation)}.risk`,
    `  ESA .ke1:      https://neo.ssa.esa.int/PSDB-portlet/download?file=${encodeURIComponent(threat.designation)}.ke1`,
    ``,
    `  ── DISCLAIMER ──`,
    `  This report is generated by AEGIS·SENTRY v4.0 for RESEARCH`,
    `  AND EDUCATIONAL purposes only. It is NOT authorized for`,
    `  operational planetary defense decisions. Verify all risk`,
    `  assessments through official channels:`,
    `    NASA CNEOS:  https://cneos.jpl.nasa.gov`,
    `    ESA NEOCC:   https://neo.ssa.esa.int`,
    ``,
    `  Engine: Kepler ε=10⁻¹⁴ • Yarkovsky: Vokrouhlický 1998`,
    `  Palermo: Chesley et al. 2002 • Keyholes: Greenberg 2002`,
    `  Corridors: Chodas 2015 • Deflection: Carusi 2002 / DART β=3.61`,
    `═══════════════════════════════════════════════════════════`,
  );

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: CSV EXPORT
   ═══════════════════════════════════════════════════════════ */

export function generateCSV(threats: AdvancedThreat[]): string {
  const headers = [
    "designation",
    "fullname",
    "source_match",
    "severity",
    "nasa_ip",
    "nasa_ps_cum",
    "nasa_ts_max",
    "nasa_diameter_km",
    "nasa_energy_mt",
    "nasa_v_inf_kms",
    "nasa_has_non_grav",
    "esa_ip_cum",
    "esa_ps_cum",
    "esa_torino",
    "esa_diameter_m",
    "esa_velocity_kms",
    "palermo_delta",
    "probability_ratio",
    "spatial_divergence_km",
    "ysi",
    "ysi_classification",
    "ysi_da_dt_au_myr",
    "keyhole_count",
    "keyhole_alert",
    "keyhole_susceptibility",
    "corridor_active",
    "corridor_lat_deg",
    "corridor_lon_deg",
    "corridor_length_km",
    "readiness_score",
    "readiness_priority",
  ];

  const rows = threats.map((t) => {
    const dKm = t.nasa.diameterKm > 0 ? t.nasa.diameterKm : t.esa.diameterM / 1000;
    return [
      csvEscape(t.designation),
      csvEscape(t.fullname),
      t.sourceMatch,
      t.divergenceSeverity,
      t.nasa.ip.toExponential(6),
      t.nasa.psCum.toFixed(6),
      t.nasa.tsMax,
      dKm.toFixed(6),
      t.nasa.energyMt.toExponential(4),
      t.nasa.vInfKmS.toFixed(4),
      t.nasa.hasNonGrav ? "YES" : "NO",
      t.esa.ipCum.toExponential(6),
      t.esa.psCum.toFixed(6),
      t.esa.torinoScale,
      t.esa.diameterM.toFixed(1),
      t.esa.velocityKmS.toFixed(4),
      t.palermoDelta.toFixed(6),
      t.probabilityRatio.toFixed(4),
      t.spatialDivergenceKm.toFixed(2),
      t.ysi.ysi.toFixed(4),
      t.ysi.classification,
      t.ysi.daDtAUMyr.toExponential(4),
      t.keyhole.keyholeCount,
      t.keyhole.isAlert ? "YES" : "NO",
      t.keyhole.susceptibility,
      t.corridor.hasCorridor ? "YES" : "NO",
      t.corridor.centerLatDeg.toFixed(4),
      t.corridor.centerLonDeg.toFixed(4),
      t.corridor.lengthKm.toFixed(1),
      t.readiness.score,
      t.readiness.priority,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: JSON EXPORT (FAIR-compliant)
   ═══════════════════════════════════════════════════════════ */

export function generateJSONExport(data: ThreatsApiResponse): string {
  const exportObj = {
    "@context": {
      "@vocab": "https://schema.org/",
      "aegis": "https://aegis-sentry.vercel.app/vocab/",
    },
    "@type": "Dataset",
    name: "AEGIS·SENTRY Multi-Agency Asteroid Risk Divergence Catalogue",
    description:
      "Cross-matched NASA Sentry-II and ESA NEOCC/Aegis impact probability " +
      "assessments with Yarkovsky sensitivity, gravitational keyhole detection, " +
      "impact corridor projection, and Rubin LSST follow-up triage scores.",
    creator: {
      "@type": "Organization",
      name: "AEGIS·SENTRY Research",
    },
    license: "https://creativecommons.org/licenses/by-nc/4.0/",
    datePublished: new Date().toISOString(),
    version: "4.0.0",
    citation:
      "Chesley et al. (2002); Vokrouhlický et al. (1998); Fenucci et al. (2024); " +
      "Chodas (2015); Greenberg (2002); Carusi et al. (2002); Thomas et al. (2023)",
    variableMeasured: [
      "impact_probability",
      "palermo_scale",
      "torino_scale",
      "yarkovsky_sensitivity_index",
      "keyhole_susceptibility",
      "impact_corridor",
      "rubin_readiness_score",
    ],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
    },
    metadata: data.metadata,
    threats: data.threats,
  };

  return JSON.stringify(exportObj, null, 2);
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: MARKDOWN REPORT
   ═══════════════════════════════════════════════════════════ */

export function generateMarkdownReport(
  data: ThreatsApiResponse,
  topN: number = 20
): string {
  const md = data.metadata;
  const now = new Date().toISOString();
  const top = [...data.threats]
    .sort((a, b) => Math.abs(b.palermoDelta) - Math.abs(a.palermoDelta))
    .slice(0, topN);

  const lines = [
    `# AEGIS·SENTRY v4.0 — Threat Assessment Report`,
    ``,
    `> **NOT FOR OPERATIONAL USE** — Research and educational purposes only.`,
    `> Verify through [NASA CNEOS](https://cneos.jpl.nasa.gov) and [ESA NEOCC](https://neo.ssa.esa.int).`,
    ``,
    `**Generated:** ${now}`,
    `**Engine:** v4.0 • Kepler ε=10⁻¹⁴ • Yarkovsky: Vokrouhlický 1998`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| NASA Sentry objects | ${md.nasaCount} |`,
    `| ESA NEOCC objects | ${md.esaCount} |`,
    `| Dual-agency matched | ${md.matchedCount} |`,
    `| Critical divergence | ${md.criticalCount} |`,
    `| YSI-dominant orbits | ${md.ysiDominantCount} |`,
    `| Keyhole alerts | ${md.keyholeAlertCount} |`,
    `| Impact corridors | ${md.corridorCount} |`,
    `| RRS critical | ${md.readinessCriticalCount} |`,
    ``,
    `## Top ${topN} by |ΔPS|`,
    ``,
    `| # | Object | NASA IP | ESA IP | ΔPS | YSI | RRS | Severity |`,
    `|---|--------|---------|--------|-----|-----|-----|----------|`,
  ];

  top.forEach((t, i) => {
    lines.push(
      `| ${i + 1} | ${t.designation} | ${sciFmt(t.nasa.ip)} | ${sciFmt(t.esa.ipCum)} | ${t.palermoDelta.toFixed(3)} | ${t.ysi.ysi.toFixed(2)} | ${t.readiness.score} | ${t.divergenceSeverity} |`
    );
  });

  lines.push(
    ``,
    `## Methodology`,
    ``,
    `- **Palermo Scale:** PS = log₁₀(IP / (0.03 × E^(-4/5) × T)) — Chesley et al. (2002)`,
    `- **Yarkovsky:** Vokrouhlický (1998) diurnal thermal model, da/dt estimation`,
    `- **Keyholes:** Greenberg (2002) resonant return theory, b-plane analysis`,
    `- **Corridors:** Chodas (2015) b-plane σ projection to ground track`,
    `- **Deflection:** Carusi et al. (2002) Δv computation, DART β = 3.61 ± 0.19`,
    `- **Consensus:** Weighted multi-component disagreement index (Fenucci 2024 §7.4)`,
    ``,
    `## Data Sources`,
    ``,
    `- NASA CNEOS Sentry-II: https://ssd-api.jpl.nasa.gov/sentry.api`,
    `- NASA SBDB: https://ssd-api.jpl.nasa.gov/sbdb.api`,
    `- NASA CAD: https://ssd-api.jpl.nasa.gov/cad.api`,
    `- ESA NEOCC Risk List: https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list`,
    `- ESA Keplerian Catalogue: https://neo.ssa.esa.int/PSDB-portlet/download?file=neo_kc.cat`,
    ``,
    `---`,
    `*AEGIS·SENTRY v4.0 • ${now} • CC BY-NC 4.0*`,
  );

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: SHAREABLE URL
   ═══════════════════════════════════════════════════════════ */

export function generateShareURL(
  designation: string,
  baseUrl: string = "https://aegis-sentry.vercel.app"
): string {
  return `${baseUrl}/api/object/${encodeURIComponent(designation)}`;
}

export function generateThreatCardURL(
  designation: string,
  baseUrl: string = "https://aegis-sentry.vercel.app"
): string {
  return `${baseUrl}/?tab=matrix&obj=${encodeURIComponent(designation)}`;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6: DOWNLOAD HELPERS (client-side)
   ═══════════════════════════════════════════════════════════ */

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard API unavailable"));
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function sciFmt(val: number): string {
  if (!val || val === 0) return "—";
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e6)
    return val.toExponential(2);
  return val.toFixed(6);
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}