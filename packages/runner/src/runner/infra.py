"""
runner.infra
~~~~~~~~~~~~
InfraFactory — creates infrastructure clients (redis, db, s3).

Runner (not Engine) is responsible for creating all infrastructure.
Engine receives them already created via constructor injection.

Configuration comes from environment variables (or config dict).
Matches docker-compose.yml setup:
  - Redis: localhost:6379
  - Postgres: localhost:5433 (host port mapping)
  - MinIO: localhost:9000 (S3-compatible)
"""
from __future__ import annotations

import logging
from typing import Any

import boto3
import redis.asyncio as aioredis
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


class RedisConfig(BaseModel):
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: str | None = None
    decode_responses: bool = True


class DatabaseConfig(BaseModel):
    host: str = "localhost"
    port: int = 5433  # docker-compose maps 5433:5432
    database: str = "myapp"
    user: str = "postgres"
    password: str = "postgres"
    pool_size: int = 10
    max_overflow: int = 20
    echo: bool = False

    @property
    def async_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.database}"
        )


class S3Config(BaseModel):
    endpoint_url: str = "http://localhost:9000"  # MinIO
    access_key: str = "minioadmin"
    secret_key: str = "minioadmin"
    region: str = "us-east-1"
    bucket: str = "agent-runs"


class InfraConfig(BaseModel):
    """Aggregated infrastructure configuration."""

    redis: RedisConfig = Field(default_factory=RedisConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    s3: S3Config = Field(default_factory=S3Config)

    @classmethod
    def from_env(cls) -> "InfraConfig":
        """
        Build InfraConfig from environment variables.
        Falls back to docker-compose defaults if env vars not set.
        """
        import os

        return cls(
            redis=RedisConfig(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DB", "0")),
                password=os.getenv("REDIS_PASSWORD"),
            ),
            database=DatabaseConfig(
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5433")),
                database=os.getenv("DB_NAME", "myapp"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", "postgres"),
                echo=os.getenv("DB_ECHO", "false").lower() == "true",
            ),
            s3=S3Config(
                endpoint_url=os.getenv("S3_ENDPOINT_URL", "http://localhost:9000"),
                access_key=os.getenv("S3_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("S3_SECRET_KEY", "minioadmin"),
                region=os.getenv("S3_REGION", "us-east-1"),
                bucket=os.getenv("S3_BUCKET", "agent-runs"),
            ),
        )


class InfraFactory:
    """
    Creates and configures infrastructure clients.
    Called once by Runner at startup.
    """

    @staticmethod
    def create_redis(config: RedisConfig) -> aioredis.Redis:
        """Create async Redis client."""
        client = aioredis.Redis(
            host=config.host,
            port=config.port,
            db=config.db,
            password=config.password,
            decode_responses=config.decode_responses,
        )
        logger.info("InfraFactory: Redis client created → {}:{}", config.host, config.port)
        return client

    @staticmethod
    def create_db_engine(config: DatabaseConfig) -> AsyncEngine:
        """Create async SQLAlchemy engine."""
        engine = create_async_engine(
            config.async_url,
            pool_size=config.pool_size,
            max_overflow=config.max_overflow,
            echo=config.echo,
        )
        logger.info(
            "InfraFactory: DB engine created → {}:{}/{}",
            config.host, config.port, config.database,
        )
        return engine

    @staticmethod
    def create_s3_client(config: S3Config) -> Any:
        """Create boto3 S3 client (MinIO-compatible)."""
        client = boto3.client(
            "s3",
            endpoint_url=config.endpoint_url,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name=config.region,
        )
        logger.info("InfraFactory: S3 client created → {}", config.endpoint_url)
        return client

    @staticmethod
    def ensure_s3_bucket(s3_client: Any, bucket: str) -> None:
        """Create S3 bucket if it doesn't exist (idempotent)."""
        try:
            s3_client.head_bucket(Bucket=bucket)
            logger.debug("InfraFactory: S3 bucket '{}' already exists", bucket)
        except Exception:
            try:
                s3_client.create_bucket(Bucket=bucket)
                logger.info("InfraFactory: S3 bucket '{}' created", bucket)
            except Exception as e:
                logger.warning("InfraFactory: could not create S3 bucket '{}': {}", bucket, e)
