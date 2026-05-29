"""EinsatzListener — Ressourcen-Belegung als ``gantt_einsatz``-Stream (SPEC §6.3).

Read-Side-Listener (D-1.2 / SPEC §5): leitet aus dem laufenden Bearbeitungs-
Event best-effort die Betriebsmittel-Belegung ab und emittiert beim Start einen
``v.kind=="on"``- und beim Bearbeitungs-Ende einen ``v.kind=="off"``-Frame.

Die volle Einsatz-/Rüst-/Stillstand-Differenzierung hängt an den heute noch
skelettierten Slices P5-D (Einsatz-Dauer-Arithmetik) und P5-L (Generator-
/Auftrags-Eingang). Solange diese offen sind (``partial.is_slice_skeleton``),
schreibt der Listener **minimale partial-Frames** mit nur den Pflicht-/
Identifikationsfeldern (``ressource_id``/``ressource_typ``/``start_time`` bzw.
``end_time``); die übrigen Felder bleiben Default/leer (D-2.1). Der Stream wird
in ``meta.json`` als ``partial`` markiert.

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

_BEARBEIT_ENDE = "EvtBearbeitEnde"
_PT_BEARB = 1  # PtStatus.PT_BEARB (pps/prozess/base.py)


class EinsatzListener(OListenerSimulator):
    """Emittiert gantt_einsatz on/off-Frames für belegte Betriebsmittel."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # Quell-Slices heute Skelett → minimale partial-Frames (D-2.1).
        self._partial = is_slice_skeleton("P5-D") or is_slice_skeleton("P5-L")
        # Betriebsmittel, für die bereits ein on-Frame emittiert wurde
        # (Identität über id(proz), kein Status-Mutieren — analog GanttListener).
        self._on: set[int] = set()
        self._start_time: dict[int, int] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _betriebsmittel_id(proz) -> str | None:  # noqa: ANN001
        knoten = getattr(proz, "m_oKnoten", None)
        return getattr(knoten, "m_sName", None) if knoten is not None else None

    @staticmethod
    def _kontext(proz) -> str | None:  # noqa: ANN001
        """Auftrags-/Prozess-Bezug als Kontext-String (best-effort)."""
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            ausl = None
        auftrag = getattr(ausl, "m_sName", None) if ausl is not None else None
        prozess = getattr(proz, "m_sName", None)
        if auftrag and prozess:
            return f"{auftrag}/{prozess}"
        return prozess or auftrag

    def _emit(self, t: int, v: dict, meta_event: str | None = None) -> None:
        self._writer.write(
            Frame(
                t=t, stream="gantt_einsatz", seq=self._seq.next(),
                v=v, meta_event=meta_event,
            )
        )

    # ------------------------------------------------------------------
    # Override-Point
    # ------------------------------------------------------------------

    def on_sim_ereig(self) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        pool = getattr(sim, "_evt_pool", None)
        if pool is None or not pool.curr_exists():
            return
        event = pool.get_curr()
        if event is None:
            return

        proz = event.m_obj
        if proz is None:
            return
        meta = event.m_meta
        meta_name = getattr(meta, "m_name", "")
        t = sim.evt_curr_time()

        status = getattr(proz, "m_eStatus", None)
        is_bearb = getattr(status, "value", status) == _PT_BEARB

        # on: ein neues Betriebsmittel wird durch einen Prozess belegt.
        if is_bearb and id(proz) not in self._on:
            self._on.add(id(proz))
            start_time = getattr(proz, "m_iBearbeitBeginn", t)
            self._start_time[id(proz)] = start_time
            ress_id = self._betriebsmittel_id(proz)
            if self._partial:
                # Minimal-partial: nur Pflicht-/ID-Felder (D-2.1).
                self._emit(t, {
                    "kind": "on",
                    "ressource_id": ress_id,
                    "ressource_typ": "betriebsmittel",
                    "start_time": start_time,
                    "partial": True,
                })
            else:
                self._emit(t, {
                    "kind": "on",
                    "ressource_id": ress_id,
                    "ressource_typ": "betriebsmittel",
                    "start_time": start_time,
                    "einsatz_typ": "bearbeitung",
                    "kontext": self._kontext(proz),
                })

        # off: Bearbeitungs-Ende → Betriebsmittel wird freigegeben.
        if meta_name == _BEARBEIT_ENDE and id(proz) in self._on:
            start_time = self._start_time.get(id(proz))
            self._emit(t, {
                "kind": "off",
                "ressource_id": self._betriebsmittel_id(proz),
                "start_time": start_time,
                "end_time": t,
                **({"partial": True} if self._partial else {}),
            }, meta_event=meta_name)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return EinsatzListener(seq_counter, writer)


_factory.__name__ = "EinsatzListener"
register_listener(_factory)
