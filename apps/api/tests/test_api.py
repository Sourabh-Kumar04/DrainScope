import json
from pathlib import Path
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.dependencies import get_engine
from app.main import app
from app.services.simulation import CatchmentEngine


@pytest.fixture
def test_client(tmp_path: Path):
    df = pd.DataFrame([
        {
            "h3_id": "893da100003ffff",
            "wsi_score": 0.72,
            "ips_score": 0.58,
            "twi_p90": 11.4,
            "sink_max_m": 1.2,
            "impervious_pct": 88.0,
            "nearest_drain_m": 280.0,
            "underpass_trap": True,
            "arterial_road_m": 420.0,
            "park_name": "Jahanpanah City Forest",
            "park_area_sqm": 25000.0,
            "nearest_park_m": 190.0,
        },
        {
            "h3_id": "893da100007ffff",
            "wsi_score": 0.31,
            "ips_score": 0.14,
            "twi_p90": 5.2,
            "sink_max_m": 0.1,
            "impervious_pct": 24.0,
            "nearest_drain_m": 45.0,
            "underpass_trap": False,
            "arterial_road_m": 60.0,
            "park_name": "Deer Park",
            "park_area_sqm": 50000.0,
            "nearest_park_m": 80.0,
        },
    ])
    df.to_parquet(tmp_path / "barapullah_h3_scores.parquet", index=False)

    drains_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "Barapullah Drain", "waterway": "drain"},
                "geometry": {"type": "LineString", "coordinates": [[77.21, 28.54], [77.24, 28.58]]},
            }
        ],
    }
    (tmp_path / "barapullah_drains.geojson").write_text(json.dumps(drains_geojson), encoding="utf-8")

    parks_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"park_name": "Deer Park", "park_area_sqm": 50000.0},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[77.22, 28.55], [77.225, 28.55], [77.225, 28.555], [77.22, 28.555], [77.22, 28.55]]],
                },
            }
        ],
    }
    (tmp_path / "barapullah_parks.geojson").write_text(json.dumps(parks_geojson), encoding="utf-8")

    zones_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "zone_id": "Z-001",
                    "contour_band": "High",
                    "area_ha": 1.4,
                    "twi_p90": 11.2,
                    "sink_max_m": 1.1,
                    "impervious_pct": 86.0,
                    "nearest_drain_m": 240.0,
                    "underpass_trap": True,
                    "arterial_road_m": 320.0,
                    "park_name": "Deer Park",
                    "park_area_sqm": 50000.0,
                    "nearest_park_m": 180.0,
                    "twi_n": 0.8,
                    "trap_n": 0.7,
                    "drain_def_n": 0.75,
                    "impact_n": 0.7,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[77.23, 28.56], [77.232, 28.56], [77.232, 28.562], [77.23, 28.562], [77.23, 28.56]]],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "zone_id": "Z-BIG",
                    "contour_band": "Critical",
                    "area_ha": 72.5,
                    "twi_p90": 12.0,
                    "sink_max_m": 0.9,
                    "impervious_pct": 80.0,
                    "nearest_drain_m": 300.0,
                    "underpass_trap": False,
                    "arterial_road_m": 500.0,
                    "park_name": "Deer Park",
                    "park_area_sqm": 50000.0,
                    "nearest_park_m": 220.0,
                    "twi_n": 0.85,
                    "trap_n": 0.5,
                    "drain_def_n": 0.8,
                    "impact_n": 0.75,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[77.24, 28.57], [77.245, 28.57], [77.245, 28.575], [77.24, 28.575], [77.24, 28.57]]],
                },
            },
        ],
    }
    (tmp_path / "barapullah_waterlogging_zones.geojson").write_text(json.dumps(zones_geojson), encoding="utf-8")

    engine = CatchmentEngine(data_dir=tmp_path)
    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app), tmp_path
    app.dependency_overrides.clear()


def test_health_and_list(test_client):
    client, _ = test_client
    r = client.get("/health")
    assert r.status_code == 200
    assert "barapullah" in r.json()["available_catchments"]
    assert "X-Process-Time-Ms" in r.headers
    r_list = client.get("/v1/catchments")
    assert r_list.status_code == 200 and r_list.json()[0]["slug"] == "barapullah"


def test_h3_storm_and_nbs_directionality(test_client):
    client, _ = test_client
    r_2yr = client.post("/v1/catchments/barapullah/simulate", json={"storm_return_period": "2yr"})
    r_10yr = client.post("/v1/catchments/barapullah/simulate", json={"storm_return_period": "10yr"})
    assert r_2yr.status_code == 200 and r_10yr.status_code == 200
    assert r_10yr.json()["summary"]["mean_wsi"] > r_2yr.json()["summary"]["mean_wsi"]

    r_nbs = client.post(
        "/v1/catchments/barapullah/simulate",
        json={"storm_return_period": "10yr", "nbs_impervious_reduction_pct": 25.0, "park_detention_enabled": True},
    )
    assert r_nbs.status_code == 200
    assert r_nbs.json()["summary"]["mean_wsi"] < r_10yr.json()["summary"]["mean_wsi"]


def test_rational_method_small_catchment_cap(test_client):
    client, _ = test_client
    r = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 60.0, "projection_years": 0})
    assert r.status_code == 200
    by_id = {f["properties"]["zone_id"]: f["properties"] for f in r.json()["zones_geojson"]["features"]}

    # Small zone (1.4 ha <= 50 ha): valid Rational Method peak discharge
    assert by_id["Z-001"]["rational_method_valid"] is True
    assert by_id["Z-001"]["peak_flow_lps"] is not None and by_id["Z-001"]["peak_flow_lps"] > 0

    # Large merged zone (72.5 ha > 50 ha): peak flow suppressed
    assert by_id["Z-BIG"]["rational_method_valid"] is False
    assert by_id["Z-BIG"]["peak_flow_lps"] is None
    assert ">50 ha" in by_id["Z-BIG"]["rational_scope_note"]


def test_stress_scenario_monotonicity(test_client):
    client, _ = test_client
    scores = []
    for yr in (0, 2, 5, 10):
        r = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 50.0, "projection_years": yr})
        assert r.status_code == 200
        scores.append(r.json()["summary"]["mean_wsi"])
    assert scores[0] <= scores[1] <= scores[2] <= scores[3]
    assert scores[3] > scores[0]


def test_variable_rainfall_bounds_and_monotonicity(test_client):
    client, _ = test_client
    r_low = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 10.0})
    r_high = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 150.0})
    assert r_low.status_code == 200 and r_high.status_code == 200
    assert r_high.json()["summary"]["mean_wsi"] > r_low.json()["summary"]["mean_wsi"]

    # Out-of-bounds rainfall rejected by Pydantic
    assert client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 5.0}).status_code == 422
    assert client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 200.0}).status_code == 422


def test_localized_target_zone_isolation(test_client):
    client, _ = test_client
    base = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 60.0}).json()
    base_by_id = {f["properties"]["zone_id"]: f["properties"] for f in base["zones_geojson"]["features"]}

    fix = client.post(
        "/v1/catchments/barapullah/zones/simulate",
        json={
            "rainfall_mm_hr": 60.0,
            "nbs_impervious_reduction_pct": 30.0,
            "park_detention_enabled": True,
            "target_zone_ids": ["Z-001"],
        },
    ).json()
    fix_by_id = {f["properties"]["zone_id"]: f["properties"] for f in fix["zones_geojson"]["features"]}

    assert fix_by_id["Z-001"]["wsi_score"] < base_by_id["Z-001"]["wsi_score"]
    assert fix_by_id["Z-BIG"]["wsi_score"] == base_by_id["Z-BIG"]["wsi_score"]


def test_validation_endpoint_unvalidated_default(test_client):
    client, _ = test_client
    r = client.get("/v1/catchments/barapullah/validation")
    assert r.status_code == 200
    body = r.json()
    assert body["validated"] is False
    assert "Unvalidated" in body["status_label"]


def test_validation_endpoint_with_real_report(test_client):
    client, tmp_path = test_client
    report = {
        "catchment_slug": "barapullah",
        "validated": True,
        "status_label": "Validated Screening · AUC 0.81 · Top-10% Lift 2.9x",
        "source_name": "Delhi Traffic Police Waterlogging List",
        "incident_points_in_aoi": 42,
        "positive_cells": 36,
        "total_cells": 716,
        "roc_auc": 0.81,
        "pr_auc": 0.34,
        "lift_top_10_pct": 2.9,
        "lift_top_20_pct": 2.1,
        "hit_rate_top_20_pct": 42.0,
        "evaluated_at_utc": "2026-11-20T00:00:00Z",
        "notes": "Test validation",
    }
    (tmp_path / "barapullah_validation.json").write_text(json.dumps(report), encoding="utf-8")
    r = client.get("/v1/catchments/barapullah/validation")
    assert r.status_code == 200
    body = r.json()
    assert body["validated"] is True
    assert body["roc_auc"] == 0.81
    assert body["lift_top_10_pct"] == 2.9


def test_methodology_endpoint(test_client):
    client, _ = test_client
    r = client.get("/v1/catchments/barapullah/methodology")
    assert r.status_code == 200
    body = r.json()
    assert body["display_wsi_cutoff"] == 0.38
    assert body["rational_method_max_area_ha"] == 50.0
    assert "Copernicus" in body["dem_license_note"]
    assert "OpenStreetMap" in body["osm_drain_caveat"]


def test_missing_optional_overlays_return_empty_fc(test_client):
    client, _ = test_client
    r_up = client.get("/v1/catchments/barapullah/underpasses")
    assert r_up.status_code == 200
    assert r_up.json() == {"type": "FeatureCollection", "features": []}


def test_drains_and_invalid_slug_blocked(test_client):
    client, _ = test_client
    r_drains = client.get("/v1/catchments/barapullah/drains")
    assert r_drains.status_code == 200
    assert len(r_drains.json()["features"]) == 1
    assert client.get("/v1/catchments/..%2Fetc/hexes").status_code in (400, 404)
    assert client.get("/v1/catchments/bad$slug/validation").status_code == 400


def test_osm_drain_name_and_actions_populated(test_client):
    client, _ = test_client
    r = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 60.0})
    feat = r.json()["zones_geojson"]["features"][0]["properties"]
    assert feat["nearest_drain_name"] == "Barapullah Drain"
    assert len(feat["recommended_actions"]) >= 2
    assert any("OSM" in d["label"] for d in feat["drivers"])


def test_rain_to_flood_threshold_present(test_client):
    client, _ = test_client
    r = client.post("/v1/catchments/barapullah/zones/simulate", json={"rainfall_mm_hr": 60.0})
    assert r.status_code == 200
    feat = r.json()["zones_geojson"]["features"][0]["properties"]
    assert 10.0 <= feat["rain_to_flood_mm"] <= 150.0


def test_portfolio_site_screener_inside_and_outside(test_client):
    client, _ = test_client
    payload = {
        "rainfall_mm_hr": 60.0,
        "projection_years": 0,
        "sites": [
            {"name": "Inside Z-001", "lat": 28.561, "lng": 77.231},
            {"name": "Outside AOI", "lat": 19.076, "lng": 72.877},
        ],
    }
    r = client.post("/v1/catchments/barapullah/screen", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["total_sites"] == 2
    assert body["in_catchment_count"] == 1
    assert body["sites"][0]["match_type"] == "inside_zone"
    assert body["sites"][0]["matched_zone_id"] == "Z-001"
    assert body["sites"][0]["screening_score_100"] > 50
    assert body["sites"][1]["in_catchment"] is False
    assert body["sites"][1]["match_type"] == "outside_catchment"


def test_incidents_endpoint_reads_csv(test_client):
    client, tmp_path = test_client
    raw_dir = tmp_path.parent / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "delhi_waterlogging_incidents.csv").write_text(
        "name,lat,lon,source\nMoolchand,28.5644,77.2342,Delhi Traffic Police\n",
        encoding="utf-8",
    )
    r = client.get("/v1/catchments/barapullah/incidents")
    assert r.status_code == 200
    feats = r.json()["features"]
    assert len(feats) == 1
    assert feats[0]["properties"]["name"] == "Moolchand"


def test_flow_paths_endpoint(test_client):
    client, _ = test_client
    r = client.get("/v1/catchments/barapullah/flow-paths")
    assert r.status_code == 200
    body = r.json()
    assert body["catchment_slug"] == "barapullah"
    assert len(body["paths"]) > 0
    first = body["paths"][0]
    assert len(first["path"]) == len(first["timestamps"])
    assert len(first["path"]) >= 2


def test_terrain_patch_endpoint(test_client):
    client, _ = test_client
    r = client.get("/v1/catchments/barapullah/zones/Z-001/terrain-patch")
    assert r.status_code == 200
    body = r.json()
    n = body["grid_size"]
    assert n == 48
    assert len(body["elevations"]) == n * n
    assert len(body["impervious_mask"]) == n * n
    assert len(body["drain_cells"]) >= 1
    assert body["max_elev_m"] > body["min_elev_m"]


def test_terrain_patch_unknown_zone_404(test_client):
    client, _ = test_client
    r = client.get("/v1/catchments/barapullah/zones/Z-NOPE/terrain-patch")
    assert r.status_code == 404
