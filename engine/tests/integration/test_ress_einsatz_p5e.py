"""Integration-Tests: P5-E Ressourcen-Einsatz — Belegungs-Akzeptanz und Logik-Pins.

BEFUND AUS PLAN 01-13 TASK 1:
    Das Bosch2_wechseln-Modell hat 100 % eaKeineBelegung-Knoten.
    Kein EABELEGEN-Knoten ist erreichbar — leere Belegung ist modell-treu,
    kein Bug. Daher nutzen Tests 1+2 ein Minimal-Fixture (1 Knoten + 1 Ress
    mit eaBelegen-Default), nicht Bosch2.

Scope dieser Tests:
    Test 1: Ein Minimal-Fixture feuert ress_belegen > 0 (eaBelegen-Default-Pfad).
    Test 2: Mindestens ein m_oProzCurrent != None nach ress_belegen.
    Test 3: knoten.get_assoz_mit(beleg) liefert die korrekte PAssozBeleg.
    Test 4: PAssozBeleg.get_link_status/set_link_status — 1:1 zur C++-Logik.

Out-of-Scope (explizit):
    - Bosch2-Belegung (modell-treu leer, EAKEINEBELEGUNG dominiert)
    - Voll-P5-E/F (block_all, inc_ress, reset_status_2_base, Subset-Vergleiche)
    - WaitQueue per Ressource (m_lPtkWartschl) — Plan 01-14
"""

from __future__ import annotations

from osim_engine.decisions.strategie_rsv import AssozBelegLinkStatus
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, PRessBeleg, RessBelegListener, RessStatus


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------


def _build_one_node_eabelegen(
    *,
    durchfuehrungszeit: int = 100,
    trigger_time: int = 10,
) -> tuple[PSimulator, PRessBeleg]:
    """Minimal-Fixture: 1 Knoten (PDpKnKonstant) + 1 PBetriebsmittel.

    m_eRessUsage ist EABELEGEN (der Default des EPEntscheidungsAufgabe-Basiswerts).
    Da PDpKnKonstant kein EPEntscheidungsAufgabe ist, ruft es direkt
    PDlplKnoten.bearbeit_beginnen -> PAssozBeleg.ress_verfuegbar -> ress_belegen.
    Das ist der eaBelegen-Default-Pfad wie er in Python bereits vollständig vorhanden ist.
    """
    sim = PSimulator()

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K1"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    sim.register_knoten(knoten)

    ress = PBetriebsmittel(sim)
    ress.m_sName = "Maschine1"
    sim.register_ressource(ress)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K1->Maschine1"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A1"
    ausl.m_iBeginTermin = trigger_time
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    return sim, ress


class _BelegCountListener(RessBelegListener):
    """Misst ress_belegen-Aufrufe und ob m_oProzCurrent gesetzt wurde."""

    def __init__(self) -> None:
        super().__init__()
        self.belegen_count: int = 0
        self.max_proz_current_seen: int = 0  # Anzahl der "non-None m_oProzCurrent" Snapshots

    def on_proz_beginn(self, proz) -> None:
        self.belegen_count += 1
        if proz is not None:
            self.max_proz_current_seen += 1


# ---------------------------------------------------------------------------
# Test 1 + 2: Belegungs-Acceptance auf Minimal-Fixture
# ---------------------------------------------------------------------------


def test_minimal_fixture_ress_belegen_feuert() -> None:
    """Test 1: eaBelegen-Default-Pfad — ress_belegen wird aufgerufen.

    Regressions-Wächter: Falls dieser Test auf 0 fällt, ist die
    PAssozBeleg.ress_verfuegbar -> PRessBeleg.ress_belegen-Kette gebrochen.
    """
    sim, ress = _build_one_node_eabelegen(trigger_time=10)
    listener = _BelegCountListener()
    listener.attach(ress)

    sim.start()

    assert listener.belegen_count > 0, (
        f"ress_belegen wurde 0 Mal aufgerufen — eaBelegen-Pfad "
        f"(PAssozBeleg.ress_verfuegbar -> PRessBeleg.ress_belegen) ist gebrochen."
    )


def test_minimal_fixture_m_oproz_current_gesetzt() -> None:
    """Test 2: Nach ress_belegen hat m_oProzCurrent != None gelebt.

    Misst über RessBelegListener.on_proz_beginn, dass der Prozess
    wirklich eingetragen wurde (PRessBeleg.ress_belegen setzt m_oProzCurrent).
    """
    sim, ress = _build_one_node_eabelegen(trigger_time=10)
    listener = _BelegCountListener()
    listener.attach(ress)

    sim.start()

    assert listener.max_proz_current_seen > 0, (
        f"m_oProzCurrent wurde nie gesetzt (on_proz_beginn nie mit non-None proz aufgerufen). "
        f"ress_belegen_count={listener.belegen_count}"
    )


# ---------------------------------------------------------------------------
# Test 3: get_assoz_mit — 1:1 zur C++-GetAssozMit-Logik
# ---------------------------------------------------------------------------


def test_get_assoz_mit_liefert_korrekte_assoz() -> None:
    """Test 3: knoten.get_assoz_mit(beleg) gibt die PAssozBeleg zurück, die beleg enthält.

    1:1 zu C++ PDlplKnoten::GetAssozMit (PDlplKnoten.cpp).
    """
    sim = PSimulator()

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K_assoz_test"

    ress_a = PBetriebsmittel(sim)
    ress_a.m_sName = "RessA"
    ress_b = PBetriebsmittel(sim)
    ress_b.m_sName = "RessB"
    ress_andere = PBetriebsmittel(sim)
    ress_andere.m_sName = "RessAndere"

    assoz_ab = PAssozBeleg(sim)
    assoz_ab.m_sName = "K->AB"
    assoz_ab.m_lRessourcen.extend([ress_a, ress_b])
    knoten.add_assoziation(assoz_ab)

    # Test: Ressource in der Assoz gefunden
    result_a = knoten.get_assoz_mit(ress_a)
    assert result_a is assoz_ab, (
        f"get_assoz_mit(ress_a) sollte assoz_ab zurückgeben, erhielt {result_a}"
    )

    result_b = knoten.get_assoz_mit(ress_b)
    assert result_b is assoz_ab, (
        f"get_assoz_mit(ress_b) sollte assoz_ab zurückgeben, erhielt {result_b}"
    )

    # Test: Ressource NICHT in einer Assoz — None
    result_keine = knoten.get_assoz_mit(ress_andere)
    assert result_keine is None, (
        f"get_assoz_mit(ress_andere) sollte None zurückgeben, erhielt {result_keine}"
    )


def test_get_assoz_mit_ohne_assoz_liefert_none() -> None:
    """Test 3b: Knoten ohne jede Assoz — get_assoz_mit liefert None."""
    sim = PSimulator()
    knoten = PDpKnKonstant(sim)
    ress = PBetriebsmittel(sim)

    result = knoten.get_assoz_mit(ress)
    assert result is None


# ---------------------------------------------------------------------------
# Test 4: PAssozBeleg.get_link_status / set_link_status — 1:1 C++-Logik
# ---------------------------------------------------------------------------


def test_link_status_default_abl_std() -> None:
    """Test 4a: Default-LinkStatus = ABL_STD wenn beleg in m_lRessourcen.

    C++: PAssozBeleg::GetLinkStatus — wenn IsEntFunktOn=False: return ABL_STD.
    Wenn sim.m_bIsEntAktiv=False (Default), gibt get_link_status immer ABL_STD.
    """
    sim = PSimulator()
    # Default: m_bIsEntAktiv = False
    assert not getattr(sim, "m_bIsEntAktiv", False), "Test setzt m_bIsEntAktiv=False voraus"

    assoz = PAssozBeleg(sim)
    ress = PBetriebsmittel(sim)
    ress.m_sName = "R1"
    assoz.m_lRessourcen.append(ress)

    status = assoz.get_link_status(ress)
    assert status == AssozBelegLinkStatus.ABL_STD, (
        f"get_link_status ohne EntFunktOn sollte ABL_STD sein, erhielt {status}"
    )


def test_link_status_not_in_list_abl_blocked() -> None:
    """Test 4b: Ressource NICHT in m_lRessourcen → get_link_status = ABL_BLOCKED.

    1:1 zur C++-Logik: wenn beleg nicht in m_lRessourcen, ist Status undefined/blocked.
    """
    sim = PSimulator()
    assoz = PAssozBeleg(sim)
    ress_in = PBetriebsmittel(sim)
    ress_out = PBetriebsmittel(sim)
    assoz.m_lRessourcen.append(ress_in)

    status = assoz.get_link_status(ress_out)
    assert status == AssozBelegLinkStatus.ABL_BLOCKED, (
        f"get_link_status für nicht-enthaltene Ressource sollte ABL_BLOCKED sein, erhielt {status}"
    )


def test_set_link_status_und_get_link_status_mit_ent_aktiv() -> None:
    """Test 4c: set_link_status/get_link_status mit m_bIsEntAktiv=True.

    C++: SetLinkStatus setzt m_LinkStatusList; GetLinkStatus liest sie.
    1:1 zur C++-Reihenfolge: set dann get = gesetzter Wert.
    """
    sim = PSimulator()
    sim.m_bIsEntAktiv = True  # Entscheider-Funktion an

    assoz = PAssozBeleg(sim)
    ress = PBetriebsmittel(sim)
    assoz.m_lRessourcen.append(ress)

    # Default bleibt ABL_STD
    assert assoz.get_link_status(ress) == AssozBelegLinkStatus.ABL_STD

    # Setze auf ABL_PREFER
    assoz.set_link_status(ress, AssozBelegLinkStatus.ABL_PREFER)
    assert assoz.get_link_status(ress) == AssozBelegLinkStatus.ABL_PREFER, (
        "Nach set_link_status(ABL_PREFER) sollte get_link_status ABL_PREFER liefern."
    )

    # Setze auf ABL_BLOCKED
    assoz.set_link_status(ress, AssozBelegLinkStatus.ABL_BLOCKED)
    assert assoz.get_link_status(ress) == AssozBelegLinkStatus.ABL_BLOCKED


def test_get_base_link_status_unveraendert_nach_set() -> None:
    """Test 4d: get_base_link_status bleibt ABL_STD, auch nach set_link_status.

    C++: SetLinkStatus ändert nur den aktuellen Status, nicht den Base-Status.
    get_base_link_status bleibt ABL_STD bis set_base_link_status aufgerufen wird.
    """
    sim = PSimulator()
    sim.m_bIsEntAktiv = True

    assoz = PAssozBeleg(sim)
    ress = PBetriebsmittel(sim)
    assoz.m_lRessourcen.append(ress)

    assoz.set_link_status(ress, AssozBelegLinkStatus.ABL_BLOCKED)

    base = assoz.get_base_link_status(ress)
    assert base == AssozBelegLinkStatus.ABL_STD, (
        f"get_base_link_status sollte ABL_STD bleiben nach set_link_status, erhielt {base}"
    )
