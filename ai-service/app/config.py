from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OSV-PC AI Service"
    app_env: str = Field(default="local", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    host: str = Field(default="0.0.0.0", alias="AI_SERVICE_HOST")
    port: int = Field(default=8010, alias="AI_SERVICE_PORT")

    camera_id: str = Field(default="local-camera", alias="CAMERA_ID")
    camera_source_type: str = Field(default="webcam", alias="CAMERA_SOURCE_TYPE")
    camera_source_uri: str = Field(default="0", alias="CAMERA_SOURCE_URI")
    processing_fps: int = Field(default=5, alias="PROCESSING_FPS")
    reconnect_backoff_seconds: float = Field(default=1.0, alias="RECONNECT_BACKOFF_SECONDS")
    max_reconnect_backoff_seconds: float = Field(default=30.0, alias="MAX_RECONNECT_BACKOFF_SECONDS")
    camera_open_timeout_ms: int = Field(default=5000, alias="CAMERA_OPEN_TIMEOUT_MS")
    camera_read_timeout_ms: int = Field(default=5000, alias="CAMERA_READ_TIMEOUT_MS")

    person_confidence_threshold: float = Field(default=0.5, alias="PERSON_CONFIDENCE_THRESHOLD")
    face_recognition_threshold: float = Field(default=0.65, alias="FACE_RECOGNITION_THRESHOLD")
    face_recognition_runtime: str = Field(default="simple", alias="FACE_RECOGNITION_RUNTIME")
    face_embedding_dim: int = Field(default=32, alias="FACE_EMBEDDING_DIM")
    face_embedding_model_name: str = Field(
        default="simple-hash-face-embedding",
        alias="FACE_EMBEDDING_MODEL_NAME",
    )
    embedding_store_runtime: str = Field(default="memory", alias="EMBEDDING_STORE_RUNTIME")
    qdrant_url: str = Field(default="http://qdrant:6333", alias="QDRANT_URL")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    qdrant_collection_person_face_embeddings: str = Field(
        default="person_face_embeddings",
        alias="QDRANT_COLLECTION_PERSON_FACE_EMBEDDINGS",
    )
    qdrant_timeout_seconds: int = Field(default=3, alias="QDRANT_TIMEOUT_SECONDS")
    camera_offline_timeout_seconds: int = Field(default=30, alias="CAMERA_OFFLINE_TIMEOUT_SECONDS")
    event_cooldown_seconds: int = Field(default=60, alias="EVENT_COOLDOWN_SECONDS")
    known_person_event_cooldown_seconds: int = Field(
        default=120,
        alias="KNOWN_PERSON_EVENT_COOLDOWN_SECONDS",
    )
    unknown_person_event_cooldown_seconds: int = Field(
        default=120,
        alias="UNKNOWN_PERSON_EVENT_COOLDOWN_SECONDS",
    )
    restricted_zone_event_cooldown_seconds: int = Field(
        default=300,
        alias="RESTRICTED_ZONE_EVENT_COOLDOWN_SECONDS",
    )
    camera_offline_event_cooldown_seconds: int = Field(
        default=300,
        alias="CAMERA_OFFLINE_EVENT_COOLDOWN_SECONDS",
    )
    people_count_interval_seconds: int = Field(default=10, alias="PEOPLE_COUNT_INTERVAL_SECONDS")

    detector_runtime: str = Field(default="yolo", alias="DETECTOR_RUNTIME")
    model_path: str = Field(default="yolov8n.pt", alias="MODEL_PATH")
    tracker_runtime: str = Field(default="bytetrack", alias="TRACKER_RUNTIME")
    tracker_match_threshold: float = Field(default=0.3, alias="TRACKER_MATCH_THRESHOLD")
    track_ttl_frames: int = Field(default=30, alias="TRACK_TTL_FRAMES")
    tracker_new_track_threshold: float = Field(default=0.5, alias="TRACKER_NEW_TRACK_THRESHOLD")
    snapshot_storage_path: str = Field(default="/data/snapshots", alias="SNAPSHOT_STORAGE_PATH")
    backend_internal_url: str = Field(default="http://backend:8000/internal", alias="BACKEND_INTERNAL_URL")
    ai_service_token: str = Field(default="change-me-internal-token", alias="AI_SERVICE_TOKEN")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
