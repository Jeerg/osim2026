"""End-to-end-Tests für `osim_engine.io.azeitsim.run_azeitsim`.

Diese Tests starten tatsächlich AZeitSim.exe und sind daher:
- Windows-only (Win32 API + MFC-Binary)
- Abhängig vom Vorhandensein der Original-Binaries
- Langsam (~5-10 Sekunden pro Test)

Wenn die Voraussetzungen nicht erfüllt sind, wird der ganze Modul-Lauf
übersprungen — kein Fehler.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

# Modul-weite Skip-Bedingungen
pytestmark = [
    pytest.mark.skipif(
        sys.platform != "win32",
        reason="AZeitSim.exe gibt es nur auf Windows.",
    ),
]


# Fixture-Pfade
FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"

# Default-Locations zum AZeitSim-Pfad
DEFAULT_EXE = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\AZeitSim.exe")


def _azeitsim_available() -> bool:
    return DEFAULT_EXE.exists()


skip_if_no_azeitsim = pytest.mark.skipif(
    not _azeitsim_available(),
    reason=f"AZeitSim.exe nicht vorhanden unter {DEFAULT_EXE}",
)


# ----------------------------------------------------------------------
# API-Smoke (importiert nicht run_azeitsim, falls Modul auf Linux geladen)
# ----------------------------------------------------------------------


def test_module_constants_match_osim_source() -> None:
    """Die Menü-IDs sind direkt aus OSim-Source verifiziert — verankert."""
    from osim_engine.io import azeitsim
    assert azeitsim.ID_SIMULATOR_STEUERUNG == 4003
    assert azeitsim.ID_PSIM_START == 4030
    assert azeitsim.ID_FILE_SAVE == 57603  # MFC ID_FILE_SAVE
    assert azeitsim.WM_COMMAND == 0x0111


def test_run_result_dataclass_fields() -> None:
    from osim_engine.io.azeitsim import RunResult
    # Felder existieren
    annotations = RunResult.__annotations__
    assert "working_otx" in annotations
    assert "otx_after" in annotations
    assert "duration_seconds" in annotations
    assert "event_count" in annotations
    assert "wall_clock_seconds" in annotations


# ----------------------------------------------------------------------
# Echte Roundtrip-Tests (Windows + AZeitSim.exe nötig)
# ----------------------------------------------------------------------


@skip_if_no_azeitsim
def test_roundtrip_runs_and_modifies_otx(tmp_path: Path) -> None:
    """End-to-end: Pre-Fixture → AZeitSim-Lauf → veränderte OTX."""
    from osim_engine.io.azeitsim import run_azeitsim

    working = tmp_path / "embb_work.otx"
    result = run_azeitsim(input_otx=PRE_FILE, working_otx=working)

    # Die Working-Kopie wurde geschrieben + modifiziert
    assert working.exists()
    assert working.stat().st_size != PRE_FILE.stat().st_size, (
        "Working-OTX hat exakt die gleiche Größe wie Input — "
        "Save hat vermutlich nicht stattgefunden."
    )

    # Parsing-Result ist plausibel
    assert result.otx_after.declared_count > 1000
    assert result.wall_clock_seconds < 30.0  # Embb-Modell ist klein

    # Mindestens EIN Event wurde ausgeführt (Sim hat überhaupt gelaufen)
    assert result.event_count is not None
    assert result.event_count > 0


@skip_if_no_azeitsim
def test_roundtrip_produces_counter_changes(tmp_path: Path) -> None:
    """Nach dem Lauf gibt es Counter-Diff gegenüber dem Pre-Fixture."""
    from osim_engine.io.azeitsim import run_azeitsim
    from osim_engine.io.otx_diff import diff_counters
    from osim_engine.io.otx_reader import parse_otx_file

    working = tmp_path / "embb_work.otx"
    result = run_azeitsim(input_otx=PRE_FILE, working_otx=working)

    pre = parse_otx_file(PRE_FILE)
    diff = diff_counters(pre, result.otx_after)
    assert not diff.is_clean, "Erwartet Counter-Änderungen nach Sim-Lauf"
    assert len(diff.changes) >= 10, (
        f"Nur {len(diff.changes)} Counter-Änderungen — Sim hat vermutlich "
        f"kaum gelaufen."
    )


@skip_if_no_azeitsim
def test_roundtrip_is_deterministic(tmp_path: Path) -> None:
    """Zwei Läufe auf identischer Input-OTX → identische Counter-Werte.

    Die OSim-Engine nutzt einen LCG mit fixem Default-Keim, also muss
    der Sim-Output deterministisch sein.
    """
    from osim_engine.io.azeitsim import run_azeitsim
    from osim_engine.io.otx_diff import diff_counters

    work_a = tmp_path / "run_a.otx"
    work_b = tmp_path / "run_b.otx"
    result_a = run_azeitsim(input_otx=PRE_FILE, working_otx=work_a)
    result_b = run_azeitsim(input_otx=PRE_FILE, working_otx=work_b)

    # Counter-Vektoren beider Läufe identisch
    diff = diff_counters(result_a.otx_after, result_b.otx_after)
    assert diff.is_clean, (
        f"Determinismus verletzt: {len(diff.changes)} Counter-Abweichungen "
        f"zwischen zwei Läufen.\n"
        + "\n".join(
            f"  {c.klass} {c.name!r} {c.attr}: {c.value_a} vs {c.value_b}"
            for c in diff.changes[:5]
        )
    )
    # Auch die Lauf-Metriken sind identisch
    assert result_a.duration_seconds == result_b.duration_seconds
    assert result_a.event_count == result_b.event_count


@skip_if_no_azeitsim
def test_runner_raises_on_missing_input(tmp_path: Path) -> None:
    from osim_engine.io.azeitsim import run_azeitsim
    with pytest.raises(FileNotFoundError):
        run_azeitsim(input_otx=tmp_path / "does-not-exist.otx")


@skip_if_no_azeitsim
def test_runner_raises_on_missing_exe(tmp_path: Path) -> None:
    from osim_engine.io.azeitsim import run_azeitsim
    bogus_exe = tmp_path / "nope.exe"
    # Kopie der Fixture, damit input_otx existiert
    work = tmp_path / "work.otx"
    shutil.copy2(PRE_FILE, work)
    with pytest.raises(RuntimeError, match="nicht gefunden"):
        run_azeitsim(input_otx=work, azeitsim_exe=bogus_exe)
