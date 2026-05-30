"""PProzessDLL — zentrale Prozess-Warteschlange.

Provenienz: `OSimPro/PProzessDLL` (intrusive doubly-linked-list).
Python-Version: Container mit `list[PtProzess]` als Backing-Store (SUPPLEMENT
§ 6.1-Linie). `m_oNext`/`m_oPrev` am Prozess fallen weg — der Container
kennt seine Reihenfolge selbst.

In V1 reicht das. In Phase 2+, falls Performance-Probleme bei sehr vielen
Prozessen auftauchen, kann das durch `collections.deque` oder eine echte
intrusive Liste ersetzt werden.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Iterator

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess


class PProzessDLL:
    """Doubly-linked-list-Semantik, Python-Implementation via list."""

    def __init__(self) -> None:
        self._items: list["PtProzess"] = []

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator["PtProzess"]:
        return iter(self._items)

    def is_empty(self) -> bool:
        return not self._items

    def get_head(self) -> "PtProzess | None":
        return self._items[0] if self._items else None

    def get_tail(self) -> "PtProzess | None":
        return self._items[-1] if self._items else None

    def add_head(self, proz: "PtProzess") -> None:
        self._items.insert(0, proz)

    def add_tail(self, proz: "PtProzess") -> None:
        """Hängt proz ans Ende der zentralen Warteschlange (blockiert-wartend).

        Hinweis: Die per-Ressource-KPI-Liste ``m_lPtkWartschl`` wird NICHT mehr
        hier gefüllt, sondern an der Knoten-An-/Abmeldung (PDlplKnoten.add_prozess/
        remove_prozess = C++ PtkUpDateProcessQueue) — so zählt GetZstWartProzesse
        ALLE am Knoten anhängenden Prozesse (wartend + in Bearbeitung), 1:1 zum
        Original (AUDIT-OSIM-TREUE). Die zentrale WS bleibt davon unberührt.
        """
        self._items.append(proz)

    def remove(self, proz: "PtProzess") -> bool:
        """Entfernt proz aus der zentralen Warteschlange.

        ``m_lPtkWartschl`` wird hier nicht mehr berührt (siehe add_tail) — die
        Lebensdauer der KPI-Liste hängt jetzt an der Knoten-Mitgliedschaft.
        """
        try:
            self._items.remove(proz)
        except ValueError:
            return False
        return True

    def find(self, proz: "PtProzess") -> int:
        """Index des Prozesses, oder -1."""
        try:
            return self._items.index(proz)
        except ValueError:
            return -1

    def clear(self) -> None:
        self._items.clear()
