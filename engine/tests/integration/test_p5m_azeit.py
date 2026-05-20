"""P5-M — OSimAZeit-Klassen-Skelette."""

from __future__ import annotations

from osim_engine.azeit import (
    AAusloeser, AEinsatzzeitWunsch, AGruppe, AKapBedViewerInfo,
    APerson, ASimulator,
)
from osim_engine.pps.ausloeser.base import PAusloeser
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.beleg import PPerson


def test_asimulator_erbt_psimulator() -> None:
    sim = ASimulator()
    assert isinstance(sim, PSimulator)
    assert sim.m_bAZModus is False


def test_aperson_erbt_pperson() -> None:
    sim = PSimulator()
    p = APerson(sim)
    assert isinstance(p, PPerson)
    assert p.m_oAGruppe is None


def test_agruppe_default() -> None:
    g = AGruppe(PSimulator())
    assert g.m_lAPerson == []


def test_aausloeser_erbt_pausloeser() -> None:
    a = AAusloeser(PSimulator())
    assert isinstance(a, PAusloeser)


def test_aeinsatzzeit_wunsch_default() -> None:
    w = AEinsatzzeitWunsch()
    assert w.m_iWunschBeginn == 0


def test_akap_bed_viewer_info() -> None:
    v = AKapBedViewerInfo()
    assert v is not None
