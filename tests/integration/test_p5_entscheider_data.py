"""P5-A + P5-B — Tests für Entscheider-Datenstrukturen + EPAslEntAufExtern.

Slice P5-A: Container-Klassen (EPEntInformation, EPEntInformationssystem,
EPZiel, EPKrzDurchlaufzeit, EPZelSystem, EPEntFeld, EPEntStrategie),
EPAszEntFeld als Assoz, Loader-Wiring.

Slice P5-B: EPAslEntAufExtern (Auslöser mit täglicher Wiederholung).

Diese Tests sichern Lade- und Strukturkorrektheit. Die Entscheider-Logik
selbst ist über `PSimulator.m_bIsEntAktiv` (default `False`) deaktiviert
— so bleibt das Sim-Verhalten unverändert zur V9-Slice.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.decisions import (
    EPEntFeld,
    EPEntInformation,
    EPEntInformationssystem,
    EPEntStrategie,
    EPKrzDurchlaufzeit,
    EPZelSystem,
    EPZiel,
)
from osim_engine.pps.ausloeser.ent_extern import EPAslEntAufExtern
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.ent_feld import EPAszEntFeld


# ----------------------------------------------------------------------
# Container-Klassen — Datenform
# ----------------------------------------------------------------------


def test_ep_ent_information_default_normierung() -> None:
    info = EPEntInformation()
    assert info.m_iObereGrenze == -1
    assert info.m_iUntereGrenze == -1
    assert info.m_bIsMin is False


def test_ep_ent_informationssystem_lookup_by_name_and_id() -> None:
    sys_ = EPEntInformationssystem()
    a = EPEntInformation()
    a.m_sName = "DLZ"
    a.m_iID = 100
    b = EPEntInformation()
    b.m_sName = "Auslastung"
    b.m_iID = 200
    sys_.m_lInformationen.append(a)
    sys_.m_lInformationen.append(b)

    assert sys_.is_info_in_system_by_name("DLZ") is True
    assert sys_.is_info_in_system_by_name("Unbekannt") is False
    assert sys_.is_info_in_system_by_id(200) is True
    assert sys_.is_info_in_system_by_id(999) is False
    assert sys_.get_info_by_name("Auslastung") is b
    assert sys_.get_info_by_id(100) is a
    assert sys_.get_info_by_name("Foo") is None


def test_ep_ziel_default_ausrichtung_1() -> None:
    """1 = größer ist besser. EPEntscheidung.odh:106."""
    z = EPZiel()
    assert z.m_iAusrichtung == 1
    assert z.m_iGewichtung == 1


def test_ep_krz_durchlaufzeit_is_subtype_of_epziel() -> None:
    """C++: `EPKrzDurchlaufzeit : $public EPZiel`."""
    z = EPKrzDurchlaufzeit()
    assert isinstance(z, EPZiel)


def test_ep_zel_system_enthaelt_ziele() -> None:
    zs = EPZelSystem()
    zs.m_lEpZiel.append(EPKrzDurchlaufzeit())
    assert len(zs.m_lEpZiel) == 1


def test_ep_ent_feld_treffe_ohne_strategie_liefert_none() -> None:
    """EPEntFeld ohne Strategie → None. EPEntscheidung.cpp:265-271."""
    ef = EPEntFeld()
    assert ef.treffe_entscheidung(None, None) is None


def test_ep_ent_strategie_basis_ist_abstrakt() -> None:
    """Basis-Methoden müssen NotImplementedError werfen."""
    s = EPEntStrategie()
    with pytest.raises(NotImplementedError):
        s.creat_std_ziel_system()
    with pytest.raises(NotImplementedError):
        s.creat_std_informations_system()
    with pytest.raises(NotImplementedError):
        s.treffe_entscheidung(None, None, None)


# ----------------------------------------------------------------------
# EPAszEntFeld — Belegungs-Assoz
# ----------------------------------------------------------------------


def test_ep_asz_ent_feld_default_leer() -> None:
    aef = EPAszEntFeld()
    assert aef.is_empty() is True
    assert len(aef.m_lEntFeldTupel) == 0


def test_ep_asz_ent_feld_get_feld_with_beleg_findet_treffer() -> None:
    aef = EPAszEntFeld()
    ef1 = EPEntFeld()
    ef2 = EPEntFeld()
    # Mock einer PRessBeleg-Instanz (irgendein Identitäts-Objekt)
    beleg_a = object()
    beleg_b = object()
    ef1.m_oPPerson = beleg_a
    ef2.m_oPPerson = beleg_b
    aef.m_lEntFeldTupel.extend([ef1, ef2])
    assert aef.get_feld_with_beleg(beleg_b) is ef2
    assert aef.get_feld_with_beleg(object()) is None


def test_ep_asz_ent_feld_ress_verfuegbar_geguarded_durch_ent_aktiv() -> None:
    """`m_bIsEntAktiv=False` (Default in Slice P5-A) → keine Belegung."""
    sim = PSimulator()
    aef = EPAszEntFeld(sim)
    assert sim.m_bIsEntAktiv is False
    assert aef.ress_verfuegbar(None) is False  # type: ignore[arg-type]


def test_ep_asz_ent_feld_on_rec_init_initialisiert_counter_arrays() -> None:
    aef = EPAszEntFeld()
    aef.m_lEntFeldTupel.extend([EPEntFeld(), EPEntFeld(), EPEntFeld()])
    aef.on_rec_init(deep=True)
    assert len(aef.m_aPtkZeitBelegung) == 3
    assert len(aef.m_aTmpZeitBelegung) == 3
    assert all(v == 0.0 for v in aef.m_aPtkZeitBelegung)


def test_ep_asz_ent_feld_get_proz_kost_konstant_null() -> None:
    """C++: immer 0.0 (EPEntscheidung.cpp:400-403)."""
    aef = EPAszEntFeld()
    assert aef.get_proz_kost() == 0.0


# ----------------------------------------------------------------------
# EPAslEntAufExtern
# ----------------------------------------------------------------------


def test_ep_asl_ent_auf_extern_defaults() -> None:
    a = EPAslEntAufExtern(PSimulator())
    assert a.m_iBeginTermin == 0
    assert a.m_bTaeglichWiederholen is False


def test_ep_asl_ent_auf_extern_get_knz_einmalig_liefert_1() -> None:
    """`GetKnzPrgAuftragsanzahl` bei einmaliger Auslösung: 1."""
    sim = PSimulator()
    sim.start()  # Initialisiert m_periodBegin etc.
    a = EPAslEntAufExtern(sim)
    a.m_bTaeglichWiederholen = False
    assert a.get_knz_prg_auftragsanzahl() == 1


def test_ep_asl_ent_auf_extern_get_knz_taegl_zaehlt_tage() -> None:
    """Bei `m_bTaeglichWiederholen=True`: Anzahl Tage seit Sim-Begin."""
    sim = PSimulator()
    a = EPAslEntAufExtern(sim)
    a.m_bTaeglichWiederholen = True
    # evt_curr_time() fällt ohne aktives Event auf m_periodBegin zurück
    sim.m_periodBegin = 86400 * 2  # 2 Tage simuliert
    assert a.get_knz_prg_auftragsanzahl() == 2


# ----------------------------------------------------------------------
# OTX-Loader — Bosch2 (P5-A/B-relevantes Modell)
# ----------------------------------------------------------------------


_BOSCH2 = Path(
    r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
)


@pytest.fixture
def bosch2_loaded():
    if not _BOSCH2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")
    from osim_engine.io.otx_loader import load_otx_file
    return load_otx_file(_BOSCH2)


def test_bosch2_loader_phase5_klassen_geladen(bosch2_loaded) -> None:
    """Coverage: alle P5-A/B-Klassen aus Bosch2 sind im Loader-Result."""
    loaded = bosch2_loaded.loaded
    assert loaded["EPEntInformation"] == 6
    assert loaded["EPEntInformationssystem"] == 4
    assert loaded["EPEntFeld"] == 4
    assert loaded["EPAszEntFeld"] == 4
    assert loaded["EPAslEntAufExtern"] == 4


def test_bosch2_loader_unsupported_nur_noch_p5cdef(bosch2_loaded) -> None:
    """Nach P5-A/B sind nur noch konkrete Strategien + Aufgaben-Knoten offen."""
    expected = {
        "EPEntStrKrzRessArbSuchen",
        "EPEntKrzRessourcenEinsatzRess",
        "EPEntStrArbVertMitWechsel",
        "EPEntKrzKapazitaetsVeraenderung",
    }
    assert set(bosch2_loaded.unsupported) <= expected, (
        f"Unerwartete unsupported Klassen: {set(bosch2_loaded.unsupported) - expected}"
    )


def test_bosch2_psimulator_ent_listen_befuellt(bosch2_loaded) -> None:
    """ASimulator-Handler verteilt EPEntInformation/EntFeld auf die PSimulator-Listen."""
    sim = bosch2_loaded.simulator
    # Bosch2 hat 4 EntInformationssysteme und 4 EntFelder auf ASimulator-Ebene
    assert len(sim.m_lEntInfo) == 4
    assert len(sim.m_lEntFeld) == 4


def test_bosch2_python_sim_laeuft_durch(bosch2_loaded) -> None:
    """Smoke: Bosch2 Python-Sim läuft mit P5-A/B-Klassen weiterhin durch."""
    from osim_engine.io.otx_diff import extract_counters_from_simulator
    bosch2_loaded.simulator.start()
    counters = extract_counters_from_simulator(bosch2_loaded.simulator)
    assert len(counters) > 5000


def test_bosch2_ep_asl_ent_auf_extern_im_simulator(bosch2_loaded) -> None:
    """EPAslEntAufExtern-Auslöser sind in m_lAusl des Simulators."""
    sim = bosch2_loaded.simulator
    extern = [
        a for a in sim.m_lAusl if isinstance(a, EPAslEntAufExtern)
    ]
    assert len(extern) == 4


def test_bosch2_ep_ent_feld_haben_referenzen_aufgeloest(bosch2_loaded) -> None:
    """EPEntFeld-Wiring: m_oEntInf sollte aus OTX aufgelöst sein.

    In Bosch2 ist `m_oPPerson` durchweg `None` (Strategien handhaben die
    Personenwahl dynamisch). `m_oEntInf` ist hingegen für alle 4 Felder
    gesetzt — diesen Pfad prüfen wir hier.
    """
    felder = [
        py for py in bosch2_loaded.instances.values()
        if isinstance(py, EPEntFeld)
    ]
    assert len(felder) == 4
    mit_infosystem = [f for f in felder if f.m_oEntInf is not None]
    assert len(mit_infosystem) == 4, (
        f"Erwartet: alle 4 EntFelder mit m_oEntInf, war {len(mit_infosystem)}"
    )
    # `m_oEntStrategie` ist in Bosch2 ebenfalls referenziert — wir können
    # die Strategie noch nicht laden (P5-E/F), aber die Resolve-Versuch
    # liefert konsistent `None` (statt random garbage).
    mit_strategie = [f for f in felder if f.m_oEntStrategie is not None]
    assert mit_strategie == [], (
        "EntStrategie-Klassen sind in P5-A/B noch nicht registriert — "
        "Referenzen müssen None bleiben"
    )
