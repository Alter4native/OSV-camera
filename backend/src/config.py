from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OSV-PC Backend"
    app_env: str = Field(default="local", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    port: int = Field(default=8000, alias="BACKEND_PORT")

    database_url: str = Field(
        default="postgresql+psycopg://ai_camera:ai_camera@postgres:5432/ai_camera",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    qdrant_url: str = Field(default="http://qdrant:6333", alias="QDRANT_URL")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    qdrant_collection_person_face_embeddings: str = Field(
        default="person_face_embeddings",
        alias="QDRANT_COLLECTION_PERSON_FACE_EMBEDDINGS",
    )
    qdrant_timeout_seconds: int = Field(default=3, alias="QDRANT_TIMEOUT_SECONDS")
    face_embedding_dim: int = Field(default=32, alias="FACE_EMBEDDING_DIM")

    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_access_token_minutes: int = Field(default=15, alias="JWT_ACCESS_TOKEN_MINUTES")
    jwt_refresh_token_days: int = Field(default=7, alias="JWT_REFRESH_TOKEN_DAYS")
    ai_service_token: str = Field(default="change-me-internal-token", alias="AI_SERVICE_TOKEN")
    retention_days: int = Field(default=30, alias="RETENTION_DAYS")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
