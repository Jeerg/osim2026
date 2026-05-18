"""assoziation/ — Knoten↔Ressource-Verbindungen.

Subpackage von `osim_engine.resources`.

V4: `PAssoziation`, `PAssozRessource` (abstract), `PAssozBeleg`.
V5: `PAssozMenge` (abstract), `PAssozMengeErzgt`, `PAssozMengeVerbr`,
    `PAssozMengeVerbrZwischen`, `PAssozMengeAbfr`.
V5.5: `PAssozSpeicher`, `PAssozSpeichBestand`.
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
from osim_engine.resources.assoziation.speicher import (
    PAssozSpeichBestand,
    PAssozSpeicher,
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
    "PAssozSpeichBestand",
    "PAssozSpeicher",
]
