"""Tests für `osim_engine.io.otx_diff`.

Validiert den Counter-Diff zwischen vor/nach-Sim-Lauf OTX-Dateien des
Embb-AslFj-Modells.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.io.otx_diff import (
    CounterChange,
    OtxCounterDiff,
    diff_counters,
    diff_counters_text,
    extract_counters,
)
from osim_engine.io.otx_reader import OtxFile, parse_otx_file


FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"


@pytest.fixture(scope="module")
def pre() -> OtxFile:
    return parse_otx_file(FIXTURES / "embb_pre_run.otx")


@pytest.fixture(scope="module")
def post() -> OtxFile:
    return parse_otx_file(FIXTURES / "embb_post_run.otx")


# ----------------------------------------------------------------------
# extract_counters
# ----------------------------------------------------------------------


def test_extract_counters_finds_known_objects(pre: OtxFile) -> None:
    counters, collisions = extract_counters(pre)
    assert ("PDpKnMengeRuesten", "Knoten 21") in counters
    assert ("PBetriebsmittel", "Maschine 5") in counters


def test_extract_counters_only_ptk_attrs(pre: OtxFile) -> None:
    """Nur m_iPtk* / m_dPtk* werden gesammelt — keine Setup-Attribute."""
    counters, _ = extract_counters(pre)
    knoten = counters[("PDpKnMengeRuesten", "Knoten 21")]
    # Counter sind dabei
    assert "m_iPtkProzessCount" in knoten
    assert "m_dPtkDurchlaufzeit" in knoten
    # Setup-Attribute sind nicht dabei
    assert "m_sName" not in knoten
    assert "m_iRuestzeit" not in knoten
    assert "m_iDfzProEinheit" not in knoten


def test_pre_and_post_have_same_count_of_keys(pre: OtxFile, post: OtxFile) -> None:
    pre_c, _ = extract_counters(pre)
    post_c, _ = extract_counters(post)
    assert len(pre_c) == len(post_c), (
        f"Modell-Struktur weicht ab: pre={len(pre_c)}, post={len(post_c)}"
    )


# ----------------------------------------------------------------------
# diff_counters
# ----------------------------------------------------------------------


def test_self_diff_is_clean(pre: OtxFile) -> None:
    """Diff einer Datei gegen sich selbst muss leer sein."""
    diff = diff_counters(pre, pre)
    assert diff.is_clean
    assert not diff.changes
    assert not diff.only_in_a
    assert not diff.only_in_b


def test_pre_post_diff_finds_known_changes(pre: OtxFile, post: OtxFile) -> None:
    diff = diff_counters(pre, post)
    assert not diff.is_clean
    assert len(diff.changes) > 0
    # Modell-Struktur ist identisch — keine only_in_a/b-Mismatches
    assert not diff.only_in_a
    assert not diff.only_in_b


def test_specific_counter_change_for_knoten_21(pre: OtxFile, post: OtxFile) -> None:
    """Konkreter Counter aus dem dokumentierten Lauf."""
    diff = diff_counters(pre, post)
    knoten21_changes = [
        c for c in diff.changes
        if c.klass == "PDpKnMengeRuesten" and c.name == "Knoten 21"
    ]
    by_attr = {c.attr: c for c in knoten21_changes}
    assert by_attr["m_iPtkProzessCount"].value_a == 0
    assert by_attr["m_iPtkProzessCount"].value_b == 1
    assert by_attr["m_iPtkKumDurchfuehrungszeit"].value_a == 0
    assert by_attr["m_iPtkKumDurchfuehrungszeit"].value_b == 110528
    assert by_attr["m_iPtkAusloesungCount"].value_b == 1


def test_specific_counter_change_for_maschine_5(pre: OtxFile, post: OtxFile) -> None:
    diff = diff_counters(pre, post)
    bm_changes = [
        c for c in diff.changes
        if c.klass == "PBetriebsmittel" and c.name == "Maschine 5"
    ]
    by_attr = {c.attr: c for c in bm_changes}
    assert by_attr["m_iPtkAnfragenGesamt"].value_b == 2
    assert by_attr["m_iPtkAnfrageErfuellt"].value_b == 1


def test_diff_change_count_in_expected_range(pre: OtxFile, post: OtxFile) -> None:
    """Im dokumentierten 18-Event-Lauf erwarten wir ~135 Counter-Änderungen.
    Falls die Zahl drastisch abweicht, hat sich entweder die Fixture geändert
    oder das Diff-Verhalten — beides verdient eine Erklärung.
    """
    diff = diff_counters(pre, post)
    assert 100 <= len(diff.changes) <= 200, (
        f"Unerwartete Diff-Größe: {len(diff.changes)} Änderungen"
    )


def test_diff_text_renders_summary(pre: OtxFile, post: OtxFile) -> None:
    diff = diff_counters(pre, post)
    txt = diff_counters_text(diff, limit=5)
    assert "Counter-Diff:" in txt
    assert "Änderungen" in txt
    # Limit greift
    assert "weitere" in txt


def test_change_dataclass_is_frozen() -> None:
    c = CounterChange(klass="X", name="Y", attr="m_iPtkFoo", value_a=0, value_b=1)
    with pytest.raises(Exception):  # FrozenInstanceError
        c.value_a = 99  # type: ignore[misc]
