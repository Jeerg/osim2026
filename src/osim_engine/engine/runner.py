"""Simulator-Hauptschleife (Jonsson Kap. 4.3 + 4.4.4).

Vier Lifecycle-Methoden tragen das ganze Verfahren:
  - PrzAusloesen      (Auslöser → Plan startet, PlanProcess wird erzeugt)
  - PrzWeitergeben    (Vorgänger → nächster Schritt)
  - OnPrzBeendet      (Prozess am Bearbeitungsende → Knoten)
  - OnDlpBeendet      (Endkante → Plan-Beendigung)

Plus Lifecycle-Hooks: OnSimBegin, OnPeriodBegin/End.

Phase 1: nur Konstant-Knoten und Verteilungs-Knoten, UND-Verknüpfung an
Kanten, einmalige Auslöser. Keine Ressourcen, keine Aktoren, keine Entities,
keine Hierarchie. Das alles kommt schrittweise dazu, ohne diesen Kern zu
verändern (Jonssons sukzessive Modellierung als Designprinzip).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from osim_engine.engine.event_heap import EventHeap
from osim_engine.engine.recorder import Recorder
from osim_engine.engine.transient import JoinCounter, PlanProcess, Process
from osim_engine.model.core import (
    Edge,
    NodeKonstant,
    NodeVerteilung,
    Plan,
    TriggerSingle,
)
from osim_engine.model.sim_model import SimModel


@dataclass
class _PlanIndex:
    """Index für O(1)-Lookup innerhalb eines Plans."""

    plan: Plan
    nodes_by_id: dict = field(default_factory=dict)
    edges_by_id: dict = field(default_factory=dict)
    out_edges_by_node: dict[str, list[str]] = field(default_factory=dict)
    in_edges_by_node: dict[str, list[str]] = field(default_factory=dict)

    @classmethod
    def build(cls, plan: Plan) -> "_PlanIndex":
        idx = cls(plan=plan)
        idx.nodes_by_id = {n.id: n for n in plan.nodes}
        idx.edges_by_id = {e.id: e for e in plan.edges}
        for e in plan.edges:
            for pred in e.predecessors:
                idx.out_edges_by_node.setdefault(pred, []).append(e.id)
            for succ in e.successors:
                idx.in_edges_by_node.setdefault(succ, []).append(e.id)
        return idx


@dataclass
class SimResult:
    """Rückgabe nach Simulationslauf."""

    end_time: float
    plan_processes_completed: int
    processes_completed: int
    events: list[dict] = field(default_factory=list)


class Simulator:
    """Hauptklasse für einen Simulationslauf.

    Aufruf:
        sim = Simulator(model)
        with sim.recorder("events.jsonl") as rec:
            result = sim.run()
    """

    def __init__(self, model: SimModel) -> None:
        self.model = model
        self.params = model.sim_params
        self.rng = np.random.default_rng(self.params.seed)
        self.heap = EventHeap()
        self.clock: float = 0.0
        self._plan_idx: dict[str, _PlanIndex] = {p.id: _PlanIndex.build(p) for p in model.plans}
        self._next_pid = 0
        self._plan_processes: dict[int, PlanProcess] = {}
        self._processes: dict[int, Process] = {}
        self._joins: dict[tuple[str, int], JoinCounter] = {}
        self._rec: Optional[Recorder] = None
        self._horizon = self.params.period_length * self.params.horizon_periods

    # --- Public API --------------------------------------------------------

    def recorder(self, path: str | None = None) -> Recorder:
        """Setzt einen Recorder als Kontext-Manager und gibt ihn zurück."""
        self._rec = Recorder(path=path, in_memory=True)
        return self._rec

    def run(self) -> SimResult:
        if self._rec is None:
            self._rec = Recorder(path=None, in_memory=True)
            self._rec.__enter__()
            _owned_rec = True
        else:
            _owned_rec = False

        try:
            self._init_run()
            while len(self.heap) > 0 and self.clock < self._horizon:
                entry = self.heap.pop()
                if entry.time > self._horizon:
                    break
                self.clock = entry.time
                entry.callback(entry.payload)
            self._finalize_run()
            return SimResult(
                end_time=self.clock,
                plan_processes_completed=sum(
                    1 for pp in self._plan_processes.values() if pp.completed_via_end_edge
                ),
                processes_completed=sum(
                    1 for p in self._processes.values() if p.begin_time >= 0
                ),
                events=list(self._rec.events),
            )
        finally:
            if _owned_rec:
                self._rec.__exit__(None, None, None)

    # --- Init / Finalize ---------------------------------------------------

    def _init_run(self) -> None:
        self._emit("sim_begin", self.clock)
        self._emit("period_begin", self.clock, period=0)
        for trg in self.model.triggers:
            if isinstance(trg, TriggerSingle):
                self.heap.push(trg.begin_time, self._fire_single_trigger, trg)

    def _finalize_run(self) -> None:
        # Periode formal beenden auch wenn vorzeitig leer
        self._emit("period_end", self.clock, period=0)
        self._emit("sim_end", self.clock)

    # --- Lifecycle: PrzAusloesen (Trigger → Plan) --------------------------

    def _fire_single_trigger(self, trg: TriggerSingle) -> None:
        plan = self.model.plan_by_id(trg.plan_id)
        plan_pid = self._allocate_pid()
        pp = PlanProcess(
            pid=plan_pid,
            plan_id=plan.id,
            trigger_id=trg.id,
            begin_time=self.clock,
        )
        self._plan_processes[plan_pid] = pp
        self._emit(
            "trigger_fire",
            self.clock,
            trigger_id=trg.id,
            plan_id=plan.id,
        )
        self._emit(
            "plan_begin",
            self.clock,
            plan_id=plan.id,
            plan_pid=plan_pid,
            trigger_id=trg.id,
        )
        # Startkante feuert PrzWeitergeben an alle Successors
        idx = self._plan_idx[plan.id]
        start_edge = idx.edges_by_id[plan.start_edge]
        self._traverse_edge_outgoing(idx, start_edge, plan_pid, from_node=None)

    # --- Lifecycle: PrzWeitergeben (Knoten/Kante) --------------------------

    def _traverse_edge_outgoing(
        self,
        idx: _PlanIndex,
        edge: Edge,
        plan_pid: int,
        from_node: str | None,
    ) -> None:
        """Kante hat Vorgänger fertig → Nachfolger benachrichtigen.

        Bei UND-Verknüpfung mit mehreren Vorgängern wird ein JoinCounter
        verwaltet; erst wenn alle Vorgänger gemeldet haben, geht es weiter.

        transition_time > 0 wird VOR der Weitergabe als Delay eingeplant.
        """
        if from_node is not None:
            self._emit(
                "edge_traverse",
                self.clock,
                edge_id=edge.id,
                from_node=from_node,
                plan_pid=plan_pid,
            )

        # Join-Logik: mehrere Vorgänger → erst sammeln
        if len(edge.predecessors) > 1 and from_node is not None:
            key = (edge.id, plan_pid)
            join = self._joins.get(key)
            if join is None:
                join = JoinCounter(edge_id=edge.id, plan_process_pid=plan_pid, expected=len(edge.predecessors))
                self._joins[key] = join
            ready = join.hit()
            self._emit(
                "edge_join_partial" if not ready else "edge_join_complete",
                self.clock,
                edge_id=edge.id,
                plan_pid=plan_pid,
                received=join.received,
                expected=join.expected,
            )
            if not ready:
                return
            del self._joins[key]

        # Endkante: Plan ist fertig
        if edge.id == idx.plan.end_edge:
            self._on_plan_end(idx, plan_pid)
            return

        # transition_time einplanen, wenn > 0
        if edge.transition_time > 0:
            self.heap.push(
                self.clock + edge.transition_time,
                lambda _payload, _idx=idx, _e=edge, _pp=plan_pid: self._activate_successors(
                    _idx, _e, _pp
                ),
            )
        else:
            self._activate_successors(idx, edge, plan_pid)

    def _activate_successors(self, idx: _PlanIndex, edge: Edge, plan_pid: int) -> None:
        """Nachfolge-Knoten anstoßen — bei mehreren Nachfolgern parallel."""
        for succ_id in edge.successors:
            node = idx.nodes_by_id[succ_id]
            self._begin_node(idx, node, plan_pid)

    # --- Knoten-Bearbeitung ------------------------------------------------

    def _begin_node(self, idx: _PlanIndex, node, plan_pid: int) -> None:
        """Erzeugt Prozess für diesen Knoten und plant das Bearbeitungs-Ende."""
        if isinstance(node, NodeKonstant):
            duration = node.duration
        elif isinstance(node, NodeVerteilung):
            duration = node.distribution.sample(self.rng)
            if duration < 0:
                duration = 0.0
        else:
            raise NotImplementedError(f"Knotentyp {type(node).__name__} noch nicht unterstützt")

        process_pid = self._allocate_pid()
        proc = Process(
            pid=process_pid,
            node_id=node.id,
            begin_time=self.clock,
            duration=duration,
            parent_plan_process_pid=plan_pid,
        )
        self._processes[process_pid] = proc

        pp = self._plan_processes[plan_pid]
        pp.sub_process_count += 1

        self._emit(
            "node_begin",
            self.clock,
            node_id=node.id,
            process_pid=process_pid,
            plan_pid=plan_pid,
            duration=duration,
        )

        # Plane EvtBearbeitenEnde
        self.heap.push(
            self.clock + duration,
            lambda _payload, _idx=idx, _node_id=node.id, _ppid=process_pid: self._end_node(
                _idx, _node_id, _ppid
            ),
        )

    def _end_node(self, idx: _PlanIndex, node_id: str, process_pid: int) -> None:
        """Bearbeitungsende: Prozess wird zerstört, nachgelagerte Kanten werden aktiviert."""
        proc = self._processes[process_pid]
        plan_pid = proc.parent_plan_process_pid
        pp = self._plan_processes[plan_pid]
        pp.completed_sub_process_count += 1
        actual_duration = self.clock - proc.begin_time

        self._emit(
            "node_end",
            self.clock,
            node_id=node_id,
            process_pid=process_pid,
            plan_pid=plan_pid,
            duration=actual_duration,
        )

        out_edge_ids = idx.out_edges_by_node.get(node_id, [])
        for eid in out_edge_ids:
            edge = idx.edges_by_id[eid]
            self._traverse_edge_outgoing(idx, edge, plan_pid, from_node=node_id)

    # --- Plan-Ende ---------------------------------------------------------

    def _on_plan_end(self, idx: _PlanIndex, plan_pid: int) -> None:
        pp = self._plan_processes[plan_pid]
        pp.end_time = self.clock
        pp.completed_via_end_edge = True
        self._emit(
            "plan_end",
            self.clock,
            plan_id=idx.plan.id,
            plan_pid=plan_pid,
            duration=self.clock - pp.begin_time,
        )

    # --- Helpers -----------------------------------------------------------

    def _allocate_pid(self) -> int:
        self._next_pid += 1
        return self._next_pid

    def _emit(self, event_type: str, t: float, **payload) -> None:
        if self._rec is not None:
            self._rec.emit(event_type, t, **payload)
