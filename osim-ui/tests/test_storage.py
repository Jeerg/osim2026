"""Tests fuer die Storage-Abstraktion (LocalStorage + S3Storage-Skip).

LocalStorage wird voll getestet (put → get → delete + signed_url-Pfad).
S3Storage gegen Minio nur, wenn der Endpoint erreichbar ist (skipif).
"""

from __future__ import annotations

import socket
from pathlib import Path

import pytest

from app.services.storage import LocalStorage, S3Storage

# ---------------------------------------------------------------------------
# LocalStorage
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_local_storage_put_get_roundtrip(tmp_path: Path) -> None:
    """put_object schreibt, get_object liest dieselben Bytes zurueck."""
    store = LocalStorage(root=tmp_path)
    key = "tenants/tenant_x/models/1/v1/Dummy.otx"
    payload = b"OIDArray|0!\n"

    returned_key = await store.put_object(key, payload, content_type="text/plain")
    assert returned_key == key

    on_disk = (tmp_path / key).read_bytes()
    assert on_disk == payload

    got = await store.get_object(key)
    assert got == payload


@pytest.mark.asyncio
async def test_local_storage_get_missing_raises_404(tmp_path: Path) -> None:
    """get_object auf unbekannten Key -> HTTPException(404)."""
    from fastapi import HTTPException

    store = LocalStorage(root=tmp_path)
    with pytest.raises(HTTPException) as exc:
        await store.get_object("tenants/x/missing.bin")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_local_storage_delete_then_get_404(tmp_path: Path) -> None:
    """Nach delete_object liefert get_object 404."""
    from fastapi import HTTPException

    store = LocalStorage(root=tmp_path)
    key = "tenants/t/models/1/v1/test.otx"
    await store.put_object(key, b"hello")
    await store.delete_object(key)
    with pytest.raises(HTTPException) as exc:
        await store.get_object(key)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_local_storage_delete_missing_is_noop(tmp_path: Path) -> None:
    """delete_object auf unbekannten Key wirft keinen Fehler."""
    store = LocalStorage(root=tmp_path)
    # Sollte einfach durchlaufen, ohne Exception
    await store.delete_object("tenants/x/nope.bin")


@pytest.mark.asyncio
async def test_local_storage_signed_url_format(tmp_path: Path) -> None:
    """signed_url liefert /api/v1/internal-files/{key} -- mit optionaler base."""
    store = LocalStorage(root=tmp_path)
    url = await store.get_signed_url("tenants/t/models/1/v1/x.otx", ttl_seconds=300)
    assert url == "/api/v1/internal-files/tenants/t/models/1/v1/x.otx"

    store_with_base = LocalStorage(root=tmp_path, api_base="http://localhost:8000")
    url2 = await store_with_base.get_signed_url("a/b.txt", ttl_seconds=300)
    assert url2 == "http://localhost:8000/api/v1/internal-files/a/b.txt"


@pytest.mark.asyncio
async def test_local_storage_rejects_path_traversal(tmp_path: Path) -> None:
    """put_object mit '..' im Key wird abgelehnt (Path-Traversal-Schutz)."""
    from fastapi import HTTPException

    store = LocalStorage(root=tmp_path)
    with pytest.raises(HTTPException):
        await store.put_object("tenants/../../../etc/passwd", b"x")
    with pytest.raises(HTTPException):
        await store.put_object("", b"x")


@pytest.mark.asyncio
async def test_local_storage_writes_nested_dirs(tmp_path: Path) -> None:
    """Tiefe Storage-Keys werden automatisch als Verzeichnishierarchie angelegt."""
    store = LocalStorage(root=tmp_path)
    key = "tenants/t1/models/42/v3/deep/path/file.otx"
    await store.put_object(key, b"content")
    assert (tmp_path / key).is_file()


# ---------------------------------------------------------------------------
# S3Storage (Minio) -- skipif wenn nicht erreichbar
# ---------------------------------------------------------------------------


def _minio_reachable() -> bool:
    """Probet localhost:9000 -- Minio-Default."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.5)
    try:
        return sock.connect_ex(("localhost", 9000)) == 0
    finally:
        sock.close()


@pytest.mark.asyncio
@pytest.mark.skipif(not _minio_reachable(), reason="Minio nicht reachable auf :9000")
async def test_s3_storage_put_get_roundtrip_against_minio() -> None:
    """Integration: S3Storage gegen lokales Minio.

    Voraussetzung: docker compose up minio. Bucket wird erzeugt, falls fehlt.
    """
    # Bucket-Vorbereitung mit aioboto3 direkt
    import aioboto3
    from botocore.exceptions import ClientError

    bucket = "osim-ui-test"
    session = aioboto3.Session(
        aws_access_key_id="osim_dev",
        aws_secret_access_key="osim_dev_password",
        region_name="us-east-1",
    )
    async with session.client("s3", endpoint_url="http://localhost:9000") as s3:
        try:
            await s3.create_bucket(Bucket=bucket)
        except ClientError as exc:
            # bucket exists already -- OK
            if "BucketAlreadyOwnedByYou" not in str(exc) and "BucketAlreadyExists" not in str(exc):
                # Anderer Fehler -> raise
                raise

    store = S3Storage(
        endpoint_url="http://localhost:9000",
        access_key="osim_dev",
        secret_key="osim_dev_password",
        bucket=bucket,
    )
    key = "tenants/test/models/1/v1/Dummy.otx"
    payload = b"OIDArray|0!\n"

    await store.put_object(key, payload, content_type="text/plain")
    got = await store.get_object(key)
    assert got == payload

    url = await store.get_signed_url(key, ttl_seconds=60)
    assert url.startswith("http://localhost:9000/")

    await store.delete_object(key)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def test_get_storage_returns_local_in_test_env() -> None:
    """In Test-Env (STORAGE_BACKEND=local) liefert get_storage LocalStorage."""
    from app.services.storage import get_storage, reset_storage_singleton

    reset_storage_singleton()
    s = get_storage()
    assert isinstance(s, LocalStorage)
    # Idempotent
    s2 = get_storage()
    assert s is s2
    reset_storage_singleton()
