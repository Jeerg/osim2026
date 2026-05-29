"""Integration-Tests für die restlichen drei Sub-Streams + meta.json-Status (Plan 01-04).

Pinnt den vollständigen 6-Stream-Vertrag (SPEC §6.3 / D-2.1/D-2.2/D-2.4):
    - build_streams_status(): 6-Stream-Status-Block (full/partial + missing_slices + reason)
    - partial-Klassifikation der drei skelett-abhängigen Streams (T-01-09)
    - EinsatzListener/SchichtListener/ReportingListener: partial-Frames bei Skelett-Slice
    - MetaFinalizeListener: meta.json mit streams-Block + drop_count bei Lauf-Ende
    - SPEC §5 / hartes Nicht-Ziel: core/simulator.py + attach.py bleiben unangetastet

Stil-Vorlage: tests/integration/test_streaming.py + test_streaming_kpi.py.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from osim_engine.streaming.frame import STREAM_TAGS


# ======================================================================
# Task 1 — build_streams_status / is_slice_skeleton
# ======================================================================


def test_build_streams_status_has_all_six_stream_tags() -> None:
    """D-2.2: der Status-Block trägt genau die 6 Stream-Tags als Schlüssel."""
    from osim_engine.streaming.partial import build_streams_status

    block = build_streams_status()
    assert set(block.keys()) == set(STREAM_TAGS)


def test_build_streams_status_marks_three_skeleton_streams_partial() -> None:
    """D-2.1/T-01-09: gantt_einsatz/gantt_schicht/reporting_record == partial
    mit nicht-leerer missing_slices-Liste."""
    from osim_engine.streaming.partial import build_streams_status

    block = build_streams_status()
    for tag in ("gantt_einsatz", "gantt_schicht", "reporting_record"):
        assert block[tag]["status"] == "partial", tag
        assert block[tag]["missing_slices"], tag
        assert block[tag]["reason"], tag


def test_build_streams_status_missing_slices_name_the_p5_slices() -> None:
    """Mindestens ein missing_slices-Eintrag nennt P5-M (gantt_schicht) und
    einer P5-D (reporting_record)."""
    from osim_engine.streaming.partial import build_streams_status

    block = build_streams_status()
    assert any("P5-M" in s for s in block["gantt_schicht"]["missing_slices"])
    assert any("P5-D" in s for s in block["reporting_record"]["missing_slices"])
    # gantt_einsatz hängt an P5-L (Einsatz-/Generator-Slice) bzw. P5-D.
    assert block["gantt_einsatz"]["missing_slices"]


def test_build_streams_status_kpi_auswertung_is_partial() -> None:
    """01-03-SUMMARY: kpi_auswertung ist insgesamt partial (pers/schicht/
    kalkulation/wschlange/nbearbeit/kauf/best + ruest/stillstand/verspaetet)."""
    from osim_engine.streaming.partial import build_streams_status

    block = build_streams_status()
    assert block["kpi_auswertung"]["status"] == "partial"
    assert block["kpi_auswertung"]["missing_slices"]


def test_build_streams_status_lifecycle_is_full() -> None:
    """lifecycle ist nach 01-01 vollständig (keine Skelett-Abhängigkeit)."""
    from osim_engine.streaming.partial import build_streams_status

    block = build_streams_status()
    assert block["lifecycle"]["status"] == "full"
    assert block["lifecycle"]["missing_slices"] == []


def test_build_streams_status_is_json_serialisable() -> None:
    """D-2.2: der Block passt direkt in write_meta(streams=...) → json.dumps."""
    from osim_engine.streaming.partial import build_streams_status

    dumped = json.dumps(build_streams_status())
    assert json.loads(dumped)  # round-trip ohne Fehler


def test_is_slice_skeleton_known_skeleton_slices() -> None:
    """skeleton-inventory.md: P5-D/P5-L/P5-M sind heute Skelett."""
    from osim_engine.streaming.partial import is_slice_skeleton

    assert is_slice_skeleton("P5-D") is True
    assert is_slice_skeleton("P5-L") is True
    assert is_slice_skeleton("P5-M") is True


# ======================================================================
# Task 2 — Listener (einsatz/schicht/reporting) + meta_finalize
# ======================================================================


def _build_scenario(begin_termin: int = 100, durchfuehrungszeit: int = 500):
    """1 Knoten + 1 Auslöser (analog test_streaming._build_scenario)."""
    from osim_engine.pps.ausloeser.einzel import PAslEinzel
    from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "Bearbeitung"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "Erzeugnis-1"
    ausl.m_iBeginTermin = begin_termin
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)
    return sim


def test_listeners_subclass_olistener_simulator() -> None:
    from osim_engine.core.listener import OListenerSimulator
    from osim_engine.streaming.listeners.einsatz import EinsatzListener
    from osim_engine.streaming.listeners.meta_finalize import MetaFinalizeListener
    from osim_engine.streaming.listeners.reporting import ReportingListener
    from osim_engine.streaming.listeners.schicht import SchichtListener

    assert issubclass(EinsatzListener, OListenerSimulator)
    assert issubclass(SchichtListener, OListenerSimulator)
    assert issubclass(ReportingListener, OListenerSimulator)
    assert issubclass(MetaFinalizeListener, OListenerSimulator)


def test_listeners_self_register_factories() -> None:
    """Alle drei Stream-Listener + MetaFinalize registrieren ihre Factory."""
    # Import löst Self-Registrierung aus.
    import osim_engine.streaming.listeners  # noqa: F401
    from osim_engine.streaming import registry

    names = {getattr(f, "__name__", "") for f in registry.LISTENER_FACTORIES}
    assert "EinsatzListener" in names
    assert "SchichtListener" in names
    assert "ReportingListener" in names
    assert "MetaFinalizeListener" in names


def test_end_to_end_meta_json_has_streams_status_block(tmp_path: Path) -> None:
    """AC-1/D-2.2: nach einem Lauf trägt meta.json den streams-Status-Block,
    in dem die drei skelett-abhängigen Streams partial sind, + drop_count."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    run_dir = writer.path.parent
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))

    assert "streams" in meta and meta["streams"], "streams-Block fehlt/leer"
    assert set(meta["streams"].keys()) == set(STREAM_TAGS)
    for tag in ("gantt_einsatz", "gantt_schicht", "reporting_record"):
        assert meta["streams"][tag]["status"] == "partial", tag
    assert isinstance(meta["drop_count"], int)


def test_end_to_end_all_six_streams_represented(tmp_path: Path) -> None:
    """D-2.4: jeder der 6 Stream-Tags ist entweder als Frame im Stream ODER
    als partial-Eintrag in meta.json repräsentiert (sichtbare Coverage-Lücke)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    run_dir = writer.path.parent
    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    streamed = {json.loads(ln)["stream"] for ln in lines}
    meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
    partial = {t for t, s in meta["streams"].items() if s["status"] == "partial"}

    for tag in STREAM_TAGS:
        assert tag in streamed or tag in partial, tag


def test_attach_py_unchanged_since_01_01() -> None:
    """SPEC §5: attach.py wird in 01-04 NICHT editiert (Registry-Pattern)."""
    repo_root = Path(__file__).resolve().parents[3]
    rel = "engine/src/osim_engine/streaming/attach.py"
    result = subprocess.run(
        ["git", "diff", "--stat", "HEAD", "--", rel],
        cwd=repo_root, capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"attach.py geändert:\n{result.stdout}"


def test_core_simulator_unchanged_partial() -> None:
    """SPEC §5 / hartes Nicht-Ziel: core/simulator.py unverändert gegenüber HEAD."""
    repo_root = Path(__file__).resolve().parents[3]
    rel = "engine/src/osim_engine/core/simulator.py"
    result = subprocess.run(
        ["git", "diff", "--stat", "HEAD", "--", rel],
        cwd=repo_root, capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"core/simulator.py geändert:\n{result.stdout}"
