# AEGIS·SENTRY — Planetary Defense Readiness Engine
ps://doi.org/10.5281/zenodo.21505692)
> Real-time NASA Sentry-II vs ESA NEOCC/Aegis asteroid risk divergence,
> quantified live. Yarkovsky sensitivity. Keyhole alerts. Impact corridors.
> Deflection planning. Rubin LSST triage.

**Live:** https://aegis-sentry-divergence-watch-alpha.vercel.app/


## Why This Exists

In 2024, asteroid 2024 YR4 showed NASA and ESA reporting different
impact probabilities at every stage. No public tool quantifies this
disagreement in real-time. AEGIS·SENTRY does.

## What It Does

- Cross-matches NASA Sentry-II and ESA NEOCC risk lists
- Recomputes Palermo Scale independently for both agencies
- Computes Yarkovsky Sensitivity Index (YSI)
- Detects gravitational keyhole proximity
- Projects impact corridors on Earth's surface
- Plans deflection missions (kinetic/gravity tractor/nuclear)
- Triages objects for Rubin/LSST follow-up observation
- Quantifies multi-agency consensus (v3.5)

## Tech Stack

Next.js 14 · React 18 · TypeScript · Canvas 2D · Tailwind CSS
No database. No WebGL. No external dependencies beyond npm.
Deployed on Vercel (iad1). All data from public NASA/ESA APIs.

## Scientific References

- Chesley et al. (2002) — Palermo Scale
- Vokrouhlický et al. (1998) — Yarkovsky thermal model
- Fenucci et al. (2024) §7.4 — NASA IOBS vs ESA LOV
- Chodas (2015) — Gravitational keyholes
- Thomas et al. (2023) — DART β = 3.61
- NASA OIG IG-25-006 — Planetary defense gaps

## ⚠️ Disclaimer

RESEARCH AND EDUCATIONAL USE ONLY.
NOT FOR OPERATIONAL PLANETARY DEFENSE DECISIONS.