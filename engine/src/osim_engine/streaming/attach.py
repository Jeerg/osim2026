"""attach_streaming_listeners — der einzige Einhäng-Punkt für das Streaming.

Resolved run-dir + run-id, legt ``stream.jsonl`` an, erzeugt einen geteilten
``SeqCounter`` + ``JsonlStreamWriter``, importiert das ``streaming.listeners``-
Paket (löst alle Selbst-Registrierungen aus) und instanziiert für JEDE Factory
in ``LISTENER_FACTORIES`` einen Listener, der sich via ``.attach(sim)``
einhängt. Schreibt initial ``meta.json``.

KEINE Änderung an ``core/simulator.py`` (SPEC §5, hartes Nicht-Ziel). Der
Caller schließt den zurückgegebenen Writer am Sim-Ende (``writer.close()``).
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from osim_engine.streaming import registry
from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
from osim_engine.streaming.run_dir import make_run_id, resolve_run_dir, write_meta
from osim_engine.streaming.seq import SeqCounter

if TYPE_CHECKING:
    from osim_engine.core.simulator import OSimulator


def attach_streaming_listeners(
    sim: "OSimulator",
    run_dir: str | None = None,
    batch_n: int = 100,
) -> JsonlStreamWriter:
    """Hängt alle registrierten Stream-Listener an ``sim`` und gibt den
    gemeinsamen ``JsonlStreamWriter`` zurück.

    Args:
        sim: der Simulator (listener-only angebunden, nicht modifiziert).
        run_dir: explizites run-Verzeichnis; sonst ``OSIM_RUN_DIR`` env oder
            ``./runs`` (D-OP-2).
        batch_n: Flush-Batch-Größe (D-1.3, Default 100).

    Returns:
        Der offene ``JsonlStreamWriter`` (Caller ruft ``close()`` am Sim-Ende).
    """
    base_dir = resolve_run_dir(run_dir)
    run_id = make_run_id(1)
    run_path = base_dir / run_id
    run_path.mkdir(parents=True, exist_ok=True)

    stream_path = run_path / "stream.jsonl"
    seq_counter = SeqCounter()
    writer = JsonlStreamWriter(stream_path, batch_n=batch_n)

    # Import löst die Selbst-Registrierung aller vorhandenen Listener aus.
    import osim_engine.streaming.listeners  # noqa: F401

    # Für jede registrierte Factory einen Listener bauen + einhängen.
    # attach() macht insert-at-head; bestehende Listener bleiben erhalten.
    for factory in registry.LISTENER_FACTORIES:
        listener = factory(seq_counter, writer)
        listener.attach(sim)

    # Initiale meta.json — streams-Status-Block wird in 01-04 gefüllt (D-2.2).
    write_meta(run_path, run_id=run_id, drop_count=writer.drop_count)

    return writer
