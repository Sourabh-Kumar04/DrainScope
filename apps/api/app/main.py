import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.dependencies import get_engine
from app.routers.catchments import router as catchments_router
from app.schemas import HealthResponse

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("drainscope.api")

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    response.headers["X-Process-Time-Ms"] = f"{ms:.1f}"
    logger.info("method=%s path=%s status=%s latency_ms=%.1f", request.method, request.url.path, response.status_code, ms)
    return response


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health():
    engine = get_engine()
    catchments = [c.slug for c in engine.list_catchments()]
    return HealthResponse(
        status="ok" if catchments else "degraded",
        version=settings.app_version,
        available_catchments=catchments,
    )


app.include_router(catchments_router)
