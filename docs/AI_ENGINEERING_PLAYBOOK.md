# AI-Assisted Engineering Playbook (Mandatory Guardrails)

## A. UI/UX Rules When Building Frontend With AI
1. **Lock `DESIGN.md` First:** Always supply `docs/DESIGN.md` as context so generated components maintain exact spacing, glass depth, and restrained color contrast.
2. **Modular Bento Components:** Keep `CatchmentMap`, `TopBar`, `KpiStrip`, `SimulatorDock`, and `HexInspector` cleanly separated instead of generating monolithic pages.
3. **Isolate WebGL Map Lifecycle:** Initialize `MapLibre` and `MapboxOverlay` once and update Deck.gl layers reactively so UI state changes never remount the WebGL canvas.
4. **Explicit Loading & Error States:** Never ship happy-path-only UI. Display subtle glass loaders during recalculation and clear actionable error banners if the backend or Parquet dataset is unavailable.
5. **Progressive Disclosure:** Keep only 3–4 headline KPIs visible at rest; reveal detailed GIS telemetry (`TWI`, `sink_max_m`, `nearest_drain_m`, `park_area_sqm`) inside the slide-over inspector when a hexagon is selected.

## B. Backend Rules When Building APIs With AI
1. **Contract-First Pydantic Schemas:** Define all request/response models in `app/schemas.py` first so OpenAPI docs and frontend TypeScript interfaces stay strictly synchronized.
2. **Zero Silent Mock Fallbacks:** Return HTTP `503 Service Unavailable` with clear setup instructions when real geospatial data is missing—never fabricate dummy flood scores.
3. **Multi-Tenant Ready From Phase 1:** Version all routes (`/v1/...`) and inject `workspace_id` via FastAPI dependencies so Phase 2 Auth/PostGIS drops in cleanly.
4. **Path Traversal Protection:** Strictly validate catchment slugs (`^[a-z0-9_-]+$`) before resolving Parquet/GeoJSON paths on disk.
5. **Observability & Automated Tests:** Include `/health`, `X-Process-Time-Ms` latency headers, structured logs, and a fast `pytest` suite that runs without 500 MB satellite rasters.
