"""V1-Smoke-Test: 1 Auslöser, 1 Knoten, 1 Auslösung, 1 Tag Sim-Zeit.

Verifiziert dass der End-to-End-Sim-Pfad funktioniert:
    1. PAslEinzel plant EvtAuslTriggern bei m_iBeginTermin
    2. Bei dem Event → PtTrigger wird erzeugt, dlpl_ausloesen am Knoten
    3. PDpKnKonstant.proz_weitergeben instanziiert PtProzZeitvorgabe + bearbeit_beginnen
    4. Bei EvtBearbeitEnde → on_proz_beendet am Knoten + on_dlpl_beendet am Auslöser
    5. Periode endet bei 86400 s

Zusätzlich prüft Counter und EventBus-Topics.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build_scenario(begin_termin: int = 100, durchfuehrungszeit: int = 500) -> PSimulator:
    """Baut: 1 Knoten + 1 Auslöser. Auslöser löst bei begin_termin aus,
    Knoten bearbeitet durchfuehrungszeit Sekunden lang."""
    sim = PSimulator()

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "Bearbeitung"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "Erzeugnis-1"
    ausl.m_iBeginTermin = begin_termin
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    return sim


def test_v1_smoke_one_period_one_trigger() -> None:
    """1 Tag, 1 Auslöser bei t=100, Bearbeitungszeit 500s. Erwartetes Ergebnis:
    nach Sim-Ende ist 1 Auslösung abgeschlossen, 1 BegAuslösung."""
    sim = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sim.start()

    # Periode ist fertig
    assert sim.m_periodNum == 1
    assert sim.m_periodBegin == 86400

    # Auslöser hat genau 1 Auslösung abgeschlossen
    ausl = sim.m_lAusl[0]
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1

    # Knoten ebenfalls
    knoten = sim.m_lKnoten[0]
    assert knoten.m_iPtkProzessCount == 1   # ein Prozess wurde erzeugt
    # m_iPtkBegAusloesungCount wird in PDlplKnoten.bearbeit_beginnen erhöht
    assert knoten.m_iPtkBegAusloesungCount == 1
    # m_iPtkAusloesungCount nur wenn is_ptk — in V1 default m_ptkBegin=0,
    # also Protokoll an ab Sekunde 0 → ja, gleich 1
    assert knoten.m_iPtkAusloesungCount == 1

    # Knoten-Prozessliste ist leer (Prozess wurde nach Ende entfernt)
    assert knoten.m_lProzesse == []


def test_v1_smoke_proz_dauer_matches_durchfuehrungszeit() -> None:
    """Begin-Topic + End-Topic liegen genau durchfuehrungszeit Sekunden auseinander."""
    sim = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    starts = sink.for_topic("proz.bearbeit.start")
    endes = sink.for_topic("proz.bearbeit.ende")
    assert len(starts) == 1
    assert len(endes) == 1
    assert endes[0].sim_time - starts[0].sim_time == 500


def test_v1_smoke_period_events_emitted() -> None:
    """sim.begin, sim.period.begin, sim.period.end Topics."""
    sim = _build_scenario()
    sink = TraceCaptureSink()
    sim.bus.subscribe("sim.*", sink)
    sim.start()

    topics = sink.topics()
    assert "sim.begin" in topics
    assert "sim.period.begin" in topics
    assert "sim.period.end" in topics

    period_end_rec = sink.for_topic("sim.period.end")[0]
    assert period_end_rec.data["period_num"] == 0
    assert period_end_rec.data["end_time"] == 86400


def test_v1_smoke_plan_events_emitted() -> None:
    """plan.ausloesen + plan.beendet Topics."""
    sim = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sink = TraceCaptureSink()
    sim.bus.subscribe("plan.*", sink)
    sim.start()

    ausl_recs = sink.for_topic("plan.ausloesen")
    beendet_recs = sink.for_topic("plan.beendet")
    assert len(ausl_recs) == 1
    assert len(beendet_recs) == 1

    assert ausl_recs[0].sim_time == 100  # bei begin_termin
    assert beendet_recs[0].sim_time == 600  # 100 + 500
    assert beendet_recs[0].data["dauer"] == 500


def test_v1_smoke_seed_reset_between_runs() -> None:
    """Zwei Sim-Läufe mit gleichem Setup produzieren identische Ergebnisse."""
    from osim_engine.core import distribution as dist_module

    # Lauf 1
    sim1 = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sim1.start()
    counter1 = sim1.m_lAusl[0].m_iPtkAusloesungCount

    # LCG reset durch conftest.py-Fixture geschieht beim nächsten Test, hier
    # manuell für die zweite Sim
    dist_module.s_verteil._keim_intern = dist_module.STD_KEIM

    # Lauf 2
    sim2 = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sim2.start()
    counter2 = sim2.m_lAusl[0].m_iPtkAusloesungCount

    assert counter1 == counter2 == 1


def test_v1_event_pool_emptied() -> None:
    """Nach 1 Periode ohne Periode-übergreifende Events ist der Pool leer."""
    sim = _build_scenario(begin_termin=100, durchfuehrungszeit=500)
    sim.start()
    assert sim.evt_get_cur() == 0
    # Aber sumEvent = mind. 2 (EvtAuslTriggern + EvtBearbeitEnde)
    assert sim.evt_get_sum() >= 2


def test_v1_smoke_event_outside_period_does_not_run() -> None:
    """Auslöser bei t=200000 (> 1 Tag) → in 1 Periode keine Ausführung."""
    sim = _build_scenario(begin_termin=200_000, durchfuehrungszeit=500)
    sim.start()

    ausl = sim.m_lAusl[0]
    assert ausl.m_iPtkBegAusloesungCount == 0
    assert ausl.m_iPtkAusloesungCount == 0
    # Periode ist trotzdem fertig
    assert sim.m_periodBegin == 86400


def test_v1_smoke_two_periods_reaches_late_event() -> None:
    """Auslöser bei t=100000 (in Periode 2) → erst nach 2 start()-Aufrufen ausgeführt."""
    sim = _build_scenario(begin_termin=100_000, durchfuehrungszeit=500)
    sim.start()  # Periode 1 (0..86400)
    # Noch nicht ausgeführt
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 0

    sim.start()  # Periode 2 (86400..172800)
    # Jetzt ausgeführt
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
