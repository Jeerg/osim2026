"""PtProzAlternativ — Prozess-Hülle für Alternativ-Knoten.

Provenienz: `OSimPro/PtProzess.odh:309-322` + `OSimPro/PtProzess.cpp:877-900`.

Hält neben den Basis-Feldern die Referenz `m_oAlternative` auf die vom
Alternativ-Knoten ausgewählte Alternative (PAlternative-Subtyp). Diese
wird in `PDpKnAlternativ.proz_weitergeben` gesetzt — vor dem Aufruf von
`bearbeit_beginnen`. C++-`bearbeit_beginnen/beenden` delegieren nur an
die Basisklasse — die Routing-Logik (Sub-Plan-Weitergabe) liegt im
Knoten.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.knoten.alternativ import PAlternative
    from osim_engine.pps.simulator import PSimulator


class PtProzAlternativ(PtProzess):
    """C++-Äquivalent: `PtProzAlternativ` (`PtProzess.odh:312`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oAlternative: "PAlternative | None" = None
