"""SchichtListener — Schicht-Plan als ``gantt_schicht``-Stream (SPEC §6.3).

GAP-CLOSURE 01-11 — **OSim2004-Feldtreue**: emittiert bei ``on_period_end``
je Person einen ``gantt_schicht``-Frame mit den ECHTEN Schicht-Viewer-Spalten
aus ``ISimulatorViewerSchicht.cpp`` (FillList):

    person · schichten (m_schichten) · ueberstunden (m_ueberst) ·
    einheiten (m_einheiten)

Das ERSETZT die zuvor erfundenen soll-/iststunden-Felder.

Die Quelle — das Arbeitszeit-Modell ``azeit/`` — ist heute komplett Skelett
(P5-M, alle 6 Klassen, siehe ``docs/skeleton-inventory.md``). Solange
``partial.is_slice_skeleton("P5-M")`` True ist, schreibt der Listener bei
period-end **einen minimalen partial-Frame** mit den echten Feldnamen, aber
Wert null + ``missing_slice="P5-M"`` (KEINE erfundenen Zahlen) — damit die
Coverage-Lücke als „leere" Golden-Record sichtbar ist (D-2.1/D-2.4) und nicht
als fehlender Stream. Der Stream gilt in ``meta.json`` als ``partial``.

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
            # P5-M Skelett: keine echte Person/Schicht-Quelle → ein minimaler
            # partial-Frame mit den echten OSim-Feldnamen + null + missing_slice
            # (KEINE erfundenen Zahlen), damit die Coverage-Lücke sichtbar ist.
            self._emit(t, {
                "period_num": period_num,
                "person": None,
                "schichten": None,
                "ueberstunden": None,
                "einheiten": None,
                "missing_slice": "P5-M",
                "partial": True,
            })
            return

        # full-Pfad (P5-M geschlossen): je Person ein Schicht-Frame mit den
        # echten ISimulatorViewerSchicht-Spalten (m_schichten/m_ueberst/
        # m_einheiten).
        for person in getattr(sim, "m_lPersonen", None) or getattr(sim, "m_oPersonen", []) or []:
            self._emit(t, {
                "period_num": period_num,
                "person": getattr(person, "m_sName", None),
                "schichten": getattr(person, "m_iSchichten", None),
                "ueberstunden": getattr(person, "m_iUeberstunden", None),
                "einheiten": getattr(person, "m_iEinheiten", None),
            })

    def on_period_break(self, time_end: int) -> None:
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return SchichtListener(seq_counter, writer)


_factory.__name__ = "SchichtListener"
register_listener(_factory)
