# DrainScope Offline GIS & CV Pipeline (`packages/gis-pipeline`)

Runs offline on a developer workstation (WSL2 + NVIDIA RTX 3050) or Kaggle T4 GPU to build static Parquet/GeoJSON artifacts served by the CPU-only FastAPI backend.

## Pipeline Scripts

| Script | Output (`data/out/`) | Purpose |
| :--- | :--- | :--- |
| `scripts/barapullah_pipeline.py` | `{slug}_h3_scores.parquet`, `{slug}_waterlogging_zones.geojson`, `{slug}_drains/parks/underpasses.geojson` | Core 30 m Copernicus DEM + 10 m ESA WorldCover + OSM hydrological scoring |
| `scripts/extract_flow_paths.py` | `{slug}_flow_paths.geojson` | WhiteboxTools D8 depression breaching & 420 overland streamlines |
| `scripts/extract_road_flow.py` | `{slug}_road_flow.geojson` | Fetches OSM arterial/collector roads via Overpass & orients 650 segments downhill via DEM |
| `scripts/extract_micro_drains.py` | `{slug}_micro_drains.geojson` | Scans Mapillary imagery with `Grounding-DINO-Tiny` + `Depth-Anything-V2-Small` to map unmapped kerbside storm grates & clogs |
| `scripts/validate_incidents.py` | `{slug}_validation.json` | Evaluates WSI against geocoded historical waterlogging incidents (ROC-AUC, PR-AUC, Lift) |

## Quick Run

```bash
cd packages/gis-pipeline
export UV_LINK_MODE=copy

uv run python scripts/extract_road_flow.py --config configs/barapullah.json
HF_HUB_DISABLE_IMPLICIT_TOKEN=1 uv run python scripts/extract_micro_drains.py \
  --config configs/barapullah.json --corridor all --max-images 80
```

See [`../../docs/MICRO_DRAINAGE_PIPELINE.md`](../../docs/MICRO_DRAINAGE_PIPELINE.md) for micro-drain CV tuning options.
