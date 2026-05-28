"""Unit-Tests für ``app.core.database``.

Phase-1-Fokus: SQL-Injection-Defense via Whitelist-Regex auf ``tenant_id``
(3fls-Pattern Z.114-137 + RESEARCH §Common Pitfalls #1). Diese Tests laufen
OHNE Postgres — sie prüfen nur die Regex-Validierung vor dem DB-Zugriff.

Integration-Tests gegen echtes Postgres kommen in Plan 05 (Compose-Stack).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest


def _build_request_with_tenant(tenant_id: str | None) -> object:
    """Bauen eines schmalen Mock-``Request`` mit ``state.tenant_id``."""
    state = SimpleNamespace()
    if tenant_id is not None:
        state.tenant_id = tenant_id
    return SimpleNamespace(state=state)


def test_get_db_rejects_invalid_tenant_slug_with_quote_injection() -> None:
    """``get_db`` MUSS ValueError werfen bevor irgendein DB-Zugriff erfolgt,
    wenn ``tenant_id`` SQL-Injection-Zeichen enthält (Quote + Drop)."""
    from app.core.database import get_db

    request = _build_request_with_tenant("'; DROP TABLE x; --")
    gen = get_db(request)
    with pytest.raises(ValueError, match="Invalid tenant slug"):
        next(gen)


def test_get_db_rejects_invalid_tenant_slug_with_semicolon() -> None:
    """Semikolon ist nicht im Whitelist-Pattern und MUSS abgewiesen werden."""
    from app.core.database import get_db

    request = _build_request_with_tenant("abc;def")
    gen = get_db(request)
    with pytest.raises(ValueError, match="Invalid tenant slug"):
        next(gen)


def test_get_db_rejects_invalid_tenant_slug_with_space() -> None:
    """Leerzeichen ist nicht im Whitelist-Pattern."""
    from app.core.database import get_db

    request = _build_request_with_tenant("abc def")
    gen = get_db(request)
    with pytest.raises(ValueError, match="Invalid tenant slug"):
        next(gen)


def test_get_db_rejects_missing_tenant_id() -> None:
    """Fehlt ``tenant_id`` ganz, MUSS ValueError fliegen (Middleware-Gap-Defense)."""
    from app.core.database import get_db

    request = _build_request_with_tenant(None)
    gen = get_db(request)
    with pytest.raises(ValueError, match="No tenant_id"):
        next(gen)


def test_db_models_are_registered() -> None:
    """Die zwei Phase-1-Modelle MÜSSEN in ``Base.metadata`` sein."""
    from app.db.models import Base

    table_names = {t.name for t in Base.metadata.tables.values()}
    assert "tenants" in table_names
    assert "users" in table_names
    # Beide leben im public-Schema
    for table in Base.metadata.tables.values():
        if table.name in {"tenants", "users"}:
            assert table.schema == "public", (
                f"Table {table.name} muss im public-Schema liegen, "
                f"fand: {table.schema!r}"
            )
