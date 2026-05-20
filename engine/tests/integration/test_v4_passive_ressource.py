"""V4: passive Maschine — Knoten + PRessBeleg + Warteschlange.

Test-Szenarien:
    A) Smoke — 1 Knoten + 1 PRessBeleg + 1 Auftrag (ungehindert)
    B) Konflikt — 2 Aufträge im engen Zeitfenster: zweiter wartet, läuft
       nach Freigabe weiter
    C) Counter — m_iPtkAnfragenGesamt / m_iPtkBeiAnfrageAnwesend /
       m_iPtkAnfrageErfuellt am PRessBeleg
    D) EventBus — Topics `ress.belegen` / `ress.freigeben` werden emittiert
    E) Lifecycle — Reset setzt rsFrei, on_rec_init nullt Counter
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus


def _build_one_node_one_ress(
    *,
    durchfuehrungszeit: int = 100,
    trigger_times: tuple[int, ...] = (10,),
) -> PSimulator:
    """1 Knoten + 1 PBetriebsmittel M + N Auslöser bei trigger_times[i]."""
    sim = PSimulator()

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K1"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    sim.register_knoten(knoten)

    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K1->M"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    for i, t in enumerate(trigger_times):
        ausl = PAslEinzel(sim)
        ausl.m_sName = f"A{i + 1}"
        ausl.m_iBeginTermin = t
        ausl.m_lDlpl = knoten
        sim.register_ausloeser(ausl)

    return sim


# ----------------------------------------------------------------------
# A) Smoke
# ----------------------------------------------------------------------


def test_v4_smoke_one_auftrag_belegt_und_freigegeben() -> None:
    """1 Auftrag, 1 Ressource: Status-Lebenszyklus rsFrei → rsBelegt → rsFrei."""
    sim = _build_one_node_one_ress(durchfuehrungszeit=100, trigger_times=(10,))
    sim.start()

    knoten = sim.m_lKnoten[0]
    ress = sim.m_lRessBeleg[0]

    assert sim.m_periodNum == 1
    assert ress.m_rsStatus == RessStatus.RS_FREI  # nach Ende wieder frei
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 0
    assert ress.m_iPtkAnfragenGesamt == 1
    assert ress.m_iPtkAnfrageErfuellt == 1


def test_v4_smoke_eventbus_topics_emittiert() -> None:
    """Smoke: ress.belegen + ress.freigeben werden je 1× emittiert."""
    sim = _build_one_node_one_ress(durchfuehrungszeit=50, trigger_times=(20,))

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    belegen = sink.for_topic("ress.belegen")
    freigeben = sink.for_topic("ress.freigeben")
    assert len(belegen) == 1
    assert len(freigeben) == 1
    assert belegen[0].data["ressource"] == "M"
    assert freigeben[0].data["neuer_status"] == int(RessStatus.RS_FREI)


# ----------------------------------------------------------------------
# B) Konflikt — zweiter Auftrag wartet
# ----------------------------------------------------------------------


def test_v4_konflikt_zweiter_auftrag_wartet_und_laeuft_nach_freigabe() -> None:
    """A1 startet bei t=10, läuft bis 110. A2 kommt bei t=20, wartet bis 110.

    Erwartet:
    - knoten.m_iPtkBegAusloesungCount = 3 (2 Auslösungen + 1 Re-Try aus ProzWartAusloesen)
    - knoten.m_iPtkProzRefuseCount = 1 (A2 wurde einmal abgelehnt)
    - beide Auslöser je 1× abgeschlossen
    - Ressource am Ende rsFrei
    """
    sim = _build_one_node_one_ress(
        durchfuehrungszeit=100, trigger_times=(10, 20)
    )
    sim.start()

    knoten = sim.m_lKnoten[0]
    ress = sim.m_lRessBeleg[0]

    # 2 Auslöser × 1 Auftrag, plus 1 Re-Try für A2
    assert knoten.m_iPtkBegAusloesungCount == 3
    assert knoten.m_iPtkProzRefuseCount == 1

    # Beide Aufträge sind durchgelaufen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    assert sim.m_lAusl[1].m_iPtkAusloesungCount == 1

    # Ressource am Ende frei
    assert ress.m_rsStatus == RessStatus.RS_FREI
    assert sim.m_oWarteSchl.is_empty()


def test_v4_konflikt_zweiter_auftrag_laeuft_zur_erwarteten_zeit() -> None:
    """Bus-Trace prüfen: 2. Auftrag startet exakt bei A1-Ende = 110.

    A1 ress.belegen bei t=10, ress.freigeben bei t=110.
    A2 ress.belegen bei t=110 (ProzWartAusloesen), ress.freigeben bei t=210.
    """
    sim = _build_one_node_one_ress(
        durchfuehrungszeit=100, trigger_times=(10, 20)
    )

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    belegen = sink.for_topic("ress.belegen")
    freigeben = sink.for_topic("ress.freigeben")
    assert len(belegen) == 2
    assert len(freigeben) == 2
    assert belegen[0].sim_time == 10
    assert freigeben[0].sim_time == 110
    assert belegen[1].sim_time == 110
    assert freigeben[1].sim_time == 210


# ----------------------------------------------------------------------
# C) Counter
# ----------------------------------------------------------------------


def test_v4_counter_konflikt_zwei_anfragen_eine_abgelehnt() -> None:
    """2 Aufträge → 3 Anfragen (A1: 1, A2: 1 initial + 1 Re-Try), 2 erfüllt."""
    sim = _build_one_node_one_ress(
        durchfuehrungszeit=100, trigger_times=(10, 20)
    )
    sim.start()

    ress = sim.m_lRessBeleg[0]

    assert ress.m_iPtkAnfragenGesamt == 3
    assert ress.m_iPtkBeiAnfrageAnwesend == 3   # Anw-Wahrsch=100 → immer
    assert ress.m_iPtkAnfrageErfuellt == 2


# ----------------------------------------------------------------------
# D) Sanity: V3 funktioniert weiterhin OHNE Ressourcen
# ----------------------------------------------------------------------


def test_v4_knoten_ohne_assoz_verhält_sich_wie_v1() -> None:
    """Knoten ohne Assoziationen — m_lAssozRess leer — ress_verfuegbar True."""
    sim = PSimulator()
    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K-leer"
    knoten.m_iDurchfuehrungszeit = 50
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = 30
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 0
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
