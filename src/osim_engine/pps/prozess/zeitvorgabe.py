"""PtProzZeitvorgabe — Prozess mit Zeitinhalt-Vorgabe.

Provenienz: `OSimPro/PtProzess.odh` Sektion `PtProzZeitvorgabe` +
zugehöriger `.cpp`-Code.

Plant beim `bearbeit_beginnen` ein `EvtBearbeitEnde`-Event ($event(2),
sub_time=2) für `curr_time + zeitinhalt_akt`. Beim Trigger des Events
ruft das `bearbeit_beenden`, das den Knoten via `on_proz_beendet`
notifiziert.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.pps.prozess.base import PtProzess, PtStatus

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class EvtBearbeitEnde(OMetaEvent):
    """$event(2) — Bearbeitungs-Ende-Slot. Sub-Time 2."""
    m_subTime = 2
    m_name = "EvtBearbeitEnde"

    def execute(self, obj: "PtProzZeitvorgabe", para: Any = None) -> None:
        obj.bearbeit_beenden()


# Modul-Singleton — wie C++-Meta-Event mit einem Klassen-Wert
_EVT_BEARBEIT_ENDE = EvtBearbeitEnde()


class PtProzZeitvorgabe(PtProzess):
    """C++-Äquivalent: `PtProzZeitvorgabe` (`PtProzess.odh`).

    Zeitinhalt wird aus dem Knoten geholt (`PDpKnZeitvorgabe.get_durchfuehrungszeit`).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iZeitinhaltAkt: int = 0
        self.m_iZeitinhaltGesamt: int = 0

        # Handle des laufenden EvtBearbeitEnde-Events (für evtl. Stornieren)
        self._evt_bearbeit_ende_hdl: int | None = None

    def get_zeitinhalt_rest(self) -> int:
        return self.m_iZeitinhaltAkt

    def get_zeitinhalt_gesamt(self) -> int:
        return self.m_iZeitinhaltGesamt

    # ------------------------------------------------------------------
    # bearbeit_beginnen — overridden
    # ------------------------------------------------------------------

    def bearbeit_beginnen(self) -> None:
        """Plant EvtBearbeitEnde.

        Aus `PtProzess.cpp::PtProzZeitvorgabe::BearbeitBeginnen` (gekürzt
        auf den Phase-1-Sim-Path; KPI-Detail in V2+):

        1. Zeitinhalt vom Knoten holen
        2. Status setzen
        3. EvtInsert(EvtBearbeitEnde, self, curr_time + zeitinhalt)
        """
        from osim_engine.pps.knoten.zeitvorgabe import PDpKnZeitvorgabe

        super().bearbeit_beginnen()  # Status setzen

        assert isinstance(self.m_oKnoten, PDpKnZeitvorgabe), (
            f"PtProzZeitvorgabe.m_oKnoten muss PDpKnZeitvorgabe sein, "
            f"ist aber {type(self.m_oKnoten).__name__}"
        )
        self.m_iZeitinhaltAkt = self.m_oKnoten.get_durchfuehrungszeit(self)
        self.m_iZeitinhaltGesamt = self.m_iZeitinhaltAkt

        sim = self.p_simulator
        ende_zeit = sim.evt_curr_time() + self.m_iZeitinhaltAkt
        self._evt_bearbeit_ende_hdl = sim.evt_insert(
            _EVT_BEARBEIT_ENDE, self, ende_zeit
        )

        sim.bus.emit("proz.bearbeit.start",
                     proz_id=self.m_sName,
                     knoten=self.m_oKnoten.m_sName if self.m_oKnoten else None,
                     ende_zeit=ende_zeit)

    def bearbeit_beenden(self) -> None:
        """Beendet die Bearbeitung.

        Reihenfolge (C++ `PtProzZeitvorgabe::BearbeitBeenden`,
        PtProzess.cpp:603-638):
            1. Status PT_ENDE setzen
            2. EventBus-Trace
            3. knoten.on_proz_beendet (Routing zum Nachfolger)
            4. super().bearbeit_beenden (Relations → ress_freigeben →
               proz_wart_ausloesen)

        Die Ressourcen-Freigabe nach dem Routing entspricht 1:1 dem C++-Pfad
        — ein nachfolgender Knoten, der dieselbe Ressource benötigt, sieht
        sie zuerst belegt und wandert in die Warteschlange; die anschließende
        Freigabe triggert das Wiederaufnahme-Event.
        """
        self.m_eStatus = PtStatus.PT_ENDE
        self._evt_bearbeit_ende_hdl = None

        assert self.m_oKnoten is not None

        self.p_simulator.bus.emit("proz.bearbeit.ende",
                                  proz_id=self.m_sName,
                                  knoten=self.m_oKnoten.m_sName)

        self.m_oKnoten.on_proz_beendet(self, self.m_oEntitaet)

        # Relations notifizieren — V4-Pfad: ress_freigeben + proz_wart_ausloesen
        super().bearbeit_beenden()
