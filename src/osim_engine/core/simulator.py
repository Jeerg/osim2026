"""OSimulator — Top-Level-Simulator mit Event-Loop und Period-Management.

Provenienz: `OSimBase/OSimulator.odh` (310 Z.) + `OSimBase/OSimulator.cpp`
(1263 Z.). Siehe `docs/CONTEXT-P1-osimbase.md` Sektion "OSimulator".

Verantwortlichkeiten:
    - Event-Pool (heapq, aus core/event_pool.py)
    - Period-Mechanik: m_periodNum, m_periodBegin, m_periodLen (Default 86400 s)
    - Status-FSM: ssBegin → ssPeriod → ssRunning → ssPeriod | ssSuspended
    - Main-Loop: `start()` mit Re-Entry über `m_simStatus`
    - Ptk-Switching: aktiviert Protokoll wenn Event-Zeit in [m_ptkBegin, m_ptkEnd]
    - Listener-Chain: list[OListenerSimulator]
    - Tree-Lifecycle: in V1 explizit via on_*-Methoden auf Children
"""

from __future__ import annotations

import math
from enum import IntEnum
from typing import Any

from osim_engine.core.event import MAX_EVENT_TIME, Event, OMetaEvent
from osim_engine.core.event_pool import EHDL, EventPool
from osim_engine.core.listener import OListenerSimulator
from osim_engine.core.sim_object import OSimObj
from osim_engine.core import distribution as dist_module
from osim_engine.observability.bus import EventBus


class OSimStatus(IntEnum):
    """OSimBase/OSimulator.odh::OSimStatus."""
    BEGIN = 1       # vor Simulationsbeginn (Initial)
    PERIOD = 2      # vor Periodenbeginn
    RUNNING = 3     # während Periode, Simulation läuft
    SUSPENDED = 4   # während Periode, suspendiert


STD_KEIM: float = 1776496601.0


class OSimulator(OSimObj):
    """Top-Level-Simulator. C++-Äquivalent: `OSimulator` (`OSimulator.odh`)."""

    def __init__(self) -> None:
        # Self-Reference: der Simulator ist sein eigener m_simulator
        super().__init__(simulator=None)
        self.m_simulator = self  # nach super().__init__ erlaubt

        # Defaults aus OSimulator.odh
        self.m_name: str = "Simulationsmodell"
        self.m_sStartDate: str = "01.12.2003"
        self.m_sEndDate: str = "31.12.2003"
        self.m_periodNum: int = 0
        self.m_periodBegin: int = 0           # Sekunden seit Sim-Start
        self.m_periodLen: int = 86400         # 1 Tag
        self.m_ptkBegin: int = 0
        self.m_ptkEnd: int = 0
        self.m_ereigBlkSize: int = 1000
        self.m_simStatus: OSimStatus = OSimStatus.BEGIN
        self.m_isPtk: bool = False
        self.m_keim: float = STD_KEIM         # Initial-Seed (= STD_KEIM)
        self.m_aktKeim: float = 0.0           # aktueller LCG-Keim

        # Event-Pool und Listener
        self._evt_pool: EventPool = EventPool()
        self._sim_listeners: list[OListenerSimulator] = []

        # Children, deren Lifecycle der Simulator orchestriert.
        # In V1: explizite Liste, von Subklassen (PSimulator) ergänzt.
        self._children: list[OSimObj] = []

        # Aktuelles Meta-Event (für EventBus-sub-time-Lookup)
        self.current_meta_event: OMetaEvent | None = None

        # Observability — EventBus mit Self-Reference. Default: keine Subscriber.
        self.bus: EventBus = EventBus(self)

    # ------------------------------------------------------------------
    # Lifecycle (override-points)
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim: "OSimulator | None" = None, deep: bool = True) -> None:
        """Vor Simulationsbeginn aufgerufen. OSimulator.cpp `OnSimBegin`."""
        self.m_periodNum = 0
        self.m_periodBegin = 0

        # LCG-Keim umschalten: externer Keim ist m_aktKeim (mutable list-Ref)
        # Wir nutzen eine 1-Element-Liste als mutable Container
        self._akt_keim_ref: list[float] = [self.m_keim]
        self.m_aktKeim = self.m_keim
        dist_module.s_verteil.externer_keim(self._akt_keim_ref)

        self._evt_pool.init(self.m_ereigBlkSize)

        # Children-Lifecycle (tiefe Übertragung)
        if deep:
            for child in self._children:
                child.on_sim_begin(self, deep=True)

        # Listener notifizieren
        for listener in list(self._sim_listeners):
            listener.on_sim_begin(self.m_periodBegin)

        # EventBus-Topic
        self.bus.emit("sim.begin", begin_time=self.m_periodBegin)

    def on_period_begin(self, deep: bool = True) -> None:
        """OSimulator.cpp `OnPeriodBegin`."""
        if self.is_ptk_func():
            self.on_rec_start(self.m_periodBegin, deep)

        if deep:
            for child in self._children:
                child.on_period_begin(deep=True)

        for listener in list(self._sim_listeners):
            listener.on_period_begin(self.m_periodBegin, self.m_periodBegin + self.m_periodLen)

        self.bus.emit("sim.period.begin",
                      period_num=self.m_periodNum,
                      begin_time=self.m_periodBegin)

    def on_period_end(self, deep: bool = True) -> None:
        """OSimulator.cpp `OnPeriodEnd`. Advanced periodNum + periodBegin."""
        # Snapshot vor Advance für EventBus-Event
        period_num_finished = self.m_periodNum
        end_time = self.m_periodBegin + self.m_periodLen

        self.m_periodNum += 1
        self.m_periodBegin += self.m_periodLen

        if self.is_ptk_func():
            self.on_rec_stop(self.m_periodBegin, deep)

        if deep:
            for child in self._children:
                child.on_period_end(deep=True)

        for listener in list(self._sim_listeners):
            listener.on_period_end(self.m_periodBegin)

        self.bus.emit("sim.period.end",
                      period_num=period_num_finished,
                      end_time=end_time)

    def on_period_break(self, deep: bool = True) -> None:
        """OSimulator.cpp `OnPeriodBreak`. Partial-period bei Suspend."""
        self.m_periodNum += 1
        # m_periodBegin += EvtCurrTime() - m_periodBegin  ≡ m_periodBegin = EvtCurrTime()
        self.m_periodBegin = self.evt_curr_time()

        if self.is_ptk_func():
            self.on_rec_stop(self.m_periodBegin, deep)

        if deep:
            for child in self._children:
                child.on_period_break(deep=True)

        for listener in list(self._sim_listeners):
            listener.on_period_break(self.m_periodBegin)

    def on_sim_reset(self, deep: bool = True) -> None:
        """OSimulator.cpp `OnSimReset`."""
        self.m_periodNum = 0
        self.m_periodBegin = 0

        if deep:
            for child in self._children:
                child.on_sim_reset(deep=True)

        for listener in list(self._sim_listeners):
            listener.on_period_reset()

    def on_rec_init(self, deep: bool = True) -> None:
        """Hook: Protokoll-Init. In OSimulator no-op, in PSimulator überschrieben."""
        if deep:
            for child in self._children:
                child.on_rec_init(deep=True)

    def on_rec_start(self, time: int, deep: bool = True) -> None:
        if deep:
            for child in self._children:
                child.on_rec_start(time, deep=True)

    def on_rec_stop(self, time: int, deep: bool = True) -> None:
        if deep:
            for child in self._children:
                child.on_rec_stop(time, deep=True)

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Main-Loop, re-entrant über `m_simStatus`. OSimulator.cpp `Start()`."""
        if self.m_simStatus == OSimStatus.BEGIN:
            self.on_sim_begin(self, deep=True)
            self.m_isPtk = False
            self.m_simStatus = OSimStatus.PERIOD

        if self.m_simStatus == OSimStatus.PERIOD:
            self.on_period_begin(deep=True)

        self.m_simStatus = OSimStatus.RUNNING

        self._on_sim_ereig()
        while self.evt_do_next():
            if self.m_simStatus == OSimStatus.SUSPENDED:
                self.evt_delete_curr()
                return
            self._on_sim_ereig()
            self.evt_delete_curr()

        self.m_simStatus = OSimStatus.PERIOD
        self.on_period_end(deep=True)

    def suspend(self) -> None:
        """OSimulator.cpp `Suspend`."""
        self.m_simStatus = OSimStatus.SUSPENDED
        self.on_period_break(deep=True)

    def reset(self) -> None:
        """OSimulator.cpp `Reset`."""
        self.m_simStatus = OSimStatus.BEGIN
        self.on_sim_reset(deep=True)

    # ------------------------------------------------------------------
    # Event-Verwaltung
    # ------------------------------------------------------------------

    def evt_insert(
        self,
        event: OMetaEvent,
        obj: OSimObj,
        ezeit: int,
        para: Any = None,
    ) -> EHDL:
        """Insert mit Vertrag: ezeit in [period_begin, MAX_EVENT_TIME]."""
        if ezeit < self.m_periodBegin or ezeit > MAX_EVENT_TIME:
            raise ValueError(
                f"Event-Zeit {ezeit} außerhalb [{self.m_periodBegin}, {MAX_EVENT_TIME}]"
            )
        return self._evt_pool.insert(event, obj, ezeit, para)

    def evt_delete(self, hdl: EHDL) -> None:
        self._evt_pool.delete(hdl)

    def evt_delete_curr(self) -> None:
        self._evt_pool.delete_curr()

    def evt_do_next(self) -> bool:
        """Pop + Execute. OSimulator.cpp `EvtDoNext`.

        Liefert False, wenn Pool für die Periode leer ist.
        Ptk-Switching basierend auf Event-Zeit. Dann Event ausführen.
        """
        if self._evt_pool.is_empty(self.period_end()):
            return False

        next_event = self._evt_pool.remove_first()
        if next_event is None:
            return False

        # Ptk-Switching — OSimulator.cpp::EvtDoNext Z. 568-590
        if self.m_isPtk:
            if self.m_ptkEnd != 0 and next_event.m_time >= self.m_ptkEnd:
                self.on_rec_stop(self.m_ptkEnd, deep=True)
                self.m_isPtk = False
        else:
            if next_event.m_time >= self.m_ptkBegin:
                if next_event.m_time < self.m_ptkEnd or self.m_ptkEnd == 0:
                    self.m_isPtk = True
                    self.on_rec_init(deep=True)
                    self.on_rec_start(self.m_ptkBegin, deep=True)

        # Execute
        self.current_meta_event = next_event.m_meta
        next_event.execute()
        return True

    def evt_curr_time(self) -> int:
        """Liefert die Zeit des aktuell ausgeführten Events; sonst period_begin."""
        if not self._evt_pool.curr_exists():
            return self.m_periodBegin
        curr = self._evt_pool.get_curr()
        assert curr is not None
        return curr.m_time

    def evt_time(self, hdl: EHDL) -> int:
        evt = self._evt_pool.hdl_to_event(hdl)
        if evt is None:
            raise KeyError(f"Event-Handle {hdl} nicht im Pool")
        return evt.m_time

    def evt_get_sum(self) -> int:
        return self._evt_pool.m_sumEvent

    def evt_get_max(self) -> int:
        return self._evt_pool.m_maxEvent

    def evt_get_cur(self) -> int:
        return self._evt_pool.m_curEvent

    # ------------------------------------------------------------------
    # Period-/Ptk-Helpers
    # ------------------------------------------------------------------

    def period_end(self) -> int:
        """C++: `Begin + Len - 1` (inklusive obere Grenze)."""
        return self.m_periodBegin + self.m_periodLen - 1

    def is_ptk_func(self) -> bool:
        return self.m_isPtk

    def ptk_period(self) -> int:
        """OSimulator.cpp `PtkPeriod`."""
        if self.m_periodBegin <= self.m_ptkBegin:
            return 0
        if self.m_ptkEnd != 0 and self.m_periodBegin >= self.m_ptkEnd:
            return self.m_ptkEnd - self.m_ptkBegin
        return self.m_periodBegin - self.m_ptkBegin

    def is_simulating(self) -> bool:
        return self.m_simStatus in (OSimStatus.RUNNING, OSimStatus.SUSPENDED)

    # ------------------------------------------------------------------
    # PtkIntervall — Protokoll-Intervall-Helpers
    # ------------------------------------------------------------------
    # C++: OSimulator::xPtkIntervallBegin/End (OSimulator.cpp:830-861)
    #
    # Pattern: Über `(ptk, tmp)` wird die Brutto-Dauer eines Zeitintervalls
    # in `ptk` akkumuliert. Bei Begin wird `tmp += gfakt` und `ptk -= gfakt*t`,
    # bei End `ptk += gfakt*t` und `tmp -= gfakt`. Nach End: ptk += (t_end -
    # t_begin)*gfakt, tmp = 0.
    #
    # Wir nehmen Attribut-Namen + Objekt, weil Python keine echten Refs hat.

    def ptk_intervall_begin(
        self, obj: object, ptk_attr: str, tmp_attr: str,
        gfakt: float, ptime: int,
    ) -> None:
        """C++: `xPtkIntervallBegin(double &ptk, double &tmp, gfakt, ptime)`."""
        setattr(obj, tmp_attr, getattr(obj, tmp_attr) + gfakt)
        if self.m_isPtk:
            setattr(obj, ptk_attr, getattr(obj, ptk_attr) - gfakt * ptime)

    def ptk_intervall_end(
        self, obj: object, ptk_attr: str, tmp_attr: str,
        gfakt: float, ptime: int,
    ) -> None:
        """C++: `xPtkIntervallEnd(double &ptk, double &tmp, gfakt, ptime)`.

        Sonderfall (C++:854-855): wenn `m_ptkBegin > 0` und `tmp <= 0` und
        `gfakt > 0`, dann no-op (Protokoll begann später als die Simulation).
        """
        tmp_val = getattr(obj, tmp_attr)
        if self.m_ptkBegin > 0 and tmp_val <= 0.0 and gfakt > 0:
            return
        if self.m_isPtk:
            setattr(obj, ptk_attr, getattr(obj, ptk_attr) + gfakt * ptime)
        setattr(obj, tmp_attr, tmp_val - gfakt)

    # ------------------------------------------------------------------
    # Listener-Verwaltung
    # ------------------------------------------------------------------

    def _on_sim_ereig(self) -> None:
        """Hook nach jedem Event-Pop. OSimulator.cpp `OSimEreig` — in OSimulator
        leerer Default. PSimulator könnte hier z. B. EventBus-Topic emittieren.
        """
        for listener in list(self._sim_listeners):
            listener.on_sim_ereig()
