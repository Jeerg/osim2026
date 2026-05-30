"""GanttListener — Durchlaufplan-Prozesse als ``gantt_durchlauf``-Stream (SPEC §6.3).

Read-Side-Listener (D-1.2 / SPEC §5.1): hookt ``on_sim_ereig`` (Aufruf nach
jedem Event-Pop) und liest das aktuell ausgeführte Event read-only über
``sim._evt_pool.get_curr()``. Kein Eingriff in den Engine-Kern.

Erkennungs-Strategie (best-effort, R-1/P5-D):
    - **ende**: das aktuelle Meta-Event ist ``EvtBearbeitEnde`` → der zugehörige
      Prozess (``event.m_obj``) hat seine Bearbeitung beendet.
    - **start**: ein noch nicht gesehener Prozess steht in Status ``PT_BEARB``.
      Da ``bearbeit_beginnen`` synchron (ohne eigenes Event) läuft, wird der
      Start beim nächsten Event-Pop nachgezogen.

Ab 01-14:
    - ``v.status`` ist ``"abgeschlossen"`` bei PT_ENDE statt ``"unbekannt"``
      (P5D-SCOPE §5.1). Verspätungsvergleich bleibt optional/out of scope
      (Soll-Daten fehlen auf Frame-Ebene; ehrlich als TODO markiert).
    - ``betriebsmittel_id`` aus belegter Ressource via proz.m_oRelationen →
      PtRelationBeleg.m_oRessBeleg.m_sName statt Knoten-Name.
    - ``auftrag_oid`` (int) = proz.get_ausloeser().oid für Farbschlüssel.
    - PtStatus-Import statt Literal ``1`` für PT_BEARB.
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
_PT_ENDE = PtStatus.PT_ENDE


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
    def _auftrag_oid(proz) -> int:  # noqa: ANN001
        """Stabile Auftrag-OID für Farbschlüssel (P5D-SCOPE §4.2)."""
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            return -1
        if ausl is None:
            return -1
        return getattr(ausl, "oid", -1)

    @staticmethod
    def _durchlaufplan_oid(proz) -> int:  # noqa: ANN001
        """Stabile Durchlaufplan-OID des auslösenden Auslösers.

        Bezugsobjekt für die Durchlaufplan-Kennzahlen (KENNZAHLEN-SPEC §1):
        OSim gruppiert „mittlere Durchlaufzeit" wahlweise nach Auslöser ODER
        nach Durchlaufplan (PDurchlaufplanLList, PDurchlaufplan.cpp:2072-2117).
        Quelle = PAusloeser.m_lDlpl.oid. Fallback -1 (kein Plan auflösbar).
        """
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            return -1
        if ausl is None:
            return -1
        dlpl = getattr(ausl, "m_lDlpl", None)
        return getattr(dlpl, "oid", -1) if dlpl is not None else -1

    @staticmethod
    def _durchlaufplan_id(proz) -> str | None:  # noqa: ANN001
        """Anzeigename des Durchlaufplans (für die Chart-Kategorie)."""
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            return None
        if ausl is None:
            return None
        dlpl = getattr(ausl, "m_lDlpl", None)
        return getattr(dlpl, "m_sName", None) if dlpl is not None else None

    @staticmethod
    def _soll_end_termin(proz, start_time: int) -> int:  # noqa: ANN001
        """Geplanter Abschluss-Zeitpunkt = Start + m_iSollDauer.

        1:1 PAusloeser.cpp:1457 (`m_iPtkSollEndTermin = EvtCurrTime()+m_iSollDauer`).
        Treibt die Liefertermintreue (KENNZAHLEN-SPEC §2.3). Der -1-Sentinel von
        m_iSollDauer (KPI deaktiviert, PAusloeser.cpp:163-177) wird als
        soll_end_termin = -1 durchgereicht. Default m_iSollDauer=0 → soll = start.
        """
        try:
            ausl = proz.get_ausloeser()
        except Exception:
            return -1
        if ausl is None:
            return -1
        soll_dauer = getattr(ausl, "m_iSollDauer", 0)
        if soll_dauer == -1:
            return -1
        return start_time + soll_dauer

    @staticmethod
    def _prozess_id(proz) -> str | None:  # noqa: ANN001
        return getattr(proz, "m_sName", None)

    @staticmethod
    def _betriebsmittel_id(proz) -> str | None:  # noqa: ANN001
        """Belegte Ressource aus PtRelationBeleg (SPEC §5.1).

        Iteriert proz.m_oRelationen und gibt den Namen der ersten
        PtRelationBeleg.m_oRessBeleg zurück. Fallback: Knoten-Name.
        """
        from osim_engine.resources.relation import PtRelationBeleg
        for rel in getattr(proz, "m_oRelationen", ()):
            if isinstance(rel, PtRelationBeleg):
                ress = getattr(rel, "m_oRessBeleg", None)
                if ress is not None:
                    name = getattr(ress, "m_sName", None)
                    if name:
                        return name
        # Fallback: Knoten-Name (keine Relation vorhanden, z. B. kein ress_belegen)
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

        # PtStatus-Import statt Literal 1 (P5D-SCOPE §5, T8)
        status = getattr(proz, "m_eStatus", None)
        is_bearb = getattr(status, "value", status) == _PT_BEARB

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
                    "auftrag_oid": self._auftrag_oid(proz),
                    # Bezugsobjekt Durchlaufplan + Soll-Termin (KENNZAHLEN-SPEC §3):
                    # ermöglichen Durchlaufzeit-Gruppierung pro Durchlaufplan und
                    # die Liefertermintreue im UI — read-only abgeleitet.
                    "durchlaufplan_oid": self._durchlaufplan_oid(proz),
                    "durchlaufplan_id": self._durchlaufplan_id(proz),
                    "soll_end_termin": self._soll_end_termin(proz, start_time),
                },
            )

        # ende: das laufende Event ist ein Bearbeitungs-Ende.
        if meta_name == _BEARBEIT_ENDE and proz is not None:
            start_time = self._start_time.get(id(proz))
            dauer_ist = (t - start_time) if start_time is not None else None
            # Echter End-Status: PT_ENDE → "abgeschlossen" (P5D-SCOPE §5.1).
            # Verspätungsvergleich (soll_ende vs. ist_ende) bleibt optional/out of scope
            # — Soll-Daten (geplanter Abschluss-Zeitpunkt) sind auf Frame-Ebene nicht
            # ohne zusätzliche Auslöser-Felder ableitbar (TODO für Phase 5-D vollständig).
            end_status = "abgeschlossen"
            self._emit(
                t,
                {
                    "kind": "ende",
                    "auftrag_id": self._auftrag_id(proz),
                    "prozess_id": self._prozess_id(proz),
                    "start_time": start_time,
                    "end_time": t,
                    "dauer_ist": dauer_ist,
                    "status": end_status,
                    "auftrag_oid": self._auftrag_oid(proz),
                },
                meta_event=meta_name,
            )


# Selbst-Registrierung beim Import (Registry-Pattern).
def _factory(seq_counter, writer):  # noqa: ANN001
    return GanttListener(seq_counter, writer)


_factory.__name__ = "GanttListener"
register_listener(_factory)
