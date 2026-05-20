"""P5-N — OSimINSIGHTS-Reporting-Klassen-Skelette."""

from __future__ import annotations

from osim_engine.insights import (
    IArbeitszeit, IAuftrag, IBestellauftrag, IBetrPers, IBetriebsmittel,
    IDurchlaufplan, IFertigungsauftrag, IGonzo, IInfo, ILager,
    IPerson, IProzess, ISimObj, ISimulator,
)


def test_alle_klassen_erben_isimobj() -> None:
    for cls in (IInfo, ISimulator, IArbeitszeit, IAuftrag, IBetriebsmittel,
                IBetrPers, IDurchlaufplan, ILager, IPerson, IProzess, IGonzo):
        instance = cls()
        assert isinstance(instance, ISimObj)


def test_auftrag_subtypen() -> None:
    assert issubclass(IBestellauftrag, IAuftrag)
    assert issubclass(IFertigungsauftrag, IAuftrag)


def test_instantiierung_ohne_simulator() -> None:
    """Alle Klassen müssen ohne Simulator-Argument instanziierbar sein."""
    IInfo()
    ISimulator()
    IFertigungsauftrag()


def test_name_attribut_vorhanden() -> None:
    info = IInfo()
    info.m_sName = "Test-Report"
    assert info.m_sName == "Test-Report"
