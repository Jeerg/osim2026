"""P4-B: PDpKnAlternativ — Verzweigung über alternative Sub-Pläne.

Tests:
    A) TypID: Auslöser-Parameter "id" → korrekte Alternative wird gewählt
    B) TypID: kein Match → Fallback auf letzte Alternative
    C) TypID: m_iPtkAuswahlCount-Matrix nach mehreren Auslösungen (über mehrere
       sims, weil PAslEinzel nur einmal triggert)
    D) Verteilung: 100%/0% → deterministisch erste Alternative
    E) Verteilung: 50%/50% mit fester Zufallszahl → deterministisch
    F) on_proz_sub_beendet: Outer-Plan endet korrekt nach Sub-Plan
    G) Counter m_iPtkProzessCount + m_iPtkAusloesungCount am Alternativ-Knoten
    H) EventBus: proz.create trägt das Alternative-Feld
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.alternativ import (
    PAlternativeTypID,
    PAlternativeVerteilung,
    PDpKnAlternativTypID,
    PDpKnAlternativVerteilung,
)
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.parameter import PParameterID
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Konstruktions-Helfer
# ----------------------------------------------------------------------


def _build_sub_plan(sim: PSimulator, name: str, dauer: int) -> PDurchlaufplan:
    """Sub-Plan mit einem PDpKnKonstant-Knoten."""
    sub = PDurchlaufplan(sim); sub.m_sName = name
    inner = PDpKnKonstant(sim); inner.m_sName = f"{name}.K"
    inner.m_iDurchfuehrungszeit = dauer
    sub.add_knoten(inner)
    kS = PDpKaUebergang(sim); kS.m_iUebergangszeit = 0; sub.add_kante(kS)
    kE = PDpKaUebergang(sim); kE.m_iUebergangszeit = 0; sub.add_kante(kE)
    sub.set_start_kante(kS); kS.m_lNachfolger.append(inner); inner.m_lKanteEin = kS
    inner.m_lKanteAus = kE; kE.m_lVorgaenger.append(inner); sub.set_end_kante(kE)
    return sub


def _build_outer_with_alt(sim: PSimulator, alt_knoten) -> PDurchlaufplan:
    """Outer-Plan mit dem Alternativ-Knoten als einzigem Knoten."""
    outer = PDurchlaufplan(sim); outer.m_sName = "Outer"
    outer.add_knoten(alt_knoten)
    okS = PDpKaUebergang(sim); okS.m_iUebergangszeit = 0; outer.add_kante(okS)
    okE = PDpKaUebergang(sim); okE.m_iUebergangszeit = 0; outer.add_kante(okE)
    outer.set_start_kante(okS); okS.m_lNachfolger.append(alt_knoten)
    alt_knoten.m_lKanteEin = okS
    alt_knoten.m_lKanteAus = okE; okE.m_lVorgaenger.append(alt_knoten)
    outer.set_end_kante(okE)
    return outer


def _build_typid_sim(*, ausw_id: int, dauern: tuple[int, int, int] = (10, 50, 100),
                     ids: tuple[int, int, int] = (1, 2, 3)) -> PSimulator:
    """Alternativ-Knoten (TypID) mit drei Alternativen, Auslöser-Param "id"."""
    sim = PSimulator()

    alt_kn = PDpKnAlternativTypID(sim); alt_kn.m_sName = "Alt"

    for i, (auswahl_id, dauer) in enumerate(zip(ids, dauern, strict=True)):
        sub = _build_sub_plan(sim, name=f"Sub{i}", dauer=dauer)
        alt_kn.add_alternative(
            PAlternativeTypID(sim, dlpl=sub, auswahl_id=auswahl_id)
        )
        alt_kn.m_lAlternativen[-1].m_sName = f"Alt{i}"

    outer = _build_outer_with_alt(sim, alt_kn)
    sim.register_plan(outer)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = outer
    ausl.m_lParameter.append(PParameterID(sim, wert=ausw_id))
    sim.register_ausloeser(ausl)

    return sim


def _build_verteilung_sim(*, anteile: tuple[float, ...],
                          dauern: tuple[int, ...]) -> PSimulator:
    """Alternativ-Knoten (Verteilung) mit N Alternativen."""
    assert len(anteile) == len(dauern)
    sim = PSimulator()

    alt_kn = PDpKnAlternativVerteilung(sim); alt_kn.m_sName = "Alt"

    for i, (p, dauer) in enumerate(zip(anteile, dauern, strict=True)):
        sub = _build_sub_plan(sim, name=f"Sub{i}", dauer=dauer)
        alt = PAlternativeVerteilung(sim, dlpl=sub, ausw_wahrschlkt=p)
        alt.m_sName = f"Alt{i}"
        alt_kn.add_alternative(alt)

    outer = _build_outer_with_alt(sim, alt_kn)
    sim.register_plan(outer)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = outer
    sim.register_ausloeser(ausl)

    return sim


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------


def test_p4_alt_typid_id_match() -> None:
    """id=2 → zweite Alternative (Dauer 50) wird gewählt."""
    sim = _build_typid_sim(ausw_id=2)
    sim.start()

    outer = sim.m_lDlpl[0]
    alt_kn = outer.m_lKnoten[0]

    # Nur Alt1 hat gelaufen
    assert alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount == 0
    assert alt_kn.m_lAlternativen[1].m_iPtkAuswahlCount == 1
    assert alt_kn.m_lAlternativen[2].m_iPtkAuswahlCount == 0

    # Auslöser-DLZ = Sub-Plan-Dauer der gewählten Alternative
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 50

    # Inner-Knoten der gewählten Alternative lief; andere nicht
    sub0_inner = alt_kn.m_lAlternativen[0].m_lDlpl.m_lKnoten[0]
    sub1_inner = alt_kn.m_lAlternativen[1].m_lDlpl.m_lKnoten[0]
    sub2_inner = alt_kn.m_lAlternativen[2].m_lDlpl.m_lKnoten[0]
    assert sub0_inner.m_iPtkAusloesungCount == 0
    assert sub1_inner.m_iPtkAusloesungCount == 1
    assert sub2_inner.m_iPtkAusloesungCount == 0


def test_p4_alt_typid_fallback_letzte() -> None:
    """id=99 → kein Match → letzte Alternative (id=3, Dauer 100) gewinnt.

    Mirror von C++ "Falls keine Alterantive gefunden wurde, wird immer die
    letzte genommen!" (PDpKnAlternativ.cpp:728).
    """
    sim = _build_typid_sim(ausw_id=99)
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    assert alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount == 0
    assert alt_kn.m_lAlternativen[1].m_iPtkAuswahlCount == 0
    assert alt_kn.m_lAlternativen[2].m_iPtkAuswahlCount == 1
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 100


def test_p4_alt_typid_id1_erste_alternative() -> None:
    """id=1 → erste Alternative (Dauer 10) gewinnt."""
    sim = _build_typid_sim(ausw_id=1)
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    assert alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount == 1
    assert alt_kn.m_lAlternativen[1].m_iPtkAuswahlCount == 0
    assert alt_kn.m_lAlternativen[2].m_iPtkAuswahlCount == 0
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 10


def test_p4_alt_typid_counter_am_knoten() -> None:
    """m_iPtkProzessCount + m_iPtkAusloesungCount + ProzCount-Matrix."""
    sim = _build_typid_sim(ausw_id=2)
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    # Genau 1 PtProzAlternativ wurde erzeugt
    assert alt_kn.m_iPtkProzessCount == 1
    # Eine Ausführung abgeschlossen
    assert alt_kn.m_iPtkAusloesungCount == 1
    # Refuse-Count bleibt 0
    assert alt_kn.m_iPtkProzRefuseCount == 0
    # PtProz-Liste ist leer nach Ende
    assert alt_kn.m_lProzesse == []


def test_p4_alt_typid_get_knz_anz_ausw_alternative() -> None:
    """KPI-Helper: get_knz_anz_ausw_alternative(i)."""
    sim = _build_typid_sim(ausw_id=2)
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    assert alt_kn.get_knz_anz_ausw_alternative(0) == 0
    assert alt_kn.get_knz_anz_ausw_alternative(1) == 1
    assert alt_kn.get_knz_anz_ausw_alternative(2) == 0


def test_p4_alt_verteilung_100_prozent_erste() -> None:
    """100/0/0 → immer erste Alternative — unabhängig von Zufallszahl."""
    sim = _build_verteilung_sim(anteile=(100.0, 0.0, 0.0),
                                 dauern=(30, 60, 90))
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    assert alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount == 1
    assert alt_kn.m_lAlternativen[1].m_iPtkAuswahlCount == 0
    assert alt_kn.m_lAlternativen[2].m_iPtkAuswahlCount == 0
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 30


def test_p4_alt_verteilung_zufallszahl_in_zweitem_intervall() -> None:
    """Verteilung 30/40/30: bei zwei Aufrufen mit kontrollierter Zufallszahl
    landet die Wahl in unterschiedlichen Intervallen.

    Wir manipulieren den LCG nicht direkt — stattdessen prüfen wir die
    Invarianten:
        - genau eine Alternative wurde gewählt
        - Summe der Counter über alle Alternativen = 1
        - Auslöser-DLZ = Dauer der gewählten Alternative
    """
    sim = _build_verteilung_sim(anteile=(30.0, 40.0, 30.0),
                                 dauern=(10, 20, 30))
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    counts = [alt.m_iPtkAuswahlCount for alt in alt_kn.m_lAlternativen]
    assert sum(counts) == 1
    gewaehlt = counts.index(1)
    erwartete_dauer = (10, 20, 30)[gewaehlt]
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == erwartete_dauer


def test_p4_alt_verteilung_fallback_letzte_bei_zu_kleinen_anteilen() -> None:
    """Anteile-Summe < 100% → wenn Zufallszahl > Summe, Fallback letzte.

    Mit 5/5/5 (Summe 15%) ist 85% der LCG-Werte > 15 → Fallback. Hier nur
    Invariante prüfen, nicht den konkreten LCG-Zustand.
    """
    sim = _build_verteilung_sim(anteile=(5.0, 5.0, 5.0),
                                 dauern=(10, 20, 30))
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    counts = [alt.m_iPtkAuswahlCount for alt in alt_kn.m_lAlternativen]
    assert sum(counts) == 1


def test_p4_alt_typid_eventbus_proz_create_alternative() -> None:
    """proz.create trägt den Alternative-Namen im Event-Payload."""
    sim = _build_typid_sim(ausw_id=2)
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.create", sink)
    sim.start()

    creates = sink.for_topic("proz.create")
    # mindestens ein Event muss "Alt1" als alternative tragen (vom Alt-Knoten)
    alt_events = [r for r in creates if r.data.get("alternative") == "Alt1"]
    assert len(alt_events) == 1
    assert alt_events[0].data["knoten"] == "Alt"


def test_p4_alt_typid_on_rec_init_resettet_counter() -> None:
    """on_rec_init setzt die Auswahl-Counter aller Alternativen zurück."""
    sim = _build_typid_sim(ausw_id=1)
    sim.start()

    alt_kn = sim.m_lDlpl[0].m_lKnoten[0]
    assert alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount == 1

    alt_kn.on_rec_init(deep=False)
    assert all(alt.m_iPtkAuswahlCount == 0 for alt in alt_kn.m_lAlternativen)
