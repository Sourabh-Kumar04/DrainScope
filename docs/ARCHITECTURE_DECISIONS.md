# Architecture Decision Records (ADRs) — Phase 1 Final

## ADR-01: Elevation Data & Commercial SaaS Licensing
- **Decision:** Dual-mode 30m DEM configuration — **FABDEM v1-2** (bare-earth DTM, `CC BY-NC-SA 4.0`) for research/mentor validation, and **Copernicus GLO-30** (open commercial license) for instant setup and commercial SaaS tiers.
- **Why:** FABDEM removes building and tree height bias natively for cleaner urban sink depth and TWI; abstracting the raster filename behind `configs/*.json` allows swapping between Copernicus and FABDEM with zero pipeline code changes.
- **Better Alternative (At Scale):** Commercial 1m–5m UAV/LiDAR DEMs or height-masked Copernicus GLO-30 using Google Open Buildings footprints.

## ADR-02: Organic 30m Waterlogging Contours Over Blocky 3D Hexagons
- **Decision:** Extract Gaussian-smoothed 30m continuous flood-risk contours (`{slug}_waterlogging_zones.geojson`) alongside real OSM drains, parks (`>=0.25 ha`), and `layer=-1` underpass pins, while keeping the H3 Res-9 Parquet table for backward-compatible analytics.
- **Why:** 3D H3 hexagon carpets obscure South Delhi streets and drains; organic 2D contours follow real topographic pooling pockets and visually shrink as NbS interventions bring zones below the pooling threshold (`<0.38`).
- **Better Alternative (At Scale):** Pre-computed 2D Shallow Water Equation (`Landlab OverlandFlow`) depth rasters for high-priority corridors (Phase 4).

## ADR-03: Deterministic Hydrology Core + Continuous Rain & Timeline Projection
- **Decision:** Keep 100% of scoring, Rational Method 1-hr runoff volume (`KL`) / peak discharge (`L/s`) screening, driver attribution, `10–150 mm/hr` rainfall scaling, and `Now / +2 / +5 / +10 Yr` urban projection math deterministic in FastAPI (`apps/api/app/services/simulation.py`).
- **Why:** Delivers `<50 ms` live interactivity, eliminates numeric hallucinations, and makes every projection assumption (concrete creep, storm multiplier, drain siltation decay) transparent and unit-testable.
- **Better Alternative (Phase 2+):** Pair this deterministic telemetry payload with **Google Gemini (`gemini-2.5-flash`)** using strict Pydantic `response_schema` at `temperature=0.2` to generate grounded engineering briefs and PDF reports.

## ADR-04: Spatial Query Engine (DuckDB + In-Memory GeoJSON Cache -> PostGIS)
- **Decision:** Use **DuckDB** + cached GeoJSON anchor indexing in Phase 1; migrate to **PostgreSQL + PostGIS** in Phase 2 when multi-tenant workspaces, authentication, and saved scenarios are introduced.
- **Why:** Zero database ops overhead in Phase 1 while keeping route versioning (`/v1/...`) and `X-Workspace-Id` dependency hooks ready for Phase 2 RLS.

## ADR-05: Map Rendering Stack (MapLibre GL JS + Deck.gl)
- **Decision:** **MapLibre GL JS** (free Carto Dark Matter basemap) + **Deck.gl** (`GeoJsonLayer`, `LineLayer`, `ScatterplotLayer`, `TextLayer`) + on-demand **Google Street View** handoff/embed.
- **Why:** Zero Mapbox per-load fees, GPU-accelerated vector layers with two-pass glowing drains and on-map diagnostic callouts, and graceful Street View fallback when no Maps Embed API key is configured.
