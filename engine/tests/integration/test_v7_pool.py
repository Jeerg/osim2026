"""V7: Pool austauschbarer Ressourcen.

Die Pool-Semantik ist 1:1 wie in OSim2004 in `PAssozBeleg.ress_verfuegbar`
implementiert (iteriert m_lRessourcen, nimmt die ERSTE freie). Diese
Tests verifizieren das systematisch — V4 hat sie nicht abgedeckt, da
dort jede PAssozBeleg nur 1 Ressource hielt.

Zusätzlich: PRessKollektion-Stub-Klasse (1:1 zu C++ — Sim-Methoden werfen).

Test-Szenarien:
    A) 3 Maschinen, 3 zeitversetzte Aufträge → alle parallel verteilt
    B) 3 Maschinen, 4. Auftrag wartet bis erste frei
    C) First-Free-Reihenfolge (M1 bevorzugt) → Counter-Verteilung
    D) Pool-Ergebnis identisch zu sequenzieller Einzelbelegung (Smoke)
    E) PRessKollektion.ress_belegen wirft NotImplementedError
"""

from __future__ import annotations

import pytest

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.kollektion import PRessKollektion


# ----------------------------------------------------------------------
# Builders
# ----------------------------------------------------------------------


def _build_pool_scenario(
    *,
    pool_size: int,
    knoten_dauer: int,
    trigger_times: tuple[int, ...],
) -> PSimulator:
    """1 Knoten, N Ressourcen im Pool, len(trigger_times) Auslöser."""
    sim = PSimulator()

    pool: list[PBetriebsmittel] = []
    for i in range(pool_size):
        m = PBetriebsmittel(sim)
        m.m_sName = f"M{i + 1}"
        sim.register_ressource(m)
        pool.append(m)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = knoten_dauer
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K->Pool"
    for m in pool:
        assoz.m_lRessourcen.append(m)
    knoten.add_assoziation(assoz)

    for i, t in enumerate(trigger_times):
        a = PAslEinzel(sim)
        a.m_sName = f"A{i + 1}"
        a.m_iBeginTermin = t
        a.m_lDlpl = knoten
        sim.register_ausloeser(a)

    return sim


# ----------------------------------------------------------------------
# A) 3 Maschinen, 3 zeitversetzte Aufträge — alle parallel
# ----------------------------------------------------------------------


def test_v7_pool_three_jobs_run_parallel() -> None:
    """3 Aufträge bei t=10,20,30, Dauer 100 → je Auftrag bekommt M1/M2/M3.
    Alle laufen parallel, je 1 Anfrage erfüllt pro Maschine.
    """
    sim = _build_pool_scenario(
        pool_size=3, knoten_dauer=100, trigger_times=(10, 20, 30)
    )
    sim.start()

    knoten = sim.m_lKnoten[0]
    m1, m2, m3 = sim.m_lRessBeleg

    # Alle 3 Aufträge sind abgeschlossen, kein Refuse
    assert knoten.m_iPtkBegAusloesungCount == 3
    assert knoten.m_iPtkProzRefuseCount == 0
    assert knoten.m_iPtkAusloesungCount == 3
    assert sim.m_oWarteSchl.is_empty()

    # Erste Maschine kriegt A1 (zur t=10) — wird belegt + dann freigegeben
    # Bei A2@t=20 ist M1 noch belegt (bis 110), also M2 belegt
    # Bei A3@t=30 sind M1 und M2 belegt, M3 belegt
    # Counter (pro PRessBeleg):
    # M1.AnfragenGesamt: A1 (1)
    # M2.AnfragenGesamt: A2 fragt M1 (belegt, NICHT counted bei M1) ← falsch
    # Eigentlich: jede ress_verfuegbar(proz) erhöht den Counter der GERUFENEN PRessBeleg.
    # Bei A2: assoz iteriert m_lRessourcen → M1.ress_verfuegbar (Counter++ → 2) → False (rsBelegt)
    #                                       → M2.ress_verfuegbar (Counter++ → 1) → True
    # → m_iPtkAnfrageErfuellt: M2 +1
    assert m1.m_iPtkAnfragenGesamt == 3   # A1, A2, A3 fragen alle M1
    assert m2.m_iPtkAnfragenGesamt == 2   # A2, A3 fragen M2
    assert m3.m_iPtkAnfragenGesamt == 1   # nur A3 fragt M3

    assert m1.m_iPtkAnfrageErfuellt == 1  # nur A1
    assert m2.m_iPtkAnfrageErfuellt == 1  # nur A2
    assert m3.m_iPtkAnfrageErfuellt == 1  # nur A3

    # Am Ende sind alle frei
    for m in (m1, m2, m3):
        assert m.m_rsStatus == RessStatus.RS_FREI


# ----------------------------------------------------------------------
# B) 3 Maschinen, 4. Auftrag wartet
# ----------------------------------------------------------------------


def test_v7_pool_fourth_job_waits_for_first_free() -> None:
    """3 Maschinen, 4 Aufträge bei t=10,20,30,40, Dauer 100 → A4 wartet.

    A1 belegt M1 bis 110, A2 belegt M2 bis 120, A3 belegt M3 bis 130.
    A4 kommt bei 40, alle 3 belegt → Warteschlange. Bei 110 wird M1
    frei → ProzWartAusloesen → A4 startet auf M1, läuft bis 210.
    """
    sim = _build_pool_scenario(
        pool_size=3, knoten_dauer=100, trigger_times=(10, 20, 30, 40)
    )
    sim.start()

    knoten = sim.m_lKnoten[0]
    m1, m2, m3 = sim.m_lRessBeleg

    assert knoten.m_iPtkBegAusloesungCount == 5  # 4 + 1 Re-Try
    assert knoten.m_iPtkProzRefuseCount == 1     # A4 1× refused
    assert knoten.m_iPtkAusloesungCount == 4
    assert sim.m_oWarteSchl.is_empty()

    # M1 wurde 2× belegt (A1, A4), M2 nur 1× (A2), M3 nur 1× (A3)
    assert m1.m_iPtkAnfrageErfuellt == 2
    assert m2.m_iPtkAnfrageErfuellt == 1
    assert m3.m_iPtkAnfrageErfuellt == 1

    # A4 hat Dauer 210-40 = 170 = (110-40 Warte) + 100 (Aktiv)
    a4 = sim.m_lAusl[3]
    assert a4.m_dPtkDurchlaufzeit == 170


# ----------------------------------------------------------------------
# C) First-Free-Reihenfolge: M1 immer bevorzugt
# ----------------------------------------------------------------------


def test_v7_pool_first_free_strategy_prefers_m1() -> None:
    """Sequentielle Aufträge nicht-überlappend → ALLE auf M1, M2/M3 unused."""
    sim = _build_pool_scenario(
        pool_size=3, knoten_dauer=50, trigger_times=(10, 100, 200, 300)
    )
    sim.start()

    m1, m2, m3 = sim.m_lRessBeleg

    # Alle 4 Aufträge bei sequentieller Ausführung → immer M1 frei → immer M1
    assert m1.m_iPtkAnfrageErfuellt == 4
    assert m2.m_iPtkAnfrageErfuellt == 0
    assert m3.m_iPtkAnfrageErfuellt == 0
    # M2/M3: keine Anfragen weil M1 immer schon True liefert
    assert m1.m_iPtkAnfragenGesamt == 4
    assert m2.m_iPtkAnfragenGesamt == 0
    assert m3.m_iPtkAnfragenGesamt == 0


# ----------------------------------------------------------------------
# D) Pool ergibt funktional gleiches Ergebnis wie Einzel-Maschine
# ----------------------------------------------------------------------


def test_v7_pool_one_resource_equals_v4_single() -> None:
    """Pool mit 1 Ressource verhält sich wie V4-Einzel-Maschine."""
    sim = _build_pool_scenario(
        pool_size=1, knoten_dauer=100, trigger_times=(10, 20)
    )
    sim.start()

    knoten = sim.m_lKnoten[0]
    m = sim.m_lRessBeleg[0]

    # Analog V4-Konflikt-Test
    assert knoten.m_iPtkBegAusloesungCount == 3   # 2 + 1 Re-Try
    assert knoten.m_iPtkProzRefuseCount == 1
    assert m.m_iPtkAnfrageErfuellt == 2
    assert sim.m_oWarteSchl.is_empty()


# ----------------------------------------------------------------------
# E) PRessKollektion-Stub
# ----------------------------------------------------------------------


def test_v7_ress_kollektion_stub_get_anzahl() -> None:
    """PRessKollektion.get_ress_anzahl liefert Länge von m_lRessUnter."""
    sim = PSimulator()
    k = PRessKollektion(sim)
    k.m_sName = "Pool-A"
    assert k.get_ress_anzahl() == 0

    m1 = PBetriebsmittel(sim)
    m2 = PBetriebsmittel(sim)
    k.m_lRessUnter.append(m1)
    k.m_lRessUnter.append(m2)
    assert k.get_ress_anzahl() == 2


def test_v7_ress_kollektion_belegen_wirft() -> None:
    """C++-Stub: ress_belegen / ress_freigeben werfen."""
    sim = PSimulator()
    k = PRessKollektion(sim)
    with pytest.raises(NotImplementedError):
        k.ress_belegen(None)  # type: ignore[arg-type]
    with pytest.raises(NotImplementedError):
        k.ress_freigeben(None)  # type: ignore[arg-type]


def test_v7_ress_kollektion_verfuegbar_true_stub() -> None:
    """C++: returns TRUE (semantisch sinnlos, da Belegen wirft)."""
    sim = PSimulator()
    k = PRessKollektion(sim)
    assert k.ress_verfuegbar(None) is True  # type: ignore[arg-type]
