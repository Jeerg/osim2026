"""ASimulator — OSimAZeit/ASimulator.{odh,cpp} (Slice P5-M).

Top-Level-Simulator-Variante mit arbeitszeit-orientierten Erweiterungen.
Im OTX (`test.otx`, `Embb-AslFj.otx`, …) ist ASimulator das Root-Objekt;
PSimulator wird per Class-Aliasing geladen (Phase-1-Pragma).

P5-M: eigenständige ASimulator-Klasse als PSimulator-Subklasse mit AZ-
spezifischen Attributen + Listen-Slots (AGruppen, AAusloeser, etc.). Die
Loader-Integration bleibt vorerst über den bestehenden ASimulator→PSimulator-
Alias; spätere Slice kann den Loader auf echte ASimulator-Instanzen umstellen.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.simulator import PSimulator

if TYPE_CHECKING:
    pass


class ASimulator(PSimulator):
    """C++-Äquivalent: `ASimulator : $public PSimulator`
    (`OSimAZeit/ASimulator.odh`)."""

    def __init__(self) -> None:
        super().__init__()
        # AZ-spezifische Listen
        self.m_lAGruppen: list[Any] = []
        self.m_lAAusloeser: list[Any] = []
        self.m_lAPerson: list[Any] = []
        self.m_lAEinsatzzeitWunsch: list[Any] = []
        # AZ-Konfiguration
        self.m_bAZModus: bool = False
