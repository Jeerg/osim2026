"""Vergleichs-Tests Python-Sim ↔ C++-Original (AZeitSim) auf identischem Modell.

Diese Tests führen den End-to-End-Vergleichs-Workflow aus, der das
zentrale Validierungs-Ziel der osim-engine ist:

    1. Embb-AslFj.otx wird in Python via OTX-Loader geladen → PSimulator
    2. Selbes OTX wird in AZeitSim.exe ausgeführt → Post-Run-OTX
    3. Counter beider Läufe werden verglichen
    4. Verhaltens-Abweichungen werden als Liste erfasst

Skip-Bedingungen: nicht-Windows oder fehlende AZeitSim.exe.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from osim_engine.io.otx_diff import (
    diff_python_vs_cpp,
    extract_counters,
    extract_counters_from_simulator,
)
from osim_engine.io.otx_loader import load_otx_file

pytestmark = pytest.mark.skipif(
    sys.platform != "win32",
    reason="AZeitSim.exe nur auf Windows.",
)

FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"
DEFAULT_EXE = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\AZeitSim.exe")
skip_if_no_azeitsim = pytest.mark.skipif(
    not DEFAULT_EXE.exists(),
    reason=f"AZeitSim.exe nicht gefunden: {DEFAULT_EXE}",
)


# ----------------------------------------------------------------------
# Counter-Extraktion aus Python-Sim
# ----------------------------------------------------------------------


def test_extract_counters_from_loaded_python_sim() -> None:
    """Lädt Embb, läuft 1 Periode, extrahiert Counter — Format kompatibel
    mit `extract_counters(OtxFile)`.
    """
    result = load_otx_file(PRE_FILE)
    result.simulator.start()
    counters = extract_counters_from_simulator(result.simulator)
    assert len(counters) > 100, f"Erwartet >100 Counter-Objekte, war {len(counters)}"

    # Bekannte Objekte sind dabei
    assert ("PBetriebsmittel", "Maschine 1") in counters
    assert ("PDpKnMengeRuesten", "Knoten 21") in counters


# ----------------------------------------------------------------------
# Vergleich Python ↔ C++ (End-to-End)
# ----------------------------------------------------------------------


@skip_if_no_azeitsim
def test_python_run_matches_cpp_run_on_embb(tmp_path: Path) -> None:
    """Großer Vergleich: Python-Sim und C++-Sim auf identischer Embb-OTX.

    Erwartung: Verhaltens-Diffs sind klein und bekannt-lokalisiert.
    Es gibt eine vordefinierte Whitelist akzeptierter Lücken — wenn
    NEUE Diffs auftreten, war eine kürzliche Änderung möglicherweise
    nicht 1:1-treu.
    """
    from osim_engine.io.azeitsim import run_azeitsim

    # Python-Lauf (1 Periode)
    py_result = load_otx_file(PRE_FILE)
    py_result.simulator.start()
    py_counters = extract_counters_from_simulator(py_result.simulator)

    # C++-Lauf (1 Periode via AZeitSim)
    work = tmp_path / "embb_cpp.otx"
    cpp_result = run_azeitsim(input_otx=PRE_FILE, working_otx=work)
    cpp_counters, _ = extract_counters(cpp_result.otx_after)

    diff = diff_python_vs_cpp(py_counters, cpp_counters)

    # Strukturelle Sanity
    assert diff.common_keys >= 100, (
        f"Zu wenig gemeinsame Schlüssel: {diff.common_keys}"
    )

    # Stand 2026-05-19 nach Bugfix (Commits 14ac8f9 + folgende):
    # - Maschinen-Einsatzzeit: gefixt (PtkIntervallBegin/End in
    #   PRessBeleg.on_einsatz_beginn/ende)
    # - PPerson m_iPtkAnzahlPerioden: gefixt (EvtPErmuedungswertPeriodeEnd)
    # Verbleibend: 3 Diffs auf PEinsatzzeitTag.m_dPtkEinsatzzeit selbst —
    # C++ schreibt negative Werte (offene Intervalle), Python schließt sie
    # via PEM_END_FOR_DAY. Cosmetic-Diff, beeinflusst Sim-Verhalten nicht.
    diff_attrs = {c.attr for c in diff.real_diffs}
    diff_klasses = {c.klass for c in diff.real_diffs}
    assert diff_attrs.issubset({"m_dPtkEinsatzzeit"}), (
        f"NEUE Verhaltens-Diff-Attribute aufgetaucht: "
        f"{diff_attrs - {'m_dPtkEinsatzzeit'}}\n"
        f"Wenn das Absicht ist, Whitelist erweitern. Sonst: 1:1-Treue prüfen."
    )
    assert diff_klasses.issubset({"PEinsatzzeitTag"}), (
        f"Diff sollte nur auf PEinsatzzeitTag liegen, fand: {diff_klasses}"
    )

    # Größenordnung der Diffs — vorher 18, nach Bugfix 3
    assert len(diff.real_diffs) <= 5, (
        f"Echte Diffs explodiert: {len(diff.real_diffs)} (Soll: <=5)"
    )


@skip_if_no_azeitsim
def test_only_in_py_keys_are_sub_plan_knoten(tmp_path: Path) -> None:
    """Schlüssel, die Python kennt, C++ aber nicht: Knoten in Sub-Plänen.

    Diese tauchen in C++ als Top-Level-Objekte in der by_oid-Liste auf,
    aber unter anderem Namen — Sub-Plan-Routing kann ihnen kein m_sName
    geben, das mit dem Python-Modell übereinstimmt.
    """
    from osim_engine.io.azeitsim import run_azeitsim

    py_result = load_otx_file(PRE_FILE)
    py_result.simulator.start()
    py_counters = extract_counters_from_simulator(py_result.simulator)

    cpp_result = run_azeitsim(input_otx=PRE_FILE, working_otx=tmp_path / "c.otx")
    cpp_counters, _ = extract_counters(cpp_result.otx_after)
    diff = diff_python_vs_cpp(py_counters, cpp_counters)

    # Diese Diffs sollen klein und benennbar bleiben
    assert len(diff.only_in_py) <= 10
    assert len(diff.only_in_cpp) <= 25  # Sub-Plan-Durchlaufpläne + deren Knoten


def test_diff_python_vs_cpp_classifies_correctly() -> None:
    """Unit-Test der Klassifizierungs-Logik ohne C++-Lauf."""
    py = {
        ("PFoo", "X"): {"m_iPtkA": 5, "m_dPtkB": 1.5},
        ("PFoo", "Y"): {"m_iPtkA": 3},  # nur Python
    }
    cpp = {
        ("PFoo", "X"): {"m_iPtkA": 5, "m_dPtkB": 2.5, "m_iPtkPhase5": 0},
        ("PFoo", "Z"): {"m_iPtkA": 0},  # nur C++
    }
    diff = diff_python_vs_cpp(py, cpp)
    assert diff.common_keys == 1
    assert diff.only_in_py == [("PFoo", "Y")]
    assert diff.only_in_cpp == [("PFoo", "Z")]

    # PFoo/X/m_iPtkA — gleich → kein Diff
    # PFoo/X/m_dPtkB — verschieden → real
    # PFoo/X/m_iPtkPhase5 — Python kennt nicht, C++ = 0 → Lücke
    assert len(diff.real_diffs) == 1
    assert diff.real_diffs[0].attr == "m_dPtkB"
    assert len(diff.py_missing_attrs) == 1
    assert diff.py_missing_attrs[0].attr == "m_iPtkPhase5"
