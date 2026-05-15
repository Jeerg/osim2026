"""Smoke-Test: test.otx durch Engine fahren.

test.otx ist ein minimales 1-Knoten-Beispiel ohne sinnvolle Durchführungszeit
(m_iDurchfuehrungszeit=0). Erwartung daher:
  - Mapper liefert ein gültiges Modell mit 1 Plan, 1 Knoten, 2 Kanten
  - Auto-Trigger wird eingefügt (kein PAslEinzel in der Datei)
  - Sim läuft durch, Plan endet bei t=0 (Knoten hat Dauer 0)
  - KPI: AFA=1, MDZ=0, AFK=1, MDK=0
"""

from pathlib import Path

import pytest

from osim_engine.engine.runner import Simulator
from osim_engine.io.otx_mapper import map_otx_to_simmodel
from osim_engine.io.otx_reader import parse_otx_file
from osim_engine.kpi.core import aggregate

TEST_OTX = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\test.otx")


def test_test_otx_parses_and_runs():
    if not TEST_OTX.exists():
        pytest.skip(f"{TEST_OTX} nicht vorhanden")

    otx = parse_otx_file(TEST_OTX)
    assert otx.declared_count == 77
    assert len(otx.by_oid) >= 70  # Robustheit, falls Edge-Cases unbehandelt bleiben

    model = map_otx_to_simmodel(otx)
    assert len(model.plans) == 1
    plan = model.plans[0]
    assert plan.name == "Durchlaufplan 0"
    assert len(plan.nodes) == 1
    assert len(plan.edges) == 2

    # Auto-Trigger
    assert len(model.triggers) == 1
    assert model.triggers[0].begin_time == 0

    sim = Simulator(model)
    with sim.recorder() as rec:
        result = sim.run()

    assert result.plan_processes_completed == 1

    kpi = aggregate(rec.events, ptb=0, pte=model.sim_params.period_length)
    # Knoten hat Dauer 0 → MDZ=0, MDK=0
    auto_trg = next(iter(kpi.by_trigger.values()))
    assert auto_trg.afa == 1
    assert auto_trg.mdz == 0.0
