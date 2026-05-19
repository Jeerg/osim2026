"""PtProzEntAufgabeBase — Prozess-Subtyp für Entscheidungs-Aufgaben.

Provenienz: `OSimPro/PtProzess.odh:325-333` + `PtProzess.cpp` (kein
eigener Implementierungs-Code, alles über PtProzZeitvorgabe geerbt).

Erweitert `PtProzZeitvorgabe` nur um eine Referenz auf das
`EPEntFeld`, in dem die Entscheidung getroffen wurde (gesetzt durch
`EPAszEntFeld.ress_verfuegbar` oder `EPEntscheidungsAufgabe.bearbeit_beginnen`
im `eaKeineBelegung`-Pfad).

`PtProzEntAufgabeIntern` (mit zusätzlichem Sub-Plan-Slot) kommt in
Slice P5-D, da nur die Internal-Variante eigene Sim-Methoden hat.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PtProzEntAufgabeBase(PtProzZeitvorgabe):
    """C++-Äquivalent: `PtProzEntAufgabeBase` (`PtProzess.odh:325-333`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # zugehöriges Entscheidungsfeld — wird von EPAszEntFeld.ress_verfuegbar
        # oder EPEntscheidungsAufgabe.bearbeit_beginnen gesetzt
        self.m_oEntFeld: Any = None
