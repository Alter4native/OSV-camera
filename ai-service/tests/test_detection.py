from datetime import datetime, timezone

import pytest

from app.detection.factory import build_detector
from app.detection.mock import MockPersonDetector
from app.detection.schemas import BoundingBox, Detection
from app.detection.yolo import YoloDetector
from app.video.source import VideoFrame


class FakeBoxes:
    def __init__(
        self,
        xyxy: list[list[float]],
        conf: list[float],
        cls: list[int],
    ) -> None:
        self.xyxy = xyxy
        self.conf = conf
        self.cls = cls


class FakeResult:
    def __init__(self, boxes: FakeBoxes | None, names: dict[int, str]) -> None:
        self.boxes = boxes
        self.names = names


class FakeModel:
    names = {0: "person", 2: "car"}

    def __init__(self, results: list[FakeResult]) -> None:
        self.results = results

    def predict(
        self,
        image: object,
        conf: float,
        classes: list[int] | None,
        imgsz: int,
        max_det: int,
        quantize: int | None,
        verbose: bool,
    ) -> list[FakeResult]:
        assert image == "image"
        assert conf == 0.5
        assert classes == [0]
        assert imgsz == 640
        assert max_det == 100
        assert quantize is None
        assert verbose is False
        return self.results


def make_frame() -> VideoFrame:
    return VideoFrame(
        camera_id="camera-1",
        sequence=42,
        timestamp=datetime(2026, 5, 21, tzinfo=timezone.utc),
        image="image",
        width=640,
        height=480,
    )


def test_bounding_box_rejects_invalid_coordinates() -> None:
    with pytest.raises(ValueError, match="BoundingBox"):
        BoundingBox(x1=20, y1=10, x2=10, y2=30)


def test_detection_serializes_metadata() -> None:
    detection = Detection.from_frame(
        frame=make_frame(),
        bbox=BoundingBox(x1=1, y1=2, x2=11, y2=22),
        class_id=0,
        class_name="person",
        confidence=0.91,
    )

    payload = detection.as_dict()

    assert payload["camera_id"] == "camera-1"
    assert payload["frame_sequence"] == 42
    assert payload["class_name"] == "person"
    assert payload["bbox"] == {
        "x1": 1,
        "y1": 2,
        "x2": 11,
        "y2": 22,
        "width": 10,
        "height": 20,
    }


def test_yolo_detector_returns_only_person_above_threshold() -> None:
    result = FakeResult(
        boxes=FakeBoxes(
            xyxy=[
                [10, 20, 110, 220],
                [30, 40, 90, 120],
                [5, 6, 45, 80],
            ],
            conf=[0.91, 0.92, 0.49],
            cls=[0, 2, 0],
        ),
        names={0: "person", 2: "car"},
    )
    detector = YoloDetector(
        model_path="fake.pt",
        confidence_threshold=0.5,
        model=FakeModel([result]),
    )

    detections = detector.detect(make_frame())

    assert len(detections) == 1
    detection = detections[0]
    assert detection.class_name == "person"
    assert detection.confidence == 0.91
    assert detection.bbox.as_xyxy() == [10, 20, 110, 220]


def test_yolo_detector_handles_empty_results() -> None:
    detector = YoloDetector(
        model_path="fake.pt",
        confidence_threshold=0.5,
        model=FakeModel([FakeResult(boxes=None, names={0: "person"})]),
    )

    assert detector.detect(make_frame()) == []


def test_yolo_detector_metadata_reports_lazy_loaded_state() -> None:
    detector = YoloDetector(model_path="yolov8n.pt", confidence_threshold=0.5)

    metadata = detector.metadata().as_dict()

    assert metadata["runtime"] == "yolo"
    assert metadata["scope"] == "person-only"
    assert metadata["model_path"] == "yolov8n.pt"
    assert metadata["loaded"] is False


def test_yolo_detector_rejects_invalid_threshold() -> None:
    with pytest.raises(ValueError, match="confidence_threshold"):
        YoloDetector(model_path="fake.pt", confidence_threshold=1.5)


def test_mock_person_detector_maps_detection_to_input_frame() -> None:
    detector = MockPersonDetector(
        [
            Detection.from_frame(
                frame=make_frame(),
                bbox=BoundingBox(x1=1, y1=2, x2=3, y2=4),
                class_id=0,
                class_name="person",
                confidence=0.9,
            )
        ]
    )
    frame = VideoFrame(
        camera_id="camera-2",
        sequence=7,
        timestamp=datetime(2026, 5, 21, 1, tzinfo=timezone.utc),
        image="image",
    )

    detections = detector.detect(frame)

    assert len(detections) == 1
    assert detections[0].camera_id == "camera-2"
    assert detections[0].frame_sequence == 7
    assert detections[0].timestamp == frame.timestamp


def test_detector_factory_builds_yolo_detector() -> None:
    detector = build_detector(runtime="yolo", model_path="yolov8n.pt", confidence_threshold=0.6)

    metadata = detector.metadata().as_dict()
    assert metadata["runtime"] == "yolo"
    assert metadata["model_path"] == "yolov8n.pt"
    assert metadata["confidence_threshold"] == 0.6


def test_detector_factory_rejects_unknown_runtime() -> None:
    with pytest.raises(ValueError, match="Unsupported detector runtime"):
        build_detector(runtime="unknown", model_path="model.pt", confidence_threshold=0.5)
