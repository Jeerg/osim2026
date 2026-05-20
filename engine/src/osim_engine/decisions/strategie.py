"""EPEntStrategie — Strategien aus `OSimPro/EPStrategie.{odh,cpp}`.

Slice P5-A: abstrakte Basis (`EPEntStrategie` + `EPEntStrategieLList`).
Slice P5-E: rsv-Strategien (`EPEntStrKrzRessBase`/Bedarf/ArbSuchen) — in
            `strategie_rsv.py`.
Slice P5-F: eet-Strategien — geplant in `strategie_eet.py`.

Die abstrakte Basis hält:
- Konfigurations-Flags (`m_bEntscheidungErzwingen`, `m_bEntscheidungAktivieren`)
- die abstrakten Hooks `creat_std_ziel_system` + `creat_std_informations_system`
- den dispatch-Punkt `treffe_entscheidung(ent_feld, ent_aufgabe, proz)`
- Helper `creat_info_from_property` + `get_auspraegung_von_info`
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.decisions.entscheidung import (
        EPEntFeld,
        EPEntInformationssystem,
        EPZelSystem,
    )
    from osim_engine.pps.simulator import PSimulator


class EPEntStrategie(PSimObj):
    """Abstrakte Basis aller Entscheidungs-Strategien.

    C++-Äquivalent: `EPEntStrategie` (EPStrategie.odh:25-52). `$abstract`
    im C++-Original — Python liefert `NotImplementedError` bei direkter
    Methoden-Verwendung.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_bEntscheidungErzwingen: bool = False
        self.m_bEntscheidungAktivieren: bool = True

    # ------------------------------------------------------------------
    # Abstrakte Hooks — von Subklassen zu überschreiben
    # ------------------------------------------------------------------

    def creat_std_ziel_system(self) -> "EPZelSystem":
        """C++: `CreatStdZielSystem` — abstrakte Factory für Default-Zielsysteme."""
        raise NotImplementedError(
            f"{type(self).__name__}.creat_std_ziel_system muss überschrieben werden"
        )

    def creat_std_informations_system(self) -> "EPEntInformationssystem":
        """C++: `CreatStdInformationsSystem` — abstrakte Factory."""
        raise NotImplementedError(
            f"{type(self).__name__}.creat_std_informations_system muss überschrieben werden"
        )

    def creat_info_from_property(
        self, property_name: str, parent_class_name: str = "", info_id: int = 0
    ) -> Any:
        """C++: `CreatInfoFromProperty` (EPStrategie.cpp:24-43).

        Im C++-Original nimmt die Methode ein `OMetaProperty *prop` und
        baut die EPEntInformation per Reflection auf. In der Python-
        Portierung sind die Property-Namen direkt verfügbar (keine
        Reflection-Schicht), daher übergeben wir Name + ggf. Parent-Class
        + ID explizit.

        C++ erzeugt `m_sName = prop->m_name.Right(len-3) + "(parent)"`
        (also "GetZstBrachzeit" → "ZstBrachzeit(PRessBeleg)"). Wir
        bilden das 1:1 nach, sofern `property_name` ein "Get…"-Prefix hat.
        """
        from osim_engine.decisions.entscheidung import EPEntInformation
        info = EPEntInformation(self.m_simulator)
        # Get-Prefix entfernen, dann Parent-Class in Klammern anhängen
        if property_name.startswith("Get"):
            short = property_name[3:]
        else:
            short = property_name
        if parent_class_name:
            info.m_sName = f"{short}({parent_class_name})"
        else:
            info.m_sName = short
        info.m_iID = info_id
        info.m_sPropertyClassName = property_name
        info.m_sParentClassName = parent_class_name
        return info

    def get_auspraegung_von_info(
        self,
        sobj: Any,
        info: Any,
        og: int = -1,
        ug: int = -1,
        min_: bool = False,
    ) -> float:
        """C++: `GetAuspraegungVonInfo` (EPStrategie.cpp:44-49).

        Holt den Wert der durch `info` benannten Property von `sobj`.
        Im C++ via OMetaProperty-Reflection; in Python rufen wir die
        Methode direkt per `getattr` auf — sofern vorhanden.

        Liefert 0.0 wenn die Methode am `sobj` nicht existiert
        (statt OException — defensive Implementierung, weil Reflection-
        Lookups in Python schwieriger sind als im C++-MFC-System).
        """
        if info is None:
            return 0.0
        method = getattr(sobj, info.m_sPropertyClassName, None)
        if method is None:
            return 0.0
        try:
            erg = float(method())
        except (TypeError, ValueError, AttributeError):
            return 0.0
        # Normierung
        if og != -1 or ug != -1:
            if min_:
                erg = ((og - erg) * 100) / (og - ug) if (og - ug) != 0 else erg
            else:
                erg = ((erg - ug) * 100) / (og - ug) if (og - ug) != 0 else erg
        return erg

    # ------------------------------------------------------------------
    # Dispatch — von EPEntFeld.treffe_entscheidung aufgerufen
    # ------------------------------------------------------------------

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: `EPEntStrategie::TreffeEntscheidung` — abstrakte Hauptmethode.

        Subklassen implementieren die jeweilige Entscheidungs-Logik.
        """
        raise NotImplementedError(
            f"{type(self).__name__}.treffe_entscheidung muss überschrieben werden"
        )


class EPEntStrategieLList(list):
    """LList-Container. EPStrategie.odh:56-61."""
