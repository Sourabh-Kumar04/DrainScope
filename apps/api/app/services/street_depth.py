"""Local 3D Depth & Ground-Plane Flood Mask Service for Mapillary Street Photos.

Uses Hugging Face `depth-anything/Depth-Anything-V2-Small-hf` on CUDA (RTX 3050) when available,
falling back cleanly to a fast perspective + edge-based ground-plane estimator if PyTorch/Transformers
are not installed in the API environment.
"""

from __future__ import annotations

import base64
import io
import json
import urllib.parse
import urllib.request
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image

_DEPTH_PIPELINE: Any = None
_DEPTH_LOAD_ATTEMPTED = False
_DEPTH_MODEL_LABEL = "Perspective Ground Heuristic (Fallback)"


def _get_depth_pipeline():
    global _DEPTH_PIPELINE, _DEPTH_LOAD_ATTEMPTED, _DEPTH_MODEL_LABEL
    if _DEPTH_LOAD_ATTEMPTED:
        return _DEPTH_PIPELINE
    _DEPTH_LOAD_ATTEMPTED = True
    try:
        import torch
        from transformers import pipeline

        device = 0 if torch.cuda.is_available() else -1
        _DEPTH_PIPELINE = pipeline(
            task="depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device,
        )
        _DEPTH_MODEL_LABEL = (
            "Depth-Anything-V2-Small (CUDA)" if device == 0 else "Depth-Anything-V2-Small (CPU)"
        )
    except Exception:
        _DEPTH_PIPELINE = None
        _DEPTH_MODEL_LABEL = "Perspective Ground Heuristic (Install torch + transformers for RTX 3050 Depth-Anything-V2)"
    return _DEPTH_PIPELINE


def _fetch_mapillary_image_bytes(image_id: str, access_token: str) -> bytes:
    meta_url = (
        f"https://graph.mapillary.com/{urllib.parse.quote(image_id)}"
        f"?fields=thumb_2048_url,thumb_1024_url&access_token={urllib.parse.quote(access_token)}"
    )
    req = urllib.request.Request(meta_url, headers={"User-Agent": "DrainScope/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        meta = json.loads(resp.read().decode("utf-8"))

    img_url = meta.get("thumb_1024_url") or meta.get("thumb_2048_url")
    if not img_url:
        raise ValueError("Mapillary image URL not found for this image_id.")

    img_req = urllib.request.Request(img_url, headers={"User-Agent": "DrainScope/1.0"})
    with urllib.request.urlopen(img_req, timeout=25) as resp:
        return resp.read()


def _estimate_ground_height_from_depth(depth_arr: np.ndarray) -> np.ndarray:
    """Convert relative monocular depth (higher = closer) into a 0..1 height-above-road map.

    Road asphalt in the lower half follows a smooth vertical depth gradient (close at bottom,
    farther near horizon). Vertical obstacles (pillars, cars, pedestrians, curbs) stick out
    closer than the expected ground plane at their row y, so they get high values (>0.45) and
    occlude the floodwater cleanly.
    """
    h, w = depth_arr.shape
    d = depth_arr.astype(np.float32)
    d_min, d_max = float(np.percentile(d, 2)), float(np.percentile(d, 98))
    if d_max - d_min > 1e-5:
        d = np.clip((d - d_min) / (d_max - d_min), 0.0, 1.0)
    else:
        d = np.zeros_like(d)

    # Fit a robust ground-plane depth profile across the lower 45% of the frame (center road corridor)
    y_coords = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    road_band_start = int(h * 0.56)
    c_left, c_right = int(w * 0.2), int(w * 0.8)

    row_medians = np.median(d[road_band_start:, c_left:c_right], axis=1)
    ys = np.linspace(road_band_start / h, 1.0, len(row_medians), dtype=np.float32)
    # Linear fit: expected_ground_depth(y) = a * y + b
    a, b = np.polyfit(ys, row_medians, 1)
    expected_ground = np.clip(a * y_coords + b, 0.0, 1.0)

    # Obstacles are pixels significantly closer (higher depth value) than expected ground at row y
    protrusion = np.clip((d - expected_ground) * 3.2, 0.0, 1.0)

    # Pixels above the horizon (~upper 52%) are sky/flyover/buildings -> never flooded
    horizon_mask = np.clip((0.56 - y_coords) / 0.14, 0.0, 1.0)

    # Slight vertical elevation gradient so water rises from the bottom/dip toward the horizon
    road_slope = np.clip((0.96 - y_coords) / 0.44, 0.0, 1.0) * 0.42

    height_map = np.clip(np.maximum(horizon_mask, road_slope + protrusion * 0.92), 0.0, 1.0)
    return height_map


def _estimate_ground_height_fallback(rgb: np.ndarray) -> np.ndarray:
    """Fast pure-NumPy fallback when PyTorch is not installed: road color + vertical edge occlusion."""
    h, w, _ = rgb.shape
    gray = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]) / 255.0
    # Horizontal gradient detects vertical edges (pillars, vehicles, pedestrians)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    # High saturation detects colored vehicles (yellow/green auto-rickshaws, red sarees, etc.)
    mx = np.max(rgb, axis=2).astype(np.float32)
    mn = np.min(rgb, axis=2).astype(np.float32)
    sat = (mx - mn) / (mx + 1e-5)

    y_coords = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    horizon_mask = np.clip((0.55 - y_coords) / 0.12, 0.0, 1.0)
    road_slope = np.clip((0.98 - y_coords) / 0.45, 0.0, 1.0) * 0.45
    obstacle = np.clip(sat * 1.15 + gx * 2.2, 0.0, 1.0) * 0.75

    return np.clip(np.maximum(horizon_mask, road_slope + obstacle), 0.0, 1.0)


@lru_cache(maxsize=24)
def compute_street_depth_flood_assets(image_id: str, access_token: str) -> dict[str, Any]:
    raw_bytes = _fetch_mapillary_image_bytes(image_id, access_token)
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

    # Resize to crisp 1024px max width for fast RTX 3050 inference & smooth 60fps WebGL shader
    max_w = 1024
    if img.width > max_w:
        new_h = int(round(img.height * (max_w / img.width)))
        img = img.resize((max_w, new_h), Image.Resampling.LANCZOS)

    pipe = _get_depth_pipeline()
    if pipe is not None:
        result = pipe(img)
        depth_pil = result["depth"].resize((img.width, img.height), Image.Resampling.BILINEAR)
        depth_arr = np.asarray(depth_pil, dtype=np.float32)
        height_map = _estimate_ground_height_from_depth(depth_arr)
    else:
        height_map = _estimate_ground_height_fallback(np.asarray(img, dtype=np.float32))

    # Encode original RGB image as JPEG base64
    rgb_buf = io.BytesIO()
    img.save(rgb_buf, format="JPEG", quality=88)
    image_b64 = "data:image/jpeg;base64," + base64.b64encode(rgb_buf.getvalue()).decode("ascii")

    # Encode 0..1 ground-plane height map as 8-bit grayscale PNG base64
    mask_u8 = np.clip(height_map * 255.0, 0, 255).astype(np.uint8)
    mask_img = Image.fromarray(mask_u8, mode="L")
    mask_buf = io.BytesIO()
    mask_img.save(mask_buf, format="PNG")
    mask_b64 = "data:image/png;base64," + base64.b64encode(mask_buf.getvalue()).decode("ascii")

    return {
        "image_id": image_id,
        "width": img.width,
        "height": img.height,
        "model_used": _DEPTH_MODEL_LABEL,
        "image_b64": image_b64,
        "ground_mask_b64": mask_b64,
    }
