"""V5.5 Hand-Trace-Test: Load-balanced Speicher-Verteilung.

Validiert die Erwartungs-Tabelle aus `v5_5_speicher_load_balanced.md`:
3 Auslöser → 2 Speicher mit C++ `<=`-Vergleich (letzter bei Gleichstand
bevorzugt).
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.speicher import PAssozSpeicher
from osim_engine.resources.speicher import PSpeicherProz


def _build() -> PSimulator:
    sim = PSimulator()

    s1 = PSpeicherProz(sim); s1.m_sName = "S1"
    sim.register_speicher_proz(s1)
    s2 = PSpeicherProz(sim); s2.m_sName = "S2"
    sim.register_speicher_proz(s2)

    assoz = PAssozSpeicher(sim); assoz.m_sName = "K->[S1,S2]"
    assoz.m_lSpeicher.extend([s1, s2])

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)
    knoten.set_assoziation_speicher(assoz)

    for i, t in enumerate((10, 20, 30)):
        a = PAslEinzel(sim); a.m_sName = f"A{i + 1}"
        a.m_iBeginTermin = t; a.m_lDlpl = knoten
        sim.register_ausloeser(a)

    return sim


def test_v5_5_hand_trace_counter_matrix() -> None:
    sim = _build()
    sim.start()

    knoten = sim.m_lKnoten[0]
    s1, s2 = sim.m_lSpeichProz

    # Knoten: 3 Prozesse erzeugt, KEINE Bearbeitung
    assert knoten.m_iPtkProzessCount == 3
    assert knoten.m_iPtkBegAusloesungCount == 0
    assert knoten.m_iPtkAusloesungCount == 0
    assert len(knoten.m_lProzesse) == 0

    # Verteilung: S1=1 (nur A2), S2=2 (A1 + A3)
    assert s1.get_proz_anzahl() == 1
    assert s2.get_proz_anzahl() == 2

    # Auslöser: alle 3 haben dlpl_ausloesen 1×, aber nie on_dlpl_beendet
    for a in sim.m_lAusl:
        assert a.m_iPtkBegAusloesungCount == 1
        assert a.m_iPtkAusloesungCount == 0


def test_v5_5_hand_trace_eventbus_reihenfolge() -> None:
    sim = _build()
    sink = TraceCaptureSink()
    sink_create = TraceCaptureSink()
    sim.bus.subscribe("speicher.einfuegen", sink)
    sim.bus.subscribe("proz.create", sink_create)
    sim.start()

    speicher_events = [(r.sim_time, r.data["speicher"], r.data["anzahl"])
                       for r in sink.records]
    assert speicher_events == [
        (10, "S2", 1),   # A1 → S2 (Gleichstand, letzter)
        (20, "S1", 1),   # A2 → S1 (S1=0 < S2=1)
        (30, "S2", 2),   # A3 → S2 (Gleichstand 1=1, letzter)
    ]

    create_events = [r.sim_time for r in sink_create.records]
    assert create_events == [10, 20, 30]
