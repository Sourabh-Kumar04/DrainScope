"""Extract real OSM road centerlines in the catchment and orient each segment downhill using the 30m DEM.

Outputs: data/out/{slug}_road_flow.geojson
Each LineString feature carries `kind: "road"` and `timestamps` (0..100) for animated road-surface water flow.
"""

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path
import numpy as np
import rasterio
from pyproj import Transformer

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def fetch_osm_roads(bbox: list[float]) -> list[dict]:
    min_lon, min_lat, max_lon, max_lat = bbox
    query = f"""
    [out:json][timeout:45];
    (
      way["highway"~"^(trunk|primary|secondary|tertiary|trunk_link|primary_link|secondary_link)$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out geom;
    """
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "DrainScope/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("elements", [])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    parser.add_argument("--max-roads", type=int, default=650)
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    slug = cfg["slug"]
    bbox = cfg.get("bbox_wgs84", [77.175, 28.515, 77.275, 28.595])
    raw_dir = Path("data/raw").resolve()
    out_dir = Path("data/out").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    dem_src = raw_dir / cfg["rasters"]["dem_filename"]
    if not dem_src.exists() and cfg["rasters"].get("dem_fallback_filename"):
        dem_src = raw_dir / cfg["rasters"]["dem_fallback_filename"]

    print(f"Fetching OSM arterial & collector roads for {slug} ({bbox})...")
    elements = fetch_osm_roads(bbox)
    print(f"Fetched {len(elements)} OSM road ways. Orienting downhill with DEM...")

    dem_dataset = rasterio.open(dem_src) if dem_src.exists() else None
    to_dem = (
        Transformer.from_crs("EPSG:4326", dem_dataset.crs, always_xy=True)
        if dem_dataset and dem_dataset.crs and not dem_dataset.crs.is_geographic
        else None
    )

    def sample_elev(lon: float, lat: float) -> float:
        if dem_dataset is None:
            # Fallback regional slope toward Yamuna (east-northeast)
            return -lon * 100.0 + lat * 20.0
        x, y = to_dem.transform(lon, lat) if to_dem else (lon, lat)
        try:
            val = next(dem_dataset.sample([(x, y)]))[0]
            return float(val) if np.isfinite(val) else 215.0
        except Exception:
            return 215.0

    features = []
    for el in elements:
        if len(features) >= args.max_roads:
            break
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue

        coords = [[round(float(pt["lon"]), 6), round(float(pt["lat"]), 6)] for pt in geom]
        # Downsample very dense polylines for smooth 30fps browser animation
        if len(coords) > 20:
            step = max(1, len(coords) // 18)
            sampled = coords[::step]
            if sampled[-1] != coords[-1]:
                sampled.append(coords[-1])
            coords = sampled

        e_start = sample_elev(coords[0][0], coords[0][1])
        e_end = sample_elev(coords[-1][0], coords[-1][1])
        if e_end > e_start:
            coords.reverse()
            e_start, e_end = e_end, e_start

        drop = max(0.0, e_start - e_end)
        hw = (el.get("tags") or {}).get("highway", "tertiary")
        base_int = 0.95 if "trunk" in hw or "primary" in hw else 0.75
        intensity = round(min(1.0, max(0.45, base_int * (0.7 + min(0.3, drop / 5.0)))), 3)

        n = len(coords)
        timestamps = [round(100.0 * i / (n - 1), 2) for i in range(n)]
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "id": f"RD-{len(features) + 1:03d}",
                "kind": "road",
                "highway": hw,
                "name": (el.get("tags") or {}).get("name", ""),
                "intensity": intensity,
                "timestamps": timestamps,
            },
        })

    if dem_dataset is not None:
        dem_dataset.close()

    out_path = out_dir / f"{slug}_road_flow.geojson"
    out_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    print(f"Extracted {len(features)} downhill road water-flow paths -> {out_path}")


if __name__ == "__main__":
    main()
