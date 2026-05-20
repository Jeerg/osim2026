"""EPAszEntFeld — Assoziation zwischen Knoten und Entscheidungsfeldern.

Provenienz: `OSimPro/EPEntscheidung.odh:222-294` + `EPEntscheidung.cpp:281-523`.

Im C++-Original erbt `EPAszEntFeld` von `PAssozRessource`, **nicht** von
`PAssozBeleg`. Die Klasse stellt Belegungs-Routing über eine Liste von
`EPEntFeld`-Tupeln zur Verfügung: für jede Entscheidung wird das erste
verfügbare/anwesende `EPEntFeld` ausgewählt, dessen Person dann als
Belegungs-Ressource für den Prozess fungiert.

Slice P5-A — Funktionsumfang:
    - Container: `m_lEntFeldTupel` + parallele Counter-Arrays
    - Belegungs-Hooks: `RessVerfuegbar`/`RessAnwesend`/`OnProzBeginn`/Ende/Unterbr
    - Lifecycle: `OnRecInit`/`OnRecStart`/`OnRecStop` mit `PtkIntervallStart/Stop`

Alle Methoden sind über `PSimulator.m_bIsEntAktiv` (`IsEntFunktOn`) geguarded
— solange das Flag `False` bleibt (Slice-P5-A-Default), liefern die
`RessVerfuegbar`/`RessAnwesend`-Methoden `False` und Belegungs-Routing
findet nicht statt. So sind die Klassen bereits 1:1 portiert, aber ohne
das Sim-Verhalten zu ändern.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.core.distribution import s_verteil  # noqa: F401  (unbenutzt)
from osim_engine.resources.assoziation.base import PAssozRessource

if TYPE_CHECKING:
    from osim_engine.decisions.entscheidung import EPEntFeld, EPEntFeldLList
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PRessBeleg
    from osim_engine.resources.relation import PtRelation


class EPAszEntFeld(PAssozRessource):
    """Assoz für Entscheidungsfeld-basierte Belegung.

    C++: `EPAszEntFeld` (EPEntscheidung.odh:222-294).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Container: in C++ EPEntFeldLList; in Python flacher list-Subtyp,
        # wird vom Loader befüllt
        from osim_engine.decisions.entscheidung import EPEntFeldLList
        self.m_lEntFeldTupel: EPEntFeldLList = EPEntFeldLList()
        # Parallele Counter-Arrays (1:1 zu CArray<double, double>)
        self.m_aPtkZeitBelegung: list[float] = []
        self.m_aTmpZeitBelegung: list[float] = []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _is_ent_funkt_on(self) -> bool:
        """C++: `GetPSimulator()->IsEntFunktOn()` — Guard für alle Methoden."""
        sim = self.m_simulator
        return bool(getattr(sim, "m_bIsEntAktiv", False))

    def get_feld_with_beleg(self, beleg: "PRessBeleg") -> "EPEntFeld | None":
        """C++: `EPAszEntFeld::GetFeldWithBeleg` (EPEntscheidung.cpp:473-484).

        Liefert das EntFeld, dessen `m_oPPerson` mit `beleg` übereinstimmt.
        """
        for entfeld in self.m_lEntFeldTupel:
            if entfeld.m_oPPerson is beleg:
                return entfeld
        return None

    # ------------------------------------------------------------------
    # Sim-Methoden (über IsEntFunktOn geguarded)
    # ------------------------------------------------------------------

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `EPAszEntFeld::RessVerfuegbar` (EPEntscheidung.cpp:289-318).

        Iteriert über die EntFelder und nimmt das erste, dessen Person
        verfügbar ist. Erzeugt ein `PtRelationBeleg` und hängt es an
        den Prozess. Setzt zudem `m_oEntFeld` am Prozess, falls dieser
        eine `PtProzEntAufgabeBase`-Instanz ist (kommt in späterer Slice).
        """
        if not self._is_ent_funkt_on():
            return False
        for entfeld in self.m_lEntFeldTupel:
            if entfeld.m_oPPerson is None:
                continue
            if entfeld.m_oPPerson.ress_verfuegbar(proz):
                # PtRelationBeleg erzeugen und an Prozess hängen
                from osim_engine.resources.relation import PtRelationBeleg
                rel = PtRelationBeleg(self.p_simulator)
                rel.m_oAssoz = self
                rel.m_oProzess = proz
                rel.m_oRessBeleg = entfeld.m_oPPerson
                proz.m_oRelationen.append(rel)
                # Bei PtProzEntAufgabeBase auch das EntFeld am Prozess speichern.
                # PtProzEntAufgabeBase existiert in Slice P5-A noch nicht —
                # daher per duck-typing (hasattr) abgesichert.
                if hasattr(proz, "m_oEntFeld"):
                    proz.m_oEntFeld = entfeld
                return True
        return False

    def ress_anwesend(self, proz: "PtProzess | None" = None) -> bool:
        """C++: `EPAszEntFeld::RessAnwesend` (EPEntscheidung.cpp:319-340)."""
        if not self._is_ent_funkt_on():
            return False
        for entfeld in self.m_lEntFeldTupel:
            if entfeld.m_oPPerson is None:
                continue
            if entfeld.m_oPPerson.ress_anwesend(proz):
                if proz is not None and hasattr(proz, "m_oEntFeld"):
                    proz.m_oEntFeld = entfeld
                return True
        return False

    # ------------------------------------------------------------------
    # Inline PtkIntervall-Helpers für Array-Index — 1:1 zu C++
    # OSimulator::PtkIntervallBegin/End/Start/Stop, aber auf Array-Element
    # ------------------------------------------------------------------

    def _ptk_intervall_begin_at(self, idx: int, gfakt: float, ptime: int) -> None:
        sim = self.m_simulator
        if sim is None:
            return
        self.m_aTmpZeitBelegung[idx] += gfakt
        if sim.m_isPtk:
            self.m_aPtkZeitBelegung[idx] -= gfakt * ptime

    def _ptk_intervall_end_at(self, idx: int, gfakt: float, ptime: int) -> None:
        sim = self.m_simulator
        if sim is None:
            return
        tmp_val = self.m_aTmpZeitBelegung[idx]
        if sim.m_ptkBegin > 0 and tmp_val <= 0.0 and gfakt > 0:
            return
        if sim.m_isPtk:
            self.m_aPtkZeitBelegung[idx] += gfakt * ptime
        self.m_aTmpZeitBelegung[idx] = tmp_val - gfakt

    def _ptk_intervall_start_at(self, idx: int, ptime: int) -> None:
        sim = self.m_simulator
        if sim is None:
            return
        tmp_val = self.m_aTmpZeitBelegung[idx]
        if tmp_val != 0.0 and sim.m_isPtk:
            self.m_aPtkZeitBelegung[idx] -= tmp_val * ptime

    def _ptk_intervall_stop_at(self, idx: int, ptime: int) -> None:
        sim = self.m_simulator
        if sim is None:
            return
        tmp_val = self.m_aTmpZeitBelegung[idx]
        if tmp_val != 0.0 and sim.m_isPtk:
            self.m_aPtkZeitBelegung[idx] += tmp_val * ptime

    def on_proz_beginn(self, rel: "PtRelation") -> None:
        """C++: `EPAszEntFeld::OnProzBeginn` (EPEntscheidung.cpp:341-360)."""
        beleg = getattr(rel, "m_oRessBeleg", None)
        if beleg is None:
            return
        beleg.ress_belegen(rel.m_oProzess)
        entfeld = self.get_feld_with_beleg(beleg)
        if entfeld is None:
            raise RuntimeError("EPAszEntFeld.on_proz_beginn: EntFeld nicht gefunden")
        try:
            inx = list(self.m_lEntFeldTupel).index(entfeld)
        except ValueError as e:
            raise RuntimeError("EPAszEntFeld.on_proz_beginn: EntFeld-Index < 0") from e
        sim = self.m_simulator
        if sim is not None and sim.m_isPtk:
            self._ptk_intervall_begin_at(inx, 1.0, sim.evt_curr_time())

    def on_proz_ende(self, rel: "PtRelation") -> None:
        """C++: `EPAszEntFeld::OnProzEnde` (EPEntscheidung.cpp:361-380)."""
        beleg = getattr(rel, "m_oRessBeleg", None)
        if beleg is None:
            return
        beleg.ress_freigeben(rel.m_oProzess)
        entfeld = self.get_feld_with_beleg(beleg)
        if entfeld is None:
            raise RuntimeError("EPAszEntFeld.on_proz_ende: EntFeld nicht gefunden")
        try:
            inx = list(self.m_lEntFeldTupel).index(entfeld)
        except ValueError as e:
            raise RuntimeError("EPAszEntFeld.on_proz_ende: EntFeld-Index < 0") from e
        sim = self.m_simulator
        if sim is not None and sim.m_isPtk:
            self._ptk_intervall_end_at(inx, 1.0, sim.evt_curr_time())

    def on_proz_unterbr(self, rel: "PtRelation") -> None:
        """C++: `EPAszEntFeld::OnProzUnterbr` (EPEntscheidung.cpp:381-399)."""
        beleg = getattr(rel, "m_oRessBeleg", None)
        if beleg is None:
            return
        beleg.ress_unterbrechen(rel.m_oProzess)
        entfeld = self.get_feld_with_beleg(beleg)
        if entfeld is None:
            raise RuntimeError("EPAszEntFeld.on_proz_unterbr: EntFeld nicht gefunden")
        try:
            inx = list(self.m_lEntFeldTupel).index(entfeld)
        except ValueError as e:
            raise RuntimeError("EPAszEntFeld.on_proz_unterbr: EntFeld-Index < 0") from e
        sim = self.m_simulator
        if sim is not None and sim.m_isPtk:
            self._ptk_intervall_end_at(inx, 1.0, sim.evt_curr_time())

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def on_rec_init(self, deep: bool = True) -> None:
        """C++: `EPAszEntFeld::OnRecInit` (EPEntscheidung.odh:262-274).

        Protokoll-Arrays auf Größe der EntFeld-Liste setzen und nullen.
        """
        n = len(self.m_lEntFeldTupel)
        self.m_aPtkZeitBelegung = [0.0] * n
        self.m_aTmpZeitBelegung = [0.0] * n

    def on_rec_start(self, time_start: int, deep: bool = True) -> None:
        """C++: `EPAszEntFeld::OnRecStart` (EPEntscheidung.odh:276-283)."""
        for i in range(len(self.m_aPtkZeitBelegung)):
            self._ptk_intervall_start_at(i, time_start)

    def on_rec_stop(self, time_stop: int, deep: bool = True) -> None:
        """C++: `EPAszEntFeld::OnRecStop` (EPEntscheidung.odh:285-292)."""
        for i in range(len(self.m_aPtkZeitBelegung)):
            self._ptk_intervall_stop_at(i, time_stop)

    # ------------------------------------------------------------------
    # Auswertung
    # ------------------------------------------------------------------

    def get_proz_kost(self, k_klass: Any = None) -> float:
        """C++: immer 0.0 (EPEntscheidung.cpp:400-403)."""
        return 0.0

    def get_ein_rsc_kosten(self, k_klass: Any = None) -> float:
        """C++: `EPAszEntFeld::GetEinRscKosten` (EPEntscheidung.cpp:408-441).

        Slice-P5-A liefert 0.0, solange Entscheider deaktiviert.
        """
        sim = self.m_simulator
        if sim is None or not sim.is_ptk():
            return 0.0
        if not self._is_ent_funkt_on():
            return 0.0
        # Echte Berechnung lassen wir später nachziehen — sie braucht
        # PtkIntervallStart/Stop pro Index, was die Helper-API in der
        # aktuellen Implementierung noch nicht abdeckt.
        return 0.0

    def get_ein_min_rsc_kosten(self, k_klass: Any = None) -> float:
        """C++: `EPAszEntFeld::GetEinMinRscKosten` (EPEntscheidung.cpp:442-468)."""
        return 0.0

    # ------------------------------------------------------------------
    # Listen-Helpers
    # ------------------------------------------------------------------

    def is_in_list(self, pobj: Any) -> bool:
        """C++: `EPAszEntFeld::IsInList` (EPEntscheidung.cpp:489-501)."""
        return any(ef is pobj for ef in self.m_lEntFeldTupel)

    def remove_psim_obj(self, pobj: Any) -> bool:
        """C++: `EPAszEntFeld::RemovePSimObj` (EPEntscheidung.cpp:506-523)."""
        ret = False
        for ef in list(self.m_lEntFeldTupel):
            if ef is pobj:
                self.m_lEntFeldTupel.remove(ef)
                ret = True
        return ret

    def is_empty(self) -> bool:
        """C++: `EPAszEntFeld::IsEmpty` (EPEntscheidung.odh:251)."""
        return len(self.m_lEntFeldTupel) == 0
