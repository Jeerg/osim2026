"""Roundtrip-Coverage-Tests für osim_engine.io.otx_writer.

Welle 0 von Phase 1: misst, ob der bereits existierende OTX-Writer für die
drei kanonischen OSim2004-Test-Modelle (Dummy / Fertigungsstruktur1 / Bosch2)
einen praktisch brauchbaren Roundtrip leistet.

Roundtrip-Logik (alle drei Modell-Tests identisch):
    1. Lade Original via ``load_otx_file(path)`` → ``LoadResult``.
    2. Schreibe via ``dump_simulator_to_otx(...)`` → ``str``.
    3. Encode Latin-1, schreibe in Tempfile, parse via ``parse_otx_file`` →
       ``OtxFile`` (rohe Parser-Stufe, nicht der Loader — wir messen die
       Reader/Writer-Symmetrie, nicht die Loader-Coverage).
    4. Assert: ``set(by_oid.keys())`` zwischen Original und Roundtrip identisch.

Pitfall #3 (Latin-1-Encoding): Wird explizit in jedem Roundtrip durch
``.encode("latin-1")`` durchgesetzt. ``test_latin1_umlaut_roundtrip`` deckt
den Encoding-Boundary mit einem Umlaut-haltigen String-Attribut ab.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import pytest

# Engine-Imports werden lazy via fixture/test bedingt geladen — der
# ``requires_engine``-Auto-Skip-Hook in conftest.py greift bei Bedarf.
from osim_engine.io.otx_loader import LoadResult, load_otx_file
from osim_engine.io.otx_reader import OtxFile, parse_otx_file
from osim_engine.io.otx_writer import dump_simulator_to_otx


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _roundtrip_via_tempfile(loaded: LoadResult) -> OtxFile:
    """Schreibe simulator → OTX-Text → Latin-1-tempfile → Re-Parse.

    Returns das frische ``OtxFile`` aus dem Re-Parse. Tempfile wird im
    ``finally`` immer entfernt (auch bei Exception in parse_otx_file).
    """
    text = dump_simulator_to_otx(
        loaded.simulator,
        original_otx=loaded.otx,
        instances=loaded.instances,
        include_unsupported_passthrough=True,
    )
    tmp = tempfile.NamedTemporaryFile(suffix=".otx", delete=False, mode="wb")
    try:
        # Pitfall #3 — Latin-1 ist der Reader/Writer-Vertrag.
        tmp.write(text.encode("latin-1"))
        tmp.close()
        return parse_otx_file(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Dummy.otx — vollwertige Editierbarkeit erwartet
# ---------------------------------------------------------------------------


@pytest.mark.requires_engine
@pytest.mark.integration
def test_dummy_roundtrip(dummy_otx_path: Path) -> None:
    """Dummy.otx → Loader → Writer → Reader: gleiche OID-Menge."""
    loaded = load_otx_file(dummy_otx_path)
    roundtrip = _roundtrip_via_tempfile(loaded)

    original_oids = set(loaded.otx.by_oid.keys())
    roundtrip_oids = set(roundtrip.by_oid.keys())

    assert original_oids == roundtrip_oids, (
        f"OID-Differenz: {len(original_oids - roundtrip_oids)} fehlend, "
        f"{len(roundtrip_oids - original_oids)} zusätzlich"
    )


@pytest.mark.requires_engine
@pytest.mark.integration
def test_dummy_roundtrip_coverage_ratio(dummy_otx_path: Path) -> None:
    """Dummy.otx hat coverage_ratio = 1.0 (alle Klassen sind unterstützt)."""
    loaded = load_otx_file(dummy_otx_path)
    assert loaded.coverage_ratio == 1.0, (
        f"Dummy.otx hat coverage_ratio={loaded.coverage_ratio} "
        f"(unsupported: {dict(loaded.unsupported)})"
    )


# ---------------------------------------------------------------------------
# Fertigungsstruktur1 — mittelgroßes Real-World-Modell
# ---------------------------------------------------------------------------


@pytest.mark.requires_engine
@pytest.mark.integration
def test_fertigungsstruktur1_roundtrip(fertigungsstruktur1_otx_path: Path) -> None:
    """Fertigungsstruktur1_mit_AslFj.otx → Roundtrip: gleiche OID-Menge.

    Tatsächliche Messung (2026-05-21, docs/engine-coverage.md):
    coverage_ratio=1.0, OID-Diff=0 — kein xfail nötig.
    """
    loaded = load_otx_file(fertigungsstruktur1_otx_path)
    roundtrip = _roundtrip_via_tempfile(loaded)

    original_oids = set(loaded.otx.by_oid.keys())
    roundtrip_oids = set(roundtrip.by_oid.keys())

    assert original_oids == roundtrip_oids, (
        f"OID-Differenz: {len(original_oids - roundtrip_oids)} fehlend, "
        f"{len(roundtrip_oids - original_oids)} zusätzlich"
    )


# ---------------------------------------------------------------------------
# Bosch2_wechseln — großes Real-World-Modell (~18 MB)
# ---------------------------------------------------------------------------


@pytest.mark.requires_engine
@pytest.mark.integration
def test_bosch2_roundtrip(bosch2_otx_path: Path) -> None:
    """Bosch2_wechseln.otx → Roundtrip: gleiche OID-Menge.

    Tatsächliche Messung (2026-05-21, docs/engine-coverage.md):
    coverage_ratio=1.0, OID-Diff=0 — kein xfail nötig. Test-Laufzeit ~10-30s
    wegen 92k OIDs; mit ``@pytest.mark.integration`` selektiv skippbar via
    ``pytest -m "not integration"``.
    """
    loaded = load_otx_file(bosch2_otx_path)
    roundtrip = _roundtrip_via_tempfile(loaded)

    original_oids = set(loaded.otx.by_oid.keys())
    roundtrip_oids = set(roundtrip.by_oid.keys())

    assert original_oids == roundtrip_oids, (
        f"OID-Differenz: {len(original_oids - roundtrip_oids)} fehlend, "
        f"{len(roundtrip_oids - original_oids)} zusätzlich"
    )


# ---------------------------------------------------------------------------
# Latin-1-Encoding-Roundtrip (Pitfall #3)
# ---------------------------------------------------------------------------


@pytest.mark.requires_engine
@pytest.mark.integration
def test_latin1_umlaut_roundtrip(dummy_otx_path: Path) -> None:
    """Umlaut-haltiger String überlebt OTX-Writer → Latin-1-Tempfile → Reader.

    Pitfall #3 (RESEARCH §Common Pitfalls #3): Reader und Writer arbeiten
    auf Latin-1 (CP1252-kompatibel). Wenn ein UI ein Umlaut-Klassen-Name
    setzt und dann Save-back triggert, müssen die Bytes byte-stabil
    zurückkommen.

    Test-Strategie: Dummy.otx laden (gibt uns ein voll-instanziiertes
    PSimulator-Objekt mit ``ASimulator``-Basisklasse, die ein ``m_name``-
    Attribut hat), m_name auf einen rein-Latin-1-Umlaut-String setzen,
    Roundtrip, prüfen dass der String byte-stabil zurück kommt.

    Hinweis: Em-Dash (—) und andere CP1252-only-Zeichen außerhalb Latin-1
    sind bewusst NICHT im Test-String — sie würden mit UnicodeEncodeError
    failen und damit Pitfall #3 explizit demonstrieren, NICHT lösen.
    """
    loaded = load_otx_file(dummy_otx_path)

    # ASimulator hat OID 0 per Konvention; m_name ist das string-Attribut
    # der ASimulator-Basisklasse von PSimulator.
    umlaut_name = "Maschine Größer 5 äöüß ÄÖÜ"
    loaded.simulator.m_name = umlaut_name

    roundtrip = _roundtrip_via_tempfile(loaded)

    # ASimulator-Eintrag im roundtrip muss den Umlaut-String byte-stabil
    # tragen (Latin-1 → bytes → Latin-1 ist symmetrisch für alle Codepoints
    # 0x00–0xFF).
    asim_in_roundtrip = roundtrip.by_oid.get(0)
    assert asim_in_roundtrip is not None, (
        "ASimulator (OID 0) im Roundtrip nicht gefunden — Header-Struktur defekt?"
    )
    assert asim_in_roundtrip.attrs.get("m_name") == umlaut_name, (
        f"Umlaut-Roundtrip gebrochen: erwartet {umlaut_name!r}, "
        f"erhalten {asim_in_roundtrip.attrs.get('m_name')!r}"
    )
