"""P4-D: PtProzRuesten — Stub-Verifikation.

Diese Tests dokumentieren den Stub-Status von PtProzRuesten 1:1 zum
C++-Original. Im C++ werfen alle drei Methoden OException; hier werfen
sie NotImplementedError.

Eine echte Rüstprozess-Implementierung mit eigenen EventBus-Topics wäre
eine Diss-basierte Erweiterung und ist NICHT Gegenstand der 1:1-Portierung.
"""

from __future__ import annotations

import pytest

from osim_engine.pps.prozess.ruesten import PtProzRuesten


def test_p4_d_ruesten_klasse_existiert_als_stub() -> None:
    """PtProzRuesten ist konstruierbar (analog zur C++-Klasse, die im
    DllOSimPro angemeldet ist).
    """
    proz = PtProzRuesten(simulator=None)
    assert proz is not None
    # Erbt von PtProzess — Basis-Felder vorhanden
    assert proz.m_eStatus is not None
    assert proz.m_oKnoten is None


def test_p4_d_ruesten_bearbeit_beginn_unimplementiert() -> None:
    proz = PtProzRuesten(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.bearbeit_beginn()


def test_p4_d_ruesten_ruest_ende_unimplementiert() -> None:
    proz = PtProzRuesten(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.ruest_ende()


def test_p4_d_ruesten_bearbeit_ende_unimplementiert() -> None:
    proz = PtProzRuesten(simulator=None)
    with pytest.raises(NotImplementedError, match="Stub"):
        proz.bearbeit_ende()
