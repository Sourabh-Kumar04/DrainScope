"""Stream and clip commercial-safe Copernicus GLO-30 (30m) and ESA WorldCover (10m) rasters from public AWS S3.

Note on DEM licensing:
  - Copernicus GLO-30 (default): Open commercial license, safe for multi-tenant SaaS.
  - FABDEM v1-2: CC BY-NC-SA 4.0 (non-commercial research only unless commercially licensed from Fathom).
"""

import argparse
import json
from pathlib import Path
import rasterio
from rasterio.windows import from_bounds


def clip_remote_cog(src_url: str, dst_path: Path, bbox_buf: tuple[float, float, float, float]) -> None:
    if dst_path.exists():
        print(f"[OK] Already present: {dst_path}")
        return
    print(f"[DL] Streaming clipped window -> {dst_path.name} ...")
    with rasterio.Env(AWS_NO_SIGN_REQUEST="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(src_url) as src:
            window = from_bounds(*bbox_buf, transform=src.transform).round_offsets().round_lengths()
            data = src.read(1, window=window)
            profile = src.profile.copy()
            profile.update({
                "height": data.shape[0],
                "width": data.shape[1],
                "transform": src.window_transform(window),
                "compress": "deflate",
            })
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            with rasterio.open(dst_path, "w", **profile) as dst:
                dst.write(data, 1)
    print(f"[OK] Saved {dst_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    bbox = tuple(cfg["bbox_wgs84"])
    buf = float(cfg["buffer_deg"])
    bbox_buf = (bbox[0] - buf, bbox[1] - buf, bbox[2] + buf, bbox[3] + buf)
    raw_dir = Path("data/raw")
    raw_dir.mkdir(parents=True, exist_ok=True)

    rasters = cfg["rasters"]
    clip_remote_cog(rasters["worldcover_s3_url"], raw_dir / rasters["worldcover_filename"], bbox_buf)
    clip_remote_cog(rasters["copernicus_s3_url"], raw_dir / rasters["dem_filename"], bbox_buf)


if __name__ == "__main__":
    main()
