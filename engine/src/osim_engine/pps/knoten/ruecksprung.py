"""PDpKnRuecksprung — Knoten der einen Sub-Plan iterativ wiederholt.

Provenienz: `OSimPro/PDpKnRuecksprung.odh` + `OSimPro/PDpKnRuecksprung.cpp`.

Ein Rücksprung-Knoten kapselt einen ganzen `PDurchlaufplan` (`m_lDlpl`).
Beim Erreichen löst er den Sub-Plan aus; wenn der zurückkommt (Sub-Plan-
Ende → `m_lKnotenOber.on_proz_sub_beendet`), inkrementiert er
`m_iWiederholungen` und entscheidet via `ruecksprung_entscheiden`:

- TRUE → Sub-Plan erneut auslösen
- FALSE → Weitergabe an `m_lKanteAus`

V4-A implementiert die abstract Basis sowie zwei Subtypen:

- `PDpKnRueckKonstant`: TRUE solange `m_iWiederholungen < m_iWiederholungenZiel`
- `PDpKnRueckVerteilung`: TRUE wenn LCG-Zufallszahl < `m_fSprungWahrschlkt`

Counter `m_iPtkRuecksprungCount` zählt die ABGESCHLOSSENEN
Wiederholungen (= Anzahl der Returns wo `m_iWiederholungen > 1`).
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten

if TYPE_CHECKING:
    from osim_engine.pps.durchlaufplan import PDurchlaufplan
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDpKnRuecksprung(PDlplKnoten):
    """C++-Äquivalent: `PDpKnRuecksprung` (`PDpKnRuecksprung.odh:21`). Abstract."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Sub-Plan, der iteriert wird. Setzen via set_sub_plan.
        self.m_lDlpl: "PDurchlaufplan | None" = None
        # Protokoll
        self.m_iPtkRuecksprungCount: int = 0
        self.m_dPtkRuecksprungDlfz: float = 0.0
        self.m_dTmpRuecksprungDlfz: float = 0.0

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        self.m_iPtkRuecksprungCount = 0
        self.m_dPtkRuecksprungDlfz = 0.0
        self.m_dTmpRuecksprungDlfz = 0.0

    def set_sub_plan(self, plan: "PDurchlaufplan") -> None:
        """Hängt den Sub-Plan ein + setzt `plan.m_lKnotenOber = self`.

        C++-Äquivalent: `PDpKnRuecksprung(...)` (PDpKnRuecksprung.odh:60-63):
        `m_lDlpl->m_lKnotenOber = oprThis()`.
        """
        self.m_lDlpl = plan
        plan.m_lKnotenOber = self

    # ------------------------------------------------------------------
    # Pure overrideables
    # ------------------------------------------------------------------

    @abstractmethod
    def proz_erzeugen(self) -> "PtProzess":
        """Erzeugt eine PtProzRuecksprung-Instanz."""
        ...

    @abstractmethod
    def ruecksprung_entscheiden(self, proz: "PtProzess") -> bool:
        """Liefert TRUE wenn der Sub-Plan erneut ausgelöst werden soll."""
        ...

    # ------------------------------------------------------------------
    # Overrides von PDlplKnoten — C++ PDpKnRuecksprung.cpp:31-105
    # ------------------------------------------------------------------

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """C++: `PDpKnRuecksprung::ProzWeitergeben` (PDpKnRuecksprung.cpp:31-57).

        Erzeugt PtProzRuecksprung, koppelt es an, fügt es in m_lProzesse,
        startet BearbeitBeginnen (= Sub-Plan auslösen). Bei Fehlschlag
        landet der proz in der zentralen Warteschlange.
        """
        proz = self.proz_erzeugen()
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger if proz_ober is not None else None
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent
        proz.m_sName = self.m_sName

        self.add_prozess(proz)
        self.m_iPtkProzessCount += 1

        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        self.p_simulator.bus.emit(
            "proz.create",
            proz_id=proz.m_sName,
            knoten=self.m_sName,
            trigger_id=(proz.m_oTrigger.m_sName if proz.m_oTrigger else None),
        )

        if not self.bearbeit_beginnen(proz):
            self.p_simulator.m_oWarteSchl.add_tail(proz)

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """C++: `PDpKnRuecksprung::BearbeitBeginnen` (PDpKnRuecksprung.cpp:60-70).

        1. Basis-Logik (Counter++, ress_verfuegbar, listener, proz.bearbeit_beginnen)
        2. Sub-Plan auslösen via `m_lDlpl.proz_weitergeben(proz, ent)`
        """
        if not super().bearbeit_beginnen(proz):
            return False

        assert self.m_lDlpl is not None, (
            f"PDpKnRuecksprung {self.m_sName!r} hat keinen Sub-Plan (set_sub_plan)"
        )
        self.m_lDlpl.proz_weitergeben(proz, proz.m_oEntitaet)
        return True

    def on_proz_sub_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """C++: `PDpKnRuecksprung::OnProzSubBeendet` (PDpKnRuecksprung.cpp:73-105).

        Wird gerufen wenn der Sub-Plan ohne eigene Out-Kante endet.
        Inkrementiert m_iWiederholungen, fragt RuecksprungEntscheiden,
        und entscheidet:
        - TRUE → Sub-Plan erneut auslösen + Counter führen
        - FALSE → m_lKanteAus.proz_weitergeben + proz.bearbeit_beenden
        """
        from osim_engine.pps.prozess.ruecksprung import PtProzRuecksprung

        assert isinstance(proz, PtProzRuecksprung), (
            f"on_proz_sub_beendet erwartet PtProzRuecksprung, "
            f"bekam {type(proz).__name__}"
        )

        proz.m_iWiederholungen += 1

        if self.ruecksprung_entscheiden(proz):
            assert self.m_lDlpl is not None
            self.m_lDlpl.proz_weitergeben(proz, ent)
            # Protokoll
            if proz.m_iWiederholungen > 1:
                self._on_ruecksprung_ende(proz)
            self._on_ruecksprung_beginn(proz)
            return

        # Kein weiterer Rücksprung — Weitergabe an Out-Kante
        if self.m_lKanteAus is not None:
            self.m_lKanteAus.proz_weitergeben(proz, ent)
        elif proz.m_oTrigger is not None:
            proz.m_oTrigger.on_dlpl_beendet(proz)

        if proz.m_iWiederholungen > 1:
            self._on_ruecksprung_ende(proz)

        # Listener-Notify + AusloesungCount (C++: OnProzBearbeitEnde)
        if self.is_ptk:
            self.m_iPtkAusloesungCount += 1
        for listener in list(self._listeners):
            listener.on_proz_bearbeit_ende(proz)

        # Prozess aus m_lProzesse entfernen + beenden
        self.remove_prozess(proz)
        proz.bearbeit_beenden()

    def _on_ruecksprung_beginn(self, proz: "PtProzRuecksprung") -> None:
        """C++: `PDpKnRuecksprung::OnRuecksprungBeginn` (PDpKnRuecksprung.cpp:108-116).
        Markiert Beginn eines Rücksprungs (m_iWiederholungen>0).
        """
        # In V1 nur Bus-Event, kein Ptk-Intervall-Tracking
        if proz.m_iWiederholungen > 0:
            self.p_simulator.bus.emit(
                "ruecksprung.beginn",
                knoten=self.m_sName,
                proz_id=proz.m_sName,
                wiederholung=proz.m_iWiederholungen,
            )

    def _on_ruecksprung_ende(self, proz: "PtProzRuecksprung") -> None:
        """C++: `PDpKnRuecksprung::OnRuecksprungEnde` (PDpKnRuecksprung.cpp:119-127).

        Wird gerufen wenn eine Wiederholung abgeschlossen ist (m_iWiederholungen>1
        - die erste Iteration zählt als Original, ab der zweiten als Rücksprung).
        """
        if proz.m_iWiederholungen > 1:
            self.m_iPtkRuecksprungCount += 1
            self.p_simulator.bus.emit(
                "ruecksprung.ende",
                knoten=self.m_sName,
                proz_id=proz.m_sName,
                wiederholung=proz.m_iWiederholungen,
                counter=self.m_iPtkRuecksprungCount,
            )

    # ------------------------------------------------------------------
    # KPI
    # ------------------------------------------------------------------

    def get_knz_anz_ruecksprung(self) -> int:
        """C++: `GetKnzAnzRuecksprung`."""
        return self.m_iPtkRuecksprungCount


# ----------------------------------------------------------------------
# Konkrete Subtypen
# ----------------------------------------------------------------------


class PDpKnRueckKonstant(PDpKnRuecksprung):
    """C++-Äquivalent: `PDpKnRueckKonstant` (`PDpKnRuecksprung.odh:120`).

    Wiederholt den Sub-Plan exakt `m_iWiederholungenZiel` Mal. C++-Naming
    `m_iWiederholungen` ist hier umbenannt in `m_iWiederholungenZiel`, um
    Verwechslung mit `PtProzRuecksprung.m_iWiederholungen` (Lauf-Counter)
    zu vermeiden.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iWiederholungenZiel: int = 1

    def proz_erzeugen(self) -> "PtProzess":
        from osim_engine.pps.prozess.ruecksprung import PtProzRuecksprung
        return PtProzRuecksprung(self.p_simulator)

    def ruecksprung_entscheiden(self, proz: "PtProzess") -> bool:
        """C++: `PDpKnRueckKonstant::RuecksprungEntscheiden`
        (PDpKnRuecksprung.cpp:455-461).
        """
        from osim_engine.pps.prozess.ruecksprung import PtProzRuecksprung
        assert isinstance(proz, PtProzRuecksprung)
        return proz.m_iWiederholungen < self.m_iWiederholungenZiel


class PDpKnRueckVerteilung(PDpKnRuecksprung):
    """C++-Äquivalent: `PDpKnRueckVerteilung` (`PDpKnRuecksprung.odh:174`).

    Stochastisch: Sub-Plan wiederholt mit Wahrscheinlichkeit
    `m_fSprungWahrschlkt` (in Prozent, 0-100). Zufallszahl aus dem
    PAWLICEK-LCG.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_fSprungWahrschlkt: float = 0.0

    def proz_erzeugen(self) -> "PtProzess":
        from osim_engine.pps.prozess.ruecksprung import PtProzRuecksprung
        return PtProzRuecksprung(self.p_simulator)

    def ruecksprung_entscheiden(self, proz: "PtProzess") -> bool:
        """C++: `PDpKnRueckVerteilung::RuecksprungEntscheiden`
        (PDpKnRuecksprung.cpp:513-525). Zufallszahl in [0,100] aus dem
        LCG; wenn < m_fSprungWahrschlkt → True.
        """
        del proz
        from osim_engine.core import distribution as dist_module
        d_vert = dist_module.s_verteil.vert_gleich() * 100.0
        return d_vert < self.m_fSprungWahrschlkt
