"""Performance-Benchmarks für den Streaming-Layer (Phase 01-06, AC-2 / AC-8).

Beide Tests tragen den ``bench``- (+ ``slow``-) Marker und laufen damit NICHT in
der Schnell-Suite. Aufruf:

    cd engine && uv run pytest tests/integration/test_streaming_bench.py -m bench -q

AC-2 (Latenz Engine-Event → JSONL-Line < 50ms p95):
    Misst pro emittiertem Frame die Spanne ``write()`` → Zeile-auf-Platte (Flush)
    über einen Sim-Lauf und prüft das 95. Perzentil.

AC-8 (Schreib-Overhead < 20% gegen Baseline — honestly relaxed, User-Entscheid):
    Misst die Laufzeit von ``sim.start()`` mit aktivem batched-Write auf Platte
    gegen eine Baseline, in der dieselben Listener ihre Frames zwar **erzeugen +
    serialisieren**, der Writer die Zeilen aber NICHT auf Platte schreibt
    (sie werden verworfen). Damit isoliert der Test exakt das, was SPEC §5 / D-1.3
    als hartes Nicht-Ziel formulieren: *das Live-**Schreiben** darf den Sim nicht
    verlangsamen* (Mitigation: batched flush → reduzierte syscalls). Die Frame-
    **Produktion** (read-only Listener-Arbeit) ist der inhärente Preis des Features
    selbst und gehört nicht in das Write-Overhead-Budget.

    Schwelle bewusst auf < 20% relaxiert (Option 2, User-Entscheid): die literale
    AC-8-Lesart (<5% full-streaming vs. no-streaming) ist auf dem trivialen
    synthetischen Sim-Kern nicht erreichbar (+163% gemessen), weil das Bauen +
    Serialisieren der Viewer-Frames ein unvermeidbarer Per-Event-Preis ist, der
    proportional nur deshalb dominiert, weil der synthetische Kern fast keine
    Arbeit pro Event leistet. Auf einem realistischen Sim-Kern schrumpft der
    relative Overhead. Das committete Gate schützt daher die **Write-Path**-
    Regression (< 20%) — die tatsächliche SPEC-Intent (§5 / D-1.3). Ein echtes
    5%-vs-no-streaming verlangte eine strukturelle Änderung (Background-Writer-
    Thread / Event-Sampling), die DISCUSSION-LOG Q1.3 für Phase 01 bereits
    verworfen hat. Siehe 01-06-SUMMARY.md „Deviations".

    Best-of-11 (Minimum) gegen Windows-Host-Timing-Rauschen (AV-Scan/Scheduler).

Ereignis-Skalierung: Default 5000 Auslöser (~10k Frames) — auf diesem Host in
~0.2s/Lauf, ausreichend für ein belastbares p95. Über ``OSIM_BENCH_AUSL`` (z.B.
50000 für den SPEC-100k-Event-Lauf) hochskalierbar.

Stil-Vorlage: tests/integration/test_streaming.py + test_streaming_kpi.py.
"""

from __future__ import annotations

import os
import statistics
import time
from pathlib import Path

import pytest

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.streaming import registry
from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
from osim_engine.streaming.seq import SeqCounter

# Default-Last: 5000 Auslöser ≈ 10k Frames. Für den SPEC-100k-Event-Lauf
# OSIM_BENCH_AUSL=50000 setzen (lokal/CI-opt-in).
_N_AUSL = int(os.environ.get("OSIM_BENCH_AUSL", "5000"))
_BATCH_N = int(os.environ.get("OSIM_BENCH_BATCH_N", "100"))


def _build_scenario(n: int) -> PSimulator:
    """n Einzel-Auslöser auf einem konstanten Bearbeitungs-Knoten — erzeugt je
    Auslöser ~2 Events (Trigger + Bearbeit-Ende) und damit eine hohe Event-Last."""
    sim = PSimulator()
    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "Bearbeitung"
    knoten.m_iDurchfuehrungszeit = 10
    sim.register_knoten(knoten)
    for i in range(n):
        ausl = PAslEinzel(sim)
        ausl.m_sName = f"E{i}"
        # über den Tag (86400s) gestreut, damit Events zeitlich gespreizt sind.
        ausl.m_iBeginTermin = 1 + (i % 80000)
        ausl.m_lDlpl = knoten
        sim.register_ausloeser(ausl)
    return sim


def _attach_all(sim: PSimulator, writer: JsonlStreamWriter) -> None:
    """Hängt alle registrierten Stream-Listener mit dem gegebenen Writer an
    (ohne run-dir/meta.json — der Bench misst nur den Schreib-/Listener-Pfad)."""
    import osim_engine.streaming.listeners  # noqa: F401  (löst Self-Registrierung)

    seq = SeqCounter()
    for factory in registry.LISTENER_FACTORIES:
        factory(seq, writer).attach(sim)


# ======================================================================
# AC-2 — Latenz Engine-Event → JSONL-Line < 50ms p95
# ======================================================================


class _TimedWriter(JsonlStreamWriter):
    """Writer, der je Frame den ``write()``-Zeitpunkt stempelt und beim Flush die
    Event→Platte-Latenz (ms) je gepuffertem Frame nachträgt."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._stamps: list[float] = []
        self.latencies_ms: list[float] = []

    def write(self, frame) -> None:  # noqa: ANN001
        self._stamps.append(time.perf_counter())
        super().write(frame)

    def flush(self) -> None:
        if self._file is None or not self._buffer:
            return
        super().flush()
        now = time.perf_counter()
        self.latencies_ms.extend((now - s) * 1000.0 for s in self._stamps)
        self._stamps.clear()


@pytest.mark.bench
@pytest.mark.slow
def test_ac2_event_to_jsonl_latency_p95_under_50ms(tmp_path: Path) -> None:
    """AC-2: das 95. Perzentil der Event→JSONL-Line-Latenz liegt < 50ms."""
    sim = _build_scenario(_N_AUSL)
    writer = _TimedWriter(tmp_path / "stream.jsonl", batch_n=_BATCH_N)
    _attach_all(sim, writer)

    sim.start()
    writer.close()

    lat = sorted(writer.latencies_ms)
    assert lat, "keine Frames emittiert — Szenario erzeugt keine Last"
    p95 = lat[int(len(lat) * 0.95) - 1]
    p50 = statistics.median(lat)
    print(
        f"\n[AC-2] frames={len(lat)} batch_n={_BATCH_N} "
        f"p50={p50:.3f}ms p95={p95:.3f}ms max={max(lat):.3f}ms"
    )
    assert p95 < 50.0, f"AC-2 verfehlt: p95={p95:.3f}ms >= 50ms"


# ======================================================================
# AC-8 — Streaming-(Schreib-)Overhead < 20% gegen Baseline (Option 2)
# ======================================================================


class _NoDiskWriter(JsonlStreamWriter):
    """Baseline-Writer: erzeugt + serialisiert Frames identisch (write() ruft
    ``frame.serialize()``), schreibt aber NIE auf Platte. Isoliert die reinen
    Schreib-/syscall-Kosten, die D-1.3 via batched flush minimiert (SPEC §5)."""

    def flush(self) -> None:
        # Buffer leeren ohne Disk-I/O — die Serialisierung in write() ist bereits
        # passiert, nur der file.write/flush-Syscall entfällt.
        self._buffer.clear()


def _run_once(writer_cls, tmp_path: Path, tag: str) -> float:
    sim = _build_scenario(_N_AUSL)
    writer = writer_cls(tmp_path / f"{tag}.jsonl", batch_n=_BATCH_N)
    _attach_all(sim, writer)
    t0 = time.perf_counter()
    sim.start()
    writer.close()
    return time.perf_counter() - t0


@pytest.mark.bench
@pytest.mark.slow
def test_ac8_write_overhead_under_20pct(tmp_path: Path) -> None:
    """AC-8 / SPEC §5 (Option 2, honestly-relaxed, User-Entscheid): das Live-
    **Schreiben** (batched flush auf Platte) verlangsamt den Sim-Lauf um < 20%
    gegenüber der Baseline, in der dieselben Listener ihre Frames erzeugen +
    serialisieren, aber nicht auf Platte schreiben.

    Die Schwelle ist bewusst auf 20% (nicht 5%) gesetzt — die literale AC-8-Lesart
    (<5% full-streaming vs. no-streaming) ist auf dem trivialen synthetischen Kern
    nicht erreichbar, weil die Frame-Produktion proportional dominiert (+163%). Das
    Gate schützt die Write-Path-Regression, die tatsächliche §5/D-1.3-Intent. Doku:
    01-06-SUMMARY.md „Deviations". Hier wird der ``batch_n``-Default des Writers
    (100, unverändert — Option 1 wäre eine Erhöhung gewesen) verifiziert.

    Best-of-11 (Minimum) statt Mittelwert: der schnellste Lauf isoliert die reine
    CPU-/syscall-Arbeit am stabilsten von OS-Jitter (GC, Scheduler, AV-Scan)."""
    reps = int(os.environ.get("OSIM_BENCH_REPS", "11"))
    baseline = min(_run_once(_NoDiskWriter, tmp_path, "baseline") for _ in range(reps))
    streaming = min(_run_once(JsonlStreamWriter, tmp_path, "stream") for _ in range(reps))

    overhead_pct = (streaming - baseline) / baseline * 100.0
    print(
        f"\n[AC-8] best-of-{reps} ausl={_N_AUSL} batch_n={_BATCH_N} "
        f"baseline={baseline * 1000:.1f}ms streaming={streaming * 1000:.1f}ms "
        f"write-overhead={overhead_pct:.2f}%"
    )
    assert overhead_pct < 20.0, (
        f"AC-8 (Option 2) verfehlt: Schreib-Overhead={overhead_pct:.2f}% >= 20%"
    )
