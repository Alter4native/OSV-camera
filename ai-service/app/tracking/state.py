from dataclasses import dataclass
from datetime import datetime

from app.detection.schemas import BoundingBox, Detection


def bbox_iou(left: BoundingBox, right: BoundingBox) -> float:
    intersection_x1 = max(left.x1, right.x1)
    intersection_y1 = max(left.y1, right.y1)
    intersection_x2 = min(left.x2, right.x2)
    intersection_y2 = min(left.y2, right.y2)

    intersection_width = max(0.0, intersection_x2 - intersection_x1)
    intersection_height = max(0.0, intersection_y2 - intersection_y1)
    intersection_area = intersection_width * intersection_height

    left_area = left.width * left.height
    right_area = right.width * right.height
    union_area = left_area + right_area - intersection_area

    if union_area <= 0:
        return 0.0

    return intersection_area / union_area


@dataclass
class Track:
    track_id: int
    camera_id: str
    bbox: BoundingBox
    class_id: int
    class_name: str
    confidence: float
    last_frame_sequence: int
    last_seen_at: datetime
    hits: int = 1
    confidence_smoothing: float = 0.35

    def update(self, detection: Detection) -> None:
        self.bbox = detection.bbox
        self.class_id = detection.class_id
        self.class_name = detection.class_name
        self.confidence = (
            self.confidence * (1 - self.confidence_smoothing)
            + detection.confidence * self.confidence_smoothing
        )
        self.last_frame_sequence = detection.frame_sequence
        self.last_seen_at = detection.timestamp
        self.hits += 1

    def is_expired(self, frame_sequence: int, ttl_frames: int) -> bool:
        return frame_sequence - self.last_frame_sequence > ttl_frames

