# Street-Level Micro-Drainage & Clog Mapping Pipeline

OpenStreetMap maps major urban trunk drains and nallahs, but **kerbside storm grates, colony inlets, and silt-blocked catch-pits are almost entirely unmapped**. `packages/gis-pipeline/scripts/extract_micro_drains.py` addresses this data gap offline using open street imagery and open-weights vision models.

---

## Pipeline Stages

1. **Spatially Thinned Imagery Acquisition:**
   Queries the Mapillary Graph API (`fields=id,geometry,compass_angle,captured_at,is_pano,thumb_1024_url`) across configured South Delhi hotspot corridors, preferring forward non-panoramic frames and enforcing `22 m` minimum spacing so frames span the whole corridor rather than clustering at traffic lights.
2. **Open-Vocabulary Drain Detection (`Grounding-DINO-Tiny`):**
   Runs `IDEA-Research/grounding-dino-tiny` (`fp16` on CUDA) with the prompt:
   > `storm drain grate. drainage grate. roadside gutter. clogged drain. manhole cover. flooded road puddle.`
   * For `360°` equirectangular panoramas, crops the central forward perspective slice (`x: 25%–75%`, `y: 25%–88%`) to minimize polar distortion, then maps bounding boxes back into full-image normalized coordinates `[x1, y1, x2, y2]` for exact SVG overlay alignment.
   * Rejects boxes above the horizon (`cy_norm < 0.48`) or oversized false positives (`bw_norm > 0.65` or `bh_norm > 0.45`).
3. **Curb GPS Projection (`Depth-Anything-V2-Small` + Compass Geometry):**
   Samples median normalized depth inside each detection box to estimate forward distance (`3 m – 16 m`), computes horizontal angular offset from camera heading (`~75°` FOV), and offsets the camera's WGS84 coordinate to an approximate curb location.
4. **Condition Triage (`clear` / `silted` / `blocked`):**
   * `blocked`: Label indicates active ponding, flooding, or clogging.
   * `silted`: Local RGB crop exhibits elevated earthy/brownish debris ratio (`R - B > 0.08`) or flattened luminance contrast (`std < 0.09`) suggesting silt-filled grate slots.
   * `clear`: Visible kerbside storm grate or drainage cover.
5. **Multi-Frame Deduplication:**
   Clusters repeat detections from consecutive street frames within `10 m` (keeping highest confidence, counting `sightings`, and preserving the highest severity condition).

---

## Built-In South Delhi Corridors

| Preset Flag | Area Covered | BBox (`min_lon, min_lat, max_lon, max_lat`) |
| :--- | :--- | :--- |
| `--corridor moolchand` | Moolchand – Lajpat Nagar | `77.2280, 28.5590, 77.2430, 28.5700` |
| `--corridor chirag_delhi` | Chirag Delhi – Nehru Place | `77.2220, 28.5360, 77.2540, 28.5520` |
| `--corridor defence_colony` | Defence Colony – Andrews Ganj | `77.2240, 28.5630, 77.2390, 28.5760` |
| `--corridor aiims` | AIIMS – South Extension | `77.2060, 28.5640, 77.2240, 28.5730` |
| `--corridor all` | All 4 corridors equally split | Combined |

---

## Running Locally (RTX 3050 / Kaggle T4)

```bash
cd packages/gis-pipeline
export UV_LINK_MODE=copy

# Install CV dependencies (isolated to gis-pipeline, not apps/api)
uv add pillow torch transformers

# Scan 80 street frames across all 4 corridors (~1-2 min on RTX 3050)
HF_HUB_DISABLE_IMPLICIT_TOKEN=1 uv run python scripts/extract_micro_drains.py \
  --config configs/barapullah.json \
  --corridor all \
  --max-images 80
```

### Useful CLI Options

* `--box-threshold 0.32` — Tighten precision (fewer false positives on shadows/asphalt patches; default `0.26`).
* `--text-threshold 0.25` — Tighten text-label matching (default `0.22`).
* `--corridor moolchand --max-images 60` — Dense scan of a single corridor.
* `--bbox 77.225,28.558,77.240,28.568` — Scan any custom WGS84 bounding box.
* `--no-depth` — Skip `Depth-Anything-V2-Small` and project distance using pure perspective geometry (faster on CPU).
* `--token MLY|...` — Explicit Mapillary token (otherwise auto-read from `apps/web/.env.local`).

> **Hugging Face Note:** Both `IDEA-Research/grounding-dino-tiny` and `depth-anything/Depth-Anything-V2-Small-hf` are public ungated models. Passing `HF_HUB_DISABLE_IMPLICIT_TOKEN=1` avoids authentication errors if a stale or locked local HF token exists in `~/.cache/huggingface/token`.

---

## Output GeoJSON Schema (`data/out/{slug}_micro_drains.geojson`)

Each feature is a WGS84 `Point` served directly by `GET /v1/catchments/{slug}/micro-drains`:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [77.234112, 28.564821] },
  "properties": {
    "id": "MD-001",
    "corridor": "Moolchand - Lajpat Nagar",
    "label": "storm drain grate",
    "condition": "silted",
    "condition_note": "Potential silt/debris accumulation obscuring grate slots (needs field check)",
    "confidence": 0.412,
    "est_dist_m": 6.4,
    "bbox_norm": [0.612, 0.714, 0.748, 0.831],
    "image_id": "123456789012345",
    "thumb_url": "https://...",
    "captured_date": "2024-03-18",
    "compass_angle": 112.4,
    "sightings": 2,
    "detector": "Grounding-DINO-Tiny + Depth-Anything-V2-Small"
  }
}
```

In the frontend (`MicroDrainEvidenceCard.tsx`), if a cached Mapillary thumbnail URL expires, the browser automatically fetches a fresh `thumb_1024_url` using `image_id` and `NEXT_PUBLIC_MAPILLARY_TOKEN`.
