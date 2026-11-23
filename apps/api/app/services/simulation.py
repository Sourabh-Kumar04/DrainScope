import csv
import json
import math
import re
from pathlib import Path
import duckdb
import numpy as np
import pandas as pd
from app.schemas import (
    CatchmentMeta,
    CatchmentResponse,
    CatchmentSummary,
    FlowPathItem,
    FlowPathsResponse,
    GeoJSONFeatureCollection,
    HexFeature,
    MethodologyReport,
    OrganicZonesResponse,
    PortfolioScreenResponse,
    ScreenedSiteResult,
    ScreenRequest,
    SimulationRequest,
    StormReturnPeriod,
    TerrainPatchResponse,
    ValidationReport,
)

SLUG_RE = re.compile(r"^[a-z0-9_-]{2,64}$")
STORM_TO_MM = {"2yr": 35.0, "5yr": 60.0, "10yr": 100.0}
BAND_OFFSETS = {"Moderate": 0.0, "High": 0.08, "Critical": 0.16}
DEFAULT_BBOX = (77.175, 28.515, 77.275, 28.595)

DEFAULT_DISPLAY_CUTOFF = 0.38
DEFAULT_RATIONAL_MAX_HA = 50.0
DEFAULT_WSI_WEIGHTS = {
    "twi": 0.25,
    "trap": 0.20,
    "runoff": 0.20,
    "drain_deficit": 0.20,
    "storm_load": 0.15,
}
DEFAULT_STRESS_SCENARIOS: dict[str, dict] = {
    "0": {
        "label": "Baseline",
        "imp_creep": 0.0,
        "rain_mult": 1.00,
        "drain_decay": 1.00,
        "rationale": "Current baseline from 30m DEM, ESA WorldCover 2021, and OSM trunk drains.",
    },
    "2": {
        "label": "+2 Yr Stress",
        "imp_creep": 2.5,
        "rain_mult": 1.04,
        "drain_decay": 1.05,
        "rationale": "Illustrative near-term infill (+2.5% paved), +4% storm intensity, 5% drain siltation.",
    },
    "5": {
        "label": "+5 Yr Stress",
        "imp_creep": 6.0,
        "rain_mult": 1.10,
        "drain_decay": 1.12,
        "rationale": "Illustrative medium-term densification (+6% paved), +10% storm intensity, 12% drain siltation.",
    },
    "10": {
        "label": "+10 Yr Stress",
        "imp_creep": 11.5,
        "rain_mult": 1.18,
        "drain_decay": 1.22,
        "rationale": "Illustrative high-stress scenario (+11.5% paved), +18% extreme rain, 22% unmaintained drain loss.",
    },
}


def _validate_slug(slug: str) -> str:
    if not SLUG_RE.match(slug):
        raise ValueError(f"Invalid catchment slug '{slug}'. Must match {SLUG_RE.pattern}")
    return slug


def _minmax(series: pd.Series) -> pd.Series:
    s = series.fillna(series.median())
    lo, hi = s.quantile(0.02), s.quantile(0.98)
    if hi - lo == 0:
        return pd.Series(0.0, index=series.index)
    return ((s.clip(lo, hi) - lo) / (hi - lo)).clip(0.0, 1.0)


def _risk_tier(score: float) -> str:
    if score >= 0.68:
        return "Critical"
    if score >= 0.52:
        return "High"
    if score >= 0.35:
        return "Moderate"
    return "Low"


def _resolve_rainfall(req: SimulationRequest) -> tuple[float, StormReturnPeriod]:
    if req.rainfall_mm_hr is not None:
        mm = float(req.rainfall_mm_hr)
    elif req.storm_return_period is not None:
        mm = STORM_TO_MM[req.storm_return_period]
    else:
        mm = 60.0

    if mm < 45.0:
        period: StormReturnPeriod = "2yr"
    elif mm < 85.0:
        period = "5yr"
    else:
        period = "10yr"
    return mm, period


def _rainfall_to_scalar(mm_hr: float) -> float:
    return float(min(1.0, max(0.10, (mm_hr / 110.0) ** 0.75)))


def _rain_to_flood_mm(static_wsi: float, rain_mult: float, threshold: float = 0.52) -> float:
    """Analytical inverse of storm_scalar: mm/hr required to cross High susceptibility (WSI >= 0.52)."""
    needed_scalar = (threshold - static_wsi) / 0.15
    if needed_scalar <= 0.10:
        return 10.0
    if needed_scalar >= 1.0:
        return 150.0
    effective_mm = 110.0 * (needed_scalar ** (1.0 / 0.75))
    raw_mm = effective_mm / max(rain_mult, 0.5)
    return round(min(150.0, max(10.0, raw_mm)), 0)


def _haversine_m(p1: list[float], p2: list[float]) -> float:
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geom(lng: float, lat: float, geom: dict) -> bool:
    gtype = geom.get("type")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon" and coords:
        if not _point_in_ring(lng, lat, coords[0]):
            return False
        for hole in coords[1:]:
            if _point_in_ring(lng, lat, hole):
                return False
        return True
    if gtype == "MultiPolygon":
        for poly in coords:
            if poly and _point_in_ring(lng, lat, poly[0]):
                if not any(_point_in_ring(lng, lat, h) for h in poly[1:]):
                    return True
    return False


def _iter_coords(geom: dict):
    gtype = geom.get("type")
    coords = geom.get("coordinates", [])
    if gtype == "Point":
        if len(coords) >= 2:
            yield coords[0], coords[1]
    elif gtype in ("LineString", "MultiPoint"):
        for pt in coords:
            if len(pt) >= 2:
                yield pt[0], pt[1]
    elif gtype in ("Polygon", "MultiLineString"):
        for ring in coords:
            for pt in ring:
                if len(pt) >= 2:
                    yield pt[0], pt[1]
    elif gtype == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                for pt in ring:
                    if len(pt) >= 2:
                        yield pt[0], pt[1]


def _geom_bbox_and_centroid(geom: dict) -> tuple[list[float], list[float]]:
    xs: list[float] = []
    ys: list[float] = []
    for x, y in _iter_coords(geom):
        xs.append(float(x))
        ys.append(float(y))
    if not xs:
        return [77.232, 28.562, 77.232, 28.562], [77.232, 28.562]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    cx = round((sum(xs) / len(xs) + (minx + maxx) / 2.0) / 2.0, 6)
    cy = round((sum(ys) / len(ys) + (miny + maxy) / 2.0) / 2.0, 6)
    return [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)], [cx, cy]


def _nearest_anchor(origin: list[float], candidates: list[dict]) -> dict | None:
    if not candidates:
        return None
    ox, oy = origin
    best = None
    best_d2 = float("inf")
    for item in candidates:
        cx, cy = item["coord"]
        dx = cx - ox
        dy = cy - oy
        d2 = dx * dx + dy * dy
        if d2 < best_d2:
            best_d2 = d2
            best = item
    return best


def _build_diagnosis(
    twi_n: float,
    trap_n: float,
    runoff_n: float,
    drain_def_eff: float,
    impervious_pct: float,
    nearest_drain_m: float,
    nearest_drain_name: str,
    sink_max_m: float,
    underpass_trap: bool,
    area_ha: float,
    park_name: str,
    nearest_park_m: float,
    park_offset_pct: int,
) -> tuple[str, str, list[dict], list[str]]:
    raw_drivers = [
        ("concrete", "Concrete Runoff", 0.20 * runoff_n),
        ("pooling", "Terrain Pooling", 0.25 * twi_n),
        ("drain_gap", "Mapped Drain Gap (OSM)", 0.20 * drain_def_eff),
        ("trap", "Underpass / Dip Trap", 0.20 * trap_n),
    ]
    total = sum(v for _, _, v in raw_drivers) or 1.0
    ranked = sorted(
        [
            {"key": k, "label": lbl, "pct": int(round(100.0 * v / total))}
            for k, lbl, v in raw_drivers
        ],
        key=lambda d: d["pct"],
        reverse=True,
    )

    top_keys = {ranked[0]["key"], ranked[1]["key"]}
    if underpass_trap:
        headline = "Road Underpass Dip + Surface Runoff Trap"
    elif top_keys == {"concrete", "drain_gap"}:
        headline = "Heavy Concrete Cover Far From Mapped Trunk Drains"
    elif top_keys == {"concrete", "pooling"}:
        headline = "Paved Low-Spot With High Water Pooling"
    elif top_keys == {"pooling", "drain_gap"}:
        headline = "Natural Depression Far From Mapped Trunk Drains"
    elif "trap" in top_keys:
        headline = "Localized Low-Spot Bottleneck"
    else:
        headline = f"{ranked[0]['label']} + {ranked[1]['label']}"

    parts: list[str] = []
    if impervious_pct >= 70.0:
        parts.append(f"{impervious_pct:.0f}% concrete cover blocks ground absorption")
    else:
        parts.append(f"{impervious_pct:.0f}% paved surface generates surface runoff")

    if underpass_trap:
        parts.append("a sunken road underpass (layer=-1) traps stormwater")
    elif nearest_drain_m >= 180.0:
        parts.append(f"the nearest OSM-mapped trunk drain ({nearest_drain_name}) is {nearest_drain_m:.0f} m away")
    elif sink_max_m >= 0.8:
        parts.append(f"a {sink_max_m:.1f} m DEM depression holds standing water")
    else:
        parts.append("flat slope slows runoff drainage")

    summary = f"{parts[0].capitalize()} while {parts[1]}, across a ~{area_ha:.2f} ha screening pocket."

    actions: list[str] = []
    if underpass_trap:
        actions.append("Install dual-float sump pumps, trash screens & high-water warning sensors at the underpass dip.")
    if nearest_drain_m >= 150.0:
        actions.append(
            f"Field-verify unmapped roadside drains first; if absent, connect via a {nearest_drain_m:.0f} m feeder culvert to {nearest_drain_name}."
        )
    else:
        actions.append(
            f"Desilt inlet grates and kerbside catch-pits feeding into {nearest_drain_name} ({nearest_drain_m:.0f} m away)."
        )
    if nearest_park_m <= 350.0 and park_name != "None mapped":
        actions.append(
            f"Evaluate a 30 cm shallow bioswale at {park_name} (screening capacity ~{park_offset_pct}% of 1-hr zone runoff)."
        )
    elif impervious_pct >= 70.0:
        actions.append("Retrofit roadside parking bays and colony lanes with permeable paver blocks & recharge trenches.")

    return headline, summary, ranked, actions[:3]


class CatchmentEngine:
    """Deterministic DuckDB + Pandas engine for screening susceptibility, NbS scenarios & site screening."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self._cache: dict[str, pd.DataFrame] = {}
        self._zones_cache: dict[str, list[dict]] = {}
        self._drain_anchors_cache: dict[str, list[dict]] = {}
        self._park_anchors_cache: dict[str, list[dict]] = {}
        self._underpass_anchors_cache: dict[str, list[dict]] = {}
        self._config_cache: dict[str, dict] = {}

    def _load_config(self, slug: str) -> dict:
        slug = _validate_slug(slug)
        if slug in self._config_cache:
            return self._config_cache[slug]
        candidates = [
            self.data_dir.parent.parent / "configs" / f"{slug}.json",
            self.data_dir / f"{slug}_config.json",
        ]
        for c in candidates:
            if c.exists():
                cfg = json.loads(c.read_text(encoding="utf-8"))
                self._config_cache[slug] = cfg
                return cfg
        self._config_cache[slug] = {}
        return {}

    def _get_scenarios(self, slug: str) -> dict[str, dict]:
        cfg = self._load_config(slug)
        return cfg.get("stress_scenarios") or DEFAULT_STRESS_SCENARIOS

    def _get_display_cutoff(self, slug: str) -> float:
        cfg = self._load_config(slug)
        return float(cfg.get("display_wsi_cutoff", DEFAULT_DISPLAY_CUTOFF))

    def _get_rational_max_ha(self, slug: str) -> float:
        cfg = self._load_config(slug)
        return float(cfg.get("rational_method_max_area_ha", DEFAULT_RATIONAL_MAX_HA))

    def _get_bbox(self, slug: str) -> tuple[float, float, float, float]:
        cfg = self._load_config(slug)
        b = cfg.get("bbox_wgs84")
        if b and len(b) == 4:
            return (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
        return DEFAULT_BBOX

    def list_catchments(self) -> list[CatchmentMeta]:
        if not self.data_dir.exists():
            return []
        metas: list[CatchmentMeta] = []
        for p in sorted(self.data_dir.glob("*_h3_scores.parquet")):
            slug = p.name.removesuffix("_h3_scores.parquet")
            if not SLUG_RE.match(slug):
                continue
            df = self._load_catchment(slug)
            drains_exists = (self.data_dir / f"{slug}_drains.geojson").exists()
            metas.append(CatchmentMeta(slug=slug, hex_count=len(df), has_drains_layer=drains_exists))
        return metas

    def get_validation_report(self, slug: str) -> ValidationReport:
        slug = _validate_slug(slug)
        path = self.data_dir / f"{slug}_validation.json"
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            return ValidationReport(**raw)
        return ValidationReport(
            catchment_slug=slug,
            validated=False,
            status_label="Unvalidated Screening Susceptibility",
            notes=(
                "No historical waterlogging incident dataset has been scored against this catchment yet. "
                "Run `packages/gis-pipeline/scripts/validate_incidents.py` with geocoded Delhi incident points "
                "to compute ROC-AUC, PR-AUC, and Top-10%/20% Lift."
            ),
        )

    def get_methodology_report(self, slug: str) -> MethodologyReport:
        slug = _validate_slug(slug)
        cfg = self._load_config(slug)
        dem_license = (
            cfg.get("rasters", {}).get("dem_license")
            or "Copernicus GLO-30 DEM (Open Commercial License). FABDEM v1-2 is CC BY-NC-SA 4.0 (non-commercial research only)."
        )
        return MethodologyReport(
            catchment_slug=slug,
            dem_resolution_m=30,
            spatial_uncertainty_note=(
                "Organic contours are Gaussian-smoothed (sigma=1.15) from a 30m DEM for visual readability. "
                "Treat boundaries as ±30m screening susceptibility zones, not parcel-exact flood lines."
            ),
            dem_license_note=dem_license,
            osm_drain_caveat=(
                "Drain proximity uses OpenStreetMap waterway tags (primarily trunk drains and nallahs). "
                "Minor kerbside and colony storm drains are frequently unmapped in OSM."
            ),
            display_wsi_cutoff=self._get_display_cutoff(slug),
            rational_method_max_area_ha=self._get_rational_max_ha(slug),
            wsi_weights=cfg.get("weights_wsi") or DEFAULT_WSI_WEIGHTS,
            stress_scenarios=self._get_scenarios(slug),
        )

    def get_incidents_geojson(self, slug: str) -> GeoJSONFeatureCollection:
        slug = _validate_slug(slug)
        # Prefer explicit GeoJSON if present
        gj_path = self.data_dir / f"{slug}_incidents.geojson"
        if gj_path.exists():
            raw = json.loads(gj_path.read_text(encoding="utf-8"))
            return GeoJSONFeatureCollection(features=raw.get("features", []))

        # Fallback to geocoded CSV in data/raw/delhi_waterlogging_incidents.csv
        csv_candidates = [
            self.data_dir.parent / "raw" / "delhi_waterlogging_incidents.csv",
            self.data_dir / f"{slug}_incidents.csv",
        ]
        for csv_path in csv_candidates:
            if csv_path.exists():
                features: list[dict] = []
                with csv_path.open("r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for idx, row in enumerate(reader, start=1):
                        try:
                            lat = float(row.get("lat") or row.get("latitude") or "")
                            lon = float(row.get("lon") or row.get("lng") or row.get("longitude") or "")
                        except ValueError:
                            continue
                        features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [lon, lat]},
                            "properties": {
                                "id": f"INC-{idx:02d}",
                                "name": row.get("name") or f"Incident {idx}",
                                "source": row.get("source") or "Historical Waterlogging Record",
                            },
                        })
                return GeoJSONFeatureCollection(features=features)
        return GeoJSONFeatureCollection(features=[])

    def _load_anchors(self, slug: str) -> tuple[list[dict], list[dict], list[dict]]:
        if slug not in self._drain_anchors_cache:
            drains_fc = self.get_drains_geojson(slug)
            dpts: list[dict] = []
            for f in drains_fc.features:
                props = f.get("properties", {}) or {}
                raw_name = props.get("name")
                wtype = str(props.get("waterway") or "drain").title()
                name = str(raw_name).strip() if raw_name and str(raw_name).lower() != "none" else f"Mapped {wtype} (OSM)"
                pts = list(_iter_coords(f.get("geometry", {})))
                step = max(1, len(pts) // 8)
                for x, y in pts[::step]:
                    dpts.append({"coord": [round(float(x), 6), round(float(y), 6)], "name": name})
            self._drain_anchors_cache[slug] = dpts

        if slug not in self._park_anchors_cache:
            parks_fc = self.get_parks_geojson(slug)
            ppts: list[dict] = []
            for f in parks_fc.features:
                props = f.get("properties", {}) or {}
                _, centroid = _geom_bbox_and_centroid(f.get("geometry", {}))
                ppts.append({
                    "coord": centroid,
                    "name": str(props.get("park_name") or "Public Park"),
                    "area_sqm": float(props.get("park_area_sqm") or 0.0),
                })
            self._park_anchors_cache[slug] = ppts

        if slug not in self._underpass_anchors_cache:
            up_fc = self.get_underpasses_geojson(slug)
            upts: list[dict] = []
            for f in up_fc.features:
                props = f.get("properties", {}) or {}
                _, centroid = _geom_bbox_and_centroid(f.get("geometry", {}))
                upts.append({
                    "coord": centroid,
                    "name": str(props.get("name") or "Road Underpass Dip"),
                })
            self._underpass_anchors_cache[slug] = upts

        return (
            self._drain_anchors_cache[slug],
            self._park_anchors_cache[slug],
            self._underpass_anchors_cache[slug],
        )

    def _load_catchment(self, slug: str) -> pd.DataFrame:
        slug = _validate_slug(slug)
        if slug in self._cache:
            return self._cache[slug]

        parquet_path = self.data_dir / f"{slug}_h3_scores.parquet"
        if not parquet_path.exists():
            raise FileNotFoundError(
                f"Dataset '{parquet_path.name}' not found in '{self.data_dir}'. "
                "Run `packages/gis-pipeline/scripts/barapullah_pipeline.py` to generate real telemetry."
            )

        con = duckdb.connect()
        try:
            df = con.execute(
                f"""
                SELECT
                    CAST(h3_id AS VARCHAR) AS h3_id,
                    CAST(wsi_score AS DOUBLE) AS wsi_score,
                    CAST(ips_score AS DOUBLE) AS ips_score,
                    COALESCE(CAST(twi_p90 AS DOUBLE), 0.0) AS twi_p90,
                    COALESCE(CAST(sink_max_m AS DOUBLE), 0.0) AS sink_max_m,
                    COALESCE(CAST(impervious_pct AS DOUBLE), 0.0) AS impervious_pct,
                    COALESCE(CAST(nearest_drain_m AS DOUBLE), 500.0) AS nearest_drain_m,
                    COALESCE(CAST(underpass_trap AS BOOLEAN), FALSE) AS underpass_trap,
                    COALESCE(CAST(arterial_road_m AS DOUBLE), 0.0) AS arterial_road_m,
                    COALESCE(CAST(park_name AS VARCHAR), 'None mapped') AS park_name,
                    COALESCE(CAST(park_area_sqm AS DOUBLE), 0.0) AS park_area_sqm,
                    COALESCE(CAST(nearest_park_m AS DOUBLE), 999.0) AS nearest_park_m
                FROM read_parquet('{parquet_path.as_posix()}')
                """
            ).df()
        finally:
            con.close()

        df["twi_n"] = _minmax(df["twi_p90"])
        df["trap_n"] = (0.5 * _minmax(df["sink_max_m"]) + 0.5 * df["underpass_trap"].astype(float)).clip(0, 1)
        df["drain_def_n"] = _minmax(df["nearest_drain_m"])
        df["exposure_n"] = _minmax(df["arterial_road_m"])
        df["nbs_feas_n"] = (1.0 - _minmax(df["nearest_park_m"])).clip(0, 1)
        base_runoff = (df["impervious_pct"] / 100.0).clip(0.0, 1.0)
        base_storm = _rainfall_to_scalar(60.0)
        df["base_wsi"] = (
            0.25 * df["twi_n"] + 0.20 * df["trap_n"] + 0.20 * base_runoff + 0.20 * df["drain_def_n"] + 0.15 * base_storm
        ).clip(0.0, 1.0).round(3)
        df["impact_n"] = (0.55 * df["exposure_n"] + 0.25 * df["nbs_feas_n"] + 0.20 * 0.5).clip(0.0, 1.0)
        df["base_ips"] = np.sqrt(df["base_wsi"] * df["impact_n"]).clip(0.0, 1.0).round(3)

        self._cache[slug] = df
        return df

    def _load_zones(self, slug: str) -> list[dict]:
        slug = _validate_slug(slug)
        if slug in self._zones_cache:
            return self._zones_cache[slug]

        zones_path = self.data_dir / f"{slug}_waterlogging_zones.geojson"
        if not zones_path.exists():
            raise FileNotFoundError(
                f"Organic waterlogging layer '{zones_path.name}' not found. "
                "Re-run `uv run python scripts/barapullah_pipeline.py --config configs/barapullah.json`."
            )
        raw = json.loads(zones_path.read_text(encoding="utf-8"))
        feats = raw.get("features", [])
        drain_anchors, park_anchors, up_anchors = self._load_anchors(slug)

        for f in feats:
            bbox, centroid = _geom_bbox_and_centroid(f.get("geometry", {}))
            p = f.setdefault("properties", {})
            p["_bbox"] = bbox
            p["_centroid"] = centroid

            nearest_drain = _nearest_anchor(centroid, drain_anchors)
            p["_nearest_drain_coord"] = nearest_drain["coord"] if nearest_drain else None
            p["_nearest_drain_name"] = nearest_drain["name"] if nearest_drain else "Mapped Trunk Drain (OSM)"

            nearest_park = _nearest_anchor(centroid, park_anchors)
            p["_nearest_park_coord"] = nearest_park["coord"] if nearest_park else None

            nearby_ups: list[dict] = []
            for up in up_anchors:
                dist = _haversine_m(centroid, up["coord"])
                if dist <= 450.0:
                    nearby_ups.append({
                        "name": up["name"],
                        "coord": up["coord"],
                        "dist_m": round(dist, 0),
                    })
            nearby_ups.sort(key=lambda x: x["dist_m"])
            p["_nearby_underpasses"] = nearby_ups[:4]

        self._zones_cache[slug] = feats
        return feats

    def simulate_zones(self, slug: str, req: SimulationRequest, workspace_id: str = "default") -> OrganicZonesResponse:
        feats = self._load_zones(slug)
        mm_hr, period = _resolve_rainfall(req)
        scenarios = self._get_scenarios(slug)
        proj = scenarios[str(int(req.projection_years))]
        display_cutoff = self._get_display_cutoff(slug)
        rational_max_ha = self._get_rational_max_ha(slug)

        rain_mult = float(proj["rain_mult"])
        effective_mm = mm_hr * rain_mult
        storm_scalar = _rainfall_to_scalar(effective_mm)
        base_storm_scalar = _rainfall_to_scalar(60.0)
        target_set = set(req.target_zone_ids) if req.target_zone_ids else None

        out_features: list[dict] = []
        tier_counts = {"Critical": 0, "High": 0, "Moderate": 0, "Low": 0}
        wsi_vals: list[float] = []
        ips_vals: list[float] = []
        wsi_deltas: list[float] = []

        for f in feats:
            p = f.get("properties", {})
            zone_id = str(p.get("zone_id", "Z-000"))
            twi_n = float(p.get("twi_n", 0.5))
            trap_n = float(p.get("trap_n", 0.3))
            drain_def_n = float(p.get("drain_def_n", 0.5))
            impact_n = float(p.get("impact_n", 0.5))
            band_offset = BAND_OFFSETS.get(str(p.get("contour_band", "Moderate")), 0.0)
            orig_imp = float(p.get("impervious_pct", 50.0))

            base_runoff_n = min(1.0, max(0.0, orig_imp / 100.0))
            base_wsi = round(
                min(1.0, max(0.0, 0.25 * twi_n + 0.20 * trap_n + 0.20 * base_runoff_n + 0.20 * drain_def_n + 0.15 * base_storm_scalar + band_offset)),
                3,
            )
            base_ips = round(min(1.0, max(0.0, float(math.sqrt(base_wsi * impact_n)))), 3)

            apply_nbs = (target_set is None) or (zone_id in target_set)
            projected_imp = min(99.0, orig_imp + float(proj["imp_creep"]))
            sim_imp = max(0.0, projected_imp - (req.nbs_impervious_reduction_pct if apply_nbs else 0.0))
            runoff_n = min(1.0, max(0.0, sim_imp / 100.0))

            drain_def_eff = min(1.0, drain_def_n * float(proj["drain_decay"]))
            park_area_sqm = float(p.get("park_area_sqm", 0.0))
            nearest_park_m = round(float(p.get("nearest_park_m", 999.0)), 1)
            if apply_nbs and req.park_detention_enabled and nearest_park_m <= 350.0 and park_area_sqm >= 2500.0:
                drain_def_eff = drain_def_eff * 0.72

            static_wsi = 0.25 * twi_n + 0.20 * trap_n + 0.20 * runoff_n + 0.20 * drain_def_eff + band_offset
            sim_wsi = round(min(1.0, max(0.0, static_wsi + 0.15 * storm_scalar)), 3)
            sim_ips = round(min(1.0, max(0.0, float(math.sqrt(sim_wsi * impact_n)))), 3)
            wsi_delta = round(sim_wsi - base_wsi, 3)
            ips_delta = round(sim_ips - base_ips, 3)
            tier = _risk_tier(sim_wsi)
            rain_to_flood = _rain_to_flood_mm(static_wsi, rain_mult, threshold=0.52)

            if sim_wsi < display_cutoff and (target_set is None or zone_id not in target_set):
                tier_counts["Low"] += 1
                continue

            tier_counts[tier] += 1
            wsi_vals.append(sim_wsi)
            ips_vals.append(sim_ips)
            wsi_deltas.append(wsi_delta)

            nearest_drain_m = round(float(p.get("nearest_drain_m", 0.0)), 1)
            nearest_drain_name = str(p.get("_nearest_drain_name", "Mapped Trunk Drain (OSM)"))
            sink_max_m = round(float(p.get("sink_max_m", 0.0)), 2)
            underpass_trap = bool(p.get("underpass_trap", False))
            area_ha = float(p.get("area_ha", 0.5))
            park_name = str(p.get("park_name", "None mapped"))

            runoff_c = 0.25 + 0.65 * runoff_n
            area_sqm = area_ha * 10000.0
            runoff_volume_kl = round(runoff_c * (effective_mm / 1000.0) * area_sqm, 1)
            rational_valid = area_ha <= rational_max_ha
            peak_flow_lps = round((runoff_volume_kl * 1000.0) / 3600.0, 1) if rational_valid else None
            rational_scope_note = (
                f"Zone-scale Rational Method (area {area_ha:.2f} ha <= {rational_max_ha:.0f} ha cap)"
                if rational_valid
                else f"Zone area ({area_ha:.1f} ha) exceeds Rational Method small-catchment limit (>{rational_max_ha:.0f} ha); peak flow suppressed."
            )
            est_ponding_cm = int(round(min(115.0, max(8.0, (effective_mm * 0.42 * sim_wsi) + (18.0 if underpass_trap else 0.0)))))

            park_capacity_kl = round(0.15 * park_area_sqm * 0.30, 1) if park_area_sqm >= 2500.0 else 0.0
            park_offset_pct = int(round(min(100.0, (100.0 * park_capacity_kl / runoff_volume_kl)))) if runoff_volume_kl > 0 else 0

            headline, diag_summary, drivers, actions = _build_diagnosis(
                twi_n=twi_n,
                trap_n=trap_n,
                runoff_n=runoff_n,
                drain_def_eff=drain_def_eff,
                impervious_pct=sim_imp,
                nearest_drain_m=nearest_drain_m,
                nearest_drain_name=nearest_drain_name,
                sink_max_m=sink_max_m,
                underpass_trap=underpass_trap,
                area_ha=area_ha,
                park_name=park_name,
                nearest_park_m=nearest_park_m,
                park_offset_pct=park_offset_pct,
            )

            centroid = p.get("_centroid", [77.232, 28.562])
            out_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "zone_id": zone_id,
                    "contour_band": str(p.get("contour_band", "Moderate")),
                    "area_ha": area_ha,
                    "wsi_score": sim_wsi,
                    "ips_score": sim_ips,
                    "risk_tier": tier,
                    "twi_p90": round(float(p.get("twi_p90", 0.0)), 2),
                    "sink_max_m": sink_max_m,
                    "impervious_pct": round(sim_imp, 1),
                    "nearest_drain_m": nearest_drain_m,
                    "nearest_drain_name": nearest_drain_name,
                    "underpass_trap": underpass_trap,
                    "arterial_road_m": round(float(p.get("arterial_road_m", 0.0)), 1),
                    "park_name": park_name,
                    "park_area_sqm": park_area_sqm,
                    "nearest_park_m": nearest_park_m,
                    "wsi_delta": wsi_delta,
                    "ips_delta": ips_delta,
                    "centroid_lng": centroid[0],
                    "centroid_lat": centroid[1],
                    "bbox": p.get("_bbox", [77.232, 28.562, 77.232, 28.562]),
                    "nearest_drain_coord": p.get("_nearest_drain_coord"),
                    "nearest_park_coord": p.get("_nearest_park_coord"),
                    "nearby_underpasses": p.get("_nearby_underpasses", []),
                    "runoff_volume_kl": runoff_volume_kl,
                    "peak_flow_lps": peak_flow_lps,
                    "rational_method_valid": rational_valid,
                    "rational_scope_note": rational_scope_note,
                    "est_ponding_cm": est_ponding_cm,
                    "rain_to_flood_mm": rain_to_flood,
                    "park_capacity_kl": park_capacity_kl,
                    "park_offset_pct": park_offset_pct,
                    "diagnosis_headline": headline,
                    "diagnosis_summary": diag_summary,
                    "drivers": drivers,
                    "recommended_actions": actions,
                },
            })

        order = {"Low": 0, "Moderate": 1, "High": 2, "Critical": 3}
        out_features.sort(key=lambda x: order.get(x["properties"]["risk_tier"], 0))

        summary = CatchmentSummary(
            catchment_slug=slug,
            workspace_id=workspace_id,
            total_hexes=len(out_features),
            critical_count=tier_counts["Critical"],
            high_count=tier_counts["High"],
            moderate_count=tier_counts["Moderate"],
            low_count=tier_counts["Low"],
            mean_wsi=round(float(np.mean(wsi_vals)), 3) if wsi_vals else 0.0,
            mean_ips=round(float(np.mean(ips_vals)), 3) if ips_vals else 0.0,
            mean_wsi_delta=round(float(np.mean(wsi_deltas)), 3) if wsi_deltas else 0.0,
            storm_return_period=period,
            rainfall_mm_hr=round(mm_hr, 1),
            projection_years=req.projection_years,
            nbs_impervious_reduction_pct=req.nbs_impervious_reduction_pct,
            park_detention_enabled=req.park_detention_enabled,
        )
        return OrganicZonesResponse(summary=summary, zones_geojson=GeoJSONFeatureCollection(features=out_features))

    def screen_sites(self, slug: str, req: ScreenRequest, workspace_id: str = "default") -> PortfolioScreenResponse:
        slug = _validate_slug(slug)
        min_lon, min_lat, max_lon, max_lat = self._get_bbox(slug)
        sim = self.simulate_zones(
            slug,
            SimulationRequest(
                rainfall_mm_hr=req.rainfall_mm_hr,
                projection_years=req.projection_years,
                nbs_impervious_reduction_pct=req.nbs_impervious_reduction_pct,
                park_detention_enabled=req.park_detention_enabled,
            ),
            workspace_id=workspace_id,
        )
        zone_feats = sim.zones_geojson.features
        drain_anchors, park_anchors, _ = self._load_anchors(slug)

        results: list[ScreenedSiteResult] = []
        counts = {"Critical": 0, "High": 0, "Moderate": 0, "Low": 0}
        in_catchment_scores: list[int] = []

        for site in req.sites:
            in_bbox = (min_lon <= site.lng <= max_lon) and (min_lat <= site.lat <= max_lat)
            if not in_bbox:
                results.append(
                    ScreenedSiteResult(
                        name=site.name,
                        lat=site.lat,
                        lng=site.lng,
                        in_catchment=False,
                        match_type="outside_catchment",
                        screening_score_100=0,
                        risk_tier="Low",
                        est_ponding_cm=0,
                        top_driver="Outside Pilot Area",
                        diagnosis_headline="Coordinates fall outside Barapullah sub-catchment boundary",
                    )
                )
                continue

            # 1. Exact point-in-polygon match (prefer highest WSI band if nested contours overlap)
            hit_feat = None
            for f in reversed(zone_feats):
                bb = f["properties"]["bbox"]
                if bb[0] <= site.lng <= bb[2] and bb[1] <= site.lat <= bb[3]:
                    if _point_in_geom(site.lng, site.lat, f["geometry"]):
                        hit_feat = f
                        break

            match_type = "inside_zone"
            # 2. Fallback: nearest screening pocket within 220m
            if hit_feat is None and zone_feats:
                best_dist = float("inf")
                best_f = None
                for f in zone_feats:
                    c = [f["properties"]["centroid_lng"], f["properties"]["centroid_lat"]]
                    d = _haversine_m([site.lng, site.lat], c)
                    if d < best_dist:
                        best_dist = d
                        best_f = f
                if best_f is not None and best_dist <= 220.0:
                    hit_feat = best_f
                    match_type = "nearby_zone"

            if hit_feat is not None:
                p = hit_feat["properties"]
                scale = 1.0 if match_type == "inside_zone" else 0.85
                score_100 = int(round(min(100.0, max(0.0, p["wsi_score"] * 100.0 * scale))))
                tier = _risk_tier(score_100 / 100.0)
                counts[tier] += 1
                in_catchment_scores.append(score_100)
                top_drv = p["drivers"][0]["label"] if p.get("drivers") else "Surface Runoff"
                results.append(
                    ScreenedSiteResult(
                        name=site.name,
                        lat=site.lat,
                        lng=site.lng,
                        in_catchment=True,
                        matched_zone_id=p["zone_id"],
                        match_type=match_type,
                        screening_score_100=score_100,
                        risk_tier=tier,
                        est_ponding_cm=int(round(p["est_ponding_cm"] * scale)),
                        rain_to_flood_mm=p.get("rain_to_flood_mm"),
                        impervious_pct=p["impervious_pct"],
                        nearest_drain_name=p["nearest_drain_name"],
                        nearest_drain_m=p["nearest_drain_m"],
                        park_name=p["park_name"],
                        nearest_park_m=p["nearest_park_m"],
                        top_driver=top_drv,
                        diagnosis_headline=p["diagnosis_headline"],
                    )
                )
            else:
                # Inside Barapullah catchment but outside all >=0.38 pooling pockets
                nd = _nearest_anchor([site.lng, site.lat], drain_anchors)
                npark = _nearest_anchor([site.lng, site.lat], park_anchors)
                d_drain = round(_haversine_m([site.lng, site.lat], nd["coord"]), 1) if nd else None
                d_park = round(_haversine_m([site.lng, site.lat], npark["coord"]), 1) if npark else None
                counts["Low"] += 1
                in_catchment_scores.append(22)
                results.append(
                    ScreenedSiteResult(
                        name=site.name,
                        lat=site.lat,
                        lng=site.lng,
                        in_catchment=True,
                        matched_zone_id=None,
                        match_type="outside_zones",
                        screening_score_100=22,
                        risk_tier="Low",
                        est_ponding_cm=0,
                        rain_to_flood_mm=140.0,
                        nearest_drain_name=nd["name"] if nd else "Mapped Trunk Drain (OSM)",
                        nearest_drain_m=d_drain,
                        park_name=npark["name"] if npark else "None mapped",
                        nearest_park_m=d_park,
                        top_driver="Low Topographic Pooling",
                        diagnosis_headline="Outside mapped waterlogging pockets under current storm scenario",
                    )
                )

        return PortfolioScreenResponse(
            catchment_slug=slug,
            total_sites=len(results),
            in_catchment_count=len(in_catchment_scores),
            critical_count=counts["Critical"],
            high_count=counts["High"],
            moderate_count=counts["Moderate"],
            low_count=counts["Low"],
            mean_score_100=round(float(np.mean(in_catchment_scores)), 1) if in_catchment_scores else 0.0,
            rainfall_mm_hr=req.rainfall_mm_hr,
            projection_years=req.projection_years,
            sites=results,
        )

    def simulate(self, slug: str, req: SimulationRequest, workspace_id: str = "default") -> CatchmentResponse:
        base = self._load_catchment(slug)
        mm_hr, period = _resolve_rainfall(req)
        proj = self._get_scenarios(slug)[str(int(req.projection_years))]
        storm_scalar = _rainfall_to_scalar(mm_hr * float(proj["rain_mult"]))

        mask = base["h3_id"].isin(req.target_h3_ids) if req.target_h3_ids else pd.Series(True, index=base.index)
        proj_imp = np.minimum(99.0, base["impervious_pct"] + float(proj["imp_creep"]))
        sim_imp = np.where(mask, np.maximum(0.0, proj_imp - req.nbs_impervious_reduction_pct), proj_imp)
        runoff_n = pd.Series(sim_imp / 100.0, index=base.index).clip(0.0, 1.0)

        drain_def_eff = np.minimum(1.0, base["drain_def_n"].to_numpy(copy=True) * float(proj["drain_decay"]))
        if req.park_detention_enabled:
            eligible_park = mask.to_numpy() & (base["nearest_park_m"].to_numpy() <= 350.0) & (base["park_area_sqm"].to_numpy() >= 2500.0)
            drain_def_eff = np.where(eligible_park, drain_def_eff * 0.72, drain_def_eff)

        sim_wsi = (
            0.25 * base["twi_n"] + 0.20 * base["trap_n"] + 0.20 * runoff_n + 0.20 * drain_def_eff + 0.15 * storm_scalar
        ).clip(0.0, 1.0).round(3)
        sim_ips = np.sqrt(sim_wsi * base["impact_n"]).clip(0.0, 1.0).round(3)

        wsi_delta = (sim_wsi - base["base_wsi"]).round(3)
        ips_delta = (sim_ips - base["base_ips"]).round(3)

        hexes: list[HexFeature] = []
        tier_counts = {"Critical": 0, "High": 0, "Moderate": 0, "Low": 0}
        for row, sw, si, imp, wd, id_ in zip(base.itertuples(index=False), sim_wsi, sim_ips, sim_imp, wsi_delta, ips_delta):
            tier = _risk_tier(float(sw))
            tier_counts[tier] += 1
            hexes.append(
                HexFeature(
                    h3_id=row.h3_id,
                    wsi_score=float(sw),
                    ips_score=float(si),
                    risk_tier=tier,
                    twi_p90=round(float(row.twi_p90), 2),
                    sink_max_m=round(float(row.sink_max_m), 2),
                    impervious_pct=round(float(imp), 1),
                    nearest_drain_m=round(float(row.nearest_drain_m), 1),
                    underpass_trap=bool(row.underpass_trap),
                    arterial_road_m=round(float(row.arterial_road_m), 1),
                    park_name=str(row.park_name),
                    park_area_sqm=float(row.park_area_sqm),
                    nearest_park_m=round(float(row.nearest_park_m), 1),
                    wsi_delta=float(wd),
                    ips_delta=float(id_),
                )
            )

        summary = CatchmentSummary(
            catchment_slug=slug,
            workspace_id=workspace_id,
            total_hexes=len(hexes),
            critical_count=tier_counts["Critical"],
            high_count=tier_counts["High"],
            moderate_count=tier_counts["Moderate"],
            low_count=tier_counts["Low"],
            mean_wsi=round(float(sim_wsi.mean()), 3) if len(hexes) else 0.0,
            mean_ips=round(float(sim_ips.mean()), 3) if len(hexes) else 0.0,
            mean_wsi_delta=round(float(wsi_delta.mean()), 3) if len(hexes) else 0.0,
            storm_return_period=period,
            rainfall_mm_hr=round(mm_hr, 1),
            projection_years=req.projection_years,
            nbs_impervious_reduction_pct=req.nbs_impervious_reduction_pct,
            park_detention_enabled=req.park_detention_enabled,
        )
        return CatchmentResponse(summary=summary, hexes=hexes)

    def get_hex_profile(self, slug: str, h3_id: str) -> HexFeature:
        resp = self.simulate(slug, SimulationRequest())
        for h in resp.hexes:
            if h.h3_id == h3_id:
                return h
        raise KeyError(f"Hexagon '{h3_id}' not found in catchment '{slug}'.")

    def _read_geojson_file(self, slug: str, suffix: str) -> GeoJSONFeatureCollection:
        slug = _validate_slug(slug)
        path = self.data_dir / f"{slug}_{suffix}.geojson"
        if not path.exists():
            return GeoJSONFeatureCollection(features=[])
        raw = json.loads(path.read_text(encoding="utf-8"))
        return GeoJSONFeatureCollection(features=raw.get("features", []))

    def get_drains_geojson(self, slug: str) -> GeoJSONFeatureCollection:
        return self._read_geojson_file(slug, "drains")

    def get_parks_geojson(self, slug: str) -> GeoJSONFeatureCollection:
        return self._read_geojson_file(slug, "parks")

    def get_underpasses_geojson(self, slug: str) -> GeoJSONFeatureCollection:
        return self._read_geojson_file(slug, "underpasses")

    def get_micro_drains_geojson(self, slug: str) -> GeoJSONFeatureCollection:
        return self._read_geojson_file(slug, "micro_drains")

    def get_flow_paths(self, slug: str) -> FlowPathsResponse:
        slug = _validate_slug(slug)
        fp_path = self.data_dir / f"{slug}_flow_paths.geojson"
        road_path = self.data_dir / f"{slug}_road_flow.geojson"
        paths: list[FlowPathItem] = []

        # 0. Load real DEM-oriented OSM road surface water flow if extracted
        if road_path.exists():
            raw_r = json.loads(road_path.read_text(encoding="utf-8"))
            for idx, f in enumerate(raw_r.get("features", []), start=1):
                coords = f.get("geometry", {}).get("coordinates", [])
                props = f.get("properties", {}) or {}
                if len(coords) < 2:
                    continue
                ts = props.get("timestamps")
                if not ts or len(ts) != len(coords):
                    n = len(coords)
                    ts = [round(100.0 * i / (n - 1), 2) for i in range(n)]
                paths.append(
                    FlowPathItem(
                        id=str(props.get("id") or f"RD-{idx:03d}"),
                        kind="road",
                        intensity=float(min(1.0, max(0.3, props.get("intensity", 0.85)))),
                        path=[[round(float(c[0]), 6), round(float(c[1]), 6)] for c in coords],
                        timestamps=[float(t) for t in ts],
                    )
                )

        # 1. Load real DEM-traced D8 streamlines if extracted
        if fp_path.exists():
            raw = json.loads(fp_path.read_text(encoding="utf-8"))
            for idx, f in enumerate(raw.get("features", []), start=1):
                coords = f.get("geometry", {}).get("coordinates", [])
                props = f.get("properties", {}) or {}
                if len(coords) < 2:
                    continue
                ts = props.get("timestamps")
                if not ts or len(ts) != len(coords):
                    n = len(coords)
                    ts = [round(100.0 * i / (n - 1), 2) for i in range(n)]
                paths.append(
                    FlowPathItem(
                        id=str(props.get("id") or f"FP-{idx:03d}"),
                        kind="drain" if props.get("kind") == "drain" else "overland",
                        intensity=float(min(1.0, max(0.2, props.get("intensity", 0.7)))),
                        path=[[round(float(c[0]), 6), round(float(c[1]), 6)] for c in coords],
                        timestamps=[float(t) for t in ts],
                    )
                )
            if paths:
                return FlowPathsResponse(catchment_slug=slug, source="dem_d8", paths=paths)

        # 2. Instant fallback: synthesize downhill flow paths from zone perimeters -> centroids -> nearest drains + drain channels
        feats = self._load_zones(slug)
        for idx, f in enumerate(feats[:220], start=1):
            p = f.get("properties", {})
            c = p.get("_centroid")
            bb = p.get("_bbox")
            if not c or not bb:
                continue
            cx, cy = float(c[0]), float(c[1])
            dx = max(0.0012, (bb[2] - bb[0]) * 0.75)
            dy = max(0.0012, (bb[3] - bb[1]) * 0.75)
            # Two converging uphill tributaries flowing into the pooling pocket
            for branch, (ox, oy) in enumerate(((-dx, dy), (dx * 0.8, dy * 0.9)), start=1):
                start = [round(cx + ox, 6), round(cy + oy, 6)]
                mid = [round(cx + ox * 0.45, 6), round(cy + oy * 0.52, 6)]
                pts = [start, mid, [round(cx, 6), round(cy, 6)]]
                drain_pt = p.get("_nearest_drain_coord")
                if drain_pt and branch == 1:
                    pts.append([round((cx + drain_pt[0]) / 2.0, 6), round((cy + drain_pt[1]) / 2.0, 6)])
                    pts.append([round(float(drain_pt[0]), 6), round(float(drain_pt[1]), 6)])
                offset = float((idx * 13 + branch * 29) % 40)
                n = len(pts)
                ts = [round(offset + (60.0 * i / (n - 1)), 2) for i in range(n)]
                paths.append(
                    FlowPathItem(
                        id=f"OV-{idx:03d}-{branch}",
                        kind="overland",
                        intensity=round(float(min(1.0, max(0.35, float(p.get("twi_n", 0.6))))), 3),
                        path=pts,
                        timestamps=ts,
                    )
                )

        # Also animate water flowing along mapped OSM trunk drains
        drains_fc = self.get_drains_geojson(slug)
        for didx, df in enumerate(drains_fc.features[:140], start=1):
            geom = df.get("geometry", {})
            gtype = geom.get("type")
            lines = [geom.get("coordinates", [])] if gtype == "LineString" else (geom.get("coordinates", []) if gtype == "MultiLineString" else [])
            for lidx, line in enumerate(lines):
                if len(line) < 2:
                    continue
                step = max(1, len(line) // 24)
                sampled = line[::step]
                if sampled[-1] != line[-1]:
                    sampled.append(line[-1])
                n = len(sampled)
                offset = float((didx * 17 + lidx * 11) % 35)
                ts = [round(offset + (65.0 * i / (n - 1)), 2) for i in range(n)]
                paths.append(
                    FlowPathItem(
                        id=f"DR-{didx:03d}-{lidx}",
                        kind="drain",
                        intensity=0.95,
                        path=[[round(float(pt[0]), 6), round(float(pt[1]), 6)] for pt in sampled],
                        timestamps=ts,
                    )
                )

        return FlowPathsResponse(catchment_slug=slug, source="topology_synthesized", paths=paths)

    def get_terrain_patch(self, slug: str, zone_id: str, grid_size: int = 48) -> TerrainPatchResponse:
        slug = _validate_slug(slug)
        sim = self.simulate_zones(slug, SimulationRequest(rainfall_mm_hr=60.0, projection_years=0))
        target = next((f["properties"] for f in sim.zones_geojson.features if f["properties"]["zone_id"] == zone_id), None)
        if target is None:
            raise KeyError(f"Zone '{zone_id}' not found in catchment '{slug}'.")

        n = int(min(64, max(24, grid_size)))
        center_lng = float(target["centroid_lng"])
        center_lat = float(target["centroid_lat"])
        cell_size_m = round(960.0 / n, 1)  # ~960m x 960m local sandbox patch
        sink_m = max(0.45, float(target.get("sink_max_m", 0.8)))
        imp_pct = float(target.get("impervious_pct", 75.0))
        underpass = bool(target.get("underpass_trap", False))
        drain_coord = target.get("nearest_drain_coord")

        elev_grid: np.ndarray | None = None
        dem_source = "Zone-Parameterized Micro-Terrain (30m Screening)"

        # Attempt real DEM sampling if rasterio + local DEM raster are available
        try:
            import rasterio
            from rasterio.enums import Resampling
            from rasterio.windows import from_bounds

            raw_dir = self.data_dir.parent / "raw"
            cfg = self._load_config(slug)
            dem_candidates = [
                raw_dir / cfg.get("rasters", {}).get("dem_filename", "copernicus_barapullah.tif"),
                raw_dir / cfg.get("rasters", {}).get("dem_fallback_filename", "fabdem_barapullah.tif"),
            ]
            dem_path = next((p for p in dem_candidates if p.exists()), None)
            if dem_path is not None:
                half_deg_lat = 0.0043  # ~480m
                half_deg_lng = 0.0049
                with rasterio.open(dem_path) as src:
                    win = from_bounds(
                        center_lng - half_deg_lng,
                        center_lat - half_deg_lat,
                        center_lng + half_deg_lng,
                        center_lat + half_deg_lat,
                        transform=src.transform,
                    )
                    arr = src.read(1, window=win, out_shape=(n, n), resampling=Resampling.bilinear).astype(np.float64)
                    if np.isfinite(arr).all() and (arr.max() - arr.min()) > 0.05:
                        elev_grid = arr
                        dem_source = f"Real 30m DEM ({dem_path.name})"
        except Exception:
            elev_grid = None

        # Deterministic topographic basin seeded by the zone's real telemetry if DEM raster unavailable in API env
        yy, xx = np.mgrid[0:n, 0:n]
        u = (xx - (n - 1) / 2.0) / (n / 2.0)  # -1..1
        v = (yy - (n - 1) / 2.0) / (n / 2.0)  # -1..1
        dist2 = u * u + v * v

        if elev_grid is None:
            seed = sum(ord(ch) for ch in zone_id)
            ang = (seed % 360) * math.pi / 180.0
            # Regional slope + central pooling depression + subtle road corridor
            regional_slope = 1.8 * (u * math.cos(ang) + v * math.sin(ang))
            bowl = -(sink_m * 1.35 + (1.2 if underpass else 0.0)) * np.exp(-dist2 * 3.2)
            undulation = 0.35 * np.sin(u * 4.2 + seed) * np.cos(v * 3.8)
            road_trough = -0.45 * np.exp(-((v - 0.15 * u) ** 2) * 28.0)
            elev_grid = 216.0 + regional_slope + bowl + undulation + road_trough
        else:
            # Reinforce underpass dip if OSM layer=-1 is present (since 30m DSM smooths narrow underpasses)
            if underpass:
                elev_grid = elev_grid - 1.4 * np.exp(-dist2 * 14.0)

        # Normalize to relative elevation above lowest point for clean 3D rendering
        min_e = float(np.min(elev_grid))
        max_e = float(np.max(elev_grid))

        # Imperviousness mask (0..1): higher near urban core, lower near parks
        rng = np.random.default_rng(sum(ord(c) for c in zone_id) + 42)
        base_imp = min(0.95, max(0.15, imp_pct / 100.0))
        imp_grid = np.clip(base_imp + 0.14 * np.sin(u * 5.0) * np.cos(v * 5.0) + rng.normal(0, 0.06, (n, n)), 0.05, 0.98)

        # Locate drain outlet cells on the patch boundary/direction toward nearest OSM trunk drain
        drain_cells: list[int] = []
        if drain_coord:
            dlng = float(drain_coord[0]) - center_lng
            dlat = float(drain_coord[1]) - center_lat
            norm = math.hypot(dlng, dlat) or 1.0
            dc = int(round((n - 1) / 2.0 + (dlng / norm) * (n * 0.40)))
            dr = int(round((n - 1) / 2.0 - (dlat / norm) * (n * 0.40)))
        else:
            dc, dr = n - 4, n - 4
        dc = max(2, min(n - 3, dc))
        dr = max(2, min(n - 3, dr))
        for rr in range(dr - 1, dr + 2):
            for cc in range(dc - 1, dc + 2):
                drain_cells.append(int(rr * n + cc))
                # Carve slight drain channel at outlet
                elev_grid[rr, cc] = min(elev_grid[rr, cc], min_e + 0.15)

        min_e = float(np.min(elev_grid))
        max_e = float(np.max(elev_grid))

        underpass_cells: list[int] = []
        if underpass:
            c0 = n // 2
            for rr in range(c0 - 2, c0 + 2):
                for cc in range(c0 - 2, c0 + 2):
                    underpass_cells.append(int(rr * n + cc))

        return TerrainPatchResponse(
            catchment_slug=slug,
            zone_id=zone_id,
            grid_size=n,
            cell_size_m=cell_size_m,
            center_lat=center_lat,
            center_lng=center_lng,
            min_elev_m=round(min_e, 2),
            max_elev_m=round(max_e, 2),
            elevations=[round(float(v), 3) for v in elev_grid.ravel()],
            impervious_mask=[round(float(v), 3) for v in imp_grid.ravel()],
            drain_cells=drain_cells,
            underpass_cells=underpass_cells,
            sink_max_m=round(sink_m, 2),
            impervious_pct=round(imp_pct, 1),
            est_ponding_cm=int(target.get("est_ponding_cm", 25)),
            nearest_drain_name=str(target.get("nearest_drain_name", "Mapped Trunk Drain (OSM)")),
            dem_source=dem_source,
        )
