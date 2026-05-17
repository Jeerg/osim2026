"""PSimObj — PPS-Sim-Object-Basis.

Provenienz: `OSimPro/PSimObj.odh` + `OSimPro/PSimObj.cpp`.

Erweitert `OSimObj` um Zeit-Helpers (Sekunden ↔ Minuten/Stunden/Tage),
Tracing (in V1 als no-op) und SimInfo-Liste (in V1 als no-op).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.sim_object import OSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PSimObj(OSimObj):
    """C++-Äquivalent: `PSimObj` (`PSimObj.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_sName ist gemeinsamer Identifier für viele PPS-Objekte; hier als Default
        self.m_sName: str = ""

    @property
    def p_simulator(self) -> "PSimulator":
        """Typed Zugriff auf den PSimulator (Convenience)."""
        from osim_engine.pps.simulator import PSimulator  # lokal um Zirkular zu vermeiden
        assert isinstance(self.m_simulator, PSimulator)
        return self.m_simulator

    # ------------------------------------------------------------------
    # Zeit-Helpers — PSimObj.odh
    # ------------------------------------------------------------------

    @staticmethod
    def sek_2_szeit(sekunden: int) -> int:
        return sekunden

    @staticmethod
    def minute_2_szeit(minuten: int) -> int:
        return minuten * 60

    @staticmethod
    def stunde_2_szeit(stunden: int) -> int:
        return stunden * 3600

    @staticmethod
    def tag_2_szeit(tage: int) -> int:
        return tage * 86400

    @staticmethod
    def szeit_2_minuten(szeit: int) -> float:
        return szeit / 60.0

    @staticmethod
    def szeit_2_stunden(szeit: int) -> float:
        return szeit / 3600.0

    @staticmethod
    def szeit_2_tage(szeit: int) -> float:
        return szeit / 86400.0
