from fastapi import APIRouter, Depends, UploadFile

from src.api.errors import not_found_to_http
from src.auth.dependencies import require_roles
from src.schemas.domain import (
    PersonCreate,
    PersonEmbeddingCreate,
    PersonEmbeddingDeleteResult,
    PersonEmbeddingRead,
    PersonPhotoRead,
    PersonRead,
    Role,
)
from src.config import get_settings
from src.db.session import get_db
from src.services.embeddings import EmbeddingVectorService
from src.services.db_store import NotFoundError, store


router = APIRouter(prefix="/api/persons", tags=["persons"])
settings = get_settings()
vector_service = EmbeddingVectorService(
    qdrant_url=settings.qdrant_url,
    collection_name=settings.qdrant_collection_person_face_embeddings,
    embedding_dim=settings.face_embedding_dim,
    api_key=settings.qdrant_api_key,
    timeout_seconds=settings.qdrant_timeout_seconds,
)


@router.get("", response_model=list[PersonRead])
def list_persons(
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> list[PersonRead]:
    return store.list_persons(session)


@router.post("", response_model=PersonRead)
def create_person(
    payload: PersonCreate,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> PersonRead:
    return store.create_person(session, payload)


@router.get("/embeddings/status")
def embeddings_status(_user=Depends(require_roles(Role.ADMIN, Role.OPERATOR))) -> dict[str, object]:
    return vector_service.status()


@router.get("/{person_id}", response_model=PersonRead)
def get_person(
    person_id: str,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> PersonRead:
    try:
        return store.get_person(session, person_id)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc


@router.post("/{person_id}/photos", response_model=PersonPhotoRead)
async def upload_person_photo(
    person_id: str,
    file: UploadFile,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> PersonPhotoRead:
    try:
        return store.add_person_photo(
            session=session,
            person_id=person_id,
            filename=file.filename or "photo",
            content_type=file.content_type,
        )
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc


@router.post("/{person_id}/embeddings", response_model=PersonEmbeddingRead)
def register_person_embedding(
    person_id: str,
    payload: PersonEmbeddingCreate,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> PersonEmbeddingRead:
    try:
        return store.add_person_embedding(session, person_id=person_id, payload=payload)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc


@router.delete("/{person_id}/embeddings", response_model=PersonEmbeddingDeleteResult)
def delete_person_embeddings(
    person_id: str,
    _user=Depends(require_roles(Role.ADMIN, Role.OPERATOR)),
    session=Depends(get_db),
) -> PersonEmbeddingDeleteResult:
    try:
        metadata_deleted = store.delete_person_embeddings(session, person_id)
    except NotFoundError as exc:
        raise not_found_to_http(exc) from exc

    vector_result = vector_service.delete_person(person_id)
    return PersonEmbeddingDeleteResult(
        person_id=person_id,
        metadata_deleted=metadata_deleted,
        vector_status=str(vector_result["status"]),
        vector_error=vector_result.get("last_error") if isinstance(vector_result.get("last_error"), str) else None,
    )
