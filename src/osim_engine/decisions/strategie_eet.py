"""eet-Strategien — Slice P5-F.

Provenienz: `OSimPro/EPStrategie.{odh:383-622, cpp:1551-3031}` (Sektion
"Strategien für die kurzfristige Kapazitätsveränderung").

Klassen-Hierarchie:

    EPEntStrategie
    └── EPEntStrAltExternRessBelegBase           (abstrakte Basis)
        ├── EPEntStrKrzKapVeraenderungBase
        ├── EPEntStrKrzKapVerPrgAutrag
        └── EPEntStrArbVertMitWechsel            (Helper: _RessInfo,
                                                  _GroupInfo, GroupList)

Aktivierungs-Schutz: `m_bEntscheidungAktivieren` (default `True`) ist
der lokale Schalter; globaler Master ist `PSimulator.m_bIsEntAktiv`
(default `False`). Komplexe Sim-Logik (Tauschen, Berechnen) ist als
Skelett mit cpp-Verweis implementiert — die volle Portierung wartet auf
voll funktionsfähige EinsatzzeitTag-API + PRessBeleg-Methoden.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from osim_engine.decisions.strategie import EPEntStrategie

if TYPE_CHECKING:
    from osim_engine.decisions.entscheidung import (
        EPEntFeld,
        EPEntInformationssystem,
        EPZelSystem,
    )
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Helper-Datenklassen für EPEntStrArbVertMitWechsel
# ----------------------------------------------------------------------


@dataclass
class _RessInfo:
    """C++: EPStrategie.odh:474-518 — `_RessInfo`.

    Information über eine Belegungs-Ressource für die ArbVert-Berechnung.
    """
    m_oRessBeleg: Any = None
    eTag: Any = None              # PEinsatzzeitTag
    m_iEinsatzBeginn: int = 0
    m_iEinsatzEnde: int = 0
    m_iPausendauer: int = 0
    m_iAktBedarfFromGroup: int = -1
    m_iVirtEinsatzEnde: int = -1
    # Belastungs-Counter
    m_iPrgBelastung: int = 0
    m_iZstWartArbInhalt: int = 0
    m_iPrgEglArbInhalt: int = 0
    # Tausch-Infos
    m_bIsTauschen: bool = False
    m_sGroupName: str = ""
    m_iGetauschteKap: int = 0
    m_iTauschZeitpunkt: int = -1

    def get_verf_kap(self) -> int:
        """C++: EPStrategie.odh:501 — verfügbare Kapazität.

        Skelett: in Vollausbau berechnet (Einsatzende - AktZeit - Pausen).
        """
        return max(0, self.m_iEinsatzEnde - self.m_iEinsatzBeginn - self.m_iPausendauer)

    def give_as_much_you_can_from(self, abzugebende_kap: int, bedarf: Any) -> int:
        """C++: EPStrategie.odh:502 — Skelett (Tausch-Verteilungs-Logik)."""
        return 0


@dataclass
class _GroupInfo:
    """C++: EPStrategie.odh:520-558 — `_GroupInfo`."""
    m_sName: str = ""
    m_lRessList: list[_RessInfo] = field(default_factory=list)
    m_iBelastungGroup: int = -1
    # Einzel-Belastungen (aggregiert)
    m_iPrgBelastung: int = 0
    m_iZstWartArbInhalt: int = 0
    m_iPrgEglArbInhalt: int = 0
    # Tausch-Infos
    m_bIsKapBedarf: bool = False
    m_iKapBedarf: int = 0
    m_bIsKapVerfuegbar: bool = False
    m_iVerfKap: int = 0

    def add_info(self, info: _RessInfo) -> bool:
        """C++: AddInfo (EPStrategie.odh:542).

        Fügt ein _RessInfo-Element der Gruppe hinzu. Liefert False wenn
        info.m_sGroupName leer ist (analog zur C++-Logik in cpp:2384).
        """
        if info is None or not info.m_sGroupName:
            return False
        self.m_lRessList.append(info)
        return True

    def get_uml_faktor_from(self, info: _RessInfo) -> float:
        """C++: GetUmlFaktorFrom (EPStrategie.odh:543) — P5-F Skelett."""
        return 1.0

    def search_best_ress_for(
        self, bedarf: "_GroupInfo", abzugebende_kap: int
    ) -> _RessInfo | None:
        """C++: SearchBestRessFor (EPStrategie.odh:544) — P5-F Skelett."""
        return None

    def give_kap_to(self, bedarf: "_GroupInfo") -> bool:
        """C++: GiveKapTo (EPStrategie.odh:545) — P5-F Skelett."""
        return False


class GroupList(list):
    """C++: EPStrategie.odh:562-572 — `GroupList`.

    Container für `_GroupInfo`-Instanzen, indiziert nach Gruppen-Namen.
    """

    def clear(self) -> None:  # type: ignore[override]
        """C++: Clear (EPStrategie.odh:566)."""
        del self[:]

    def add_info_2_group(self, info: _RessInfo | None) -> bool:
        """C++: cpp:~2384 — hängt info in die passende Gruppe oder erzeugt sie.

        Liefert False, wenn info None ist oder keinen Gruppen-Namen hat.
        """
        if info is None or not info.m_sGroupName:
            return False
        # passende Gruppe finden
        for g in self:
            if g.m_sName == info.m_sGroupName:
                return g.add_info(info)
        # neue Gruppe anlegen
        g = _GroupInfo(m_sName=info.m_sGroupName)
        self.append(g)
        return g.add_info(info)

    def get_ress_from_group_by_group_name(self, group_name: str) -> Any:
        """C++: GetRessFromGroupByGroupName — P5-F Skelett."""
        for g in self:
            if g.m_sName == group_name and g.m_lRessList:
                return g.m_lRessList[0].m_oRessBeleg
        return None


# ----------------------------------------------------------------------
# EPEntStrAltExternRessBelegBase (abstrakte Basis)
# ----------------------------------------------------------------------


class EPEntStrAltExternRessBelegBase(EPEntStrategie):
    """Abstrakte Basis für externe Belegungs-Ressourcen-Strategien.

    C++: `EPEntStrAltExternRessBelegBase : $public EPEntStrategie`
    (`EPStrategie.odh:383-396`, `.cpp:1557-1602`).

    `$abstract`. Default-Verhalten: CreatStd-Methoden liefern None,
    TreffeEntscheidung iteriert die Ressourcen und ruft
    TreffeEntFuerRessBeleg (in der Basis leer).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)

    def creat_std_ziel_system(self) -> "EPZelSystem | None":  # type: ignore[override]
        """C++: cpp:1557-1560 — Basis liefert None."""
        return None

    def creat_std_informations_system(self) -> "EPEntInformationssystem | None":  # type: ignore[override]
        """C++: cpp:1561-1564 — Basis liefert None."""
        return None

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: cpp:1571-1597 — iteriert m_lRessourcen + ruft TreffeEntFuerRessBeleg."""
        if not self.m_bEntscheidungAktivieren:
            return None
        from osim_engine.decisions.aufgabe import EPEntKrzKapazitaetsVeraenderung
        if not isinstance(ent_aufgabe, EPEntKrzKapazitaetsVeraenderung):
            return None
        for beleg in ent_aufgabe.m_lRessourcen:
            self.treffe_ent_fuer_ress_beleg(beleg, ent_feld, ent_aufgabe, proz)
        return None

    def treffe_ent_fuer_ress_beleg(
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:1598-1602 — Basis: leer (Subklassen überschreiben)."""


# ----------------------------------------------------------------------
# EPEntStrKrzKapVeraenderungBase
# ----------------------------------------------------------------------


class EPEntStrKrzKapVeraenderungBase(EPEntStrAltExternRessBelegBase):
    """Basisstrategie für kurzfristige Kapazitäts-Veränderung.

    C++: `EPEntStrKrzKapVeraenderungBase : $public EPEntStrAltExternRessBelegBase`
    (`EPStrategie.odh:402-430`, `.cpp:1607-1803`).

    Passt die Einsatzzeit einer Ressource an den Arbeitsinhalt der
    Warteschlange an (cpp:1683-1803).
    """

    _INFO_PROPERTIES: tuple[tuple[str, str], ...] = (
        ("GetZstWartArbInhaltUmgelegt", "PRessBeleg"),
        ("GetPrgEglArbInhaltUmgelegt", "PRessBeleg"),
    )

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # protected (cpp:406)
        self._iTmpStaffelung: int = 0
        # Attribute aus EPStrategie.odh:408-415
        self.m_bIsDynPausendauer: bool = True
        self.m_iStaffelDelta: int = 0
        self.m_iPrzZugArbInhalt: int = 0
        self.m_iZugArbInhalt: int = 0
        self.m_iPrzZugEglArbInhalt: int = 0
        self.m_iZugEglArbInhalt: int = 0
        self.m_iDpKnAnzFuerPrgEglArbInhalt: int = -1

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:1617-1648 — 2 PRessBeleg-Properties."""
        from osim_engine.decisions.entscheidung import EPEntInformationssystem
        infsys = EPEntInformationssystem(self.m_simulator)
        infsys.m_sName = "InfSys-EPEntStrKrzKapVeraenderungBase"
        for prop_name, parent in self._INFO_PROPERTIES:
            info = self.creat_info_from_property(prop_name, parent)
            infsys.m_lInformationen.append(info)
        return infsys

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: cpp:1655-1682 — wie Basis + Staffel-Counter pro Iteration."""
        if not self.m_bEntscheidungAktivieren:
            return None
        from osim_engine.decisions.aufgabe import EPEntKrzKapazitaetsVeraenderung
        if not isinstance(ent_aufgabe, EPEntKrzKapazitaetsVeraenderung):
            return None
        self._iTmpStaffelung = 0
        for beleg in ent_aufgabe.m_lRessourcen:
            self.treffe_ent_fuer_ress_beleg(beleg, ent_feld, ent_aufgabe, proz)
            self._iTmpStaffelung += self.m_iStaffelDelta
        return None

    def treffe_ent_fuer_ress_beleg(  # type: ignore[override]
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:1683-1803 — Skelett.

        Volle Logik (Arbeitsinhalt + Egl-Arbeitsinhalt + Pausendauer + neue
        Arbeitszeit + Einsatzende-Setzung) braucht PEinsatzzeitTag.GetPauseZeit
        + PRessBeleg.GetPrgVblKapAngebot. Diese Methoden sind in
        Phase-4-Stand teilweise nicht voll implementiert — Aktivierung kommt
        wenn der Master-Guard `m_bIsEntAktiv=True` aktiv ist.
        """
        if ent_feld is None or ent_feld.m_oEntInf is None:
            return
        # Skelett: Info-Verfügbarkeit prüfen, Rest in voller Slice


# ----------------------------------------------------------------------
# EPEntStrKrzKapVerPrgAutrag
# ----------------------------------------------------------------------


class EPEntStrKrzKapVerPrgAutrag(EPEntStrAltExternRessBelegBase):
    """Strategie mit Prognose anstehender Aufträge.

    C++: `EPEntStrKrzKapVerPrgAutrag : $public EPEntStrAltExternRessBelegBase`
    (`EPStrategie.odh:436-460`, `.cpp:1807-2308`).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Attribute aus EPStrategie.odh:442-444
        self.m_bIsDynPausendauer: bool = True
        self.m_fPrzZugPrgBedarf: float = 0.0
        self.m_fPrzZugWslArbInhalt: float = 0.0

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:1817-... — Standard-InfoSystem mit Prognose-Properties."""
        from osim_engine.decisions.entscheidung import EPEntInformationssystem
        infsys = EPEntInformationssystem(self.m_simulator)
        infsys.m_sName = "InfSys-EPEntStrKrzKapVerPrgAutrag"
        # Prognose-Properties (Skelett — exakte Liste in cpp:1817-...)
        for prop_name in ("GetZstWartArbInhalt", "GetPrgKapazitaetsbedarf"):
            info = self.creat_info_from_property(prop_name, "PRessBeleg")
            infsys.m_lInformationen.append(info)
        return infsys

    def treffe_ent_fuer_ress_beleg(  # type: ignore[override]
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:1897-... — P5-F Skelett."""


# ----------------------------------------------------------------------
# EPEntStrArbVertMitWechsel
# ----------------------------------------------------------------------


class EPEntStrArbVertMitWechsel(EPEntStrAltExternRessBelegBase):
    """Strategie: prognose-basierte Verteilung mit Mitarbeiter-Tausch zwischen Gruppen.

    C++: `EPEntStrArbVertMitWechsel : $public EPEntStrAltExternRessBelegBase`
    (`EPStrategie.odh:575-622`, `.cpp:2313-3031`).

    Komplexeste rsv/eet-Strategie: intelligent verteilen + tauschen zwischen
    Gruppen via `_RessInfo`/`_GroupInfo`/`GroupList`-Helper.
    """

    _INFO_PROPERTIES: tuple[tuple[str, str], ...] = (
        ("GetPrgBelastung", "PRessBeleg"),
        ("GetZstWartArbInhalt", "PRessBeleg"),
        ("GetPrgEglArbInhalt", "PRessBeleg"),
    )

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Stellregler aus EPStrategie.odh:579-587
        self.m_bIsDynPausendauer: bool = True
        self.m_bIsTausche: bool = True
        self.m_bIsTauscheSpaet: bool = True
        self.m_bIsUmlageWstByRessAnzahl: bool = False
        self.m_iMaxTauschversuche: int = 100
        self.m_fPrzZugGesamt: float = 0.0
        self.m_bIsDumperNurTauschen: bool = False
        self.m_iEinsatzzuschlag: int = 0
        # Helper-Liste (cpp:590)
        self.m_lGroupList: GroupList = GroupList()

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:2317-2353 — 3 PRessBeleg-Properties."""
        from osim_engine.decisions.entscheidung import EPEntInformationssystem
        infsys = EPEntInformationssystem(self.m_simulator)
        infsys.m_sName = "InfSys-EPEntStrArbVertMitWechsel"
        for prop_name, parent in self._INFO_PROPERTIES:
            info = self.creat_info_from_property(prop_name, parent)
            infsys.m_lInformationen.append(info)
        return infsys

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: cpp:2359-2418 — Haupt-Entscheidungs-Pfad.

        Reihenfolge:
        1. Gruppenliste leeren + neu aufbauen aus jeder Ressource
        2. `berechne_ohne_tauschen` (Standard-Verteilung)
        3. wenn m_bIsTausche: `tausche_gruppen`
        4. `setze_werte`
        """
        if not self.m_bEntscheidungAktivieren:
            return None
        from osim_engine.decisions.aufgabe import EPEntKrzKapazitaetsVeraenderung
        if not isinstance(ent_aufgabe, EPEntKrzKapazitaetsVeraenderung):
            return None
        self.m_lGroupList.clear()
        for beleg in ent_aufgabe.m_lRessourcen:
            info = self.berechne_basis_infos_beleg(beleg, ent_feld, ent_aufgabe, proz)
            if not self.m_lGroupList.add_info_2_group(info):
                # Keine Gruppe → Abbruch
                self.m_lGroupList.clear()
                return None
        # Standard-Verteilung
        self.berechne_ohne_tauschen(ent_feld, ent_aufgabe, proz)
        # Tausch-Phase
        if self.m_bIsTausche:
            self.tausche_gruppen(ent_feld, ent_aufgabe, proz)
        self.setze_werte(ent_feld, ent_aufgabe, proz)
        self.m_lGroupList.clear()
        return None

    def berechne_basis_infos_beleg(
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> _RessInfo | None:
        """C++: cpp:2423-... — _RessInfo aus PRessBeleg + EinsatzzeitTag aufbauen.

        Skelett: Default-_RessInfo mit Gruppen-Namen vom Beleg. Echte
        Belastungs-Berechnung braucht volle PRessBeleg-API.
        """
        if beleg is None:
            return None
        info = _RessInfo(m_oRessBeleg=beleg)
        info.m_sGroupName = getattr(beleg, "m_sGruppenName", "") or "default"
        return info

    def berechne_ohne_tauschen(
        self, ent_feld: "EPEntFeld", ent_aufgabe: Any, proz: Any
    ) -> None:
        """C++: cpp:2472-... — Standard-Verteilung ohne Gruppen-Tausch.

        Skelett: iteriert über alle Gruppen und ruft pre_do/do.
        """
        for g_info in self.m_lGroupList:
            self.pre_do_berechne_ohne_tauschen(ent_feld, ent_aufgabe, proz, g_info)
            self.do_berechne_ohne_tauschen(ent_feld, ent_aufgabe, proz, g_info)

    def pre_do_berechne_ohne_tauschen(
        self, ent_feld: "EPEntFeld", ent_aufgabe: Any, proz: Any, g_info: _GroupInfo
    ) -> None:
        """C++: cpp:2491-... — Vorbereitung (P5-F Skelett)."""

    def do_berechne_ohne_tauschen(
        self, ent_feld: "EPEntFeld", ent_aufgabe: Any, proz: Any, g_info: _GroupInfo
    ) -> None:
        """C++: cpp:2609-... — Hauptberechnung (P5-F Skelett)."""

    def berechne_fuer_gruppe(self, g_info: _GroupInfo, dump: bool = True) -> None:
        """C++: cpp:~2700 — P5-F Skelett."""

    def tausche_gruppen(
        self, ent_feld: "EPEntFeld", ent_aufgabe: Any, proz: Any
    ) -> None:
        """C++: cpp:~2750 — Tausch zwischen Gruppen mit Bedarf/Angebot.

        Skelett: max Tausch-Versuche-Schleife + Bedarf/Angebot-Match.
        """
        bedarf = self.get_group_mit_max_bedarf()
        angebot = self.get_group_mit_max_angebot()
        if bedarf is None or angebot is None:
            return
        for _ in range(self.m_iMaxTauschversuche):
            if not self.do_tausche_gruppen(bedarf, angebot):
                break

    def do_tausche_gruppen(
        self, bedarf: _GroupInfo, angebot: _GroupInfo
    ) -> bool:
        """C++: cpp:~2800 — P5-F Skelett."""
        return False

    def setze_werte(
        self, ent_feld: "EPEntFeld", ent_aufgabe: Any, proz: Any
    ) -> None:
        """C++: cpp:~2900 — schreibt berechnete Einsatzzeiten zurück (P5-F Skelett)."""

    def get_group_mit_max_bedarf(self) -> _GroupInfo | None:
        """C++: cpp:~2950 — Gruppe mit höchstem Kapazitäts-Bedarf."""
        candidates = [g for g in self.m_lGroupList if g.m_bIsKapBedarf]
        if not candidates:
            return None
        return max(candidates, key=lambda g: g.m_iKapBedarf)

    def get_group_mit_max_angebot(self) -> _GroupInfo | None:
        """C++: cpp:~2980 — Gruppe mit höchster verfügbarer Kapazität."""
        candidates = [g for g in self.m_lGroupList if g.m_bIsKapVerfuegbar]
        if not candidates:
            return None
        return max(candidates, key=lambda g: g.m_iVerfKap)
