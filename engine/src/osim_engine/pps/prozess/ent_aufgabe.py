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


class PtProzEntAufgabeIntern(PtProzZeitvorgabe):
    """C++-Äquivalent: `PtProzEntAufgabeIntern` (`PtProzess.odh:339-353`).

    Oberprozess für interne Entscheidungs-Aufgaben (`EPEntAufgabeAltIntern`
    und Subklassen). Hält den ausgewählten Sub-Plan in `m_oDlpl` sowie
    optional ein EntFeld.

    Sim-Methoden sind ggü. PtProzZeitvorgabe leicht überschrieben:
    - `bearbeit_beginnen`/`bearbeit_beenden` — eigene Ablauf-Logik
    - `on_unter_proz_beginn`/`ende` — Sub-Prozess-Hooks

    In Slice P5-D minimal implementiert; die echte Sub-Plan-Routing-Logik
    kommt durch das Zusammenspiel mit `EPEntAufgabeAltIntern.on_proz_beendet`
    (siehe decisions/aufgabe.py).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # zugehöriger Durchlaufplan (gewählte Alternative)
        self.m_oDlpl: Any = None
        # zugehöriges Entscheidungsfeld (optional)
        self.m_oEntFeld: Any = None
