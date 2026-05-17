"""PSimulator — PPS-Top-Level-Simulator.

Provenienz: `OSimPro/PSimulator.odh` + `OSimPro/PSimulator.cpp`.

Erweitert `OSimulator` um die 12 PPS-Listen (in V1 nur 4 aktiv), den
`PGeneratorStub`, und die OnSimBegin/OnSimReset/OnRecInit-Hooks für
PPS-spezifisches Setup.

V1 — aktive Listen:
    - m_lAusl       list[PAusloeser]
    - m_lDlpl       list[PDurchlaufplan]   (leer — V1 hat keinen Plan)
    - m_oWarteSchl  PProzessDLL            (zentrale Warteschlange)
    - m_lKlassen    list[PKlasse]          (leer)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.simulator import OSimulator
from osim_engine.pps.prozess_dll import PProzessDLL

if TYPE_CHECKING:
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.knoten.base import PDlplKnoten


class PGeneratorStub:
    """Platzhalter für PGenerator (Phase 5). C++: `OSimPro/PGenerator.cpp`.

    In V1 ein leerer Stub, damit `m_oGenerator`-Slot exists für
    1:1-C++-Aufrufstellen. Keine Multi-Lauf-Logik, keine .psg-Files.
    """

    pass


class PSimulator(OSimulator):
    """C++-Äquivalent: `PSimulator` (`PSimulator.odh`)."""

    def __init__(self) -> None:
        super().__init__()

        # ---- 12 Listen aus PSimulator.odh ----
        # In V1 aktiv:
        self.m_lAusl: list["PAusloeser"] = []
        self.m_lDlpl: list = []                    # PDurchlaufplan — V1 leer
        self.m_oWarteSchl: PProzessDLL = PProzessDLL()
        self.m_lKlassen: list = []                  # PKlasse — V1 leer
        # In V1 ungenutzt (deklariert für API-Treue):
        self.m_lRessBeleg: list = []
        self.m_lRessMenge: list = []
        self.m_lSpeichProz: list = []
        self.m_lEinsatz: list = []
        self.m_lExtVert: list = []
        self.m_lZelSystem: list = []
        self.m_lEntInfo: list = []
        self.m_lEntStrategie: list = []
        self.m_lEntFeld: list = []

        # PGenerator als Stub
        self.m_oGenerator: PGeneratorStub = PGeneratorStub()

        # Konfigurations-Flags
        self.m_bIsEntAktiv: bool = False
        self.m_bPtkWartschl: bool = False
        self.m_bPtkBelegungList: bool = False
        self.m_bPtkAnfragenList: bool = False
        self.m_bTmpConKnotenList: bool = False
        self.m_bTmpUmlFaktorList: bool = False
        self.m_iProduktionBezugsPeriode: int = 86400
        self.m_iProduktionEnde: int = -1
        self.m_bIsProduktionEnde: bool = False

        # Knoten — V1 hält Top-Level-Knoten direkt im Simulator
        # (in V2/V3 sind sie unter PDurchlaufplan einsortiert)
        self.m_lKnoten: list["PDlplKnoten"] = []

    # ------------------------------------------------------------------
    # Children-Verwaltung (Tree-Lifecycle)
    # ------------------------------------------------------------------

    def register_ausloeser(self, ausl: "PAusloeser") -> None:
        """Hängt einen Auslöser in m_lAusl + ins Tree-Lifecycle."""
        self.m_lAusl.append(ausl)
        self._children.append(ausl)

    def register_knoten(self, knoten: "PDlplKnoten") -> None:
        """Hängt einen Knoten in m_lKnoten + ins Tree-Lifecycle (V1-Pragma)."""
        self.m_lKnoten.append(knoten)
        self._children.append(knoten)

    # ------------------------------------------------------------------
    # Lifecycle-Hooks
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim: "OSimulator | None" = None, deep: bool = True) -> None:
        """PSimulator.cpp `OnSimBegin`: leert Warteschlange + Standard-Logik."""
        # Warteschlange leeren (C++: m_oWarteSchl->RemoveAll)
        self.m_oWarteSchl.clear()
        # Basis-Logik (Children-Notifikation, LCG-Keim umschalten)
        super().on_sim_begin(self if sim is None else sim, deep=deep)

    def on_sim_reset(self, deep: bool = True) -> None:
        self.m_oWarteSchl.clear()
        super().on_sim_reset(deep=deep)

    def on_rec_init(self, deep: bool = True) -> None:
        """PSimulator.cpp `OnRecInit`: Protokoll-Counter zurücksetzen.

        Im C++ werden hier die KPI-Listen für Wartschlangen-/Belegungs-/
        Anfragen-Protokollierung initialisiert. In V1 nur Children-Propagation.
        """
        super().on_rec_init(deep=deep)
