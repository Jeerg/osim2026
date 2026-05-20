"""P5-L — PGenerator + Helper-Datenklassen."""

from __future__ import annotations

from osim_engine.generator import (
    PGenAZIntervall,
    PGenAZRscBeleg,
    PGenAZTag,
    PGenerator,
    PGenInitInfo,
    PGenKnz,
    PGenLauf,
    PGenObj,
    PGenStatus,
    PGenTmpAZModell,
    PProp,
)
from osim_engine.pps.simulator import PSimulator


def test_p_gen_status_werte() -> None:
    assert PGenStatus.GS_BEGIN == 1
    assert PGenStatus.GS_RUNNING == 2
    assert PGenStatus.GS_SUSPENDED == 3
    assert PGenStatus.GS_GENERATE_PSG_FILE == 4


def test_pprop_dataclass() -> None:
    p = PProp(m_name="speed", m_value="100")
    assert p.m_name == "speed"


def test_pgenobj_default_no_name() -> None:
    o = PGenObj()
    assert o.m_ObjName == "NO_NAME"
    assert o.m_index == -1
    assert o.m_PropertyList == []


def test_pgenlauf_lauf_nr_default_minus_1() -> None:
    l_ = PGenLauf()
    assert l_.laufnum == -1


def test_pgenknz_default_class_id_minus_1() -> None:
    k = PGenKnz()
    assert k.m_ClassID == -1


def test_pgenaz_tag_block_unblock() -> None:
    t = PGenAZTag(m_iTag=5)
    assert t.is_blocked() is False
    t.block()
    assert t.is_blocked() is True
    t.un_block()
    assert t.is_blocked() is False


def test_pgentmp_az_modell_lookup_leer() -> None:
    m = PGenTmpAZModell()
    assert m.get_az_tag(object(), 1) is None
    assert m.get_beg_of_az_tag(object(), 1) == -1


def test_pgentmp_az_modell_lookup_treffer() -> None:
    m = PGenTmpAZModell()
    beleg = object()
    tag = PGenAZTag(m_iTag=3, m_iTagBegin=100, m_iTagEnd=200)
    rsc = PGenAZRscBeleg(m_oBeleg=beleg, m_lTage=[tag])
    m.m_lAZMList.append(rsc)
    assert m.get_az_tag(beleg, 3) is tag
    assert m.get_beg_of_az_tag(beleg, 3) == 100
    assert m.get_end_of_az_tag(beleg, 3) == 200


def test_pgenerator_defaults() -> None:
    g = PGenerator(PSimulator())
    assert g.m_AnzahlPerioden == 1
    assert g.m_genStatus == PGenStatus.GS_BEGIN
    assert g.m_LaufList == []
    assert g.m_KnzList == []


def test_pgenerator_in_psimulator_eingehaengt() -> None:
    """PSimulator.m_oGenerator ist seit P5-L echtes PGenerator-Objekt."""
    sim = PSimulator()
    assert isinstance(sim.m_oGenerator, PGenerator)
    assert sim.m_oGenerator.m_simulator is sim
