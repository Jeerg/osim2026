"""PEntitaet — Marker-Klasse für die durch die Pipeline fließende Entität.

Provenienz: `OSimPro/PEntitaet.odh` + `OSimPro/PEntitaet.cpp`.

**1:1 zur C++-Vorlage:** Die Klassenhierarchie ist in C++ überwiegend
Skelett — die zentralen Methoden `Klonen` / `Abspalten` / `Zusammenfuehren`
werfen alle `OException`. PEntitaet dient primär als typisierter Marker,
der über `PAusloeser.m_lEntitaet` → `PtTrigger.m_oEntitaet`(?) →
`PtProzess.m_oEntitaet` durch das Sim-Modell wandert.

Wir portieren die Hierarchie 1:1 als Stub-Klassen mit
`NotImplementedError` für die unimplementierten Methoden. Subklassen wie
`PEntEinzel` setzen sinnvolle Defaults (m_iEinheiten=1) im Konstruktor.

In V5.5 wird PEntitaet `Any` in PAusloeser.m_lEntitaet / PtProzess.m_oEntitaet
NICHT erzwungen — das wäre eine Verschärfung gegenüber C++. Nutzer können
Instanzen von PEntEinzel anhängen, müssen aber nicht.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.simulator import PSimulator


class PEntitaet(PSimObj):
    """C++-Äquivalent: `PEntitaet` (`PEntitaet.odh:23`). Abstract.

    Trägt die Anzahl der Einheiten und den Rück-Link zum Auslöser.
    Klonen/Abspalten/Zusammenfuehren sind C++-Stubs.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lAusl: "PAusloeser | None" = None
        self.m_iEinheiten: int = 0

    def klonen(self) -> "PEntitaet":
        """C++: `PEntitaet::Klonen` (PEntitaet.cpp:24-28) wirft OException."""
        raise NotImplementedError(
            "PEntitaet.klonen ist 1:1 zum C++-Stub nicht implementiert. "
            "Subklassen können das überschreiben (z. B. für Splitting)."
        )

    def abspalten(self, i_einheiten: int) -> "PEntitaet":  # noqa: ARG002
        """C++: `PEntitaet::Abspalten` wirft OException."""
        raise NotImplementedError(
            "PEntitaet.abspalten ist 1:1 zum C++-Stub nicht implementiert."
        )

    def zusammenfuehren(self, ent: "PEntitaet") -> None:  # noqa: ARG002
        """C++: `PEntitaet::Zusammenfuehren` wirft OException."""
        raise NotImplementedError(
            "PEntitaet.zusammenfuehren ist 1:1 zum C++-Stub nicht implementiert."
        )


class PEntEinzel(PEntitaet):
    """C++-Äquivalent: `PEntEinzel` (`PEntitaet.odh:50`).

    Einzelne, benannte Entität. Konstruktor setzt `m_iEinheiten=1`
    (PEntitaet.odh:60-63).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_sName ist in PSimObj — Default ""; C++-Default ist "unbenannt".
        if not self.m_sName:
            self.m_sName = "unbenannt"
        self.m_iEinheiten = 1


class PEntWeitergabe(PEntitaet):
    """C++-Äquivalent: `PEntWeitergabe` (`PEntitaet.odh:71`).

    Entität für mengen-basierte Weitergabe in einem Plan (z. B.
    Chargen-Splits). C++-Klonen ist Stub — wir auch.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iWeitergabemenge: int = 0


class PEntExtern(PEntitaet):
    """C++-Äquivalent: `PEntExtern` (`PEntitaet.odh:86`).

    Entität für extern gesteuerte Knoten (`PDpKnExtern`).
    Sim-Methoden sind in C++ Stubs — wir auch.
    """

    def bearbeit_beginn(self, knoten) -> None:  # noqa: ARG002, ANN001
        """C++: `PEntExtern::BearbeitBeginn` wirft OException."""
        raise NotImplementedError(
            "PEntExtern.bearbeit_beginn ist 1:1 zum C++-Stub nicht "
            "implementiert (kommt mit Phase 4 / PDpKnExtern)."
        )

    def proz_weitergeben(self, kante) -> None:  # noqa: ARG002, ANN001
        """C++: `PEntExtern::ProzWeitergeben` wirft OException."""
        raise NotImplementedError(
            "PEntExtern.proz_weitergeben ist 1:1 zum C++-Stub nicht "
            "implementiert (kommt mit Phase 4 / PDpKaExtern)."
        )
