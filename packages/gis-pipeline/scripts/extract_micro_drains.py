"""Offline Street-Level Micro-Drainage & Clog Mapper (RTX 3050 / Kaggle T4 Batch Pipeline).

Scans Mapillary street imagery along South Delhi corridors (or a local dashcam folder),
runs zero-shot open-vocabulary detection (Grounding-DINO-Tiny) + monocular depth
(Depth-Anything-V2-Small) to:
  1. Detect unmapped kerbside storm grates, drainage inlets, manhole covers, and clogged gutters.
  2. Estimate roadside condition (`clear`, `silted`, `blocked`).
  3. Project each detection from camera GPS + compass_angle + depth onto approximate curb GPS.
  4. Deduplicate multi-frame sightings and export `data/out/{slug}_micro_drains.geojson`
     for zero-GPU CPU serving in FastAPI + MapLibre.

Usage (from packages/gis-pipeline):
  uv run python scripts/extract_micro_drains.py --config configs/barapullah.json --corridor all --max-images 120
"""

from __future__ import annotations

import argparse
import inspect
import io
import json
import math
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# Confirmed South Delhi Barapullah waterlogging corridors [min_lon, min_lat, max_lon, max_lat]
CORRIDOR_PRESETS: dict[str, tuple[str, list[float]]] = {
    "moolchand": ("Moolchand - Lajpat Nagar", [77.2280, 28.5590, 77.2430, 28.5700]),
    "chirag_delhi": ("Chirag Delhi - Nehru Place", [77.2220, 28.5360, 77.2540, 28.5520]),
    "defence_colony": ("Defence Colony - Andrews Ganj", [77.2240, 28.5630, 77.2390, 28.5760]),
    "aiims": ("AIIMS - South Extension", [77.2060, 28.5640, 77.2240, 28.5730]),
}

DETECTION_PROMPT = (
    "storm drain grate. drainage grate. roadside gutter. "
    "clogged drain. manhole cover. flooded road puddle."
)


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def project_gps(lon: float, lat: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
    """Offset a WGS84 point by distance (m) along compass bearing (deg clockwise from north)."""
    rad = math.radians(bearing_deg)
    d_north = dist_m * math.cos(rad)
    d_east = dist_m * math.sin(rad)
    d_lat = d_north / 111320.0
    d_lon = d_east / (111320.0 * max(0.2, math.cos(math.radians(lat))))
    return round(lon + d_lon, 6), round(lat + d_lat, 6)


def resolve_mapillary_token(cli_token: str | None) -> str:
    if cli_token and cli_token.strip():
        return cli_token.strip()
    for key in ("MAPILLARY_TOKEN", "NEXT_PUBLIC_MAPILLARY_TOKEN"):
        val = os.environ.get(key, "").strip()
        if val:
            return val

    # Auto-read from apps/web/.env.local if present in the monorepo
    candidates = [
        Path("../../apps/web/.env.local"),
        Path("apps/web/.env.local"),
        Path(".env.local"),
        Path(".env"),
    ]
    for env_path in candidates:
        if env_path.exists():
            text = env_path.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"^(?:NEXT_PUBLIC_)?MAPILLARY_TOKEN\s*=\s*[\"\']?([^\s\"\']+)[\"\']?", text, re.M)
            if m:
                return m.group(1).strip()

    raise SystemExit(
        "Mapillary token not found. Pass --token MLY|... or ensure NEXT_PUBLIC_MAPILLARY_TOKEN is set in apps/web/.env.local."
    )


def fetch_corridor_images(
    bbox: list[float],
    token: str,
    max_images: int,
    min_spacing_m: float = 22.0,
) -> list[dict[str, Any]]:
    min_lon, min_lat, max_lon, max_lat = bbox
    bbox_str = f"{min_lon:.6f},{min_lat:.6f},{max_lon:.6f},{max_lat:.6f}"
    url = (
        "https://graph.mapillary.com/images"
        f"?access_token={urllib.parse.quote(token)}"
        "&fields=id,geometry,compass_angle,captured_at,is_pano,thumb_1024_url"
        f"&bbox={bbox_str}&limit=400"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "DrainScope-MicroDrainMapper/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    raw_items = payload.get("data") or []
    # Prefer non-360 forward street frames (less lens distortion on road edges) and newer captures
    raw_items.sort(
        key=lambda x: (
            0 if not x.get("is_pano") else 1,
            -(int(x.get("captured_at") or 0)),
        )
    )

    selected: list[dict[str, Any]] = []
    for item in raw_items:
        if len(selected) >= max_images:
            break
        coords = (item.get("geometry") or {}).get("coordinates")
        if not coords or len(coords) < 2 or not item.get("thumb_1024_url"):
            continue
        lon, lat = float(coords[0]), float(coords[1])
        # Spatial thinning so we scan the entire corridor instead of one stuck traffic light
        too_close = any(
            haversine_m(lon, lat, float(s["geometry"]["coordinates"][0]), float(s["geometry"]["coordinates"][1]))
            < min_spacing_m
            for s in selected
        )
        if too_close:
            continue
        selected.append(item)
    return selected


def download_image(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "DrainScope-MicroDrainMapper/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = resp.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    max_w = 1024
    if img.width > max_w:
        new_h = int(round(img.height * (max_w / img.width)))
        img = img.resize((max_w, new_h), Image.Resampling.LANCZOS)
    return img


def classify_condition(label: str, crop_rgb: np.ndarray) -> tuple[str, str]:
    """Estimate drain condition (`clear`, `silted`, `blocked`) from label + local surface cues."""
    low = label.lower()
    if any(k in low for k in ("clog", "flood", "puddle", "block")):
        return "blocked", "Standing water or visible blockage at kerbside inlet"

    if crop_rgb.size == 0:
        return "clear", "Mapped kerbside inlet / storm grate"

    # Analyze crop color & contrast: dark wet reflection or heavy muddy/brownish debris vs clean iron grate
    arr = crop_rgb.astype(np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    # Warm earthy/mud/leaf litter signature (R > B significantly)
    brown_ratio = float(np.mean((r - b > 0.08) & (luma > 0.15) & (luma < 0.72)))
    # Very low contrast indicates silt/mud filling in grate slots
    contrast = float(np.std(luma))

    if brown_ratio > 0.28 or contrast < 0.09:
        return "silted", "Potential silt/debris accumulation obscuring grate slots (needs field check)"
    return "clear", "Visible kerbside storm grate / drainage cover"


def load_models(device_pref: str, use_depth: bool):
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor, pipeline

    if device_pref == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device = device_pref

    dtype = torch.float16 if device == "cuda" else torch.float32
    print(f"Loading Grounding-DINO-Tiny on {device.upper()} ({dtype})...")
    det_id = "IDEA-Research/grounding-dino-tiny"
    processor = AutoProcessor.from_pretrained(det_id)
    det_model = AutoModelForZeroShotObjectDetection.from_pretrained(det_id, torch_dtype=dtype).to(device)
    det_model.eval()

    depth_pipe = None
    if use_depth:
        print(f"Loading Depth-Anything-V2-Small on {device.upper()}...")
        depth_pipe = pipeline(
            task="depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=0 if device == "cuda" else -1,
        )

    return device, dtype, processor, det_model, depth_pipe


def postprocess_grounding_dino(processor, outputs, input_ids, target_sizes, box_thresh: float, text_thresh: float):
    """Version-safe wrapper across transformers 4.42 - 5.x parameter renames."""
    fn = processor.post_process_grounded_object_detection
    params = inspect.signature(fn).parameters
    kwargs: dict[str, Any] = {"target_sizes": target_sizes}
    if "threshold" in params:
        kwargs["threshold"] = box_thresh
    elif "box_threshold" in params:
        kwargs["box_threshold"] = box_thresh
    if "text_threshold" in params:
        kwargs["text_threshold"] = text_thresh
    return fn(outputs, input_ids, **kwargs)


def run_detection_on_image(
    img: Image.Image,
    device: str,
    dtype,
    processor,
    det_model,
    depth_pipe,
    box_thresh: float,
    text_thresh: float,
    is_pano: bool,
) -> list[dict[str, Any]]:
    import torch

    w, h = img.size
    # For 360 equirectangular panos, crop the forward-facing perspective slice to avoid polar warp
    crop_offset_x, crop_offset_y = 0, 0
    work_img = img
    if is_pano and w > h * 1.6:
        x0, x1 = int(w * 0.25), int(w * 0.75)
        y0, y1 = int(h * 0.25), int(h * 0.88)
        work_img = img.crop((x0, y0, x1, y1))
        crop_offset_x, crop_offset_y = x0, y0

    ww, wh = work_img.size
    inputs = processor(images=work_img, text=DETECTION_PROMPT, return_tensors="pt")
    inputs = {
        k: (v.to(device=device, dtype=dtype) if v.is_floating_point() else v.to(device))
        for k, v in inputs.items()
    }

    with torch.no_grad():
        outputs = det_model(**inputs)

    results = postprocess_grounding_dino(
        processor,
        outputs,
        inputs["input_ids"],
        target_sizes=[(wh, ww)],
        box_thresh=box_thresh,
        text_thresh=text_thresh,
    )
    res = results[0]
    boxes = res.get("boxes", [])
    scores = res.get("scores", [])
    labels = res.get("text_labels") or res.get("labels") or []

    depth_norm: np.ndarray | None = None
    if depth_pipe is not None and len(boxes) > 0:
        d_out = depth_pipe(work_img)["depth"].resize((ww, wh), Image.Resampling.BILINEAR)
        d_arr = np.asarray(d_out, dtype=np.float32)
        d_lo, d_hi = float(np.percentile(d_arr, 2)), float(np.percentile(d_arr, 98))
        depth_norm = np.clip((d_arr - d_lo) / max(1e-5, d_hi - d_lo), 0.0, 1.0)

    rgb_np = np.asarray(work_img, dtype=np.uint8)
    detections: list[dict[str, Any]] = []

    for box, score, label in zip(boxes, scores, labels):
        bx1, by1, bx2, by2 = [float(v) for v in box.tolist()]
        conf = float(score.item() if hasattr(score, "item") else score)
        lbl = str(label).strip()

        cx_norm = ((bx1 + bx2) * 0.5) / ww
        cy_norm = ((by1 + by2) * 0.5) / wh
        bw_norm = (bx2 - bx1) / ww
        bh_norm = (by2 - by1) / wh

        # Reject detections above the horizon (sky/flyovers/railings) or giant whole-frame boxes
        if cy_norm < 0.48 or bw_norm > 0.65 or bh_norm > 0.45:
            continue

        # Estimate forward distance (3m..16m) from monocular depth (higher depth value = closer)
        if depth_norm is not None:
            ix1, ix2 = max(0, int(bx1)), min(ww, int(bx2))
            iy1, iy2 = max(0, int(by1)), min(wh, int(by2))
            patch_d = float(np.median(depth_norm[iy1:iy2, ix1:ix2])) if (ix2 > ix1 and iy2 > iy1) else 0.5
            est_dist_m = round(3.0 + (1.0 - patch_d) * 13.0, 1)
        else:
            # Perspective fallback from vertical image position
            est_dist_m = round(3.0 + max(0.0, (0.95 - cy_norm) / 0.47) * 12.0, 1)

        # Horizontal FOV ~ 75 deg -> angle offset relative to camera compass heading
        angle_offset_deg = (cx_norm - 0.5) * 75.0

        ix1, ix2 = max(0, int(bx1)), min(ww, int(bx2))
        iy1, iy2 = max(0, int(by1)), min(wh, int(by2))
        crop = rgb_np[iy1:iy2, ix1:ix2]
        condition, note = classify_condition(lbl, crop)

        # Store normalized bbox in FULL original image coordinates so frontend SVG overlay aligns 1:1
        full_bbox = [
            round((bx1 + crop_offset_x) / w, 4),
            round((by1 + crop_offset_y) / h, 4),
            round((bx2 + crop_offset_x) / w, 4),
            round((by2 + crop_offset_y) / h, 4),
        ]

        detections.append({
            "label": lbl,
            "confidence": round(conf, 3),
            "condition": condition,
            "condition_note": note,
            "est_dist_m": est_dist_m,
            "angle_offset_deg": angle_offset_deg,
            "bbox_norm": full_bbox,
        })

    return detections


def deduplicate_detections(raw_features: list[dict[str, Any]], cluster_m: float = 10.0) -> list[dict[str, Any]]:
    """Merge repeat detections from adjacent street frames within `cluster_m` meters."""
    # Highest confidence first
    ordered = sorted(raw_features, key=lambda f: f["properties"]["confidence"], reverse=True)
    kept: list[dict[str, Any]] = []

    for feat in ordered:
        lon, lat = feat["geometry"]["coordinates"]
        matched = None
        for k in kept:
            klon, klat = k["geometry"]["coordinates"]
            if haversine_m(lon, lat, klon, klat) <= cluster_m:
                matched = k
                break
        if matched is not None:
            matched["properties"]["sightings"] += 1
            # Upgrade condition severity if any sighting caught blocking/ponding
            order = {"clear": 0, "silted": 1, "blocked": 2}
            if order[feat["properties"]["condition"]] > order[matched["properties"]["condition"]]:
                matched["properties"]["condition"] = feat["properties"]["condition"]
                matched["properties"]["condition_note"] = feat["properties"]["condition_note"]
        else:
            feat["properties"]["sightings"] = 1
            kept.append(feat)

    for idx, feat in enumerate(kept, start=1):
        feat["properties"]["id"] = f"MD-{idx:03d}"
    return kept


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan South Delhi Mapillary imagery for micro-drains & clogs.")
    parser.add_argument("--config", type=Path, default=Path("configs/barapullah.json"))
    parser.add_argument(
        "--corridor",
        type=str,
        default="all",
        choices=["all", *CORRIDOR_PRESETS.keys()],
        help="South Delhi corridor preset to scan (default: all 4 hotspots).",
    )
    parser.add_argument("--bbox", type=str, default=None, help="Optional custom bbox: min_lon,min_lat,max_lon,max_lat")
    parser.add_argument("--max-images", type=int, default=80, help="Total Mapillary frames to process (default: 80)")
    parser.add_argument("--box-threshold", type=float, default=0.26, help="Grounding-DINO box confidence threshold")
    parser.add_argument("--text-threshold", type=float, default=0.22, help="Grounding-DINO text match threshold")
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--no-depth", action="store_true", help="Skip Depth-Anything-V2 and use perspective geometry")
    parser.add_argument("--token", type=str, default=None, help="Mapillary access token (auto-reads apps/web/.env.local)")
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    slug = cfg["slug"]
    out_dir = Path("data/out").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    token = resolve_mapillary_token(args.token)

    if args.bbox:
        parts = [float(x.strip()) for x in args.bbox.split(",")]
        if len(parts) != 4:
            raise SystemExit("--bbox must be 4 comma-separated floats: min_lon,min_lat,max_lon,max_lat")
        corridors = [("Custom Corridor", parts)]
    elif args.corridor == "all":
        corridors = list(CORRIDOR_PRESETS.values())
    else:
        corridors = [CORRIDOR_PRESETS[args.corridor]]

    per_corridor = max(10, args.max_images // len(corridors))
    queue: list[tuple[str, dict[str, Any]]] = []
    for cname, bbox in corridors:
        print(f"Querying Mapillary imagery for {cname} ({bbox})...")
        imgs = fetch_corridor_images(bbox, token, max_images=per_corridor)
        print(f"  -> Selected {len(imgs)} spatially thinned street frames")
        for im in imgs:
            queue.append((cname, im))

    if not queue:
        raise SystemExit("No Mapillary images found in the requested corridor(s). Check your token or bbox.")

    device, dtype, processor, det_model, depth_pipe = load_models(args.device, use_depth=not args.no_depth)

    raw_features: list[dict[str, Any]] = []
    for idx, (cname, item) in enumerate(queue, start=1):
        img_id = str(item["id"])
        thumb_url = str(item["thumb_1024_url"])
        cam_lon, cam_lat = [float(c) for c in item["geometry"]["coordinates"][:2]]
        compass = float(item.get("compass_angle") or 0.0)
        is_pano = bool(item.get("is_pano"))
        captured_ms = item.get("captured_at")
        captured_date = (
            datetime.fromtimestamp(captured_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")
            if captured_ms
            else "Unknown"
        )

        try:
            img = download_image(thumb_url)
            dets = run_detection_on_image(
                img=img,
                device=device,
                dtype=dtype,
                processor=processor,
                det_model=det_model,
                depth_pipe=depth_pipe,
                box_thresh=args.box_threshold,
                text_thresh=args.text_threshold,
                is_pano=is_pano,
            )
        except Exception as exc:
            print(f"  [{idx}/{len(queue)}] Skipping {img_id}: {exc}")
            continue

        if dets:
            print(f"  [{idx}/{len(queue)}] {cname} ({img_id}): found {len(dets)} micro-drain candidate(s)")
        elif idx % 10 == 0 or idx == len(queue):
            print(f"  [{idx}/{len(queue)}] Processed ({len(raw_features)} raw detections so far)...")

        for d in dets:
            bearing = (compass + d["angle_offset_deg"]) % 360.0
            proj_lon, proj_lat = project_gps(cam_lon, cam_lat, bearing, d["est_dist_m"])
            raw_features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [proj_lon, proj_lat]},
                "properties": {
                    "id": "",
                    "corridor": cname,
                    "label": d["label"],
                    "condition": d["condition"],
                    "condition_note": d["condition_note"],
                    "confidence": d["confidence"],
                    "est_dist_m": d["est_dist_m"],
                    "bbox_norm": d["bbox_norm"],
                    "image_id": img_id,
                    "thumb_url": thumb_url,
                    "captured_date": captured_date,
                    "compass_angle": round(compass, 1),
                    "camera_coord": [round(cam_lon, 6), round(cam_lat, 6)],
                    "detector": "Grounding-DINO-Tiny + Depth-Anything-V2-Small"
                    if depth_pipe is not None
                    else "Grounding-DINO-Tiny (Perspective Projection)",
                },
            })

    deduped = deduplicate_detections(raw_features, cluster_m=10.0)
    counts = {"clear": 0, "silted": 0, "blocked": 0}
    for f in deduped:
        counts[f["properties"]["condition"]] = counts.get(f["properties"]["condition"], 0) + 1

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "catchment_slug": slug,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "frames_scanned": len(queue),
            "raw_detections": len(raw_features),
            "unique_micro_drains": len(deduped),
            "condition_counts": counts,
        },
        "features": deduped,
    }

    out_path = out_dir / f"{slug}_micro_drains.geojson"
    out_path.write_text(json.dumps(fc, indent=2), encoding="utf-8")
    print(
        f"\nDone! Scanned {len(queue)} street frames -> {len(deduped)} unique micro-drains "
        f"(clear={counts['clear']}, silted={counts['silted']}, blocked={counts['blocked']})"
    )
    print(f"Saved CPU-ready GeoJSON -> {out_path}")


if __name__ == "__main__":
    main()
