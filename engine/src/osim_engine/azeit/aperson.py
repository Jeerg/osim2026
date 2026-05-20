"""APerson — OSimAZeit/APerson.{odh,cpp} (Slice P5-M).

Erweitert PPerson um Arbeitszeit-spezifische Attribute (Gruppe, Wünsche
zur Einsatzzeit). P5-M als Skelett — volle AZ-Logik in eigener Slice.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.beleg import PPerson

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class APerson(PPerson):
    """C++-Äquivalent: `APerson : $public PPerson` (OSimAZeit/APerson.odh)."""

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_oAGruppe: Any = None
        self.m_lAEinsatzWunsch: list[Any] = []
