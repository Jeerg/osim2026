"""Integration-Tests für das `streaming/`-Modul (Phase 01-01).

Pinnt den Engine↔UI-Vertrag (Frame-Format SPEC §6.2/6.3) end-to-end:
    - Frame-Pflichtfelder t/stream/seq/v + serialize() → genau eine JSONL-Zeile
    - JsonlStreamWriter: batched flush + bounded buffer mit drop-oldest (D-OP-3)
    - run-id-Format + run-dir-Auflösung + ..-Traversal-Abwehr (T-01-01)
    - meta.json-Felder (SPEC §6.4)
    - Listener-Registry (idempotent), Lifecycle-/Gantt-Listener, attach-Helper
    - SPEC §5 / hartes Nicht-Ziel: core/simulator.py bleibt unangetastet

Stil-Vorlage: tests/unit/core/test_day_of_sim_parity.py + test_v1_smoke.py.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from osim_engine.streaming.frame import STREAM_TAGS, Frame
from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
from osim_engine.streaming.run_dir import make_run_id, resolve_run_dir, write_meta


# ======================================================================
# Task 1 — Frame
# ======================================================================


def test_frame_serialize_only_required_keys_when_optionals_none() -> None:
    """SPEC §6.2: serialize() ergibt eine JSON-Zeile mit exakt t/stream/seq/v
    (kein wall_t/meta_event wenn None)."""
    f = Frame(t=0, stream="lifecycle", seq=1, v={"kind": "sim_begin"})
    line = f.serialize()
    assert "\n" not in line
    parsed = json.loads(line)
    assert set(parsed.keys()) == {"t", "stream", "seq", "v"}
    assert parsed["t"] == 0
    assert parsed["stream"] == "lifecycle"
    assert parsed["seq"] == 1
    assert parsed["v"] == {"kind": "sim_begin"}


def test_frame_serialize_includes_optionals_when_set() -> None:
    f = Frame(t=10, stream="lifecycle", seq=2, v={"kind": "x"},
              wall_t="2026-05-29T12:00:00+02:00", meta_event="EvtBearbeitEnde")
    parsed = json.loads(f.serialize())
    assert parsed["wall_t"] == "2026-05-29T12:00:00+02:00"
    assert parsed["meta_event"] == "EvtBearbeitEnde"


def test_stream_tags_are_the_six_locked_substreams() -> None:
    assert STREAM_TAGS == (
        "lifecycle", "gantt_durchlauf", "gantt_einsatz",
        "gantt_schicht", "kpi_auswertung", "reporting_record",
    )


# ======================================================================
# Task 1 — JsonlStreamWriter
# ======================================================================


def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8")
    return len([ln for ln in text.splitlines() if ln.strip()])


def test_writer_batched_flush_after_n_frames(tmp_path: Path) -> None:
    """batch_n=2: nach 1 write 0 Zeilen auf Platte, nach 2 writes 2 Zeilen."""
    path = tmp_path / "stream.jsonl"
    with JsonlStreamWriter(path, batch_n=2) as w:
        w.write(Frame(t=0, stream="lifecycle", seq=1, v={"kind": "a"}))
        assert _count_lines(path) == 0
        w.write(Frame(t=0, stream="lifecycle", seq=2, v={"kind": "b"}))
        assert _count_lines(path) == 2


def test_writer_explicit_flush_writes_immediately(tmp_path: Path) -> None:
    path = tmp_path / "stream.jsonl"
    with JsonlStreamWriter(path, batch_n=100) as w:
        w.write(Frame(t=0, stream="lifecycle", seq=1, v={"kind": "a"}))
        assert _count_lines(path) == 0
        w.flush()
        assert _count_lines(path) == 1


def test_writer_drop_oldest_on_bounded_buffer(tmp_path: Path) -> None:
    """max_buffer=3, 5 writes ohne flush → die 2 ältesten verworfen,
    drop_count==2, genau 3 Zeilen (die jüngsten) nach flush (D-OP-3)."""
    path = tmp_path / "stream.jsonl"
    # batch_n hoch, damit kein Auto-Flush vor dem Overflow eingreift
    with JsonlStreamWriter(path, batch_n=1000, max_buffer=3) as w:
        for seq in range(1, 6):  # 5 frames
            w.write(Frame(t=0, stream="lifecycle", seq=seq, v={"kind": "x"}))
        assert w.drop_count == 2
        w.flush()
        lines = path.read_text(encoding="utf-8").splitlines()
        seqs = [json.loads(ln)["seq"] for ln in lines if ln.strip()]
        assert seqs == [3, 4, 5]


# ======================================================================
# Task 1 — run_dir / meta.json
# ======================================================================


def test_make_run_id_format() -> None:
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-0001$", make_run_id(1))


def test_resolve_run_dir_env_then_default(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("OSIM_RUN_DIR", str(tmp_path / "xrun"))
    assert resolve_run_dir().name == "xrun"
    monkeypatch.delenv("OSIM_RUN_DIR", raising=False)
    assert resolve_run_dir().name == "runs"


def test_resolve_run_dir_explicit_wins(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("OSIM_RUN_DIR", str(tmp_path / "fromenv"))
    assert resolve_run_dir(str(tmp_path / "explicit")).name == "explicit"


def test_resolve_run_dir_rejects_traversal() -> None:
    """T-01-01: ..-haltiger Pfad löst ValueError aus."""
    with pytest.raises(ValueError):
        resolve_run_dir("runs/../../etc/evil")


def test_write_meta_has_required_keys(tmp_path: Path) -> None:
    write_meta(tmp_path, run_id="2026-05-29T12-00-00-0001", drop_count=3)
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    for key in ("run_id", "schema_version", "started_at", "drop_count", "streams"):
        assert key in meta
    assert meta["run_id"] == "2026-05-29T12-00-00-0001"
    assert meta["drop_count"] == 3


def test_gitignore_contains_runs() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    gitignore = repo_root / ".gitignore"
    lines = gitignore.read_text(encoding="utf-8").splitlines()
    non_comment = [ln.strip() for ln in lines if not ln.strip().startswith("#")]
    assert non_comment.count("runs/") == 1


# ======================================================================
# Task 2 — Registry + Listener + attach
# ======================================================================


def _build_scenario(begin_termin: int = 100, durchfuehrungszeit: int = 500):
    """1 Knoten + 1 Auslöser (analog test_v1_smoke)."""
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


def test_register_listener_idempotent() -> None:
    from osim_engine.streaming import registry
    from osim_engine.streaming.listeners.lifecycle import LifecycleListener

    factory = lambda seq, w: LifecycleListener(seq, w)  # noqa: E731
    factory.__name__ = "LifecycleListener"
    before = len(registry.LISTENER_FACTORIES)
    registry.register_listener(factory)
    after_first = len(registry.LISTENER_FACTORIES)
    registry.register_listener(factory)
    after_second = len(registry.LISTENER_FACTORIES)
    assert after_second == after_first
    assert after_first >= before


def test_listeners_subclass_olistener_simulator() -> None:
    from osim_engine.core.listener import OListenerSimulator
    from osim_engine.streaming.listeners.gantt import GanttListener
    from osim_engine.streaming.listeners.lifecycle import LifecycleListener

    assert issubclass(LifecycleListener, OListenerSimulator)
    assert issubclass(GanttListener, OListenerSimulator)


def test_attach_streaming_run_writes_lifecycle_frames(tmp_path: Path) -> None:
    """Ein kleiner Sim-Lauf mit attach_streaming_listeners erzeugt eine
    stream.jsonl mit sim_begin + period_end Lifecycle-Frames; seq monoton."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    stream_path = writer.path
    assert stream_path.exists()
    lines = [ln for ln in stream_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    frames = [json.loads(ln) for ln in lines]

    lifecycle = [f for f in frames if f["stream"] == "lifecycle"]
    kinds = {f["v"]["kind"] for f in lifecycle}
    assert "sim_begin" in kinds
    assert "period_end" in kinds

    seqs = [f["seq"] for f in frames]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)  # strikt monoton (keine Duplikate)


def test_attach_preserves_existing_listeners(tmp_path: Path) -> None:
    from osim_engine.core.listener import OListenerSimulator
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    sentinel = OListenerSimulator()
    sentinel.attach(sim)
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    assert sentinel in sim._sim_listeners
    writer.close()


@pytest.mark.xfail(reason="P5-D Skelett: Prozess-Status-State-Machine noch nicht "
                          "implementiert; gantt_durchlauf ist heute partial",
                   strict=False)
def test_gantt_durchlauf_emits_start_or_ende(tmp_path: Path) -> None:
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    gantt = [json.loads(ln) for ln in lines if json.loads(ln)["stream"] == "gantt_durchlauf"]
    assert any(f["v"]["kind"] in {"start", "ende"} for f in gantt)


def test_core_simulator_unchanged() -> None:
    """SPEC §5 / hartes Nicht-Ziel: core/simulator.py gegenüber HEAD unverändert."""
    repo_root = Path(__file__).resolve().parents[3]
    rel = "engine/src/osim_engine/core/simulator.py"
    result = subprocess.run(
        ["git", "diff", "--stat", "HEAD", "--", rel],
        cwd=repo_root, capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"core/simulator.py geändert:\n{result.stdout}"
