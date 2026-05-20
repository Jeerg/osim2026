"""PtProzRuecksprung — Prozess-Hülle für Rücksprung-Knoten.

Provenienz: `OSimPro/PtProzess.cpp:852-874`.

Hält den Wiederholungs-Counter `m_iWiederholungen`, der vom
`PDpKnRuecksprung.on_proz_sub_beendet` bei jedem Sub-Plan-Lauf erhöht
wird. C++-bearbeit_beginnen/beenden delegieren nur an die Basisklasse —
die Logik ist im Knoten.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PtProzRuecksprung(PtProzess):
    """C++-Äquivalent: `PtProzRuecksprung` (`PtProzess.odh` Sektion).

    `m_iWiederholungen` wird vom Rücksprung-Knoten in `on_proz_sub_beendet`
    inkrementiert (vor `RuecksprungEntscheiden`). Initial 0 — nach dem
    ersten Sub-Plan-Lauf 1, nach dem zweiten 2, etc.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iWiederholungen: int = 0
