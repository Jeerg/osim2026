"""GanttListener — Durchlaufplan-Prozesse als ``gantt_durchlauf``-Stream (SPEC §6.3).

Read-Side-Listener (D-1.2 / SPEC §5): hookt ``on_sim_ereig`` (Aufruf nach jedem
Event-Pop) und liest das aktuell ausgeführte Event read-only über
``sim._evt_pool.get_curr()``. Kein Eingriff in den Engine-Kern.

Erkennungs-Strategie (best-effort, R-1/P5-D):
    - **ende**: das aktuelle Meta-Event ist ``EvtBearbeitEnde`` → der zugehörige
      Prozess (``event.m_obj``) hat seine Bearbeitung beendet.
    - **start**: ein noch nicht gesehener Prozess steht in Status ``PT_BEARB``.
      Da ``bearbeit_beginnen`` synchron (ohne eigenes Event) läuft, wird der
      Start beim nächsten Event-Pop nachgezogen.

Der konkrete Prozess-Status (abgeschlossen/verspätet/...) ist heute Skelett
(P5-D); solange er fehlt, trägt ``v.status`` den Wert ``"unbekannt"`` und der
Stream gilt in ``meta.json`` als ``partial`` (D-2.1).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter

_BEARBEIT_ENDE = "EvtBearbeitEnde"


class GanttListener(OListenerSimulator):
    """Emittiert gantt_durchlauf start/ende-Frames für ablaufende Prozesse."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # Prozesse, für die bereits ein start-Frame emittiert wurde
        # (Identität über id(), kein Status-Mutieren am Prozess).
        self._started: set[int] = set()
        self._start_time: dict[int, int] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _auftrag_id(proz) -> str | None:  # noqa: ANN001
        """Auftrags-Bezug über den Auslöser (best-effort)."""
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            ausl = None
        if ausl is not None:
            return getattr(ausl, "m_sName", None)
        return None

    @staticmethod
    def _prozess_id(proz) -> str | None:  # noqa: ANN001
        return getattr(proz, "m_sName", None)

    @staticmethod
    def _betriebsmittel_id(proz) -> str | None:  # noqa: ANN001
        knoten = getattr(proz, "m_oKnoten", None)
        return getattr(knoten, "m_sName", None) if knoten is not None else None

    def _emit(self, t: int, v: dict, meta_event: str | None = None) -> None:
        self._writer.write(
            Frame(
                t=t, stream="gantt_durchlauf", seq=self._seq.next(),
                v=v, meta_event=meta_event,
            )
        )

    # ------------------------------------------------------------------
    # Override-Point
    # ------------------------------------------------------------------

    def on_sim_ereig(self) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        pool = sim._evt_pool
        if not pool.curr_exists():
            return
        event = pool.get_curr()
        if event is None:
            return

        proz = event.m_obj
        meta = event.m_meta
        meta_name = getattr(meta, "m_name", "")
        t = sim.evt_curr_time()

        # PtStatus.PT_BEARB == 1 (pps/prozess/base.py) — read-only-Check ohne
        # harten Import-Zwang auf die PPS-Schicht.
        status = getattr(proz, "m_eStatus", None)
        is_bearb = getattr(status, "value", status) == 1

        # start: ein neuer, in Bearbeitung befindlicher Prozess.
        if proz is not None and is_bearb and id(proz) not in self._started:
            self._started.add(id(proz))
            start_time = getattr(proz, "m_iBearbeitBeginn", t)
            self._start_time[id(proz)] = start_time
            self._emit(
                t,
                {
                    "kind": "start",
                    "auftrag_id": self._auftrag_id(proz),
                    "prozess_id": self._prozess_id(proz),
                    "start_time": start_time,
                    "betriebsmittel_id": self._betriebsmittel_id(proz),
                    "dauer_geplant": getattr(proz, "m_iZeitinhaltGesamt", None),
                },
            )

        # ende: das laufende Event ist ein Bearbeitungs-Ende.
        if meta_name == _BEARBEIT_ENDE and proz is not None:
            start_time = self._start_time.get(id(proz))
            dauer_ist = (t - start_time) if start_time is not None else None
            self._emit(
                t,
                {
                    "kind": "ende",
                    "auftrag_id": self._auftrag_id(proz),
                    "prozess_id": self._prozess_id(proz),
                    "start_time": start_time,
                    "end_time": t,
                    "dauer_ist": dauer_ist,
                    # P5-D Skelett: konkreter End-Status noch nicht abbildbar.
                    "status": "unbekannt",
                },
                meta_event=meta_name,
            )


# Selbst-Registrierung beim Import (Registry-Pattern).
def _factory(seq_counter, writer):  # noqa: ANN001
    return GanttListener(seq_counter, writer)


_factory.__name__ = "GanttListener"
register_listener(_factory)
