"""V8 Hand-Trace-Test: Knoten mit Maschine + Material gleichzeitig.

Validiert die Erwartungs-Tabelle aus `v8_multi_assoz_machine_material.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.assoziation.menge import PAssozMengeVerbr
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.menge import PRessMenge


def _build() -> PSimulator:
    sim = PSimulator()

    maschine = PBetriebsmittel(sim)
    maschine.m_sName = "M"
    sim.register_ressource(maschine)

    lager = PRessMenge(sim)
    lager.m_sName = "L"
    lager.m_iBestandAnfang = 3
    sim.register_ress_menge(lager)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)

    a_m = PAssozBeleg(sim)
    a_m.m_sName = "K->M"
    a_m.m_lRessourcen.append(maschine)
    knoten.add_assoziation(a_m)

    a_l = PAssozMengeVerbr(sim)
    a_l.m_sName = "K->L"
    a_l.m_lMengRess = lager
    a_l.m_iMengeEin = 1
    knoten.add_assoziation(a_l)

    a = PAslEinzel(sim)
    a.m_sName = "A"
    a.m_iBeginTermin = 10
    a.m_lDlpl = knoten
    sim.register_ausloeser(a)

    return sim


def test_v8_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    knoten = sim.m_lKnoten[0]
    maschine = sim.m_lRessBeleg[0]
    lager = sim.m_lRessMenge[0]

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 0
    assert knoten.m_iPtkAusloesungCount == 1

    assert maschine.m_rsStatus == RessStatus.RS_FREI
    assert maschine.m_iPtkAnfragenGesamt == 1
    assert maschine.m_iPtkAnfrageErfuellt == 1

    assert lager.m_iBestandAktuell == 2
    assert lager.m_iPtkKummVerbMengeGesamt == 1
    assert lager.m_iPtkAnfragenAb == 1


def test_v8_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    interesting = [(r.sim_time, r.topic) for r in sink.records]
    assert interesting == [
        (10, "ress.belegen"),
        (10, "ress.abbuchen"),
        (10, "proz.bearbeit.start"),
        (110, "proz.bearbeit.ende"),
        (110, "ress.freigeben"),
    ]
