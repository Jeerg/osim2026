"""assoziation/ — Knoten↔Ressource-Verbindungen.

Subpackage von `osim_engine.resources`. V4 implementiert `PAssoziation`,
`PAssozRessource` (abstract), `PAssozBeleg` (passive Belegung).
"""

from osim_engine.resources.assoziation.base import PAssoziation, PAssozRessource
from osim_engine.resources.assoziation.beleg import PAssozBeleg

__all__ = ["PAssoziation", "PAssozBeleg", "PAssozRessource"]
