"""V6 Hand-Trace-Test: Pause unterbricht Proz, Resume mit Restzeit.

Validiert die komplette Erwartungs-Matrix aus
`v6_pause_unterbricht_proz.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.einsatzzeit import PEinsatzzeitPause, PPauseZyklus


def _build() -> PSimulator:
    sim = PSimulator()

    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    ez = PEinsatzzeitPause(sim)
    ez.m_sName = "EZ"
    ez.m_lPausen.append(
        PPauseZyklus(m_iPausAnfang=10.0, m_iPausEnde=11.0, m_iPeriode=24.0)
    )
    sim.register_einsatzzeit(ez)
    ez.attach_ressource(ress)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 5000
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K->M"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    a = PAslEinzel(sim)
    a.m_sName = "A"
    a.m_iBeginTermin = 35000
    a.m_lDlpl = knoten
    sim.register_ausloeser(a)

    return sim


def test_v6_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    ress = sim.m_lRessBeleg[0]
    knoten = sim.m_lKnoten[0]
    a = sim.m_lAusl[0]

    assert sim.m_periodNum == 1
    assert sim.m_oWarteSchl.is_empty()

    # Ressource
    assert ress.m_rsStatus == RessStatus.RS_FREI
    assert ress.m_oProzCurrent is None
    assert ress.m_iPtkAnfragenGesamt == 2
    assert ress.m_iPtkBeiAnfrageAnwesend == 2
    assert ress.m_iPtkAnfrageErfuellt == 2

    # Knoten
    assert knoten.m_iPtkBegAusloesungCount == 2
    assert knoten.m_iPtkProzRefuseCount == 0
    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_dPtkDurchlaufzeit == 5000.0

    # Auslöser
    assert a.m_iPtkBegAusloesungCount == 1
    assert a.m_iPtkAusloesungCount == 1
    assert a.m_dPtkDurchlaufzeit == 8600.0


def test_v6_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    interesting = [(r.sim_time, r.topic) for r in sink.records]
    assert interesting == [
        (35000, "ress.belegen"),
        (35000, "proz.bearbeit.start"),
        (36000, "ress.einsatz.ende"),
        (36000, "proz.bearbeit.unterbr"),
        (39600, "ress.einsatz.beginn"),
        (39600, "ress.belegen"),
        (39600, "proz.bearbeit.start"),
        (43600, "proz.bearbeit.ende"),
        (43600, "ress.freigeben"),
    ]
