"""resources/ — passive Ressourcen-Familie (PRessource, PAktor, PRessBeleg, …).

Phase-2 / V4. C++-Quelle: `OSimPro/PRessource.*`, `OSimPro/PAktor.*`,
`OSimPro/PRessBeleg.*`, `OSimPro/PAssoz*.*`, `OSimPro/PtRelation.*`.

Slice V4 implementiert den passiven Belegungspfad (Maschine als blockierende
Ressource); aktive Pfade (PAktor.bearbeit_beginnen, ProzWaehlen) bleiben Stubs
und werden in V8 / Phase 3 ausgefüllt.
"""

from osim_engine.resources.aktor import PAktor
from osim_engine.resources.assoziation.base import PAssoziation, PAssozRessource
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import (
    PBetriebsmittel,
    PPerson,
    PRessBeleg,
    RessPauseVerhalten,
    RessStatus,
)
from osim_engine.resources.relation import PtRelation, PtRelationBeleg
from osim_engine.resources.ressource import PRessource

__all__ = [
    "PAktor",
    "PAssoziation",
    "PAssozBeleg",
    "PAssozRessource",
    "PBetriebsmittel",
    "PPerson",
    "PRessBeleg",
    "PRessource",
    "PtRelation",
    "PtRelationBeleg",
    "RessPauseVerhalten",
    "RessStatus",
]
