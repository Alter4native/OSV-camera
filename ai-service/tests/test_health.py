from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.detection.schemas import BoundingBox, Detection, DetectorMetadata
from app.main import app
import app.main as main_module
from app.video.source import VideoFrame


class FakeCameraManager:
    def __init__(self, frame: VideoFrame | None) -> None:
        self.frame = frame

    def read_next(self) -> VideoFrame | None:
        return self.frame

    def get_status(self) -> dict[str, object]:
        return {
            "camera_id": "test-camera",
            "source_type": "webcam",
            "source_uri": "0",
            "processing_fps": 5,
            "state": "online" if self.frame is not None else "offline",
        }


class FakeDetector:
    def __init__(self, detections: list[Detection]) -> None:
        self.detections = detections

    def detect(self, frame: VideoFrame) -> list[Detection]:
        return self.detections

    def metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            runtime="fake",
            model_path="fake.pt",
            scope="person-only",
            confidence_threshold=0.5,
            loaded=True,
        )


def test_ai_health() -> None:
    client = TestClient(app)

    response = client.get("/ai/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "ai-service"
    assert payload["status"] == "ok"
    assert payload["camera"]["status"]["state"] == "stopped"
    assert payload["detector"] == {
        "runtime": "yolo",
        "model_path": "yolo26n.pt",
        "scope": "person-only",
        "confidence_threshold": 0.65,
        "loaded": False,
    }
    assert payload["tracker"] == {
        "runtime": "bytetrack",
        "active_tracks": 0,
        "match_threshold": 0.3,
        "track_ttl_frames": 30,
        "new_track_threshold": 0.5,
    }
    assert payload["recognition"] == {
        "runtime": "simple",
        "model_name": "simple-hash-face-embedding",
        "embedding_dim": 32,
        "threshold": 0.65,
        "enrolled_embeddings": 0,
        "embedding_store": {
            "runtime": "memory",
            "collection": None,
            "status": "ready",
            "last_error": None,
        },
        "person_reid_enabled": False,
    }
    assert payload["events"] == {
        "pending_published_events": 0,
        "cooldown_keys": 0,
        "restricted_zones": 0,
    }


def test_camera_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/camera/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["camera_id"] == "local-camera"
    assert payload["source_type"] == "webcam"
    assert payload["processing_fps"] == 5


def test_detector_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/detector/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime"] == "yolo"
    assert payload["scope"] == "person-only"
    assert payload["loaded"] is False


def test_webcam_detect_once_returns_detections(monkeypatch) -> None:
    frame = VideoFrame(
        camera_id="test-camera",
        sequence=3,
        timestamp=datetime(2026, 6, 4, tzinfo=timezone.utc),
        image=object(),
        width=640,
        height=480,
    )
    detection = Detection.from_frame(
        frame=frame,
        bbox=BoundingBox(x1=10, y1=20, x2=110, y2=220),
        class_id=0,
        class_name="person",
        confidence=0.91,
    )
    monkeypatch.setattr(main_module, "camera_manager", FakeCameraManager(frame))
    monkeypatch.setattr(main_module, "detector", FakeDetector([detection]))
    client = TestClient(app)

    response = client.get("/ai/webcam/detect-once")

    assert response.status_code == 200
    payload = response.json()
    assert payload["camera_id"] == "test-camera"
    assert payload["frame"] == {"width": 640, "height": 480}
    assert payload["person_count"] == 1
    assert payload["detections"][0]["class_name"] == "person"
    assert payload["detections"][0]["confidence"] == 0.91


def test_tracker_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/tracker/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime"] == "bytetrack"
    assert payload["active_tracks"] == 0
    assert payload["track_ttl_frames"] == 30


def test_events_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/events/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["pending_published_events"] == 0
    assert payload["cooldown_keys"] == 0
    assert payload["restricted_zones"] == 0


def test_recognition_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/recognition/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime"] == "simple"
    assert payload["embedding_dim"] == 32
    assert payload["threshold"] == 0.65


def test_vector_status_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/ai/vector/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "runtime": "memory",
        "collection": None,
        "status": "ready",
        "last_error": None,
    }
