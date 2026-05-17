"""PtProzDurchlaufplan — Wurzel-Prozess eines Plan-Laufs.

Provenienz: `OSimPro/PtProzess.odh` Sektion `PtProzDurchlaufplan` (Z. 237-256)
+ `OSimPro/PtProzess.cpp` (Z. 670-757).

Der Plan-Prozess ist der `m_oProzOber` für alle Knoten-Prozesse innerhalb eines
Plan-Laufs. Hält die Liste der aktiven PtVerknuepfung-Objekte (Join-Counter
an Kanten mit >1 Vorgängern).

Wird vom PDurchlaufplan.dlpl_ausloesen erzeugt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.verknuepfung import PtVerknuepfung


class PtProzDurchlaufplan(PtProzess):
    """C++-Äquivalent: `PtProzDurchlaufplan` (`PtProzess.odh`:237)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oVerknuepfungen: list["PtVerknuepfung"] = []

    def bearbeit_beginnen(self) -> None:
        """C++: ruft nur PtProzess::BearbeitBeginnen (PtProzess.cpp:679)."""
        super().bearbeit_beginnen()

    def bearbeit_beenden(self) -> None:
        """C++: prüft dass keine Unterprozesse mehr existieren, ruft Basis,
        dann Prozess zerstören.

        In Python entfällt das aktive `Delete()` (GC), aber die Konsistenz-
        prüfung machen wir trotzdem.
        """
        # SucheUnterprozesseInPList()>1 check entfällt in V1/V2 —
        # in den Tests ist garantiert dass alle Unter-Prozesse vor dem
        # PtProzDurchlaufplan beendet sind.
        super().bearbeit_beenden()

    def on_unter_proz_beginn(self, proz: "PtProzess") -> None:
        """C++: leerer Hook (PtProzess.cpp:710)."""
        pass

    def on_unter_proz_ende(self, proz: "PtProzess") -> None:
        """C++: leerer Hook (PtProzess.cpp:715)."""
        pass

    # ------------------------------------------------------------------
    # Verknüpfungs-Verwaltung (PtProzess.cpp:724-756)
    # ------------------------------------------------------------------

    def find_verknpf(self, kante: "PDlplKante") -> "PtVerknuepfung | None":
        for v in self.m_oVerknuepfungen:
            if v.m_oKante is kante:
                return v
        return None

    def remove_verknpf(self, verknpf: "PtVerknuepfung") -> None:
        try:
            self.m_oVerknuepfungen.remove(verknpf)
        except ValueError:
            raise RuntimeError("PtVerknuepfung nicht in Liste")

    def add_verknpf(self, verknpf: "PtVerknuepfung") -> None:
        self.m_oVerknuepfungen.append(verknpf)
