"""PtProzExtern — Prozess-Stub für extern gesteuerte Knoten.

Provenienz: `OSimPro/PtProzess.odh:274-290` + `OSimPro/PtProzess.cpp:790-848`.

**1:1-Befund:** Im C++-Original sind ALLE sechs Methoden unimplementiert
(`throw OException`):

- `RessVerfuegbar`
- `BearbeitBeginnen`
- `OnUnterProzBeginn(proz)` / `OnUnterProzEnde(proz)`
- `ExternBeginn(ent)` / `ExternEnde(ent)` / `ExternUnterbr(ent)`

Die Klasse ist abstract (`$option ..., abstract`) — auch keine konkrete
Subklasse wurde implementiert.

Eine echte Implementation wäre eine Diss-basierte Erweiterung
(Jonsson 2003) und ist NICHT Gegenstand der 1:1-Portierung.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PtProzExtern(PtProzess):
    """C++-Äquivalent: `PtProzExtern` (`PtProzess.odh:276`). Abstract-Stub.

    Im C++ `$option abstract` — keine konkrete Subklasse existiert.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)

    def ress_verfuegbar(self) -> bool:
        """C++: `PtProzExtern::RessVerfuegbar` (PtProzess.cpp:799-803) —
        wirft OException.
        """
        raise NotImplementedError(
            "PtProzExtern.ress_verfuegbar ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def bearbeit_beginnen(self) -> None:
        """C++: `PtProzExtern::BearbeitBeginnen` (PtProzess.cpp:806-809) —
        wirft OException.
        """
        raise NotImplementedError(
            "PtProzExtern.bearbeit_beginnen ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def on_unter_proz_beginn(self, proz: "PtProzess") -> None:
        """C++: `PtProzExtern::OnUnterProzBeginn` (PtProzess.cpp:816-819) —
        wirft OException.
        """
        del proz
        raise NotImplementedError(
            "PtProzExtern.on_unter_proz_beginn ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def on_unter_proz_ende(self, proz: "PtProzess") -> None:
        """C++: `PtProzExtern::OnUnterProzEnde` (PtProzess.cpp:822-825) —
        wirft OException.
        """
        del proz
        raise NotImplementedError(
            "PtProzExtern.on_unter_proz_ende ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def extern_beginn(self, ent: "object") -> None:
        """C++: `PtProzExtern::ExternBeginn(oprPEntExtern)`
        (PtProzess.cpp:833-836) — wirft OException.
        """
        del ent
        raise NotImplementedError(
            "PtProzExtern.extern_beginn ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def extern_ende(self, ent: "object") -> None:
        """C++: `PtProzExtern::ExternEnde(oprPEntExtern)`
        (PtProzess.cpp:839-842) — wirft OException.
        """
        del ent
        raise NotImplementedError(
            "PtProzExtern.extern_ende ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def extern_unterbr(self, ent: "object") -> None:
        """C++: `PtProzExtern::ExternUnterbr(oprPEntExtern)`
        (PtProzess.cpp:845-848) — wirft OException.
        """
        del ent
        raise NotImplementedError(
            "PtProzExtern.extern_unterbr ist im C++-Original ein Stub "
            "(throw OException)."
        )
