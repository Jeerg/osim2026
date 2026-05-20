"""P5-G — PAssozRessEnt + PAssozELogikEnt."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.assoziation.ent_beleg import PAssozELogikEnt, PAssozRessEnt


def test_assoz_ress_ent_erbt_von_assoz_beleg() -> None:
    assert isinstance(PAssozRessEnt(PSimulator()), PAssozBeleg)


def test_assoz_elogik_ent_erbt_von_assoz_beleg() -> None:
    assert isinstance(PAssozELogikEnt(PSimulator()), PAssozBeleg)


def test_assoz_ress_ent_fallback_ohne_entscheider() -> None:
    """Wenn kein Entscheider in m_lRessourcen, wird die erste verfügbare gewählt."""
    sim = PSimulator()
    a = PAssozRessEnt(sim)
    proz = MagicMock()
    proz.m_oRelationen = []
    res = MagicMock()
    res.ress_verfuegbar.return_value = True
    a.m_lRessourcen = [res]
    assert a.ress_verfuegbar(proz) is True
    assert len(proz.m_oRelationen) == 1


def test_assoz_ress_ent_mit_entscheider() -> None:
    """Wenn ein Entscheider (mit entscheide_per-Methode) in m_lRessourcen,
    wird der ausgewählten Beleg übernommen."""
    sim = PSimulator()
    a = PAssozRessEnt(sim)
    proz = MagicMock()
    proz.m_oRelationen = []

    chosen = MagicMock()
    chosen.ress_verfuegbar.return_value = True
    entscheider = MagicMock()
    entscheider.entscheide_per.return_value = chosen
    a.m_lRessourcen = [entscheider, MagicMock()]

    assert a.ress_verfuegbar(proz) is True
    assert proz.m_oRelationen[0].m_oRessBeleg is chosen


def test_on_proz_unterbr_wirft() -> None:
    """C++ wirft OException — Python NotImplementedError."""
    sim = PSimulator()
    a = PAssozRessEnt(sim)
    with pytest.raises(NotImplementedError):
        a.on_proz_unterbr(MagicMock())
    b = PAssozELogikEnt(sim)
    with pytest.raises(NotImplementedError):
        b.on_proz_unterbr(MagicMock())


def test_get_proz_kost_wirft() -> None:
    sim = PSimulator()
    a = PAssozRessEnt(sim)
    with pytest.raises(NotImplementedError):
        a.get_proz_kost()
