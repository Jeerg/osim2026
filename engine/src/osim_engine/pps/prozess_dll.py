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
        self._items.append(proz)

    def remove(self, proz: "PtProzess") -> bool:
        try:
            self._items.remove(proz)
            return True
        except ValueError:
            return False

    def find(self, proz: "PtProzess") -> int:
        """Index des Prozesses, oder -1."""
        try:
            return self._items.index(proz)
        except ValueError:
            return -1

    def clear(self) -> None:
        self._items.clear()
