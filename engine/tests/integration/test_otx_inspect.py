"""Tests für `osim_engine.io.otx_inspect`."""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.io.otx_inspect import (
    ClassStat,
    CounterStat,
    OtxSummary,
    inspect_otx,
)


FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"
POST_FILE = FIXTURES / "embb_post_run.otx"


def test_inspect_pre_run() -> None:
    s = inspect_otx(PRE_FILE)
    assert s.declared_count > 1000
    assert s.parsed_oids > 1000
    assert s.auslöser_count == 70
    assert s.file_dump_active is True
    assert s.sim_period_seconds == 86400
    assert s.sim_keim > 0
    # Pre hat schon einige nicht-null Counter (Einsatzzeit-Vorbelegung)
    assert s.counter_stat.non_zero_counter_fields < 50


def test_inspect_post_run() -> None:
    s = inspect_otx(POST_FILE)
    assert s.auslöser_count == 70
    # Post-Run hat deutlich mehr belegte Counter
    assert s.counter_stat.non_zero_counter_fields > 100


def test_pre_and_post_have_same_class_inventory_structure() -> None:
    """Die Klassen-Häufigkeiten der Hauptklassen müssen identisch sein."""
    s_pre = inspect_otx(PRE_FILE)
    s_post = inspect_otx(POST_FILE)
    pre_classes = {c.klass: c.count for c in s_pre.classes}
    post_classes = {c.klass: c.count for c in s_post.classes}
    # Kern-Modell-Klassen müssen identisch zählen
    for klass in ("PAslEinzel", "PDpKnMengeRuesten", "PBetriebsmittel", "PDlplKante"):
        assert pre_classes.get(klass) == post_classes.get(klass), (
            f"Klassen-Häufigkeit weicht für {klass} ab"
        )


def test_class_stats_sorted_by_count_desc() -> None:
    s = inspect_otx(PRE_FILE)
    counts = [c.count for c in s.classes]
    assert counts == sorted(counts, reverse=True)


def test_class_stats_contain_named_examples() -> None:
    s = inspect_otx(PRE_FILE)
    by_class = {c.klass: c for c in s.classes}
    ausl = by_class["PAslEinzel"]
    assert len(ausl.named_examples) > 0
    assert any("Auslöser" in n or "Ausl" in n for n in ausl.named_examples)


def test_format_text_renders_summary() -> None:
    s = inspect_otx(PRE_FILE)
    txt = s.format_text()
    assert "OTX-Inspektion" in txt
    assert "Datei-Stand" in txt
    assert "PAslEinzel" in txt
    assert "Counter-Status" in txt


def test_run_state_classification() -> None:
    """run_state-Property: pre/post/mixed."""
    # Synthetisch — pre-run = alle Counter 0
    cs_pre = CounterStat(
        total_counter_fields=100, non_zero_counter_fields=0,
        objects_with_counters=10, objects_with_nonzero_counters=0,
    )
    assert "pre-run" in cs_pre.run_state

    # post-run = alle Counter belegt
    cs_post = CounterStat(
        total_counter_fields=100, non_zero_counter_fields=100,
        objects_with_counters=10, objects_with_nonzero_counters=10,
    )
    assert "post-run" in cs_post.run_state

    # mixed
    cs_mix = CounterStat(
        total_counter_fields=100, non_zero_counter_fields=20,
        objects_with_counters=10, objects_with_nonzero_counters=2,
    )
    assert "mixed" in cs_mix.run_state
    assert "20%" in cs_mix.run_state
