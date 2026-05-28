"""Fixtures-Modul: Pfade zu den drei kanonischen OSim2004-Test-OTX-Files.

Dieses Modul ist die einzige Quelle der Wahrheit für die Pfade zu den
Test-OTX-Modellen. Tests und Skripte konsumieren `DUMMY_OTX`,
`FERTIGUNGSSTRUKTUR1_OTX` und `BOSCH2_WECHSELN_OTX`.

Pfad-Korrektur (Rule 3 - blocking, 2026-05-21):
    Plan-Vorlage referenzierte `OSim2004/OSimV01(Fj)/Vorstellung04/`. Tatsächlich
    leben die OTX-Files unter `OSim2004/Vorstellung04/` (kein OSimV01(Fj)-
    Zwischen-Ordner). Glob-Verifikation 2026-05-21:
        C:\\...\\OSim2004\\Vorstellung04\\Dummy.otx
        C:\\...\\OSim2004\\Vorstellung04\\Fertigungsstruktur1_mit_AslFj.otx
        C:\\...\\OSim2004\\Vorstellung04\\Bosch2_wechseln.otx
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


# Workspace-Root der OSim2004-Read-Only-Referenz (verifiziert via Glob).
OSIM2004_VORSTELLUNG04 = Path(
    r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04"
)

DUMMY_OTX = OSIM2004_VORSTELLUNG04 / "Dummy.otx"
FERTIGUNGSSTRUKTUR1_OTX = OSIM2004_VORSTELLUNG04 / "Fertigungsstruktur1_mit_AslFj.otx"
BOSCH2_WECHSELN_OTX = OSIM2004_VORSTELLUNG04 / "Bosch2_wechseln.otx"


# Alle drei OTX-Files als Liste — wird vom Coverage-Skript konsumiert.
ALL_TEST_OTX: list[Path] = [
    DUMMY_OTX,
    FERTIGUNGSSTRUKTUR1_OTX,
    BOSCH2_WECHSELN_OTX,
]


def require_otx(path: Path) -> Path:
    """Skip-fail-fast-Helper: liefert ``path`` zurück, wenn die Datei existiert.

    Fehlt sie, wird der Test mit ``pytest.skip(...)`` ausgesetzt — nicht mit
    einem harten ``FileNotFoundError``, damit Tests auf Maschinen ohne den
    OSim2004-Workspace nicht failen, sondern nur skippen.
    """
    if not path.exists():
        pytest.skip(f"Test-OTX nicht gefunden: {path}")
    return path


def engine_available() -> bool:
    """True, wenn ``osim_engine.io.otx_writer`` importierbar ist.

    Wird vom ``pytest_collection_modifyitems``-Hook in ``conftest.py`` benutzt,
    um Tests mit ``@pytest.mark.requires_engine`` automatisch zu skippen,
    falls die Engine nicht im Workspace installiert ist.
    """
    return importlib.util.find_spec("osim_engine.io.otx_writer") is not None
