"""AGruppe — OSimAZeit/AGruppe.{odh,cpp} (Slice P5-M).

Personal-Gruppe mit Mitgliedern + Aufgaben. P5-M Skelett.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class AGruppe(PSimObj):
    """C++-Äquivalent: `AGruppe : $public PSimObj` (OSimAZeit/AGruppe.odh)."""

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_lAPerson: list[Any] = []
        self.m_lAufgaben: list[Any] = []
