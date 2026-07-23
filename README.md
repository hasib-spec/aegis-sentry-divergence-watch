[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21505692.svg)](https://doi.org/10.5281/zenodo.21505692)
[![ASCL](https://img.shields.io/badge/ascl-submitted-blue.svg)](https://ascl.net)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

# AEGIS·SENTRY — Planetary Defense Readiness Engine

> An independent, zero-dependency orbital mechanics and dual-agency risk divergence engine. Dynamically evaluating real-time telemetry from NASA CNEOS Sentry-II and ESA NEOCC for planetary defense triage, Yarkovsky sensitivity, and keyhole mitigation.

**🌍 Live Telemetry Dashboard:**  
https://aegis-sentry-divergence-watch-alpha.vercel.app/

---

## Executive Summary

During the tracking of asteroid **2024 YR4**, institutional risk assessments from NASA and ESA diverged significantly at multiple stages of observation.

AEGIS·SENTRY was engineered to bridge this gap. It is a full-stack computational engine that directly ingests, cross-matches, and analyzes divergent impact probabilities in real time. By normalizing telemetry between NASA's Impact Observation Sampling (IOBS) and ESA's Line of Variations (LOV), AEGIS·SENTRY provides an independent consensus view of Near-Earth Object (NEO) impact vectors.

---

## Core Capabilities & Computational Engine

AEGIS·SENTRY goes beyond API aggregation, featuring a native orbital physics engine written entirely in TypeScript.

- **Dual-Agency Risk Divergence (ΔPS)** — Computes Palermo Scale variance between NASA and ESA risk assessments.
- **3D Keplerian Orbital Propagation** — Converts orbital elements into Cartesian state vectors across 1-, 10-, and 50-year horizons.
- **Yarkovsky Thermal Perturbation Modeling** — Implements the Vokrouhlický analytical model for semimajor axis drift (da/dt).
- **B-Plane Gravitational Keyhole Detection** — Identifies resonant-return keyholes during close approaches.
- **Dynamic Deflection Solvers**
  - Kinetic Impactor (DART calibrated β = 3.61 ± 0.19)
  - Gravity Tractor
  - Nuclear Standoff

---

## System Architecture

```text
        NASA Sentry-II (IOBS)          ESA NEOCC (LOV)
                 │                           │
                 ▼                           ▼
        ┌────────────────────────────────────────────┐
        │         AEGIS·SENTRY Engine                │
        │                                            │
        │ • Keplerian Orbit Propagation              │
        │ • Yarkovsky Thermal Modeling               │
        │ • Risk Divergence Analysis                 │
        │ • Keyhole Detection                        │
        │ • Deflection Solver                        │
        └────────────────────────────────────────────┘
                           │
                           ▼
        SSE Live Risk Feed • OpenAPI 3.1
```

---

## Tech Stack & Engineering Specs

- **Framework:** Next.js 14, React 18, TypeScript
- **Graphics:** Canvas 2D, Tailwind CSS
- **Infrastructure:** Vercel Edge (iad1)
- **Caching:** Offline-first PWA with stale-while-revalidate Service Worker
- **Data:** Server-Sent Events (SSE), OpenAPI 3.1
- **Dependencies:** Zero external physics or mathematics libraries

---

## Scientific References & Mathematical Framework

- Chesley et al. (2002) — Palermo Scale
- Vokrouhlický et al. (1998) — Yarkovsky Effect
- Fenucci et al. (2024) §7.4 — IOBS vs LOV
- Chodas (2015) — Gravitational Keyholes
- Thomas et al. (2023) — DART Mission (β = 3.61)
- NASA OIG IG-25-006 — Planetary Defense Assessment

---

## ⚖️ License & Commercial Integration

### GNU AGPLv3

Free for:

- Academic researchers
- Universities
- Non-profit organizations
- Open-source developers

Any modified or network-deployed version must remain open source under AGPLv3.

### Commercial License

Required for:

- Commercial space operators
- Defense contractors
- Hedge funds
- Proprietary integrations
- White-label API deployments
- Closed-source modifications

📧 **Commercial inquiries:**  
**haedu59@gmail.com**

---

## ⚠️ Disclaimer

**RESEARCH AND EDUCATIONAL USE ONLY**

AEGIS·SENTRY is an independent analytical tool.

It is **not affiliated with NASA, ESA, or the International Asteroid Warning Network (IAWN).**

This software is intended for scientific research and educational purposes only and **must not be used for operational planetary defense decisions or public evacuation planning.**