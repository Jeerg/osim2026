"""V5 Hand-Trace-Test: Erzeuger → Lager → Verbraucher mit Wartepfad.

Validiert die Erwartungs-Tabelle aus `v5_erzeuger_verbraucher.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.menge import PAssozMengeErzgt, PAssozMengeVerbr
from osim_engine.resources.menge import PRessMenge


def _build() -> PSimulator:
    sim = PSimulator()

    lager = PRessMenge(sim)
    lager.m_sName = "L"
    lager.m_iBestandAnfang = 0
    lager.m_iBestandMax = -1
    sim.register_ress_menge(lager)

    erzeuger = PDpKnKonstant(sim)
    erzeuger.m_sName = "E"
    erzeuger.m_iDurchfuehrungszeit = 50
    sim.register_knoten(erzeuger)

    assoz_e = PAssozMengeErzgt(sim)
    assoz_e.m_sName = "E->L"
    assoz_e.m_lMengRess = lager
    assoz_e.m_iMengeAus = 1
    erzeuger.add_assoziation(assoz_e)

    verbraucher = PDpKnKonstant(sim)
    verbraucher.m_sName = "V"
    verbraucher.m_iDurchfuehrungszeit = 30
    sim.register_knoten(verbraucher)

    assoz_v = PAssozMengeVerbr(sim)
    assoz_v.m_sName = "V->L"
    assoz_v.m_lMengRess = lager
    assoz_v.m_iMengeEin = 1
    verbraucher.add_assoziation(assoz_v)

    a_e = PAslEinzel(sim)
    a_e.m_sName = "A"
    a_e.m_iBeginTermin = 10
    a_e.m_lDlpl = erzeuger
    sim.register_ausloeser(a_e)

    a_v = PAslEinzel(sim)
    a_v.m_sName = "B"
    a_v.m_iBeginTermin = 20
    a_v.m_lDlpl = verbraucher
    sim.register_ausloeser(a_v)

    return sim


def test_v5_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    lager = sim.m_lRessMenge[0]
    erzeuger, verbraucher = sim.m_lKnoten[0], sim.m_lKnoten[1]
    a_e, a_v = sim.m_lAusl[0], sim.m_lAusl[1]

    assert sim.m_periodNum == 1
    assert sim.m_oWarteSchl.is_empty()

    # Lager
    assert lager.m_iBestandAktuell == 0
    assert lager.m_iPtkKummErzgMengeGesamt == 1
    assert lager.m_iPtkKummVerbMengeGesamt == 1
    assert lager.m_iPtkAnfragenZu == 1
    assert lager.m_iPtkAnfragenAb == 2
    assert lager.m_iPtkAbgelehnteAnfrAb == 1
    assert lager.m_iPtkAbgelehnteAnfrZu == 0

    # Knoten
    assert erzeuger.m_iPtkBegAusloesungCount == 1
    assert erzeuger.m_iPtkAusloesungCount == 1
    assert verbraucher.m_iPtkBegAusloesungCount == 2
    assert verbraucher.m_iPtkProzRefuseCount == 1
    assert verbraucher.m_iPtkAusloesungCount == 1

    # Auslöser
    assert a_e.m_iPtkAusloesungCount == 1
    assert a_v.m_iPtkAusloesungCount == 1


def test_v5_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic, r.data["bestand"]) for r in sink.records]
    assert events == [
        (60, "ress.zubuchen", 1),
        (60, "ress.abbuchen", 0),
    ]
