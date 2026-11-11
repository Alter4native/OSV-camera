from fastapi import APIRouter, Depends

from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.schemas.domain import ModelVersionRead, QualityAnalysisRead
from src.services.db_store import store


router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=list[ModelVersionRead])
def list_models(_user=Depends(get_current_user), session=Depends(get_db)) -> list[ModelVersionRead]:
    return store.list_models(session)


@router.get("/quality", response_model=QualityAnalysisRead)
def get_model_quality(_user=Depends(get_current_user), session=Depends(get_db)) -> QualityAnalysisRead:
    return store.quality_analysis(session)
