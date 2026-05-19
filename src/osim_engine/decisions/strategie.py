"""EPEntStrategie — abstrakte Basis. Provenienz: `OSimPro/EPStrategie.{odh,cpp}`.

Slice P5-A enthält nur die abstrakte Basis-Klasse + LList. Die konkreten
Strategie-Subtypen (`EPEntStrKrzRessBase`, `EPEntStrKrzRessBedarf`,
`EPEntStrKrzRessArbSuchen`, `EPEntStrAltExternRessBelegBase`,
`EPEntStrKrzKapVeraenderungBase`, `EPEntStrKrzKapVerPrgAutrag`,
`EPEntStrArbVertMitWechsel`) kommen in den späteren Phase-5-Slices.

Die abstrakte Basis hält:
- Konfigurations-Flags (`m_bEntscheidungErzwingen`, `m_bEntscheidungAktivieren`)
- die abstrakten Hooks `creat_std_ziel_system` + `creat_std_informations_system`
- den dispatch-Punkt `treffe_entscheidung(ent_feld, ent_aufgabe, proz)`
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

    def creat_info_from_property(self, prop: Any) -> Any:
        """C++: `CreatInfoFromProperty` — erzeugt EPEntInformation aus OMetaProperty.

        In Phase 5-A noch nicht implementiert (OMetaProperty-Reflection).
        """
        raise NotImplementedError(
            "EPEntStrategie.creat_info_from_property — OMetaProperty-Reflection "
            "ist in Phase 5-A noch nicht implementiert"
        )

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
