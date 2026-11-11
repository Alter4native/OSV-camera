from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FrameQuality:
    sharpness: float
    brightness: float
    face_size_px: int
    dropped_frames: int

    def as_dict(self) -> dict[str, float | int]:
        return {
            "sharpness": round(self.sharpness, 1),
            "brightness": round(self.brightness, 1),
            "face_size_px": self.face_size_px,
            "dropped_frames": self.dropped_frames,
        }


def analyze_frame(
    image: Any,
    face_size_px: int = 0,
    dropped_frames: int = 0,
) -> FrameQuality:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("OpenCV is required for frame quality analysis") from exc

    if image is None or getattr(image, "size", 0) == 0:
        raise ValueError("Cannot analyze an empty frame")

    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(grayscale, cv2.CV_64F).var())
    brightness = float(grayscale.mean())
    return FrameQuality(
        sharpness=sharpness,
        brightness=brightness,
        face_size_px=max(0, int(face_size_px)),
        dropped_frames=max(0, int(dropped_frames)),
    )
