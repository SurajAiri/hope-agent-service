"""
genai.config
~~~~~~~~~~~~~~~~~~~
Settings loaded from environment variables / .env file.
Defaults match the docker-compose.yml setup.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "Agent Service — FastAPI Demo"
    debug: bool = False
    log_level: str = "INFO"

    # Redis (docker-compose defaults)
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None

    # Postgres (docker-compose host port mapping: 5433 → 5432)
    db_host: str = "localhost"
    db_port: int = 5433
    db_name: str = "myapp"
    db_user: str = "postgres"
    db_password: str = "postgres"
    db_echo: bool = False

    # MinIO / S3 (docker-compose defaults)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    s3_bucket: str = "agent-runs"


settings = Settings()
