from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_engine, get_workspace_id
from app.schemas import (
    CatchmentMeta,
    CatchmentResponse,
    FlowPathsResponse,
    GeoJSONFeatureCollection,
    HexFeature,
    MethodologyReport,
    OrganicZonesResponse,
    PortfolioScreenResponse,
    ScreenRequest,
    SimulationRequest,
    StreetDepthRequest,
    StreetDepthResponse,
    TerrainPatchResponse,
    ValidationReport,
)
from app.services.simulation import CatchmentEngine
from app.services.street_depth import compute_street_depth_flood_assets

router = APIRouter(prefix="/v1/catchments", tags=["Catchments"])


@router.get("", response_model=list[CatchmentMeta])
def list_catchments(engine: CatchmentEngine = Depends(get_engine)):
    return engine.list_catchments()


@router.get("/{slug}/validation", response_model=ValidationReport)
def get_validation(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_validation_report(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/methodology", response_model=MethodologyReport)
def get_methodology(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_methodology_report(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/incidents", response_model=GeoJSONFeatureCollection)
def get_incidents_overlay(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_incidents_geojson(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{slug}/screen", response_model=PortfolioScreenResponse)
def screen_sites(
    slug: str,
    req: ScreenRequest,
    engine: CatchmentEngine = Depends(get_engine),
    workspace_id: str = Depends(get_workspace_id),
):
    try:
        return engine.screen_sites(slug, req, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/{slug}/zones/simulate", response_model=OrganicZonesResponse)
def simulate_organic_zones(
    slug: str,
    req: SimulationRequest,
    engine: CatchmentEngine = Depends(get_engine),
    workspace_id: str = Depends(get_workspace_id),
):
    try:
        return engine.simulate_zones(slug, req, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{slug}/hexes", response_model=CatchmentResponse)
def get_baseline_hexes(
    slug: str,
    engine: CatchmentEngine = Depends(get_engine),
    workspace_id: str = Depends(get_workspace_id),
):
    try:
        return engine.simulate(slug, SimulationRequest(), workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/{slug}/simulate", response_model=CatchmentResponse)
def simulate_catchment(
    slug: str,
    req: SimulationRequest,
    engine: CatchmentEngine = Depends(get_engine),
    workspace_id: str = Depends(get_workspace_id),
):
    try:
        return engine.simulate(slug, req, workspace_id=workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{slug}/hexes/{h3_id}", response_model=HexFeature)
def get_hex_profile(slug: str, h3_id: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_hex_profile(slug, h3_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{slug}/drains", response_model=GeoJSONFeatureCollection)
def get_drains_overlay(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_drains_geojson(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/parks", response_model=GeoJSONFeatureCollection)
def get_parks_overlay(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_parks_geojson(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/underpasses", response_model=GeoJSONFeatureCollection)
def get_underpasses_overlay(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_underpasses_geojson(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/micro-drains", response_model=GeoJSONFeatureCollection)
def get_micro_drains_overlay(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_micro_drains_geojson(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{slug}/flow-paths", response_model=FlowPathsResponse)
def get_flow_paths(slug: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_flow_paths(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/{slug}/zones/{zone_id}/terrain-patch", response_model=TerrainPatchResponse)
def get_zone_terrain_patch(slug: str, zone_id: str, engine: CatchmentEngine = Depends(get_engine)):
    try:
        return engine.get_terrain_patch(slug, zone_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/street/depth-flood", response_model=StreetDepthResponse)
def get_street_depth_flood(req: StreetDepthRequest):
    try:
        return compute_street_depth_flood_assets(req.image_id, req.access_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to process street depth map: {exc}")
