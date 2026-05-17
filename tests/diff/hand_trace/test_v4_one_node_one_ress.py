"""V4 Hand-Trace-Test: 1 Knoten + 1 PRessBeleg + 2 Aufträge mit Konflikt.

Validiert sämtliche Zellen der Erwartungs-Tabelle in
`v4_one_node_one_ress.md`. Wenn dieser Test bricht, ist entweder die
Implementierung gegen den C++-Pfad gewichen — oder die Trace-Datei muss
zusammen mit dem Code aktualisiert werden.
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

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K1"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)

    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K1->M"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    a1 = PAslEinzel(sim)
    a1.m_sName = "A1"
    a1.m_iBeginTermin = 10
    a1.m_lDlpl = knoten
    sim.register_ausloeser(a1)

    a2 = PAslEinzel(sim)
    a2.m_sName = "A2"
    a2.m_iBeginTermin = 20
    a2.m_lDlpl = knoten
    sim.register_ausloeser(a2)

    return sim


def test_v4_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    knoten = sim.m_lKnoten[0]
    ress = sim.m_lRessBeleg[0]
    a1, a2 = sim.m_lAusl[0], sim.m_lAusl[1]

    # Sim
    assert sim.m_periodNum == 1
    assert sim.m_oWarteSchl.is_empty()

    # Knoten
    assert knoten.m_iPtkBegAusloesungCount == 3  # 2 + 1 Re-Try
    assert knoten.m_iPtkProzRefuseCount == 1
    assert knoten.m_iPtkProzessCount == 2
    assert knoten.m_iPtkAusloesungCount == 2
    assert knoten.m_dPtkDurchlaufzeit == 200.0

    # Auslöser
    assert a1.m_iPtkBegAusloesungCount == 1
    assert a1.m_iPtkAusloesungCount == 1
    assert a2.m_iPtkBegAusloesungCount == 1
    assert a2.m_iPtkAusloesungCount == 1

    # Ressource
    assert ress.m_rsStatus == RessStatus.RS_FREI
    assert ress.m_iPtkAnfragenGesamt == 3
    assert ress.m_iPtkBeiAnfrageAnwesend == 3
    assert ress.m_iPtkAnfrageErfuellt == 2

    # Event-Pool
    assert sim.evt_get_sum() == 4  # 2× EvtAuslTriggern + 2× EvtBearbeitEnde


def test_v4_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic, r.data["neuer_status"] if "neuer_status" in r.data else None)
              for r in sink.records]

    assert events == [
        (10, "ress.belegen", None),
        (110, "ress.freigeben", int(RessStatus.RS_FREI)),
        (110, "ress.belegen", None),
        (210, "ress.freigeben", int(RessStatus.RS_FREI)),
    ]
