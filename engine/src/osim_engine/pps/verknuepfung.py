"""PtVerknuepfung — Join-Counter für Kanten mit mehreren Vorgängern.

Provenienz: `OSimPro/PtVerknuepfung.odh` + `OSimPro/PtVerknuepfung.cpp`.

Eine Verknüpfung wird an einer Kante mit >1 Vorgängern angelegt. Sie zählt
herunter, bis alle Vorgänger ihren Prozess weitergegeben haben.

Algorithmus (PDlplKante.cpp:142-172):
    - Erster Prozess kommt → keine Verknüpfung existiert
        → neue mit m_iAnzProz = count-1 anlegen, return
    - Zweiter+ Prozess kommt → Verknüpfung existiert
        → m_iAnzProz-- (in PtVerknuepfung.cpp), bei 0 → True (alle da)
    - Bei True → Verknüpfung entfernen, am Ober-Prozess weiter
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PtVerknuepfung(PSimObj):
    """C++-Äquivalent: `PtVerknuepfung` (`PtVerknuepfung.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oKante: "PDlplKante | None" = None
        self.m_iAnzProz: int = 0  # verbleibende Vorgänger

    def proz_weitergeben(self, proz: "PtProzess") -> bool:
        """Dekrementiert m_iAnzProz. Liefert True wenn alle Vorgänger da sind.

        Wörtlich aus PtVerknuepfung.cpp:22-32.
        """
        if self.m_iAnzProz <= 0:
            raise RuntimeError(
                "PtVerknuepfung.proz_weitergeben: m_iAnzProz <= 0 — "
                "Verknüpfung wurde zu oft dekrementiert"
            )
        self.m_iAnzProz -= 1
        return self.m_iAnzProz == 0
