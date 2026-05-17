"""OListenerSimulator-Lifecycle und Notifikations-Reihenfolge.

Verifiziert das Listener-Mapping aus SUPPLEMENT § 6.1:
    - Attach insert-at-head (neueste Listener bekommen Notifikationen zuerst)
    - Detach räumt sauber auf
    - Self-Detach während Notifikation bricht keine Iteration (Snapshot-Pattern)
"""

from __future__ import annotations

from osim_engine.core.listener import OListenerSimulator
from osim_engine.core.simulator import OSimulator


class _Recorder(OListenerSimulator):
    def __init__(self, name: str, log: list) -> None:
        super().__init__()
        self.name = name
        self.log = log

    def on_sim_begin(self, time_begin: int) -> None:
        self.log.append(("sim_begin", self.name, time_begin))

    def on_period_begin(self, time_begin: int, time_end: int) -> None:
        self.log.append(("period_begin", self.name, time_begin))

    def on_period_end(self, time_end: int) -> None:
        self.log.append(("period_end", self.name, time_end))


def test_attach_detach() -> None:
    sim = OSimulator()
    log: list = []
    a = _Recorder("a", log)
    b = _Recorder("b", log)

    a.attach(sim)
    b.attach(sim)

    # b wurde zuletzt angehängt → steht vorn (insert-at-head)
    assert sim._sim_listeners[0] is b
    assert sim._sim_listeners[1] is a

    a.detach()
    assert a not in sim._sim_listeners
    assert b in sim._sim_listeners

    b.detach()
    assert sim._sim_listeners == []


def test_sim_begin_notifies_all_listeners() -> None:
    sim = OSimulator()
    log: list = []
    a = _Recorder("a", log)
    b = _Recorder("b", log)
    a.attach(sim)
    b.attach(sim)

    sim.on_sim_begin(sim, deep=False)
    # b wurde insert-at-head, also wird b zuerst gerufen
    assert log == [("sim_begin", "b", 0), ("sim_begin", "a", 0)]


def test_self_detach_during_notification_does_not_break() -> None:
    """Selbst-Abmeldung während Notifikation darf den Iterator nicht brechen."""
    sim = OSimulator()
    log: list = []

    class SelfDetachListener(OListenerSimulator):
        def on_sim_begin(self, time_begin: int) -> None:
            log.append("self_detach")
            self.detach()

    a = _Recorder("after_detacher", log)
    detacher = SelfDetachListener()

    # detacher zuerst hinzufügen (kommt nach a, wegen insert-at-head)
    a.attach(sim)
    detacher.attach(sim)

    sim.on_sim_begin(sim, deep=False)

    # Snapshot-Iteration: detacher entfernt sich selbst, aber a wird trotzdem benachrichtigt
    assert "self_detach" in log
    assert any(rec for rec in log if isinstance(rec, tuple) and rec[1] == "after_detacher")
