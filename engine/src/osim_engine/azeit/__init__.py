"""OSimAZeit-Modul (Slice P5-M).

Provenienz: `OSimAZeit/` (komplettes C++-Modul).

Auftragszeit-Modul: erweitert PSimulator/PPerson um arbeitszeit-orientierte
Subklassen. Im OTX ist ASimulator das Top-Level-Objekt (statt PSimulator).

P5-M: Klassen-Skelette. Im Loader bleibt der ASimulator-Handler-Alias auf
PSimulator (Phase-1-Entscheidung im porting-plan, "AZ-Skelett früh").
"""

from osim_engine.azeit.aausloeser import AAusloeser
from osim_engine.azeit.aeinsatzzeit_wunsch import AEinsatzzeitWunsch
from osim_engine.azeit.agruppe import AGruppe
from osim_engine.azeit.akap_bed_viewer_info import AKapBedViewerInfo
from osim_engine.azeit.aperson import APerson
from osim_engine.azeit.asimulator import ASimulator

__all__ = [
    "AAusloeser",
    "AEinsatzzeitWunsch",
    "AGruppe",
    "AKapBedViewerInfo",
    "APerson",
    "ASimulator",
]
