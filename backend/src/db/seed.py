from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import CameraModel, ModelVersionModel, RoleModel, SettingModel
from src.db.repositories import CameraRepository, UserRepository, new_id
from src.schemas.domain import CameraCreate, Role, SettingsRead, utc_now


def seed_database(session: Session) -> None:
    seed_roles(session)
    seed_users(session)
    seed_camera(session)
    seed_model(session)
    seed_settings(session)


def seed_roles(session: Session) -> None:
    existing = {role.name for role in session.scalars(select(RoleModel)).all()}
    for role in Role:
        if role.value not in existing:
            session.add(RoleModel(role_id=new_id(), name=role.value))


def seed_users(session: Session) -> None:
    users = UserRepository(session)
    if users.get_by_username("admin") is None:
        users.create_user("admin", "admin", Role.ADMIN)
    if users.get_by_username("operator") is None:
        users.create_user("operator", "operator", Role.OPERATOR)
    if users.get_by_username("viewer") is None:
        users.create_user("viewer", "viewer", Role.VIEWER)


def seed_camera(session: Session) -> None:
    existing_camera = session.scalar(select(CameraModel).limit(1))
    cameras = CameraRepository(session)
    if existing_camera is None:
        cameras.create(
            CameraCreate(
                name="Локальная камера",
                source_type="webcam",
                source_uri="0",
                enabled=True,
                processing_fps=5,
            )
        )


def seed_model(session: Session) -> None:
    existing = session.scalar(select(ModelVersionModel).where(ModelVersionModel.active.is_(True)))
    if existing is None:
        session.add(
            ModelVersionModel(
                model_id=new_id(),
                name="YOLO26n детектор людей",
                version="8.4.0",
                runtime="yolo",
                path="/app/models/yolo26n.pt",
                active=True,
                metadata_json={},
                created_at=utc_now(),
            )
        )


def seed_settings(session: Session) -> None:
    if session.get(SettingModel, "global") is None:
        now = utc_now()
        session.add(
            SettingModel(
                key="global",
                value=SettingsRead().model_dump(),
                created_at=now,
                updated_at=now,
            )
        )
