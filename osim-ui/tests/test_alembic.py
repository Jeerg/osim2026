"""Alembic-Smoke: upgrade head -> downgrade base -> upgrade head laeuft sauber."""

from __future__ import annotations

import os

import pytest
from alembic import command
from alembic.config import Config

pytestmark = pytest.mark.requires_db


def _make_alembic_config() -> Config:
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
    cfg = Config(os.path.join(repo_root, "db", "alembic.ini"))
    # script_location ist im ini relativ via %(here)s -- in unserem
    # repo-root als CWD geschickt zu starten; daher absolut setzen.
    cfg.set_main_option(
        "script_location",
        os.path.join(repo_root, "db", "migrations"),
    )
    return cfg


def test_alembic_upgrade_head_then_downgrade_base_roundtrip() -> None:
    """Migrations koennen sauber up- und downgegraded werden."""
    cfg = _make_alembic_config()

    # Falls schon migriert (Test-Reihenfolge), erst auf base zuruecksetzen.
    command.downgrade(cfg, "base")

    # Up
    command.upgrade(cfg, "head")
    # Idempotent: zweimal up -> no-op
    command.upgrade(cfg, "head")

    # Down
    command.downgrade(cfg, "base")

    # Wieder up, damit folgende DB-Tests die Tabellen haben.
    command.upgrade(cfg, "head")
