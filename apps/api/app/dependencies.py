from functools import lru_cache
from fastapi import Header
from app.config import get_settings
from app.services.simulation import CatchmentEngine


@lru_cache
def get_engine() -> CatchmentEngine:
    return CatchmentEngine(data_dir=get_settings().gis_data_dir)


def get_workspace_id(x_workspace_id: str | None = Header(default="default")) -> str:
    """Phase-1 tenant hook; replaced with verified JWT workspace claims in Phase 2."""
    return (x_workspace_id or "default").strip()[:64]
