"""PParameter-Stub für Auslöser-Parameter (P4-B-Minimal-Subset).

Provenienz: `OSimPro/PParameter.odh` + `OSimPro/PParameter.cpp`.

P4-B braucht den Parameter-Lookup `m_lParameter->HoleParameterInt("id", 0)`
für `PDpKnAlternativTypID::AlternativeAuswaehlen`. Die volle
PParameter-Familie (Menge, Prioritaet, KrzRscEinsatz, ZstIntBegin/End,
String/Float-Subtypen) wird in **P4-F** portiert.

Hier nur die Untermenge, die der Alternativ-Knoten braucht:

- `PParameter` (abstract) — Name + Wert-Slot, kein Wert-Typ-spezifischer Zugriff
- `PParameterInt` — Int-Wert (`m_iWert`)
- `PParameterID` — Subtyp mit Default-Name "id"
- `PParameterLList` — list-Subklasse mit `hole_parameter_int(name, default)`

Letzteres mirrors die C++-`PParameterLList`-Methode 1:1.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PParameter(PSimObj):
    """C++-Äquivalent: `PParameter` (`PParameter.odh:32`). Abstract.

    Trägt nur den Namen — Wert-Slot liegt im Subtyp.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_sName = "unbenannt"


class PParameterInt(PParameter):
    """C++-Äquivalent: `PParameterInt` (`PParameter.odh:68`)."""

    def __init__(self, simulator: "PSimulator | None", name: str = "unbenannt",
                 wert: int = 0) -> None:
        super().__init__(simulator)
        self.m_sName = name
        self.m_iWert: int = wert


class PParameterID(PParameterInt):
    """C++-Äquivalent: `PParameterID` (`PParameter.odh:168`).

    Default-Name `"id"`, Default-Wert `0`. Wird vom Alternativ-Knoten
    (`PDpKnAlternativTypID`) gelesen.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 0) -> None:
        super().__init__(simulator, name="id", wert=wert)


class PParameterMenge(PParameterInt):
    """C++-Äquivalent: `PParameterMenge` (`PParameter.odh:130`).

    Default-Name `"menge"`, Default-Wert `1`. Wird von den Menge-Knoten
    (`PDpKnMenge`, `PDpKnMengeRuesten`) gelesen.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 1) -> None:
        super().__init__(simulator, name="menge", wert=wert)


class PParameterLList(list):
    """C++-Äquivalent: `PParameterLList` (`PParameter.odh:49`).

    `list`-Subklasse mit Lookup-Methoden. C++ bietet sowohl ID- als auch
    Name-basierten Zugriff; hier nur Name-basierter Int-Zugriff (das
    einzige, was P4-B benötigt).
    """

    def hole_parameter_int(self, name: str, def_val: int) -> int:
        """C++-Äquivalent: `PParameterLList::HoleParameterInt(const char*, int)`
        (siehe PParameter.cpp). Sucht ersten PParameterInt mit passendem
        Namen; bei keinem Match wird der Default zurückgegeben.
        """
        for param in self:
            if isinstance(param, PParameterInt) and param.m_sName == name:
                return param.m_iWert
        return def_val
