"""PAssozBeleg — Belegungs-Assoziation: Knoten ↔ Liste von PRessBeleg.

Provenienz: `OSimPro/PAssozRessource.odh` (Sektion `PAssozBeleg`, ab Z. 195)
+ `OSimPro/PAssozRessource.cpp` (`PAssozBeleg::*`).

V4-Pfad: ohne Entscheider-Funktionalität (`IsEntFunktOn`). Nimmt einfach die
erste verfügbare `PRessBeleg` aus `m_lRessourcen`. Wenn gefunden, wird eine
`PtRelationBeleg` an `proz.m_oRelationen` gehängt (C++ Cpp:607-624).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.assoziation.base import PAssozRessource
from osim_engine.resources.relation import PtRelationBeleg

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PRessBeleg
    from osim_engine.resources.relation import PtRelation


class PAssozBeleg(PAssozRessource):
    """C++-Äquivalent: `PAssozBeleg` (`PAssozRessource.odh:195`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lRessourcen: list["PRessBeleg"] = []
        # m_LinkStatusList: Entscheider-State — V4 ungenutzt
        self.m_LinkStatusList: list = []
        # m_aPtkZeitBelegung: pro-Ressourcen-Belegungszeit-Protokoll — V6+
        self.m_aPtkZeitBelegung: list[float] = []
        self.m_aTmpZeitBelegung: list[float] = []

    # ------------------------------------------------------------------
    # Sim-Methoden — V4: ohne IsEntFunktOn-Pfad
    # ------------------------------------------------------------------

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozBeleg::RessVerfuegbar` (PAssozRessource.cpp:601-624).

        Iteriert m_lRessourcen, gibt die erste verfügbare zurück. Bei Erfolg
        wird eine PtRelationBeleg angelegt und an `proz.m_oRelationen` gehängt.
        """
        for ress_beleg in self.m_lRessourcen:
            if ress_beleg.ress_verfuegbar(proz):
                rel = PtRelationBeleg(self.p_simulator)
                rel.m_oAssoz = self
                rel.m_oProzess = proz
                rel.m_oRessBeleg = ress_beleg
                proz.m_oRelationen.append(rel)
                return True
        return False

    def ress_anwesend(self, proz: "PtProzess") -> bool:
        """C++: `PAssozBeleg::RessAnwesend` (PAssozRessource.cpp:684-698)."""
        for ress_beleg in self.m_lRessourcen:
            if ress_beleg.ress_anwesend(proz):
                return True
        return False

    # ------------------------------------------------------------------
    # Lifecycle der Belegungs-Reservierung
    # ------------------------------------------------------------------

    def on_proz_beginn(self, rel: "PtRelation") -> None:
        """C++: `PAssozBeleg::OnProzBeginn` (PAssozRessource.cpp:898-914)."""
        assert isinstance(rel, PtRelationBeleg)
        assert rel.m_oRessBeleg is not None
        assert rel.m_oProzess is not None
        rel.m_oRessBeleg.ress_belegen(rel.m_oProzess)
        # Protokoll der Belegungszeit (V6+) — m_aPtkZeitBelegung leer in V4.

    def on_proz_ende(self, rel: "PtRelation") -> None:
        """C++: `PAssozBeleg::OnProzEnde` (PAssozRessource.cpp:917-933)."""
        assert isinstance(rel, PtRelationBeleg)
        assert rel.m_oRessBeleg is not None
        assert rel.m_oProzess is not None
        rel.m_oRessBeleg.ress_freigeben(rel.m_oProzess)

    def on_proz_unterbr(self, rel: "PtRelation") -> None:
        """C++: `PAssozBeleg::OnProzUnterbr` (PAssozRessource.cpp:936ff)."""
        assert isinstance(rel, PtRelationBeleg)
        assert rel.m_oRessBeleg is not None
        assert rel.m_oProzess is not None
        rel.m_oRessBeleg.ress_unterbrechen(rel.m_oProzess)

    # ------------------------------------------------------------------
    # Allgemeine Listen-Helfer
    # ------------------------------------------------------------------

    def is_in_list(self, pobj: Any) -> bool:
        return pobj in self.m_lRessourcen

    def is_empty(self) -> bool:
        return len(self.m_lRessourcen) == 0
