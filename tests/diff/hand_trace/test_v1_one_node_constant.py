"""Automatisierter Vergleich der V1-Sim-Ausführung gegen den Hand-Trace
in `v1_one_node_constant.md`.

Pro Tabellen-Zeile im Markdown ein Assert; bei Divergenz: konkret melden,
welche Erwartung verletzt wurde.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build_scenario() -> tuple[PSimulator, PDpKnKonstant, PAslEinzel]:
    sim = PSimulator()

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 500
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = 100
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    return sim, knoten, ausl


def test_hand_trace_counters_match_md() -> None:
    """Counter-Tabelle aus v1_one_node_constant.md."""
    sim, knoten, ausl = _build_scenario()
    sim.start()

    assert sim.m_periodNum == 1
    assert sim.m_periodBegin == 86400

    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 500.0

    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_lProzesse == []

    assert sim.evt_get_sum() == 2
    assert sim.evt_get_cur() == 0


def test_hand_trace_eventbus_topics_match_md() -> None:
    """EventBus-Trace-Tabelle aus v1_one_node_constant.md."""
    sim, knoten, ausl = _build_scenario()
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    # Erwartete (Zeit, Topic)-Paare in Reihenfolge
    expected = [
        (0,     "sim.begin"),
        (0,     "sim.period.begin"),
        (100,   "plan.ausloesen"),
        (100,   "proz.create"),
        (100,   "proz.bearbeit.start"),
        (600,   "proz.bearbeit.ende"),
        (600,   "plan.beendet"),
        (86400, "sim.period.end"),
    ]
    actual = [(r.sim_time, r.topic) for r in sink.records]

    # Manche Topics werden zur selben Sim-Zeit emittiert; Reihenfolge innerhalb
    # gleicher sim_time entspricht der Code-Ausführung
    assert actual == expected, (
        f"EventBus-Trace weicht ab:\nErwartet: {expected}\nAktuell:  {actual}"
    )


def test_hand_trace_data_fields_match_md() -> None:
    """Stichproben der Data-Felder aus dem Hand-Trace."""
    sim, knoten, ausl = _build_scenario()
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    by_topic = {r.topic: r.data for r in sink.records}

    assert by_topic["sim.begin"] == {"begin_time": 0}
    assert by_topic["sim.period.begin"] == {"period_num": 0, "begin_time": 0}
    assert by_topic["sim.period.end"] == {"period_num": 0, "end_time": 86400}

    assert by_topic["plan.ausloesen"]["ausloeser"] == "A"
    assert by_topic["plan.ausloesen"]["trigger_id"] == "A.trig0"
    assert by_topic["plan.ausloesen"]["target"] == "K"

    assert by_topic["proz.create"]["proz_id"] == "A|K"
    assert by_topic["proz.create"]["knoten"] == "K"
    assert by_topic["proz.create"]["trigger_id"] == "A.trig0"

    assert by_topic["proz.bearbeit.start"]["proz_id"] == "A|K"
    assert by_topic["proz.bearbeit.start"]["knoten"] == "K"
    assert by_topic["proz.bearbeit.start"]["ende_zeit"] == 600

    assert by_topic["proz.bearbeit.ende"]["proz_id"] == "A|K"
    assert by_topic["proz.bearbeit.ende"]["knoten"] == "K"

    assert by_topic["plan.beendet"]["dauer"] == 500


def test_hand_trace_subtime_priorities() -> None:
    """sub_time-Werte der emitierten Events stimmen mit den $event(N)-Annotations."""
    sim, knoten, ausl = _build_scenario()
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    by_topic = {r.topic: r.sub_time for r in sink.records}

    # Events während EvtAuslTriggern (sub_time=1) — alle vom Auslöser-Pfad
    assert by_topic["plan.ausloesen"] == 1
    assert by_topic["proz.create"] == 1
    assert by_topic["proz.bearbeit.start"] == 1

    # Events während EvtBearbeitEnde (sub_time=2)
    assert by_topic["proz.bearbeit.ende"] == 2
    assert by_topic["plan.beendet"] == 2
