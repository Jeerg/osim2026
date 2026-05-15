"""End-to-end-Test mit der größeren `dc1.otx` (50 KB, 252 Objekte).

dc1.otx enthält drei sinnvolle Durchlaufpläne:
  Plan P53  'Durchlaufplan 3': OP10(5) -> [OP20(10) | OP30(10)] (parallel/join)
  Plan P110 'Durchlaufplan 5': OP40(10) -> OP50(10)
  Plan P158 'Durchlaufplan 7': OP60(10)

Beim ersten Plan endet die Simulation bei t=15: OP10 nach 5 ZE, dann starten
OP20 und OP30 parallel (Dauer je 10 ZE), beide enden bei t=15 → Join feuert.

Standard-Auto-Trigger feuert den *ersten* gefundenen Plan bei t=0. Wir testen
zusätzlich, dass das Mapping alle drei Pläne korrekt extrahiert.
"""

from pathlib import Path

import pytest

from osim_engine.engine.runner import Simulator
from osim_engine.io.otx_mapper import map_otx_to_simmodel
from osim_engine.io.otx_reader import parse_otx_file
from osim_engine.kpi.core import aggregate

DC1_OTX = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\dc1.otx")


def _load_model():
    if not DC1_OTX.exists():
        pytest.skip(f"{DC1_OTX} nicht vorhanden")
    return map_otx_to_simmodel(parse_otx_file(DC1_OTX))


def test_dc1_mapping_extracts_three_plans():
    model = _load_model()
    plan_ids = sorted(p.id for p in model.plans)
    assert plan_ids == ["P110", "P158", "P53"]


def test_dc1_plan_p53_topology():
    model = _load_model()
    plan = next(p for p in model.plans if p.id == "P53")

    assert plan.name == "Durchlaufplan 3"
    node_names = sorted(n.name for n in plan.nodes)
    assert node_names == ["OP10", "OP20", "OP30"]

    durations = {n.name: n.duration for n in plan.nodes}
    assert durations == {"OP10": 5.0, "OP20": 10.0, "OP30": 10.0}

    # Genau eine Startkante (keine Vorgänger), genau eine Endkante (keine Nachfolger)
    starts = [e for e in plan.edges if not e.predecessors]
    ends = [e for e in plan.edges if not e.successors]
    assert len(starts) == 1
    assert len(ends) == 1


def _build_single_plan_model(model, plan_id: str):
    """Reduziert ein Multi-Plan-Modell auf einen einzigen Plan + Auto-Trigger."""
    from osim_engine.model.core import TriggerSingle
    from osim_engine.model.sim_model import SimModel

    plan = next(p for p in model.plans if p.id == plan_id)
    return SimModel(
        name=f"isolated {plan_id}",
        sim_params=model.sim_params,
        plans=[plan],
        triggers=[TriggerSingle(id="auto", plan_id=plan_id, begin_time=0.0)],
    )


def test_dc1_plan_p53_simulation_end_time():
    """OP10(5) -> [OP20(10) || OP30(10)] -> Plan-Ende bei t=15."""
    model = _load_model()
    sim_model = _build_single_plan_model(model, "P53")
    sim = Simulator(sim_model)
    with sim.recorder() as rec:
        result = sim.run()

    assert result.plan_processes_completed == 1
    plan_end = next(e for e in rec.events if e["type"] == "plan_end")
    assert plan_end["t"] == pytest.approx(15.0)


def test_dc1_plan_p110_sequential():
    """OP40(10) -> OP50(10) -> Plan-Ende bei t=20."""
    model = _load_model()
    sim_model = _build_single_plan_model(model, "P110")
    sim = Simulator(sim_model)
    with sim.recorder() as rec:
        sim.run()
    plan_end = next(e for e in rec.events if e["type"] == "plan_end")
    assert plan_end["t"] == pytest.approx(20.0)


def test_dc1_plan_p158_single_node():
    """OP60(10) -> Plan-Ende bei t=10."""
    model = _load_model()
    sim_model = _build_single_plan_model(model, "P158")
    sim = Simulator(sim_model)
    with sim.recorder() as rec:
        sim.run()
    plan_end = next(e for e in rec.events if e["type"] == "plan_end")
    assert plan_end["t"] == pytest.approx(10.0)


def test_dc1_kpi_aggregation():
    """KPIs für isolierten Plan P53."""
    model = _load_model()
    sim_model = _build_single_plan_model(model, "P53")
    sim = Simulator(sim_model)
    with sim.recorder() as rec:
        sim.run()

    kpi = aggregate(rec.events, ptb=0, pte=sim_model.sim_params.period_length)
    assert kpi.by_trigger["auto"].afa == 1
    assert kpi.by_trigger["auto"].mdz == pytest.approx(15.0)
    # Pro Knoten: OP10 endet nach 5, OP20 + OP30 nach jeweils 10
    op10_node_id = next(n.id for n in sim_model.plans[0].nodes if n.name == "OP10")
    op20_node_id = next(n.id for n in sim_model.plans[0].nodes if n.name == "OP20")
    op30_node_id = next(n.id for n in sim_model.plans[0].nodes if n.name == "OP30")
    assert kpi.by_node[op10_node_id].mdk == pytest.approx(5.0)
    assert kpi.by_node[op20_node_id].mdk == pytest.approx(10.0)
    assert kpi.by_node[op30_node_id].mdk == pytest.approx(10.0)
