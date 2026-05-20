"""AEinsatzzeitWunsch — OSimAZeit (Slice P5-M Skelett)."""

from __future__ import annotations

from osim_engine.pps.sim_object import PSimObj


class AEinsatzzeitWunsch(PSimObj):
    """C++-Äquivalent: `AEinsatzzeitWunsch : $public PSimObj`."""

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_iWunschBeginn: int = 0
        self.m_iWunschEnde: int = 0
