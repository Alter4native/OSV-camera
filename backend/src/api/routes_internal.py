from fastapi import APIRouter, Depends

from src.api.errors import not_found_to_http
from src.auth.dependencies import require_service_token
from src.db.session import get_db
from src.schemas.domain import CameraRead, CameraStatusUpdate, EventBatchIngest, EventRead
from src.services.db_store import NotFoundError, store


router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/events", response_model=list[EventRead])
def ingest_events(
    payload: EventBatchIngest,
    _service=Depends(require_service_token),
    session=Depends(get_db),
) -> list[EventRead]:
    return store.ingest_events(session, payload.events)


@router.patch("/cameras/{camera_id}/status", response_model=CameraRead)
def update_camera_status(
    camera_id: str,
    payload: CameraStatusUpdate,
    _service=Depends(require_service_token),
    session=Depends(get_db),
) -> CameraRead:
    try:
        return store.update_camera_status(session, camera_id, payload)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc
