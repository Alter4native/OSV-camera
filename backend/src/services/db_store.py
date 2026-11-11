from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.auth.passwords import hash_password
from src.db.models import (
    CameraModel,
    EventModel,
    EventSnapshotModel,
    ModelVersionModel,
    PersonModel,
    PersonPhotoModel,
    RecognitionProfileModel,
    RoleModel,
    SettingModel,
    UserModel,
    UserRoleModel,
)
from src.schemas.domain import (
    AlgorithmQualityRead,
    CameraCreate,
    CameraRead,
    CameraStatusUpdate,
    CameraUpdate,
    EventIngest,
    EventRead,
    EventType,
    ModelVersionRead,
    PersonCreate,
    PersonEmbeddingCreate,
    PersonEmbeddingRead,
    PersonPhotoRead,
    PersonRead,
    QualityAnalysisRead,
    Role,
    SettingsRead,
    SettingsUpdate,
    UserRecord,
    utc_now,
)


class NotFoundError(LookupError):
    pass


def new_id() -> str:
    return str(uuid4())


class DatabaseStore:
    def get_user(self, session: Session, username: str) -> UserRecord | None:
        user = session.scalar(select(UserModel).where(UserModel.username == username))
        if user is None:
            return None
        role = session.scalar(
            select(RoleModel.name)
            .join(UserRoleModel, UserRoleModel.role_id == RoleModel.role_id)
            .where(UserRoleModel.user_id == user.user_id)
        )
        if role is None:
            return None
        return UserRecord(
            user_id=user.user_id,
            username=user.username,
            password_hash=user.password_hash,
            role=Role(role),
            is_active=user.is_active,
            created_at=user.created_at,
        )

    def create_camera(self, session: Session, payload: CameraCreate) -> CameraRead:
        now = utc_now()
        camera = CameraModel(
            camera_id=new_id(),
            name=payload.name,
            source_type=payload.source_type,
            source_uri=payload.source_uri,
            enabled=payload.enabled,
            processing_fps=payload.processing_fps,
            state="stopped",
            created_at=now,
            updated_at=now,
        )
        session.add(camera)
        session.flush()
        return camera_to_read(camera)

    def list_cameras(self, session: Session) -> list[CameraRead]:
        return [camera_to_read(row) for row in session.scalars(select(CameraModel)).all()]

    def get_camera(self, session: Session, camera_id: str) -> CameraRead:
        camera = session.get(CameraModel, camera_id)
        if camera is None:
            raise NotFoundError("Camera not found")
        return camera_to_read(camera)

    def update_camera(self, session: Session, camera_id: str, payload: CameraUpdate) -> CameraRead:
        camera = session.get(CameraModel, camera_id)
        if camera is None:
            raise NotFoundError("Camera not found")
        for key, value in payload.model_dump(exclude_none=True).items():
            setattr(camera, key, value)
        camera.updated_at = utc_now()
        session.flush()
        return camera_to_read(camera)

    def update_camera_status(
        self, session: Session, camera_id: str, payload: CameraStatusUpdate
    ) -> CameraRead:
        camera = session.get(CameraModel, camera_id)
        if camera is None:
            raise NotFoundError("Camera not found")
        camera.state = payload.state.value
        camera.last_frame_at = payload.last_frame_at
        camera.last_error = payload.last_error
        camera.updated_at = utc_now()
        session.flush()
        return camera_to_read(camera)

    def ingest_events(self, session: Session, payloads: Sequence[EventIngest]) -> list[EventRead]:
        result: list[EventRead] = []
        for payload in payloads:
            event = EventModel(
                event_id=payload.event_id or new_id(),
                camera_id=payload.camera_id,
                event_type=payload.event_type.value,
                timestamp=payload.timestamp or utc_now(),
                confidence=payload.confidence,
                metadata_json=payload.metadata,
                created_at=utc_now(),
            )
            session.add(event)
            if payload.snapshot_url:
                session.add(
                    EventSnapshotModel(
                        snapshot_id=new_id(),
                        event_id=event.event_id,
                        storage_key=payload.snapshot_url,
                        content_type="image/jpeg",
                        created_at=utc_now(),
                    )
                )
            result.append(event_to_read(event, payload.snapshot_url))
        session.flush()
        return result

    def list_events(
        self,
        session: Session,
        camera_id: str | None = None,
        event_type: EventType | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[EventRead]:
        query = select(EventModel).order_by(EventModel.timestamp.desc())
        if camera_id is not None:
            query = query.where(EventModel.camera_id == camera_id)
        if event_type is not None:
            query = query.where(EventModel.event_type == event_type.value)
        if date_from is not None:
            query = query.where(EventModel.timestamp >= date_from)
        if date_to is not None:
            query = query.where(EventModel.timestamp <= date_to)
        return [
            event_to_read(row, self.snapshot_key(session, row.event_id))
            for row in session.scalars(query).all()
        ]

    def get_event(self, session: Session, event_id: str) -> EventRead:
        event = session.get(EventModel, event_id)
        if event is None:
            raise NotFoundError("Event not found")
        return event_to_read(event, self.snapshot_key(session, event_id))

    def snapshot_key(self, session: Session, event_id: str) -> str | None:
        return session.scalar(
            select(EventSnapshotModel.storage_key).where(EventSnapshotModel.event_id == event_id)
        )

    def create_person(self, session: Session, payload: PersonCreate) -> PersonRead:
        now = utc_now()
        person = PersonModel(
            person_id=new_id(),
            display_name=payload.display_name,
            external_id=payload.external_id,
            notes=payload.notes,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(person)
        session.flush()
        return person_to_read(person, 0)

    def list_persons(self, session: Session) -> list[PersonRead]:
        result = []
        for person in session.scalars(select(PersonModel)).all():
            photo_count = session.scalar(
                select(func.count(PersonPhotoModel.photo_id)).where(
                    PersonPhotoModel.person_id == person.person_id
                )
            ) or 0
            result.append(person_to_read(person, photo_count))
        return result

    def get_person(self, session: Session, person_id: str) -> PersonRead:
        person = session.get(PersonModel, person_id)
        if person is None:
            raise NotFoundError("Person not found")
        photo_count = session.scalar(
            select(func.count(PersonPhotoModel.photo_id)).where(
                PersonPhotoModel.person_id == person_id
            )
        ) or 0
        return person_to_read(person, photo_count)

    def add_person_photo(
        self, session: Session, person_id: str, filename: str, content_type: str | None
    ) -> PersonPhotoRead:
        if session.get(PersonModel, person_id) is None:
            raise NotFoundError("Person not found")
        photo = PersonPhotoModel(
            photo_id=new_id(),
            person_id=person_id,
            filename=filename,
            storage_key=f"persons/{person_id}/{filename}",
            content_type=content_type,
            created_at=utc_now(),
        )
        session.add(photo)
        session.flush()
        return PersonPhotoRead(
            photo_id=photo.photo_id,
            person_id=photo.person_id,
            filename=photo.filename,
            content_type=photo.content_type,
            created_at=photo.created_at,
        )

    def add_person_embedding(
        self, session: Session, person_id: str, payload: PersonEmbeddingCreate
    ) -> PersonEmbeddingRead:
        if session.get(PersonModel, person_id) is None:
            raise NotFoundError("Person not found")
        now = utc_now()
        profile = RecognitionProfileModel(
            profile_id=new_id(),
            person_id=person_id,
            vector_collection=payload.vector_collection,
            embedding_model=payload.embedding_model,
            embedding_dim=payload.embedding_dim,
            threshold=payload.threshold,
            active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(profile)
        session.flush()
        return PersonEmbeddingRead(
            profile_id=profile.profile_id,
            person_id=profile.person_id,
            photo_id=payload.photo_id,
            embedding_model=profile.embedding_model,
            embedding_dim=profile.embedding_dim,
            vector_collection=profile.vector_collection,
            threshold=profile.threshold,
            active=profile.active,
            created_at=profile.created_at,
        )

    def delete_person_embeddings(self, session: Session, person_id: str) -> int:
        if session.get(PersonModel, person_id) is None:
            raise NotFoundError("Person not found")
        profiles = session.scalars(
            select(RecognitionProfileModel).where(RecognitionProfileModel.person_id == person_id)
        ).all()
        for profile in profiles:
            session.delete(profile)
        session.flush()
        return len(profiles)

    def list_models(self, session: Session) -> list[ModelVersionRead]:
        return [
            ModelVersionRead(
                model_id=row.model_id,
                name=row.name,
                version=row.version,
                runtime=row.runtime,
                path=row.path,
                active=row.active,
                created_at=row.created_at,
            )
            for row in session.scalars(select(ModelVersionModel)).all()
        ]

    def quality_analysis(self, session: Session) -> QualityAnalysisRead:
        profiles = session.scalars(
            select(RecognitionProfileModel).where(RecognitionProfileModel.active.is_(True))
        ).all()
        people = {profile.person_id for profile in profiles}
        settings = self.get_settings(session)
        count = len(profiles)
        person_count = len(people)
        return QualityAnalysisRead(
            status="available",
            dataset={
                "active_embeddings": count,
                "enrolled_persons": person_count,
                "registered_persons": session.scalar(select(func.count(PersonModel.person_id))) or 0,
                "models": session.scalar(select(func.count(ModelVersionModel.model_id))) or 0,
                "active_models": session.scalar(
                    select(func.count(ModelVersionModel.model_id)).where(ModelVersionModel.active.is_(True))
                ) or 0,
            },
            algorithms=[
                AlgorithmQualityRead(
                    algorithm="DBSCAN",
                    status="ready" if count >= 2 else "needs_data",
                    samples=count,
                    parameters={
                        "distance": "cosine",
                        "recognition_threshold": settings.face_recognition_threshold,
                    },
                    metrics={"clusters": None, "noise_ratio": None, "silhouette": None},
                    analysis=["Кластеризация будет использовать embeddings из Qdrant."],
                    recommendations=["Проверяйте noise_ratio после накопления embeddings."],
                ),
                AlgorithmQualityRead(
                    algorithm="K-Means",
                    status="ready" if count >= 2 and person_count >= 2 else "needs_data",
                    samples=count,
                    parameters={"distance": "cosine", "k": min(max(person_count, 2), count) if count >= 2 else 0},
                    metrics={"inertia": None, "silhouette": None, "cluster_balance": None},
                    analysis=["K-Means доступен после регистрации embeddings минимум двух людей."],
                    recommendations=["Сравнивайте silhouette при смене модели распознавания."],
                ),
            ],
        )

    def get_settings(self, session: Session) -> SettingsRead:
        row = session.get(SettingModel, "global")
        return SettingsRead(**row.value) if row is not None else SettingsRead()

    def update_settings(self, session: Session, payload: SettingsUpdate) -> SettingsRead:
        row = session.get(SettingModel, "global")
        if row is None:
            now = utc_now()
            row = SettingModel(
                key="global",
                value=SettingsRead().model_dump(),
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        row.value = {**row.value, **payload.model_dump(exclude_none=True)}
        row.updated_at = utc_now()
        session.flush()
        return SettingsRead(**row.value)


def camera_to_read(camera: CameraModel) -> CameraRead:
    return CameraRead(
        camera_id=camera.camera_id,
        name=camera.name,
        source_type=camera.source_type,
        source_uri=camera.source_uri,
        enabled=camera.enabled,
        processing_fps=camera.processing_fps,
        state=camera.state,
        last_frame_at=camera.last_frame_at,
        last_error=camera.last_error,
        created_at=camera.created_at,
        updated_at=camera.updated_at,
    )


def event_to_read(event: EventModel, snapshot_url: str | None) -> EventRead:
    return EventRead(
        event_id=event.event_id,
        camera_id=event.camera_id or "",
        event_type=event.event_type,
        timestamp=event.timestamp,
        confidence=event.confidence,
        snapshot_url=snapshot_url,
        metadata=event.metadata_json,
    )


def person_to_read(person: PersonModel, photo_count: int) -> PersonRead:
    return PersonRead(
        person_id=person.person_id,
        display_name=person.display_name,
        external_id=person.external_id,
        notes=person.notes,
        photo_count=photo_count,
        created_at=person.created_at,
        updated_at=person.updated_at,
    )


store = DatabaseStore()
