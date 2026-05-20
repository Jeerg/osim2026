"""ACOAnt — Ant-Colony-Optimization-Auslöser.

Provenienz: `OSimPro/PAusloeser.{odh:253-300, cpp}`.

ACO-Auslöser für Ant-Colony-Optimization-Pfade. Ähnlich PAslEinzel mit
einem Trigger-Event, aber mit zusätzlichen Sub-Plan-Auswahl-Methoden
für die ACO-Hierarchie (Reihenfolge / Split / Logik).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.pps.ausloeser.base import PAusloeser
from osim_engine.pps.trigger import PtTrigger

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class EvtAntTriggern(OMetaEvent):
    """$event(1) — ACO-Trigger-Slot. PAusloeser.odh:267."""
    m_subTime = 1
    m_name = "EvtAntTriggern"

    def execute(self, obj: "ACOAnt", para: Any = None) -> None:
        obj.evt_ant_triggern()


_EVT_ANT_TRIGGERN = EvtAntTriggern()


class ACOAnt(PAusloeser):
    """C++-Äquivalent: `ACOAnt : $public PAusloeser`
    (`PAusloeser.odh:253-300`).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # ACO-spezifische Pläne-Liste
        self.m_lACODlpl: list[Any] = []
        # Attribute (PAusloeser.odh:261-264)
        self.m_iBeginTermin: int = 0
        self.m_iPlanZeit: int = 0
        self.m_iRealeAuftragsdauer: int = 0

    def on_period_begin(self, deep: bool = True) -> None:
        """C++: OnPeriodBegin (PAusloeser.odh:294-299).

        Schedule das EvtAntTriggern wenn m_iBeginTermin in der Periode liegt.
        """
        super().on_period_begin(deep=deep)
        sim = self.m_simulator
        if sim is None:
            return
        begin = sim.m_periodBegin
        end = begin + sim.m_periodLen
        if begin <= self.m_iBeginTermin < end:
            sim.evt_insert(_EVT_ANT_TRIGGERN, self, self.m_iBeginTermin)

    def evt_ant_triggern(self) -> None:
        """Wird vom EvtAntTriggern-Event gerufen. Skelett — volle ACO-Logik
        (Reihenfolge/Split/Logik-Dispatch) wartet auf P5-K-Klassen."""
        sim = self.p_simulator
        if getattr(sim, "m_bIsProduktionEnde", False):
            return
        trigger = PtTrigger(sim, ausloeser=self)
        trigger.m_iTrigNum = self.m_iTrigCounter
        trigger.m_iBeginTermin = self.m_iBeginTermin
        trigger.m_iAuslZeitpunkt = sim.evt_curr_time()
        trigger.m_sName = f"{self.m_sName}.aco_trig{trigger.m_iTrigNum}"
        self.dlpl_ausloesen(trigger)

    # ------------------------------------------------------------------
    # KPIs (PAusloeser.odh:270-274)
    # ------------------------------------------------------------------

    def get_knz_planzeitgrad(self) -> float:
        """C++: GetKnzPlanzeitgrad — Verhältnis Planzeit / DLZ."""
        dlz = self.m_dPtkDurchlaufzeit
        if dlz == 0.0 or self.m_iPlanZeit == 0:
            return 0.0
        return self.m_iPlanZeit / dlz

    def get_knz_guetegrad(self) -> float:
        """C++: GetKnzGuetegrad — Verhältnis reale Dauer / DLZ."""
        dlz = self.m_dPtkDurchlaufzeit
        if dlz == 0.0 or self.m_iRealeAuftragsdauer == 0:
            return 0.0
        return self.m_iRealeAuftragsdauer / dlz

    def get_knz_prg_auftragsanzahl(self) -> int:
        return 1

    # ------------------------------------------------------------------
    # ACO-Entscheidungsmethoden (Skelette — P5-K-Integration)
    # ------------------------------------------------------------------

    def on_aco_weg_whl_reihenfolge(self, proz: Any, trigger: Any) -> None:
        """C++: OnACOWegWhlReihenfolge — P5-K Skelett."""

    def on_aco_weg_whl_split(self, proz: Any, trigger: Any) -> None:
        """C++: OnACOWegWhlSplit — P5-K Skelett."""

    def on_aco_weg_whl_logik(self, proz: Any, trigger: Any) -> Any:
        """C++: OnACOWegWhlLogik — wählt Sub-Plan (P5-K Skelett)."""
        return None

    def on_aco_weg_ein_logik(self, trigger: Any) -> Any:
        """C++: OnACOWegEinLogik — P5-K Skelett."""
        return None

    def aco_whl_reihenfolge(self, beleg: Any, proz: Any, trigger: Any) -> None:
        """C++: ACOWhlReihenfolge — P5-K Skelett."""

    def aco_prioregel_koz(self, beleg: Any, proz: Any, trigger: Any) -> None:
        """C++: ACOPrioregelKOZ — Prioritäts-Regel KOZ (Skelett)."""
