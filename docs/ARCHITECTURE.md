# DrainScope System Architecture

DrainScope separates **heavy offline compute** (GIS raster hydrology + GPU computer vision) from **lightweight runtime serving** (CPU-only FastAPI + DuckDB + WebGL frontend).

---

## 1. Offline-First Hosting Model (Zero Server GPU)

| Tier | Runtime Environment | Responsibilities | Hardware Needed |
| :--- | :--- | :--- | :--- |
| **Batch Pipeline** (`packages/gis-pipeline`) | Local workstation (WSL2 + RTX 3050) or Kaggle T4 | DEM depression breaching, D8 flow tracing, Overpass road orientation, Grounding-DINO + Depth-Anything street scanning | GPU recommended for CV (CPU works slowly) |
| **API Server** (`apps/api`) | Standard CPU VPS / EC2 / Container | DuckDB/Pandas deterministic scoring, scenario math, site screening, serving precomputed GeoJSON layers | **CPU-only** (~256–512 MB RAM) |
| **Web Studio** (`apps/web`) | Static/SSR Next.js 15.5 + Browser WebGL | MapLibre GL 3D terrain/buildings, animated streamlines, WebGL street flood shader, Three.js SWE sandbox | Client browser GPU |

> **Important for Production Deployment:** Keep `torch` and `transformers` installed only in `packages/gis-pipeline`. In `apps/api/app/services/street_depth.py`, if PyTorch is absent on a CPU host, the endpoint automatically falls back to a pure-NumPy perspective + edge ground-plane estimator with zero crashes.

---

## 2. Precomputed Data Artifacts (`packages/gis-pipeline/data/out/`)

| Artifact | Producer Script | Consumer Endpoint |
| :--- | :--- | :--- |
| `{slug}_h3_scores.parquet` | `barapullah_pipeline.py` | `GET /hexes`, `POST /simulate` |
| `{slug}_waterlogging_zones.geojson` | `barapullah_pipeline.py` | `POST /zones/simulate`, `POST /screen` |
| `{slug}_drains.geojson` | `barapullah_pipeline.py` | `GET /drains` |
| `{slug}_parks.geojson` | `barapullah_pipeline.py` | `GET /parks` |
| `{slug}_underpasses.geojson` | `barapullah_pipeline.py` | `GET /underpasses` |
| `{slug}_flow_paths.geojson` | `extract_flow_paths.py` | `GET /flow-paths` (`kind: "overland" \| "drain"`) |
| `{slug}_road_flow.geojson` | `extract_road_flow.py` | `GET /flow-paths` (`kind: "road"`) |
| `{slug}_micro_drains.geojson` | `extract_micro_drains.py` | `GET /micro-drains` |
| `{slug}_validation.json` | `validate_incidents.py` | `GET /validation` |

---

## 3. REST API Reference (`apps/api`)

All catchment endpoints live under `/v1/catchments` (`apps/api/app/routers/catchments.py`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health check & available catchment slugs |
| `GET` | `/v1/catchments` | List available catchments with hex counts |
| `POST` | `/v1/catchments/{slug}/zones/simulate` | Run organic contour susceptibility simulation (`rainfall_mm_hr`, `projection_years`, `nbs_impervious_reduction_pct`, `park_detention_enabled`, optional `target_zone_ids`) |
| `GET` | `/v1/catchments/{slug}/hexes` | Baseline unsmoothed H3 hex grid |
| `POST` | `/v1/catchments/{slug}/simulate` | Run H3 grid simulation |
| `GET` | `/v1/catchments/{slug}/hexes/{h3_id}` | Single H3 cell telemetry profile |
| `POST` | `/v1/catchments/{slug}/screen` | Batch screen 1–100 `Name,lat,lng` sites via point-in-polygon + 220 m nearest-pocket fallback |
| `GET` | `/v1/catchments/{slug}/drains` | OSM trunk drains GeoJSON |
| `GET` | `/v1/catchments/{slug}/parks` | Nearby public parks (`>=0.25 ha`) GeoJSON |
| `GET` | `/v1/catchments/{slug}/underpasses` | OSM `layer=-1` road underpasses GeoJSON |
| `GET` | `/v1/catchments/{slug}/incidents` | Historical waterlogging incident points GeoJSON |
| `GET` | `/v1/catchments/{slug}/micro-drains` | Offline CV-detected kerbside storm grates, silted inlets & blocked gutters |
| `GET` | `/v1/catchments/{slug}/flow-paths` | Merged downhill road flows (`kind="road"`), DEM D8 overland streamlines, and drain flows |
| `GET` | `/v1/catchments/{slug}/zones/{zone_id}/terrain-patch` | 48×48 local elevation + imperviousness grid for the Three.js 3D Shallow-Water Sandbox |
| `GET` | `/v1/catchments/{slug}/validation` | Historical incident validation metrics (ROC-AUC, PR-AUC, Lift) |
| `GET` | `/v1/catchments/{slug}/methodology` | Model weights, spatial uncertainty notes, and stress scenario parameters |
| `POST` | `/v1/catchments/street/depth-flood` | Fetches Mapillary frame and computes ground-plane height mask (`Depth-Anything-V2-Small` or NumPy fallback) |

---

## 4. 3D MapLibre Rendering & Z-Order Stack (`CatchmentMap.tsx`)

To avoid blocky extruded flood slabs obscuring roads and buildings, `CatchmentMap.tsx` enforces a strict bottom-to-top cartographic stack anchored below the basemap's `firstSymbolId`:

1. **Basemap & 3D Terrain:** CARTO Dark Matter or Esri World Imagery + separate AWS Terrarium `raster-dem` sources for 3D terrain (`exaggeration: 2.0`) and hillshade (keeping them separate avoids the MapLibre v4 black-canvas bug).
2. **Parks (`ds-parks-fill`, `ds-parks-outline`):** Draped translucent emerald polygons.
3. **Draped, Feathered Floodwater (`ds-zones-fill`, `ds-zones-feather`):** Translucent depth-interpolated water ramp (`10 cm` `#38bdf8` → `30 cm` `#0284c7` → `55 cm` `#2563eb` → `80+ cm` `#e11d48`) with soft blurred shorelines (`line-blur: 4`).
4. **Trunk Drains & Velocity Streamlines (`ds-drains-*`, `ds-flow-beds-*`, `ds-flow-pulses-*`):** Sleek animated downhill water streaks (`1.7px–2.1px` core) whose advection speed scales dynamically with `rainfallMmHr`.
5. **Lit 3D OSM Buildings (`drainscope-3d-buildings`):** OpenFreeMap vector extrusions with directional `map.setLight(...)`, `fill-extrusion-vertical-gradient: true`, and atmospheric `map.setSky(...)` fog so buildings rise cleanly out of the draped floodwater.
6. **Basemap Road & Place Labels:** Native symbol layers remain legible above rooftops.
7. **Interactive Markers (`ds-underpasses-pts`, `ds-incidents-pts`, `ds-micro-drains-pts`, `ds-sel-*`):** Clickable pins for street-mapped micro-drains (emerald/amber/crimson), underpasses, and selected-zone connectors.

---

## 5. Depth-Aware Street Flood Shader (`StreetViewModal.tsx`)

The Street View modal offers three tabs over the active Mapillary image:
* **Live 3D Flood:** A custom WebGL GLSL fragment shader combines the Mapillary RGB texture with the 8-bit ground-plane height mask (`u_ground`). Floodwater is occluded by pillars, curbs, and vehicles (`waterLevel - groundH`), darkens a wet asphalt collar above the waterline, renders perspective-foreshortened ripples, and samples inverted planar mirror reflections from the street scene above.
* **Before / After NbS:** Renders current storm depth on the left of a draggable split line (`u_splitX`) and NbS-mitigated depth (`-48%`) on the right at 60 FPS.
* **360° Explore:** Mounts `mapillary-js` so users can move down the street and click **Simulate Flood Here** to re-run depth estimation on the new frame.
