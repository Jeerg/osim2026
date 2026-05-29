"""SchichtListener — Schicht-Plan als ``gantt_schicht``-Stream (SPEC §6.3).

Period-end-Aggregat (Q-2 / §6.3): emittiert bei ``on_period_end`` je
Person×Schicht einen ``gantt_schicht``-Frame (``person_id``/``schicht``/``von``/
``bis``/``sollstunden``/``iststunden``).

Die Quelle — das Arbeitszeit-Modell ``azeit/`` — ist heute komplett Skelett
(P5-M, alle 6 Klassen, siehe ``docs/skeleton-inventory.md``). Solange
``partial.is_slice_skeleton("P5-M")`` True ist, schreibt der Listener bei
period-end **einen minimalen partial-Frame** (Soll-/Iststunden = 0, keine
Person-Daten), damit die Coverage-Lücke als „leere" Golden-Record sichtbar ist
(D-2.1/D-2.4) — und nicht als fehlender Stream. Der Stream gilt in
``meta.json`` als ``partial``.

Self-Registrierung via ``register_listener`` beim Import — KEIN ``attach.py``-
Edit (Registry-Pattern aus 01-01).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.partial import is_slice_skeleton
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter


class SchichtListener(OListenerSimulator):
    """Emittiert period-end je Person×Schicht einen gantt_schicht-Frame."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # P5-M Arbeitszeit-Modell heute Skelett → minimal-partial (D-2.1).
        self._partial = is_slice_skeleton("P5-M")

    def _period_num(self) -> int:
        """Beendete Periode = m_periodNum-1 (Kern incrementet vor dem Fanout,
        analog AuswertungListener / 01-03)."""
        assert self.m_sim is not None
        return max(0, getattr(self.m_sim, "m_periodNum", 1) - 1)

    def _emit(self, t: int, v: dict) -> None:
        self._writer.write(
            Frame(t=t, stream="gantt_schicht", seq=self._seq.next(), v=v)
        )

    # ------------------------------------------------------------------
    # Period-End-Aggregat (Q-2 / §6.3)
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        t = sim.evt_curr_time()
        period_num = self._period_num()

        if self._partial:
            # P5-M Skelett: keine echte Person×Schicht-Quelle → ein minimaler
            # partial-Frame, damit die Coverage-Lücke sichtbar ist (D-2.4).
            self._emit(t, {
                "period_num": period_num,
                "person_id": None,
                "schicht": None,
                "von": None,
                "bis": None,
                "sollstunden": 0.0,
                "iststunden": 0.0,
                "partial": True,
            })
            return

        # full-Pfad (P5-M geschlossen): je Person×Schicht ein Aggregat-Frame.
        for person in getattr(sim, "m_oPersonen", []) or []:
            self._emit(t, {
                "period_num": period_num,
                "person_id": getattr(person, "m_sName", None),
                "schicht": getattr(person, "m_sSchicht", None),
                "von": getattr(person, "m_iSchichtVon", None),
                "bis": getattr(person, "m_iSchichtBis", None),
                "sollstunden": getattr(person, "m_dSollstunden", 0.0),
                "iststunden": getattr(person, "m_dIststunden", 0.0),
            })

    def on_period_break(self, time_end: int) -> None:
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return SchichtListener(seq_counter, writer)


_factory.__name__ = "SchichtListener"
register_listener(_factory)
