"""AAusloeser — OSimAZeit/AAusloeser.{odh,cpp} (Slice P5-M)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.ausloeser.base import PAusloeser

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class AAusloeser(PAusloeser):
    """C++-Äquivalent: `AAusloeser : $public PAusloeser`
    (OSimAZeit/AAusloeser.odh). P5-M Skelett."""

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
