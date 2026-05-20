"""OSimINSIGHTS-Klassen — Slice P5-N.

Provenienz: `OSimINSIGHTS/I*.{odh,cpp}`.

Reporting-Datentransport-Klassen. P5-N als Skelett — Klassen-Marker mit
m_sName, damit der OTX-Loader bei Bedarf erweitert werden kann. Echte
Reporting-Pipelines (CSV-Export, OPC-Anbindung, Viewer-Bindings) sind
UI-Komponenten und außerhalb des headless-Portierungsziels.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class ISimObj(PSimObj):
    """C++: ISimObj — OSimINSIGHTS/ISimObj.{odh,cpp}."""

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)


class IInfo(ISimObj):
    """C++: IInfo — Reporting-Info-Container."""


class ISimulator(ISimObj):
    """C++: ISimulator — Top-Level-Reporting-Sicht."""


class IArbeitszeit(ISimObj):
    """C++: IArbeitszeit — Arbeitszeit-Reporting."""


class IAuftrag(ISimObj):
    """C++: IAuftrag — Auftrags-Reporting."""


class IBestellauftrag(IAuftrag):
    """C++: IBestellauftrag — Bestell-Reporting."""


class IFertigungsauftrag(IAuftrag):
    """C++: IFertigungsauftrag — Fertigungs-Reporting."""


class IBetriebsmittel(ISimObj):
    """C++: IBetriebsmittel — Maschinen-Reporting."""


class IBetrPers(ISimObj):
    """C++: IBetrPers — Betrieb-Personal-Reporting."""


class IDurchlaufplan(ISimObj):
    """C++: IDurchlaufplan — Plan-Reporting."""


class ILager(ISimObj):
    """C++: ILager — Lager-Reporting."""


class IPerson(ISimObj):
    """C++: IPerson — Personen-Reporting."""


class IProzess(ISimObj):
    """C++: IProzess — Prozess-Reporting."""


class IGonzo(ISimObj):
    """C++: IGonzo — Reporting-Aggregate."""
