# DrainScope

**Open-data urban hydrology, 3D pluvial flood visualization, and street-level micro-drainage mapping — piloted on South Delhi's Barapullah sub-catchment (~78 km²).**

DrainScope combines two complementary layers using 100% open geospatial data and open-weights computer vision:
1. **Basin-Scale Terrain Screening (`packages/gis-pipeline` + `apps/api`):** Deterministic runoff susceptibility (`WSI`), intervention priority (`IPS`), downhill overland & road flow paths, and what-if rainfall/NbS simulation built from Copernicus 30m DEM, ESA WorldCover 10m, and OpenStreetMap.
2. **Street-Level Micro-Drainage & Clog Mapping (`extract_micro_drains.py`):** An offline GPU computer-vision pipeline (`Grounding-DINO-Tiny` + `Depth-Anything-V2-Small`) that scans Mapillary street imagery along South Delhi corridors to detect and geo-tag **unmapped kerbside storm grates, silted inlets, and blocked gutters**—directly addressing OpenStreetMap's lack of minor street-drain coverage.

> **Zero-GPU Production Hosting:** All heavy GIS raster processing and PyTorch CV inference run offline in batch (e.g., on a local RTX 3050 or Kaggle T4) to emit static GeoJSON/Parquet artifacts. The hosted FastAPI backend and Next.js frontend run entirely on CPU with minimal RAM.

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. OFFLINE BATCH PIPELINE (Local GPU / Kaggle T4 — packages/gis-pipeline)  │
│  • barapullah_pipeline.py   : 30m DEM + 10m WorldCover + OSM -> Parquet/GJ │
│  • extract_flow_paths.py    : WhiteboxTools D8 -> 420 overland streamlines │
│  • extract_road_flow.py     : Overpass OSM + DEM -> 650 downhill road flows│
│  • extract_micro_drains.py  : Mapillary + Grounding-DINO + Depth-Anything  │
│                               -> geo-tagged street inlets + bbox proof     │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ Static Parquet & GeoJSON artifacts
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 2. CPU-ONLY DETERMINISTIC API (apps/api — FastAPI + DuckDB + Pandas)       │
│  • Real-time rainfall (10–150 mm/hr), stress scenario & NbS simulation     │
│  • Analytical `rain_to_flood_mm` inverse & <=50 ha Rational Method cap     │
│  • Batch site screener (1–100 coords) & 48×48 3D terrain patch sampler     │
│  • Street depth-mask endpoint (CUDA Depth-Anything or pure-NumPy fallback) │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ REST JSON / GeoJSON
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 3. INTERACTIVE 3D CLIENT (apps/web — Next.js 15.5 + MapLibre + Three.js)   │
│  • 3D draped, feathered floodwater underneath lit 3D OSM buildings         │
│  • Live rainfall-reactive downhill road & drain velocity streamlines       │
│  • Clickable Street-Mapped Micro-Drain pins with SVG bounding-box proof    │
│  • WebGL Depth-Aware Street Flood viewer + Before/After NbS split slider   │
│  • 60 FPS Three.js 3D Shallow-Water Physics Sandbox (carve swales / pumps) │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities

* **Street-Level Micro-Drain Inventory:** Detects kerbside storm grates, manholes, and blocked gutters from Mapillary frames, estimates condition (`clear`, `silted`, `blocked`), projects curb GPS from `compass_angle` + monocular depth, deduplicates sightings within 10 m, and renders clickable photo proof (`MicroDrainEvidenceCard`) on the 3D map.
* **Draped 3D Cartography & Live Road Flow:** Terrain-draped translucent floodwater sits underneath lit 3D OSM buildings (OpenFreeMap) and street labels, paired with 650 DEM-oriented OSM road flow streamlines and 420 D8 overland flow paths whose flow speed scales live with the Rainfall Intensity slider.
* **Depth-Aware 3D Street Flood View:** Uses a local monocular ground-plane height mask and a custom WebGL GLSL shader so simulated monsoon water wraps around flyover pillars and vehicles with planar reflections, alongside a draggable **Before / After NbS** split view and a **360° Mapillary Explorer**.
* **Interactive 3D Shallow-Water Sandbox:** Extracts a local `48×48` (~960 m × 960 m) terrain patch for any hotspot so users can carve bioswales, drop sump pumps, and adjust drain blockage (`0–100%`) at 60 FPS in Three.js.
* **Deterministic Screening Workflows:**
  * `/workspace` — 3D catchment studio, local area X-Ray, and storm playback (`0–60 min`).
  * `/workspace/hotspots` — "Fix First" (`IPS`) ranked priority register with underpass filters and CSV/GeoJSON export.
  * `/workspace/screener` — Batch coordinate screener (`1–100` sites) with point-in-polygon matching.
  * `/workspace/analytics` & `/methodology` — Catchment breakdown, NbS park detention capacity, and explicit model caveats.

---

## Honest Scope & Engineering Caveats

DrainScope is a **screening, visualization, and micro-drainage inventory tool**, not a calibrated 2D hydrodynamic engineering model or insurance underwriting engine:
* **Spatial Resolution:** Organic flood pockets are derived from a 30 m Copernicus DEM and Gaussian-smoothed (`sigma=1.15`). Treat zone edges as `±30 m` screening indicators, not parcel-exact flood lines.
* **Static DEM vs. Active Operations:** A satellite DEM captures structural low spots (like underpasses and basins) but cannot see temporary municipal pump deployments or recent drain desilting.
* **Rational Method Cap:** Peak flow (`L/s`) is automatically suppressed for any zone exceeding `50 ha` to respect small-catchment hydrological validity limits.
* **Illustrative Stress Scenarios:** `+2 Yr`, `+5 Yr`, and `+10 Yr` toggles represent documented what-if stress assumptions (infill, rainfall uplift, drain siltation)—not climate forecasts.

See [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) for full equations and assumptions.

---

## Repository Structure

```text
Drainscope/
├── apps/
│   ├── api/                  # FastAPI + DuckDB deterministic simulation backend (CPU-only in prod)
│   └── web/                  # Next.js 15.5 + MapLibre GL + Deck.gl + Three.js frontend
├── packages/
│   └── gis-pipeline/         # Offline DEM hydrology, road flow & GPU micro-drainage CV scripts
├── docs/
│   ├── ARCHITECTURE.md       # System design, API reference & 3D rendering stack
│   ├── METHODOLOGY.md        # Hydrology formulas, weights & explicit caveats
│   └── MICRO_DRAINAGE_PIPELINE.md  # Grounding-DINO + Depth-Anything street mapping guide
└── README.md
```

---

## Quickstart (Linux / WSL2)

### Prerequisites
* Python 3.12+ with [`uv`](https://docs.astral.sh/uv/)
* Node.js 20+ and `npm`
* Free [Mapillary API Client Token](https://www.mapillary.com/dashboard/developers) (`MLY|...`) for street-level imagery and micro-drain scanning
* *(Optional, offline batch only)* NVIDIA CUDA GPU (tested on RTX 3050 4GB/6GB) for fast micro-drainage CV scanning

### 1. Configure Environment Variables

Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPILLARY_TOKEN=MLY|your_mapillary_client_token
```

Optional overrides:
* `NEXT_PUBLIC_BASEMAP_STYLE_URL` — custom MapLibre dark basemap JSON URL
* `NEXT_PUBLIC_CARTO_API_KEY` — CARTO API key if using authenticated tiles
* `DRAINSCOPE_DATA_DIR` *(API)* — override path to `packages/gis-pipeline/data/out`

### 2. Run Offline Geospatial & Micro-Drain Pipelines (Optional if artifacts already exist)

```bash
cd packages/gis-pipeline
export UV_LINK_MODE=copy

# Core DEM + WorldCover + OSM catchment scores & organic zones
uv run python scripts/barapullah_pipeline.py --config configs/barapullah.json

# 420 DEM D8 overland flow streamlines
uv run python scripts/extract_flow_paths.py --config configs/barapullah.json

# 650 downhill-oriented OSM arterial & collector road water-flow paths
uv run python scripts/extract_road_flow.py --config configs/barapullah.json

# Offline GPU scan for street-level micro-drains & clogs (uses apps/web/.env.local token)
HF_HUB_DISABLE_IMPLICIT_TOKEN=1 uv run python scripts/extract_micro_drains.py \
  --config configs/barapullah.json --corridor all --max-images 80
```

### 3. Start Backend API (Terminal 1)

```bash
cd apps/api
uv run pytest -v
uv run uvicorn app.main:app --reload --port 8000
```

### 4. Build & Start Web App (Terminal 2)

```bash
cd apps/web
npm install
npm run lint && npm run build && npm run start
```

Open **`http://localhost:3000/workspace`**.

---

## Open Data & Licensing

| Dataset / Service | Usage | License / Terms |
| :--- | :--- | :--- |
| **Copernicus GLO-30 DEM** | Primary 30 m elevation model, D8 flow, road slope orientation | Copernicus Open Commercial License |
| **ESA WorldCover 10 m** | Built-up / impervious cover calculation | CC BY 4.0 |
| **OpenStreetMap & Overpass** | Trunk drains, parks, `layer=-1` underpasses, arterial roads | ODbL 1.0 |
| **AWS Terrarium Elevation Tiles** | 3D terrain mesh & hillshade in MapLibre GL | Open Public Terrain Dataset |
| **OpenFreeMap** | 3D OSM building extrusions | Open / Free Vector Tiles |
| **Mapillary API** | Street-level imagery for micro-drain detection & 360° viewer | CC BY-SA 4.0 (via Mapillary Graph API) |
| **Grounding-DINO-Tiny & Depth-Anything-V2-Small** | Offline zero-shot drain detection & monocular depth | Apache 2.0 |

---

## Further Documentation
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System design, artifact contracts, MapLibre Z-order, and full REST API reference.
* [`docs/MICRO_DRAINAGE_PIPELINE.md`](docs/MICRO_DRAINAGE_PIPELINE.md) — Offline CV micro-drainage & clog mapping pipeline.
* [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — Hydrological equations, stress scenarios, and validation framework.
