"""PAslEinzel — Einzel-Auslöser mit festem Begin-Termin.

Provenienz: `OSimPro/PAusloeser.odh` Sektion `PAslEinzel` +
zugehöriger `.cpp`-Code (PAusloeser.cpp).

Plant beim on_sim_begin ein `EvtAuslTriggern`-Event ($event(1)) für
`m_iBeginTermin`. Beim Trigger des Events erzeugt es einen PtTrigger
und ruft `dlpl_ausloesen`.
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
    """$event(1) — Auslöser-Trigger-Slot. Sub-Time 1."""
    m_subTime = 1
    m_name = "EvtAuslTriggern"

    def execute(self, obj: "PAslEinzel", para: Any = None) -> None:
        obj.evt_ausl_triggern()


_EVT_AUSL_TRIGGERN = EvtAuslTriggern()


class PAslEinzel(PAusloeser):
    """C++-Äquivalent: `PAslEinzel` (`PAusloeser.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iBeginTermin: int = 0          # Sekunde, ab wann auslösen
        self.m_iPlanZeit: int = 0             # Plan-Soll-Zeit (KPI, V2+)
        self.m_iRealeAuftragsdauer: int = 0   # Tatsächliche Dauer (V2+)

    def on_sim_begin(self, sim: "OSimulator", deep: bool = True) -> None:
        """Plant das eine EvtAuslTriggern-Event beim Sim-Begin."""
        super().on_sim_begin(sim, deep=deep)
        # Initial-Event planen
        self.p_simulator.evt_insert(
            _EVT_AUSL_TRIGGERN, self, self.m_iBeginTermin
        )

    def evt_ausl_triggern(self) -> None:
        """Wird vom EvtAuslTriggern-Event gerufen.

        Erzeugt einen PtTrigger und ruft dlpl_ausloesen. Einzel-Auslöser
        löst genau einmal aus (Re-Trigger via PAslMehrfachZaz in V2+).
        """
        sim = self.p_simulator

        trigger = PtTrigger(sim, ausloeser=self)
        trigger.m_iTrigNum = self.m_iTrigCounter
        trigger.m_iBeginTermin = self.m_iBeginTermin
        trigger.m_iAuslZeitpunkt = sim.evt_curr_time()
        trigger.m_sName = f"{self.m_sName}.trig{trigger.m_iTrigNum}"

        self.dlpl_ausloesen(trigger)
