"""P5-F — Tests für eet-Strategien (Kapazitäts-Veränderung)."""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.decisions import (
    EPEntStrAltExternRessBelegBase,
    EPEntStrArbVertMitWechsel,
    EPEntStrKrzKapVeraenderungBase,
    EPEntStrKrzKapVerPrgAutrag,
    EPEntStrategie,
    GroupList,
)
from osim_engine.decisions.strategie_eet import _GroupInfo, _RessInfo
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Hierarchie
# ----------------------------------------------------------------------


def test_alle_eet_erben_von_basis() -> None:
    sim = PSimulator()
    for cls in (
        EPEntStrAltExternRessBelegBase, EPEntStrKrzKapVeraenderungBase,
        EPEntStrKrzKapVerPrgAutrag, EPEntStrArbVertMitWechsel,
    ):
        s = cls(sim)
        assert isinstance(s, EPEntStrategie)


def test_kap_ver_und_arbvert_erben_von_basebeleg() -> None:
    sim = PSimulator()
    for cls in (EPEntStrKrzKapVeraenderungBase, EPEntStrKrzKapVerPrgAutrag,
                EPEntStrArbVertMitWechsel):
        assert isinstance(cls(sim), EPEntStrAltExternRessBelegBase)


# ----------------------------------------------------------------------
# Defaults
# ----------------------------------------------------------------------


def test_base_creat_std_systems_none() -> None:
    """C++ cpp:1557-1564 — Basis liefert None für beide."""
    s = EPEntStrAltExternRessBelegBase(PSimulator())
    assert s.creat_std_ziel_system() is None
    assert s.creat_std_informations_system() is None


def test_kap_ver_base_defaults() -> None:
    s = EPEntStrKrzKapVeraenderungBase(PSimulator())
    assert s.m_bIsDynPausendauer is True
    assert s.m_iStaffelDelta == 0
    assert s.m_iDpKnAnzFuerPrgEglArbInhalt == -1


def test_kap_ver_base_infosys_hat_2_props() -> None:
    s = EPEntStrKrzKapVeraenderungBase(PSimulator())
    infsys = s.creat_std_informations_system()
    assert len(infsys.m_lInformationen) == 2
    namen = [i.m_sPropertyClassName for i in infsys.m_lInformationen]
    assert "GetZstWartArbInhaltUmgelegt" in namen
    assert "GetPrgEglArbInhaltUmgelegt" in namen


def test_arb_vert_defaults() -> None:
    s = EPEntStrArbVertMitWechsel(PSimulator())
    assert s.m_bIsTausche is True
    assert s.m_iMaxTauschversuche == 100
    assert isinstance(s.m_lGroupList, GroupList)


def test_arb_vert_infosys_hat_3_props() -> None:
    s = EPEntStrArbVertMitWechsel(PSimulator())
    infsys = s.creat_std_informations_system()
    assert len(infsys.m_lInformationen) == 3


# ----------------------------------------------------------------------
# Helper: _RessInfo / _GroupInfo / GroupList
# ----------------------------------------------------------------------


def test_ress_info_get_verf_kap_positiv() -> None:
    info = _RessInfo(m_iEinsatzBeginn=0, m_iEinsatzEnde=28800, m_iPausendauer=1800)
    assert info.get_verf_kap() == 28800 - 1800


def test_group_info_add_info_leer_name_false() -> None:
    g = _GroupInfo(m_sName="Group-A")
    info = _RessInfo()
    assert info.m_sGroupName == ""
    assert g.add_info(info) is False


def test_group_info_add_info_ok() -> None:
    g = _GroupInfo(m_sName="Group-A")
    info = _RessInfo(m_sGroupName="Group-A")
    assert g.add_info(info) is True
    assert len(g.m_lRessList) == 1


def test_group_list_add_info_2_group_neue_gruppe() -> None:
    gl = GroupList()
    info = _RessInfo(m_sGroupName="GA")
    assert gl.add_info_2_group(info) is True
    assert len(gl) == 1
    assert gl[0].m_sName == "GA"


def test_group_list_add_info_2_group_haengt_an_existierende() -> None:
    gl = GroupList()
    gl.add_info_2_group(_RessInfo(m_sGroupName="GA"))
    gl.add_info_2_group(_RessInfo(m_sGroupName="GA"))
    gl.add_info_2_group(_RessInfo(m_sGroupName="GB"))
    assert len(gl) == 2
    assert gl[0].m_sName == "GA"
    assert len(gl[0].m_lRessList) == 2


def test_group_list_clear() -> None:
    gl = GroupList()
    gl.add_info_2_group(_RessInfo(m_sGroupName="GA"))
    gl.clear()
    assert len(gl) == 0


# ----------------------------------------------------------------------
# ArbVert Max-Bedarf/Angebot
# ----------------------------------------------------------------------


def test_arb_vert_get_group_mit_max_bedarf() -> None:
    s = EPEntStrArbVertMitWechsel(PSimulator())
    g1 = _GroupInfo(m_sName="A", m_bIsKapBedarf=True, m_iKapBedarf=100)
    g2 = _GroupInfo(m_sName="B", m_bIsKapBedarf=True, m_iKapBedarf=500)
    g3 = _GroupInfo(m_sName="C", m_bIsKapBedarf=False, m_iKapBedarf=999)
    s.m_lGroupList.extend([g1, g2, g3])
    assert s.get_group_mit_max_bedarf() is g2


def test_arb_vert_get_group_mit_max_angebot_leer_none() -> None:
    s = EPEntStrArbVertMitWechsel(PSimulator())
    assert s.get_group_mit_max_angebot() is None


# ----------------------------------------------------------------------
# Bosch2-Coverage
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


def test_bosch2_zero_unsupported(bosch2_loaded) -> None:
    """Nach P5-F: 0 unsupported — volle Phase-5-Klassen-Coverage."""
    assert dict(bosch2_loaded.unsupported) == {}


def test_bosch2_arbvert_geladen(bosch2_loaded) -> None:
    """1× EPEntStrArbVertMitWechsel in Bosch2."""
    assert bosch2_loaded.loaded["EPEntStrArbVertMitWechsel"] == 1
    arb_vert = [
        s for s in bosch2_loaded.simulator.m_lEntStrategie
        if isinstance(s, EPEntStrArbVertMitWechsel)
    ]
    assert len(arb_vert) == 1


def test_bosch2_ent_feld_alle_strategien(bosch2_loaded) -> None:
    """Alle 4 EntFelder haben jetzt eine Strategie."""
    from osim_engine.decisions.entscheidung import EPEntFeld
    felder = [
        py for py in bosch2_loaded.instances.values()
        if isinstance(py, EPEntFeld)
    ]
    mit_strat = [f for f in felder if f.m_oEntStrategie is not None]
    assert len(mit_strat) == 4


def test_bosch2_python_sim_laeuft_durch(bosch2_loaded) -> None:
    from osim_engine.io.otx_diff import extract_counters_from_simulator
    bosch2_loaded.simulator.start()
    assert len(extract_counters_from_simulator(bosch2_loaded.simulator)) > 5000
