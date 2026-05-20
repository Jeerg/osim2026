"""PRessKollektion — Container für eine Pool-Gruppe von PRessBeleg.

Provenienz: `OSimPro/PRessKollektion.odh` + `OSimPro/PRessKollektion.cpp`.

**Wichtig (1:1 zur C++-Vorlage):** Die eigentliche Pool-Semantik ("n
austauschbare Ressourcen, eine freie wird genommen") ist NICHT in
`PRessKollektion` implementiert — sondern in `PAssozBeleg.RessVerfuegbar`
(siehe `resources/assoziation/beleg.py`), das schlicht über alle Elemente
seiner `m_lRessourcen`-Liste iteriert und die erste freie nimmt.

`PRessKollektion` ist im C++-Code selbst ein **Stub** (alle Sim-Methoden
werfen `OException`). Die Klasse existiert primär als Aggregations-
Container für GUI-Darstellung und als spätere Andock-Stelle für
Entscheider-Logik. Wir portieren sie 1:1 inklusive der Stub-Methoden,
damit künftige C++-Referenzen 1:1 übertragbar bleiben.

V7-Praxis: Wer einen Maschinen-Pool modellieren will, hängt einfach
mehrere `PRessBeleg` in `PAssozBeleg.m_lRessourcen`. `PRessKollektion`
wird nicht direkt in `m_lAssozRess` referenziert.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.resources.beleg import PRessBeleg

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PRessKollektion(PRessBeleg):
    """C++-Äquivalent: `PRessKollektion` (`PRessKollektion.odh:20`).

    Subtyp von `PRessBeleg` (nicht von `PRessource`!) — erbt damit auch
    den passiven Belegungspfad, der jedoch durch die Override-Stubs
    (RessVerfuegbar/RessBelegen/RessFreigeben) ausgehebelt wird.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lRessUnter: list[PRessBeleg] = []

    def get_ress_anzahl(self) -> int:
        """C++: `PRessKollektion::GetRessAnzahl` (PRessKollektion.cpp:21-24)."""
        return len(self.m_lRessUnter)

    # ------------------------------------------------------------------
    # Sim-Methoden — 1:1 als Stub (C++ wirft OException)
    # ------------------------------------------------------------------

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        """C++: `PRessKollektion::RessVerfuegbar` (PRessKollektion.cpp:32-35)
        gibt `TRUE` zurück — semantisch sinnlos, da die Belegungsmethoden
        werfen. Pool-Semantik läuft über `PAssozBeleg.m_lRessourcen`.
        """
        return True

    def ress_belegen(self, proz: "PtProzess") -> None:
        """C++: `PRessKollektion::RessBelegen` (PRessKollektion.cpp:38-41)
        wirft `OException`. Nicht direkt rufbar — Pool-Belegung läuft
        über die zugrundeliegenden Einzel-Belege.
        """
        raise NotImplementedError(
            "PRessKollektion.ress_belegen ist 1:1 zum C++-Stub nicht "
            "implementiert. Pool-Belegung läuft über PAssozBeleg, die "
            "die individuellen PRessBeleg-Einträge aus m_lRessourcen "
            "auswählt und einzeln belegt."
        )

    def ress_freigeben(self, proz: "PtProzess") -> None:
        """C++: `PRessKollektion::RessFreigeben` wirft `OException`."""
        raise NotImplementedError(
            "PRessKollektion.ress_freigeben ist 1:1 zum C++-Stub nicht "
            "implementiert."
        )


class PRessKollEinheiten(PRessKollektion):
    """C++-Äquivalent: `PRessKollEinheiten` (`PRessKollektion.odh:53`).

    Variante mit expliziter Einheiten-Anzahl statt Liste. C++ ist auch
    hier komplett Stub — Methoden werfen.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iEinheiten: int = 0

    def get_ress_anzahl(self) -> int:
        """C++: `PRessKollEinheiten::GetRessAnzahl` (PRessKollektion.cpp:76-79)."""
        return self.m_iEinheiten

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        raise NotImplementedError(
            "PRessKollEinheiten.ress_verfuegbar ist 1:1 zum C++-Stub nicht "
            "implementiert."
        )
