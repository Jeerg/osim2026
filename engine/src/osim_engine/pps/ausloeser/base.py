"""PAusloeser — Basis aller Auslöser (Bestellungs-Generatoren).

Provenienz: `OSimPro/PAusloeser.odh` + `OSimPro/PAusloeser.cpp`.

Ein Auslöser erzeugt Trigger zu definierten Zeitpunkten. Jeder Trigger
löst eine Ausführung des verknüpften Plans (oder in V1: direkt eines
Knotens) aus.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.parameter import PParameterLList
from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger


class PAusloeser(PSimObj):
    """C++-Äquivalent: `PAusloeser` (`PAusloeser.odh`).

    In V1 ist `m_lDlpl` typed als beliebiges Knoten/Plan-Objekt mit
    `proz_weitergeben(proz_ober, ent)`-Methode. In V2 wird das auf
    `PDurchlaufplan` typisiert.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Verknüpfungen
        self.m_lTrigger: list["PtTrigger"] = []
        # PParameterLList = list-Subklasse mit hole_parameter_int. P4-B
        # nutzt sie für PDpKnAlternativTypID; weitere PParameter-Subtypen
        # (Menge, Prioritaet, ...) folgen in P4-F.
        self.m_lParameter: PParameterLList = PParameterLList()
        self.m_lEntitaet: Any = None            # PEntitaet (P4)
        # V1: m_lDlpl ist direkter Knoten oder Plan — beides hat proz_weitergeben
        self.m_lDlpl: "PDlplKnoten | None" = None

        # Konfiguration
        self.m_iMaxWarteZeit: int = 0
        self.m_iSollDauer: int = 0

        # Protokoll-Counter
        self.m_iPtkBegAusloesungCount: int = 0
        self.m_iPtkAusloesungCount: int = 0
        self.m_iPtkNichtVerspaetetCount: int = 0
        self.m_dPtkDurchlaufzeit: float = 0.0
        self.m_dTmpDurchlaufzeit: float = 0.0
        self.m_iPtkAnzBearbRessBeleg: int = 0
        self.m_iTrigCounter: int = 0
        self.m_iAbgeCounter: int = 0

    def on_rec_init(self, deep: bool = True) -> None:
        self.m_iPtkBegAusloesungCount = 0
        self.m_iPtkAusloesungCount = 0
        self.m_iPtkNichtVerspaetetCount = 0
        self.m_dPtkDurchlaufzeit = 0.0
        self.m_dTmpDurchlaufzeit = 0.0
        self.m_iPtkAnzBearbRessBeleg = 0

    # ------------------------------------------------------------------
    # Sim-Methoden
    # ------------------------------------------------------------------

    def dlpl_ausloesen(self, trigger: "PtTrigger") -> None:
        """Stößt eine konkrete Plan-Auslösung an.

        C++: PAusloeser::DlplAusloesen (siehe CONTEXT-P1-pps-ausloeser.md).
        Reihenfolge:
            1. m_iPtkBegAusloesungCount++
            2. Trigger im m_lTrigger registrieren (für späteres on_dlpl_beendet)
            3. m_lDlpl.proz_weitergeben(None, self.m_lEntitaet)
        """
        self.m_iPtkBegAusloesungCount += 1
        self.m_iTrigCounter += 1
        if trigger not in self.m_lTrigger:
            self.m_lTrigger.append(trigger)

        assert self.m_lDlpl is not None, (
            f"PAusloeser {self.m_sName!r} hat keinen Plan/Knoten zugewiesen"
        )

        self.p_simulator.bus.emit("plan.ausloesen",
                                  ausloeser=self.m_sName,
                                  trigger_id=trigger.m_sName,
                                  target=self.m_lDlpl.m_sName)

        # Duck-Typing für V1/V2-Kompatibilität:
        # - V2: m_lDlpl ist PDurchlaufplan → hat dlpl_ausloesen(trigger, ober, ent)
        # - V1: m_lDlpl ist PDpKnKonstant direkt → hat nur proz_weitergeben
        if hasattr(self.m_lDlpl, "dlpl_ausloesen"):
            # V2-Pfad: echter Plan
            self.m_lDlpl.dlpl_ausloesen(trigger, None, self.m_lEntitaet)
        else:
            # V1-Pfad: direkter Knoten ohne Plan (für Kompatibilität)
            root_proz_ober = _RootProzOber(self.m_sName, trigger)
            self.m_lDlpl.proz_weitergeben(root_proz_ober, self.m_lEntitaet)

    def on_dlpl_beendet(self, trigger: "PtTrigger", proz: "PtProzess") -> None:
        """Wird vom Trigger gerufen, wenn der ausgelöste Plan/Knoten fertig ist."""
        self.m_iPtkAusloesungCount += 1
        self.m_iAbgeCounter += 1

        # Durchlaufzeit-Akkumulation (für KPI in V2)
        dauer = self.p_simulator.evt_curr_time() - trigger.m_iAuslZeitpunkt
        self.m_dPtkDurchlaufzeit += dauer

        self.p_simulator.bus.emit("plan.beendet",
                                  ausloeser=self.m_sName,
                                  trigger_id=trigger.m_sName,
                                  dauer=dauer)

        # Trigger aus m_lTrigger entfernen
        try:
            self.m_lTrigger.remove(trigger)
        except ValueError:
            pass


class _RootProzOber:
    """Hilfs-Objekt, das einen Wurzel-Prozess-Ober für die proz_weitergeben-Logik
    simuliert. In V1 ist es ein eigener Mini-Typ; in V2 wird das durch das
    `PtProzDurchlaufplan` ersetzt.
    """

    def __init__(self, name: str, trigger: "PtTrigger") -> None:
        self.m_sName: str = name
        self.m_oTrigger: "PtTrigger" = trigger
