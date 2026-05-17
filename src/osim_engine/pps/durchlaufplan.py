"""PDurchlaufplan — Plan = spezialisierter Knoten.

Provenienz: `OSimPro/PDurchlaufplan.odh` + `OSimPro/PDurchlaufplan.cpp`.

Ein Plan ist ein PDlplKnoten, der intern Knoten und Kanten kapselt. Top-Level:
- m_lStartKante: Eingang (Plan ist deren erster Vorgänger)
- m_lEndKante: Ausgang (Plan ist deren erster Nachfolger)
- m_lKnoten: alle inneren Knoten
- m_lKanten: alle inneren Kanten

V2-Subset:
- dlpl_ausloesen erzeugt PtProzDurchlaufplan und startet bearbeit_beginnen
- bearbeit_beginnen leitet an Startkante weiter
- on_dlpl_beendet behandelt die 3 Ausgangs-Pfade (Sub-Plan-Kante, Oberknoten,
  Top-Level-Trigger)

V3+: KPI-Methoden (CalcKritWegRek, PrzKostenBerechnen).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten, KnotenListener
from osim_engine.pps.prozess.durchlaufplan import PtProzDurchlaufplan

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger


class PDurchlaufplan(PDlplKnoten):
    """C++-Äquivalent: `PDurchlaufplan` (`PDurchlaufplan.odh`:34).

    Erbt von PDlplKnoten (Plan ist selbst ein Knoten), erweitert um Container
    für innere Knoten/Kanten.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lKnoten: list[PDlplKnoten] = []
        self.m_lKanten: list["PDlplKante"] = []
        self.m_lStartKante: "PDlplKante | None" = None
        self.m_lEndKante: "PDlplKante | None" = None

        # Protokollierung (für PDurchlaufplan-spezifische DLZ-Sliding-Window
        # KPIs — wird in V3 ausgebaut)
        self._beginn_list: list[dict] = []
        self._end_list: list[dict] = []

    # ------------------------------------------------------------------
    # Konstruktions-Helfer (für Tests)
    # ------------------------------------------------------------------

    def add_knoten(self, knoten: PDlplKnoten) -> None:
        """Hängt einen inneren Knoten ein + setzt m_lKnotenOber=self."""
        self.m_lKnoten.append(knoten)
        knoten.m_lKnotenOber = self
        # Tree-Lifecycle: der Plan-Container ist im PSimulator angemeldet,
        # die inneren Knoten werden hier transitiv unter dem Plan registriert.
        # Da der Lifecycle über _children läuft, müssen wir die inneren Knoten
        # an den Plan-Container hängen, der seinerseits beim Simulator hängt.
        # → Wir delegieren das Lifecycle-Propagieren über überschriebene
        # on_*-Methoden weiter unten.

    def add_kante(self, kante: "PDlplKante") -> None:
        self.m_lKanten.append(kante)
        kante.m_lKnotenOber = self

    def set_start_kante(self, kante: "PDlplKante") -> None:
        self.m_lStartKante = kante
        # Der Plan ist erster Vorgänger der Startkante
        if self not in kante.m_lVorgaenger:
            kante.m_lVorgaenger.insert(0, self)

    def set_end_kante(self, kante: "PDlplKante") -> None:
        self.m_lEndKante = kante
        # Der Plan ist erster Nachfolger der Endkante
        if self not in kante.m_lNachfolger:
            kante.m_lNachfolger.insert(0, self)

    # ------------------------------------------------------------------
    # Lifecycle: Innere Knoten/Kanten benachrichtigen
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        super().on_sim_begin(sim, deep=deep)
        self._beginn_list.clear()
        self._end_list.clear()
        if deep:
            for kn in self.m_lKnoten:
                kn.on_sim_begin(sim, deep=True)
            for ka in self.m_lKanten:
                ka.on_sim_begin(sim, deep=True)

    def on_period_begin(self, deep: bool = True) -> None:
        super().on_period_begin(deep=deep)
        if deep:
            for kn in self.m_lKnoten:
                kn.on_period_begin(deep=True)
            for ka in self.m_lKanten:
                ka.on_period_begin(deep=True)

    def on_period_end(self, deep: bool = True) -> None:
        super().on_period_end(deep=deep)
        if deep:
            for kn in self.m_lKnoten:
                kn.on_period_end(deep=True)
            for ka in self.m_lKanten:
                ka.on_period_end(deep=True)

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        if deep:
            for kn in self.m_lKnoten:
                kn.on_rec_init(deep=True)
            for ka in self.m_lKanten:
                ka.on_rec_init(deep=True)

    # ------------------------------------------------------------------
    # Sim-Methoden (PDurchlaufplan.cpp:40-125)
    # ------------------------------------------------------------------

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """Top-Level: ruft dlpl_ausloesen via proz_ober.m_oTrigger.

        C++ (PDurchlaufplan.cpp:40-43):
            DlplAusloesen(oProzOber->m_oTrigger, oProzOber, oEnt);
        """
        assert proz_ober is not None and proz_ober.m_oTrigger is not None
        self.dlpl_ausloesen(proz_ober.m_oTrigger, proz_ober, ent)

    def dlpl_ausloesen(
        self,
        trigger: "PtTrigger",
        proz_ober: "PtProzess | None",
        ent: Any,
    ) -> None:
        """Erzeugt PtProzDurchlaufplan und startet bearbeit_beginnen.

        Wörtlich aus PDurchlaufplan.cpp:52-81.
        """
        proz = PtProzDurchlaufplan(self.p_simulator)
        proz.m_oKnoten = self
        proz.m_oTrigger = trigger
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent
        proz.m_iErzeugungzeitpunkt = self.p_simulator.evt_curr_time()

        if proz_ober is not None:
            proz.m_sName = f"{proz_ober.m_sName}|{self.m_sName}"
        else:
            proz.m_sName = self.m_sName

        self.add_prozess(proz)
        self.m_iPtkProzessCount += 1

        trigger.on_prz_created(proz)

        if not self.bearbeit_beginnen(proz):
            self.p_simulator.m_oWarteSchl.add_tail(proz)

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """Geerbte Basis-Logik, dann an Startkante weiterleiten.

        C++ (PDurchlaufplan.cpp:84-96).
        """
        if not super().bearbeit_beginnen(proz):
            return False

        assert self.m_lStartKante is not None, (
            f"PDurchlaufplan {self.m_sName!r} ohne Startkante"
        )
        self.m_lStartKante.proz_weitergeben(proz, proz.m_oEntitaet)
        return True

    def on_proz_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """C++ wirft hier OException (PDurchlaufplan.cpp:46-49) — der Plan
        bekommt nicht on_proz_beendet, sondern on_dlpl_beendet.
        """
        raise RuntimeError(
            "PDurchlaufplan.on_proz_beendet wurde gerufen — "
            "stattdessen muss on_dlpl_beendet von einer Kante kommen"
        )

    def on_dlpl_beendet(self, proz_this: "PtProzess", ent: Any) -> None:
        """Plan-Lauf beendet. Drei Ausgangs-Pfade (PDurchlaufplan.cpp:99-125).

        1. m_lKanteAus != None → Sub-Plan, an Kante weitergeben
        2. m_lKnotenOber != None → Sub-Plan ohne Out-Kante → Oberknoten benachrichtigen
        3. Sonst → Top-Level-Plan → Trigger benachrichtigen
        """
        # Counter-Inkrement (geerbt von PDlplKnoten — V2-Erweiterung muss hier
        # explizit sein, weil wir on_proz_beendet überspringen)
        if self.is_ptk:
            self.m_iPtkAusloesungCount += 1
        self.remove_prozess(proz_this)

        self.p_simulator.bus.emit("plan.beendet_intern",
                                  plan=self.m_sName,
                                  proz_id=proz_this.m_sName)

        if self.m_lKanteAus is not None:
            self.m_lKanteAus.proz_weitergeben(proz_this, ent)
        elif self.m_lKnotenOber is not None:
            # Sub-Plan ohne ausgehende Kante → Oberknoten notifizieren
            ober = self.m_lKnotenOber
            assert proz_this.m_oProzOber is not None
            if hasattr(ober, "on_proz_sub_beendet"):
                ober.on_proz_sub_beendet(proz_this.m_oProzOber, ent)
        else:
            # Top-Level → Trigger benachrichtigen
            assert proz_this.m_oTrigger is not None
            proz_this.m_oTrigger.on_dlpl_beendet(proz_this)

        # PtProzDurchlaufplan beenden (analog C++ bearbeit_beenden)
        assert isinstance(proz_this, PtProzDurchlaufplan)
        proz_this.bearbeit_beenden()
