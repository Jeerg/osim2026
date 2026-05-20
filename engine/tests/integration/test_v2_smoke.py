"""V2-Smoke: 1-Knoten-Plan (richtiger Plan, nicht V1-Pragma-Direkt-Knoten).

Modell:
    [StartKante] → [Knoten K] → [EndKante]
            Plan P (kapselt K + Kanten)
    Auslöser A → P

Vergleicht das Verhalten gegen V1 (sollte identisch sein bei gleichen Parametern).
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build_one_node_plan(
    begin_termin: int = 100,
    durchfuehrungszeit: int = 500,
    uebergangszeit_start: int = 0,
    uebergangszeit_end: int = 0,
) -> tuple[PSimulator, PDurchlaufplan, PDpKnKonstant, PAslEinzel]:
    sim = PSimulator()

    # Plan
    plan = PDurchlaufplan(sim)
    plan.m_sName = "P"

    # Knoten
    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    plan.add_knoten(knoten)

    # Start-Kante: Plan → K
    start_kante = PDpKaUebergang(sim)
    start_kante.m_sName = "S"
    start_kante.m_iUebergangszeit = uebergangszeit_start
    start_kante.m_lNachfolger.append(knoten)
    knoten.m_lKanteEin = start_kante
    plan.add_kante(start_kante)
    plan.set_start_kante(start_kante)

    # End-Kante: K → Plan
    end_kante = PDpKaUebergang(sim)
    end_kante.m_sName = "E"
    end_kante.m_iUebergangszeit = uebergangszeit_end
    end_kante.m_lVorgaenger.append(knoten)
    knoten.m_lKanteAus = end_kante
    plan.add_kante(end_kante)
    plan.set_end_kante(end_kante)

    # Plan beim Simulator registrieren
    sim.register_plan(plan)

    # Auslöser
    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = begin_termin
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)

    return sim, plan, knoten, ausl


def test_v2_one_node_plan_zero_uebergang_matches_v1() -> None:
    """1-Knoten-Plan mit 0-Übergangszeit verhält sich wie V1-Direkt-Knoten."""
    sim, plan, knoten, ausl = _build_one_node_plan(
        begin_termin=100,
        durchfuehrungszeit=500,
        uebergangszeit_start=0,
        uebergangszeit_end=0,
    )
    sim.start()

    assert sim.m_periodNum == 1
    assert sim.m_periodBegin == 86400

    # Auslöser-Counter
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    # Durchlaufzeit: 100 → ... → Knoten 500s → 0+0 Übergang = 600 - 100 = 500
    assert ausl.m_dPtkDurchlaufzeit == 500.0

    # Knoten-Counter
    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_lProzesse == []

    # Plan-Counter (er hat 1 PtProzDurchlaufplan durchlaufen)
    assert plan.m_iPtkProzessCount == 1
    assert plan.m_iPtkBegAusloesungCount == 1
    assert plan.m_iPtkAusloesungCount == 1
    assert plan.m_lProzesse == []


def test_v2_uebergang_zeit_adds_to_durchlaufzeit() -> None:
    """Übergangs-Zeit an Start- und End-Kante addiert sich zur Gesamtzeit."""
    sim, plan, knoten, ausl = _build_one_node_plan(
        begin_termin=0,
        durchfuehrungszeit=100,
        uebergangszeit_start=30,
        uebergangszeit_end=20,
    )
    sim.start()

    # Erwartet: 30 (Start-Kante) + 100 (Knoten) + 20 (End-Kante) = 150
    assert ausl.m_dPtkDurchlaufzeit == 150.0


def test_v2_topics_with_plan() -> None:
    """EventBus emittiert plan.beendet_intern + kante.uebergang.start/ende."""
    sim, plan, knoten, ausl = _build_one_node_plan(
        begin_termin=0,
        durchfuehrungszeit=100,
        uebergangszeit_start=10,
        uebergangszeit_end=10,
    )
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    topics = sink.topics()
    assert "kante.weitergeben" in topics
    assert "kante.uebergang.start" in topics
    assert "kante.uebergang.ende" in topics
    assert "plan.beendet_intern" in topics
    assert "plan.beendet" in topics

    # 2 Übergänge (Start-Kante + End-Kante)
    starts = sink.for_topic("kante.uebergang.start")
    endes = sink.for_topic("kante.uebergang.ende")
    assert len(starts) == 2
    assert len(endes) == 2


def test_v2_kante_subtime_is_3() -> None:
    """EvtUebergangEnde hat sub_time=3 (kommt nach allen anderen Events bei gleicher Zeit)."""
    sim, plan, knoten, ausl = _build_one_node_plan(
        begin_termin=0,
        durchfuehrungszeit=100,
        uebergangszeit_start=10,
        uebergangszeit_end=10,
    )
    sink = TraceCaptureSink()
    sim.bus.subscribe("kante.uebergang.ende", sink)
    sim.start()

    for rec in sink.records:
        assert rec.sub_time == 3


def test_v2_event_pool_emptied_after_run() -> None:
    sim, plan, knoten, ausl = _build_one_node_plan(durchfuehrungszeit=100)
    sim.start()
    assert sim.evt_get_cur() == 0
    # Mindestens 4 Events: AuslTriggern + Start-Übergang + BearbeitEnde + End-Übergang
    assert sim.evt_get_sum() == 4
