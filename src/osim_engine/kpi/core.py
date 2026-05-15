"""Basis-KPIs aus Jonsson Kap. 9.1.

Phase 1 (ohne Ressourcen):
  - AFA: Anzahl fertiggestellter Auslösungen pro Auslöser  (Def. 9.4)
  - MDZ: Mittlere Durchlaufzeit pro Auslöser              (Def. 9.5)
  - AFK: Anzahl fertiggestellter Auslösungen pro Knoten   (Def. 9.9)
  - MDK: Mittlere Durchlaufzeit pro Knoten                (Def. 9.11)
  - AAU: Anzahl abgeschlossener Übergänge pro Kante       (Def. 9.47)

Alle Werte beziehen sich auf eine Protokollierungsperiode [PTB, PTE].
Default: gesamte Sim-Zeit, also PTB=0, PTE=horizon.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class PerNodeKPI:
    node_id: str
    afk: int = 0  # Anzahl fertiggestellter Auslösungen
    mdk: float = 0.0  # Mittlere Durchlaufzeit


@dataclass
class PerEdgeKPI:
    edge_id: str
    aau: int = 0


@dataclass
class PerTriggerKPI:
    trigger_id: str
    afa: int = 0  # Anzahl fertiggestellter Auslösungen
    mdz: float = 0.0  # Mittlere Durchlaufzeit der Auslösungen


@dataclass
class KPIReport:
    ptb: float
    pte: float
    by_trigger: dict[str, PerTriggerKPI] = field(default_factory=dict)
    by_node: dict[str, PerNodeKPI] = field(default_factory=dict)
    by_edge: dict[str, PerEdgeKPI] = field(default_factory=dict)
    plan_processes_total: int = 0
    plan_processes_completed: int = 0

    def to_dict(self) -> dict:
        return {
            "ptb": self.ptb,
            "pte": self.pte,
            "plan_processes_total": self.plan_processes_total,
            "plan_processes_completed": self.plan_processes_completed,
            "by_trigger": {
                tid: {"afa": k.afa, "mdz": k.mdz} for tid, k in self.by_trigger.items()
            },
            "by_node": {
                nid: {"afk": k.afk, "mdk": k.mdk} for nid, k in self.by_node.items()
            },
            "by_edge": {
                eid: {"aau": k.aau} for eid, k in self.by_edge.items()
            },
        }


def aggregate(events: Iterable[dict], ptb: float, pte: float) -> KPIReport:
    """Aggregiert ein Event-Stream zu einem KPIReport.

    Erwartet die Event-Typen aus Recorder (node_begin/node_end, plan_begin/plan_end,
    trigger_fire, edge_traverse).
    """
    report = KPIReport(ptb=ptb, pte=pte)

    # node_begin pro process_pid sammeln, node_end matchen
    node_begins: dict[int, tuple[str, float]] = {}
    node_durations: dict[str, list[float]] = defaultdict(list)
    node_completes: dict[str, int] = defaultdict(int)
    edge_traversals: dict[str, int] = defaultdict(int)

    # trigger_fire pro Plan-Beginn pid mappen, dann plan_end gibt Durchlaufzeit
    plan_begins: dict[int, tuple[str, float]] = {}  # plan_pid → (trigger_id, begin_t)
    trigger_durations: dict[str, list[float]] = defaultdict(list)
    trigger_completes: dict[str, int] = defaultdict(int)
    plan_processes_total = 0
    plan_processes_completed = 0

    for ev in events:
        et = ev["type"]
        t = ev.get("t", 0.0)

        if et == "node_begin":
            node_begins[ev["process_pid"]] = (ev["node_id"], t)

        elif et == "node_end":
            ppid = ev["process_pid"]
            nid = ev["node_id"]
            if ppid in node_begins:
                _, begin_t = node_begins.pop(ppid)
                if ptb <= t <= pte:
                    node_durations[nid].append(t - begin_t)
                    node_completes[nid] += 1

        elif et == "edge_traverse":
            if ptb <= t <= pte:
                edge_traversals[ev["edge_id"]] += 1

        elif et == "plan_begin":
            plan_pid = ev["plan_pid"]
            trigger_id = ev["trigger_id"]
            plan_begins[plan_pid] = (trigger_id, t)
            plan_processes_total += 1

        elif et == "plan_end":
            plan_pid = ev["plan_pid"]
            if plan_pid in plan_begins:
                trigger_id, begin_t = plan_begins.pop(plan_pid)
                plan_processes_completed += 1
                if ptb <= t <= pte:
                    trigger_durations[trigger_id].append(t - begin_t)
                    trigger_completes[trigger_id] += 1

    for tid in set(list(trigger_durations.keys()) + list(trigger_completes.keys())):
        durs = trigger_durations.get(tid, [])
        afa = trigger_completes.get(tid, 0)
        mdz = sum(durs) / len(durs) if durs else 0.0
        report.by_trigger[tid] = PerTriggerKPI(trigger_id=tid, afa=afa, mdz=mdz)

    for nid in set(list(node_durations.keys()) + list(node_completes.keys())):
        durs = node_durations.get(nid, [])
        afk = node_completes.get(nid, 0)
        mdk = sum(durs) / len(durs) if durs else 0.0
        report.by_node[nid] = PerNodeKPI(node_id=nid, afk=afk, mdk=mdk)

    for eid, aau in edge_traversals.items():
        report.by_edge[eid] = PerEdgeKPI(edge_id=eid, aau=aau)

    report.plan_processes_total = plan_processes_total
    report.plan_processes_completed = plan_processes_completed
    return report
