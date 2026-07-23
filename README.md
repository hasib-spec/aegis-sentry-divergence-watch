[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21505692.svg)](https://doi.org/10.5281/zenodo.21505692)
[![ASCL](https://img.shields.io/badge/ASCL-Submitted-blue.svg)](https://ascl.net)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

# AEGIS·SENTRY — Planetary Defense Readiness Engine

> **Independent dual-agency asteroid impact risk analysis, orbital mechanics, and planetary defense readiness platform.**

AEGIS·SENTRY is a full-stack computational engine that independently analyzes Near-Earth Object (NEO) impact risk by continuously comparing and reconciling telemetry from **NASA CNEOS Sentry-II** and **ESA NEOCC**.

Unlike traditional monitoring dashboards, AEGIS·SENTRY performs its own orbital mechanics calculations, impact-risk divergence analysis, Yarkovsky perturbation modeling, gravitational keyhole detection, and mission-level deflection simulations.

---

## 🌍 Live Platform

**Dashboard**

https://aegis-sentry-divergence-watch-alpha.vercel.app/

---

# Executive Summary

During observations of asteroid **2024 YR4**, NASA and ESA periodically reported differing impact probabilities due to differences in orbital uncertainty sampling and computational methodologies.

AEGIS·SENTRY was designed to independently investigate those discrepancies.

The platform automatically:

- Collects live telemetry
- Normalizes NASA and ESA datasets
- Correlates identical objects
- Computes divergence metrics
- Performs independent orbital propagation
- Models thermal orbital drift
- Detects resonant gravitational keyholes
- Simulates potential mitigation strategies

The result is a transparent computational framework for independent planetary defense analysis.

---

# Core Computational Capabilities

## Dual-Agency Risk Divergence (ΔPS)

Computes real-time Palermo Scale differences between NASA and ESA impact assessments.

Features:

- Palermo Scale comparison
- Absolute divergence
- Relative divergence
- Statistical normalization
- Historical trend analysis

---

## 3D Keplerian Orbit Propagation

Native orbital mechanics engine.

Capabilities include:

- Orbital element conversion
- Cartesian state vector generation
- Position propagation
- Velocity propagation
- Multi-epoch simulation

Forecast horizons:

- 1 year
- 10 years
- 50 years

---

## Yarkovsky Thermal Perturbation Solver

Implements the analytical Yarkovsky model based on Vokrouhlický et al.

Calculates:

- Semimajor axis drift (da/dt)
- Long-term orbital evolution
- Thermal acceleration sensitivity

---

## B-Plane Gravitational Keyhole Detection

Computes resonant-return gravitational keyholes during planetary encounters.

Capabilities:

- B-plane analysis
- Resonance identification
- Keyhole width estimation
- Close approach classification

---

## Dynamic Deflection Solvers

Mission-level mitigation simulations.

Supported methods:

### Kinetic Impactor

- DART calibrated
- β = 3.61 ± 0.19

### Gravity Tractor

Long-duration gravitational towing simulations.

### Nuclear Standoff

Impulse-based standoff detonation modeling.

---

## Real-Time Telemetry Engine

Continuous monitoring of:

- NASA Sentry-II
- ESA NEOCC

Provides:

- Live synchronization
- Cross-matching
- Telemetry normalization
- Historical persistence
- SSE streaming

---

# System Architecture

```text
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│        NASA CNEOS Sentry-II      │        │          ESA NEOCC               │
│    Impact Observation Sampling   │        │   Asteroid Risk List (LOV/ARMOR) │
│                                  │        │                                  │
│ • Impact probabilities           │        │ • Risk monitoring                │
│ • Monte Carlo virtual impactors  │        │ • Line of Variations (LOV)       │
│ • Ephemerides & covariance       │        │ • Orbital uncertainty sampling   │
└───────────────┬──────────────────┘        └───────────────┬──────────────────┘
                │                                            │
                │ Real-time telemetry                        │
                ▼                                            ▼

┌──────────────────────────────────────────────────────────────────────────────┐
│                       AEGIS·SENTRY CORE FUSION ENGINE                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ • Telemetry Normalization & Cross-Matching                                  │
│ • NASA ↔ ESA Object Correlation                                             │
│ • Dual-Agency Palermo Scale Divergence (ΔPS)                                │
│ • Keplerian 3D Orbit Propagation                                            │
│ • Cartesian State Vector Generation                                         │
│ • Yarkovsky Thermal Drift Solver                                            │
│ • B-Plane Gravitational Keyhole Analysis                                    │
│ • Multi-Method Deflection Simulation                                        │
│     ├─ Kinetic Impactor (DART calibrated)                                   │
│     ├─ Gravity Tractor                                                      │
│     └─ Nuclear Standoff                                                     │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │
                                     ▼

┌──────────────────────────────────────────────────────────────────────────────┐
│                     REAL-TIME VISUALIZATION & API                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ • Interactive Dashboard                                                     │
│ • Live SSE Telemetry Stream (/api/live)                                     │
│ • OpenAPI 3.1 REST Interface                                                │
│ • Historical Divergence Analytics                                           │
│ • Offline-First Progressive Web App                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 |
| Language | TypeScript |
| UI | React 18 |
| Styling | Tailwind CSS |
| Graphics | Canvas 2D |
| Runtime | Vercel Edge |
| API | OpenAPI 3.1 |
| Streaming | Server-Sent Events |
| Offline Support | Progressive Web App |
| Physics Libraries | None (Native implementation) |

---

# Engineering Principles

AEGIS·SENTRY was developed around five principles:

- Independent verification
- Scientific transparency
- Zero external orbital mechanics libraries
- Reproducible calculations
- Open scientific research

---

# Scientific Foundations

The computational models are based upon peer-reviewed research including:

- Chesley et al. (2002) — Palermo Scale
- Vokrouhlický et al. (1998) — Yarkovsky Effect
- Fenucci et al. (2024) — Impact Observation Sampling vs Line of Variations
- Chodas (2015) — Gravitational Keyholes
- Thomas et al. (2023) — DART Mission Results
- NASA Office of Inspector General (IG-25-006) — Planetary Defense Assessment

---

# Features

✔ Live NASA telemetry

✔ Live ESA telemetry

✔ Dual-agency divergence analytics

✔ Independent orbital mechanics

✔ Cartesian propagation

✔ Yarkovsky modeling

✔ Keyhole detection

✔ Deflection simulations

✔ OpenAPI interface

✔ Server-Sent Events

✔ Offline Progressive Web App

✔ Zero physics dependencies

---

# License

## GNU Affero General Public License v3 (AGPLv3)

Free for:

- Academic researchers
- Universities
- Non-profit organizations
- Students
- Open-source developers

Any modified version or network-deployed version must remain open source under the AGPLv3.

---

# Commercial Licensing

A separate commercial license is required for:

- Commercial space companies
- Aerospace contractors
- Defense organizations
- Financial institutions
- Proprietary integrations
- White-label deployments
- Closed-source products

Commercial licensing inquiries:

**haedu59@gmail.com**

---

# Disclaimer

**RESEARCH AND EDUCATIONAL USE ONLY**

AEGIS·SENTRY is an independent scientific analysis platform.

It is **not affiliated with NASA, ESA, the International Asteroid Warning Network (IAWN), the Minor Planet Center (MPC), or any governmental agency.**

The software is intended solely for scientific research, engineering experimentation, and educational purposes.

It **must not** be used as the sole basis for:

- Operational planetary defense decisions
- Government emergency response
- Public evacuation planning
- Official asteroid impact notifications

Users should always rely on official publications from NASA, ESA, and the International Asteroid Warning Network for operational decision-making.

---

# Citation

If you use AEGIS·SENTRY in research, please cite:

> Ahmad, H. (2026). *AEGIS·SENTRY: Planetary Defense Readiness Engine*. Zenodo. https://doi.org/10.5281/zenodo.21505692

---

# Author

**Haseeb Ahmad**

Independent Researcher

Planetary Defense • Orbital Mechanics • Scientific Software • Open Science

---

*"Independent analysis strengthens planetary defense through transparency, reproducibility, and open scientific collaboration."*