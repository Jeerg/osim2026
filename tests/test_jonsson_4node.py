"""Smoke-Test: Jonssons 4-Knoten-Beispiel (Abb. 4-13).

Erwartete Zeitlinie aus dem Sequenzdiagramm (Abb. 4-15 bis 4-17):
  t=0    Trigger A1 feuert, Plan D1 startet, K1 beginnt (Dauer 60)
  t=60   K1 endet, Kante N2 verzögert um 20 ZE
  t=80   N2 fertig, K2 (Dauer 80) und K3 (Dauer 90) starten parallel
  t=160  K2 endet, hit auf Join N3 (1/2)
  t=170  K3 endet, hit auf Join N3 (2/2), K4 startet (Dauer 50)
  t=220  K4 endet, Plan D1 endet

Erwartete KPIs:
  Trigger A1: AFA=1, MDZ=220
  K1: AFK=1, MDK=60
  K2: AFK=1, MDK=80
  K3: AFK=1, MDK=90
  K4: AFK=1, MDK=50
"""

from pathlib import Path

import pytest

from osim_engine import Simulator, load_model
from osim_engine.kpi.core import aggregate

EXAMPLE = Path(__file__).resolve().parent.parent / "examples" / "jonsson_4node.json"


def test_jonsson_4node_smoke():
    model = load_model(EXAMPLE)
    sim = Simulator(model)
    with sim.recorder() as rec:
        result = sim.run()

    # 1 Plan-Ausführung, vollständig abgeschlossen
    assert result.plan_processes_completed == 1, "Plan sollte genau einmal vollständig sein"

    # Plan-Ende-Event muss bei t=220 auftreten
    plan_end_events = [e for e in rec.events if e["type"] == "plan_end"]
    assert len(plan_end_events) == 1
    assert plan_end_events[0]["t"] == pytest.approx(220.0)
    assert plan_end_events[0]["duration"] == pytest.approx(220.0)

    # KPI-Aggregation
    kpi = aggregate(rec.events, ptb=0, pte=1000)

    assert kpi.by_trigger["A1"].afa == 1
    assert kpi.by_trigger["A1"].mdz == pytest.approx(220.0)

    assert kpi.by_node["K1"].afk == 1
    assert kpi.by_node["K1"].mdk == pytest.approx(60.0)
    assert kpi.by_node["K2"].afk == 1
    assert kpi.by_node["K2"].mdk == pytest.approx(80.0)
    assert kpi.by_node["K3"].afk == 1
    assert kpi.by_node["K3"].mdk == pytest.approx(90.0)
    assert kpi.by_node["K4"].afk == 1
    assert kpi.by_node["K4"].mdk == pytest.approx(50.0)


def test_event_order_is_deterministic():
    """Zwei Läufe mit gleichem Seed müssen exakt dieselbe Event-Sequenz liefern."""
    model = load_model(EXAMPLE)

    sim1 = Simulator(model)
    with sim1.recorder() as rec1:
        sim1.run()

    sim2 = Simulator(model)
    with sim2.recorder() as rec2:
        sim2.run()

    assert rec1.events == rec2.events
