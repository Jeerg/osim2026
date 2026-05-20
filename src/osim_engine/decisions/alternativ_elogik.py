"""PDpKnAlternativELogik + PDpKnAlternativSplit — Slice P5-H/I.

Provenienz: `OSimPro/PDpKnAlternativELogik.{odh:669-1000, cpp}`.

Klassen:
- `PAlternativeELogik` + `PAlternativeELogikLList` — Subtyp von PAlternative
  mit Qualitäts-/Flexibilitäts-Attributen
- `PDpKnAlternativELogik` — Knoten mit komplexer Entscheidungs-Logik
  (NWZ-Verfahren oder Zielhierarchie, ~70 Konfigurations-Attribute)
- `PAlternativeSplit` + `PAlternativeSplitLList` — Subtyp für Split-Knoten
- `PDpKnAlternativSplit` — Knoten der Sub-Pläne parallel ausführt

Aktivierungs-Schutz: `AlternativeAuswaehlen` ist hier Standard-Heuristik
(erste Alternative). Volle Entscheidungs-Logik (Entscheide/EntscheideZH/
EntscheideNWZ aus cpp:~2000) wartet auf P5-K (ACO-Integration) und auf
voll funktionsfähige Kennzahl-Berechnung.
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.alternativ import PAlternative, PDpKnAlternativ

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Enums
# ----------------------------------------------------------------------


class PDpKnAELogik_Ziel(IntEnum):
    """C++ enum aus PDpKnAlternativELogik.odh:693-702.

    7 Ziele für die Entscheidung. Default-Reihenfolge 0..6.
    """
    PDPKNELOGIK_TER = 0   # Termintreue
    PDPKNELOGIK_QUA = 1   # Qualität
    PDPKNELOGIK_DLZ = 2   # Durchlaufzeit
    PDPKNELOGIK_KOS = 3   # Kosten
    PDPKNELOGIK_KAP = 4   # Kapazitätsauslastung
    PDPKNELOGIK_BES = 5   # Bestände
    PDPKNELOGIK_FLE = 6   # Flexibilität


class PDpKnAELogik_ZFuktionTyp(IntEnum):
    """C++ $enum aus PDpKnAlternativELogik.odh:718-723.

    Typ der Zielfunktion: Zielhierarchie (1000) oder Nutzwertanalyse (1001).
    """
    PDPKNELOGIK_LEXIOGRAPHISCH = 1000
    PDPKNELOGIK_NWZ = 1001


# ----------------------------------------------------------------------
# Alternativen
# ----------------------------------------------------------------------


class PAlternativeELogik(PAlternative):
    """C++: `PAlternativeELogik : $public PAlternative`
    (`PDpKnAlternativELogik.odh:669-680`).

    Erweitert PAlternative um Qualitäts- und Flexibilitäts-Attribute.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_iQualitaetsfaehigkeit: int = 0
        self.m_iFlexibilitaet: int = 0
        self.m_dUser: float = 0.0


class PAlternativeELogikLList(list):
    """LList-Container."""


# ----------------------------------------------------------------------
# PDpKnAlternativELogik
# ----------------------------------------------------------------------


class PDpKnAlternativELogik(PDpKnAlternativ):
    """C++: `PDpKnAlternativELogik : $public PDpKnAlternativ`
    (`PDpKnAlternativELogik.odh:726-898`).

    Alternativ-Knoten mit komplexer Entscheidungs-Logik. Zwei Verfahren:
    - PDPKNELOGIK_LEXIOGRAPHISCH: Zielhierarchie (lexicographische Ordnung)
    - PDPKNELOGIK_NWZ: Nutzwertanalyse (gewichtete Summe normierter Werte)

    In Slice P5-H als Strukturierte Klassen mit allen Attributen + Default-
    Auswahl (erste Alternative). Echte Bewertungs-Funktionen sind Skelette.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Alternativen-Liste (Subtype-spezifisch)
        self.m_lAlternativen: PAlternativeELogikLList = PAlternativeELogikLList()
        # protected (cpp:734)
        self._oAktrozess: Any = None
        # Zielfunktion-Typ
        self.m_eZFunktionTyp: int = PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_NWZ
        # Zielgewichtungen
        self.m_iZGTermintreue: int = 5
        self.m_iZGQualitaet: int = 5
        self.m_iZGDlz: int = 5
        self.m_iZGKosten: int = 5
        self.m_iZGKapauslastung: int = 5
        self.m_iZGBestaende: int = 5
        self.m_iZGFlexibilitaet: int = 5
        # Normierungs-Parameter für relative Erwartungswerte
        self.m_iZGREDlz: int = 0
        self.m_iZGREMinZeitbedarf: int = 0
        # Ober-/Untergrenzen + Exponential-Parameter (8 Gruppen)
        for prefix in (
            "ZielDlz", "MinZeitbedarf", "Stoerung", "Kosten",
            "Durchlaufzeit", "Qualitaet", "KapAuslastung",
            "Bestaende", "Flexibilitaet", "Verzug", "FertFort",
        ):
            setattr(self, f"m_iUG{prefix}", 0)
            setattr(self, f"m_iOG{prefix}", 100)
            setattr(self, f"m_b{prefix}Exponential", False)
            setattr(self, f"m_f{prefix}ExpParA", 1.0)
            setattr(self, f"m_f{prefix}ExpParB", 0.0)
            setattr(self, f"m_f{prefix}ExpParC", 0.0)
        # Dringlichkeit
        self.m_iGDringlichkeit: int = 0

    # ------------------------------------------------------------------
    # Bewertungs-Funktionen (Skelette)
    # ------------------------------------------------------------------

    def get_min_zeitbedarf(self, alt: PAlternativeELogik) -> float:
        """C++: GetMinZeitbedarf — P5-H Skelett."""
        return 0.0

    def get_stoerung(self, alt: PAlternativeELogik) -> float:
        return 0.0

    def get_kosten(self, alt: PAlternativeELogik) -> float:
        return 0.0

    def get_durchlaufzeit(self, alt: PAlternativeELogik) -> float:
        return 0.0

    def get_qualitaet(self, alt: PAlternativeELogik) -> float:
        return float(alt.m_iQualitaetsfaehigkeit)

    def get_kap_auslastung(self, alt: PAlternativeELogik) -> float:
        return 0.0

    def get_bestaende(self, alt: PAlternativeELogik) -> float:
        return 0.0

    def get_flexibilitaet(self, alt: PAlternativeELogik) -> float:
        return float(alt.m_iFlexibilitaet)

    def get_verzug(self, proz: Any) -> float:
        return 0.0

    def get_fert_fort(self, proz: Any) -> float:
        return 0.0

    def get_dringlichkeit(self, proz: Any) -> float:
        return float(self.m_iGDringlichkeit)

    @staticmethod
    def normiere(groesse: float, ug: int, og: int, min_: bool = True) -> float:
        """C++: Normiere (cpp:?) — linear in [0, 100]."""
        if og == ug:
            return 0.0
        if min_:
            return ((og - groesse) * 100.0) / (og - ug)
        return ((groesse - ug) * 100.0) / (og - ug)

    @staticmethod
    def normiere_exp(groesse: float, ug: int, og: int, min_: bool, d: float) -> float:
        """C++: NormiereExp — exponentielle Normierung."""
        # Vereinfachte exponentielle Skalierung (Skelett)
        import math
        if og == ug:
            return 0.0
        x = (groesse - ug) / (og - ug)
        if min_:
            x = 1.0 - x
        return 100.0 * (1.0 - math.exp(-d * x))

    # ------------------------------------------------------------------
    # Entscheidungs-Logik (Skelette)
    # ------------------------------------------------------------------

    def entscheide(
        self, l_alternativen: PAlternativeELogikLList, proz: Any, ent: Any
    ) -> PAlternativeELogik | None:
        """C++: Entscheide — Hauptpfad.

        Wählt zwischen Zielhierarchie und Nutzwertanalyse je nach
        m_eZFunktionTyp.
        """
        if self.m_eZFunktionTyp == PDpKnAELogik_ZFuktionTyp.PDPKNELOGIK_LEXIOGRAPHISCH:
            return self.entscheide_zh(l_alternativen, proz, ent)
        return self.entscheide_nwz(l_alternativen, proz, ent)

    def entscheide_zh(
        self, l_alternativen: PAlternativeELogikLList, proz: Any, ent: Any
    ) -> PAlternativeELogik | None:
        """C++: EntscheideZH — Zielhierarchie (P5-H Skelett: erste Alternative)."""
        if not l_alternativen:
            return None
        return l_alternativen[0]

    def entscheide_nwz(
        self, l_alternativen: PAlternativeELogikLList, proz: Any, ent: Any
    ) -> PAlternativeELogik | None:
        """C++: EntscheideNWZ — Nutzwertanalyse (P5-H Skelett: erste Alternative)."""
        if not l_alternativen:
            return None
        return l_alternativen[0]

    # ------------------------------------------------------------------
    # PDpKnAlternativ-Override
    # ------------------------------------------------------------------

    def alternative_auswaehlen(self, proz_ober: Any, ent: Any) -> Any:
        """C++: AlternativeAuswaehlen — überschreibt PDpKnAlternativ.

        Default: ruft `entscheide` mit eigenen Alternativen. Liefert
        die erste Alternative bei leeren Listen.
        """
        return self.entscheide(self.m_lAlternativen, proz_ober, ent)

    def get_alternative_count(self) -> int:
        """C++: GetAlternativeCount."""
        return len(self.m_lAlternativen)

    def get_alternative(self, n_index: int) -> PAlternativeELogik | None:
        """C++: GetAlternative."""
        if 0 <= n_index < len(self.m_lAlternativen):
            return self.m_lAlternativen[n_index]
        return None

    def get_knoten_anzahl(self, nur_basis_knoten: bool = True) -> int:
        """C++: GetKnotenAnzahl — Summe über Alternativen-Sub-Pläne."""
        i = 0
        for alt in self.m_lAlternativen:
            if alt.m_lDlpl is not None and hasattr(alt.m_lDlpl, "get_knoten_anzahl"):
                i += alt.m_lDlpl.get_knoten_anzahl(nur_basis_knoten)
        if not nur_basis_knoten:
            i += 1
        return i


# ----------------------------------------------------------------------
# PAlternativeSplit + PDpKnAlternativSplit (P5-I)
# ----------------------------------------------------------------------


class PAlternativeSplit(PAlternative):
    """C++: `PAlternativeSplit : $public PAlternative`
    (`PDpKnAlternativELogik.odh:937-942`).

    Keine zusätzlichen Attribute — Marker-Klasse für Split-Knoten.
    """


class PAlternativeSplitLList(list):
    """LList-Container."""


class PDpKnAlternativSplit(PDpKnAlternativ):
    """C++: `PDpKnAlternativSplit : $public PDpKnAlternativ`
    (`PDpKnAlternativELogik.odh:955-987`).

    Knoten der alle Sub-Pläne (Alternativen) PARALLEL ausführt — nicht
    eine auswählt. P5-I als Strukturklasse; volle Sub-Plan-Routing-
    Logik (ProzWeitergeben mit Multi-Sub-Trigger) als Skelett.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_lAlternativen: PAlternativeSplitLList = PAlternativeSplitLList()

    def alternative_auswaehlen(self, proz_ober: Any, ent: Any) -> Any:
        """Split-Knoten: technisch erste Alternative (für Single-Pfad-Kompat)."""
        if self.m_lAlternativen:
            return self.m_lAlternativen[0]
        return None

    def get_alternative_count(self) -> int:
        return len(self.m_lAlternativen)

    def get_alternative(self, n_index: int) -> PAlternativeSplit | None:
        if 0 <= n_index < len(self.m_lAlternativen):
            return self.m_lAlternativen[n_index]
        return None

    def get_knoten_anzahl(self, nur_basis_knoten: bool = True) -> int:
        """C++: GetKnotenAnzahl — Summe über alle parallelen Sub-Pläne."""
        i = 0
        for alt in self.m_lAlternativen:
            if alt.m_lDlpl is not None and hasattr(alt.m_lDlpl, "get_knoten_anzahl"):
                i += alt.m_lDlpl.get_knoten_anzahl(nur_basis_knoten)
        if not nur_basis_knoten:
            i += 1
        return i
