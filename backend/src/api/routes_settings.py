from fastapi import APIRouter, Depends

from src.auth.dependencies import get_current_user, require_roles
from src.db.session import get_db
from src.schemas.domain import Role, SettingsRead, SettingsUpdate
from src.services.db_store import store


router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsRead)
def get_settings(_user=Depends(get_current_user), session=Depends(get_db)) -> SettingsRead:
    return store.get_settings(session)


@router.patch("", response_model=SettingsRead)
def update_settings(
    payload: SettingsUpdate,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> SettingsRead:
    return store.update_settings(session, payload)
