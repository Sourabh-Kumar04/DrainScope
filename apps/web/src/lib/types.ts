import type { Feature, FeatureCollection, Geometry } from "geojson";

export type MetricMode = "ips_score" | "wsi_score";
export type DisplayMode = "contours" | "h3";
export type BasemapMode = "dark" | "satellite";
export type StormPeriod = "2yr" | "5yr" | "10yr";
export type ProjectionYear = 0 | 2 | 5 | 10;
export type RiskTier = "Low" | "Moderate" | "High" | "Critical";

export interface DriverContribution {
  key: string;
  label: string;
  pct: number;
}

export interface NearbyUnderpass {
  name: string;
  coord: [number, number];
  dist_m: number;
}

export interface ZoneProperties {
  zone_id: string;
  contour_band: string;
  area_ha: number;
  wsi_score: number;
  ips_score: number;
  risk_tier: RiskTier;
  twi_p90: number;
  sink_max_m: number;
  impervious_pct: number;
  nearest_drain_m: number;
  nearest_drain_name: string;
  underpass_trap: boolean;
  arterial_road_m: number;
  park_name: string;
  park_area_sqm: number;
  nearest_park_m: number;
  wsi_delta: number;
  ips_delta: number;
  centroid_lng: number;
  centroid_lat: number;
  bbox: [number, number, number, number];
  nearest_drain_coord: [number, number] | null;
  nearest_park_coord: [number, number] | null;
  nearby_underpasses: NearbyUnderpass[];
  runoff_volume_kl: number;
  peak_flow_lps: number | null;
  rational_method_valid: boolean;
  rational_scope_note: string;
  est_ponding_cm: number;
  rain_to_flood_mm: number;
  park_capacity_kl: number;
  park_offset_pct: number;
  diagnosis_headline: string;
  diagnosis_summary: string;
  drivers: DriverContribution[];
  recommended_actions: string[];
}

export type ZoneGeoJSONFeature = Feature<Geometry, ZoneProperties>;
export type ZoneFeatureCollection = FeatureCollection<Geometry, ZoneProperties>;
export type GenericFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;

export interface HexFeature {
  h3_id: string;
  wsi_score: number;
  ips_score: number;
  risk_tier: RiskTier;
  twi_p90: number;
  sink_max_m: number;
  impervious_pct: number;
  nearest_drain_m: number;
  underpass_trap: boolean;
  arterial_road_m: number;
  park_name: string;
  park_area_sqm: number;
  nearest_park_m: number;
  wsi_delta: number;
  ips_delta: number;
}

export interface CatchmentSummary {
  catchment_slug: string;
  workspace_id: string;
  total_hexes: number;
  critical_count: number;
  high_count: number;
  moderate_count: number;
  low_count: number;
  mean_wsi: number;
  mean_ips: number;
  mean_wsi_delta: number;
  storm_return_period: StormPeriod;
  rainfall_mm_hr: number;
  projection_years: ProjectionYear;
  nbs_impervious_reduction_pct: number;
  park_detention_enabled: boolean;
}

export interface OrganicZonesResponse {
  summary: CatchmentSummary;
  zones_geojson: ZoneFeatureCollection;
}

export interface CatchmentHexResponse {
  summary: CatchmentSummary;
  hexes: HexFeature[];
}

export interface ScreenSiteInput {
  name: string;
  lat: number;
  lng: number;
}

export interface ScreenRequest {
  sites: ScreenSiteInput[];
  rainfall_mm_hr: number;
  projection_years: ProjectionYear;
  nbs_impervious_reduction_pct: number;
  park_detention_enabled: boolean;
}

export interface ScreenedSiteResult {
  name: string;
  lat: number;
  lng: number;
  in_catchment: boolean;
  matched_zone_id: string | null;
  match_type: "inside_zone" | "nearby_zone" | "outside_zones" | "outside_catchment";
  screening_score_100: number;
  risk_tier: RiskTier;
  est_ponding_cm: number;
  rain_to_flood_mm: number | null;
  impervious_pct: number | null;
  nearest_drain_name: string | null;
  nearest_drain_m: number | null;
  park_name: string | null;
  nearest_park_m: number | null;
  top_driver: string;
  diagnosis_headline: string;
}

export interface PortfolioScreenResponse {
  catchment_slug: string;
  total_sites: number;
  in_catchment_count: number;
  critical_count: number;
  high_count: number;
  moderate_count: number;
  low_count: number;
  mean_score_100: number;
  rainfall_mm_hr: number;
  projection_years: ProjectionYear;
  sites: ScreenedSiteResult[];
}

export interface ValidationReport {
  catchment_slug: string;
  validated: boolean;
  status_label: string;
  source_name?: string | null;
  incident_points_in_aoi: number;
  positive_cells: number;
  total_cells: number;
  roc_auc?: number | null;
  pr_auc?: number | null;
  lift_top_10_pct?: number | null;
  lift_top_20_pct?: number | null;
  hit_rate_top_20_pct?: number | null;
  evaluated_at_utc?: string | null;
  notes: string;
}

export interface MethodologyReport {
  catchment_slug: string;
  dem_resolution_m: number;
  spatial_uncertainty_note: string;
  dem_license_note: string;
  osm_drain_caveat: string;
  display_wsi_cutoff: number;
  rational_method_max_area_ha: number;
  wsi_weights: Record<string, number>;
  stress_scenarios: Record<
    string,
    { label: string; imp_creep: number; rain_mult: number; drain_decay: number; rationale: string }
  >;
}

export interface SimulationParams {
  rainfall_mm_hr: number;
  projection_years: ProjectionYear;
  nbs_impervious_reduction_pct: number;
  park_detention_enabled: boolean;
  target_zone_ids?: string[] | null;
}


export interface FlowPathItem {
  id: string;
  kind: "overland" | "drain" | "road";
  intensity: number;
  path: [number, number][];
  timestamps: number[];
}

export interface FlowPathsResponse {
  catchment_slug: string;
  source: "dem_d8" | "topology_synthesized";
  paths: FlowPathItem[];
}

export interface TerrainPatchResponse {
  catchment_slug: string;
  zone_id: string;
  grid_size: number;
  cell_size_m: number;
  center_lat: number;
  center_lng: number;
  min_elev_m: number;
  max_elev_m: number;
  elevations: number[];
  impervious_mask: number[];
  drain_cells: number[];
  underpass_cells: number[];
  sink_max_m: number;
  impervious_pct: number;
  est_ponding_cm: number;
  nearest_drain_name: string;
  dem_source: string;
}


export interface StreetDepthResponse {
  image_id: string;
  width: number;
  height: number;
  model_used: string;
  image_b64: string;
  ground_mask_b64: string;
}


export interface MicroDrainProperties {
  id: string;
  corridor: string;
  label: string;
  condition: "clear" | "silted" | "blocked";
  condition_note: string;
  confidence: number;
  est_dist_m: number;
  bbox_norm: [number, number, number, number];
  image_id: string;
  thumb_url: string;
  captured_date: string;
  compass_angle: number;
  sightings?: number;
  detector?: string;
}
