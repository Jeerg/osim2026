"""PtTrigger — Transienter Trigger.

Provenienz: `OSimPro/PtTrigger.odh` + `OSimPro/PtTrigger.cpp`.

Repräsentiert eine **konkrete Auslösung** (= eine "Bestellung", die der
Auslöser anstößt). Hält eine Trigger-Nummer und die Verknüpfung zum
Auslöser. Wird beim DlplAusloesen vom Auslöser erzeugt und bei
OnDlplBeendet vom letzten Knoten beim Auslöser abgemeldet.

In V1 minimal: nur die Felder, die der End-to-End-Pfad benötigt
(m_iTrigNum, m_oAusloeser, on_prz_created/on_dlpl_beendet).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PtTrigger(PSimObj):
    """C++-Äquivalent: `PtTrigger` (`PtTrigger.odh`)."""

    def __init__(self, simulator: "PSimulator | None", ausloeser: "PAusloeser | None" = None) -> None:
        super().__init__(simulator)
        self.m_iTrigNum: int = 0
        self.m_oAusloeser: "PAusloeser | None" = ausloeser
        self.m_iBeginTermin: int = 0   # geplanter Begin-Termin (für Verspätungs-KPI)
        self.m_iAuslZeitpunkt: int = 0  # tatsächlicher Auslösezeitpunkt

    def on_prz_created(self, proz: "PtProzess") -> None:
        """Hook: ein neuer Prozess wurde im Plan erzeugt. V1: no-op.

        C++ würde hier eine Liste anhängen oder Begin-Termin tracken.
        """
        pass

    def on_dlpl_beendet(self, proz: "PtProzess") -> None:
        """Hook: der durch diesen Trigger ausgelöste Plan ist fertig.

        Reicht weiter an den Auslöser.
        """
        if self.m_oAusloeser is not None:
            self.m_oAusloeser.on_dlpl_beendet(self, proz)
