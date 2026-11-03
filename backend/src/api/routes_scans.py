import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from src.auth.dependencies import require_roles
from src.config import get_settings
from src.schemas.domain import Role
from src.services.scan_storage import ScanStorage


router = APIRouter(prefix="/api/scans", tags=["scans"])
MAX_FRAME_BYTES = 8 * 1024 * 1024
scan_storage = ScanStorage(get_settings().scan_storage_path)


@router.post("/samples", status_code=status.HTTP_201_CREATED)
async def save_scan_sample(
    session_id: str = Form(...),
    metadata: str = Form(...),
    frame: UploadFile = File(...),
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
) -> dict[str, object]:
    try:
        str(uuid.UUID(session_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid scan session ID") from exc
    if len(metadata) > 512 * 1024:
        raise HTTPException(status_code=413, detail="Scan metadata is too large")
    try:
        parsed_metadata = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid scan metadata JSON") from exc
    if not isinstance(parsed_metadata, dict):
        raise HTTPException(status_code=400, detail="Scan metadata must be a JSON object")
    if frame.content_type not in {"image/jpeg", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="Only JPEG frames are supported")

    frame_bytes = await frame.read(MAX_FRAME_BYTES + 1)
    if len(frame_bytes) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Frame exceeds 8 MiB")
    try:
        return scan_storage.save_sample(session_id, frame_bytes, parsed_metadata)
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
