"""EventBus + Sinks: Subscribe-Pattern, Fast-Path, TraceCaptureSink.

Verifiziert den Vertrag aus CONTEXT-P1-EVENTBUS.md.
"""

from __future__ import annotations

from osim_engine.observability.bus import EventBus
from osim_engine.observability.sinks.testing import TraceCaptureSink


def test_emit_without_subscribers_is_noop() -> None:
    """Kein Subscriber → emit() ist No-Op, kein Sim nötig."""
    bus = EventBus(simulator=None)
    bus.emit("proz.create", proz_id="X", knoten="A")
    # Kein Crash, keine Exception — fertig


def test_subscribe_exact_topic() -> None:
    bus = EventBus(simulator=None)
    sink = TraceCaptureSink()
    bus.subscribe("proz.create", sink)
    bus.emit("proz.create", proz_id="P1", knoten="K1")
    bus.emit("proz.bearbeit.start", proz_id="P1")  # nicht subscribed

    assert len(sink.records) == 1
    assert sink.records[0].topic == "proz.create"
    assert sink.records[0].data == {"proz_id": "P1", "knoten": "K1"}


def test_subscribe_wildcard_pattern() -> None:
    bus = EventBus(simulator=None)
    sink = TraceCaptureSink()
    bus.subscribe("proz.*", sink)

    bus.emit("proz.create", proz_id="P1")
    bus.emit("proz.bearbeit.start", proz_id="P1")
    bus.emit("plan.ausloesen", trigger_id="T1")  # ausgeschlossen

    topics = sink.topics()
    assert "proz.create" in topics
    assert "proz.bearbeit.start" in topics
    assert "plan.ausloesen" not in topics


def test_is_active_fast_path() -> None:
    bus = EventBus(simulator=None)
    assert bus.is_active("rng.sample") is False  # Topic ohne Subscriber

    sink = TraceCaptureSink()
    bus.subscribe("rng.*", sink)
    assert bus.is_active("rng.sample") is True
    assert bus.is_active("rng.shuffle") is True
    assert bus.is_active("proz.create") is False


def test_unsubscribe_deactivates_topic() -> None:
    bus = EventBus(simulator=None)
    sink = TraceCaptureSink()
    bus.subscribe("proz.*", sink)
    assert bus.is_active("proz.create") is True

    bus.unsubscribe(sink)
    assert bus.is_active("proz.create") is False

    bus.emit("proz.create")  # darf nichts tun
    assert len(sink.records) == 0


def test_for_topic_filter() -> None:
    bus = EventBus(simulator=None)
    sink = TraceCaptureSink()
    bus.subscribe("*", sink)

    bus.emit("a.b", x=1)
    bus.emit("c.d", y=2)
    bus.emit("a.b", x=3)

    a_b = sink.for_topic("a.b")
    assert len(a_b) == 2
    assert a_b[0].data["x"] == 1
    assert a_b[1].data["x"] == 3
