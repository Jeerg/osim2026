"""PRessource — gemeinsame Basis aller Ressourcen.

Provenienz: `OSimPro/PRessource.odh` + `OSimPro/PRessource.cpp`.

Trägt nur Name + Hilfs-Liste konnektierter Knoten (`m_lTmpConKnoten`). Die
Knoten-Lookups (`IsRessKonnektiertMit`, `IsRessBlockedMit`) werden in V4 nicht
benötigt — sie kommen erst in Phase 3 / Phase 5 (Entscheider) zum Tragen und
bleiben hier als 1:1-Übersetzbarer Stub.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.simulator import PSimulator


class PRessource(PSimObj):
    """C++-Äquivalent: `PRessource` (`PRessource.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_sName wird in PSimObj initialisiert.
        # m_lTmpConKnoten: Cache konnektierter Knoten — wird in V4 nicht befüllt,
        # da m_bTmpConKnotenList default False ist.
        self.m_lTmpConKnoten: list["PDlplKnoten"] = []

    # ------------------------------------------------------------------
    # Lifecycle — C++ PRessource::OnSimBegin / OnSimReset
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:  # noqa: ARG002
        if getattr(self.p_simulator, "m_bTmpConKnotenList", False):
            self.m_lTmpConKnoten.clear()

    def on_sim_reset(self, deep: bool = True) -> None:  # noqa: ARG002
        self.m_lTmpConKnoten.clear()
