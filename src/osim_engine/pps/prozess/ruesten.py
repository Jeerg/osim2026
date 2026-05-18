"""PtProzRuesten — Klassen-Stub (im C++-Original ohne Implementation).

Provenienz: `OSimPro/PtProzess.odh:262-269` + `OSimPro/PtProzess.cpp:762-787`.

**Wichtiger 1:1-Befund:** Im C++-Original ist `PtProzRuesten` lediglich
**deklariert + registriert** (`DllOSimPro.cpp:253` → DllPreRegister), aber
alle drei Methoden werfen `OException`:

```cpp
void PtProzRuesten::BearbeitBeginn() { throw new OException; }
void PtProzRuesten::RuestEnde()      { throw new OException; }
void PtProzRuesten::BearbeitEnde()   { throw new OException; }
```

Es gibt im gesamten C++-Code KEINEN Knoten, der `PtProzRuesten`
instanziiert. Die geplante separate Rüst-Phase als eigener Prozess-Subtyp
wurde nie implementiert. `PDpKnMengeRuesten` (P4-C) addiert die Rüstzeit
stattdessen zur Bearbeitungszeit als einen Block.

Nach der dokumentierten Konvention (siehe `memory/architecture.md`:
"Methoden-Stubs in C++ (throw OException) → `NotImplementedError`")
wird die Klasse hier als minimaler Stub portiert. Damit ist die
Class-Hierarchy 1:1 zu C++ und der Stub-Status explizit dokumentiert.

Eine echte Rüstprozess-Implementierung mit eigenen EventBus-Topics
würde eine Diss-basierte Erweiterung (Jonsson 2003) bedeuten und ist
explizit NICHT Gegenstand dieser Portierung.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PtProzRuesten(PtProzess):
    """C++-Äquivalent: `PtProzRuesten` (`PtProzess.odh:262`).

    Stub-Klasse — alle drei C++-Methoden werfen OException, daher hier
    `NotImplementedError` mit Hinweis auf den 1:1-Status.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)

    def bearbeit_beginn(self) -> None:
        """C++: `PtProzRuesten::BearbeitBeginn` (PtProzess.cpp:768-771) —
        unimplementiert (`throw OException`).
        """
        raise NotImplementedError(
            "PtProzRuesten.bearbeit_beginn ist im C++-Original ein Stub "
            "(throw OException). Eine echte Rüstprozess-Implementierung "
            "ist nicht Gegenstand der 1:1-Portierung."
        )

    def ruest_ende(self) -> None:
        """C++: `PtProzRuesten::RuestEnde` (PtProzess.cpp:778-781) —
        $event(2)-Slot, unimplementiert.
        """
        raise NotImplementedError(
            "PtProzRuesten.ruest_ende ist im C++-Original ein Stub "
            "(throw OException)."
        )

    def bearbeit_ende(self) -> None:
        """C++: `PtProzRuesten::BearbeitEnde` (PtProzess.cpp:784-787) —
        $event(2)-Slot, unimplementiert.
        """
        raise NotImplementedError(
            "PtProzRuesten.bearbeit_ende ist im C++-Original ein Stub "
            "(throw OException)."
        )
