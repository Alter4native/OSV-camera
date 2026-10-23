from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Role(StrEnum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class CameraState(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    STOPPED = "stopped"
    ERROR = "error"


class EventType(StrEnum):
    PERSON_DETECTED = "person_detected"
    KNOWN_PERSON_DETECTED = "known_person_detected"
    UNKNOWN_PERSON_DETECTED = "unknown_person_detected"
    RESTRICTED_ZONE_ENTRY = "restricted_zone_entry"
    CAMERA_OFFLINE = "camera_offline"
    PEOPLE_COUNT = "people_count"


class UserRecord(BaseModel):
    user_id: str = Field(default_factory=lambda: str(uuid4()))
    username: str
    password_hash: str
    role: Role
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class UserPublic(BaseModel):
    user_id: str
    username: str
    role: Role
    is_active: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class CameraCreate(BaseModel):
    name: str
    source_type: str = "webcam"
    source_uri: str = "0"
    enabled: bool = True
    processing_fps: int = 5


class CameraUpdate(BaseModel):
    name: str | None = None
    source_type: str | None = None
    source_uri: str | None = None
    enabled: bool | None = None
    processing_fps: int | None = None


class CameraRead(BaseModel):
    camera_id: str
    name: str
    source_type: str
    source_uri: str
    enabled: bool
    processing_fps: int
    state: CameraState = CameraState.STOPPED
    last_frame_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class CameraStatusUpdate(BaseModel):
    state: CameraState
    last_frame_at: datetime | None = None
    last_error: str | None = None


class EventRead(BaseModel):
    event_id: str
    camera_id: str
    event_type: EventType
    timestamp: datetime
    confidence: float
    snapshot_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventIngest(BaseModel):
    event_id: str | None = None
    camera_id: str
    event_type: EventType
    timestamp: datetime | None = None
    confidence: float = 1.0
    snapshot_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventBatchIngest(BaseModel):
    events: list[EventIngest]


class PersonCreate(BaseModel):
    display_name: str
    external_id: str | None = None
    notes: str | None = None


class PersonRead(BaseModel):
    person_id: str
    display_name: str
    external_id: str | None = None
    notes: str | None = None
    photo_count: int = 0
    created_at: datetime
    updated_at: datetime


class PersonPhotoRead(BaseModel):
    photo_id: str
    person_id: str
    filename: str
    content_type: str | None = None
    created_at: datetime


class PersonEmbeddingCreate(BaseModel):
    photo_id: str | None = None
    embedding_model: str
    embedding_dim: int
    vector_collection: str = "person_face_embeddings"
    threshold: float = 0.65


class PersonEmbeddingRead(BaseModel):
    profile_id: str
    person_id: str
    photo_id: str | None = None
    embedding_model: str
    embedding_dim: int
    vector_collection: str
    threshold: float
    active: bool = True
    created_at: datetime


class PersonEmbeddingDeleteResult(BaseModel):
    person_id: str
    metadata_deleted: int
    vector_status: str
    vector_error: str | None = None


class ModelVersionRead(BaseModel):
    model_id: str
    name: str
    version: str
    runtime: str
    path: str
    active: bool = False
    created_at: datetime


class AlgorithmQualityRead(BaseModel):
    algorithm: str
    status: str
    samples: int
    parameters: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    analysis: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class QualityAnalysisRead(BaseModel):
    status: str
    generated_at: datetime = Field(default_factory=utc_now)
    dataset: dict[str, Any] = Field(default_factory=dict)
    algorithms: list[AlgorithmQualityRead] = Field(default_factory=list)


class SettingsRead(BaseModel):
    processing_fps: int = 5
    person_confidence_threshold: float = 0.65
    face_recognition_threshold: float = 0.65
    event_cooldown_seconds: int = 60
    retention_days: int = 30


class SettingsUpdate(BaseModel):
    processing_fps: int | None = None
    person_confidence_threshold: float | None = None
    face_recognition_threshold: float | None = None
    event_cooldown_seconds: int | None = None
    retention_days: int | None = None
