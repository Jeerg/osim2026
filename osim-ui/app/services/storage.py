"""Storage-Abstraktion für osim-ui.

D-03 (Object Storage): Original-OTX-Upload und alle Versionen werden in
einem Object Storage abgelegt. Phase 1: lokales Filesystem oder Minio (S3-
API über boto3). Phase 5: GCS (gehört noch nicht in dieses Repo).

Pattern-Quelle: konzeptuell wie ``tbx_stzrim/datalake/storage.py``, aber
ohne GCS-Spezifika und ohne Streaming-API (Phase 1 hat keine Multi-GB-
Uploads).

Layout-Konvention (in ``app/services/model_service.py`` zementiert):
    ``tenants/{tenant_id}/models/{model_id}/(original.otx | v_<timestamp>.otx)``

Stack: sync. Minio-Backend nutzt boto3 (das ``minio``-Python-SDK ist S3-
kompatibel, aber boto3 ist 3fls-Konvention für AWS-/Minio-Endpoints).
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING

import structlog

from app.core.config import settings

if TYPE_CHECKING:
    pass

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Abstract Base
# ---------------------------------------------------------------------------


class StorageService(ABC):
    """Abstraktes Storage-Interface.

    Sechs Methoden — bewusst klein gehalten. Streaming-API (chunked upload,
    pre-signed URLs) kommt in Phase 5 mit GCS. Phase 1 kommt mit
    in-memory-bytes aus.
    """

    @abstractmethod
    def put_object(self, key: str, data: bytes) -> None:
        """Speichere ``data`` unter ``key``. Überschreibt existierendes File."""

    @abstractmethod
    def get_object(self, key: str) -> bytes:
        """Lade ``data`` für ``key``. ``KeyError`` wenn nicht vorhanden."""

    @abstractmethod
    def delete_object(self, key: str) -> None:
        """Lösche ``key``. No-op, wenn nicht vorhanden."""

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int:
        """Lösche alle Keys unter ``prefix``. Liefert Anzahl gelöschter Files."""

    @abstractmethod
    def list_objects(self, prefix: str) -> list[str]:
        """Liefere Liste aller Keys unter ``prefix``."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """True, wenn ``key`` existiert."""


# ---------------------------------------------------------------------------
# LocalStorage — Filesystem-Backend für Dev + Tests
# ---------------------------------------------------------------------------


class LocalStorage(StorageService):
    """Filesystem-basiertes Storage-Backend.

    Keys werden als relative Pfade unter ``root`` abgelegt. Beispiel:

        root = ./data/storage
        key  = tenants/abc/models/uuid/original.otx
        → ./data/storage/tenants/abc/models/uuid/original.otx

    Keys mit Backslashes (``\\``) werden auf POSIX-Slashes normalisiert.
    Listing liefert ebenfalls POSIX-Slashes — egal auf welchem OS gerendert.
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _normalize(key: str) -> str:
        """Backslashes → POSIX-Slashes (Windows-Pfade in Keys vermeiden)."""
        return key.replace("\\", "/").lstrip("/")

    def _path(self, key: str) -> Path:
        return self.root / self._normalize(key)

    def put_object(self, key: str, data: bytes) -> None:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def get_object(self, key: str) -> bytes:
        target = self._path(key)
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise KeyError(key) from exc

    def delete_object(self, key: str) -> None:
        target = self._path(key)
        try:
            target.unlink()
        except FileNotFoundError:
            # No-op: idempotent.
            return

    def delete_prefix(self, prefix: str) -> int:
        prefix_path = self._path(prefix)
        if not prefix_path.exists():
            return 0

        deleted = 0
        if prefix_path.is_file():
            prefix_path.unlink()
            return 1

        # Verzeichnis — rekursiv files löschen, leere Dirs stehen lassen
        # (sicherer für parallele Operationen).
        for entry in prefix_path.rglob("*"):
            if entry.is_file():
                entry.unlink()
                deleted += 1
        return deleted

    def list_objects(self, prefix: str) -> list[str]:
        prefix_path = self._path(prefix)
        if not prefix_path.exists():
            return []

        # Suche Files unter prefix_path, gib relative POSIX-Pfade unter
        # self.root zurück.
        results: list[str] = []
        for entry in prefix_path.rglob("*") if prefix_path.is_dir() else [prefix_path]:
            if entry.is_file():
                rel = entry.relative_to(self.root)
                results.append(rel.as_posix())
        return results

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


# ---------------------------------------------------------------------------
# MinioStorage — S3-API-Backend via boto3
# ---------------------------------------------------------------------------


class MinioStorage(StorageService):
    """Minio-/S3-Backend über boto3.

    Bucket wird beim Init geprüft und ggf. angelegt (idempotent gegen Race
    via ``BucketAlreadyOwnedByYou``-Tolerance).

    KEY-Konvention: identisch zu LocalStorage — ``tenants/{tid}/...``.

    Phase-5-Migration: GCS hat eine andere boto3-Inkompatible API (z.B.
    keine ``endpoint_url``-Override-Konvention). Daher in Phase 5 ein
    eigenes ``GcsStorage`` neben MinioStorage, NICHT die boto3-Konfiguration
    umbiegen.
    """

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
    ) -> None:
        # Lazy-Import: boto3 ist eine schwergewichtige Dependency, und
        # Dev-Setups mit Local-Storage sollen ohne boto3-Import starten.
        import boto3
        from botocore.exceptions import ClientError

        self._client_error_cls = ClientError
        self._s3 = boto3.client(
            "s3",
            endpoint_url=(
                endpoint
                if endpoint.startswith(("http://", "https://"))
                else f"http://{endpoint}"
            ),
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            # Region beliebig — Minio braucht eine, ignoriert sie aber.
            region_name="us-east-1",
        )
        self._bucket = bucket
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        """Lege Bucket an, wenn er noch nicht existiert."""
        try:
            self._s3.head_bucket(Bucket=self._bucket)
        except self._client_error_cls as exc:
            err_code = exc.response.get("Error", {}).get("Code", "")
            if err_code in ("404", "NoSuchBucket", "NotFound"):
                self._s3.create_bucket(Bucket=self._bucket)
                log.info("storage.bucket_created", bucket=self._bucket)
            else:
                raise

    def put_object(self, key: str, data: bytes) -> None:
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=data)

    def get_object(self, key: str) -> bytes:
        try:
            response = self._s3.get_object(Bucket=self._bucket, Key=key)
        except self._client_error_cls as exc:
            err_code = exc.response.get("Error", {}).get("Code", "")
            if err_code in ("NoSuchKey", "404"):
                raise KeyError(key) from exc
            raise
        return response["Body"].read()

    def delete_object(self, key: str) -> None:
        # S3 / Minio: delete_object ist idempotent — kein Fehler bei
        # nicht-existentem Key.
        self._s3.delete_object(Bucket=self._bucket, Key=key)

    def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        paginator = self._s3.get_paginator("list_objects_v2")
        to_delete: list[dict[str, str]] = []

        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                to_delete.append({"Key": obj["Key"]})
                # Batch-Limit von S3 ist 1000 Keys pro Delete-Request.
                if len(to_delete) >= 1000:
                    self._s3.delete_objects(
                        Bucket=self._bucket,
                        Delete={"Objects": to_delete},
                    )
                    deleted += len(to_delete)
                    to_delete = []

        if to_delete:
            self._s3.delete_objects(
                Bucket=self._bucket,
                Delete={"Objects": to_delete},
            )
            deleted += len(to_delete)
        return deleted

    def list_objects(self, prefix: str) -> list[str]:
        keys: list[str] = []
        paginator = self._s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    def exists(self, key: str) -> bool:
        try:
            self._s3.head_object(Bucket=self._bucket, Key=key)
            return True
        except self._client_error_cls as exc:
            err_code = exc.response.get("Error", {}).get("Code", "")
            if err_code in ("404", "NoSuchKey", "NotFound"):
                return False
            raise


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def _local_storage_root() -> Path:
    """Pfad für LocalStorage (Dev + Tests).

    Override via ``OSIM_LOCAL_STORAGE_ROOT``-ENV — wird in Tests genutzt, um
    nicht das echte ``./data/storage`` zu verschmutzen.
    """
    override = os.environ.get("OSIM_LOCAL_STORAGE_ROOT")
    if override:
        return Path(override).resolve()
    return Path("./data/storage").resolve()


def get_storage() -> StorageService:
    """Factory-Funktion: liefert das StorageService-Backend per Config.

    Schalter: ``settings.storage_backend`` ∈ {"local", "minio", "gcs"}.

    Hinweis: das Ergebnis ist KEIN Singleton — jeder Aufruf liefert eine
    neue Instanz. Caller können selbst cachen, wenn nötig (z.B. via FastAPI-
    Dependency mit ``functools.lru_cache``). LocalStorage ist billig zu
    instanziieren (nur ``mkdir``); MinioStorage öffnet einen boto3-Client +
    macht einen ``head_bucket``-Roundtrip — bei hot-paths cachen.
    """
    backend = settings.storage_backend
    if backend == "local":
        return LocalStorage(root=_local_storage_root())
    if backend == "minio":
        return MinioStorage(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=settings.minio_bucket,
        )
    if backend == "gcs":
        raise NotImplementedError(
            "GCS-Storage kommt in Phase 5 — boto3-MinioStorage ist Phase-1-"
            "Fallback. settings.storage_backend='gcs' ist hier noch nicht "
            "unterstützt."
        )
    raise ValueError(
        f"Unknown storage_backend: {backend!r} "
        "(erwartet: 'local' | 'minio' | 'gcs')"
    )


__all__ = [
    "LocalStorage",
    "MinioStorage",
    "StorageService",
    "get_storage",
]
