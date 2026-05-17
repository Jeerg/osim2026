"""assoziation/ — Knoten↔Ressource-Verbindungen.

Subpackage von `osim_engine.resources`.

V4: `PAssoziation`, `PAssozRessource` (abstract), `PAssozBeleg`.
V5: `PAssozMenge` (abstract), `PAssozMengeErzgt`, `PAssozMengeVerbr`,
    `PAssozMengeVerbrZwischen`, `PAssozMengeAbfr`.
"""

from osim_engine.resources.assoziation.base import PAssoziation, PAssozRessource
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.assoziation.menge import (
    PAssozMenge,
    PAssozMengeAbfr,
    PAssozMengeErzgt,
    PAssozMengeVerbr,
    PAssozMengeVerbrZwischen,
)

__all__ = [
    "PAssoziation",
    "PAssozBeleg",
    "PAssozMenge",
    "PAssozMengeAbfr",
    "PAssozMengeErzgt",
    "PAssozMengeVerbr",
    "PAssozMengeVerbrZwischen",
    "PAssozRessource",
]
