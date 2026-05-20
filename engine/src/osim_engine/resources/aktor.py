"""PAktor — Mixin-Basis für aktive Ressourcen.

Provenienz: `OSimPro/PAktor.odh` + `OSimPro/PAktor.cpp`.

C++ ist `PAktor` eine reine abstrakte Klasse (`PSimObjVirtual`) mit virtuellen
Methoden für `BearbeitBeginnen`, `ProzWaehlen`, `OnAktBeginn/Ende/Unterbr`.
`PRessBeleg` erbt von `PRessource` UND `PAktor` (Mehrfachvererbung). In V4
nutzen wir den aktiven Pfad nicht — die Methoden sind hier Stubs, die in
Phase 3 / V8 mit Inhalt gefüllt werden.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PAktor(PSimObj):
    """C++-Äquivalent: `PAktor` (`PAktor.odh`). Abstract.

    In Python kein `abstractmethod`, weil `PRessBeleg` die Methoden in V4
    nur als no-op-Stubs bereitstellt — sie werden im passiven Belegungspfad
    nie gerufen. Spätere Phasen (PEntscheider, ACOAnt) machen sie scharf.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oSpeiProz: Any = None  # PSpeicherProz — V5

    # ------------------------------------------------------------------
    # Aktiv-Pfad-Stubs — werden in Phase 3 / V8 implementiert
    # ------------------------------------------------------------------

    def bearbeit_beginnen_aktiv(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        return False

    def proz_waehlen(self, proz: "PtProzess | None" = None,
                     speicher: Any = None) -> "PtProzess | None":  # noqa: ARG002
        return None

    def on_proz_eingefuegt(self, speicher: Any, proz: "PtProzess") -> None: ...

    def on_akt_beginn(self, proz: "PtProzess") -> None: ...

    def on_akt_ende(self, proz: "PtProzess") -> None: ...

    def on_akt_unterbr(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        return False
