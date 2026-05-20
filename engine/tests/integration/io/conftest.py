"""Fixtures für OTX-Roundtrip-Integrationstests.

Stellt drei OTX-Fixtures bereit:

  - `embb_pre_run_otx_path` — aus `engine/tests/fixtures/otx/` (immer
    verfügbar, im Repo committed).
  - `dummy_otx_path` — aus dem OSim2004-Vorstellung04-Verzeichnis
    (`C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04/Dummy.otx`).
    Skipt automatisch, wenn das Verzeichnis nicht erreichbar ist (CI ohne
    Original-OSim2004-Checkout).
  - `fertigungsstruktur1_otx_path` — analog für
    `Fertigungsstruktur1_mit_AslFj.otx`.

Die externen Fixtures werden NICHT ins Repo kopiert — Tests bekommen den
Original-Pfad und parsen direkt.
"""

from __future__ import annotations

from pathlib import Path

import pytest


# Path-Helper: in-repo Fixtures
_IN_REPO_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "otx"

# OSim2004-Vorstellung04: kanonische Beispielmodelle
_OSIM2004_VORSTELLUNG04 = Path(
    "C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04"
)


@pytest.fixture(scope="session")
def embb_pre_run_otx_path() -> Path:
    """Pre-Run-Snapshot des Embb-AslFj-Modells (im Repo, ~1480 OIDs)."""
    path = _IN_REPO_FIXTURES / "embb_pre_run.otx"
    if not path.exists():
        pytest.skip(f"In-repo fixture missing: {path}")
    return path


@pytest.fixture(scope="session")
def dummy_otx_path() -> Path:
    """Pfad zum Dummy.otx aus OSim2004/Vorstellung04 — sonst Skip."""
    path = _OSIM2004_VORSTELLUNG04 / "Dummy.otx"
    if not path.exists():
        pytest.skip(f"OSim2004 fixture not available: {path}")
    return path


@pytest.fixture(scope="session")
def fertigungsstruktur1_otx_path() -> Path:
    """Pfad zum Fertigungsstruktur1_mit_AslFj.otx — sonst Skip."""
    path = _OSIM2004_VORSTELLUNG04 / "Fertigungsstruktur1_mit_AslFj.otx"
    if not path.exists():
        pytest.skip(f"OSim2004 fixture not available: {path}")
    return path
