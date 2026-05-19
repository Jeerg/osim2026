"""Diff-Test P4-C: PDpKnMenge + PDpKnMengeRuesten Hand-Trace.

Zugehöriges Markdown: `p4_c_menge.md`.

Zwei Szenarien — gleiche End-Zeit, andere Dauer-Zerlegung:
    A) PDpKnMenge        — menge=5, dfz=10 → Dauer 50 (5 × 10)
    B) PDpKnMengeRuesten — menge=3, dfz=10, ruest=20 → Dauer 50 (3 × 10 + 20)
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnMenge, PDpKnMengeRuesten
from osim_engine.pps.parameter import PParameterMenge
from osim_engine.pps.simulator import PSimulator


def _build_menge(
    *, menge: int, dfz_pro_einheit: int, knoten_name: str = "M"
) -> tuple[PSimulator, PDurchlaufplan, PDpKnMenge, PDpKaUebergang, PDpKaUebergang, PAslEinzel]:
    sim = PSimulator()
    knoten = PDpKnMenge(sim); knoten.m_sName = knoten_name
    knoten.m_iDfzProEinheit = dfz_pro_einheit

    plan = PDurchlaufplan(sim); plan.m_sName = "Plan"; plan.add_knoten(knoten)
    kS = PDpKaUebergang(sim); kS.m_sName = "S"; kS.m_iUebergangszeit = 0
    kE = PDpKaUebergang(sim); kE.m_sName = "E"; kE.m_iUebergangszeit = 0
    plan.add_kante(kS); plan.add_kante(kE)
    plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
    knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

    sim.register_plan(plan)
    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    ausl.m_lParameter.append(PParameterMenge(sim, wert=menge))
    sim.register_ausloeser(ausl)
    return sim, plan, knoten, kS, kE, ausl


def _build_menge_ruesten(
    *, menge: int, dfz_pro_einheit: int, ruestzeit: int
) -> tuple[PSimulator, PDurchlaufplan, PDpKnMengeRuesten, PDpKaUebergang, PDpKaUebergang, PAslEinzel]:
    sim = PSimulator()
    knoten = PDpKnMengeRuesten(sim); knoten.m_sName = "MR"
    knoten.m_iDfzProEinheit = dfz_pro_einheit
    knoten.m_iRuestzeit = ruestzeit

    plan = PDurchlaufplan(sim); plan.m_sName = "Plan"; plan.add_knoten(knoten)
    kS = PDpKaUebergang(sim); kS.m_sName = "S"; kS.m_iUebergangszeit = 0
    kE = PDpKaUebergang(sim); kE.m_sName = "E"; kE.m_iUebergangszeit = 0
    plan.add_kante(kS); plan.add_kante(kE)
    plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
    knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

    sim.register_plan(plan)
    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    ausl.m_lParameter.append(PParameterMenge(sim, wert=menge))
    sim.register_ausloeser(ausl)
    return sim, plan, knoten, kS, kE, ausl


def _expected_topic_sequence() -> list[tuple[int, int, str]]:
    """15-Event-Sequenz für beide Szenarien (identisch)."""
    return [
        (0,     0, "sim.begin"),
        (0,     0, "sim.period.begin"),
        (0,     1, "plan.ausloesen"),
        (0,     1, "kante.uebergang.start"),    # S
        (0,     3, "kante.uebergang.ende"),     # S
        (0,     3, "kante.weitergeben"),        # S
        (0,     3, "proz.create"),
        (0,     3, "proz.bearbeit.start"),      # ende_zeit=50
        (50,    2, "proz.bearbeit.ende"),
        (50,    2, "kante.uebergang.start"),    # E
        (50,    3, "kante.uebergang.ende"),     # E
        (50,    3, "kante.weitergeben"),        # E
        (50,    3, "plan.beendet_intern"),
        (50,    3, "plan.beendet"),             # dauer=50
        (86400, 3, "sim.period.end"),
    ]


# ----------------------------------------------------------------------
# Szenario A: PDpKnMenge — menge × dfz_pro_einheit
# ----------------------------------------------------------------------


def test_p4_c_szenario_a_menge_counter_matrix() -> None:
    sim, plan, knoten, kS, kE, ausl = _build_menge(menge=5, dfz_pro_einheit=10)
    sim.start()

    assert sim.m_periodNum == 1
    # Auslöser
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 50.0
    # Plan
    assert plan.m_iPtkProzessCount == 1
    assert plan.m_iPtkBegAusloesungCount == 1
    assert plan.m_iPtkAusloesungCount == 1
    # Knoten
    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_iPtkKumDurchfuehrungszeit == 50
    assert knoten.m_iPtkDurchfuehrungszeitCount == 1
    assert knoten.m_dPtkDurchlaufzeit == 50.0
    # Kanten
    assert kS.m_iPtkUebergangCount == 1
    assert kE.m_iPtkUebergangCount == 1
    # Event-Pool
    assert sim.evt_get_sum() == 4


def test_p4_c_szenario_a_menge_topic_sequence() -> None:
    sim, *_ = _build_menge(menge=5, dfz_pro_einheit=10)
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    expected = _expected_topic_sequence()
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\n"
        f"Erwartet ({len(expected)}):\n  "
        + "\n  ".join(repr(e) for e in expected)
        + f"\nAktuell ({len(actual)}):\n  "
        + "\n  ".join(repr(e) for e in actual)
    )


def test_p4_c_szenario_a_proz_bearbeit_start_traegt_ende_zeit_50() -> None:
    """get_durchfuehrungszeit liefert 5×10=50 — proz.bearbeit.start trägt ende_zeit=50."""
    sim, *_ = _build_menge(menge=5, dfz_pro_einheit=10)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.bearbeit.start", sink)
    sim.start()
    starts = sink.for_topic("proz.bearbeit.start")
    assert len(starts) == 1
    assert starts[0].data["ende_zeit"] == 50


# ----------------------------------------------------------------------
# Szenario B: PDpKnMengeRuesten — menge × dfz + ruestzeit
# ----------------------------------------------------------------------


def test_p4_c_szenario_b_menge_ruesten_counter_matrix() -> None:
    sim, plan, knoten, kS, kE, ausl = _build_menge_ruesten(
        menge=3, dfz_pro_einheit=10, ruestzeit=20
    )
    sim.start()

    # Gleiche End-Zeit wie Szenario A
    assert ausl.m_dPtkDurchlaufzeit == 50.0
    # Kum-Counter enthält Gesamtdauer (inkl. Rüstzeit)
    assert knoten.m_iPtkKumDurchfuehrungszeit == 50
    assert knoten.m_iPtkDurchfuehrungszeitCount == 1
    # Knoten-Counter strukturgleich zu Szenario A
    assert knoten.m_iPtkProzessCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert sim.evt_get_sum() == 4


def test_p4_c_szenario_b_menge_ruesten_topic_sequence() -> None:
    sim, *_ = _build_menge_ruesten(menge=3, dfz_pro_einheit=10, ruestzeit=20)
    sink = TraceCaptureSink()
    sim.bus.subscribe("*", sink)
    sim.start()

    actual = [(r.sim_time, r.sub_time, r.topic) for r in sink.records]
    expected = _expected_topic_sequence()
    assert actual == expected, (
        f"Topic-Sequenz weicht ab:\n"
        f"Erwartet ({len(expected)}):\n  "
        + "\n  ".join(repr(e) for e in expected)
        + f"\nAktuell ({len(actual)}):\n  "
        + "\n  ".join(repr(e) for e in actual)
    )


def test_p4_c_szenario_b_proz_bearbeit_start_ende_zeit_summiert_ruest() -> None:
    """3×10 + 20 = 50 wird als ende_zeit emittiert."""
    sim, *_ = _build_menge_ruesten(menge=3, dfz_pro_einheit=10, ruestzeit=20)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.bearbeit.start", sink)
    sim.start()
    starts = sink.for_topic("proz.bearbeit.start")
    assert len(starts) == 1
    assert starts[0].data["ende_zeit"] == 50
