# Design System Specification — DrainScope SaaS (Phase 1 Final)

High-craft dark geospatial SaaS interface built around a full-bleed 2D street-level canvas, translucent Bento glass cards, restrained obsidian contrast, and plain-English hydrology storytelling.

## 1. Visual Philosophy & Color System
- **Canvas-First 2D Street Workspace:** The MapLibre + Deck.gl canvas owns `100vw x 100vh` at `pitch: 0` so real roads, colony names, and drains stay razor sharp without 3D block occlusion.
- **Base & Surface Tokens:**
  - **Canvas:** `#080B10` (Obsidian Ink / Carto Dark Matter basemap)
  - **Bento Glass Cards:** `rgba(12, 18, 26, 0.88)` with `backdrop-filter: blur(20px)` and `1px solid rgba(255, 255, 255, 0.10)` hairline borders.
  - **Primary Interactive Accent:** `#C8FF00` (Neon Lime) for active rainfall/NbS controls, focus rings, and selection highlights.
  - **Hydrology Infrastructure Accent:** `#22D3EE` (Hydro Cyan) for two-pass glowing stormwater drains and timeline pills.
  - **Warm Cream Active Tab:** `#F3F0DF` with `#0A0F16` ink for the `Fix First` / `Flood Risk` mode switcher.
- **Organic Flood Severity Palette:**
  - Critical Core (`>=0.68`): `#FB7185` (Coral Rose)
  - High Risk (`0.52–0.67`): `#FB923C` (Tangerine)
  - Moderate Pooling (`0.38–0.51`): `#0E7490` (Deep Hydro Teal)
  - NbS Parks & Relief: `#10B981` / `#34D399` (Emerald)

## 2. Typography & Motion
- **UI & Headings:** `Plus Jakarta Sans` (Weights `400`, `500`, `600`, `700`; tight `-0.02em` tracking).
- **Telemetry & Metrics:** `JetBrains Mono` with `tabular-nums` so KPIs, rainfall intensity (`mm/hr`), and Rational Method runoff figures never jitter during live simulation.
- **Plain-English Copy Rule:** Avoid unexplained GIS acronyms on primary surfaces (`Priority (IPS)` -> `Fix First`, `Hazard (WSI)` -> `Flood Risk`, `TWI` -> `Water Pooling`, `Impervious` -> `Concrete Cover`).
- **Focus & X-Ray Interactions:** Clicking any waterlogging polygon smoothly flies to include the zone + nearest drain + nearby park, dims surrounding polygons to 18% opacity, draws a 450 m inspection ring, and pins on-map `TextLayer` callouts (`MAIN WATERLOGGING`, `DRAIN`, `NbS PARK`, `UNDERPASS DIP`).
