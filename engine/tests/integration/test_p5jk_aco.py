"""P5-J/K — ACOAnt + ACO-Klassen."""

from __future__ import annotations

import pytest

from osim_engine.decisions.aco import (
    ACOLogik,
    ACOMarkeLogik,
    ACOMarkeReihenfolge,
    ACOMarkeSplit,
    ACODpKnSplit,
    ACOReihenfolge,
    ACOSplit,
)
from osim_engine.decisions.aufgabe import EPEntAufgabeAltIntern
from osim_engine.pps.ausloeser.aco_ant import ACOAnt
from osim_engine.pps.ausloeser.base import PAusloeser
from osim_engine.pps.knoten.zeitvorgabe import PDpKnMengeRuesten
from osim_engine.pps.simulator import PSimulator


def test_aco_ant_erbt_pausloeser() -> None:
    assert isinstance(ACOAnt(PSimulator()), PAusloeser)


def test_aco_ant_defaults() -> None:
    a = ACOAnt(PSimulator())
    assert a.m_iBeginTermin == 0
    assert a.m_iPlanZeit == 0
    assert a.m_iRealeAuftragsdauer == 0
    assert a.m_lACODlpl == []


def test_aco_ant_kpi_default_null() -> None:
    a = ACOAnt(PSimulator())
    assert a.get_knz_planzeitgrad() == 0.0
    assert a.get_knz_guetegrad() == 0.0
    assert a.get_knz_prg_auftragsanzahl() == 1


def test_aco_ant_planzeitgrad_mit_dlz() -> None:
    a = ACOAnt(PSimulator())
    a.m_iPlanZeit = 1000
    a.m_dPtkDurchlaufzeit = 2000.0
    assert a.get_knz_planzeitgrad() == 0.5


def test_aco_split_erbt_ent_aufgabe_intern() -> None:
    assert isinstance(ACOSplit(PSimulator()), EPEntAufgabeAltIntern)


def test_aco_logik_erbt_ent_aufgabe_intern() -> None:
    assert isinstance(ACOLogik(PSimulator()), EPEntAufgabeAltIntern)


def test_acodpknsplit_erbt_mengen_ruesten() -> None:
    assert isinstance(ACODpKnSplit(PSimulator()), PDpKnMengeRuesten)


def test_acoreihenfolge_erbt_mengen_ruesten() -> None:
    assert isinstance(ACOReihenfolge(PSimulator()), PDpKnMengeRuesten)


def test_aco_split_create_s_info() -> None:
    k = ACOSplit(PSimulator())
    info = k.create_s_info()
    assert isinstance(info, ACOMarkeSplit)


def test_aco_logik_create_s_info() -> None:
    k = ACOLogik(PSimulator())
    info = k.create_s_info()
    assert isinstance(info, ACOMarkeLogik)


def test_aco_reihenfolge_create_s_info() -> None:
    k = ACOReihenfolge(PSimulator())
    info = k.create_s_info()
    assert isinstance(info, ACOMarkeReihenfolge)


def test_acodpknsplit_get_split_menge_default_1() -> None:
    k = ACODpKnSplit(PSimulator())
    from unittest.mock import MagicMock
    proz = MagicMock(spec=[])  # ohne m_iSplitMenge → Default 1
    assert k.get_split_menge(proz) == 1
