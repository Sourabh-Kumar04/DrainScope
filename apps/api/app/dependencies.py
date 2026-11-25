import os
from functools import lru_cache
from pathlib import Path
from fastapi import Header
from app.config import get_settings
from app.services.simulation import CatchmentEngine


def _resolve_data_dir() -> Path:
    api_root = Path(__file__).resolve().parents[1]
    raw_candidates = [
        os.environ.get("DRAINSCOPE_DATA_DIR", "").strip(),
        str(get_settings().gis_data_dir),
    ]
    candidates: list[Path] = []
    for raw in raw_candidates:
        if not raw:
            continue
        p = Path(raw)
        if p.is_absolute():
            candidates.append(p)
        else:
            candidates.append(api_root / p)
            candidates.append(p.resolve())

    candidates.extend([
        api_root / "data",
        api_root.parent.parent / "packages" / "gis-pipeline" / "data" / "out",
    ])

    for cand in candidates:
        if cand.exists() and any(cand.glob("*_waterlogging_zones.geojson")):
            return cand
    return Path(get_settings().gis_data_dir)


@lru_cache
def get_engine() -> CatchmentEngine:
    return CatchmentEngine(data_dir=_resolve_data_dir())


def get_workspace_id(x_workspace_id: str | None = Header(default="default")) -> str:
    """Phase-1 tenant hook; replaced with verified JWT workspace claims in Phase 2."""
    return (x_workspace_id or "default").strip()[:64]
