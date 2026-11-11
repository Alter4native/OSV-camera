from fastapi import APIRouter, Depends, HTTPException, status

from src.auth.dependencies import get_current_user
from src.auth.passwords import verify_password
from src.auth.tokens import TokenError, create_token_pair, decode_token
from src.db.session import get_db
from src.schemas.domain import LoginRequest, RefreshRequest, TokenPair, UserPublic
from src.services.db_store import store


router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login", response_model=TokenPair)
def login(payload: LoginRequest, session=Depends(get_db)) -> TokenPair:
    user = store.get_user(session, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    return create_token_pair(user)


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, session=Depends(get_db)) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user = store.get_user(session, str(claims["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return create_token_pair(user)


@router.get("/me", response_model=UserPublic)
def me(user=Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        user_id=user.user_id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )
