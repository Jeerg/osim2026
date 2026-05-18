"""P4-E: PDpKnExtern + PtProzExtern — Stub-Verifikation.

Beide Klassen sind im C++-Original (PDlplKnoten.cpp:2761 + PtProzess.cpp:799-848)
komplett Stub-only — alle Methoden werfen OException. Hier werfen sie
NotImplementedError mit Hinweis.

PEntExtern (Entitäten-Familie) ist bereits in V5.5 als Stub portiert
(siehe `resources/entitaet.py:90`).
"""

from __future__ import annotations

import pytest

from osim_engine.pps.knoten.extern import PDpKnExtern
from osim_engine.pps.prozess.extern import PtProzExtern


# ----------------------------------------------------------------------
# PDpKnExtern
# ----------------------------------------------------------------------


def test_p4_e_pdpknextern_existiert() -> None:
    """PDpKnExtern ist konstruierbar — analog zur C++-Klasse (im DLL registriert)."""
    knoten = PDpKnExtern(simulator=None)
    assert knoten is not None
    # Erbt von PDlplKnoten — Basis-Felder vorhanden
    assert knoten.m_lProzesse == []
    assert knoten.m_iPtkAusloesungCount == 0


def test_p4_e_pdpknextern_proz_weitergeben_unimplementiert() -> None:
    knoten = PDpKnExtern(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        knoten.proz_weitergeben(None, None)


# ----------------------------------------------------------------------
# PtProzExtern (abstract — alle 6 Methoden Stubs)
# ----------------------------------------------------------------------


def test_p4_e_ptprozextern_existiert() -> None:
    """PtProzExtern ist konstruierbar (Python kennt kein abstract-marker
    auf der C++-$option-Ebene — die Stubs auf den Methoden machen die
    Klasse de-facto unbenutzbar).
    """
    proz = PtProzExtern(simulator=None)
    assert proz is not None
    assert proz.m_eStatus is not None


def test_p4_e_ptprozextern_ress_verfuegbar_unimplementiert() -> None:
    proz = PtProzExtern(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.ress_verfuegbar()


def test_p4_e_ptprozextern_bearbeit_beginnen_unimplementiert() -> None:
    proz = PtProzExtern(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.bearbeit_beginnen()


def test_p4_e_ptprozextern_on_unter_proz_unimplementiert() -> None:
    proz = PtProzExtern(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.on_unter_proz_beginn(proz)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.on_unter_proz_ende(proz)


def test_p4_e_ptprozextern_extern_methoden_unimplementiert() -> None:
    proz = PtProzExtern(simulator=None)
    dummy_ent = object()
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.extern_beginn(dummy_ent)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.extern_ende(dummy_ent)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.extern_unterbr(dummy_ent)
