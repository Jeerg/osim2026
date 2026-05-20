"""EventPool gegen synthetische Sortier-Sequenz-Fixture.

Verifiziert, dass die Python-EventPool-Implementation dieselbe Pop-Reihenfolge
liefert wie das Mini-C-Programm `osim2004-trace/eventpool/sorting.c` (bzw.
aktuell der Python-Reference-Generator).
"""

from __future__ import annotations

import json
from pathlib import Path

from osim_engine.core.event import OMetaEvent
from osim_engine.core.event_pool import EventPool


FIXTURE = Path(__file__).parent / "fixtures" / "eventpool_synthetic_sequence.jsonl"


_SUBTIME_TO_CLASS: dict[int, type[OMetaEvent]] = {}


def _meta_for_subtime(sub: int) -> OMetaEvent:
    if sub not in _SUBTIME_TO_CLASS:
        cls = type(f"_EvtSub{sub}", (OMetaEvent,), {
            "m_subTime": sub,
            "m_name": f"Sub{sub}",
            "execute": lambda self, obj, para=None: None,
        })
        _SUBTIME_TO_CLASS[sub] = cls
    return _SUBTIME_TO_CLASS[sub]()


def test_eventpool_synthetic_sequence_matches_fixture() -> None:
    # Insert-Sequenz wie in generate_fixtures.py::fixture_eventpool_sorting
    inserts = [
        (1000, 3, "C1"),
        (1000, 0, "A1"),
        (1000, 1, "B1"),
        ( 500, 2, "X1"),
        (1500, 0, "D1"),
        (1000, 0, "A2"),
    ]
    pool = EventPool()
    for t, sub, name in inserts:
        pool.insert(_meta_for_subtime(sub), obj=name, ezeit=t)

    with FIXTURE.open(encoding="utf-8") as fh:
        expected = [json.loads(line) for line in fh]

    for ref in expected:
        evt = pool.remove_first()
        assert evt is not None, f"Pool leer bei pop_order={ref['pop_order']}"
        assert evt.m_obj == ref["name"], (
            f"Name-Mismatch pop_order={ref['pop_order']}: "
            f"Python={evt.m_obj} vs Fixture={ref['name']}"
        )
        assert evt.m_time == ref["decoded_time"]
        assert evt.m_meta.m_subTime == ref["sub_time"]

    assert pool.remove_first() is None
