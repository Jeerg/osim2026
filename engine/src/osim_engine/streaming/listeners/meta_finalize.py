"""MetaFinalizeListener — finalisiert ``meta.json`` mit dem streams-Status-Block.

``attach.py`` (aus 01-01) schreibt initial eine ``meta.json`` mit leerem
``streams``-Block. Dieser Listener füllt ihn bei Lauf-Ende, OHNE ``attach.py``
zu editieren (Registry-Pattern, SPEC §5): er hält den geteilten Writer, leitet
``run_dir = writer.path.parent`` ab und ruft ``write_meta(..., streams=
build_streams_status(), drop_count=writer.drop_count)`` neu — sodass die UI den
maschinen-lesbaren 6-Stream-Status (full/partial + missing_slices + reason) +
die finale Drop-Zählung beim Lauf-Ende vorfindet (D-2.2).

Finalisiert wird idempotent bei jedem ``on_period_end`` (deckt den letzten
period-end ab) UND bei ``on_period_reset`` (Sim-Ende/Reset), damit der Block
auch ohne explizites Reset aktuell ist. Jeder Aufruf überschreibt ``meta.json``
mit dem aktuellen Stand — die letzte Schreibung gewinnt.

Self-Registrierung via ``register_listener`` beim Import — KEIN ``attach.py``-
Edit (Registry-Pattern aus 01-01).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.partial import build_streams_status
from osim_engine.streaming.registry import register_listener
from osim_engine.streaming.run_dir import write_meta

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter


class MetaFinalizeListener(OListenerSimulator):
    """Schreibt meta.json mit streams-Status-Block + drop_count am Lauf-Ende."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        # seq_counter ist Teil der Factory-Signatur (01-01), wird hier aber nicht
        # gebraucht — dieser Listener emittiert keine Stream-Frames.
        super().__init__()
        self._writer = writer

    def _finalize(self) -> None:
        # Der Writer kennt seinen Pfad → run_dir = stream.jsonl.parent.
        run_dir = self._writer.path.parent
        run_id = run_dir.name
        write_meta(
            run_dir,
            run_id=run_id,
            drop_count=self._writer.drop_count,
            streams=build_streams_status(),
        )

    # ------------------------------------------------------------------
    # Override-Points (idempotent — letzte Schreibung gewinnt)
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        self._finalize()

    def on_period_break(self, time_end: int) -> None:
        self._finalize()

    def on_period_reset(self) -> None:
        self._finalize()


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return MetaFinalizeListener(seq_counter, writer)


_factory.__name__ = "MetaFinalizeListener"
register_listener(_factory)
