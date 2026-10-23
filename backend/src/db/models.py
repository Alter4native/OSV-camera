from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base
from src.schemas.domain import CameraState, EventType, Role, utc_now


def uuid_pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class RoleModel(Base):
    __tablename__ = "roles"

    role_id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    users: Mapped[list["UserRoleModel"]] = relationship(back_populates="role")


class UserModel(TimestampMixin, Base):
    __tablename__ = "users"

    user_id: Mapped[str] = uuid_pk()
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    roles: Mapped[list["UserRoleModel"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list["AuditLogModel"]] = relationship(back_populates="user")


class UserRoleModel(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.role_id", ondelete="CASCADE"), primary_key=True)

    user: Mapped[UserModel] = relationship(back_populates="roles")
    role: Mapped[RoleModel] = relationship(back_populates="users")


class CameraModel(TimestampMixin, Base):
    __tablename__ = "cameras"

    camera_id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="webcam")
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    processing_fps: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default=CameraState.STOPPED.value)
    last_frame_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    settings: Mapped["CameraSettingsModel | None"] = relationship(
        back_populates="camera",
        cascade="all, delete-orphan",
    )
    restricted_zones: Mapped[list["RestrictedZoneModel"]] = relationship(
        back_populates="camera",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["EventModel"]] = relationship(back_populates="camera")


class CameraSettingsModel(TimestampMixin, Base):
    __tablename__ = "camera_settings"

    camera_id: Mapped[str] = mapped_column(
        ForeignKey("cameras.camera_id", ondelete="CASCADE"),
        primary_key=True,
    )
    person_confidence_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.65)
    face_recognition_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.65)
    event_cooldown_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    camera: Mapped[CameraModel] = relationship(back_populates="settings")


class RestrictedZoneModel(TimestampMixin, Base):
    __tablename__ = "restricted_zones"

    zone_id: Mapped[str] = uuid_pk()
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.camera_id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    polygon: Mapped[list[dict[str, float]]] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    camera: Mapped[CameraModel] = relationship(back_populates="restricted_zones")


class EventModel(Base):
    __tablename__ = "events"

    event_id: Mapped[str] = uuid_pk()
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.camera_id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, default=EventType.PERSON_DETECTED.value)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    camera: Mapped[CameraModel | None] = relationship(back_populates="events")
    snapshot: Mapped["EventSnapshotModel | None"] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_events_camera_created", "camera_id", "created_at"),
        Index("ix_events_type_created", "event_type", "created_at"),
        Index("ix_events_camera_type_created", "camera_id", "event_type", "created_at"),
    )


class EventSnapshotModel(Base):
    __tablename__ = "event_snapshots"

    snapshot_id: Mapped[str] = uuid_pk()
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False, default="image/jpeg")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    event: Mapped[EventModel] = relationship(back_populates="snapshot")


class PersonModel(TimestampMixin, Base):
    __tablename__ = "persons"

    person_id: Mapped[str] = uuid_pk()
    display_name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    external_id: Mapped[str | None] = mapped_column(String(160), nullable=True, unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    photos: Mapped[list["PersonPhotoModel"]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
    )
    recognition_profiles: Mapped[list["RecognitionProfileModel"]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
    )


class PersonPhotoModel(Base):
    __tablename__ = "person_photos"

    photo_id: Mapped[str] = uuid_pk()
    person_id: Mapped[str] = mapped_column(ForeignKey("persons.person_id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    person: Mapped[PersonModel] = relationship(back_populates="photos")


class RecognitionProfileModel(TimestampMixin, Base):
    __tablename__ = "recognition_profiles"

    profile_id: Mapped[str] = uuid_pk()
    person_id: Mapped[str] = mapped_column(ForeignKey("persons.person_id", ondelete="CASCADE"), nullable=False)
    vector_collection: Mapped[str] = mapped_column(String(160), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(160), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.65)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    person: Mapped[PersonModel] = relationship(back_populates="recognition_profiles")


class ModelVersionModel(Base):
    __tablename__ = "model_versions"

    model_id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    runtime: Mapped[str] = mapped_column(String(80), nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (Index("ix_model_versions_name_version", "name", "version"),)


class SettingModel(TimestampMixin, Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    audit_id: Mapped[str] = uuid_pk()
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(160), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    user: Mapped[UserModel | None] = relationship(back_populates="audit_logs")

    __table_args__ = (Index("ix_audit_logs_user_created", "user_id", "created_at"),)


class RetentionJobModel(Base):
    __tablename__ = "retention_jobs"

    job_id: Mapped[str] = uuid_pk()
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    deleted_events: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deleted_snapshots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


DEFAULT_ROLE_NAMES = [role.value for role in Role]

