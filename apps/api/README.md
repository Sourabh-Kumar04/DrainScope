# DrainScope API (`apps/api`)

Deterministic FastAPI + DuckDB + Pandas backend serving catchment simulations, site screening, downhill flow paths, 3D terrain patches, and offline CV micro-drainage overlays.

## Local Development

```bash
cd apps/api
uv sync
uv run pytest -v
uv run uvicorn app.main:app --reload --port 8000
```

Interactive OpenAPI docs: `http://localhost:8000/docs`

## CPU-Only Production Deployment

This service **does not require a GPU** or PyTorch in production:
* All heavy DEM hydrology and street-level micro-drain CV detections are precomputed offline in `packages/gis-pipeline/data/out/`.
* `app/services/street_depth.py` automatically falls back to a lightweight NumPy perspective ground-plane estimator if `torch` and `transformers` are not installed.
* Set `DRAINSCOPE_DATA_DIR` if mounting precomputed `.parquet` and `.geojson` artifacts outside the default monorepo path.

## Troubleshooting Port 8000 (WSL2)

```bash
fuser -k 8000/tcp || pkill -f uvicorn
uv run uvicorn app.main:app --reload --port 8000
```
