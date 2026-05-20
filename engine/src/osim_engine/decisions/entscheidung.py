"""EPEntscheidung-Datenstrukturen — Klassen aus `OSimPro/EPEntscheidung.{odh,cpp}`.

Container-Hierarchie für das Entscheider-System:

- `EPEntInformation` — eine einzelne Information (Kennzahl), mit
  Normierungsparametern + Lookup über `OMetaProperty`. In der Python-
  Portierung fällt der `OMetaProperty`-Pfad weg (das ist ein C++/MFC-
  Reflection-Construct); statt dessen bleibt nur die Datenform.
- `EPEntInformationssystem` — sammelt mehrere Informationen.
- `EPZiel` / `EPKrzDurchlaufzeit` — Zielbeschreibung mit Gewichtung +
  Liste assoziierter Informationen.
- `EPZelSystem` — sammelt mehrere Ziele.
- `EPEntFeld` — verknüpft eine Person + Zielsystem + Infosystem + Strategie.
  Im laufenden Sim ruft `treffe_entscheidung` die Strategie auf, sofern
  eine vorhanden ist.

`EPEntStrategie` (abstrakt) liegt in `strategie.py`.

Hinweis P5-A: Die `GetAuspraegung`/`IsInfoInSystem`-Methoden, die auf
`OMetaProperty` zugreifen, werden in Python als no-op/Datenform geliefert
(NotImplementedError bei direktem Aufruf). Die Klassen sind in dieser Slice
nur für Laden und Lifecycle-Wiring gedacht — aktive Logik kommt in
späteren Slices.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# EPEntInformation + LList
# ----------------------------------------------------------------------


class EPEntInformation(PSimObj):
    """Eine einzelne Information (Kennzahl). EPEntscheidung.odh:24-45.

    `m_iObereGrenze`/`m_iUntereGrenze`/`m_bIsMin` sind Normierungs-
    Parameter für `GetAuspraegung`. `m_sPropertyClassName` benennt
    die abzufragende Property (im C++-Original via `OMetaProperty`).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_iID: int = 0
        self.m_sPropertyClassName: str = ""
        self.m_sParentClassName: str = ""
        # Normierungsparameter
        self.m_iObereGrenze: int = -1
        self.m_iUntereGrenze: int = -1
        self.m_bIsMin: bool = False

    def get_auspraegung(
        self,
        sobj: Any,
        og: int = -1,
        ug: int = -1,
        min_: bool = False,
    ) -> float:
        """Liefert den (normierten) Wert der Information für `sobj`.

        C++: `EPEntInformation::GetAuspraegung` (EPEntscheidung.cpp:64-117).
        Nutzt im Original `OMetaProperty`-Reflection. In Python (Slice
        P5-A) ist diese Logik noch nicht implementiert — die echte
        Auswertung kommt in einer späteren Slice.
        """
        raise NotImplementedError(
            "EPEntInformation.get_auspraegung — OMetaProperty-Reflection "
            "ist in Phase 5-A noch nicht implementiert"
        )

    def is_info_from_class(self, p_obj: Any) -> bool:
        """C++: `EPEntInformation::IsInfoFromClass` (EPEntscheidung.cpp:118-133)."""
        raise NotImplementedError(
            "EPEntInformation.is_info_from_class — OMetaProperty-Reflection "
            "ist in Phase 5-A noch nicht implementiert"
        )


class EPEntInformationLList(list):
    """LList-Container. EPEntscheidung.odh:49-54."""


# ----------------------------------------------------------------------
# EPEntInformationssystem + LList
# ----------------------------------------------------------------------


class EPEntInformationssystem(PSimObj):
    """Informations-System. EPEntscheidung.odh:60-85.

    `m_lInformationen` ist die Liste der zugehörigen Informationen.
    `is_info_in_system`/`get_info` machen Lookups nach Name oder ID.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_lInformationen: EPEntInformationLList = EPEntInformationLList()

    def is_info_in_system_by_name(self, name: str) -> bool:
        """C++: `IsInfoInSystem(CString name)` (EPEntscheidung.cpp:169-180)."""
        return any(info.m_sName == name for info in self.m_lInformationen)

    def is_info_in_system_by_id(self, info_id: int) -> bool:
        """C++: `IsInfoInSystem(int ID)` (EPEntscheidung.cpp:181-192)."""
        return any(info.m_iID == info_id for info in self.m_lInformationen)

    def is_info_in_system_by_property(self, property_name: str) -> bool:
        """C++: `IsInfoInSystem(OMetaProperty *pMeta)` (EPEntscheidung.cpp:153-168).

        Python-Variante des Reflection-Lookups: vergleicht direkt gegen
        `m_sPropertyClassName` (= C++-Property-Name). Wird von den
        Strategien in `bedingungen_pruefen` verwendet.
        """
        return any(
            info.m_sPropertyClassName == property_name
            for info in self.m_lInformationen
        )

    def get_info_by_property(self, property_name: str) -> EPEntInformation | None:
        """C++: `GetInfo(OMetaProperty *pMeta)` (EPEntscheidung.cpp:198-214)."""
        for info in self.m_lInformationen:
            if info.m_sPropertyClassName == property_name:
                return info
        return None

    def get_info_by_name(self, name: str) -> EPEntInformation | None:
        """C++: `GetInfo(CString name)` (EPEntscheidung.cpp:215-226)."""
        for info in self.m_lInformationen:
            if info.m_sName == name:
                return info
        return None

    def get_info_by_id(self, info_id: int) -> EPEntInformation | None:
        """C++: `GetInfo(int ID)` (EPEntscheidung.cpp:227-238)."""
        for info in self.m_lInformationen:
            if info.m_iID == info_id:
                return info
        return None


class EPEntInformationssystemLList(list):
    """LList-Container. EPEntscheidung.odh:89-94."""


# ----------------------------------------------------------------------
# EPZiel + EPKrzDurchlaufzeit + EPZielLList
# ----------------------------------------------------------------------


class EPZiel(PSimObj):
    """Ein Ziel mit Gewichtung + assoziierten Informationen.

    EPEntscheidung.odh:100-130.

    `m_iAusrichtung`: 1 = "größer ist besser", 0 = "kleiner ist besser".
    `m_iGewichtung`: 0 = wird nicht gewichtet, sonst Gewichts-Faktor.
    `m_lAssoziierteInformationen`: Liste der Informationen, die zur
    Erfüllung dieses Ziels relevant sind.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_sZielStrKen: str = ""
        self.m_iAusrichtung: int = 1
        self.m_iGewichtung: int = 1
        self.m_lAssoziierteInformationen: EPEntInformationLList = (
            EPEntInformationLList()
        )

    def is_info_assoziiert(self, p_meta: Any) -> bool:
        """C++: `EPZiel::IsInfoAssoziiert` (EPEntscheidung.cpp:21-33).

        Im C++-Original via `OMetaProperty`-Lookup. In Python (Slice
        P5-A) als no-op (immer False).
        """
        return False


class EPKrzDurchlaufzeit(EPZiel):
    """Ziel: kurze Durchlaufzeit. EPEntscheidung.odh:135-141.

    Subtyp ohne zusätzliche Attribute oder Methoden — wird über die
    Klassen-Identität unterschieden.
    """


class EPZielLList(list):
    """LList-Container. EPEntscheidung.odh:146-151."""


# ----------------------------------------------------------------------
# EPZelSystem + LList
# ----------------------------------------------------------------------


class EPZelSystem(PSimObj):
    """Zielsystem. EPEntscheidung.odh:158-171.

    `m_lEpZiel`: Liste der Ziele dieses Zielsystems.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_lEpZiel: EPZielLList = EPZielLList()


class EPZelSystemLList(list):
    """LList-Container. EPEntscheidung.odh:175-180."""


# ----------------------------------------------------------------------
# EPEntFeld + LList
# ----------------------------------------------------------------------


class EPEntFeld(PSimObj):
    """Entscheidungsfeld. EPEntscheidung.odh:187-206 + .cpp:248-271.

    Verknüpft eine Person (`m_oPPerson`) mit ihrem Zielsystem
    (`m_oZelSystem`), den genutzten Informationen (`m_oEntInf`) und der
    Strategie (`m_oEntStrategie`). `treffe_entscheidung` delegiert an
    die Strategie.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Referenzen — werden vom Loader gesetzt
        self.m_oPPerson: Any = None      # → PPerson
        self.m_oZelSystem: EPZelSystem | None = None
        self.m_oEntInf: EPEntInformationssystem | None = None
        self.m_oEntStrategie: Any = None  # → EPEntStrategie

    def erzeuge_restfeld(self) -> None:
        """Erzeugt fehlende Ziel- + Infosysteme aus der Strategie.

        C++: `EPEntFeld::ErzeugeRestfeld` (EPEntscheidung.cpp:253-261).

        Hängt das erzeugte InfoSystem in `PSimulator.m_lEntInfo`. Wird
        nur aktiv, wenn `m_oEntStrategie` gesetzt ist und ZielSystem/
        InfoSystem noch fehlen. In Phase 5-A no-op, weil die Strategien
        `CreatStdZielSystem`/`CreatStdInformationsSystem` noch nicht
        implementieren.
        """
        if (
            self.m_oZelSystem is not None
            or self.m_oEntInf is not None
            or self.m_oEntStrategie is None
        ):
            return
        # Strategien können in Phase 5-A noch keine Default-Systeme erzeugen.

    def treffe_entscheidung(
        self,
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any | None:
        """Delegiert an die Strategie. EPEntscheidung.cpp:265-271.

        Liefert den ausgewählten `PDurchlaufplan` oder `None` (im C++
        `ONULL`), wenn keine Strategie hängt.
        """
        if self.m_oEntStrategie is None:
            return None
        return self.m_oEntStrategie.treffe_entscheidung(self, ent_aufgabe, proz)


class EPEntFeldLList(list):
    """LList-Container. EPEntscheidung.odh:210-217."""
