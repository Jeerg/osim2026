"""EventPool-Unit-Tests: Sortier-Schema, FIFO-Tiebreaker, Tombstones.

Verifiziert das Kontrakt aus `docs/CONTEXT-P1-SUPPLEMENT.md` § 6.2 und § 3:
    - Primärsortierung nach `time`
    - Sekundärsortierung nach `sub_time` (0-3)
    - FIFO bei `(time, sub_time)`-Gleichheit
    - Encoding `combined = (time << 2) | sub_time`
    - Lazy-Delete via Tombstone
"""

from __future__ import annotations

import pytest

from osim_engine.core.event import MAX_EVENT_TIME, OMetaEvent
from osim_engine.core.event_pool import EventPool


class _EvtSub0(OMetaEvent):
    m_subTime = 0
    m_name = "A"

    def execute(self, obj, para=None):  # noqa: D401
        pass


class _EvtSub1(OMetaEvent):
    m_subTime = 1
    m_name = "B"

    def execute(self, obj, para=None):
        pass


class _EvtSub2(OMetaEvent):
    m_subTime = 2
    m_name = "C"

    def execute(self, obj, para=None):
        pass


class _EvtSub3(OMetaEvent):
    m_subTime = 3
    m_name = "D"

    def execute(self, obj, para=None):
        pass


# ----------------------------------------------------------------------
# Primäre Sortierung
# ----------------------------------------------------------------------


def test_different_times_pop_in_time_order() -> None:
    pool = EventPool()
    pool.insert(_EvtSub0(), obj="late", ezeit=2000)
    pool.insert(_EvtSub0(), obj="early", ezeit=500)
    pool.insert(_EvtSub0(), obj="middle", ezeit=1000)

    assert pool.remove_first().m_obj == "early"
    assert pool.remove_first().m_obj == "middle"
    assert pool.remove_first().m_obj == "late"
    assert pool.remove_first() is None


# ----------------------------------------------------------------------
# Sub-Time-Sortierung (entscheidend für $event(N))
# ----------------------------------------------------------------------


def test_same_time_different_subtime_orders_by_subtime() -> None:
    pool = EventPool()
    pool.insert(_EvtSub3(), obj="d", ezeit=1000)
    pool.insert(_EvtSub0(), obj="a", ezeit=1000)
    pool.insert(_EvtSub2(), obj="c", ezeit=1000)
    pool.insert(_EvtSub1(), obj="b", ezeit=1000)

    assert pool.remove_first().m_obj == "a"
    assert pool.remove_first().m_obj == "b"
    assert pool.remove_first().m_obj == "c"
    assert pool.remove_first().m_obj == "d"


def test_combined_time_encoding_matches_cpp() -> None:
    """C++ EventPoolDll::Insert encoding: combined = (time << 2) | sub_time."""
    pool = EventPool()
    pool.insert(_EvtSub2(), obj="x", ezeit=100)
    entry = pool._heap[0]
    assert entry.combined_time == (100 << 2) | 2  # = 402


# ----------------------------------------------------------------------
# FIFO-Tiebreaker bei (time, sub_time)-Gleichheit
# ----------------------------------------------------------------------


def test_same_time_same_subtime_fifo() -> None:
    pool = EventPool()
    for i in range(5):
        pool.insert(_EvtSub0(), obj=f"obj_{i}", ezeit=1000)

    for i in range(5):
        assert pool.remove_first().m_obj == f"obj_{i}"


# ----------------------------------------------------------------------
# Gemischte Sequenz (= eventpool_synthetic_sequence.jsonl-Fixture)
# ----------------------------------------------------------------------


def test_mixed_sequence_matches_synthetic_fixture() -> None:
    """Reproduziert die Sortier-Sequenz aus
    osim2004-trace/eventpool/sorting.c (= python-reference/generate_fixtures.py
    fixture_eventpool_sorting).

    Insert-Reihenfolge:
        (1000, sub=3, "C1")
        (1000, sub=0, "A1")
        (1000, sub=1, "B1")
        ( 500, sub=2, "X1")
        (1500, sub=0, "D1")
        (1000, sub=0, "A2")  ← gleicher (t, sub) wie A1, A1 kommt zuerst

    Erwartete Pop-Reihenfolge: X1, A1, A2, B1, C1, D1
    """
    pool = EventPool()
    inserts = [
        (1000, _EvtSub3, "C1"),
        (1000, _EvtSub0, "A1"),
        (1000, _EvtSub1, "B1"),
        ( 500, _EvtSub2, "X1"),
        (1500, _EvtSub0, "D1"),
        (1000, _EvtSub0, "A2"),
    ]
    for t, evt_cls, name in inserts:
        pool.insert(evt_cls(), obj=name, ezeit=t)

    expected = ["X1", "A1", "A2", "B1", "C1", "D1"]
    actual = []
    while True:
        evt = pool.remove_first()
        if evt is None:
            break
        actual.append(evt.m_obj)
    assert actual == expected


# ----------------------------------------------------------------------
# Tombstones
# ----------------------------------------------------------------------


def test_delete_skips_event_in_pop() -> None:
    pool = EventPool()
    hdl_first = pool.insert(_EvtSub0(), obj="first", ezeit=100)
    pool.insert(_EvtSub0(), obj="second", ezeit=200)

    pool.delete(hdl_first)
    assert pool.remove_first().m_obj == "second"
    assert pool.remove_first() is None


def test_delete_idempotent() -> None:
    pool = EventPool()
    hdl = pool.insert(_EvtSub0(), obj="x", ezeit=100)
    pool.delete(hdl)
    pool.delete(hdl)  # zweites Mal → kein Effekt, kein Fehler
    assert pool.remove_first() is None


def test_curr_event_state() -> None:
    pool = EventPool()
    pool.insert(_EvtSub0(), obj="x", ezeit=100)
    assert not pool.curr_exists()

    evt = pool.remove_first()
    assert pool.curr_exists()
    assert pool.get_curr() is evt

    pool.delete_curr()
    assert not pool.curr_exists()


# ----------------------------------------------------------------------
# Statistik-Zähler
# ----------------------------------------------------------------------


def test_statistics_counters() -> None:
    pool = EventPool()
    assert pool.m_sumEvent == 0
    assert pool.m_curEvent == 0
    assert pool.m_maxEvent == 0

    pool.insert(_EvtSub0(), obj="a", ezeit=100)
    pool.insert(_EvtSub0(), obj="b", ezeit=200)
    pool.insert(_EvtSub0(), obj="c", ezeit=300)
    assert pool.m_sumEvent == 3
    assert pool.m_curEvent == 3
    assert pool.m_maxEvent == 3

    pool.remove_first()
    assert pool.m_sumEvent == 3
    assert pool.m_curEvent == 2
    assert pool.m_maxEvent == 3  # high-water-mark, sinkt nicht


# ----------------------------------------------------------------------
# Zeit-Range-Vertrag
# ----------------------------------------------------------------------


def test_insert_negative_time_raises() -> None:
    pool = EventPool()
    with pytest.raises(ValueError):
        pool.insert(_EvtSub0(), obj="x", ezeit=-1)


def test_insert_at_max_event_time_ok() -> None:
    pool = EventPool()
    pool.insert(_EvtSub0(), obj="x", ezeit=MAX_EVENT_TIME)
    assert pool.remove_first().m_time == MAX_EVENT_TIME


def test_insert_above_max_event_time_raises() -> None:
    pool = EventPool()
    with pytest.raises(ValueError):
        pool.insert(_EvtSub0(), obj="x", ezeit=MAX_EVENT_TIME + 1)


# ----------------------------------------------------------------------
# is_empty
# ----------------------------------------------------------------------


def test_is_empty_with_future_event() -> None:
    pool = EventPool()
    pool.insert(_EvtSub0(), obj="x", ezeit=86400)  # 1 Tag

    assert pool.is_empty(period_end=86399) is True   # period endet 1s vor Event
    assert pool.is_empty(period_end=86400) is False  # Event innerhalb Periode
    assert pool.is_empty(period_end=100000) is False
