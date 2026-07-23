https://zenodo.org/badge/DOI/10.5281/zenodo.21505692.svg
https://img.shields.io/badge/ascl-submitted-blue.svg
https://img.shields.io/badge/License-AGPL%20v3-blue.svg

AEGIS·SENTRY — Planetary Defense Readiness Engine

An independent, zero-dependency orbital mechanics and dual-agency risk divergence engine. Dynamically evaluating real-time telemetry from NASA CNEOS Sentry-II and ESA NEOCC for planetary defense triage, Yarkovsky sensitivity, and keyhole mitigation.

Live Telemetry Dashboard: https://aegis-sentry-divergence-watch-alpha.vercel.app/

---

Executive Summary

During the tracking of asteroid 2024 YR4, institutional risk assessments from NASA and ESA diverged significantly at multiple stages of observation. AEGIS·SENTRY was engineered to bridge this gap. It is a full-stack computational engine that directly ingests, cross-matches, and analyzes divergent impact probabilities in real-time. By normalizing telemetry between NASA's Impact Observation Sampling (IOBS) and ESA's Line of Variations (LOV), AEGIS·SENTRY provides an unprecedented, independent consensus view of Near-Earth Object (NEO) impact vectors.

Core Capabilities & Computational Engine

AEGIS·SENTRY goes beyond API aggregation, featuring a native, mathematically rigorous orbital physics engine built entirely in TypeScript:

· Dual-Agency Risk Divergence ($\Delta PS$): Cross-matches NASA and ESA risk lists, computing real-time Palermo Scale variance to identify tracking discrepancies.
· 3D Keplerian Orbital Propagation: Natively converts orbital elements into 3D Cartesian position and velocity state vectors, projecting orbits across 1-year, 10-year, and 50-year horizons.
· Yarkovsky Thermal Perturbation Modeling: Implements the Vokrouhlický diurnal thermal drift analytical model to calculate semimajor axis drift rate ($\text{da}/dt$) and thermal sensitivity.
· B-Plane Gravitational Keyhole Detection: Evaluates close-approach proximity to identify whether near-misses cross keyholes that force resonant return impacts.
· Dynamic Deflection Solvers: Computes mitigation impulse ($\Delta v$) and routing for three defense methodologies:
  · Kinetic Impactor: Calibrated using empirical data from the DART mission ($\beta = 3.61 \pm 0.19$).
  · Gravity Tractor: Calculates continuous gravitational acceleration vectors for long-warning deflection.
  · Nuclear Standoff: Vaporization and momentum coupling projections for high-mass/short-warning targets.

System Architecture

```text
   [ NASA Sentry-II (IOBS) ]        [ ESA NEOCC (LOV) ]
             │                              │
             ▼                              ▼
   ┌──────────────────────────────────────────────┐
   │        AEGIS·SENTRY Algorithmic Engine       │
   │ ├─ Keplerian 3D Orbit Propagation            │
   │ ├─ Vokrouhlický Yarkovsky Thermal Model      │
   │ ├─ Multi-Method Deflection Mitigation        │
   └──────────────────────────────────────────────┘
             │
             ▼
   [ SSE Live Risk Feed & OpenAPI 3.1 Telemetry ]
```

Tech Stack & Engineering Specs

Built for maximum portability and high-performance edge execution:

· Framework: Next.js 14 · React 18 · TypeScript
· Graphics: High-performance Canvas 2D (No WebGL overhead) · Tailwind CSS
· Infrastructure: Deployed on Vercel Edge (iad1). Offline-first PWA caching with custom stale-while-revalidate Service Worker (TTL).
· Data Feeds: Real-time Server-Sent Events (SSE) streaming API. OpenAPI 3.1 compliant.
· Dependencies: Zero external physics or math libraries. All orbital solvers and matrix transformations are written natively in TS.

Scientific References & Mathematical Framework

The engine's logic is strictly grounded in peer-reviewed planetary defense literature:

· Palermo Scale: Chesley et al. (2002) — Quantifying the risk posed by potential Earth impacts.
· Thermal Drift: Vokrouhlický et al. (1998) — Yarkovsky thermal force analytical modeling.
· Agency Divergence: Fenucci et al. (2024) §7.4 — IOBS vs. LOV methodology.
· Gravitational Keyholes: Chodas (2015) — Resonant return tracking.
· Momentum Enhancement: Thomas et al. (2023) — DART mission empirical calibration (\beta = 3.61).
· Operational Readiness: NASA OIG IG-25-006 — Planetary defense gap assessment.

⚖️ License & Commercial Integration

This repository is dual-licensed to support both open science and enterprise space operations:

1. Open-Source (GNU AGPLv3): Free for academic researchers, universities, non-profit institutions, and open-source developers. Any derivative works, modified versions, or network-deployed instances must remain open-source under the terms of the GNU Affero General Public License v3.0.
2. Commercial License: Required for commercial space operators, defense contractors, hedge funds, or private enterprises seeking closed-source integration, proprietary modifications, API white-labeling, or dedicated SLAs without AGPLv3 copyleft restrictions.

For commercial licensing inquiries, API access, or custom deployment support, please contact: haedu59@gmail.com

⚠️ Disclaimer

RESEARCH AND EDUCATIONAL USE ONLY.

AEGIS·SENTRY is an independent analytical tool. It is not affiliated with NASA, the European Space Agency, or the International Asteroid Warning Network (IAWN). Data is provided for theoretical research and is NOT FOR OPERATIONAL PLANETARY DEFENSE DECISIONS OR PUBLIC EVACUATION PLANNING.