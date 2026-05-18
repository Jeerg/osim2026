"""V6.5 Hand-Trace-Test: PEinsatzzeitTag mit Mittagspause + Proz-Resume.

Validiert die Counter-Matrix und EventBus-Reihenfolge aus
`v6_5_einsatzzeit_tag_mittagspause.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.einsatzzeit import (
    PEinsatzzeitTag,
    PTagesEinsatzzeit,
)


def _build() -> PSimulator:
    sim = PSimulator()

    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    ez = PEinsatzzeitTag(sim)
    ez.m_sName = "EZ-Tag"
    ez.m_lTagesEinsatzzeit.append(PTagesEinsatzzeit(8.0, 12.0))
    ez.m_lTagesEinsatzzeit.append(PTagesEinsatzzeit(13.0, 17.0))
    sim.register_einsatzzeit(ez)
    ez.attach_tag_ress(tag=0, beleg=ress)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 10_000
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K->M"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    a = PAslEinzel(sim)
    a.m_sName = "A"
    a.m_iBeginTermin = 42_000
    a.m_lDlpl = knoten
    sim.register_ausloeser(a)

    return sim


def test_v6_5_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    ress = sim.m_lRessBeleg[0]
    knoten = sim.m_lKnoten[0]
    a = sim.m_lAusl[0]

    assert sim.m_periodNum == 1
    assert sim.m_oWarteSchl.is_empty()

    # Ressource: am Ende in Pause (END_FOR_DAY-Event)
    assert ress.m_rsStatus == RessStatus.RS_PAUSE

    # Knoten
    assert knoten.m_iPtkBegAusloesungCount == 2
    assert knoten.m_iPtkProzRefuseCount == 0
    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_dPtkDurchlaufzeit == 10_000.0  # ohne Pause

    # Auslöser: Trigger→Ende inkl. Pause
    assert a.m_iPtkAusloesungCount == 1
    assert a.m_dPtkDurchlaufzeit == 13_600  # 1200 + 3600 Pause + 8800


def test_v6_5_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    interesting = [(r.sim_time, r.topic) for r in sink.records]
    assert interesting == [
        (0, "ress.einsatz.ende"),       # INIT
        (28800, "ress.einsatz.beginn"), # Vormittag-Start
        (42000, "ress.belegen"),
        (42000, "proz.bearbeit.start"),
        (43200, "ress.einsatz.ende"),   # Vormittag-Ende
        (43200, "proz.bearbeit.unterbr"),
        (46800, "ress.einsatz.beginn"), # Nachmittag-Start
        (46800, "ress.belegen"),
        (46800, "proz.bearbeit.start"),
        (55600, "proz.bearbeit.ende"),
        (55600, "ress.freigeben"),
        (61200, "ress.einsatz.ende"),   # END_FOR_DAY
    ]
