from dataclasses import dataclass
from datetime import datetime

from app.detection.schemas import BoundingBox, Detection


@dataclass(frozen=True)
class TrackedObject:
    camera_id: str
    frame_sequence: int
    timestamp: datetime
    track_id: int
    bbox: BoundingBox
    class_id: int
    class_name: str
    confidence: float
    hits: int

    @property
    def stability(self) -> str:
        return "confirmed" if self.hits >= 3 else "candidate"

    @property
    def confidence_state(self) -> str:
        if self.confidence >= 0.8:
            return "high"
        if self.confidence >= 0.6:
            return "medium"
        return "low"

    @classmethod
    def from_detection(cls, detection: Detection, track_id: int, hits: int) -> "TrackedObject":
        return cls(
            camera_id=detection.camera_id,
            frame_sequence=detection.frame_sequence,
            timestamp=detection.timestamp,
            track_id=track_id,
            bbox=detection.bbox,
            class_id=detection.class_id,
            class_name=detection.class_name,
            confidence=detection.confidence,
            hits=hits,
        )

    def as_dict(self) -> dict[str, object]:
        return {
            "camera_id": self.camera_id,
            "frame_sequence": self.frame_sequence,
            "timestamp": self.timestamp.isoformat(),
            "track_id": self.track_id,
            "bbox": self.bbox.as_dict(),
            "class_id": self.class_id,
            "class_name": self.class_name,
            "confidence": self.confidence,
            "hits": self.hits,
            "stability": self.stability,
            "confidence_state": self.confidence_state,
        }


@dataclass(frozen=True)
class TrackerMetadata:
    runtime: str
    active_tracks: int
    match_threshold: float
    track_ttl_frames: int
    new_track_threshold: float

    def as_dict(self) -> dict[str, object]:
        return {
            "runtime": self.runtime,
            "active_tracks": self.active_tracks,
            "match_threshold": self.match_threshold,
            "track_ttl_frames": self.track_ttl_frames,
            "new_track_threshold": self.new_track_threshold,
        }

