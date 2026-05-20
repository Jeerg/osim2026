"""Model-Lifecycle-Service: Upload → DB+Storage; List/Get; Save-back.

Implementiert D-03 (Storage + Versionierung) und D-14 (Save-back als neue
Version, Original unveraendert).

Two-Step-Commit-Pattern:
  1. Storage put_object zuerst (so kann ein DB-Rollback nicht "verwaiste"
     storage-keys hinterlassen, die spaeter nicht aufgeraeumt werden).
  2. DB-Row schreiben + commit.

Sollte Schritt 2 trotzdem failen, bleibt das Storage-Objekt als
"orphan" liegen -- akzeptabel in Phase 1, mit Aufraeum-Job in Phase 4+.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import PurePosixPath

import structlog
from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.model import Model
from app.models.model_version import ModelVersion
from app.services.otx_service import OtxParseError, parse_otx_bytes
from app.services.storage import Storage

logger = structlog.get_logger(__name__)

# Maximale Upload-Groesse (Bytes) -- 50 MB ist die Plan-Vorgabe.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _storage_key(
    tenant_id: str,
    model_id: int,
    version: int,
    filename: str,
    *,
    timestamp: datetime | None = None,
) -> str:
    """Baut einen Storage-Key fuer eine ModelVersion.

    Format:
        ``tenants/{tenant_id}/models/{model_id}/v{N}-{YYYYMMDDTHHMMSS}-{filename}``

    Der Timestamp im Pfad stellt Eindeutigkeit sicher, auch wenn die
    Versionsnummer (theoretisch durch Race) doppelt vergeben werden sollte.
    """
    if timestamp is None:
        timestamp = datetime.now(UTC)
    ts = timestamp.strftime("%Y%m%dT%H%M%S")
    # Filename sanitisieren: nur Basename, keine separator-Zeichen.
    safe_name = PurePosixPath(filename).name.replace("\\", "_")
    return f"tenants/{tenant_id}/models/{model_id}/v{version}-{ts}-{safe_name}"


# ---------------------------------------------------------------------------
# Lifecycle: Upload
# ---------------------------------------------------------------------------


async def register_model_from_otx(
    *,
    file_bytes: bytes,
    filename: str,
    tenant_id: str,
    user_uid: str,
    db: AsyncSession,
    storage: Storage,
) -> Model:
    """Parst eine OTX-Datei, speichert sie und legt ``Model`` + ``ModelVersion``
    Version 1 (source="upload") an.

    Raises:
        HTTPException(413): wenn die Datei groesser als MAX_UPLOAD_BYTES.
        HTTPException(422): wenn der Parser die Datei nicht versteht
            (zero coverage, Loader-Crash, leere Datei).
    """
    if len(file_bytes) == 0:
        raise HTTPException(status_code=422, detail="Leeres File.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File zu gross (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )

    try:
        result = parse_otx_bytes(file_bytes)
    except OtxParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 1) DB-Row anlegen (ohne current_version_id), flush um die id zu bekommen.
    base_name = PurePosixPath(filename).name
    stem = base_name.rsplit(".", 1)[0] if "." in base_name else base_name
    model = Model(
        name=stem or "Unbenanntes Modell",
        original_filename=base_name,
        owner_uid=user_uid,
        coverage_ratio_at_upload=result.coverage_ratio,
        loaded_summary=dict(result.loaded),
        unsupported_summary=dict(result.unsupported),
    )
    db.add(model)
    await db.flush()  # -> model.id verfuegbar

    # 2) Storage put_object FIRST.
    storage_key = _storage_key(
        tenant_id=tenant_id,
        model_id=model.id,
        version=1,
        filename=base_name,
    )
    await storage.put_object(storage_key, file_bytes, "application/octet-stream")

    # 3) ModelVersion + Verknuepfung.
    version = ModelVersion(
        model_id=model.id,
        version=1,
        source="upload",
        storage_key=storage_key,
        bytes_size=len(file_bytes),
        created_by_uid=user_uid,
    )
    db.add(version)
    await db.flush()  # -> version.id

    model.current_version_id = version.id
    await db.commit()

    logger.info(
        "model_uploaded",
        model_id=model.id,
        tenant_id=tenant_id,
        owner_uid=user_uid,
        coverage_ratio=result.coverage_ratio,
        bytes=len(file_bytes),
    )

    # KEIN db.refresh nach commit: NullPool/asyncpg recycelt die Connection
    # und der neue Connect haette keinen search_path -> "relation models
    # does not exist". Die server_default-Spalten (created_at, updated_at)
    # haben durch flush() bereits ihre Werte erhalten.
    return model


# ---------------------------------------------------------------------------
# Lifecycle: List + Get
# ---------------------------------------------------------------------------


async def list_models(db: AsyncSession) -> list[Model]:
    """Liefert alle Modelle des aktuellen Tenants (sortiert nach Update-Zeit)."""
    rows = (
        await db.execute(
            select(Model).order_by(desc(Model.updated_at))
        )
    ).scalars().all()
    return list(rows)


async def get_model(model_id: int, db: AsyncSession) -> Model:
    """Liefert das angeforderte Modell oder raised 404."""
    row = (
        await db.execute(select(Model).where(Model.id == model_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    return row


async def get_version(version_id: int, db: AsyncSession) -> ModelVersion:
    """Liefert die angeforderte Version oder raised 404."""
    row = (
        await db.execute(select(ModelVersion).where(ModelVersion.id == version_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Version {version_id} not found")
    return row


async def get_current_version_bytes(
    model: Model, db: AsyncSession, storage: Storage
) -> tuple[ModelVersion, bytes]:
    """Laedt die aktuelle Version eines Modells aus dem Storage.

    Raises 404, wenn das Modell keine current_version_id hat (sollte
    nicht passieren -- jede registrierte Modell-Row hat Version 1) oder
    das Storage-Objekt fehlt.
    """
    if model.current_version_id is None:
        raise HTTPException(
            status_code=404, detail="Modell hat keine aktive Version."
        )
    version = await get_version(model.current_version_id, db)
    data = await storage.get_object(version.storage_key)
    return version, data


async def get_initial_version_bytes(
    model: Model, db: AsyncSession, storage: Storage
) -> tuple[ModelVersion, bytes]:
    """Laedt Version 1 (Original-Upload) -- nutzlich fuer Download-Original."""
    initial = (
        await db.execute(
            select(ModelVersion).where(
                ModelVersion.model_id == model.id,
                ModelVersion.version == 1,
            )
        )
    ).scalar_one_or_none()
    if initial is None:
        raise HTTPException(
            status_code=404, detail="Keine Initial-Version fuer Modell vorhanden."
        )
    data = await storage.get_object(initial.storage_key)
    return initial, data


# ---------------------------------------------------------------------------
# Lifecycle: Save-back -> neue Version
# ---------------------------------------------------------------------------


async def create_new_version(
    *,
    model: Model,
    otx_bytes: bytes,
    tenant_id: str,
    user_uid: str,
    db: AsyncSession,
    storage: Storage,
    source: str = "save_back",
) -> ModelVersion:
    """Legt eine neue Version fuer ein bestehendes Modell an.

    - Neue Versionsnummer = max(existing)+1
    - storage_key enthaelt Timestamp -> Eindeutigkeit
    - model.current_version_id wird aktualisiert
    - Two-Step-Commit (storage erst, dann DB)
    """
    if len(otx_bytes) == 0:
        raise HTTPException(status_code=422, detail="Leeres OTX nicht erlaubt.")
    if len(otx_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="OTX zu gross.")

    # Hoechste vorhandene Versionsnummer holen.
    max_version_raw = (
        await db.execute(
            select(ModelVersion.version)
            .where(ModelVersion.model_id == model.id)
            .order_by(desc(ModelVersion.version))
            .limit(1)
        )
    ).scalar_one_or_none()
    next_version = (max_version_raw or 0) + 1

    storage_key = _storage_key(
        tenant_id=tenant_id,
        model_id=model.id,
        version=next_version,
        filename=model.original_filename,
    )
    await storage.put_object(storage_key, otx_bytes, "application/octet-stream")

    version = ModelVersion(
        model_id=model.id,
        version=next_version,
        source=source,
        storage_key=storage_key,
        bytes_size=len(otx_bytes),
        created_by_uid=user_uid,
    )
    db.add(version)
    await db.flush()
    model.current_version_id = version.id
    # updated_at wird durch onupdate=func.now() automatisch gesetzt.
    await db.commit()
    # Kein db.refresh -- siehe Kommentar in register_model_from_otx.

    logger.info(
        "model_version_created",
        model_id=model.id,
        version=next_version,
        source=source,
        bytes=len(otx_bytes),
    )
    return version
