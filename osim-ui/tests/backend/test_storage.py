"""Unit-Tests für ``app/services/storage.py`` (LocalStorage + Factory).

Pattern: gegen LocalStorage über ``tmp_path``-Fixture. KEIN Minio-Probe in
dieser Welle — der ``@requires_minio``-Smoke-Test kommt in Plan 05 mit dem
Compose-Stack.

Stack-Parität zu 3fls: sync ``StorageService`` (3fls-`datalake/storage.py` ist
ebenfalls sync). Async-Wrapper kann in späteren Phasen ergänzt werden, wenn
multi-MB-Up/Downloads den Event-Loop blockieren.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.storage import LocalStorage, StorageService, get_storage


# ---------------------------------------------------------------------------
# LocalStorage — Roundtrip + Edge-Cases
# ---------------------------------------------------------------------------


@pytest.fixture
def local_storage(tmp_path: Path) -> LocalStorage:
    """Frische LocalStorage-Instanz unter ``tmp_path``."""
    return LocalStorage(root=tmp_path / "storage")


def test_put_get_roundtrip(local_storage: LocalStorage) -> None:
    """put_object → get_object liefert byte-stabile Daten."""
    local_storage.put_object("foo/bar.txt", b"hello world")
    assert local_storage.get_object("foo/bar.txt") == b"hello world"


def test_get_missing_raises_keyerror(local_storage: LocalStorage) -> None:
    """Nicht-existenter Key → ``KeyError`` (nicht ``FileNotFoundError``)."""
    with pytest.raises(KeyError):
        local_storage.get_object("does/not/exist.bin")


def test_delete_object(local_storage: LocalStorage) -> None:
    """delete_object entfernt den File; exists liefert False danach."""
    local_storage.put_object("a/b.txt", b"x")
    assert local_storage.exists("a/b.txt") is True
    local_storage.delete_object("a/b.txt")
    assert local_storage.exists("a/b.txt") is False


def test_delete_object_missing_is_noop(local_storage: LocalStorage) -> None:
    """delete_object auf nicht-existentem Key wirft KEINEN Fehler."""
    local_storage.delete_object("nothing/here.bin")  # darf nicht raisen


def test_delete_prefix_returns_count(local_storage: LocalStorage) -> None:
    """delete_prefix löscht rekursiv und liefert Anzahl gelöschter Files."""
    local_storage.put_object("p/a.txt", b"1")
    local_storage.put_object("p/b.txt", b"2")
    local_storage.put_object("p/sub/c.txt", b"3")
    local_storage.put_object("other/x.txt", b"9")

    deleted = local_storage.delete_prefix("p")
    assert deleted == 3
    assert local_storage.exists("p/a.txt") is False
    assert local_storage.exists("p/sub/c.txt") is False
    # `other`-Prefix bleibt unberührt.
    assert local_storage.exists("other/x.txt") is True


def test_list_objects_prefix_filter(local_storage: LocalStorage) -> None:
    """list_objects liefert nur Keys unter dem gegebenen Prefix."""
    local_storage.put_object("a/one.txt", b"1")
    local_storage.put_object("a/two.txt", b"2")
    local_storage.put_object("b/three.txt", b"3")

    keys_a = sorted(local_storage.list_objects("a"))
    assert keys_a == ["a/one.txt", "a/two.txt"]

    keys_b = sorted(local_storage.list_objects("b"))
    assert keys_b == ["b/three.txt"]


def test_exists_true_false(local_storage: LocalStorage) -> None:
    """exists differenziert vorhanden / nicht-vorhanden."""
    local_storage.put_object("here.txt", b"present")
    assert local_storage.exists("here.txt") is True
    assert local_storage.exists("absent.txt") is False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def test_factory_local_returns_localstorage(monkeypatch, tmp_path) -> None:
    """get_storage() mit storage_backend='local' liefert eine LocalStorage."""
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "storage_backend", "local")
    # tmp_path als Override, damit der Test nicht das echte ./data/storage
    # verschmutzt.
    monkeypatch.setenv("OSIM_LOCAL_STORAGE_ROOT", str(tmp_path / "ls"))

    storage = get_storage()
    assert isinstance(storage, LocalStorage)
    assert isinstance(storage, StorageService)


def test_factory_gcs_raises_not_implemented(monkeypatch) -> None:
    """get_storage() mit storage_backend='gcs' raised — Phase 5+."""
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "storage_backend", "gcs")
    with pytest.raises(NotImplementedError, match="GCS"):
        get_storage()


def test_factory_unknown_backend_raises_value_error(monkeypatch) -> None:
    """Unbekannter Backend-Name → ValueError."""
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "storage_backend", "wishful")
    with pytest.raises(ValueError, match="storage_backend"):
        get_storage()
