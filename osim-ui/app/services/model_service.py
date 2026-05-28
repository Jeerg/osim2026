"""Modell-Service: OTX-Upload + Wire-Roundtrip + Versionierung + Delete.

Phase 1 zentral fuer SC-3 (Upload→Tree), SC-6 (Edit-Operationen), SC-7 (Lock
+ Save), SC-8 (versioniertes Save-back).

Storage-Layout-Konvention (D-03):

    tenants/{tenant_id}/models/{model_id}/
        original.otx          ← initial upload, D-14: unveraenderlich
        v_<YYYYMMDDTHHMMSSZ>.otx   ← jede save_wire-Operation

D-14 (Original-Unchanged-Constraint): das Original wird nur einmal beim
Upload geschrieben und danach nie wieder veraendert. Jedes Save-back legt
eine neue versionierte Datei daneben + aktualisiert ``storage_key`` in der
``models``-Tabelle. ``original_storage_key`` zeigt immer auf das Original.

Threat-Mitigations (siehe PLAN §threat_model):
    * T-04-01 (Path-Traversal via Upload-Filename): Filename aus UploadFile
      wird IGNORIERT; storage_key wird serverseitig konstruiert.
    * T-04-02 (DoS via Mega-Upload): Size-Check vor put_object — > 30 MB →
      HTTPException 413 ``E_UPLOAD_TOO_LARGE``.
    * T-04-03 (Cross-Tenant Storage-Zugriff): tenant_id ist im storage_key
      enthalten; ModelService konstruiert Keys mit Tenant-Prefix. Kein
      direkter Storage-Zugriff von ausserhalb.
    * T-04-11 (Wire mit unsupported -> Loader-Crash): save_wire prüft
      ``is_save_safe`` zuerst → 422 statt Loader-Exception.

Stack: sync. ``conn`` ist eine bereits durch ``get_db`` etablierte
Connection mit search_path auf das Tenant-Schema gesetzt.
"""

from __future__ import annotations

import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.api.schemas.model import ModelMeta, ModelTreeWire
from app.services.otx_json_tree import is_save_safe, load_to_wire, wire_to_otx
from app.services.storage import StorageService

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Konstanten / Limits
# ---------------------------------------------------------------------------

# Upload-Cap (Mitigation T-04-02). 30 MB deckt Bosch2_wechseln (~18 MB) + Puffer
# ab. Phase 2 / 5 erhoehen den Cap, wenn realistische Modelle das brauchen.
MAX_UPLOAD_BYTES: int = 30 * 1024 * 1024

# Whitelist akzeptierter MIME-Types. ``None`` (kein Header) tolerieren wir
# fuer Curl-Tests + Browser-Form-Uploads, die "application/octet-stream"
# setzen koennen.
ALLOWED_MIME_TYPES: frozenset[str | None] = frozenset(
    {
        None,
        "application/octet-stream",
        "application/x-otx",
        "text/plain",
    }
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    """UTC-now naiv (Python 3.12+-kompatible Variante)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _storage_prefix(tenant_id: str, model_id: UUID) -> str:
    return f"tenants/{tenant_id}/models/{model_id}"


def _storage_key(tenant_id: str, model_id: UUID, filename: str) -> str:
    return f"{_storage_prefix(tenant_id, model_id)}/{filename}"


def _version_filename() -> str:
    """``v_<YYYYMMDDTHHMMSSZ>.otx``."""
    ts = _utcnow().strftime("%Y%m%dT%H%M%SZ")
    return f"v_{ts}.otx"


def _coerce_datetime(value) -> datetime:
    """Glaette ``datetime`` / ISO-String-Returns (analog lock_service)."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise TypeError(f"Unsupported created_at type: {type(value)!r}")


# ---------------------------------------------------------------------------
# ModelService
# ---------------------------------------------------------------------------


class ModelService:
    """Sync-Service fuer Modell-Lifecycle.

    Eine Instanz pro Request (FastAPI-Dependency-Scope), weil sie eine
    Connection haelt. Die Connection hat per ``get_db`` bereits
    ``SET search_path TO tenant_<id>, public`` ausgefuehrt — alle hier
    abgesetzten Queries treffen das Tenant-Schema.
    """

    def __init__(
        self,
        conn: Connection,
        storage: StorageService,
        tenant_id: str,
        user_uid: str,
    ) -> None:
        self.conn = conn
        self.storage = storage
        self.tenant_id = tenant_id
        self.user_uid = user_uid

    # ------------------------------------------------------------------
    # upload_otx
    # ------------------------------------------------------------------

    def upload_otx(
        self,
        name: str,
        content: bytes,
        content_type: str | None = None,
    ) -> ModelMeta:
        """Upload + Persistierung des Original-OTX (D-14).

        Args:
            name: anzeige-Name fuer das Modell (vom User vergeben).
            content: raw bytes der .otx-Datei. Latin-1-Encoding wird vom
                Aufrufer NICHT decodiert — wir speichern bytes 1:1.
            content_type: optionaler MIME-Type aus dem Upload-Header.

        Returns:
            ``ModelMeta`` mit id, name, created_at, storage_keys.

        Raises:
            HTTPException 413 ``E_UPLOAD_TOO_LARGE`` wenn ``content`` > 30 MB.
            HTTPException 415 ``E_INVALID_OTX_MIMETYPE`` bei verbotenem MIME.
        """
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "E_UPLOAD_TOO_LARGE",
                    "message": (
                        f"Upload uebersteigt {MAX_UPLOAD_BYTES // (1024 * 1024)} MB "
                        f"Limit (Datei: {len(content) // (1024 * 1024)} MB)."
                    ),
                },
            )

        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail={
                    "code": "E_INVALID_OTX_MIMETYPE",
                    "message": (
                        f"MIME-Type {content_type!r} ist nicht erlaubt. "
                        "Akzeptiert: application/octet-stream, "
                        "application/x-otx, text/plain."
                    ),
                },
            )

        model_id = uuid.uuid4()
        original_key = _storage_key(self.tenant_id, model_id, "original.otx")

        # 1. Original ins Storage (Latin-1-Pass-Through; bytes 1:1).
        self.storage.put_object(original_key, content)

        # 2. DB-Row anlegen. storage_key initial == original_storage_key
        #    (kein Save-back bislang).
        self.conn.execute(
            text(
                """
                INSERT INTO models(id, name, storage_key, original_storage_key, created_by_uid)
                VALUES (:id, :name, :sk, :osk, :uid)
                """
            ),
            {
                "id": str(model_id),
                "name": name,
                "sk": original_key,
                "osk": original_key,
                "uid": self.user_uid,
            },
        )
        self.conn.commit()

        meta = self.get_meta(model_id)
        log.info(
            "model.uploaded",
            model_id=str(model_id),
            name=name,
            size_bytes=len(content),
            tenant_id=self.tenant_id,
        )
        return meta

    # ------------------------------------------------------------------
    # get_meta / get_wire
    # ------------------------------------------------------------------

    def get_meta(self, model_id: UUID) -> ModelMeta:
        """Lade Metadaten oder raise 404."""
        row = self.conn.execute(
            text(
                """
                SELECT id, name, storage_key, original_storage_key,
                       created_at, created_by_uid
                FROM models
                WHERE id = :id
                """
            ),
            {"id": str(model_id)},
        ).one_or_none()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "E_MODEL_NOT_FOUND",
                    "message": f"Modell {model_id} nicht gefunden.",
                },
            )

        # storage_key == original_storage_key bedeutet: noch kein Save-back.
        current_version_key: str | None = (
            row.storage_key
            if row.storage_key != row.original_storage_key
            else None
        )
        return ModelMeta(
            id=UUID(row.id) if isinstance(row.id, str) else row.id,
            name=row.name,
            created_at=_coerce_datetime(row.created_at),
            original_storage_key=row.original_storage_key,
            current_version_key=current_version_key,
            created_by_uid=row.created_by_uid,
        )

    def get_wire(self, model_id: UUID) -> ModelTreeWire:
        """Lade die aktuelle Wire-Form des Modells.

        Liest ``storage_key`` aus der DB (entweder ``original.otx`` oder die
        letzte ``v_*.otx``-Version) und parst sie via Engine-Loader.
        """
        row = self.conn.execute(
            text("SELECT storage_key FROM models WHERE id = :id"),
            {"id": str(model_id)},
        ).one_or_none()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "E_MODEL_NOT_FOUND",
                    "message": f"Modell {model_id} nicht gefunden.",
                },
            )

        data = self.storage.get_object(row.storage_key)

        # Engine-Loader erwartet einen Path. Tempfile schreiben (Latin-1-
        # Pass-Through: data sind bereits Latin-1-bytes).
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".otx", delete=False
        ) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            return load_to_wire(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # save_wire
    # ------------------------------------------------------------------

    def save_wire(self, model_id: UUID, wire: ModelTreeWire) -> str:
        """Schreibe das Wire als neue Version. Returnt den storage_key.

        D-14: Original (``original_storage_key``) wird NICHT angefasst — das
        Original bleibt fuer Audit/Rollback erreichbar.

        Coverage-Check (T-04-11 Mitigation): wenn ``wire.coverage.unsupported``
        nicht-leer ist (und nicht whitelisted), raise 422
        ``E_OTX_COVERAGE_INCOMPLETE`` BEVOR der Writer aufgerufen wird.
        """
        ok, code = is_save_safe(wire)
        if not ok:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": code,
                    "message": (
                        "Modell enthaelt Objekte ohne Loader-/Writer-Handler. "
                        "Save-back wuerde Daten verlieren. Bitte Engine-"
                        "Coverage ergaenzen (docs/engine-coverage.md)."
                    ),
                },
            )

        # Lade Original-Bytes fuer Pass-Through-Quelle des Writers.
        row = self.conn.execute(
            text(
                "SELECT original_storage_key FROM models WHERE id = :id"
            ),
            {"id": str(model_id)},
        ).one_or_none()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "E_MODEL_NOT_FOUND",
                    "message": f"Modell {model_id} nicht gefunden.",
                },
            )

        original_bytes = self.storage.get_object(row.original_storage_key)

        # Tempfile mit Original-OTX (Latin-1-Bytes) — wire_to_otx braucht
        # einen Path.
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".otx", delete=False
        ) as tmp:
            tmp.write(original_bytes)
            tmp_path = Path(tmp.name)

        try:
            otx_text = wire_to_otx(wire, original_otx_path=tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

        # Neue Version persistieren — Latin-1-Encoding strikt.
        new_filename = _version_filename()
        new_key = _storage_key(self.tenant_id, model_id, new_filename)
        self.storage.put_object(new_key, otx_text.encode("latin-1"))

        # DB updaten: storage_key zeigt nun auf die neue Version.
        self.conn.execute(
            text("UPDATE models SET storage_key = :sk WHERE id = :id"),
            {"sk": new_key, "id": str(model_id)},
        )
        self.conn.commit()

        log.info(
            "model.saved",
            model_id=str(model_id),
            version_key=new_key,
            tenant_id=self.tenant_id,
        )
        return new_key

    # ------------------------------------------------------------------
    # list_models
    # ------------------------------------------------------------------

    def list_models(self) -> list[ModelMeta]:
        """Liefere alle Modelle des Tenants, DESC nach created_at."""
        rows = self.conn.execute(
            text(
                """
                SELECT id, name, storage_key, original_storage_key,
                       created_at, created_by_uid
                FROM models
                ORDER BY created_at DESC
                """
            )
        ).all()

        result: list[ModelMeta] = []
        for row in rows:
            current_version_key = (
                row.storage_key
                if row.storage_key != row.original_storage_key
                else None
            )
            result.append(
                ModelMeta(
                    id=UUID(row.id) if isinstance(row.id, str) else row.id,
                    name=row.name,
                    created_at=_coerce_datetime(row.created_at),
                    original_storage_key=row.original_storage_key,
                    current_version_key=current_version_key,
                    created_by_uid=row.created_by_uid,
                )
            )
        return result

    # ------------------------------------------------------------------
    # delete_model
    # ------------------------------------------------------------------

    def delete_model(self, model_id: UUID) -> None:
        """Loesche Modell-Row + Lock-Row + alle Storage-Objekte.

        Lock-Row wird via ``ON DELETE CASCADE`` automatisch entfernt (siehe
        ``app/services/auth_service.bootstrap_tenant_if_missing``).
        """
        # Prüfen ob das Modell überhaupt existiert (404 vs. lautlos).
        existing = self.conn.execute(
            text("SELECT 1 FROM models WHERE id = :id"),
            {"id": str(model_id)},
        ).one_or_none()
        if existing is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "E_MODEL_NOT_FOUND",
                    "message": f"Modell {model_id} nicht gefunden.",
                },
            )

        # 1. Storage cleanen (best effort — falls Files fehlen, kein Fehler).
        prefix = _storage_prefix(self.tenant_id, model_id)
        deleted_count = self.storage.delete_prefix(prefix)

        # 2. DB-Row loeschen (Lock-Row kaskadiert).
        self.conn.execute(
            text("DELETE FROM models WHERE id = :id"),
            {"id": str(model_id)},
        )
        self.conn.commit()

        log.info(
            "model.deleted",
            model_id=str(model_id),
            tenant_id=self.tenant_id,
            storage_files_deleted=deleted_count,
        )


__all__ = [
    "MAX_UPLOAD_BYTES",
    "ALLOWED_MIME_TYPES",
    "ModelService",
]
