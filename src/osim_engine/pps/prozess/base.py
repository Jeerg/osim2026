"""PtProzess — Basis aller transienten Prozesse.

Provenienz: `OSimPro/PtProzess.odh` + `OSimPro/PtProzess.cpp`.

In V1 nur die Felder + Status-Enum + Lifecycle-Hooks. DLL-Mechanik
(m_oNext/m_oPrev, FindVerknpf/AddVerknpf/RemoveVerknpf, RessVerfuegbar)
ist auf V2/V3 vertagt.
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger


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

        # Aktor + Relationen (P3)
        self.m_oAktor: Any = None
        self.m_oRelationen: list = []

    # ------------------------------------------------------------------
    # Lifecycle-Hooks — werden vom Knoten gerufen
    # ------------------------------------------------------------------

    def bearbeit_beginnen(self) -> None:
        """Bearbeitung starten. Default-Impl in Basis: nur Status setzen.

        Subtypen (PtProzZeitvorgabe) überschreiben das, um EvtBearbeitEnde
        zu planen.
        """
        self.m_eStatus = PtStatus.PT_BEARB

    def bearbeit_beenden(self) -> None:
        """Bearbeitung abschließen. Default: Status setzen + Knoten notifizieren."""
        self.m_eStatus = PtStatus.PT_ENDE

    def bearbeit_unterbrechen(self) -> None:
        self.m_eStatus = PtStatus.PT_UNT
