"""TDD-Tests fuer die Plan-01-05-Erweiterungen der conftest.py.

Verifiziert die neuen Fixture-Helper, ohne dass laufende Services noetig sind:
    * ``_tcp_alive(host, port)`` — TCP-Socket-Probe.
    * ``_emulator_token(email, password)`` — Helper fuer Firebase-Emulator-
      Token (wir testen die Existenz und die richtige URL-Konstruktion ueber
      Mocking, nicht den echten Aufruf).
    * ``pytest_collection_modifyitems`` muss jetzt vier Marker-Familien
      handhaben (requires_engine + requires_postgres +
      requires_firebase_emulator + requires_minio).
"""

from __future__ import annotations

import pytest


def test_tcp_alive_helper_exists_and_returns_bool() -> None:
    """``_tcp_alive`` ist exportiert und liefert bool zurueck."""
    from tests.backend import conftest as _conftest

    assert hasattr(_conftest, "_tcp_alive"), (
        "conftest.py muss _tcp_alive(host, port, timeout) anbieten."
    )
    result = _conftest._tcp_alive("127.0.0.1", 1, timeout=0.5)  # Port 1 ist garantiert tot
    assert isinstance(result, bool)
    assert result is False  # nothing listens on port 1 in a sane system


def test_emulator_token_helper_exists() -> None:
    """``_emulator_token`` ist exportiert und nimmt email + password."""
    from tests.backend import conftest as _conftest

    assert hasattr(_conftest, "_emulator_token"), (
        "conftest.py muss _emulator_token(email, password) anbieten."
    )
    # Wir rufen NICHT auf — der Helper macht ein HTTP-Request gegen 9099.
    # Ein laufender Emulator ist nicht garantiert. Existenz + Callable reicht.
    assert callable(_conftest._emulator_token)


def test_test_firebase_api_key_constant() -> None:
    """Demo-API-Key fuer Emulator-Tokens ist definiert."""
    from tests.backend import conftest as _conftest

    assert hasattr(_conftest, "_TEST_FIREBASE_API_KEY")
    assert isinstance(_conftest._TEST_FIREBASE_API_KEY, str)
    assert len(_conftest._TEST_FIREBASE_API_KEY) > 0


def test_collection_modifyitems_handles_four_marker_families() -> None:
    """Die Marker-Auto-Skip-Logik kennt alle vier requires_*-Familien."""
    # Wir koennen den Hook nicht direkt aufrufen, weil er pytest-config
    # braucht. Stattdessen pruefen wir, dass die Source-Code-Erweiterung da
    # ist — d.h. dass der Hook auf alle vier Marker prueft.
    import inspect

    from tests.backend import conftest as _conftest

    src = inspect.getsource(_conftest.pytest_collection_modifyitems)
    for marker in (
        "requires_engine",
        "requires_postgres",
        "requires_firebase_emulator",
        "requires_minio",
    ):
        assert marker in src, (
            f"pytest_collection_modifyitems muss {marker} behandeln."
        )


def test_auth_headers_fixture_uses_admin_token(
    pytestconfig: pytest.Config,
) -> None:
    """Existenz-Test: die ``auth_headers``-Fixture ist registriert.

    Wir koennen die Fixture nicht direkt instanziieren (sie braucht
    admin_token, das ein Live-Firebase-Emulator braucht). Aber wir koennen
    pruefen, dass sie in der Fixture-Registry vorkommt.
    """
    fixture_names = pytestconfig.pluginmanager.hook.pytest_collection_modifyitems
    # Reine Existenz-Pruefung ueber Symbol im conftest-Modul.
    from tests.backend import conftest as _conftest

    assert hasattr(_conftest, "auth_headers"), (
        "conftest.py muss eine auth_headers-Fixture anbieten."
    )
    _ = fixture_names  # noqa: F841 — der Hook-Zugriff bestaetigt nur, dass pytest geladen ist
