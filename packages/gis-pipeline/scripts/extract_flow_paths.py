"""Extract real DEM-driven downhill overland flow streamlines using WhiteboxTools D8 flow direction.

Outputs: data/out/{slug}_flow_paths.geojson
Each LineString feature carries `timestamps` (0..100) for Deck.gl TripsLayer 3D water flow animation.
"""

import argparse
import json
import tempfile
from pathlib import Path
import numpy as np
import rasterio
from pyproj import Transformer
from whitebox.whitebox_tools import WhiteboxTools

# WhiteboxTools D8 pointer bitmask -> (d_row, d_col)
D8_OFFSETS = {
    1: (-1, 1),    # NE
    2: (0, 1),     # E
    4: (1, 1),     # SE
    8: (1, 0),     # S
    16: (1, -1),   # SW
    32: (0, -1),   # W
    64: (-1, -1),  # NW
    128: (-1, 0),  # N
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    parser.add_argument("--max-paths", type=int, default=420)
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    slug = cfg["slug"]
    raw_dir = Path("data/raw").resolve()
    out_dir = Path("data/out").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    dem_src = raw_dir / cfg["rasters"]["dem_filename"]
    if not dem_src.exists() and cfg["rasters"].get("dem_fallback_filename"):
        dem_src = raw_dir / cfg["rasters"]["dem_fallback_filename"]
    if not dem_src.exists():
        raise FileNotFoundError(f"DEM not found: {dem_src}. Run fetch_rasters.py first.")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td).resolve()
        dem_uncomp = tmp / "dem_uncompressed.tif"
        breached = tmp / "breached.tif"
        d8_ptr = tmp / "d8_ptr.tif"
        d8_acc = tmp / "d8_acc.tif"

        # Rewrite as uncompressed GeoTIFF so WhiteboxTools reads it reliably
        with rasterio.open(dem_src) as src:
            arr = src.read(1).astype(np.float32)
            nodata = src.nodata if src.nodata is not None else -9999.0
            arr = np.where(np.isfinite(arr), arr, nodata)
            profile = src.profile.copy()
            profile.update(dtype="float32", nodata=nodata, tiled=False)
            profile.pop("compress", None)
            with rasterio.open(dem_uncomp, "w", **profile) as dst:
                dst.write(arr, 1)

        wbt = WhiteboxTools()
        wbt.set_working_dir(str(tmp))
        wbt.set_verbose_mode(False)

        wbt.breach_depressions_least_cost(str(dem_uncomp), str(breached), dist=5)
        if not breached.exists():
            # Fallback to standard depression filling if least-cost breaching fails
            wbt.fill_depressions(str(dem_uncomp), str(breached))
        if not breached.exists():
            raise RuntimeError("WhiteboxTools failed to produce breached.tif from DEM.")

        wbt.d8_pointer(str(breached), str(d8_ptr))
        wbt.d8_flow_accumulation(str(breached), str(d8_acc), out_type="cells")

        if not d8_ptr.exists() or not d8_acc.exists():
            raise RuntimeError("WhiteboxTools failed to generate d8_ptr.tif / d8_acc.tif.")

        with rasterio.open(d8_ptr) as psrc, rasterio.open(d8_acc) as asrc:
            ptr = psrc.read(1)
            acc = asrc.read(1)
            transform = psrc.transform
            crs = psrc.crs

        transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True) if crs and not crs.is_geographic else None
        rows, cols = ptr.shape

        pos_acc = acc[np.isfinite(acc) & (acc > 0)]
        thresh = float(np.nanpercentile(pos_acc, 78)) if pos_acc.size > 0 else 1.0
        valid = np.isfinite(acc) & (acc >= thresh)
        ys, xs = np.where(valid)
        order = np.argsort(-acc[ys, xs])

        features = []
        visited_starts = set()

        for idx in order:
            if len(features) >= args.max_paths:
                break
            r0, c0 = int(ys[idx]), int(xs[idx])
            bucket = (r0 // 5, c0 // 5)
            if bucket in visited_starts:
                continue
            visited_starts.add(bucket)

            r, c = r0, c0
            coords = []
            seen = set()
            for _ in range(45):
                if (r, c) in seen or r < 0 or r >= rows or c < 0 or c >= cols:
                    break
                seen.add((r, c))
                x, y = transform * (c + 0.5, r + 0.5)
                if transformer:
                    x, y = transformer.transform(x, y)
                coords.append([round(float(x), 6), round(float(y), 6)])
                code = int(ptr[r, c])
                if code not in D8_OFFSETS:
                    break
                dr, dc = D8_OFFSETS[code]
                r += dr
                c += dc

            if len(coords) >= 5:
                n = len(coords)
                timestamps = [round(100.0 * i / (n - 1), 2) for i in range(n)]
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "id": f"FP-{len(features) + 1:03d}",
                        "kind": "overland",
                        "intensity": round(float(min(1.0, np.log1p(acc[r0, c0]) / 8.0)), 3),
                        "timestamps": timestamps,
                    },
                })

    out_path = out_dir / f"{slug}_flow_paths.geojson"
    out_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    print(f"Extracted {len(features)} DEM downhill flow paths -> {out_path}")


if __name__ == "__main__":
    main()
