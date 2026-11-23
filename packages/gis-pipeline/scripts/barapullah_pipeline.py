"""Config-driven geospatial hydrology pipeline.

Outputs real, zero-mock layers from bare-earth DEM + ESA WorldCover + OpenStreetMap:
  1. {slug}_waterlogging_zones.geojson : Organic 30m flood-pooling contour polygons with real telemetry
  2. {slug}_drains.geojson             : Real OSM stormwater drains & nallahs
  3. {slug}_parks.geojson              : Real public parks & waterbodies (>=0.25 ha) for NbS
  4. {slug}_underpasses.geojson        : Real OSM layer=-1 road underpass dip points
  5. {slug}_h3_scores.parquet          : H3 Res-9 summary table (kept for compatibility & analytics)
"""

import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
import osmnx as ox
import rasterio
from rasterio.features import rasterize, shapes
from rasterio.warp import reproject, Resampling
from rasterstats import zonal_stats
from scipy.ndimage import distance_transform_edt, gaussian_filter
from shapely.geometry import box, Polygon, shape
import h3
import whitebox

CRS_WGS84 = "EPSG:4326"


def minmax_series(series: pd.Series) -> pd.Series:
    s = series.fillna(series.median())
    lo, hi = s.quantile(0.02), s.quantile(0.98)
    if hi - lo == 0:
        return pd.Series(0.0, index=series.index)
    return ((s.clip(lo, hi) - lo) / (hi - lo)).clip(0.0, 1.0)


def minmax_array(arr: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    out = np.zeros_like(arr, dtype="float32")
    vals = arr[valid_mask]
    if vals.size == 0:
        return out
    lo, hi = np.percentile(vals, 2), np.percentile(vals, 98)
    if hi - lo <= 1e-6:
        return out
    out[valid_mask] = np.clip((vals - lo) / (hi - lo), 0.0, 1.0)
    return out


def fetch_osm_layer(bbox: tuple[float, float, float, float], tags: dict, geom_types: tuple[str, ...], crs_utm: str) -> gpd.GeoDataFrame:
    try:
        gdf = ox.features_from_bbox(bbox=bbox, tags=tags)
    except Exception:
        return gpd.GeoDataFrame(geometry=[], crs=crs_utm)
    if gdf.empty:
        return gpd.GeoDataFrame(geometry=[], crs=crs_utm)
    gdf = gdf[gdf.geometry.geom_type.isin(geom_types)].copy()
    return gdf.to_crs(crs_utm).reset_index(drop=True)


def clip_and_reproject_raster(
    src_path: Path, dst_path: Path, bbox: tuple[float, float, float, float], crs_utm: str, res_m: float, resampling: Resampling
) -> None:
    aoi_utm = gpd.GeoSeries([box(*bbox)], crs=CRS_WGS84).to_crs(crs_utm)
    minx, miny, maxx, maxy = aoi_utm.total_bounds

    with rasterio.open(src_path) as src:
        width = int(np.ceil((maxx - minx) / res_m))
        height = int(np.ceil((maxy - miny) / res_m))
        transform = rasterio.transform.from_origin(minx, maxy, res_m, res_m)

        profile = src.profile.copy()
        is_float = np.issubdtype(np.dtype(src.dtypes[0]), np.floating)
        nodata = -9999.0 if is_float else 0
        profile.update({
            "crs": crs_utm,
            "transform": transform,
            "width": width,
            "height": height,
            "nodata": nodata,
        })

        with rasterio.open(dst_path, "w", **profile) as dst:
            reproject(
                source=rasterio.band(src, 1),
                destination=rasterio.band(dst, 1),
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=crs_utm,
                resampling=resampling,
                dst_nodata=nodata,
            )


def burn_drains_into_dem(dem_path: Path, drains_gdf: gpd.GeoDataFrame, out_path: Path, burn_depth_m: float) -> None:
    with rasterio.open(dem_path) as src:
        dem = src.read(1).astype("float32")
        profile = src.profile.copy()
        nodata = src.nodata

        if not drains_gdf.empty:
            buffered = drains_gdf.geometry.buffer(15.0)
            drain_mask = rasterize(
                [(geom, 1) for geom in buffered if not geom.is_empty],
                out_shape=(src.height, src.width),
                transform=src.transform,
                fill=0,
                dtype="uint8",
            )
            valid = dem != nodata
            dem = np.where((drain_mask == 1) & valid, dem - burn_depth_m, dem)

        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(dem, 1)


def run_whitebox_hydrology(raw_dem: Path, burned_dem: Path, work_dir: Path) -> tuple[Path, Path]:
    wbt = whitebox.WhiteboxTools()
    wbt.set_max_procs(1)
    wbt.set_verbose_mode(False)
    wbt.set_working_dir(str(work_dir.resolve()))

    sink_depth = work_dir / "sink_depth.tif"
    conditioned = work_dir / "dem_conditioned.tif"
    slope_deg = work_dir / "slope_deg.tif"
    sca = work_dir / "sca.tif"
    twi = work_dir / "twi.tif"

    wbt.depth_in_sink(str(raw_dem.resolve()), str(sink_depth.resolve()))
    wbt.breach_depressions_least_cost(str(burned_dem.resolve()), str(conditioned.resolve()), dist=50, fill=True)
    wbt.slope(str(conditioned.resolve()), str(slope_deg.resolve()), units="degrees")
    wbt.d8_flow_accumulation(str(conditioned.resolve()), str(sca.resolve()), out_type="specific contributing area")
    wbt.wetness_index(str(sca.resolve()), str(slope_deg.resolve()), str(twi.resolve()))
    return sink_depth, twi


def extract_organic_waterlogging_zones(
    twi_tif: Path,
    sink_tif: Path,
    lc_utm: Path,
    drains: gpd.GeoDataFrame,
    underpasses: gpd.GeoDataFrame,
    arterials: gpd.GeoDataFrame,
    parks_valid: gpd.GeoDataFrame,
    bbox: tuple[float, float, float, float],
    crs_utm: str,
    weights: dict,
    storm_base: float,
) -> gpd.GeoDataFrame:
    """Build a continuous 30m flood-risk surface and polygonize smooth organic waterlogging zones."""
    with rasterio.open(twi_tif) as src_twi, rasterio.open(sink_tif) as src_sink:
        twi = src_twi.read(1).astype("float32")
        sink = src_sink.read(1).astype("float32")
        transform = src_twi.transform
        h, w = src_twi.height, src_twi.width
        valid = (twi != src_twi.nodata) & np.isfinite(twi)

        # Resample 10m WorldCover built-up (class 50) to 30m impervious fraction
        imp_30m = np.zeros((h, w), dtype="float32")
        with rasterio.open(lc_utm) as src_lc:
            lc_raw = src_lc.read(1)
            built_bin = (lc_raw == 50).astype("float32")
            reproject(
                source=built_bin,
                destination=imp_30m,
                src_transform=src_lc.transform,
                src_crs=src_lc.crs,
                dst_transform=transform,
                dst_crs=crs_utm,
                resampling=Resampling.average,
            )

        # Rasterize drains -> Euclidean distance to nearest drain in meters
        if not drains.empty:
            drain_mask = rasterize(
                [(g.buffer(15.0), 1) for g in drains.geometry if not g.is_empty],
                out_shape=(h, w),
                transform=transform,
                fill=0,
                dtype="uint8",
            )
            drain_dist_m = distance_transform_edt(drain_mask == 0) * 30.0
        else:
            drain_dist_m = np.full((h, w), 500.0, dtype="float32")

        # Rasterize underpass dip traps (90m radius)
        if not underpasses.empty:
            up_mask = rasterize(
                [(g.buffer(90.0), 1) for g in underpasses.geometry if not g.is_empty],
                out_shape=(h, w),
                transform=transform,
                fill=0,
                dtype="uint8",
            ).astype("float32")
        else:
            up_mask = np.zeros((h, w), dtype="float32")

        twi_n = minmax_array(twi, valid)
        sink_clean = np.where((sink != src_sink.nodata) & np.isfinite(sink) & (sink > 0), sink, 0.0)
        sink_n = minmax_array(sink_clean, valid)
        trap_n = np.clip(0.55 * sink_n + 0.45 * up_mask, 0.0, 1.0)
        drain_def_n = minmax_array(drain_dist_m, valid)
        runoff_n = np.clip(imp_30m, 0.0, 1.0)

        pixel_wsi = (
            weights["twi"] * twi_n
            + weights["trap"] * trap_n
            + weights["runoff"] * runoff_n
            + weights["drain_deficit"] * drain_def_n
            + weights["storm_load"] * storm_base
        )
        # Mild Gaussian smoothing turns blocky 30m cells into natural organic waterlogging contours
        pixel_wsi = gaussian_filter(np.where(valid, pixel_wsi, 0.0), sigma=1.15)

        # Clip contour extraction to the exact study bounding box
        aoi_utm = gpd.GeoSeries([box(*bbox)], crs=CRS_WGS84).to_crs(crs_utm).iloc[0]

        # Extract 3 nested flood severity tiers (outer pooling -> high -> critical core)
        bands = [
            ("Moderate", 0.44),
            ("High", 0.54),
            ("Critical", 0.64),
        ]
        records = []
        zone_idx = 1
        for band_tier, thresh in bands:
            mask = (pixel_wsi >= thresh).astype("uint8")
            for geom_dict, val in shapes(mask, mask=(mask == 1), transform=transform):
                if val != 1:
                    continue
                poly = shape(geom_dict).intersection(aoi_utm)
                if poly.is_empty or poly.area < 2200.0:  # Drop tiny <0.22 ha noise specks
                    continue
                # Organic contour smoothing (buffer out + in + simplify)
                smooth = poly.buffer(16.0).buffer(-11.0).simplify(6.0, preserve_topology=True)
                if smooth.is_empty or smooth.area < 1800.0:
                    continue
                records.append({
                    "zone_id": f"Z-{zone_idx:03d}",
                    "contour_band": band_tier,
                    "area_ha": round(smooth.area / 10000.0, 2),
                    "geometry": smooth,
                })
                zone_idx += 1

    if not records:
        return gpd.GeoDataFrame(geometry=[], crs=crs_utm)

    zones = gpd.GeoDataFrame(records, crs=crs_utm)

    # Compute exact real zonal telemetry for each organic waterlogging polygon
    twi_s = zonal_stats(zones, str(twi_tif), stats=["percentile_90"], nodata=-9999.0)
    sink_s = zonal_stats(zones, str(sink_tif), stats=["max"], nodata=-9999.0)
    lc_s = zonal_stats(zones, str(lc_utm), categorical=True, nodata=0)

    zones["twi_p90"] = [round(float(s["percentile_90"]), 2) if s["percentile_90"] is not None else 0.0 for s in twi_s]
    zones["sink_max_m"] = [round(float(s["max"]), 2) if s["max"] is not None else 0.0 for s in sink_s]
    zones["impervious_pct"] = [
        round(100.0 * d.get(50, 0) / max(sum(d.values()), 1), 1) if d else 0.0 for d in lc_s
    ]

    centroids = zones.geometry.centroid
    zones["nearest_drain_m"] = centroids.distance(drains.geometry.union_all()).round(1) if not drains.empty else 500.0
    zones["underpass_trap"] = (zones.geometry.distance(underpasses.geometry.union_all()) <= 90.0) if not underpasses.empty else False

    if not arterials.empty:
        art_clip = gpd.overlay(arterials[["geometry"]], zones[["zone_id", "geometry"]], how="intersection")
        art_len = art_clip.groupby("zone_id").geometry.apply(lambda g: g.length.sum())
        zones["arterial_road_m"] = zones["zone_id"].map(art_len).fillna(0.0).round(1)
    else:
        zones["arterial_road_m"] = 0.0

    if not parks_valid.empty:
        nearest_park = gpd.sjoin_nearest(
            zones[["zone_id", "geometry"]],
            parks_valid[["park_name", "park_area_sqm", "geometry"]],
            how="left",
            distance_col="nearest_park_m",
        ).drop_duplicates(subset=["zone_id"])
        zones = zones.merge(nearest_park[["zone_id", "park_name", "park_area_sqm", "nearest_park_m"]], on="zone_id", how="left")
        zones["nearest_park_m"] = zones["nearest_park_m"].fillna(999.0).round(1)
    else:
        zones["park_name"] = "None mapped"
        zones["park_area_sqm"] = 0.0
        zones["nearest_park_m"] = 999.0

    # Store normalized components so FastAPI simulates live storms/NbS consistently
    zones["twi_n"] = minmax_series(zones["twi_p90"]).round(4)
    zones["trap_n"] = (0.55 * minmax_series(zones["sink_max_m"]) + 0.45 * zones["underpass_trap"].astype(float)).clip(0, 1).round(4)
    zones["drain_def_n"] = minmax_series(zones["nearest_drain_m"]).round(4)
    zones["exposure_n"] = minmax_series(zones["arterial_road_m"]).round(4)
    zones["nbs_feas_n"] = (1.0 - minmax_series(zones["nearest_park_m"])).clip(0, 1).round(4)

    # Boost core contour bands slightly to preserve natural nested visual hierarchy
    band_offset = zones["contour_band"].map({"Moderate": 0.0, "High": 0.08, "Critical": 0.16}).fillna(0.0)
    runoff_n = (zones["impervious_pct"] / 100.0).clip(0, 1)
    zones["base_wsi"] = (
        weights["twi"] * zones["twi_n"]
        + weights["trap"] * zones["trap_n"]
        + weights["runoff"] * runoff_n
        + weights["drain_deficit"] * zones["drain_def_n"]
        + weights["storm_load"] * storm_base
        + band_offset
    ).clip(0.0, 1.0).round(3)

    zones["impact_n"] = (0.55 * zones["exposure_n"] + 0.25 * zones["nbs_feas_n"] + 0.20 * 0.5).clip(0, 1).round(4)
    zones["base_ips"] = np.sqrt(zones["base_wsi"] * zones["impact_n"]).clip(0.0, 1.0).round(3)
    return zones


def build_h3_grid(bbox: tuple[float, float, float, float], h3_res: int, crs_utm: str) -> gpd.GeoDataFrame:
    aoi_poly = box(*bbox)
    cells = sorted(h3.geo_to_cells(aoi_poly, res=h3_res))
    geoms = [Polygon([(lon, lat) for lat, lon in h3.cell_to_boundary(c)]) for c in cells]
    return gpd.GeoDataFrame({"h3_id": cells}, geometry=geoms, crs=CRS_WGS84).to_crs(crs_utm)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    slug = cfg["slug"]
    bbox = tuple(cfg["bbox_wgs84"])
    buf = float(cfg["buffer_deg"])
    bbox_buf = (bbox[0] - buf, bbox[1] - buf, bbox[2] + buf, bbox[3] + buf)
    crs_utm = cfg["crs_utm"]
    h3_res = int(cfg["h3_resolution"])
    burn_depth = float(cfg["burn_depth_m"])
    weights = cfg["weights_wsi"]
    storm_base = float(cfg["storm_base_scalar"])

    raw_dir = Path("data/raw")
    work_dir = Path("data/work") / slug
    out_dir = Path("data/out")
    work_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    dem_src = raw_dir / cfg["rasters"]["dem_filename"]
    if not dem_src.exists() and cfg["rasters"].get("dem_fallback_filename"):
        dem_src = raw_dir / cfg["rasters"]["dem_fallback_filename"]
    wc_src = raw_dir / cfg["rasters"]["worldcover_filename"]
    if not dem_src.exists() or not wc_src.exists():
        raise FileNotFoundError(
            f"Missing rasters in {raw_dir}. Run `uv run python scripts/fetch_rasters.py --config {args.config}` first."
        )

    print("1/7 Fetching OSM drains, underpasses, parks & arterials...")
    drains = fetch_osm_layer(bbox_buf, {"waterway": ["drain", "canal", "ditch", "stream", "river"]}, ("LineString", "MultiLineString"), crs_utm)
    underpasses = fetch_osm_layer(bbox, {"tunnel": ["yes", "underpass"], "layer": ["-1", "-2"]}, ("LineString", "MultiLineString", "Point"), crs_utm)
    parks = fetch_osm_layer(bbox, {"leisure": ["park", "garden"], "natural": ["water"]}, ("Polygon", "MultiPolygon"), crs_utm)
    arterials = fetch_osm_layer(bbox, {"highway": ["primary", "secondary", "trunk", "motorway"]}, ("LineString", "MultiLineString"), crs_utm)

    if not drains.empty:
        drains_wgs = drains.to_crs(CRS_WGS84)
        keep_cols = [c for c in ("name", "waterway", "geometry") if c in drains_wgs.columns]
        drains_wgs[keep_cols].clip(box(*bbox)).to_file(out_dir / f"{slug}_drains.geojson", driver="GeoJSON")

    parks_valid = parks[parks.geometry.area >= 2500].copy()
    if not parks_valid.empty:
        parks_valid["park_name"] = parks_valid.get("name", "Public Park").fillna("Public Park")
        parks_valid["park_area_sqm"] = parks_valid.geometry.area.round(0)
        parks_valid[["park_name", "park_area_sqm", "geometry"]].to_crs(CRS_WGS84).to_file(
            out_dir / f"{slug}_parks.geojson", driver="GeoJSON"
        )

    if not underpasses.empty:
        up_pts = underpasses.copy()
        up_pts["name"] = up_pts.get("name", "Road Underpass Dip").fillna("Road Underpass Dip")
        up_pts["geometry"] = up_pts.geometry.centroid
        up_pts[["name", "geometry"]].to_crs(CRS_WGS84).to_file(
            out_dir / f"{slug}_underpasses.geojson", driver="GeoJSON"
        )

    print("2/7 Reprojecting DEM (30m) and ESA WorldCover (10m) on buffered grid...")
    dem_utm = work_dir / "dem_utm.tif"
    lc_utm = work_dir / "worldcover_utm.tif"
    clip_and_reproject_raster(dem_src, dem_utm, bbox_buf, crs_utm, 30.0, Resampling.bilinear)
    clip_and_reproject_raster(wc_src, lc_utm, bbox_buf, crs_utm, 10.0, Resampling.nearest)

    print("3/7 Stream-burning drains & running WhiteboxTools hydrology...")
    dem_burned = work_dir / "dem_burned.tif"
    burn_drains_into_dem(dem_utm, drains, dem_burned, burn_depth)
    sink_tif, twi_tif = run_whitebox_hydrology(dem_utm, dem_burned, work_dir)

    print("4/7 Extracting organic 30m waterlogging contour polygons...")
    zones = extract_organic_waterlogging_zones(
        twi_tif, sink_tif, lc_utm, drains, underpasses, arterials, parks_valid, bbox, crs_utm, weights, storm_base
    )
    if not zones.empty:
        zones.to_crs(CRS_WGS84).to_file(out_dir / f"{slug}_waterlogging_zones.geojson", driver="GeoJSON")
        print(f"    -> Exported {len(zones)} organic waterlogging polygons to {out_dir}/{slug}_waterlogging_zones.geojson")

    print("5/7 Generating H3 Res-9 summary grid (for backward-compatible analytics)...")
    hexes = build_h3_grid(bbox, h3_res, crs_utm)
    twi_stats = zonal_stats(hexes, str(twi_tif), stats=["percentile_90"], nodata=-9999.0)
    sink_stats = zonal_stats(hexes, str(sink_tif), stats=["max"], nodata=-9999.0)
    lc_stats = zonal_stats(hexes, str(lc_utm), categorical=True, nodata=0)

    hexes["twi_p90"] = [s["percentile_90"] if s["percentile_90"] is not None else 0.0 for s in twi_stats]
    hexes["sink_max_m"] = [s["max"] if s["max"] is not None else 0.0 for s in sink_stats]
    hexes["impervious_pct"] = [
        round(100.0 * d.get(50, 0) / max(sum(d.values()), 1), 1) if d else 0.0 for d in lc_stats
    ]

    print("6/7 Computing H3 proximity & NbS park candidates...")
    centroids = hexes.geometry.centroid
    hexes["nearest_drain_m"] = centroids.distance(drains.geometry.union_all()).round(1) if not drains.empty else 500.0
    hexes["underpass_trap"] = (centroids.distance(underpasses.geometry.union_all()) <= 100.0) if not underpasses.empty else False

    if not arterials.empty:
        art_clip = gpd.overlay(arterials[["geometry"]], hexes[["h3_id", "geometry"]], how="intersection")
        art_len = art_clip.groupby("h3_id").geometry.apply(lambda g: g.length.sum())
        hexes["arterial_road_m"] = hexes["h3_id"].map(art_len).fillna(0.0).round(1)
    else:
        hexes["arterial_road_m"] = 0.0

    if not parks_valid.empty:
        nearest_park = gpd.sjoin_nearest(
            hexes[["h3_id", "geometry"]],
            parks_valid[["park_name", "park_area_sqm", "geometry"]],
            how="left",
            distance_col="nearest_park_m",
        ).drop_duplicates(subset=["h3_id"])
        hexes = hexes.merge(nearest_park[["h3_id", "park_name", "park_area_sqm", "nearest_park_m"]], on="h3_id", how="left")
    else:
        hexes["park_name"] = "None mapped"
        hexes["park_area_sqm"] = 0.0
        hexes["nearest_park_m"] = 999.0

    print("7/7 Scoring H3 table & exporting Parquet/GeoJSON...")
    twi_n = minmax_series(hexes["twi_p90"])
    trap_n = (0.5 * minmax_series(hexes["sink_max_m"]) + 0.5 * hexes["underpass_trap"].astype(float)).clip(0, 1)
    runoff_n = (hexes["impervious_pct"] / 100.0).clip(0, 1)
    drain_def_n = minmax_series(hexes["nearest_drain_m"])

    hexes["wsi_score"] = (
        weights["twi"] * twi_n + weights["trap"] * trap_n + weights["runoff"] * runoff_n + weights["drain_deficit"] * drain_def_n + weights["storm_load"] * storm_base
    ).clip(0.0, 1.0).round(3)

    exposure_n = minmax_series(hexes["arterial_road_m"])
    nbs_feas_n = (1.0 - minmax_series(hexes["nearest_park_m"])).clip(0, 1)
    impact = (0.55 * exposure_n + 0.25 * nbs_feas_n + 0.20 * 0.5).clip(0, 1)
    hexes["ips_score"] = np.sqrt(hexes["wsi_score"] * impact).clip(0.0, 1.0).round(3)

    out_wgs = hexes.to_crs(CRS_WGS84)
    out_wgs.to_parquet(out_dir / f"{slug}_h3_scores.parquet", index=False)
    out_wgs.to_file(out_dir / f"{slug}_h3_scores.geojson", driver="GeoJSON")
    print(f"Done. Exported organic zones + {len(out_wgs)} H3 cells to {out_dir}/")


if __name__ == "__main__":
    main()
