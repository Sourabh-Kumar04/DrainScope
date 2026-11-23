from typing import Any, Literal
from pydantic import BaseModel, Field

RiskTier = Literal["Low", "Moderate", "High", "Critical"]
StormReturnPeriod = Literal["2yr", "5yr", "10yr"]
ProjectionYear = Literal[0, 2, 5, 10]


class CatchmentMeta(BaseModel):
    slug: str
    hex_count: int
    has_drains_layer: bool


class HexFeature(BaseModel):
    h3_id: str
    wsi_score: float = Field(ge=0.0, le=1.0)
    ips_score: float = Field(ge=0.0, le=1.0)
    risk_tier: RiskTier
    twi_p90: float
    sink_max_m: float
    impervious_pct: float = Field(ge=0.0, le=100.0)
    nearest_drain_m: float = Field(ge=0.0)
    underpass_trap: bool
    arterial_road_m: float = Field(ge=0.0)
    park_name: str
    park_area_sqm: float = Field(ge=0.0)
    nearest_park_m: float = Field(ge=0.0)
    wsi_delta: float = 0.0
    ips_delta: float = 0.0


class CatchmentSummary(BaseModel):
    catchment_slug: str
    workspace_id: str
    total_hexes: int
    critical_count: int
    high_count: int
    moderate_count: int
    low_count: int
    mean_wsi: float
    mean_ips: float
    mean_wsi_delta: float = 0.0
    storm_return_period: StormReturnPeriod
    rainfall_mm_hr: float = 60.0
    projection_years: ProjectionYear = 0
    nbs_impervious_reduction_pct: float
    park_detention_enabled: bool


class SimulationRequest(BaseModel):
    storm_return_period: StormReturnPeriod | None = Field(
        default=None,
        description="Optional legacy return period ('2yr', '5yr', '10yr'); overridden when rainfall_mm_hr is provided.",
    )
    rainfall_mm_hr: float | None = Field(
        default=None,
        ge=10.0,
        le=150.0,
        description="Continuous rainfall intensity in mm/hr (10-150 mm/hr).",
    )
    projection_years: ProjectionYear = Field(
        default=0,
        description="Illustrative stress scenario horizon in years (0, 2, 5, or 10) — not a climate forecast.",
    )
    nbs_impervious_reduction_pct: float = Field(
        default=0.0,
        ge=0.0,
        le=40.0,
        description="Percentage points of paved surface converted to permeable/bioswale cover.",
    )
    park_detention_enabled: bool = Field(
        default=False,
        description="Apply detention credit for zones within 350m of a mapped >=0.25 ha park.",
    )
    target_h3_ids: list[str] | None = Field(
        default=None,
        description="Optional subset of H3 IDs for localized simulation; None applies catchment-wide.",
    )
    target_zone_ids: list[str] | None = Field(
        default=None,
        description="Optional subset of organic zone IDs for localized 'Test Fix on This Zone' simulation.",
    )


class CatchmentResponse(BaseModel):
    summary: CatchmentSummary
    hexes: list[HexFeature]


class GeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]


class OrganicZonesResponse(BaseModel):
    summary: CatchmentSummary
    zones_geojson: GeoJSONFeatureCollection


class ScreenSiteInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)


class ScreenRequest(BaseModel):
    sites: list[ScreenSiteInput] = Field(min_length=1, max_length=100)
    rainfall_mm_hr: float = Field(default=60.0, ge=10.0, le=150.0)
    projection_years: ProjectionYear = Field(default=0)
    nbs_impervious_reduction_pct: float = Field(default=0.0, ge=0.0, le=40.0)
    park_detention_enabled: bool = Field(default=False)


class ScreenedSiteResult(BaseModel):
    name: str
    lat: float
    lng: float
    in_catchment: bool
    matched_zone_id: str | None = None
    match_type: Literal["inside_zone", "nearby_zone", "outside_zones", "outside_catchment"]
    screening_score_100: int = Field(ge=0, le=100)
    risk_tier: RiskTier
    est_ponding_cm: int
    rain_to_flood_mm: float | None = None
    impervious_pct: float | None = None
    nearest_drain_name: str | None = None
    nearest_drain_m: float | None = None
    park_name: str | None = None
    nearest_park_m: float | None = None
    top_driver: str
    diagnosis_headline: str


class PortfolioScreenResponse(BaseModel):
    catchment_slug: str
    total_sites: int
    in_catchment_count: int
    critical_count: int
    high_count: int
    moderate_count: int
    low_count: int
    mean_score_100: float
    rainfall_mm_hr: float
    projection_years: ProjectionYear
    sites: list[ScreenedSiteResult]


class ValidationReport(BaseModel):
    catchment_slug: str
    validated: bool
    status_label: str
    source_name: str | None = None
    incident_points_in_aoi: int = 0
    positive_cells: int = 0
    total_cells: int = 0
    roc_auc: float | None = None
    pr_auc: float | None = None
    lift_top_10_pct: float | None = None
    lift_top_20_pct: float | None = None
    hit_rate_top_20_pct: float | None = None
    evaluated_at_utc: str | None = None
    notes: str


class MethodologyReport(BaseModel):
    catchment_slug: str
    dem_resolution_m: int = 30
    spatial_uncertainty_note: str
    dem_license_note: str
    osm_drain_caveat: str
    display_wsi_cutoff: float
    rational_method_max_area_ha: float
    wsi_weights: dict[str, float]
    stress_scenarios: dict[str, dict[str, Any]]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    available_catchments: list[str]


class FlowPathItem(BaseModel):
    id: str
    kind: Literal["overland", "drain", "road"]
    intensity: float = Field(ge=0.0, le=1.0)
    path: list[list[float]]
    timestamps: list[float]


class FlowPathsResponse(BaseModel):
    catchment_slug: str
    source: Literal["dem_d8", "topology_synthesized"]
    paths: list[FlowPathItem]


class TerrainPatchResponse(BaseModel):
    catchment_slug: str
    zone_id: str
    grid_size: int
    cell_size_m: float
    center_lat: float
    center_lng: float
    min_elev_m: float
    max_elev_m: float
    elevations: list[float]
    impervious_mask: list[float]
    drain_cells: list[int]
    underpass_cells: list[int]
    sink_max_m: float
    impervious_pct: float
    est_ponding_cm: int
    nearest_drain_name: str
    dem_source: str


class StreetDepthRequest(BaseModel):
    image_id: str = Field(min_length=3, max_length=64)
    access_token: str = Field(min_length=10, max_length=256)


class StreetDepthResponse(BaseModel):
    image_id: str
    width: int
    height: int
    model_used: str
    image_b64: str
    ground_mask_b64: str
