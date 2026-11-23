# Licensing, Validation & Modeling Guardrails — DrainScope SaaS

## 1. Commercial Data & Basemap Licensing
- **Elevation (DEM) Default:** **Copernicus GLO-30 DEM** (`copernicus_barapullah.tif`) — open commercial license, safe for multi-tenant SaaS.
  - *FABDEM v1-2 Restriction:* FABDEM is licensed under `CC BY-NC-SA 4.0` (non-commercial, ShareAlike). Do **not** ship FABDEM-derived layers in commercial SaaS tiers without a commercial license from Fathom.
- **Land Cover:** **ESA WorldCover 10m 2021** (`CC BY 4.0`) — commercially usable with attribution.
- **Vector Infrastructure:** **OpenStreetMap** (`ODbL 1.0`) — requires visible `© OpenStreetMap contributors` attribution on maps and exports. Keep proprietary workspace data in separate tables from OSM-derived infrastructure layers to respect ODbL Share-Alike boundaries.
- **Basemap Tiles:** **CARTO Dark Matter** — commercial use requires a registered `NEXT_PUBLIC_CARTO_API_KEY` (free tier up to 1M tile requests/month) and visible `© CARTO, © OpenStreetMap contributors` attribution. For zero-fee commercial scale, point `NEXT_PUBLIC_BASEMAP_STYLE_URL` at self-hosted **Protomaps / PMTiles**.

## 2. Ground-Truth Validation Protocol
- Susceptibility maps must not be presented as validated flood risk maps until scored against historical waterlogging incidents.
- Run `packages/gis-pipeline/scripts/validate_incidents.py --config configs/barapullah.json --incidents <path.csv>` to compute **ROC-AUC**, **PR-AUC**, and **Top-10% / Top-20% Lift** and export `data/out/barapullah_validation.json`.
- When no validation file exists, the UI explicitly displays **"Unvalidated Screening Susceptibility"**.

## 3. Hydrological Scope & Uncertainty Guardrails
- **Rational Method Cap:** Zone-scale 1-hour peak discharge (`L/s`) is restricted to zones `<= 50 ha` (`rational_method_max_area_ha` in `configs/barapullah.json`). Larger merged contours suppress `peak_flow_lps`, and Rational Method flows are never summed across the 78 km² basin.
- **OSM Drain Completeness:** OSM predominantly maps major trunk drains/nallahs; roadside and colony storm drains are frequently missing. All UI labels explicitly state **"Nearest Mapped Trunk Drain (OSM)"** with an inline completeness caveat.
- **30m DEM Spatial Uncertainty:** Smoothed organic contours are rendered without hard outer strokes for unselected zones and labeled **"30m Screening (±30m)"**. Users can toggle directly to the unsmoothed H3 grid view in the top bar.
- **Stress Scenarios (What-If):** `+2 / +5 / +10 Yr` scenarios and the `0.38` display cutoff are configured in `configs/barapullah.json` and labeled as illustrative stress scenarios, not calibrated climate forecasts.
