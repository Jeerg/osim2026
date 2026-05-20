"""EPAslEntAufExtern — Auslöser-Entscheider (extern getriggerte Aufträge).

Provenienz: `OSimPro/PAusloeser.odh:305-334` + `OSimPro/PAusloeser.cpp:1766-1830`.

Wie `PAslEinzel`, plus zwei Erweiterungen:

1. `OnPeriodBegin` schedule das `EvtAuslTriggern`-Event NUR, wenn der
   `m_iBeginTermin` in die aktuelle Periode fällt — das ist anders als
   PAslEinzel, das das Event einmalig in `OnSimBegin` schedule.

2. Bei `m_bTaeglichWiederholen=True` plant `AuslTriggern` das nächste
   Event für den Folgetag — sofern `m_iBeginTermin <= 86400` (also eine
   Tageszeit).

In Bosch2_wechseln.otx kommen 4 Instanzen vor; sie ersetzen die
PAslEinzel-Auslöser für die "00051..."-Aufträge.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.pps.ausloeser.base import PAusloeser
from osim_engine.pps.trigger import PtTrigger

if TYPE_CHECKING:
    from osim_engine.core.simulator import OSimulator
    from osim_engine.pps.simulator import PSimulator


class EvtAuslTriggern(OMetaEvent):
    """$event(1) — Auslöser-Trigger-Slot. Sub-Time 1.

    Im C++-Original ist das Event in PAusloeser.odh:312 als `$event(1)`
    deklariert. Sub-Time 1 macht es sortier-prioritär gegenüber
    Auslöser-fremden Events bei gleichem `EvtCurrTime()`.
    """
    m_subTime = 1
    m_name = "EvtAuslTriggern"

    def execute(self, obj: "EPAslEntAufExtern", para: Any = None) -> None:
        obj.evt_ausl_triggern()


_EVT_AUSL_TRIGGERN = EvtAuslTriggern()


class EPAslEntAufExtern(PAusloeser):
    """C++-Äquivalent: `EPAslEntAufExtern` (`PAusloeser.odh:305-334`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iBeginTermin: int = 0
        self.m_bTaeglichWiederholen: bool = False

    def on_period_begin(self, deep: bool = True) -> None:
        """C++: `EPAslEntAufExtern::OnPeriodBegin` (PAusloeser.odh:322-327).

        Plant das Event genau dann, wenn `m_iBeginTermin` in dieser Periode
        liegt. Anders als PAslEinzel macht das KEIN `OnSimBegin` —
        Wiederholungen über mehrere Perioden funktionieren so transparent.
        """
        super().on_period_begin(deep=deep)
        sim = self.m_simulator
        if sim is None:
            return
        begin = sim.m_periodBegin
        end = begin + sim.m_periodLen
        if begin <= self.m_iBeginTermin < end:
            sim.evt_insert(_EVT_AUSL_TRIGGERN, self, self.m_iBeginTermin)

    def evt_ausl_triggern(self) -> None:
        """Wird vom EvtAuslTriggern-Event gerufen. C++: `EPAslEntAufExtern::AuslTriggern`
        (PAusloeser.cpp:1773-1805).

        Erzeugt einen PtTrigger, ruft `dlpl_ausloesen`. Bei
        `m_bTaeglichWiederholen=True` wird das nächste Event für den
        Folgetag geplant (sofern `m_iBeginTermin <= 86400`).
        """
        sim = self.p_simulator
        # Produktions-Ende-Guard wie im C++ (PAusloeser.cpp:1779)
        if getattr(sim, "m_bIsProduktionEnde", False):
            return

        # Trigger erzeugen — 1:1 zu PAusloeser.cpp:1782-1790
        trigger = PtTrigger(sim, ausloeser=self)
        trigger.m_iTrigNum = 0  # C++ setzt explizit 0 (PAusloeser.cpp:1783)
        trigger.m_iBeginTermin = self.m_iBeginTermin
        trigger.m_iAuslZeitpunkt = sim.evt_curr_time()
        trigger.m_sName = f"{self.m_sName}.trig{trigger.m_iTrigNum}"
        # Trigger in eigene Trigger-Liste eintragen (PAusloeser.cpp:1790)
        if trigger not in self.m_lTrigger:
            self.m_lTrigger.append(trigger)

        # Plan auslösen
        self.dlpl_ausloesen(trigger)

        # Nächsten Tag schedulen, falls gewünscht. PAusloeser.cpp:1796-1803.
        if self.m_bTaeglichWiederholen:
            if self.m_iBeginTermin > 86400:
                return
            akttag = sim.get_days_from_begin(sim.evt_curr_time())
            akttag += 1
            i_begin_time_next_day = self.tag_2_szeit(akttag) + self.m_iBeginTermin
            sim.evt_insert(_EVT_AUSL_TRIGGERN, self, i_begin_time_next_day)

    # ------------------------------------------------------------------
    # KPI-Methoden (PAusloeser.cpp:1811-1830)
    # ------------------------------------------------------------------

    def get_knz_prg_auftragsanzahl(self) -> int:
        """C++: `EPAslEntAufExtern::GetKnzPrgAuftragsanzahl`.

        Bei `m_bTaeglichWiederholen=True`: Anzahl der Tage seit Sim-Beginn.
        Sonst: 1.
        """
        if self.m_bTaeglichWiederholen:
            sim = self.p_simulator
            return sim.get_days_from_begin(sim.evt_curr_time())
        return 1
