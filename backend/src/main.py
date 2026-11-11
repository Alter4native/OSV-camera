from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.routes_auth import router as auth_router
from src.api.routes_cameras import router as cameras_router
from src.api.routes_events import router as events_router
from src.api.routes_internal import router as internal_router
from src.api.routes_models import router as models_router
from src.api.routes_persons import router as persons_router
from src.api.routes_scans import router as scans_router
from src.api.routes_settings import router as settings_router
from src.config import get_settings
from src.db.session import initialize_database

settings = get_settings()

@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
initialize_database()

app.include_router(auth_router)
app.include_router(cameras_router)
app.include_router(events_router)
app.include_router(internal_router)
app.include_router(models_router)
app.include_router(persons_router)
app.include_router(scans_router)
app.include_router(settings_router)


def health_payload() -> dict[str, object]:
    return {
        "service": "backend",
        "status": "ok",
        "version": "0.1.0",
        "environment": settings.app_env,
        "dependencies": {
            "postgres": "configured",
            "redis": "configured",
            "qdrant": "configured",
        },
        "retention_days": settings.retention_days,
        "api": {
            "auth": "enabled",
            "cameras": "enabled",
            "events": "enabled",
            "persons": "enabled",
            "models": "enabled",
            "settings": "enabled",
            "internal": "service-token",
        },
    }


@app.get("/health", tags=["health"])
def health() -> dict[str, object]:
    return health_payload()


@app.get("/api/health", tags=["health"])
def prefixed_health() -> dict[str, object]:
    return health_payload()
