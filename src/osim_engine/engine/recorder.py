"""Event-Recorder: schreibt einen Append-Only-JSONL-Stream während des Laufs.

Der Recorder ist der einzige Schreibpfad für extern beobachtbare Sim-Events.
KPI-Berechnung läuft auf demselben Stream im Post-Processing.

Event-Typen (Schema-Stand 0.1):
  sim_begin           {t}
  sim_end             {t}
  period_begin        {t, period}
  period_end          {t, period}
  trigger_fire        {t, trigger_id, plan_id}
  plan_begin          {t, plan_id, plan_pid, trigger_id}
  plan_end            {t, plan_id, plan_pid, duration}
  node_begin          {t, node_id, process_pid, plan_pid}
  node_end            {t, node_id, process_pid, duration}
  edge_traverse       {t, edge_id, from_node, to_node, plan_pid}
  edge_join_partial   {t, edge_id, plan_pid, received, expected}
  edge_join_complete  {t, edge_id, plan_pid}
"""

from __future__ import annotations

import io
import json
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Any


class Recorder(AbstractContextManager):
    """JSONL-Writer mit Buffering. In-Memory-Trace optional."""

    def __init__(self, path: str | Path | None = None, in_memory: bool = True) -> None:
        self.path = Path(path) if path is not None else None
        self.in_memory = in_memory
        self._file: io.TextIOWrapper | None = None
        self.events: list[dict[str, Any]] = []

    def __enter__(self) -> "Recorder":
        if self.path is not None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._file = self.path.open("w", encoding="utf-8")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._file is not None:
            self._file.flush()
            self._file.close()
            self._file = None

    def emit(self, event_type: str, t: float, **payload: Any) -> None:
        rec: dict[str, Any] = {"type": event_type, "t": t, **payload}
        if self.in_memory:
            self.events.append(rec)
        if self._file is not None:
            self._file.write(json.dumps(rec, ensure_ascii=False) + "\n")
