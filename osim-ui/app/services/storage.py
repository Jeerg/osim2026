"""Object-Storage-Abstraktion: LocalStorage (Dev) und S3Storage (Minio/GCS).

Pattern:
- ``Storage``-Protocol kapselt put/get/delete/signed_url.
- ``LocalStorage`` schreibt unter ``settings.storage_local_root``.
- ``S3Storage`` nutzt ``aioboto3`` -- kompatibel mit Minio (Dev) und GCS-S3-
  Endpoint (Prod).
- ``get_storage()`` ist die FastAPI-Dependency, die je nach
  ``settings.storage_backend`` die passende Implementation liefert.

Storage-Key-Konvention:
    ``tenants/{tenant_id}/models/{model_id}/v{N}-{filename}``
    oder fuer Save-back:
    ``tenants/{tenant_id}/models/{model_id}/v{N}-{YYYYMMDDTHHMMSS}.otx``

Sicherheits-Pflicht (LocalStorage signed URL):
    LocalStorage liefert *keine* echte signierte URL, sondern einen
    API-Pfad ``/api/v1/internal-files/{key}``. Dieser Endpoint MUSS einen
    Auth-Check enthalten und sicherstellen, dass der Key mit
    ``tenants/{request.tenant_id}/`` beginnt -- sonst Datenleck.
    (Der Endpoint ist optional in Phase 1; der Frontend-Pfad nutzt heute
    den ``GET /api/v1/models/{id}/download-original``, der direkt
    ``get_object`` aufruft und das Tenant-Routing ueber den Auth-Stack
    sicherstellt.)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol, runtime_checkable

from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


@runtime_checkable
class Storage(Protocol):
    """Abstrakte Storage-Schnittstelle.

    Alle Methoden sind async; LocalStorage nutzt blocking-IO unter der
    Haube, das ist fuer Dev-Workloads akzeptabel.
    """

    async def put_object(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Speichert ``data`` unter ``key``. Liefert den ``key`` zurueck."""
        ...

    async def get_object(self, key: str) -> bytes:
        """Laedt das Objekt unter ``key``. Raised HTTPException(404),
        wenn nicht vorhanden."""
        ...

    async def delete_object(self, key: str) -> None:
        """Loescht das Objekt. No-op, wenn nicht vorhanden."""
        ...

    async def get_signed_url(self, key: str, ttl_seconds: int = 900) -> str:
        """Liefert eine zeitbeschraenkte URL fuer Direct-Download.

        Bei LocalStorage: API-Pfad statt echter signed URL (siehe Modul-Doku).
        """
        ...


# ---------------------------------------------------------------------------
# LocalStorage
# ---------------------------------------------------------------------------


class LocalStorage:
    """Filesystem-basierter Storage. Schreibt unter ``root / key``.

    Konstruktor-Argumente:
        root: Basis-Verzeichnis. Falls ``None``, ``settings.storage_local_root``.
        api_base: Base-URL fuer signed URLs (z.B. ``http://localhost:8000``).
                  Default leerer String -> relative Pfade.
    """

    def __init__(
        self,
        root: Path | None = None,
        api_base: str = "",
    ) -> None:
        self.root = Path(root) if root is not None else Path(settings.storage_local_root)
        self.api_base = api_base.rstrip("/")
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        """Mappt einen Storage-Key auf einen sicheren Dateipfad.

        Schutz vor Path-Traversal: nach Resolve darf der Pfad nicht
        ausserhalb von ``self.root`` liegen.
        """
        # Forward-Slashes sind kanonisch -- wir verwenden sie als Verzeichnis-
        # Trenner und konvertieren ggf. zu OS-spezifischen Trennern.
        if not key:
            raise HTTPException(status_code=400, detail="Empty storage key")
        if ".." in Path(key).parts:
            raise HTTPException(status_code=400, detail=f"Unsafe storage key: {key!r}")
        target = (self.root / key).resolve()
        try:
            target.relative_to(self.root.resolve())
        except ValueError as exc:  # path traversal escape attempt
            raise HTTPException(status_code=400, detail=f"Unsafe storage key: {key!r}") from exc
        return target

    async def put_object(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        logger.debug("local_storage_put", extra={"key": key, "bytes": len(data)})
        return key

    async def get_object(self, key: str) -> bytes:
        target = self._resolve(key)
        if not target.is_file():
            raise HTTPException(status_code=404, detail=f"Object not found: {key}")
        return target.read_bytes()

    async def delete_object(self, key: str) -> None:
        target = self._resolve(key)
        if target.is_file():
            target.unlink(missing_ok=True)

    async def get_signed_url(self, key: str, ttl_seconds: int = 900) -> str:
        # LocalStorage liefert einen Pfad-Stub. Ein echter Internal-File-
        # Endpoint kann den Key dann ueber get_object aufloesen, NACH
        # Auth-Check + Tenant-Prefix-Validation.
        path = f"/api/v1/internal-files/{key}"
        return f"{self.api_base}{path}" if self.api_base else path


# ---------------------------------------------------------------------------
# S3Storage (Minio + GCS-S3-Endpoint)
# ---------------------------------------------------------------------------


class S3Storage:
    """S3-kompatibler Storage (Minio Dev, GCS-S3-Endpoint Prod).

    Benutzt aioboto3-Client (async). Bucket muss bereits existieren --
    Auto-Create im Konstruktor wird nur fuer Minio versucht.
    """

    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "us-east-1",
    ) -> None:
        # Lazy-Import: aioboto3 ist optional, soll nicht beim Modul-Import
        # crashen, wenn settings.storage_backend = "local".
        import aioboto3  # noqa: F401  (Import-Test only)

        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.region = region

    def _session(self):  # noqa: ANN202
        import aioboto3
        return aioboto3.Session(
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
        )

    async def put_object(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            await s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        return key

    async def get_object(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            try:
                resp = await s3.get_object(Bucket=self.bucket, Key=key)
                async with resp["Body"] as stream:
                    return await stream.read()
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in {"NoSuchKey", "404"}:
                    raise HTTPException(
                        status_code=404, detail=f"Object not found: {key}"
                    ) from exc
                raise

    async def delete_object(self, key: str) -> None:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            await s3.delete_object(Bucket=self.bucket, Key=key)

    async def get_signed_url(self, key: str, ttl_seconds: int = 900) -> str:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=ttl_seconds,
            )
        return url


# ---------------------------------------------------------------------------
# Factory + Dependency
# ---------------------------------------------------------------------------


_STORAGE_SINGLETON: Storage | None = None


def get_storage() -> Storage:
    """FastAPI-Dependency: liefert die konfigurierte Storage-Instanz.

    Singleton-Pattern -- Backends wie aioboto3 sind teuer im Constructor.
    Reset ueber ``reset_storage_singleton()`` (nur fuer Tests).
    """
    global _STORAGE_SINGLETON
    if _STORAGE_SINGLETON is not None:
        return _STORAGE_SINGLETON

    backend = settings.storage_backend
    if backend == "local":
        _STORAGE_SINGLETON = LocalStorage(root=settings.storage_local_root)
    elif backend == "minio":
        _STORAGE_SINGLETON = S3Storage(
            endpoint_url=f"http://{settings.storage_minio_endpoint}",
            access_key=settings.storage_minio_access_key,
            secret_key=settings.storage_minio_secret_key,
            bucket=settings.storage_minio_bucket,
        )
    elif backend == "gcs":
        # GCS unterstuetzt einen S3-kompatiblen Endpunkt; Credentials kommen
        # in Phase 1 noch ueber dieselben Settings-Variablen. Echtes GCS-
        # Signing wird in Phase 4+ (Cloud-Deployment) folgen.
        _STORAGE_SINGLETON = S3Storage(
            endpoint_url="https://storage.googleapis.com",
            access_key=settings.storage_minio_access_key,
            secret_key=settings.storage_minio_secret_key,
            bucket=settings.storage_gcs_bucket or settings.storage_minio_bucket,
        )
    else:
        raise ValueError(f"Unknown storage_backend: {backend!r}")
    return _STORAGE_SINGLETON


def reset_storage_singleton() -> None:
    """Nur fuer Tests: zwingt die naechste ``get_storage()`` zur Neu-Anlage."""
    global _STORAGE_SINGLETON
    _STORAGE_SINGLETON = None
