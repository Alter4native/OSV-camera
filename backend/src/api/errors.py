from fastapi import HTTPException, status

from src.services.db_store import NotFoundError


def not_found_to_http(exc: NotFoundError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
