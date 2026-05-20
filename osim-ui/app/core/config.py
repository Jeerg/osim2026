"""Application settings via pydantic-settings.

Pattern aus tbx_stzrim/app/core/config.py auf pydantic-settings 2 portiert.
Konfiguration wird aus Environment-Variablen oder .env gelesen.

WICHTIG: FIREBASE_AUTH_EMULATOR_HOST wird hier in os.environ gespiegelt,
damit das firebase-admin-SDK vor jeglicher initialize_app() den Emulator-
Modus erkennt (siehe risks-Section in 01-02-PLAN.md).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Anwendungs-Settings — gelesen aus .env / Environment-Variablen."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Datenbank ----------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui",
        description="Async SQLAlchemy-URL (asyncpg-Dialekt).",
    )
    database_default_schema: str = Field(
        default="public",
        description="Default search_path-Schema für Sessions ohne tenant_id (Whitelist-Endpoints).",
    )

    # --- Firebase Auth ------------------------------------------------------
    firebase_project_id: str = Field(default="osim-dev")
    firebase_auth_emulator_host: str | None = Field(
        default=None,
        description="z.B. 'localhost:9099' im Dev. None in Prod.",
    )

    # --- CORS ---------------------------------------------------------------
    # NoDecode: pydantic-settings soll den Env-String NICHT als JSON parsen --
    # unser field_validator(mode="before") akzeptiert "a,b,c" Komma-Listen.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # --- Storage ------------------------------------------------------------
    storage_backend: Literal["local", "minio", "gcs"] = Field(default="local")
    storage_local_root: Path = Field(default=Path("./local-storage"))
    storage_gcs_bucket: str = Field(default="")
    storage_minio_endpoint: str = Field(default="localhost:9000")
    storage_minio_access_key: str = Field(default="osim_dev")
    storage_minio_secret_key: str = Field(default="osim_dev_password")
    storage_minio_bucket: str = Field(default="osim-ui")

    # --- Worker -------------------------------------------------------------
    worker_max_parallel: int = Field(default=4)
    worker_timeout_seconds: int = Field(default=600)

    # --- Logging & Environment ---------------------------------------------
    environment: Literal["dev", "staging", "prod", "test"] = Field(default="dev")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> list[str]:
        """Erlaube CORS_ORIGINS=a,b,c als Komma-getrennten String."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        if isinstance(v, list):
            return [str(o) for o in v]
        raise ValueError("cors_origins must be string or list")


settings = Settings()


# --- Firebase-Emulator-Bridge in os.environ ----------------------------------
# WICHTIG: muss VOR firebase_admin.initialize_app() gesetzt sein.
# Settings-Init passiert hier (Modul-Import), bevor lifespan startet.
if settings.firebase_auth_emulator_host:
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host
