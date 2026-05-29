"""LifecycleListener — sim/period-Lifecycle als ``lifecycle``-Stream (SPEC §6.3).

Hookt die Listener-Override-Points von ``OListenerSimulator`` (D-1.2): jedes
``on_*``-Event wird zu genau einem ``Frame`` mit ``stream="lifecycle"`` und
einem ``v.kind``-Diskriminator. Bei ``on_period_end`` wird zusätzlich
``writer.flush()`` aufgerufen (garantierter Flush bei period-end, D-1.3).

Kein Eingriff in den Engine-Kern (SPEC §5) — nur Lesen von ``m_sim``-State.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter


class LifecycleListener(OListenerSimulator):
    """Emittiert sim_begin/period_begin/period_end/period_break/sim_reset."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _t(self) -> int:
        """Sim-Zeit des aktuellen Events bzw. period_begin (SPEC §6.2 ``t``)."""
        assert self.m_sim is not None
        return self.m_sim.evt_curr_time()

    def _emit(self, kind: str, **extra: object) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        v: dict = {
            "kind": kind,
            "period_num": sim.m_periodNum,
            "period_begin": sim.m_periodBegin,
            "period_len": sim.m_periodLen,
        }
        v.update(extra)
        self._writer.write(
            Frame(t=self._t(), stream="lifecycle", seq=self._seq.next(), v=v)
        )

    # ------------------------------------------------------------------
    # Override-Points (OListenerSimulator)
    # ------------------------------------------------------------------

    def on_sim_begin(self, time_begin: int) -> None:
        self._emit("sim_begin")

    def on_period_begin(self, time_begin: int, time_end: int) -> None:
        self._emit("period_begin", end_time=time_end)

    def on_period_end(self, time_end: int) -> None:
        # SPEC §6.3: period_end trägt end_time. m_periodBegin wurde im Kern
        # bereits vorgerückt → end_time == time_end (== neuer period_begin).
        self._emit("period_end", end_time=time_end)
        # Garantierter Flush bei period-end (D-1.3).
        self._writer.flush()

    def on_period_break(self, time_end: int) -> None:
        self._emit("period_break", end_time=time_end)
        self._writer.flush()

    def on_period_reset(self) -> None:
        self._emit("sim_reset")


# Selbst-Registrierung beim Import (D-1.2 / Registry-Pattern).
def _factory(seq_counter, writer):  # noqa: ANN001
    return LifecycleListener(seq_counter, writer)


_factory.__name__ = "LifecycleListener"
register_listener(_factory)
