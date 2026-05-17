"""PAssozMenge — Knoten ↔ PRessMenge-Assoziation (Material-Familie).

Provenienz: `OSimPro/PAssozRessource.odh` (Sektionen `PAssozMenge`,
`PAssozMengeErzgt`, `PAssozMengeVerbr`, `PAssozMengeVerbrZwischen`,
`PAssozMengeAbfr`) + zugehörige `.cpp`-Methoden.

V5-Slice "Material/Speicher":

| Subtyp             | RessVerfuegbar | OnProzBeginn       | OnProzEnde         |
|--------------------|----------------|--------------------|--------------------|
| PAssozMengeErzgt   | Zubuchung mgl.?| —                  | RessZubuchen       |
| PAssozMengeVerbr   | Bestand >= ein?| RessAbbuchen       | —                  |
| PAssozMengeVerbrZw | dito           | dito               | —                  |
| PAssozMengeAbfr    | Bestand >= abfr| —                  | —                  |

`PAssozMengeAbfr` ist die "nur lesen"-Variante (= "ich brauche x Stück
*verfügbar* zum Bearbeitungs-Start, will sie aber nicht verbrauchen").
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.assoziation.base import PAssozRessource
from osim_engine.resources.relation import PtRelationMenge

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.menge import PRessMenge
    from osim_engine.resources.relation import PtRelation


class PAssozMenge(PAssozRessource):
    """C++-Äquivalent: `PAssozMenge` (`PAssozRessource.odh:579`). Abstract.

    Hält die Referenz auf die zugehörige `PRessMenge`. Konkrete Logik in
    Subklassen.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lMengRess: "PRessMenge | None" = None

    # ------------------------------------------------------------------
    # Listen-Helfer — PAssozRessource.cpp:1874-1904
    # ------------------------------------------------------------------

    def is_in_list(self, pobj: Any) -> bool:
        return self.m_lMengRess is pobj

    def is_empty(self) -> bool:
        return self.m_lMengRess is None


class PAssozMengeErzgt(PAssozMenge):
    """C++-Äquivalent: `PAssozMengeErzgt` (`PAssozRessource.odh:658`).

    Erzeuger-Assoziation: am Prozess-ENDE wird `m_iMengeAus` zugebucht.
    Verfügbarkeit prüft nur, ob noch Platz im Lager ist (`abbuchen=False`).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iMengeAus: int = 1

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozMengeErzgt::RessVerfuegbar` (PAssozRessource.cpp:2089-2107)."""
        assert self.m_lMengRess is not None, (
            f"PAssozMengeErzgt {self.m_sName!r} ohne m_lMengRess"
        )
        if self.m_lMengRess.ress_verfuegbar(self.m_iMengeAus, proz, abbuchen=False):
            rel = PtRelationMenge(self.p_simulator)
            rel.m_oAssoz = self
            rel.m_oProzess = proz
            rel.m_oRessMenge = self.m_lMengRess
            proz.m_oRelationen.append(rel)
            return True
        return False

    def on_proz_ende(self, rel: "PtRelation") -> None:
        """C++: `PAssozMengeErzgt::OnProzEnde` (PAssozRessource.cpp:2113-2117)."""
        assert isinstance(rel, PtRelationMenge)
        assert rel.m_oRessMenge is not None
        assert rel.m_oProzess is not None
        rel.m_oRessMenge.ress_zubuchen(self.m_iMengeAus, rel.m_oProzess)


class PAssozMengeVerbr(PAssozMenge):
    """C++-Äquivalent: `PAssozMengeVerbr` (`PAssozRessource.odh:732`).

    Verbraucher-Assoziation: am Prozess-BEGINN wird `m_iMengeEin` abgebucht.
    Verfügbarkeit prüft, ob genug im Lager ist (`abbuchen=True`).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iMengeEin: int = 1

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozMengeVerbr::RessVerfuegbar` (PAssozRessource.cpp:2326-2343)."""
        assert self.m_lMengRess is not None, (
            f"PAssozMengeVerbr {self.m_sName!r} ohne m_lMengRess"
        )
        if self.m_lMengRess.ress_verfuegbar(self.m_iMengeEin, proz, abbuchen=True):
            rel = PtRelationMenge(self.p_simulator)
            rel.m_oAssoz = self
            rel.m_oProzess = proz
            rel.m_oRessMenge = self.m_lMengRess
            proz.m_oRelationen.append(rel)
            return True
        return False

    def on_proz_beginn(self, rel: "PtRelation") -> None:
        """C++: `PAssozMengeVerbr::OnProzBeginn` (PAssozRessource.cpp:2347-2351)."""
        assert isinstance(rel, PtRelationMenge)
        assert rel.m_oRessMenge is not None
        assert rel.m_oProzess is not None
        rel.m_oRessMenge.ress_abbuchen(self.m_iMengeEin, rel.m_oProzess)

    def on_proz_ende(self, rel: "PtRelation") -> None:
        """C++: `PAssozMengeVerbr::OnProzEnde` (PAssozRessource.cpp:2355-2357).
        No-op — Verbrauch ist beim Beginn passiert.
        """


class PAssozMengeVerbrZwischen(PAssozMengeVerbr):
    """C++-Äquivalent: `PAssozMengeVerbrZwischen` (`PAssozRessource.odh:809`).

    Zwischenstand-Verbrauch (für Kosten-Aggregation andere Bewertung).
    V5: gleiche Sim-Semantik wie `PAssozMengeVerbr`.
    """


class PAssozMengeAbfr(PAssozMenge):
    """C++-Äquivalent: `PAssozMengeAbfr` (`PAssozRessource.odh:872`).

    Abfrage-Assoziation: nur prüfen ob genug da, NICHT abbuchen.
    Anwendungsfall: Knoten braucht x Stück verfügbar zum Start (z. B.
    Materialbedarf einer Logistik-Tour), entnimmt sie aber nicht physisch.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iMengeAbfr: int = 1

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozMengeAbfr::RessVerfuegbar` (PAssozRessource.cpp:2675-2691)."""
        assert self.m_lMengRess is not None, (
            f"PAssozMengeAbfr {self.m_sName!r} ohne m_lMengRess"
        )
        if self.m_lMengRess.ress_verfuegbar(self.m_iMengeAbfr, proz, abbuchen=True):
            rel = PtRelationMenge(self.p_simulator)
            rel.m_oAssoz = self
            rel.m_oProzess = proz
            rel.m_oRessMenge = self.m_lMengRess
            proz.m_oRelationen.append(rel)
            return True
        return False

    def on_proz_ende(self, rel: "PtRelation") -> None:
        """C++: `PAssozMengeAbfr::OnProzEnde` (PAssozRessource.cpp:2697-2700).
        No-op — Anfrage hat nichts entnommen.
        """
