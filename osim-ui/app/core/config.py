"""Application settings für osim-ui via dotenv.

Liest Konfiguration aus Environment-Variablen mit sinnvollen Defaults für
lokale Entwicklung. Verwendet python-dotenv (in pyproject.toml registriert).

3fls-Pattern-Parität: Plain ``class Settings`` mit ``__init__``-ENV-Lookup
(NICHT pydantic-BaseSettings). Begründung steht in
``.planning/phases/01-vertical-slice/01-PATTERNS.md`` §``app/core/config.py``.

Stack-Drift (D-18, korrigiert 2026-05-21): sync psycopg3-Dialekt, kein async.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application-Settings für osim-ui, gelesen aus Environment-Variablen."""

    def __init__(self) -> None:
        # --- Datenbank (3fls-Pattern Z.18-24) ------------------------------
        self.database_url: str = os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://osim_dev:osim_dev_password@localhost:5432/osim_ui",
        )
        # Ensure psycopg3-Dialekt (kein deprecated psycopg2-Default).
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )

        # --- Firebase ------------------------------------------------------
        self.firebase_project_id: str = os.environ.get(
            "FIREBASE_PROJECT_ID", "osim-dev"
        )
        # None = Produktion (Application Default Credentials); gesetzt = Emulator.
        self.firebase_auth_emulator_host: str | None = os.environ.get(
            "FIREBASE_AUTH_EMULATOR_HOST"
        )

        # --- Environment / CORS -------------------------------------------
        self.environment: str = os.environ.get("ENVIRONMENT", "dev")
        cors_raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
        self.cors_origins: list[str] = [
            o.strip() for o in cors_raw.split(",") if o.strip()
        ]

        # --- Object Storage (osim-spezifisch — PATTERNS.md) ----------------
        self.storage_backend: str = os.environ.get("STORAGE_BACKEND", "minio")
        self.minio_endpoint: str = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
        self.minio_access_key: str = os.environ.get("MINIO_ACCESS_KEY", "osim_dev")
        self.minio_secret_key: str = os.environ.get(
            "MINIO_SECRET_KEY", "osim_dev_password"
        )
        self.minio_bucket: str = os.environ.get("MINIO_BUCKET", "osim-ui-dev")

        # --- Single-Editor-Lock (D-13: 15 min Max-Inaktivität) -------------
        self.lock_ttl_seconds: int = int(os.environ.get("LOCK_TTL_SECONDS", "60"))
        self.lock_max_inactivity_seconds: int = int(
            os.environ.get("LOCK_MAX_INACTIVITY_SECONDS", "900")
        )

        # --- Sim-Runs (Plan 01-08, D-OP-2) ---------------------------------
        # run-Basis-Verzeichnis; der run_otx-Subprozess legt darunter sein
        # tenant-präfixiertes <run-id>/-Verzeichnis an.
        self.runs_dir: str = os.environ.get("OSIM_RUNS_DIR", "./data/runs")
        # Serverseitiger Default-Pace (s) am Flush-Boundary, damit über die API
        # gestartete Läufe beobachtbar live schreiben (AC-3/AC-5-Basis).
        self.run_default_pace: float = float(os.environ.get("OSIM_RUN_PACE", "0.2"))
        # T-RUN-04-Cap: Obergrenze der Perioden pro Lauf (DoS-Schutz).
        self.run_max_periods: int = int(os.environ.get("OSIM_RUN_MAX_PERIODS", "24"))


settings = Settings()
