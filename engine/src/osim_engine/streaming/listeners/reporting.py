"""ReportingListener — Detail-Records als ``reporting_record``-Stream (SPEC §6.3).

Period-end Detail-Listen (Q-2 / §6.3): emittiert bei ``on_period_end`` je
abgeschlossenem Auftrag einen ``v.kind=="auftrag"``-Record (``auftrag_id``/
``art``/``menge``/``start``/``ende_ist``/``ende_soll``/``verspaetung``/
``prozesse[]``).

Die belastbaren Auftrags-Status-Felder (``ende_ist``/``ende_soll``/
``verspaetung``) hängen an der P5-D Aufgabe-Status-State-Machine (27 Stubs,
größter Skelett-Block, Priorität-1-Closure lt. D-2.3). Solange
``partial.is_slice_skeleton("P5-D")`` True ist, schreibt der Listener
**minimale partial-Records** mit nur den Identifikationsfeldern (``auftrag_id``/
``art``/``start``); Status-/Termin-Felder bleiben leer (D-2.1). Bleibt im Lauf
kein Auftrag übrig, wird ein einzelner leerer partial-Marker emittiert, damit
die Coverage-Lücke sichtbar ist (D-2.4). Der Stream gilt in ``meta.json`` als
``partial``.

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


class ReportingListener(OListenerSimulator):
    """Emittiert period-end Detail-Records (kind=auftrag) je Auftrag."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # P5-D Aufgabe-Status-State-Machine heute Skelett → minimal-partial.
        self._partial = is_slice_skeleton("P5-D")
        # In dieser Periode gesehene Auslöser (Identität über id()).
        self._auftraege: dict[int, object] = {}

    def _period_num(self) -> int:
        assert self.m_sim is not None
        return max(0, getattr(self.m_sim, "m_periodNum", 1) - 1)

    def _emit(self, t: int, v: dict) -> None:
        self._writer.write(
            Frame(t=t, stream="reporting_record", seq=self._seq.next(), v=v)
        )

    # ------------------------------------------------------------------
    # Sammeln je Event (welche Aufträge liefen in der Periode)
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
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            ausl = None
        if ausl is not None:
            self._auftraege.setdefault(id(ausl), ausl)

    # ------------------------------------------------------------------
    # Period-End Detail-Records (Q-2 / §6.3)
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        t = sim.evt_curr_time()
        period_num = self._period_num()

        if not self._auftraege:
            # Coverage-Lücke sichtbar: ein leerer partial-Marker (D-2.4).
            self._emit(t, {
                "kind": "auftrag",
                "period_num": period_num,
                "auftrag_id": None,
                "partial": True,
            })
        else:
            for ausl in self._auftraege.values():
                auftrag_id = getattr(ausl, "m_sName", None)
                start = getattr(ausl, "m_iBeginTermin", None)
                if self._partial:
                    # Minimal-partial: nur ID-/Start-Felder (D-2.1); Status-/
                    # Termin-Felder fehlen bis P5-D-Closure.
                    self._emit(t, {
                        "kind": "auftrag",
                        "period_num": period_num,
                        "auftrag_id": auftrag_id,
                        "art": "fertigung",
                        "start": start,
                        "partial": True,
                    })
                else:
                    self._emit(t, {
                        "kind": "auftrag",
                        "period_num": period_num,
                        "auftrag_id": auftrag_id,
                        "art": "fertigung",
                        "menge": getattr(ausl, "m_iMenge", None),
                        "start": start,
                        "ende_ist": getattr(ausl, "m_iEndeIst", None),
                        "ende_soll": getattr(ausl, "m_iEndeSoll", None),
                        "verspaetung": getattr(ausl, "m_iVerspaetung", None),
                        "prozesse": [],
                    })

        # period-only: Auftrags-Sammlung für die nächste Periode zurücksetzen.
        self._auftraege.clear()
        self._writer.flush()

    def on_period_break(self, time_end: int) -> None:
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return ReportingListener(seq_counter, writer)


_factory.__name__ = "ReportingListener"
register_listener(_factory)

# Transitive Aktivierung des MetaFinalizeListener: ``meta_finalize`` steht nicht
# in der festen Modul-Liste von ``listeners/__init__.py`` (kein Edit dort, kein
# attach.py-Edit). Der Import hier löst seine Self-Registrierung mit aus, sobald
# das Paket geladen wird — Registry-Pattern aus 01-01.
from osim_engine.streaming.listeners import meta_finalize as _meta_finalize  # noqa: E402,F401
