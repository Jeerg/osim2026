"""Diff-Test V2: 1-Knoten-Plan-Hand-Trace gegen Sim-Ausführung.

Zugehöriges Markdown: `v2_one_node_plan.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build() -> tuple[PSimulator, PDurchlaufplan, PDpKnKonstant, PDpKaUebergang, PDpKaUebergang, PAslEinzel]:
    sim = PSimulator()
    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    plan.add_knoten(knoten)

    start_kante = PDpKaUebergang(sim); start_kante.m_sName = "S"
    start_kante.m_iUebergangszeit = 10
    start_kante.m_lNachfolger.append(knoten)
    knoten.m_lKanteEin = start_kante
    plan.add_kante(start_kante); plan.set_start_kante(start_kante)

    end_kante = PDpKaUebergang(sim); end_kante.m_sName = "E"
    end_kante.m_iUebergangszeit = 10
    end_kante.m_lVorgaenger.append(knoten)
    knoten.m_lKanteAus = end_kante
    plan.add_kante(end_kante); plan.set_end_kante(end_kante)

    sim.register_plan(plan)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)
    return sim, plan, knoten, start_kante, end_kante, ausl


def test_v2_counters_match_md() -> None:
    sim, plan, k, s_k, e_k, ausl = _build()
    sim.start()

    # Periode
    assert sim.m_periodNum == 1
    # Auslöser
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 120.0
    # Plan
    assert plan.m_iPtkProzessCount == 1
    assert plan.m_iPtkBegAusloesungCount == 1
    assert plan.m_iPtkAusloesungCount == 1
    # Knoten
    assert k.m_iPtkProzessCount == 1
    assert k.m_iPtkBegAusloesungCount == 1
    assert k.m_iPtkAusloesungCount == 1
    # Kanten
    assert s_k.m_iPtkUebergangCount == 1
    assert s_k.m_iKummUebergangszeit == 10
    assert e_k.m_iPtkUebergangCount == 1
    assert e_k.m_iKummUebergangszeit == 10
    # Event-Pool
    assert sim.evt_get_sum() == 4


def test_v2_topic_sequence_matches_md() -> None:
    sim, plan, k, s_k, e_k, ausl = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    # Erwartete (Zeit, sub_time, Topic)-Reihenfolge — siehe v2_one_node_plan.md
    # `kante.weitergeben` wird NUR in PDlplKante.proz_weitergeben (Basis)
    # emittiert, nicht im überschriebenen PDpKaUebergang.proz_weitergeben.
    expected = [
        (0,     0, "sim.begin"),
        (0,     0, "sim.period.begin"),
        (0,     1, "plan.ausloesen"),
        (0,     1, "kante.uebergang.start"),   # S
        (10,    3, "kante.uebergang.ende"),    # S
        (10,    3, "kante.weitergeben"),       # S (durch Basis-Routing)
        (10,    3, "proz.create"),
        (10,    3, "proz.bearbeit.start"),
        (110,   2, "proz.bearbeit.ende"),
        (110,   2, "kante.uebergang.start"),   # E
        (120,   3, "kante.uebergang.ende"),    # E
        (120,   3, "kante.weitergeben"),       # E (durch Basis-Routing)
        (120,   3, "plan.beendet_intern"),     # P
        (120,   3, "plan.beendet"),            # A
        (86400, 3, "sim.period.end"),
    ]
    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\nErwartet ({len(expected)}):\n{expected}\n"
        f"\nAktuell ({len(actual)}):\n{actual}"
    )


def test_v2_kante_uebergang_durations() -> None:
    """Übergangs-Start und -Ende-Topics liegen exakt ubg_zeit auseinander."""
    sim, plan, k, s_k, e_k, ausl = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("kante.uebergang.*", sink)
    sim.start()

    starts = sink.for_topic("kante.uebergang.start")
    endes = sink.for_topic("kante.uebergang.ende")
    assert len(starts) == len(endes) == 2

    # Start-Kante: start bei t=0, ende bei t=10 → 10s
    s_start = next(r for r in starts if r.data["kante"] == "S")
    s_ende = next(r for r in endes if r.data["kante"] == "S")
    assert s_ende.sim_time - s_start.sim_time == 10

    # End-Kante: start bei t=110, ende bei t=120 → 10s
    e_start = next(r for r in starts if r.data["kante"] == "E")
    e_ende = next(r for r in endes if r.data["kante"] == "E")
    assert e_ende.sim_time - e_start.sim_time == 10
