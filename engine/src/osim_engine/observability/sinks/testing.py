"""TraceCaptureSink — in-memory Trace für pytest.

Variante von JsonlSink, die Records in eine Liste statt in eine Datei
schreibt. Nutzbar als Substrat für Diff-Tests und Inspektion in Tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TraceRecord:
    topic: str
    data: dict[str, Any]
    sim_time: int
    sub_time: int


@dataclass
class TraceCaptureSink:
    records: list[TraceRecord] = field(default_factory=list)

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        self.records.append(TraceRecord(topic=topic, data=data, sim_time=sim_time, sub_time=sub_time))

    def topics(self) -> list[str]:
        return [r.topic for r in self.records]

    def for_topic(self, topic: str) -> list[TraceRecord]:
        return [r for r in self.records if r.topic == topic]

    def clear(self) -> None:
        self.records.clear()
