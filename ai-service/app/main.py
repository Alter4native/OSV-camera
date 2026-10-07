import base64
import time

from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, UploadFile

from app.config import get_settings
from app.detection.factory import build_detector
from app.detection.schemas import BoundingBox, Detection
from app.events.engine import EventEngine
from app.events.schemas import EventRuleConfig
from app.recognition.factory import build_face_recognizer
from app.tracking.factory import build_tracker
from app.video.manager import CameraConfig, CameraManager
from app.video.source import VideoFrame

settings = get_settings()
camera_manager = CameraManager(
    CameraConfig(
        camera_id=settings.camera_id,
        source_type=settings.camera_source_type,
        source_uri=settings.camera_source_uri,
        processing_fps=settings.processing_fps,
        reconnect_backoff_seconds=settings.reconnect_backoff_seconds,
        max_reconnect_backoff_seconds=settings.max_reconnect_backoff_seconds,
        open_timeout_ms=settings.camera_open_timeout_ms,
        read_timeout_ms=settings.camera_read_timeout_ms,
    )
)
detector = build_detector(
    runtime=settings.detector_runtime,
    model_path=settings.model_path,
    confidence_threshold=settings.person_confidence_threshold,
)
tracker = build_tracker(
    runtime=settings.tracker_runtime,
    match_threshold=settings.tracker_match_threshold,
    track_ttl_frames=settings.track_ttl_frames,
    new_track_threshold=settings.tracker_new_track_threshold,
)
browser_tracker = build_tracker(
    runtime=settings.tracker_runtime,
    match_threshold=settings.tracker_match_threshold,
    track_ttl_frames=settings.track_ttl_frames,
    new_track_threshold=settings.tracker_new_track_threshold,
)
face_recognizer = build_face_recognizer(
    runtime=settings.face_recognition_runtime,
    threshold=settings.face_recognition_threshold,
    embedding_dim=settings.face_embedding_dim,
    model_name=settings.face_embedding_model_name,
    embedding_store_runtime=settings.embedding_store_runtime,
    qdrant_url=settings.qdrant_url,
    qdrant_collection_name=settings.qdrant_collection_person_face_embeddings,
    qdrant_api_key=settings.qdrant_api_key,
    qdrant_timeout_seconds=settings.qdrant_timeout_seconds,
)
event_engine = EventEngine(
    config=EventRuleConfig(
        person_cooldown_seconds=settings.event_cooldown_seconds,
        known_person_cooldown_seconds=settings.known_person_event_cooldown_seconds,
        unknown_person_cooldown_seconds=settings.unknown_person_event_cooldown_seconds,
        restricted_zone_cooldown_seconds=settings.restricted_zone_event_cooldown_seconds,
        camera_offline_cooldown_seconds=settings.camera_offline_event_cooldown_seconds,
        people_count_interval_seconds=settings.people_count_interval_seconds,
    )
)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/ai/docs",
    openapi_url="/ai/openapi.json",
)


def health_payload() -> dict[str, object]:
    return {
        "service": "ai-service",
        "status": "ok",
        "version": "0.1.0",
        "environment": settings.app_env,
        "camera": {
            "camera_id": settings.camera_id,
            "source_type": settings.camera_source_type,
            "source_uri": settings.camera_source_uri,
            "processing_fps": settings.processing_fps,
            "status": camera_manager.get_status(),
        },
        "detector": detector.metadata().as_dict(),
        "tracker": tracker.metadata().as_dict(),
        "recognition": face_recognizer.metadata().as_dict(),
        "events": event_engine.metadata().as_dict(),
    }


@app.get("/health", tags=["health"])
def health() -> dict[str, object]:
    return health_payload()


@app.get("/ai/health", tags=["health"])
def prefixed_health() -> dict[str, object]:
    return health_payload()


@app.get("/ai/camera/status", tags=["camera"])
def camera_status() -> dict[str, object]:
    return camera_manager.get_status()


@app.get("/ai/detector/status", tags=["detector"])
def detector_status() -> dict[str, object]:
    return detector.metadata().as_dict()


@app.get("/ai/webcam/detect-once", tags=["detector"])
def webcam_detect_once(max_attempts: int = 10) -> dict[str, object]:
    if max_attempts <= 0:
        raise HTTPException(status_code=400, detail="max_attempts must be greater than 0")

    frame = None
    for _ in range(max_attempts):
        frame = camera_manager.read_next()
        if frame is not None:
            break
        time.sleep(0.05)

    if frame is None:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Unable to read a frame from the configured camera source",
                "camera": camera_manager.get_status(),
            },
        )

    try:
        detections, detector_payload = detect_people(frame)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Unable to run detector on webcam frame",
                "error": str(exc),
                "detector": detector.metadata().as_dict(),
            },
        ) from exc

    return {
        "camera_id": frame.camera_id,
        "frame_sequence": frame.sequence,
        "timestamp": frame.timestamp.isoformat(),
        "frame": {
            "width": frame.width,
            "height": frame.height,
        },
        "frame_image": None,
        "person_count": len(detections),
        "detections": [detection.as_dict() for detection in detections],
        "camera": camera_manager.get_status(),
        "detector": detector_payload,
    }


@app.post("/ai/webcam/detect-frame", tags=["detector"])
async def webcam_detect_frame(file: UploadFile = File(...)) -> dict[str, object]:
    image = await decode_uploaded_image(file)
    height, width = image.shape[:2]
    frame = VideoFrame(
        camera_id="browser-webcam",
        sequence=int(time.time() * 1000),
        timestamp=datetime.now(timezone.utc),
        image=image,
        width=width,
        height=height,
    )

    try:
        detections, detector_payload = detect_people(frame)
        tracked_objects = browser_tracker.update(frame.camera_id, frame.sequence, detections)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Unable to run detector on uploaded webcam frame",
                "error": str(exc),
                "detector": detector.metadata().as_dict(),
            },
        ) from exc

    return {
        "camera_id": frame.camera_id,
        "frame_sequence": frame.sequence,
        "timestamp": frame.timestamp.isoformat(),
        "frame": {
            "width": frame.width,
            "height": frame.height,
        },
        "frame_image": None,
        "person_count": len(tracked_objects),
        "detections": [detection.as_dict() for detection in detections],
        "tracks": [tracked_object.as_dict() for tracked_object in tracked_objects],
        "camera": {
            "camera_id": frame.camera_id,
            "source_type": "browser",
            "state": "online",
        },
        "detector": detector_payload,
    }


def detect_people(frame: VideoFrame) -> tuple[list[Detection], dict[str, object]]:
    metadata = detector.metadata().as_dict()
    try:
        return list(detector.detect(frame)), metadata
    except FileNotFoundError:
        return [demo_person_detection(frame)], metadata | {"demo_fallback": True}


def demo_person_detection(frame: VideoFrame) -> Detection:
    width = float(frame.width or 640)
    height = float(frame.height or 480)
    x1 = width * 0.36
    y1 = height * 0.18
    x2 = width * 0.64
    y2 = height * 0.86
    return Detection.from_frame(
        frame=frame,
        bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
        class_id=0,
        class_name="person",
        confidence=0.88,
    )


async def decode_uploaded_image(file: UploadFile) -> object:
    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="OpenCV is not installed") from exc

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded frame is empty")

    array = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Unable to decode uploaded frame")
    return image


def encode_frame_image(image: object) -> str | None:
    try:
        import cv2  # type: ignore[import-not-found]
    except ImportError:
        return None

    try:
        ok, buffer = cv2.imencode(".jpg", image)
    except Exception:
        return None

    if not ok:
        return None

    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


@app.get("/ai/tracker/status", tags=["tracker"])
def tracker_status() -> dict[str, object]:
    return tracker.metadata().as_dict()


@app.get("/ai/events/status", tags=["events"])
def events_status() -> dict[str, object]:
    return event_engine.metadata().as_dict()


@app.get("/ai/recognition/status", tags=["recognition"])
def recognition_status() -> dict[str, object]:
    return face_recognizer.metadata().as_dict()


@app.get("/ai/vector/status", tags=["recognition"])
def vector_status() -> dict[str, object]:
    return face_recognizer.metadata().embedding_store.as_dict()
