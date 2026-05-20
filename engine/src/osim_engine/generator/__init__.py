"""PGenerator-Modul (Slice P5-L).

Provenienz: `OSimPro/PSimulator.odh:175-700` (PGenerator-Sektion).

Modellgenerator für Multi-Lauf-Modell-Manipulation auf Basis von .psg-
Files. P5-L als Klassen-Struktur + Stub-Methoden — volle Logik
(WriteGeneratorFile, InterpretPSimGeneratorFile, Engpass-Erkennung,
TmpAZModell-Generation) wartet auf eigene Spezial-Slice mit komplettem
Datei-I/O-Pfad.
"""

from osim_engine.generator.generator import (
    PGenAZIntervall,
    PGenAZRscBeleg,
    PGenAZTag,
    PGenerator,
    PGenInitInfo,
    PGenKnz,
    PGenLauf,
    PGenObj,
    PGenStatus,
    PGenTmpAZModell,
    PGenZeitinfo,
    PProp,
)

__all__ = [
    "PGenAZIntervall",
    "PGenAZRscBeleg",
    "PGenAZTag",
    "PGenInitInfo",
    "PGenKnz",
    "PGenLauf",
    "PGenObj",
    "PGenStatus",
    "PGenTmpAZModell",
    "PGenZeitinfo",
    "PGenerator",
    "PProp",
]
