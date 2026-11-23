"""Validate DrainScope susceptibility outputs against real historical waterlogging incident points.

Computes:
  - ROC-AUC (trapezoidal)
  - PR-AUC (Average Precision)
  - Top-10% and Top-20% Lift (incident capture rate vs random baseline)
  - Hit Rate @ Top-20% susceptibility area

Exports: data/out/{slug}_validation.json (served live by GET /v1/catchments/{slug}/validation).

Usage:
  uv run python scripts/validate_incidents.py \
      --config configs/barapullah.json \
      --incidents data/raw/delhi_waterlogging_incidents.csv \
      --source-name "Delhi Traffic Police Monsoon Waterlogging List"
"""

import argparse
import datetime
import json
from pathlib import Path
import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point, box


def compute_roc_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    order = np.argsort(-y_score)
    y_t = y_true[order]
    n_pos = int(np.sum(y_t == 1))
    n_neg = int(np.sum(y_t == 0))
    if n_pos == 0 or n_neg == 0:
        return 0.0
    tps = np.cumsum(y_t == 1)
    fps = np.cumsum(y_t == 0)
    tpr = np.concatenate(([0.0], tps / n_pos))
    fpr = np.concatenate(([0.0], fps / n_neg))
    return float(np.trapezoid(tpr, fpr))


def compute_pr_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    order = np.argsort(-y_score)
    y_t = y_true[order]
    n_pos = int(np.sum(y_t == 1))
    if n_pos == 0:
        return 0.0
    tps = np.cumsum(y_t == 1)
    ranks = np.arange(1, len(y_t) + 1)
    precision = tps / ranks
    return float(np.sum(precision[y_t == 1]) / n_pos)


def load_incidents(path: Path, bbox: tuple[float, float, float, float]) -> gpd.GeoDataFrame:
    aoi = box(*bbox)
    if path.suffix.lower() in (".geojson", ".json", ".gpkg", ".shp"):
        gdf = gpd.read_file(path).to_crs("EPSG:4326")
        gdf["geometry"] = gdf.geometry.centroid
    else:
        df = pd.read_csv(path)
        cols = {c.lower().strip(): c for c in df.columns}
        lat_col = next((cols[k] for k in ("lat", "latitude", "y") if k in cols), None)
        lon_col = next((cols[k] for k in ("lon", "lng", "longitude", "x") if k in cols), None)
        if not lat_col or not lon_col:
            raise ValueError(f"CSV must contain lat/lon columns. Found: {list(df.columns)}")
        df = df.dropna(subset=[lat_col, lon_col])
        gdf = gpd.GeoDataFrame(
            df,
            geometry=[Point(float(x), float(y)) for x, y in zip(df[lon_col], df[lat_col])],
            crs="EPSG:4326",
        )
    clipped = gdf[gdf.geometry.within(aoi)].copy().reset_index(drop=True)
    return clipped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    parser.add_argument("--incidents", type=Path, required=True, help="CSV or GeoJSON of real waterlogging points")
    parser.add_argument("--source-name", type=str, default="Municipal / Traffic Police Incident Dataset")
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    slug = cfg["slug"]
    bbox = tuple(cfg["bbox_wgs84"])
    out_dir = Path("data/out")
    h3_path = out_dir / f"{slug}_h3_scores.geojson"
    if not h3_path.exists():
        raise FileNotFoundError(f"Missing {h3_path}. Run barapullah_pipeline.py first.")

    cells = gpd.read_file(h3_path).to_crs("EPSG:4326")
    incidents = load_incidents(args.incidents, bbox)
    if len(incidents) < 5:
        raise SystemExit(f"Need at least 5 incidents inside {slug} bbox for meaningful AUC/Lift; found {len(incidents)}.")

    # Spatial join: mark H3 cells containing >= 1 real waterlogging incident
    joined = gpd.sjoin(cells[["h3_id", "wsi_score", "ips_score", "geometry"]], incidents[["geometry"]], how="left", predicate="contains")
    pos_ids = set(joined.dropna(subset=["index_right"])["h3_id"].unique())

    cells["has_incident"] = cells["h3_id"].isin(pos_ids).astype(int)
    y_true = cells["has_incident"].to_numpy()
    y_score = cells["wsi_score"].astype(float).to_numpy()

    roc_auc = round(compute_roc_auc(y_true, y_score), 3)
    pr_auc = round(compute_pr_auc(y_true, y_score), 3)

    n_cells = len(cells)
    n_pos_cells = int(y_true.sum())
    order = np.argsort(-y_score)
    y_sorted = y_true[order]

    top10_n = max(1, int(round(0.10 * n_cells)))
    top20_n = max(1, int(round(0.20 * n_cells)))
    hit_rate_10 = float(y_sorted[:top10_n].sum() / max(n_pos_cells, 1))
    hit_rate_20 = float(y_sorted[:top20_n].sum() / max(n_pos_cells, 1))
    lift_10 = round(hit_rate_10 / 0.10, 2)
    lift_20 = round(hit_rate_20 / 0.20, 2)

    report = {
        "catchment_slug": slug,
        "validated": True,
        "status_label": f"Validated Screening · AUC {roc_auc:.2f} · Top-10% Lift {lift_10:.1f}x",
        "source_name": args.source_name,
        "incident_points_in_aoi": int(len(incidents)),
        "positive_cells": n_pos_cells,
        "total_cells": int(n_cells),
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "lift_top_10_pct": lift_10,
        "lift_top_20_pct": lift_20,
        "hit_rate_top_20_pct": round(100.0 * hit_rate_20, 1),
        "evaluated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "notes": "Evaluated against H3 Res-9 WSI susceptibility scores inside the catchment bounding box.",
    }

    out_path = out_dir / f"{slug}_validation.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Saved validation report -> {out_path}")


if __name__ == "__main__":
    main()
