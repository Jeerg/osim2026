"""ACO-Klassen — Ant-Colony-Optimization (Slice P5-K).

Provenienz: `OSimPro/ACOClasses.{odh,cpp}`.

Klassen-Hierarchie:

    EPEntAufgabeAltIntern (P5-D)
    ├── ACOSplit       (ProzErzeugen liefert PtProzACOSplit)
    └── ACOLogik       (ProzErzeugen liefert PtProzZeitvorgabe)

    PDpKnMengeRuesten (P4)
    ├── ACODpKnSplit   (mit GetSplitMenge)
    └── ACOReihenfolge (eigene ProzWeitergeben-Logik)

ACO-Marken (`ACOMarkeSplit`, `ACOMarkeReihenfolge`, `ACOMarkeLogik`) sind
SimInfo-Subtypen für die SimInfo-Liste. P5-K als Skelette.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.decisions.aufgabe import EPEntAufgabeAltIntern
from osim_engine.pps.knoten.zeitvorgabe import PDpKnMengeRuesten

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# ACO-Marken (SimInfo-Subtypen) — als Marker-Klassen
# ----------------------------------------------------------------------


class ACOMarke:
    """Basis aller ACO-Marken. C++: ACOClasses.odh."""


class ACOMarkeSplit(ACOMarke):
    """C++: ACOMarkeSplit — ACOClasses.odh:40-46."""


class ACOMarkeReihenfolge(ACOMarke):
    """C++: ACOMarkeReihenfolge — ACOClasses.odh:161-168."""
    def __init__(self) -> None:
        self.iDummy: int = 0


class ACOMarkeLogik(ACOMarke):
    """C++: ACOMarkeLogik — ACOClasses.odh:220-225."""
    def __init__(self) -> None:
        self.iDummy: int = 0


# ----------------------------------------------------------------------
# ACOSplit — Knoten mit Sub-Plan-Split
# ----------------------------------------------------------------------


class ACOSplit(EPEntAufgabeAltIntern):
    """C++: `ACOSplit : $public EPEntAufgabeAltIntern`
    (`ACOClasses.odh:52-84`).

    Erbt von EPEntAufgabeAltIntern; ProzErzeugen liefert PtProzACOSplit
    statt PtProzEntAufgabeIntern. Die Methoden zur Sub-Prozess-Mengen-
    Verteilung sind als Skelette implementiert.
    """

    def create_s_info(self) -> ACOMarkeSplit:
        """C++: CreateSInfo — erzeugt ACOMarkeSplit."""
        return ACOMarkeSplit()

    def proz_erzeugen(self) -> Any:
        """C++: ProzErzeugen — liefert PtProzACOSplit (Skelett:
        PtProzEntAufgabeIntern als Fallback)."""
        # Volle PtProzACOSplit-Implementierung in eigener Slice
        return super().proz_erzeugen()

    def on_fill_split_amount(self, proz: Any) -> None:
        """C++: OnFillSplitAmount — Sub-Prozess-Mengen-Verteilung (P5-K Skelett)."""


# ----------------------------------------------------------------------
# ACOLogik — Knoten mit ACO-Pfad-Auswahl
# ----------------------------------------------------------------------


class ACOLogik(EPEntAufgabeAltIntern):
    """C++: `ACOLogik : $public EPEntAufgabeAltIntern`
    (`ACOClasses.odh:231-262`).
    """

    def create_s_info(self) -> ACOMarkeLogik:
        """C++: CreateSInfo — erzeugt ACOMarkeLogik."""
        return ACOMarkeLogik()

    def proz_erzeugen(self) -> Any:
        """C++: ProzErzeugen — erbt von EPEntAufgabeAltIntern."""
        return super().proz_erzeugen()


# ----------------------------------------------------------------------
# ACODpKnSplit — Mengen-Knoten mit Split-Auftrags-Mengen
# ----------------------------------------------------------------------


class ACODpKnSplit(PDpKnMengeRuesten):
    """C++: `ACODpKnSplit : $public PDpKnMengeRuesten`
    (`ACOClasses.odh:111-141`).

    Berücksichtigt die Auftragsmenge bei der Durchführungszeit-Berechnung.
    """

    def get_split_menge(self, proz: Any) -> int:
        """C++: GetSplitMenge — Skelett (Volle Logik: Split-Anteil aus
        PtProzACOSplit lesen)."""
        return getattr(proz, "m_iSplitMenge", 1)

    def get_durchfuehrungszeit(self, proz: Any) -> int:
        """C++: GetDurchfuehrungszeit — Standard plus Mengenfaktor.

        Skelett: nutzt Basis-Methode (m_iDfzProEinheit × menge + Rüstzeit).
        """
        return super().get_durchfuehrungszeit(proz)


# ----------------------------------------------------------------------
# ACOReihenfolge — Mengen-Knoten mit ACO-Reihenfolge-Marken
# ----------------------------------------------------------------------


class ACOReihenfolge(PDpKnMengeRuesten):
    """C++: `ACOReihenfolge : $public PDpKnMengeRuesten`
    (`ACOClasses.odh:172-199`).
    """

    def create_s_info(self) -> ACOMarkeReihenfolge:
        """C++: CreateSInfo."""
        return ACOMarkeReihenfolge()

    def on_info_list(self, i_status: int) -> None:
        """C++: OnInfoList — P5-K Skelett."""

    def proz_weitergeben(self, proz_ober: Any, ent: Any) -> None:
        """C++: ProzWeitergeben — eigene Routing-Logik mit ACO-Markenrouting.

        Skelett: delegiert an Basis (PDpKnMengeRuesten).
        """
        super().proz_weitergeben(proz_ober, ent)
