import csv
import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CSV_FIELDS = [
    "session_id",
    "sample_index",
    "captured_at",
    "frame_sequence",
    "camera_id",
    "frame_width",
    "frame_height",
    "person_count",
    "ground_truth_count",
    "detections_json",
    "tracks_json",
    "detector_json",
    "tracking_json",
    "telemetry_json",
    "frame_file",
]


class ScanStorage:
    def __init__(self, root_path: str | Path) -> None:
        self.root = Path(root_path)
        self._lock = threading.Lock()

    def save_sample(self, session_id: str, frame_bytes: bytes, metadata: dict[str, Any]) -> dict[str, Any]:
        normalized_session_id = str(uuid.UUID(session_id))
        if len(frame_bytes) < 4 or not frame_bytes.startswith(b"\xff\xd8") or not frame_bytes.endswith(b"\xff\xd9"):
            raise ValueError("Frame must be a JPEG image")

        frame_info = metadata.get("frame")
        if not isinstance(frame_info, dict):
            raise ValueError("Missing frame dimensions")
        width = int(frame_info.get("width", 0))
        height = int(frame_info.get("height", 0))
        if not 1 <= width <= 8192 or not 1 <= height <= 8192:
            raise ValueError("Invalid frame dimensions")
        person_count = int(metadata.get("person_count", -1))
        if not 0 <= person_count <= 10000:
            raise ValueError("Invalid person count")
        frame_sequence = int(metadata.get("frame_sequence", 0))
        if frame_sequence < 0:
            raise ValueError("Invalid frame sequence")

        captured_at = str(metadata.get("timestamp") or datetime.now(timezone.utc).isoformat())
        try:
            datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Invalid capture timestamp") from exc

        session_dir = self.root / normalized_session_id
        frames_dir = session_dir / "frames"
        with self._lock:
            frames_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = session_dir / "session.json"
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            else:
                manifest = {
                    "session_id": normalized_session_id,
                    "started_at": captured_at,
                    "sample_count": 0,
                    "format": "OSV-PC scan session v1",
                }

            sample_index = int(manifest.get("sample_count", 0)) + 1
            frame_name = f"frame-{sample_index:06d}.jpg"
            frame_path = frames_dir / frame_name
            temporary_frame_path = frame_path.with_suffix(".jpg.tmp")
            temporary_frame_path.write_bytes(frame_bytes)
            temporary_frame_path.replace(frame_path)

            def json_field(name: str) -> str:
                return json.dumps(metadata.get(name), ensure_ascii=False, separators=(",", ":"))

            row = {
                "session_id": normalized_session_id,
                "sample_index": sample_index,
                "captured_at": captured_at,
                "frame_sequence": frame_sequence,
                "camera_id": str(metadata.get("camera_id", "")),
                "frame_width": width,
                "frame_height": height,
                "person_count": person_count,
                "ground_truth_count": "",
                "detections_json": json_field("detections"),
                "tracks_json": json_field("tracks"),
                "detector_json": json_field("detector"),
                "tracking_json": json_field("tracking"),
                "telemetry_json": json_field("telemetry"),
                "frame_file": f"frames/{frame_name}",
            }
            csv_path = session_dir / "measurements.csv"
            is_new_csv = not csv_path.exists()
            with csv_path.open("a", encoding="utf-8-sig" if is_new_csv else "utf-8", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=CSV_FIELDS, delimiter=";")
                if is_new_csv:
                    writer.writeheader()
                writer.writerow(row)

            manifest["sample_count"] = sample_index
            manifest["last_sample_at"] = captured_at
            temporary_manifest_path = manifest_path.with_suffix(".json.tmp")
            temporary_manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary_manifest_path.replace(manifest_path)

        return {
            "session_id": normalized_session_id,
            "sample_count": sample_index,
            "frame_file": row["frame_file"],
            "captured_at": captured_at,
        }
