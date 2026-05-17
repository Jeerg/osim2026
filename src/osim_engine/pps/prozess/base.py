"""PtProzess — Basis aller transienten Prozesse.

Provenienz: `OSimPro/PtProzess.odh` + `OSimPro/PtProzess.cpp`.

V1-V3: minimaler Lebenszyklus + Status.
V4: Ressourcen-Pfad — `ress_verfuegbar` (PtProzess.cpp:124-139),
`on_bearbeit_abgelehnt` (PtProzess.cpp:222-242), Notifikation der
`m_oRelationen` in `bearbeit_beginnen` / `bearbeit_beenden`
(PtProzess.cpp:159-187).
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger
    from osim_engine.resources.relation import PtRelation


class PtStatus(IntEnum):
    """OSimPro/PtProzess.odh::eStatus."""
    PT_BEARB = 1   # in Bearbeitung
    PT_ENDE = 2    # fertig
    PT_WART = 3    # in Warteschlange
    PT_UNT = 4     # unterbrochen


class PtProzess(PSimObj):
    """C++-Äquivalent: `PtProzess` (`PtProzess.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_eStatus: PtStatus = PtStatus.PT_WART

        # Beziehungen (Refs auf andere Sim-Objekte)
        self.m_oKnoten: "PDlplKnoten | None" = None
        self.m_oTrigger: "PtTrigger | None" = None
        self.m_oProzOber: "PtProzess | None" = None
        self.m_oEntitaet: Any = None  # PEntitaet (P4)

        # Felder für Prioritäts-/Wartezeit-Logik
        self.m_iPrioritaet: int = 0
        self.m_iErzeugungzeitpunkt: int = 0

        # Aktor (V8+) + Relationen (V4 aktiv)
        self.m_oAktor: Any = None
        self.m_oRelationen: list["PtRelation"] = []

    # ------------------------------------------------------------------
    # Ressourcen-Verfügbarkeit (V4) — C++ PtProzess.cpp:124-156
    # ------------------------------------------------------------------

    def ress_verfuegbar(self) -> bool:
        """Iteriert alle Knoten-Assoziationen.

        C++: `BOOL PtProzess::RessVerfuegbar()`. Sobald eine Assoziation
        FALSE liefert, ist die Bearbeitung abgelehnt — bereits angelegte
        Relationen werden später durch `on_bearbeit_abgelehnt` aufgeräumt.

        Wenn der Knoten keine Assoziationen hat (V1/V2/V3-Pfad) → True.
        """
        assert self.m_oKnoten is not None
        for assoz in self.m_oKnoten.m_lAssozRess:
            if not assoz.ress_verfuegbar(self):
                return False
        return True

    def ress_anwesend(self) -> bool:
        """C++: `BOOL PtProzess::RessAnwesend()` (PtProzess.cpp:141-156)."""
        assert self.m_oKnoten is not None
        for assoz in self.m_oKnoten.m_lAssozRess:
            if not assoz.ress_anwesend(self):
                return False
        return True

    # ------------------------------------------------------------------
    # Lifecycle-Hooks — werden vom Knoten gerufen
    # ------------------------------------------------------------------

    def bearbeit_beginnen(self) -> None:
        """Bearbeitung starten.

        C++: `PtProzess::BearbeitBeginnen` (PtProzess.cpp:159-171). Setzt
        Status, notifiziert Aktor (V8+) und alle Relationen
        (`on_proz_beginn` → `ress_belegen`).

        Subtypen (`PtProzZeitvorgabe`) rufen via `super()` an und planen
        anschließend ihre eigenen Events.
        """
        self.m_eStatus = PtStatus.PT_BEARB

        if self.m_oAktor is not None:
            self.m_oAktor.on_akt_beginn(self)

        for rel in list(self.m_oRelationen):
            rel.on_proz_beginn(self)

    def bearbeit_beenden(self) -> None:
        """Bearbeitung abschließen.

        C++: `PtProzess::BearbeitBeenden` (PtProzess.cpp:174-187). Setzt
        Status, notifiziert Aktor und Relationen (`on_proz_ende` →
        `ress_freigeben`).
        """
        self.m_eStatus = PtStatus.PT_ENDE

        if self.m_oAktor is not None:
            self.m_oAktor.on_akt_ende(self)

        for rel in list(self.m_oRelationen):
            rel.on_proz_ende(self)

    def bearbeit_unterbrechen(self) -> None:
        """C++: `PtProzess::BearbeitUnterbrechen` (PtProzess.cpp:189-220).

        V4 abgespeckt: Relationen notifizieren + abräumen, Status auf
        PT_UNT. Aktor-Schlangen-Verwaltung folgt in V8.
        """
        self.m_eStatus = PtStatus.PT_UNT

        for rel in list(self.m_oRelationen):
            rel.on_proz_unterbr(self)

        self.m_oRelationen.clear()

    def on_bearbeit_abgelehnt(self) -> None:
        """Bearbeitung wurde wegen Ressourcen-Konflikt abgelehnt.

        C++: `PtProzess::OnBearbeitAbgelehnt` (PtProzess.cpp:222-242).
        Räumt die im Verlauf von `ress_verfuegbar` angelegten Relationen
        ab (sonst würde der nächste Versuch sie doppelt anhängen).

        Der Prozess wird hier NICHT in die Warteschlange gehängt — das
        macht der Knoten-Aufrufer (`PDpKnZeitvorgabe.proz_weitergeben`)
        bzw. wird vom `proz_wart_ausloesen` schon impliziert.
        """
        self.m_oRelationen.clear()
