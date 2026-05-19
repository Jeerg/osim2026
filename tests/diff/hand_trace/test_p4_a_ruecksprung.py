"""Diff-Test P4-A: PDpKnRueckKonstant Hand-Trace (N=3).

Zugehöriges Markdown: `p4_a_ruecksprung.md`.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.ruecksprung import PDpKnRueckKonstant
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build() -> tuple[
    PSimulator,
    PDurchlaufplan,
    PDurchlaufplan,
    PDpKnRueckKonstant,
    PDpKnKonstant,
    PDpKaUebergang,
    PDpKaUebergang,
    PDpKaUebergang,
    PDpKaUebergang,
    PAslEinzel,
]:
    sim = PSimulator()

    sub = PDurchlaufplan(sim); sub.m_sName = "Sub"
    inner = PDpKnKonstant(sim); inner.m_sName = "Sub.K"
    inner.m_iDurchfuehrungszeit = 50
    sub.add_knoten(inner)
    kS = PDpKaUebergang(sim); kS.m_sName = "Sub.S"; kS.m_iUebergangszeit = 0
    kE = PDpKaUebergang(sim); kE.m_sName = "Sub.E"; kE.m_iUebergangszeit = 0
    sub.add_kante(kS); sub.add_kante(kE)
    sub.set_start_kante(kS); kS.m_lNachfolger.append(inner); inner.m_lKanteEin = kS
    inner.m_lKanteAus = kE; kE.m_lVorgaenger.append(inner); sub.set_end_kante(kE)

    outer = PDurchlaufplan(sim); outer.m_sName = "Outer"
    rueck = PDpKnRueckKonstant(sim); rueck.m_sName = "R"
    rueck.m_iWiederholungenZiel = 3
    rueck.set_sub_plan(sub)
    outer.add_knoten(rueck)
    okS = PDpKaUebergang(sim); okS.m_sName = "Out.S"; okS.m_iUebergangszeit = 0
    okE = PDpKaUebergang(sim); okE.m_sName = "Out.E"; okE.m_iUebergangszeit = 0
    outer.add_kante(okS); outer.add_kante(okE)
    outer.set_start_kante(okS); okS.m_lNachfolger.append(rueck); rueck.m_lKanteEin = okS
    rueck.m_lKanteAus = okE; okE.m_lVorgaenger.append(rueck); outer.set_end_kante(okE)

    sim.register_plan(outer)
    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = outer
    sim.register_ausloeser(ausl)

    return sim, outer, sub, rueck, inner, okS, okE, kS, kE, ausl


def test_p4_a_counter_matrix_matches_md() -> None:
    sim, outer, sub, rueck, inner, okS, okE, kS, kE, ausl = _build()
    sim.start()

    assert sim.m_periodNum == 1
    # Auslöser
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 150.0
    # Outer-Plan
    assert outer.m_iPtkProzessCount == 1
    assert outer.m_iPtkBegAusloesungCount == 1
    assert outer.m_iPtkAusloesungCount == 1
    # Rücksprung-Knoten
    assert rueck.m_iPtkProzessCount == 1
    assert rueck.m_iPtkBegAusloesungCount == 1
    assert rueck.m_iPtkAusloesungCount == 1
    assert rueck.m_iPtkRuecksprungCount == 2
    # Sub-Plan
    assert sub.m_iPtkProzessCount == 3
    assert sub.m_iPtkBegAusloesungCount == 3
    assert sub.m_iPtkAusloesungCount == 3
    # Sub.K
    assert inner.m_iPtkProzessCount == 3
    assert inner.m_iPtkBegAusloesungCount == 3
    assert inner.m_iPtkAusloesungCount == 3
    # Kanten
    assert okS.m_iPtkUebergangCount == 1
    assert okE.m_iPtkUebergangCount == 1
    assert kS.m_iPtkUebergangCount == 3
    assert kE.m_iPtkUebergangCount == 3
    # Event-Pool: 1 EvtAuslTriggern + 8 EvtUebergangEnde + 3 EvtBearbeitEnde
    assert sim.evt_get_sum() == 12


def test_p4_a_topic_sequence_matches_md() -> None:
    sim, *_ = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    expected = [
        (0,     0, "sim.begin"),
        (0,     0, "sim.period.begin"),
        (0,     1, "plan.ausloesen"),
        (0,     1, "kante.uebergang.start"),     # Out.S
        (0,     3, "kante.uebergang.ende"),      # Out.S
        (0,     3, "kante.weitergeben"),         # Out.S
        (0,     3, "proz.create"),               # R
        (0,     3, "kante.uebergang.start"),     # Sub.S Iter 1
        (0,     3, "kante.uebergang.ende"),      # Sub.S
        (0,     3, "kante.weitergeben"),         # Sub.S
        (0,     3, "proz.create"),               # Sub.K Iter 1
        (0,     3, "proz.bearbeit.start"),       # Sub.K, ende=50

        (50,    2, "proz.bearbeit.ende"),        # Sub.K Iter 1
        (50,    2, "kante.uebergang.start"),     # Sub.E Iter 1
        (50,    3, "kante.uebergang.ende"),      # Sub.E
        (50,    3, "kante.weitergeben"),         # Sub.E
        (50,    3, "plan.beendet_intern"),       # Sub
        (50,    3, "kante.uebergang.start"),     # Sub.S Iter 2 — VOR ruecksprung.beginn
        (50,    3, "ruecksprung.beginn"),        # wied=1
        (50,    3, "kante.uebergang.ende"),      # Sub.S
        (50,    3, "kante.weitergeben"),         # Sub.S
        (50,    3, "proz.create"),               # Sub.K Iter 2
        (50,    3, "proz.bearbeit.start"),       # Sub.K, ende=100

        (100,   2, "proz.bearbeit.ende"),        # Sub.K Iter 2
        (100,   2, "kante.uebergang.start"),     # Sub.E Iter 2
        (100,   3, "kante.uebergang.ende"),      # Sub.E
        (100,   3, "kante.weitergeben"),         # Sub.E
        (100,   3, "plan.beendet_intern"),       # Sub
        (100,   3, "kante.uebergang.start"),     # Sub.S Iter 3
        (100,   3, "ruecksprung.ende"),          # wied=2, counter=1
        (100,   3, "ruecksprung.beginn"),        # wied=2
        (100,   3, "kante.uebergang.ende"),      # Sub.S
        (100,   3, "kante.weitergeben"),         # Sub.S
        (100,   3, "proz.create"),               # Sub.K Iter 3
        (100,   3, "proz.bearbeit.start"),       # Sub.K, ende=150

        (150,   2, "proz.bearbeit.ende"),        # Sub.K Iter 3
        (150,   2, "kante.uebergang.start"),     # Sub.E Iter 3
        (150,   3, "kante.uebergang.ende"),      # Sub.E
        (150,   3, "kante.weitergeben"),         # Sub.E
        (150,   3, "plan.beendet_intern"),       # Sub
        (150,   3, "kante.uebergang.start"),     # Out.E — VOR ruecksprung.ende (FALSE-Branch)
        (150,   3, "ruecksprung.ende"),          # wied=3, counter=2
        (150,   3, "kante.uebergang.ende"),      # Out.E
        (150,   3, "kante.weitergeben"),         # Out.E
        (150,   3, "plan.beendet_intern"),       # Outer
        (150,   3, "plan.beendet"),              # A, dauer=150

        (86400, 3, "sim.period.end"),
    ]
    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\n"
        f"Erwartet ({len(expected)}):\n  "
        + "\n  ".join(repr(e) for e in expected)
        + f"\nAktuell ({len(actual)}):\n  "
        + "\n  ".join(repr(e) for e in actual)
    )


def test_p4_a_ruecksprung_event_payloads() -> None:
    """ruecksprung.beginn/ende tragen die korrekten Counter-Werte."""
    sim, *_ = _build()
    sink = TraceCaptureSink()
    sim.bus.subscribe("ruecksprung.*", sink)
    sim.start()

    beginn = sink.for_topic("ruecksprung.beginn")
    ende = sink.for_topic("ruecksprung.ende")
    assert [r.data["wiederholung"] for r in beginn] == [1, 2]
    assert [(r.data["wiederholung"], r.data["counter"]) for r in ende] == [(2, 1), (3, 2)]
    # Sim-Zeiten: zwei beginn bei t=50 und t=100, zwei ende bei t=100 und t=150
    assert [r.sim_time for r in beginn] == [50, 100]
    assert [r.sim_time for r in ende] == [100, 150]
