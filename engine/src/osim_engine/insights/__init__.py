"""OSimINSIGHTS-Modul (Slice P5-N).

Provenienz: `OSimINSIGHTS/` (komplettes C++-Modul, ~16 Klassen).

Reporting-Layer: passive Datenklassen für Reporting-Daten zu
Arbeitszeiten, Aufträgen, Betriebsmitteln, Personen, Prozessen,
Durchlaufplänen etc. Alle I*-Klassen sind im C++-Original Datentransport-
Objekte für die Reporting-Sichten — keine eigene Sim-Logik.

P5-N: Klassen-Skelette als PSimObj-Subtypen. Volle Reporting-Pipelines
(Export, OPC/OST-Anbindung) sind UI-Komponenten und gehören nicht zum
headless-Portierungsziel.

Alle Klassen sind reine Marker — Attribut-Auflösung erfolgt erst bei
konkretem Bedarf in einer eigenen Spezial-Slice.
"""

from osim_engine.insights.classes import (
    IArbeitszeit,
    IAuftrag,
    IBestellauftrag,
    IBetrPers,
    IBetriebsmittel,
    IDurchlaufplan,
    IFertigungsauftrag,
    IGonzo,
    IInfo,
    ILager,
    IPerson,
    IProzess,
    ISimObj,
    ISimulator,
)

__all__ = [
    "IArbeitszeit",
    "IAuftrag",
    "IBestellauftrag",
    "IBetrPers",
    "IBetriebsmittel",
    "IDurchlaufplan",
    "IFertigungsauftrag",
    "IGonzo",
    "IInfo",
    "ILager",
    "IPerson",
    "IProzess",
    "ISimObj",
    "ISimulator",
]
