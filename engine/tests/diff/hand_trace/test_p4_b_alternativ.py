"""Diff-Test P4-B: PDpKnAlternativTypID Hand-Trace.

Zugehöriges Markdown: `p4_b_alternativ.md`.

Zwei Szenarien:
    A) id=2  → mittlere Alternative (Alt1, Dauer 50)
    B) id=99 → Fallback letzte (Alt2, Dauer 100)
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.alternativ import (
    PAlternativeTypID,
    PDpKnAlternativTypID,
)
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.parameter import PParameterID
from osim_engine.pps.simulator import PSimulator


def _build(ausw_id: int) -> tuple[
    PSimulator,
    PDurchlaufplan,
    PDpKnAlternativTypID,
    PDpKaUebergang,
    PDpKaUebergang,
    PAslEinzel,
]:
    sim = PSimulator()
    alt_kn = PDpKnAlternativTypID(sim); alt_kn.m_sName = "Alt"

    for i, (auswahl_id, dauer) in enumerate([(1, 10), (2, 50), (3, 100)]):
        sub = PDurchlaufplan(sim); sub.m_sName = f"Sub{i}"
        inner = PDpKnKonstant(sim); inner.m_sName = f"Sub{i}.K"
        inner.m_iDurchfuehrungszeit = dauer
        sub.add_knoten(inner)
        kS = PDpKaUebergang(sim); kS.m_sName = f"Sub{i}.S"; kS.m_iUebergangszeit = 0
        kE = PDpKaUebergang(sim); kE.m_sName = f"Sub{i}.E"; kE.m_iUebergangszeit = 0
        sub.add_kante(kS); sub.add_kante(kE)
        sub.set_start_kante(kS); kS.m_lNachfolger.append(inner); inner.m_lKanteEin = kS
        inner.m_lKanteAus = kE; kE.m_lVorgaenger.append(inner); sub.set_end_kante(kE)
        alt = PAlternativeTypID(sim, dlpl=sub, auswahl_id=auswahl_id)
        alt.m_sName = f"Alt{i}"
        alt_kn.add_alternative(alt)

    outer = PDurchlaufplan(sim); outer.m_sName = "Outer"
    outer.add_knoten(alt_kn)
    okS = PDpKaUebergang(sim); okS.m_sName = "Out.S"; okS.m_iUebergangszeit = 0
    okE = PDpKaUebergang(sim); okE.m_sName = "Out.E"; okE.m_iUebergangszeit = 0
    outer.add_kante(okS); outer.add_kante(okE)
    outer.set_start_kante(okS); okS.m_lNachfolger.append(alt_kn); alt_kn.m_lKanteEin = okS
    alt_kn.m_lKanteAus = okE; okE.m_lVorgaenger.append(alt_kn); outer.set_end_kante(okE)

    sim.register_plan(outer)
    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = outer
    ausl.m_lParameter.append(PParameterID(sim, wert=ausw_id))
    sim.register_ausloeser(ausl)

    return sim, outer, alt_kn, okS, okE, ausl


def _expected_topic_sequence(gewaehlter_index: int, dauer: int) -> list[tuple[int, int, str]]:
    """Strukturgleicher Trace für Szenario A und B — nur der gewählte
    Sub-Plan-Name und die Sub-Plan-Dauer wandern.
    """
    sub = f"Sub{gewaehlter_index}"
    return [
        (0,         0, "sim.begin"),
        (0,         0, "sim.period.begin"),
        (0,         1, "plan.ausloesen"),
        (0,         1, "kante.uebergang.start"),   # Out.S
        (0,         3, "kante.uebergang.ende"),    # Out.S
        (0,         3, "kante.weitergeben"),       # Out.S
        (0,         3, "proz.create"),             # Alt
        (0,         3, "kante.uebergang.start"),   # SubN.S
        (0,         3, "kante.uebergang.ende"),    # SubN.S
        (0,         3, "kante.weitergeben"),       # SubN.S
        (0,         3, "proz.create"),             # SubN.K
        (0,         3, "proz.bearbeit.start"),     # SubN.K, ende=dauer
        (dauer,     2, "proz.bearbeit.ende"),      # SubN.K
        (dauer,     2, "kante.uebergang.start"),   # SubN.E
        (dauer,     3, "kante.uebergang.ende"),    # SubN.E
        (dauer,     3, "kante.weitergeben"),       # SubN.E
        (dauer,     3, "plan.beendet_intern"),     # SubN
        (dauer,     3, "kante.uebergang.start"),   # Out.E
        (dauer,     3, "kante.uebergang.ende"),    # Out.E
        (dauer,     3, "kante.weitergeben"),       # Out.E
        (dauer,     3, "plan.beendet_intern"),     # Outer
        (dauer,     3, "plan.beendet"),            # A
        (86400,     3, "sim.period.end"),
    ]


def test_p4_b_szenario_a_id2_counter_matrix() -> None:
    sim, outer, alt_kn, okS, okE, ausl = _build(ausw_id=2)
    sim.start()

    assert sim.m_periodNum == 1
    # Auslöser
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 50.0
    # Outer-Plan
    assert outer.m_iPtkProzessCount == 1
    assert outer.m_iPtkBegAusloesungCount == 1
    assert outer.m_iPtkAusloesungCount == 1
    # Alt-Knoten
    assert alt_kn.m_iPtkProzessCount == 1
    assert alt_kn.m_iPtkBegAusloesungCount == 1
    assert alt_kn.m_iPtkAusloesungCount == 1
    assert alt_kn.m_iPtkProzRefuseCount == 0
    # Alternativen: nur Alt1 gewählt
    counts = [a.m_iPtkAuswahlCount for a in alt_kn.m_lAlternativen]
    assert counts == [0, 1, 0]
    # Sub1 lief, Sub0+Sub2 nicht
    sub_plans = [a.m_lDlpl for a in alt_kn.m_lAlternativen]
    inners = [sp.m_lKnoten[0] for sp in sub_plans]
    assert [sp.m_iPtkAusloesungCount for sp in sub_plans] == [0, 1, 0]
    assert [k.m_iPtkAusloesungCount for k in inners] == [0, 1, 0]
    # Outer-Kanten
    assert okS.m_iPtkUebergangCount == 1
    assert okE.m_iPtkUebergangCount == 1
    # Event-Pool: 1 EvtAuslTriggern + 4 EvtUebergangEnde + 1 EvtBearbeitEnde
    assert sim.evt_get_sum() == 6


def test_p4_b_szenario_a_id2_topic_sequence() -> None:
    sim, *_ = _build(ausw_id=2)
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    expected = _expected_topic_sequence(gewaehlter_index=1, dauer=50)
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\n"
        f"Erwartet ({len(expected)}):\n  "
        + "\n  ".join(repr(e) for e in expected)
        + f"\nAktuell ({len(actual)}):\n  "
        + "\n  ".join(repr(e) for e in actual)
    )


def test_p4_b_szenario_a_proz_create_traegt_alternative() -> None:
    sim, *_ = _build(ausw_id=2)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.create", sink)
    sim.start()

    creates = sink.for_topic("proz.create")
    # Erstes proz.create ist Alt selbst (mit alternative-Feld)
    alt_event = next(r for r in creates if r.data["knoten"] == "Alt")
    assert alt_event.data["alternative"] == "Alt1"
    # Zweites ist Sub1.K (ohne alternative-Feld)
    sub_event = next(r for r in creates if r.data["knoten"] == "Sub1.K")
    assert "alternative" not in sub_event.data or sub_event.data.get("alternative") is None


def test_p4_b_szenario_b_id99_fallback_counter_matrix() -> None:
    sim, outer, alt_kn, okS, okE, ausl = _build(ausw_id=99)
    sim.start()

    # Fallback auf Alt2 (letzte Alternative), Dauer=100
    assert ausl.m_dPtkDurchlaufzeit == 100.0
    counts = [a.m_iPtkAuswahlCount for a in alt_kn.m_lAlternativen]
    assert counts == [0, 0, 1]
    sub_plans = [a.m_lDlpl for a in alt_kn.m_lAlternativen]
    assert [sp.m_iPtkAusloesungCount for sp in sub_plans] == [0, 0, 1]
    # Alt-Knoten-Counter strukturgleich zu Szenario A
    assert alt_kn.m_iPtkProzessCount == 1
    assert alt_kn.m_iPtkAusloesungCount == 1
    assert sim.evt_get_sum() == 6


def test_p4_b_szenario_b_id99_topic_sequence() -> None:
    sim, *_ = _build(ausw_id=99)
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    expected = _expected_topic_sequence(gewaehlter_index=2, dauer=100)
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\n"
        f"Erwartet ({len(expected)}):\n  "
        + "\n  ".join(repr(e) for e in expected)
        + f"\nAktuell ({len(actual)}):\n  "
        + "\n  ".join(repr(e) for e in actual)
    )


def test_p4_b_szenario_b_proz_create_traegt_alt2() -> None:
    sim, *_ = _build(ausw_id=99)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.create", sink)
    sim.start()

    creates = sink.for_topic("proz.create")
    alt_event = next(r for r in creates if r.data["knoten"] == "Alt")
    assert alt_event.data["alternative"] == "Alt2"
