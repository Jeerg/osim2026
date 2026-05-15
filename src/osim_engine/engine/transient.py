"""Transiente Sim-Objekte (entstehen während des Laufs, werden zerstört).

Jonsson Kap. 4.4.3: PTProzess, PTPrzZeitvorgabe, PTPrzDurchlaufplan, PTVerknuepfung.
Diese Objekte sind NICHT Teil des Modells — sie leben nur im Engine-State.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Process:
    """Jonsson PTProzess / PTPrzZeitvorgabe.

    Repräsentiert eine konkrete Knoten-Durchführung. Existiert nur, solange
    der Knoten bearbeitet wird; wird am Ende zerstört.
    """

    pid: int
    node_id: str
    begin_time: float
    duration: float
    parent_plan_process_pid: Optional[int] = None


@dataclass
class PlanProcess:
    """Jonsson PTPrzDurchlaufplan.

    Repräsentiert die Durchführung eines ganzen Plans. Lebt vom PrzAusloesen
    bis zur Endkanten-Beendigung; aggregiert sub-process-Start/Ende.
    """

    pid: int
    plan_id: str
    trigger_id: str
    begin_time: float
    end_time: float | None = None
    sub_process_count: int = 0
    completed_sub_process_count: int = 0
    completed_via_end_edge: bool = False


@dataclass
class JoinCounter:
    """Jonsson PTVerknuepfung.

    Wird bei Kanten mit mehreren Vorgängern erzeugt, sammelt eintreffende
    Vorgänger-Beendigungen, feuert wenn alle da sind.
    """

    edge_id: str
    plan_process_pid: int
    expected: int
    received: int = 0
    pending_payloads: list = field(default_factory=list)

    def hit(self, payload=None) -> bool:
        self.received += 1
        if payload is not None:
            self.pending_payloads.append(payload)
        return self.received >= self.expected
