"""EinsatzListener — Ressourcen-Belegung als ``gantt_einsatz``-Stream (SPEC §6.3).

Read-Side-Listener (D-1.2 / SPEC §5.2): sampelt nach jedem Event die
``sim.m_lRessBeleg``-Liste und liest je Ressource ``m_oProzCurrent`` direkt
(GRAFIKFENSTER-SPEC §4.1). Erzeugt on-Frame bei None→Proz-Transition,
off-Frame bei Proz→None-Transition (Zustands-Diff über id(r), kein
Status-Mutieren — T-01-14-01 mitigate).

Ab 01-14: Belegung ist real (m_oProzCurrent wird in ress_belegen gesetzt),
partial-Gate entfernt. Vollständige Frames mit einsatz_typ/kontext/auftrag_oid.
auftrag_oid = proz.get_ausloeser().oid; Fallback -1 (Loader hat keinen OTX-OID
gefunden, Farbe weicht von OSim2004 ab — korrekte Segmentform bleibt erhalten).

Self-Registrierung via ``register_listener`` beim Import — KEIN ``attach.py``-
Edit (Registry-Pattern aus 01-01).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.pps.prozess.base import PtStatus
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter

_BEARBEIT_ENDE = "EvtBearbeitEnde"
_PT_BEARB = PtStatus.PT_BEARB


class EinsatzListener(OListenerSimulator):
    """Emittiert gantt_einsatz on/off-Frames für belegte Betriebsmittel.

    Quelle: sim.m_lRessBeleg[*].m_oProzCurrent (SPEC §4.1), nicht das
    gepoppte Event-Objekt. Zustands-Diff über _prev_proz dict[id(r)] —
    strikt read-only (T-01-14-01).
    """

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # Vorheriger m_oProzCurrent-Wert je Ressource (id(r) → proz | None)
        self._prev_proz: dict[int, object] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ressource_id(ress) -> str | None:  # noqa: ANN001
        """Name der belegten PRessBeleg (nicht Knoten-Name)."""
        return getattr(ress, "m_sName", None)

    @staticmethod
    def _auftrag_oid(proz) -> int:  # noqa: ANN001
        """Stabile Auftrag-OID über proz.get_ausloeser().oid.

        Fallback: -1 (kein OTX-OID; Segmentfarbe weicht von OSim2004 ab,
        Segmentform bleibt korrekt — P5D-SCOPE §4.2 Annahme offengelegt).
        """
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            return -1
        if ausl is None:
            return -1
        return getattr(ausl, "oid", -1)

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
        t = sim.evt_curr_time()

        # meta_event für off-Frame-Annotation (optional)
        meta_name = None
        if pool is not None and pool.curr_exists():
            event = pool.get_curr()
            if event is not None:
                meta = event.m_meta
                meta_name = getattr(meta, "m_name", "")

        # Ressourcen-Sampling: m_oProzCurrent je PRessBeleg (SPEC §4.1).
        # Strikt read-only: kein Schreiben auf Engine-Objekte (T-01-14-01).
        for r in getattr(sim, "m_lRessBeleg", ()):
            r_id = id(r)
            curr = getattr(r, "m_oProzCurrent", None)
            prev = self._prev_proz.get(r_id)

            if prev is None and curr is not None:
                # None → Proz: on-Frame
                self._prev_proz[r_id] = curr
                start_time = getattr(curr, "m_iBearbeitBeginn", t)
                self._emit(t, {
                    "kind": "on",
                    "ressource_id": self._ressource_id(r),
                    "ressource_typ": "betriebsmittel",
                    "start_time": start_time,
                    "einsatz_typ": "bearbeitung",
                    "kontext": self._kontext(curr),
                    "auftrag_oid": self._auftrag_oid(curr),
                })

            elif prev is not None and curr is None:
                # Proz → None: off-Frame
                self._prev_proz[r_id] = None
                start_time = getattr(prev, "m_iBearbeitBeginn", None)
                self._emit(t, {
                    "kind": "off",
                    "ressource_id": self._ressource_id(r),
                    "start_time": start_time,
                    "end_time": t,
                }, meta_event=meta_name if meta_name == _BEARBEIT_ENDE else None)

            elif prev is not None and curr is not None and prev is not curr:
                # Proz → anderer Proz (Direktübergabe ohne Freigebung; defensiv)
                self._prev_proz[r_id] = curr
                start_time_old = getattr(prev, "m_iBearbeitBeginn", None)
                self._emit(t, {
                    "kind": "off",
                    "ressource_id": self._ressource_id(r),
                    "start_time": start_time_old,
                    "end_time": t,
                })
                start_time_new = getattr(curr, "m_iBearbeitBeginn", t)
                self._emit(t, {
                    "kind": "on",
                    "ressource_id": self._ressource_id(r),
                    "ressource_typ": "betriebsmittel",
                    "start_time": start_time_new,
                    "einsatz_typ": "bearbeitung",
                    "kontext": self._kontext(curr),
                    "auftrag_oid": self._auftrag_oid(curr),
                })


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return EinsatzListener(seq_counter, writer)


_factory.__name__ = "EinsatzListener"
register_listener(_factory)
