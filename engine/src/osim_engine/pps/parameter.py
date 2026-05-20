"""PParameter-Familie — Auslöser-/Trigger-Parameter.

Provenienz: `OSimPro/PParameter.odh` + `OSimPro/PParameter.cpp`.

Vollständig portierte Familie (P4-F). Jeder Subtyp überschreibt einen
internen Lookup-Hook `_hole_int(id, name)` / `_hole_float(id, name)` /
`_hole_string(id, name)`, der `(found: bool, value)` zurückgibt. Das
ersetzt das C++-Pattern `BOOL HoleParameterXxx(UINT id, const char *name, T &val)`
(Python hat keine Out-Parameter).

Lookup-Logik im Subtyp (1:1 zu C++):
- `name is None` → ID-Lookup: prüfe ob `id == PARAM_XYZ`
- `name is not None` → Name-Lookup: prüfe ob `m_sName == name`

`PParameterLList` (list-Subklasse) bietet beide Pfade in je zwei
Methoden — analog C++-Überladungen:
- `hole_parameter_int(name, default)` / `hole_parameter_int_by_id(id, default)`
- `hole_parameter_float(name, default)` / `hole_parameter_float_by_id(id, default)`
- `hole_parameter_string(name, default)` / `hole_parameter_string_by_id(id, default)`

PARAM_*-IDs wörtlich aus C++ (`PParameter.odh:23-29`):
  10=Menge, 11=Prioritaet, 12=ID, 13=KrzRscEinsatz,
  14=ZstIntBegin, 15=ZstIntEnd, 100=User (frei).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# PARAM-ID-Konstanten — C++ PParameter.odh:23-29
# ----------------------------------------------------------------------

PARAM_MENGE: int = 10
PARAM_PRIORITAET: int = 11
PARAM_ID: int = 12
PARAM_KRZRSCEINSATZ: int = 13
PARAM_ZSTINTBEGIN: int = 14
PARAM_ZSTINTEND: int = 15
PARAM_USER: int = 100


# ----------------------------------------------------------------------
# Basisklasse
# ----------------------------------------------------------------------


class PParameter(PSimObj):
    """C++-Äquivalent: `PParameter` (`PParameter.odh:32`). Abstract.

    Die Lookup-Hooks `_hole_int / _hole_float / _hole_string` returnen
    `(found, value)`. Default: `(False, 0/0.0/"")`. Subtypen mit Wert
    überschreiben den passenden Hook.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_sName = "unbenannt"

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        """C++: `PParameter::HoleParameterInt` (PParameter.cpp:113-116) — FALSE."""
        del param_id, name
        return (False, 0)

    def _hole_float(self, param_id: int, name: str | None) -> tuple[bool, float]:
        """C++: `PParameter::HoleParameterFloat` (PParameter.cpp:119-122) — FALSE."""
        del param_id, name
        return (False, 0.0)

    def _hole_string(self, param_id: int, name: str | None) -> tuple[bool, str]:
        """C++: `PParameter::HoleParameterString` (PParameter.cpp:125-128) — FALSE."""
        del param_id, name
        return (False, "")


# ----------------------------------------------------------------------
# PParameterInt — generischer Int-Parameter, Name-Lookup only
# ----------------------------------------------------------------------


class PParameterInt(PParameter):
    """C++-Äquivalent: `PParameterInt` (`PParameter.odh:68`).

    Match NUR über Namen (kein ID-Match auf der Basisklasse). Subtypen
    mit fester ID (Menge / Prioritaet / ID / ...) erweitern auf
    ID-Match.
    """

    def __init__(self, simulator: "PSimulator | None", name: str = "unbenannt",
                 wert: int = 0) -> None:
        super().__init__(simulator)
        self.m_sName = name
        self.m_iWert: int = wert

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        """C++: `PParameterInt::HoleParameterInt` (PParameter.cpp:136-146).

        Bei `name==None` (= NULL in C++) liefert die Basisklasse FALSE
        — Subtypen wie PParameterMenge prüfen hier die ID. Bei Name-
        Match liefert die Basisklasse den Wert.
        """
        del param_id
        if name is None:
            return (False, 0)
        if self.m_sName == name:
            return (True, self.m_iWert)
        return (False, 0)


# ----------------------------------------------------------------------
# Int-Subtypen mit fester PARAM-ID
# ----------------------------------------------------------------------


def _int_lookup_with_id(
    self_name: str,
    self_wert: int,
    fixed_id: int,
    param_id: int,
    name: str | None,
) -> tuple[bool, int]:
    """Helper für Int-Subtypen mit fester PARAM-ID.

    Mirror der C++-Pattern (z. B. PParameterMenge.cpp:172-187):
        - name==None → if id==fixed_id: return wert; else FALSE
        - name!=None → if m_sName==name: return wert; else FALSE
    """
    if name is None:
        if param_id == fixed_id:
            return (True, self_wert)
        return (False, 0)
    if self_name == name:
        return (True, self_wert)
    return (False, 0)


class PParameterMenge(PParameterInt):
    """C++-Äquivalent: `PParameterMenge` (`PParameter.odh:130`).

    Default-Name `"menge"`, Default-Wert `1`, fixe PARAM-ID `PARAM_MENGE`.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 1) -> None:
        super().__init__(simulator, name="menge", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_MENGE, param_id, name
        )


class PParameterPrioritaet(PParameterInt):
    """C++-Äquivalent: `PParameterPrioritaet` (`PParameter.odh:149`).

    Default-Name `"prioritaet"`, Default-Wert `0`, fixe PARAM-ID
    `PARAM_PRIORITAET`.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 0) -> None:
        super().__init__(simulator, name="prioritaet", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_PRIORITAET, param_id, name
        )


class PParameterID(PParameterInt):
    """C++-Äquivalent: `PParameterID` (`PParameter.odh:168`).

    Default-Name `"id"`, Default-Wert `0`, fixe PARAM-ID `PARAM_ID`.
    Wird vom Alternativ-Knoten (`PDpKnAlternativTypID`) gelesen.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 0) -> None:
        super().__init__(simulator, name="id", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_ID, param_id, name
        )


class PParameterKrzRscEinsatz(PParameterInt):
    """C++-Äquivalent: `PParameterKrzRscEinsatz` (`PParameter.odh:186`).

    Default-Name `"KrzRscEinsatz"`, Default-Wert `0`, fixe PARAM-ID
    `PARAM_KRZRSCEINSATZ`. Markiert "kurzfristiger Ressourcen-Einsatz"
    (Verwendung in Phase-5-Entscheidern).
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = 0) -> None:
        super().__init__(simulator, name="KrzRscEinsatz", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_KRZRSCEINSATZ, param_id, name
        )


class PParameterZstIntBegin(PParameterInt):
    """C++-Äquivalent: `PParameterZstIntBegin` (`PParameter.odh:203`).

    Default-Name `"ZstIntBegin"`, Default-Wert `-1`, fixe PARAM-ID
    `PARAM_ZSTINTBEGIN`. Markiert Zustellungs-Intervall-Begin.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = -1) -> None:
        super().__init__(simulator, name="ZstIntBegin", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_ZSTINTBEGIN, param_id, name
        )


class PParameterZstIntEnd(PParameterInt):
    """C++-Äquivalent: `PParameterZstIntEnd` (`PParameter.odh:220`).

    Default-Name `"ZstIntEnd"`, Default-Wert `-1`, fixe PARAM-ID
    `PARAM_ZSTINTEND`. Markiert Zustellungs-Intervall-Ende.
    """

    def __init__(self, simulator: "PSimulator | None", wert: int = -1) -> None:
        super().__init__(simulator, name="ZstIntEnd", wert=wert)

    def _hole_int(self, param_id: int, name: str | None) -> tuple[bool, int]:
        return _int_lookup_with_id(
            self.m_sName, self.m_iWert, PARAM_ZSTINTEND, param_id, name
        )


# ----------------------------------------------------------------------
# Float + String — keine festen PARAM-IDs, nur Name-Lookup
# ----------------------------------------------------------------------


class PParameterFloat(PParameter):
    """C++-Äquivalent: `PParameterFloat` (`PParameter.odh:89`).

    Default-Name `"unbenannt"`, Default-Wert `0.0`. Generischer
    Float-Parameter; Lookup nur über Namen (in C++ wird `id` nicht
    ausgewertet, siehe PParameter.cpp:154-164).
    """

    def __init__(self, simulator: "PSimulator | None", name: str = "unbenannt",
                 wert: float = 0.0) -> None:
        super().__init__(simulator)
        self.m_sName = name
        self.m_fWert: float = wert

    def _hole_float(self, param_id: int, name: str | None) -> tuple[bool, float]:
        del param_id
        if name is None:
            return (False, 0.0)
        if self.m_sName == name:
            return (True, self.m_fWert)
        return (False, 0.0)


class PParameterString(PParameter):
    """C++-Äquivalent: `PParameterString` (`PParameter.odh:110`).

    Default-Name `"unbenannt"`, Default-Wert `"leer"`. Generischer
    String-Parameter; Lookup nur über Namen (siehe
    PParameter.cpp:302-312).
    """

    def __init__(self, simulator: "PSimulator | None", name: str = "unbenannt",
                 wert: str = "leer") -> None:
        super().__init__(simulator)
        self.m_sName = name
        self.m_sWert: str = wert

    def _hole_string(self, param_id: int, name: str | None) -> tuple[bool, str]:
        del param_id
        if name is None:
            return (False, "")
        if self.m_sName == name:
            return (True, self.m_sWert)
        return (False, "")


# ----------------------------------------------------------------------
# PParameterLList — Lookup-Container
# ----------------------------------------------------------------------


class PParameterLList(list):
    """C++-Äquivalent: `PParameterLList` (`PParameter.odh:49`).

    `list`-Subklasse mit sechs Lookup-Methoden (Int/Float/String,
    je name-based + id-based). Iteriert sequentiell, gibt ersten
    Treffer zurück; bei kein Treffer wird der Default zurückgegeben.

    Wörtlich aus C++ (PParameter.cpp:18-105): die Liste iteriert
    head→tail, jeder Param wird gefragt; sobald einer TRUE liefert,
    Ende der Schleife. Andernfalls `defVal`.
    """

    def hole_parameter_int(self, name: str, def_val: int) -> int:
        """Name-Lookup über Int-Parameter.

        C++: `PParameterLList::HoleParameterInt(const char *name, int defVal)`
        (PParameter.cpp:33-45).
        """
        for param in self:
            found, val = param._hole_int(0, name)
            if found:
                return val
        return def_val

    def hole_parameter_int_by_id(self, param_id: int, def_val: int) -> int:
        """ID-Lookup über Int-Parameter.

        C++: `PParameterLList::HoleParameterInt(UINT id, int defVal)`
        (PParameter.cpp:18-30).
        """
        for param in self:
            found, val = param._hole_int(param_id, None)
            if found:
                return val
        return def_val

    def hole_parameter_float(self, name: str, def_val: float) -> float:
        """Name-Lookup über Float-Parameter.

        C++: `PParameterLList::HoleParameterFloat(const char *, float)`
        (PParameter.cpp:63-75).
        """
        for param in self:
            found, val = param._hole_float(0, name)
            if found:
                return val
        return def_val

    def hole_parameter_float_by_id(self, param_id: int, def_val: float) -> float:
        """ID-Lookup über Float-Parameter.

        C++: `PParameterLList::HoleParameterFloat(UINT, float)`
        (PParameter.cpp:48-60).
        """
        for param in self:
            found, val = param._hole_float(param_id, None)
            if found:
                return val
        return def_val

    def hole_parameter_string(self, name: str, def_val: str) -> str:
        """Name-Lookup über String-Parameter.

        C++: `PParameterLList::HoleParameterString(const char *, const char *)`
        (PParameter.cpp:93-105).
        """
        for param in self:
            found, val = param._hole_string(0, name)
            if found:
                return val
        return def_val

    def hole_parameter_string_by_id(self, param_id: int, def_val: str) -> str:
        """ID-Lookup über String-Parameter.

        C++: `PParameterLList::HoleParameterString(UINT, const char *)`
        (PParameter.cpp:78-90).
        """
        for param in self:
            found, val = param._hole_string(param_id, None)
            if found:
                return val
        return def_val
