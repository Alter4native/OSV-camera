from collections import deque
from collections.abc import Mapping, Sequence
from math import ceil
from pathlib import Path
from statistics import mean
from threading import Lock
from time import perf_counter, monotonic
from typing import Any

import numpy as np

from app.detection.base import ObjectDetector, is_allowed_person_detection
from app.detection.schemas import BoundingBox, Detection, DetectorMetadata
from app.video.source import VideoFrame


class YoloDetector(ObjectDetector):
    default_pretrained_model = "yolo26n.pt"
    inference_image_size = 640
    telemetry_sample_limit = 60

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
        self._telemetry_lock = Lock()
        self._samples: deque[tuple[float, float, int, float, int, int]] = deque(
            maxlen=self.telemetry_sample_limit,
        )
        self._frames_processed = 0
        self._device = "waiting"

    def detect(self, frame: VideoFrame) -> Sequence[Detection]:
        model = self._get_model()
        detections: list[Detection] = []
        started_at = perf_counter()
        try:
            class_ids = self._allowed_class_ids(model)
            results = model.predict(
                frame.image,
                conf=self.confidence_threshold,
                classes=class_ids,
                imgsz=self.inference_image_size,
                max_det=100,
                quantize=16 if self._uses_cuda(model) else None,
                verbose=False,
            )

            for result in results:
                class_names = self._class_names(result)
                detections.extend(self._parse_result(frame, result, class_names))
            return detections
        finally:
            elapsed_ms = (perf_counter() - started_at) * 1000
            self._record_sample(frame, elapsed_ms, detections)

    def warmup(self) -> None:
        """Load model weights and initialize inference before the first camera frame."""
        model = self._get_model()
        model.predict(
            np.zeros((480, self.inference_image_size, 3), dtype=np.uint8),
            conf=self.confidence_threshold,
            classes=self._allowed_class_ids(model),
            imgsz=self.inference_image_size,
            max_det=100,
            quantize=16 if self._uses_cuda(model) else None,
            verbose=False,
        )
        with self._telemetry_lock:
            self._device = self._device_name(model)

    def metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            runtime="yolo",
            model_path=self.model_path,
            scope="person-only",
            confidence_threshold=self.confidence_threshold,
            loaded=self._model is not None,
        )

    def telemetry(self) -> dict[str, object]:
        with self._telemetry_lock:
            samples = list(self._samples)
            frames_processed = self._frames_processed
            device = self._device

        inference_times = [sample[1] for sample in samples]
        if len(samples) > 1:
            elapsed = samples[-1][0] - samples[0][0]
            processing_fps = (len(samples) - 1) / elapsed if elapsed > 0 else 0.0
        else:
            processing_fps = 0.0

        sorted_times = sorted(inference_times)
        p95_index = max(0, ceil(len(sorted_times) * 0.95) - 1)
        last = samples[-1] if samples else None
        average_confidence = last[3] if last else 0.0

        return {
            "model": Path(self.model_path).name or self.default_pretrained_model,
            "device": device,
            "loaded": self._model is not None,
            "processing_fps": round(processing_fps, 1),
            "inference_ms": round(last[1], 1) if last else None,
            "average_inference_ms": round(mean(inference_times), 1) if inference_times else None,
            "p95_inference_ms": round(sorted_times[p95_index], 1) if sorted_times else None,
            "frames_processed": frames_processed,
            "detections_last_frame": last[2] if last else 0,
            "average_confidence": round(average_confidence, 3),
            "frame_width": last[4] if last else 0,
            "frame_height": last[5] if last else 0,
        }

    def _record_sample(self, frame: VideoFrame, elapsed_ms: float, detections: Sequence[Detection]) -> None:
        average_confidence = mean(detection.confidence for detection in detections) if detections else 0.0
        sample = (
            monotonic(),
            elapsed_ms,
            len(detections),
            average_confidence,
            int(frame.width or 0),
            int(frame.height or 0),
        )
        with self._telemetry_lock:
            self._samples.append(sample)
            self._frames_processed += 1
            self._device = self._device_name(self._model)

    def _device_name(self, model: Any | None) -> str:
        if model is None:
            return "waiting"
        device = getattr(model, "device", None)
        if device is None:
            device = getattr(getattr(model, "model", None), "device", None)
        value = str(device or "cpu").lower()
        return "GPU" if "cuda" in value or "mps" in value else "CPU"

    def _uses_cuda(self, model: Any) -> bool:
        return self._device_name(model) == "GPU" and "cuda" in str(
            getattr(model, "device", getattr(getattr(model, "model", None), "device", "")),
        ).lower()

    def _allowed_class_ids(self, model: Any) -> list[int] | None:
        names = getattr(model, "names", None)
        if isinstance(names, dict):
            ids = [int(key) for key, name in names.items() if str(name) in self.allowed_class_names]
            return ids or None
        return None

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
