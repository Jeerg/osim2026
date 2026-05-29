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
        """Hängt proz ans Ende der zentralen Warteschlange.

        Zusatz (P5D-SCOPE §3.2): proz in m_lPtkWartschl aller zugeordneten
        PRessBeleg-Ressourcen eintragen (Count-Modus, 1:1 C++
        PtkUpDateProcessQueue add=TRUE, PRessBeleg.cpp:1571-1578).
        Nur wenn proz einen Knoten mit m_lAssozRess hat; keine RNG-/
        Event-Berührung (T-01-14-02).
        """
        self._items.append(proz)
        # Per-Ressource-Warteschlange füllen
        knoten = getattr(proz, "m_oKnoten", None)
        if knoten is None:
            return
        for assoz in getattr(knoten, "m_lAssozRess", ()):
            for ress in getattr(assoz, "m_lRessourcen", ()):
                wq = getattr(ress, "m_lPtkWartschl", None)
                if wq is not None and proz not in wq:
                    wq.append(proz)

    def remove(self, proz: "PtProzess") -> bool:
        """Entfernt proz aus der zentralen Warteschlange.

        Entfernt proz auch aus m_lPtkWartschl aller zugeordneten PRessBeleg-
        Ressourcen (C++: PtkUpDateProcessQueue add=FALSE bei erfolgreicher
        Bindung / proz_wart_ausloesen, PRessBeleg.cpp:1571-1578).
        Das ress_belegen-seitige Austragen bleibt zusätzlich in PRessBeleg.
        """
        try:
            self._items.remove(proz)
        except ValueError:
            return False
        # Per-Ressource-Warteschlange bereinigen
        knoten = getattr(proz, "m_oKnoten", None)
        if knoten is not None:
            for assoz in getattr(knoten, "m_lAssozRess", ()):
                for ress in getattr(assoz, "m_lRessourcen", ()):
                    wq = getattr(ress, "m_lPtkWartschl", None)
                    if wq is not None:
                        try:
                            wq.remove(proz)
                        except ValueError:
                            pass
        return True

    def find(self, proz: "PtProzess") -> int:
        """Index des Prozesses, oder -1."""
        try:
            return self._items.index(proz)
        except ValueError:
            return -1

    def clear(self) -> None:
        self._items.clear()
