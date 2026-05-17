"""OSimObj — Basisklasse aller Sim-Objekte.

Provenienz: `OSimBase/OSimObj.odh` + `OSimBase/OSimObj.cpp`.

Hält die Simulator-Backreferenz und bietet Delegate-Methoden für Event-Pool
und Period-Verwaltung. Tree-Lifecycle-Hooks (`on_sim_begin`, `on_period_begin`,
etc.) werden von Subklassen überschrieben.

In V1 ist die Listener-Mechanik pro Subklasse minimal (oft kein Listener-
Container). Subklassen, die Listener brauchen, halten eine eigene
`_listeners`-Liste (siehe SUPPLEMENT § 6.1).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from osim_engine.core.event import OMetaEvent
    from osim_engine.core.event_pool import EHDL
    from osim_engine.core.simulator import OSimulator


class OSimObj:
    """Basis aller Sim-Objekte. C++-Äquivalent: `OSimObj` (`OSimObj.odh`)."""

    def __init__(self, simulator: "OSimulator | None") -> None:
        # m_simulator = Backref. Bei Simulator selbst: self (siehe OSimulator.__init__)
        self.m_simulator: "OSimulator | None" = simulator

    # ------------------------------------------------------------------
    # Event-Verwaltung — Delegates an Simulator
    # ------------------------------------------------------------------

    def evt_insert(
        self,
        event: "OMetaEvent",
        obj: "OSimObj",
        ezeit: int,
        para: Any = None,
    ) -> "EHDL":
        assert self.m_simulator is not None, "Sim-Objekt ohne Simulator-Backref"
        return self.m_simulator.evt_insert(event, obj, ezeit, para)

    def evt_delete(self, hdl: "EHDL") -> None:
        assert self.m_simulator is not None
        self.m_simulator.evt_delete(hdl)

    def evt_curr_time(self) -> int:
        assert self.m_simulator is not None
        return self.m_simulator.evt_curr_time()

    def evt_time(self, hdl: "EHDL") -> int:
        assert self.m_simulator is not None
        return self.m_simulator.evt_time(hdl)

    # ------------------------------------------------------------------
    # Period — Delegates
    # ------------------------------------------------------------------

    @property
    def period_num(self) -> int:
        assert self.m_simulator is not None
        return self.m_simulator.m_periodNum

    @property
    def period_begin(self) -> int:
        assert self.m_simulator is not None
        return self.m_simulator.m_periodBegin

    @property
    def period_end(self) -> int:
        assert self.m_simulator is not None
        return self.m_simulator.period_end()

    @property
    def is_ptk(self) -> bool:
        assert self.m_simulator is not None
        return self.m_simulator.m_isPtk

    @property
    def is_simulating(self) -> bool:
        assert self.m_simulator is not None
        return self.m_simulator.is_simulating()

    # ------------------------------------------------------------------
    # Tree-Lifecycle-Hooks — Default: no-op
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim: "OSimulator", deep: bool = True) -> None: ...
    def on_sim_reset(self, deep: bool = True) -> None: ...
    def on_period_begin(self, deep: bool = True) -> None: ...
    def on_period_end(self, deep: bool = True) -> None: ...
    def on_period_break(self, deep: bool = True) -> None: ...
    def on_rec_init(self, deep: bool = True) -> None: ...
    def on_rec_start(self, time: int, deep: bool = True) -> None: ...
    def on_rec_stop(self, time: int, deep: bool = True) -> None: ...
