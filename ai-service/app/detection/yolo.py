from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from app.detection.base import ObjectDetector, is_allowed_person_detection
from app.detection.schemas import BoundingBox, Detection, DetectorMetadata
from app.video.source import VideoFrame


class YoloDetector(ObjectDetector):
    default_pretrained_model = "yolov8n.pt"

    def __init__(
        self,
        model_path: str,
        confidence_threshold: float = 0.5,
        allowed_class_names: Sequence[str] = ("person",),
        model: Any | None = None,
    ) -> None:
        if not 0 <= confidence_threshold <= 1:
            raise ValueError("confidence_threshold must be between 0 and 1")

        self.model_path = model_path
        self.effective_model_path = self._effective_model_path(model_path)
        self.confidence_threshold = confidence_threshold
        self.allowed_class_names = tuple(allowed_class_names)
        self._model = model

    def detect(self, frame: VideoFrame) -> Sequence[Detection]:
        model = self._get_model()
        results = model.predict(frame.image, conf=self.confidence_threshold, verbose=False)

        detections: list[Detection] = []
        for result in results:
            class_names = self._class_names(result)
            detections.extend(self._parse_result(frame, result, class_names))

        return detections

    def metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            runtime="yolo",
            model_path=self.model_path,
            scope="person-only",
            confidence_threshold=self.confidence_threshold,
            loaded=self._model is not None,
        )

    def _get_model(self) -> Any:
        if self._model is None:
            try:
                from ultralytics import YOLO  # type: ignore[import-not-found]
            except ImportError as exc:
                raise RuntimeError("ultralytics is not installed") from exc

            self._model = YOLO(self.effective_model_path)

        return self._model

    def _effective_model_path(self, model_path: str) -> str:
        if model_path in {"", "auto"}:
            model_path = self.default_pretrained_model

        configured_path = Path(model_path)
        if configured_path.exists():
            return str(configured_path)

        project_model_path = Path(__file__).resolve().parents[2] / "models" / configured_path.name
        if project_model_path.exists():
            return str(project_model_path)

        if configured_path.name != self.default_pretrained_model:
            default_model_path = Path(__file__).resolve().parents[2] / "models" / self.default_pretrained_model
            if default_model_path.exists():
                return str(default_model_path)

        return str(configured_path)

    def _parse_result(
        self,
        frame: VideoFrame,
        result: Any,
        class_names: Mapping[int, str],
    ) -> list[Detection]:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            return []

        xyxy_values = self._to_list(getattr(boxes, "xyxy", []))
        confidence_values = self._to_list(getattr(boxes, "conf", []))
        class_values = self._to_list(getattr(boxes, "cls", []))

        detections: list[Detection] = []
        for xyxy, confidence, class_id_value in zip(xyxy_values, confidence_values, class_values):
            class_id = int(class_id_value)
            confidence_float = float(confidence)
            class_name = class_names.get(class_id, str(class_id))

            if class_name not in self.allowed_class_names:
                continue

            if not is_allowed_person_detection(
                class_name=class_name,
                confidence=confidence_float,
                confidence_threshold=self.confidence_threshold,
            ):
                continue

            bbox = BoundingBox(
                x1=float(xyxy[0]),
                y1=float(xyxy[1]),
                x2=float(xyxy[2]),
                y2=float(xyxy[3]),
            )
            detections.append(
                Detection.from_frame(
                    frame=frame,
                    bbox=bbox,
                    class_id=class_id,
                    class_name=class_name,
                    confidence=confidence_float,
                )
            )

        return detections

    def _class_names(self, result: Any) -> Mapping[int, str]:
        names = getattr(result, "names", None)
        if isinstance(names, dict):
            return {int(key): str(value) for key, value in names.items()}

        model_names = getattr(self._model, "names", None)
        if isinstance(model_names, dict):
            return {int(key): str(value) for key, value in model_names.items()}

        return {}

    def _to_list(self, value: Any) -> list[Any]:
        if hasattr(value, "detach"):
            value = value.detach()
        if hasattr(value, "cpu"):
            value = value.cpu()
        if hasattr(value, "tolist"):
            return value.tolist()
        return list(value)
