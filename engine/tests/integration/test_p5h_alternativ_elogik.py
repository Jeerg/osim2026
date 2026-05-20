"""P5-H/I — PDpKnAlternativELogik + PDpKnAlternativSplit."""

from __future__ import annotations

import pytest

from osim_engine.decisions.alternativ_elogik import (
    PAlternativeELogik,
    PAlternativeSplit,
    PDpKnAELogik_Ziel,
    PDpKnAELogik_ZFuktionTyp,
    PDpKnAlternativELogik,
    PDpKnAlternativSplit,
)
from osim_engine.pps.knoten.alternativ import PAlternative, PDpKnAlternativ
from osim_engine.pps.simulator import PSimulator


def test_enum_z_funktion_typ() -> None:
    assert PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_LEXIOGRAPHISCH == 1000
    assert PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_NWZ == 1001


def test_enum_ziel_7_werte() -> None:
    assert PDpKnAELogik_Ziel.PDPKNELOGIK_TER == 0
    assert PDpKnAELogik_Ziel.PDPKNELOGIK_FLE == 6


def test_alternative_elogik_erbt_pal() -> None:
    sim = PSimulator()
    assert isinstance(PAlternativeELogik(sim), PAlternative)


def test_alternative_split_erbt_pal() -> None:
    sim = PSimulator()
    assert isinstance(PAlternativeSplit(sim), PAlternative)


def test_dp_kn_alt_elogik_erbt_alt() -> None:
    sim = PSimulator()
    assert isinstance(PDpKnAlternativELogik(sim), PDpKnAlternativ)


def test_dp_kn_alt_split_erbt_alt() -> None:
    sim = PSimulator()
    assert isinstance(PDpKnAlternativSplit(sim), PDpKnAlternativ)


def test_elogik_defaults() -> None:
    k = PDpKnAlternativELogik(PSimulator())
    assert k.m_eZFunktionTyp == PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_NWZ
    assert k.m_iZGTermintreue == 5
    assert k.m_iZGDlz == 5
    assert k.m_iZGFlexibilitaet == 5
    # Normierungs-Ober/Untergrenzen
    assert k.m_iUGDurchlaufzeit == 0
    assert k.m_iOGDurchlaufzeit == 100


def test_elogik_auswahl_erste_alternative() -> None:
    sim = PSimulator()
    k = PDpKnAlternativELogik(sim)
    assert k.alternative_auswaehlen(None, None) is None
    a1, a2 = PAlternativeELogik(sim), PAlternativeELogik(sim)
    k.m_lAlternativen.extend([a1, a2])
    assert k.alternative_auswaehlen(None, None) is a1


def test_elogik_entscheide_dispatched_nach_typ() -> None:
    sim = PSimulator()
    k = PDpKnAlternativELogik(sim)
    a = PAlternativeELogik(sim)
    k.m_lAlternativen.append(a)
    k.m_eZFunktionTyp = PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_LEXIOGRAPHISCH
    assert k.entscheide(k.m_lAlternativen, None, None) is a
    k.m_eZFunktionTyp = PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_NWZ
    assert k.entscheide(k.m_lAlternativen, None, None) is a


def test_normiere_linear() -> None:
    # max-Variante (kleiner = besser): groesse=50 in [0,100] → 50
    assert PDpKnAlternativELogik.normiere(50.0, 0, 100, min_=False) == 50.0
    # min-Variante: groesse=50 in [0,100] → 50
    assert PDpKnAlternativELogik.normiere(50.0, 0, 100, min_=True) == 50.0


def test_normiere_grenzen_gleich_null() -> None:
    """Schutz vor Division durch 0 wenn ug == og."""
    assert PDpKnAlternativELogik.normiere(50.0, 5, 5) == 0.0


def test_get_alternative_count_und_zugriff() -> None:
    sim = PSimulator()
    k = PDpKnAlternativELogik(sim)
    a1, a2 = PAlternativeELogik(sim), PAlternativeELogik(sim)
    k.m_lAlternativen.extend([a1, a2])
    assert k.get_alternative_count() == 2
    assert k.get_alternative(0) is a1
    assert k.get_alternative(1) is a2
    assert k.get_alternative(5) is None


def test_split_count_und_zugriff() -> None:
    sim = PSimulator()
    k = PDpKnAlternativSplit(sim)
    a = PAlternativeSplit(sim)
    k.m_lAlternativen.append(a)
    assert k.get_alternative_count() == 1
    assert k.get_alternative(0) is a
    # alternative_auswaehlen liefert erste
    assert k.alternative_auswaehlen(None, None) is a
