from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.errors import not_found_to_http
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.schemas.domain import EventRead, EventType
from src.services.db_store import NotFoundError, store


router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(
    camera_id: str | None = None,
    event_type: EventType | None = None,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _user=Depends(get_current_user),
    session=Depends(get_db),
) -> list[EventRead]:
    return store.list_events(
        session=session,
        camera_id=camera_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: str, _user=Depends(get_current_user), session=Depends(get_db)) -> EventRead:
    try:
        return store.get_event(session, event_id)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc


@router.get("/{event_id}/snapshot")
def get_event_snapshot(event_id: str, _user=Depends(get_current_user), session=Depends(get_db)) -> dict[str, object]:
    try:
        event = store.get_event(session, event_id)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc

    if event.snapshot_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

    return {
        "event_id": event.event_id,
        "snapshot_storage_key": event.snapshot_url,
        "access": "authorized",
    }
