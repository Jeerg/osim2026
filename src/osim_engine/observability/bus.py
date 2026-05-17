"""EventBus — zentrale Publish/Subscribe-Komponente für Sim-Ereignisse.

Siehe `docs/CONTEXT-P1-EVENTBUS.md` § 1-2 für Vertrag und Topic-Taxonomie.

Performance-Vertrag (kritisch für Hot-Topics wie `rng.sample`):
    - Fast-Path-Check via `is_active(topic)` muss konstante Zeit haben
    - Bei deaktiviertem Topic: null Allokation, null String-Formatting
    - emit() ohne Subscriber: Early-Return nach Set-Lookup
"""

from __future__ import annotations

import fnmatch
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from osim_engine.core.simulator import OSimulator


@runtime_checkable
class Sink(Protocol):
    """Sink-Protocol. Jeder Sink erhält Topic, Daten, Sim-Zeit, Sub-Time."""

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        ...


class EventBus:
    """Pub/Sub für Sim-Domänen-Events.

    Topics: dotted lowercase (z. B. "proz.bearbeit.start"). Subscriber können
    Pattern via fnmatch verwenden (z. B. "proz.*" für alle Prozess-Events).
    """

    def __init__(self, simulator: "OSimulator | None" = None) -> None:
        self._sim: "OSimulator | None" = simulator
        self._subscriptions: list[tuple[str, Sink]] = []
        self._active_topics: set[str] = set()
        self._known_topics: set[str] = set()

    def attach_simulator(self, simulator: "OSimulator") -> None:
        self._sim = simulator

    def subscribe(self, topic_pattern: str, sink: Sink) -> None:
        self._subscriptions.append((topic_pattern, sink))
        self._refresh_active_topics()

    def unsubscribe(self, sink: Sink) -> None:
        self._subscriptions = [(p, s) for p, s in self._subscriptions if s is not sink]
        self._refresh_active_topics()

    def is_active(self, topic: str) -> bool:
        """Fast-Path: lohnt sich Payload-Building?"""
        # Wenn das Topic noch nie emittiert wurde, registrieren für Pattern-Check
        if topic not in self._known_topics:
            self._known_topics.add(topic)
            if any(fnmatch.fnmatchcase(topic, p) for p, _ in self._subscriptions):
                self._active_topics.add(topic)
        return topic in self._active_topics

    def emit(self, topic: str, **data: Any) -> None:
        if not self.is_active(topic):
            return

        sim_time = 0
        sub_time = 0
        if self._sim is not None:
            sim_time = self._sim.evt_curr_time()
            meta = self._sim.current_meta_event
            if meta is not None:
                sub_time = meta.m_subTime

        for pattern, sink in self._subscriptions:
            if fnmatch.fnmatchcase(topic, pattern):
                sink.receive(topic, data, sim_time, sub_time)

    def _refresh_active_topics(self) -> None:
        self._active_topics = {
            t for t in self._known_topics
            if any(fnmatch.fnmatchcase(t, p) for p, _ in self._subscriptions)
        }
