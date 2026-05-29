"""PAssozBeleg — Belegungs-Assoziation: Knoten ↔ Liste von PRessBeleg.

Provenienz: `OSimPro/PAssozRessource.odh` (Sektion `PAssozBeleg`, ab Z. 195)
+ `OSimPro/PAssozRessource.cpp` (`PAssozBeleg::*`).

V4-Pfad: ohne Entscheider-Funktionalität (`IsEntFunktOn`). Nimmt einfach die
erste verfügbare `PRessBeleg` aus `m_lRessourcen`. Wenn gefunden, wird eine
`PtRelationBeleg` an `proz.m_oRelationen` gehängt (C++ Cpp:607-624).

P5-E: LinkStatus-API (get/set_link_status, get_base_link_status) als treue
Portierung von PAssozBeleg::GetLinkStatus/SetLinkStatus/GetBaseLinkStatus
(PAssozRessource.cpp:735-751).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.assoziation.base import PAssozRessource
from osim_engine.resources.relation import PtRelationBeleg

if TYPE_CHECKING:
    from osim_engine.decisions.strategie_rsv import AssozBelegLinkStatus
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PRessBeleg
    from osim_engine.resources.relation import PtRelation


class PAssozBeleg(PAssozRessource):
    """C++-Äquivalent: `PAssozBeleg` (`PAssozRessource.odh:195`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lRessourcen: list["PRessBeleg"] = []
        # m_LinkStatusList: Entscheider-State — in P5-E als dict implementiert.
        # C++: PAssozBelegLinkStatusList (CList-basiert, hält current + base Status).
        # Python: dict[PRessBeleg, tuple[AssozBelegLinkStatus, AssozBelegLinkStatus]]
        #   Key: PRessBeleg-Objekt, Value: (current_status, base_status)
        # Lazy-initialisiert: erst bei Zugriff mit Ressource befüllt (Default ABL_STD).
        self.m_LinkStatusList: list = []           # Compat-Alias für ältere Referenzen
        self._link_status_dict: dict[Any, tuple] = {}
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

    # ------------------------------------------------------------------
    # LinkStatus-API (P5-E) — 1:1 zu PAssozRessource.cpp:712-751
    # ------------------------------------------------------------------

    def get_link_status(self, beleg: Any) -> "AssozBelegLinkStatus":
        """C++: PAssozBeleg::GetLinkStatus (PAssozRessource.cpp:735-741).

        Wenn m_bIsEntAktiv=True: liest aus dem internen dict.
        Default für Ressourcen in m_lRessourcen: ABL_STD.
        Ressource NICHT in m_lRessourcen: ABL_BLOCKED (kein gültiger Link).
        Wenn m_bIsEntAktiv=False: immer ABL_STD (C++ else-Zweig).
        """
        from osim_engine.decisions.strategie_rsv import AssozBelegLinkStatus

        sim = self.p_simulator
        is_ent = getattr(sim, "m_bIsEntAktiv", False) if sim is not None else False

        if not is_ent:
            # C++: else return ABL_STD (Cpp:739-740)
            return AssozBelegLinkStatus.ABL_STD

        # Ressource nicht in der Liste → ABL_BLOCKED (kein gültiger Link)
        if beleg not in self.m_lRessourcen:
            return AssozBelegLinkStatus.ABL_BLOCKED

        # Aus dict lesen; Default = ABL_STD
        entry = self._link_status_dict.get(id(beleg))
        if entry is None:
            return AssozBelegLinkStatus.ABL_STD
        return entry[0]  # current_status

    def get_base_link_status(self, beleg: Any) -> "AssozBelegLinkStatus":
        """C++: PAssozBeleg::GetBaseLinkStatus (PAssozRessource.cpp:743-751).

        Basis-Status bleibt ABL_STD bis set_base_link_status explizit aufgerufen
        wird (kein set_base_link_status in dieser Scope — P5-F-Funktion).
        """
        from osim_engine.decisions.strategie_rsv import AssozBelegLinkStatus

        sim = self.p_simulator
        is_ent = getattr(sim, "m_bIsEntAktiv", False) if sim is not None else False

        if not is_ent:
            return AssozBelegLinkStatus.ABL_STD

        if beleg not in self.m_lRessourcen:
            return AssozBelegLinkStatus.ABL_BLOCKED

        entry = self._link_status_dict.get(id(beleg))
        if entry is None:
            return AssozBelegLinkStatus.ABL_STD
        return entry[1]  # base_status

    def set_link_status(self, beleg: Any, status: "AssozBelegLinkStatus") -> None:
        """C++: PAssozBeleg::SetLinkStatus (PAssozRessource.cpp:712-723).

        Nur aktiv wenn m_bIsEntAktiv=True UND beleg in m_lRessourcen.
        Setzt den current_status; base_status bleibt unverändert (ABL_STD).
        1:1 zu C++: SetLinkStatus modifiziert nur current, nicht base.
        """
        sim = self.p_simulator
        is_ent = getattr(sim, "m_bIsEntAktiv", False) if sim is not None else False

        if not is_ent:
            return
        if beleg not in self.m_lRessourcen:
            return

        entry = self._link_status_dict.get(id(beleg))
        if entry is None:
            from osim_engine.decisions.strategie_rsv import AssozBelegLinkStatus
            base = AssozBelegLinkStatus.ABL_STD
        else:
            base = entry[1]

        self._link_status_dict[id(beleg)] = (status, base)
