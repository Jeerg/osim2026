"""V7 Hand-Trace-Test: 3-Maschinen-Pool mit Wartepfad.

Validiert die Erwartungs-Tabelle aus `v7_pool_three_machines.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus


def _build() -> PSimulator:
    sim = PSimulator()
    pool = []
    for i in range(3):
        m = PBetriebsmittel(sim)
        m.m_sName = f"M{i + 1}"
        sim.register_ressource(m)
        pool.append(m)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K->Pool"
    for m in pool:
        assoz.m_lRessourcen.append(m)
    knoten.add_assoziation(assoz)

    for i, t in enumerate((10, 20, 30, 40)):
        a = PAslEinzel(sim)
        a.m_sName = f"A{i + 1}"
        a.m_iBeginTermin = t
        a.m_lDlpl = knoten
        sim.register_ausloeser(a)

    return sim


def test_v7_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    knoten = sim.m_lKnoten[0]
    m1, m2, m3 = sim.m_lRessBeleg

    # Knoten
    assert knoten.m_iPtkBegAusloesungCount == 5  # 4 initial + 1 Re-Try
    assert knoten.m_iPtkProzRefuseCount == 1
    assert knoten.m_iPtkAusloesungCount == 4
    assert knoten.m_dPtkDurchlaufzeit == 400.0

    # Anfragen pro Maschine (first-free → M1 oft gefragt)
    assert m1.m_iPtkAnfragenGesamt == 5
    assert m2.m_iPtkAnfragenGesamt == 3
    assert m3.m_iPtkAnfragenGesamt == 2

    # Erfüllt (= belegt)
    assert m1.m_iPtkAnfrageErfuellt == 2  # A1 + A4 (Re-Try)
    assert m2.m_iPtkAnfrageErfuellt == 1  # A2
    assert m3.m_iPtkAnfrageErfuellt == 1  # A3

    # Auslöser
    assert sim.m_lAusl[3].m_dPtkDurchlaufzeit == 170  # A4: 70 Warte + 100 Aktiv

    # Endzustand
    assert sim.m_oWarteSchl.is_empty()
    for m in (m1, m2, m3):
        assert m.m_rsStatus == RessStatus.RS_FREI


def test_v7_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic, r.data["ressource"]) for r in sink.records]
    assert events == [
        (10, "ress.belegen", "M1"),
        (20, "ress.belegen", "M2"),
        (30, "ress.belegen", "M3"),
        (110, "ress.freigeben", "M1"),
        (110, "ress.belegen", "M1"),
        (120, "ress.freigeben", "M2"),
        (130, "ress.freigeben", "M3"),
        (210, "ress.freigeben", "M1"),
    ]
