"""resources/ — Ressourcen-Familie (PRessource, PAktor, PRessBeleg,
PRessMenge, …).

C++-Quelle: `OSimPro/PRessource.*`, `OSimPro/PAktor.*`,
`OSimPro/PRessBeleg.*`, `OSimPro/PRessMenge.*`, `OSimPro/PAssoz*.*`,
`OSimPro/PtRelation.*`.

Slices:
    V4 — passiver Belegungspfad (Maschine als blockierende Ressource)
    V5 — Mengen/Material (Bestand, Erzeuger/Verbraucher/Abfrage)

Aktive Pfade (PAktor.bearbeit_beginnen, ProzWaehlen) bleiben Stubs und
werden in V8 / Phase 3 ausgefüllt. PSpeicherProz / PEntitaet / PAszSpeicher
(Entity-Identität durch Lager) sind ein separater Slice, der nach V5
geplant ist.
"""

from osim_engine.resources.aktor import PAktor
from osim_engine.resources.assoziation.base import PAssoziation, PAssozRessource
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.assoziation.menge import (
    PAssozMenge,
    PAssozMengeAbfr,
    PAssozMengeErzgt,
    PAssozMengeVerbr,
    PAssozMengeVerbrZwischen,
)
from osim_engine.resources.assoziation.speicher import (
    PAssozSpeichBestand,
    PAssozSpeicher,
)
from osim_engine.resources.beleg import (
    PBetriebsmittel,
    PPerson,
    PRessBeleg,
    RessPauseVerhalten,
    RessStatus,
)
from osim_engine.resources.einsatzzeit import (
    EinsatzEvtTyp,
    PEinsatzzeit,
    PEinsatzzeitEvtMode,
    PEinsatzzeitPause,
    PPauseZyklus,
)
from osim_engine.resources.entitaet import (
    PEntEinzel,
    PEntExtern,
    PEntitaet,
    PEntWeitergabe,
)
from osim_engine.resources.kollektion import PRessKollEinheiten, PRessKollektion
from osim_engine.resources.menge import PRessLager, PRessMenge
from osim_engine.resources.relation import PtRelation, PtRelationBeleg, PtRelationMenge
from osim_engine.resources.ressource import PRessource
from osim_engine.resources.speicher import PSpeicherProz, SpeicherProzListener

__all__ = [
    "EinsatzEvtTyp",
    "PAktor",
    "PAssoziation",
    "PAssozBeleg",
    "PAssozMenge",
    "PAssozMengeAbfr",
    "PAssozMengeErzgt",
    "PAssozMengeVerbr",
    "PAssozMengeVerbrZwischen",
    "PAssozRessource",
    "PAssozSpeichBestand",
    "PAssozSpeicher",
    "PBetriebsmittel",
    "PEinsatzzeit",
    "PEinsatzzeitEvtMode",
    "PEinsatzzeitPause",
    "PEntEinzel",
    "PEntExtern",
    "PEntitaet",
    "PEntWeitergabe",
    "PPauseZyklus",
    "PPerson",
    "PRessBeleg",
    "PRessKollEinheiten",
    "PRessKollektion",
    "PRessLager",
    "PRessMenge",
    "PRessource",
    "PSpeicherProz",
    "PtRelation",
    "PtRelationBeleg",
    "PtRelationMenge",
    "RessPauseVerhalten",
    "RessStatus",
    "SpeicherProzListener",
]
