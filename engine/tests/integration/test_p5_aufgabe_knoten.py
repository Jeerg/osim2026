"""P5-C — Tests für abstrakte Aufgaben-Knoten.

Klassen-Hierarchie (alle abstrakt; konkrete Subklassen kommen in P5-D):
    PDpKnVerteilung
    └── EPEntscheidungsAufgabe
        └── EPEntAufgabeAltExtern
            └── EPEntAufgabeAltExternRessBeleg

Tests sichern:
- Enum-Werte 1000/1001/1002 (1:1 zu OTX)
- Default-Belegungs-Modus eaBelegen
- bearbeit_beginnen verzweigt korrekt nach m_eRessUsage
- entscheidung_treffen liefert None ohne EntFeld
- proz_weitergeben erzeugt PtProzEntAufgabeBase
- KPI-Methoden für leeren Stand
- Bestehende Tests bleiben grün
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from osim_engine.decisions import (
    EntAufgabeBelegStatus,
    EPEntAufgabeAltExtern,
    EPEntAufgabeAltExternRessBeleg,
    EPEntscheidungsAufgabe,
)
from osim_engine.pps.prozess.ent_aufgabe import PtProzEntAufgabeBase
from osim_engine.pps.simulator import PSimulator
from osim_engine.pps.knoten.zeitvorgabe import PDpKnVerteilung


# ----------------------------------------------------------------------
# Enum
# ----------------------------------------------------------------------


def test_enum_werte_1000_1001_1002() -> None:
    """1:1 zu PDpKnAlternativELogik.odh:21-26."""
    assert EntAufgabeBelegStatus.EABELEGEN == 1000
    assert EntAufgabeBelegStatus.EAANWESENHEITPRUEFEN == 1001
    assert EntAufgabeBelegStatus.EAKEINEBELEGUNG == 1002


# ----------------------------------------------------------------------
# EPEntscheidungsAufgabe — Struktur
# ----------------------------------------------------------------------


def test_ent_aufgabe_erbt_von_pdpkn_verteilung() -> None:
    """Erbung-Kette: EPEntscheidungsAufgabe : PDpKnVerteilung."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert isinstance(k, PDpKnVerteilung)


def test_ent_aufgabe_default_m_eressusage_ist_eabelegen() -> None:
    """Default-Modus = eaBelegen (Standard-Belegungs-Pfad)."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.m_eRessUsage == EntAufgabeBelegStatus.EABELEGEN


def test_ent_aufgabe_protokoll_counter_default_null() -> None:
    """m_dPtkEnaDlz* + m_dTmpEnaDlz* alle 0.0 zu Beginn."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.m_dPtkEnaDlzGes == 0.0
    assert k.m_dTmpEnaDlzGes == 0.0
    assert k.m_dPtkEnaDlzEnt == 0.0
    assert k.m_dTmpEnaDlzEnt == 0.0


def test_ent_aufgabe_get_knoten_anzahl_immer_null() -> None:
    """C++: cpp:179-182 — immer 0."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.get_knoten_anzahl() == 0


# ----------------------------------------------------------------------
# entscheidung_treffen
# ----------------------------------------------------------------------


def test_entscheidung_treffen_ohne_entfeld_liefert_none() -> None:
    """Prozess ohne m_oEntFeld → None (cpp:35-44)."""
    k = EPEntscheidungsAufgabe(PSimulator())
    # Mock-Prozess ohne m_oEntFeld
    proz = MagicMock()
    proz.m_oEntFeld = None
    assert k.entscheidung_treffen(proz) is None


def test_entscheidung_treffen_mit_entfeld_delegiert() -> None:
    """Bei vorhandenem m_oEntFeld wird treffe_entscheidung aufgerufen."""
    k = EPEntscheidungsAufgabe(PSimulator())
    proz = MagicMock()
    entfeld_mock = MagicMock()
    entfeld_mock.treffe_entscheidung.return_value = "DLPL"
    proz.m_oEntFeld = entfeld_mock
    result = k.entscheidung_treffen(proz)
    assert result == "DLPL"
    entfeld_mock.treffe_entscheidung.assert_called_once_with(k, proz)


# ----------------------------------------------------------------------
# get_entfeld_wenn_keine_belegung
# ----------------------------------------------------------------------


def test_get_entfeld_wenn_keine_belegung_leer_liefert_none() -> None:
    """Ohne EPAszEntFeld in m_lAssozRess → None."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.get_entfeld_wenn_keine_belegung() is None


def test_get_entfeld_wenn_keine_belegung_nimmt_erstes_tupel() -> None:
    """Erstes EPAszEntFeld → erstes m_lEntFeldTupel-Element."""
    from osim_engine.decisions.entscheidung import EPEntFeld
    from osim_engine.resources.assoziation.ent_feld import EPAszEntFeld

    sim = PSimulator()
    k = EPEntscheidungsAufgabe(sim)
    aef = EPAszEntFeld(sim)
    ef1 = EPEntFeld(sim)
    ef2 = EPEntFeld(sim)
    aef.m_lEntFeldTupel.extend([ef1, ef2])
    k.m_lAssozRess.append(aef)

    assert k.get_entfeld_wenn_keine_belegung() is ef1


# ----------------------------------------------------------------------
# bearbeit_beginnen-Verzweigung
# ----------------------------------------------------------------------


def test_bearbeit_beginnen_eaanwesenheitpruefen_check_ress_anwesend() -> None:
    """m_eRessUsage=eaAnwesenheitPruefen + ress_anwesend=True → True."""
    sim = PSimulator()
    k = EPEntscheidungsAufgabe(sim)
    k.m_eRessUsage = EntAufgabeBelegStatus.EAANWESENHEITPRUEFEN

    proz = MagicMock()
    proz.ress_anwesend.return_value = True
    proz.bearbeit_beginnen = MagicMock()
    # on_proz_bearbeit_beginn ruft super (PDpKnVerteilung) — wir mocken nicht alles
    # sondern verlassen uns darauf, dass es keine Exception wirft

    # Patch on_proz_bearbeit_beginn um Listener-Notification zu umgehen
    k.on_proz_bearbeit_beginn = MagicMock()
    assert k.bearbeit_beginnen(proz) is True
    assert k.m_iPtkBegAusloesungCount == 1
    proz.bearbeit_beginnen.assert_called_once()


def test_bearbeit_beginnen_eaanwesenheitpruefen_abgelehnt() -> None:
    """m_eRessUsage=eaAnwesenheitPruefen + ress_anwesend=False → False, abgelehnt."""
    sim = PSimulator()
    k = EPEntscheidungsAufgabe(sim)
    k.m_eRessUsage = EntAufgabeBelegStatus.EAANWESENHEITPRUEFEN

    proz = MagicMock()
    proz.ress_anwesend.return_value = False
    assert k.bearbeit_beginnen(proz) is False
    proz.on_bearbeit_abgelehnt.assert_called_once()


def test_bearbeit_beginnen_eakeinebelegung_setzt_entfeld() -> None:
    """eaKeineBelegung: EntFeld wird auf Prozess gesetzt + direkt bearbeitet."""
    from osim_engine.decisions.entscheidung import EPEntFeld
    from osim_engine.resources.assoziation.ent_feld import EPAszEntFeld

    sim = PSimulator()
    k = EPEntscheidungsAufgabe(sim)
    k.m_eRessUsage = EntAufgabeBelegStatus.EAKEINEBELEGUNG

    aef = EPAszEntFeld(sim)
    ef = EPEntFeld(sim)
    aef.m_lEntFeldTupel.append(ef)
    k.m_lAssozRess.append(aef)

    proz = PtProzEntAufgabeBase(sim)
    proz.bearbeit_beginnen = MagicMock()
    k.on_proz_bearbeit_beginn = MagicMock()

    assert k.bearbeit_beginnen(proz) is True
    assert proz.m_oEntFeld is ef
    proz.bearbeit_beginnen.assert_called_once()


# ----------------------------------------------------------------------
# KPI-Methoden
# ----------------------------------------------------------------------


def test_kpi_zaehler_null_liefert_null_dlz() -> None:
    """Ohne Auslösungen liefern KPI-Methoden 0.0."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.get_knz_mit_ena_dlz_ges() == 0.0
    assert k.get_knz_mit_ena_dlz_ent() == 0.0
    assert k.get_knz_zeg_mit_ena_dlz_ges() == 0.0
    assert k.get_knz_zeg_mit_ena_dlz_ent() == 0.0


def test_get_knz_sum_zeit_liefert_null() -> None:
    """C++: cpp:261-265 — Stub (auskommentiertes throw)."""
    k = EPEntscheidungsAufgabe(PSimulator())
    assert k.get_knz_sum_zeit() == 0.0


def test_prz_kosten_berechnen_no_op() -> None:
    """C++: cpp:266-269 — Stub, ändert keinen State."""
    k = EPEntscheidungsAufgabe(PSimulator())
    k.prz_kosten_berechnen(100.0)  # darf nicht crashen


# ----------------------------------------------------------------------
# EPEntAufgabeAltExtern + RessBeleg
# ----------------------------------------------------------------------


def test_ep_ent_aufgabe_altextern_erbt_von_entscheidungsaufgabe() -> None:
    """Hierarchie-Marker: erbt nur, keine eigenen Attribute."""
    k = EPEntAufgabeAltExtern(PSimulator())
    assert isinstance(k, EPEntscheidungsAufgabe)


def test_ep_ent_aufgabe_altextern_ress_beleg_hat_ressourcen_liste() -> None:
    """Erweitert um m_lRessourcen (PRessBelegLList in C++)."""
    k = EPEntAufgabeAltExternRessBeleg(PSimulator())
    assert isinstance(k, EPEntAufgabeAltExtern)
    assert k.m_lRessourcen == []


# ----------------------------------------------------------------------
# PtProzEntAufgabeBase
# ----------------------------------------------------------------------


def test_pt_proz_ent_aufgabe_base_hat_ent_feld_slot() -> None:
    """Erweitert PtProzZeitvorgabe um m_oEntFeld."""
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe
    p = PtProzEntAufgabeBase(PSimulator())
    assert isinstance(p, PtProzZeitvorgabe)
    assert p.m_oEntFeld is None
