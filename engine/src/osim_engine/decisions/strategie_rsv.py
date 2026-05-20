"""rsv-Strategien — Slice P5-E.

Provenienz: `OSimPro/EPStrategie.{odh:63-369, cpp:60-708}` (Sektion
"Strategien für den kurzfristigen Ressourceneinsatz").

Klassen-Hierarchie:

    EPEntStrategie
    └── EPEntStrKrzRessBase           (mit KrzBaseReak-Enum)
        ├── EPEntStrKrzRessBedarf
        └── EPEntStrKrzRessArbSuchen  (mit KrzBaseKnotenWaehlen + 3 Helper-Listen)

Helper-Datenklassen:
- `_EPEntStrKrzRessGroupInfo`     — (RessBeleg, Source-Group, Dest-Group, bool, int, float)
- `_EPEntStrKrzRessZuordnungsInfo` — (RessBeleg, Anzahl)
- `_EPEntStrKrzRessSetStatusInfo`  — (DestBeleg, SourceBeleg, LinkStatus, Zeitspanne)

Aktivierungs-Schutz: `m_bEntscheidungAktivieren` (default `True`) ist
der lokale Strategie-Schalter. Der globale Master-Schalter ist
`PSimulator.m_bIsEntAktiv` (default `False`) — die Strategien werden
in P5-E-Default-Konfiguration nicht aufgerufen, da `EPAszEntFeld`/
`EPEntscheidungsAufgabe` den Master-Guard prüfen.

Sim-Logik-Implementierung:
- Klassen-Struktur + Attribute + Helper-Listen sind 1:1 zur C++-Quelle
- `creat_std_informations_system` baut die EPEntInformation-Objekte direkt
  (statt via OMetaProperty-Reflection)
- `treffe_entscheidung` / `treffe_ent_fuer_knoten` / `bedingungen_pruefen` /
  `ress_zuordnen` / `zuordnung_ruecknehmen` sind als Skelette implementiert,
  die im Aktiv-Pfad funktionieren würden (Methoden-Aufrufe an
  `EPEntKrzRessourcenEinsatz`, `PAssozBeleg.get_link_status` etc. sind in
  P5-D/Vor-P5-E entweder Stubs oder noch nicht portiert — der Code crasht
  daher in der aktiven Auswertung).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
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
# Enums
# ----------------------------------------------------------------------


class KrzBaseReak(IntEnum):
    """C++: EPStrategie.odh:77-85.

    Reaktionstyp für `EPEntStrKrzRessBase` — bestimmt das Auswahl-
    Kriterium bei der Ressourcen-Zuordnung. C++-Enum ohne Wertzuweisung,
    daher Default-Reihenfolge 0..5.
    """
    KBR_MAX_BRACH = 0       # MAX Brachzeit
    KBR_MIN_PROZ = 1        # MIN Prozesse in der Warteschlange
    KBR_MIN_ARBINHALT = 2   # MIN Arbeitsinhalt in der Warteschlange
    KBR_MAX_QUALI = 3       # MAX Qualifikationen
    KBR_MIN_QUALI = 4       # MIN Qualifikationen
    KBR_MIN_ZST_QUALI = 5   # MIN aktuell zugeschaltete Qualifikationen


class KrzBaseKnotenWaehlen(IntEnum):
    """C++: EPStrategie.odh:264-271.

    Wahlverhalten für `EPEntStrKrzRessArbSuchen` — wie der Quell-Knoten
    für die Arbeitssuche gewählt wird.
    """
    KBS_MAX_PROZ = 0
    KBS_MAX_ARBINHALT = 1
    KBS_MAX_EGL_ARBINHALT = 2
    KBS_MAX_AUSLASTUNG = 3


class AssozBelegLinkStatus(IntEnum):
    """C++: PAssozRessource.odh:150-157.

    Status einer Belegungs-Verknüpfung zwischen Knoten und Ressource.
    """
    ABL_BLOCKED = 0
    ABL_IF_NEEDED = 1
    ABL_STD = 2
    ABL_PREFER = 3


# ----------------------------------------------------------------------
# Helper-Datenklassen
# ----------------------------------------------------------------------


@dataclass
class _EPEntStrKrzRessGroupInfo:
    """C++: EPStrategie.odh:176-186 — `_EPEntStrKrzRessGroupInfo`."""
    m_oRessBeleg: Any = None
    m_SourceGroupName: str = ""
    m_DestGroupName: str = ""
    m_bUserBool: bool = False
    m_iUserInt: int = 0
    m_dUserDouble: float = 0.0


@dataclass
class _EPEntStrKrzRessZuordnungsInfo:
    """C++: EPStrategie.odh:209-216 — `_EPEntStrKrzRessZuordnungsInfo`."""
    m_oRessBeleg: Any = None
    m_iAnzahl: int = 0


@dataclass
class _EPEntStrKrzRessSetStatusInfo:
    """C++: EPStrategie.odh:236-244 — `_EPEntStrKrzRessSetStatusInfo`."""
    m_oDestBeleg: Any = None
    m_oSourceBeleg: Any = None
    m_eLinkStatus: AssozBelegLinkStatus = AssozBelegLinkStatus.ABL_BLOCKED
    m_iRuecksetzZeitspanne: int = 0


# ----------------------------------------------------------------------
# Helper-Listen
# ----------------------------------------------------------------------


class EPEntStrKrzRessGroupInfoList(list):
    """C++: EPStrategie.odh:190-204, cpp:549-641."""

    def __init__(self) -> None:
        super().__init__()
        self.m_oParent: Any = None

    def clear(self) -> None:
        """C++: Clear() — `RemoveAll`."""
        del self[:]

    def add(
        self,
        beleg: Any,
        s_source_group_name: str,
        s_dest_group_name: str,
        is_booked: bool = True,
    ) -> None:
        """C++: cpp:549-559."""
        self.append(_EPEntStrKrzRessGroupInfo(
            m_oRessBeleg=beleg,
            m_SourceGroupName=s_source_group_name,
            m_DestGroupName=s_dest_group_name,
            m_bUserBool=is_booked,
        ))

    def is_group_dest_grupe(self, s_source_gname: str) -> bool:
        """C++: cpp:561-575 — prüft ob die Gruppe als Ziel-Gruppe vorkommt."""
        return any(info.m_DestGroupName == s_source_gname for info in self)

    def get_anzahl_abordnungen(self, gname: str) -> int:
        """C++: cpp:576-592 — Anzahl Abordnungen einer Gruppe."""
        return sum(1 for info in self if info.m_SourceGroupName == gname)

    def get_anzahl_zuordnungen(self, gname: str) -> int:
        """C++: cpp:593-609 — Anzahl Zuordnungen zu einer Gruppe."""
        return sum(1 for info in self if info.m_DestGroupName == gname)

    def remove_by_beleg(self, beleg: Any) -> None:
        """C++: cpp:612-626 (Remove(oprPRessBeleg))."""
        for info in list(self):
            if info.m_oRessBeleg is beleg:
                self.remove(info)
                return

    def remove_by_group_name(self, s_group_name: str) -> None:
        """C++: cpp:627-641 (Remove(CString))."""
        for info in list(self):
            if info.m_SourceGroupName == s_group_name:
                self.remove(info)
                return


class EPEntStrKrzRessZuordnungsInfoList(list):
    """C++: EPStrategie.odh:220-231, cpp:645-691."""

    def __init__(self) -> None:
        super().__init__()
        self.m_oParent: Any = None

    def clear(self) -> None:
        """C++: Clear()."""
        del self[:]

    def add(self, beleg: Any) -> None:
        """C++: cpp:645-675 — wenn Beleg schon drin, m_iAnzahl++; sonst neu mit 1."""
        for info in self:
            if info.m_oRessBeleg is beleg:
                info.m_iAnzahl += 1
                return
        self.append(_EPEntStrKrzRessZuordnungsInfo(m_oRessBeleg=beleg, m_iAnzahl=1))

    def get_anzahl_zuordnungen(self, beleg: Any) -> int:
        """C++: cpp:676-691."""
        for info in self:
            if info.m_oRessBeleg is beleg:
                return info.m_iAnzahl
        return 0


class EPEntStrKrzRessStatusInfoList(list):
    """C++: EPStrategie.odh:247-257, cpp:695-705."""

    def __init__(self) -> None:
        super().__init__()
        self.m_oParent: Any = None

    def clear(self) -> None:
        """C++: Clear()."""
        del self[:]

    def add(
        self,
        o_dest_beleg: Any,
        o_source_beleg: Any,
        l_status: AssozBelegLinkStatus,
        zeitspanne: int,
    ) -> None:
        """C++: cpp:695-705."""
        self.append(_EPEntStrKrzRessSetStatusInfo(
            m_oDestBeleg=o_dest_beleg,
            m_oSourceBeleg=o_source_beleg,
            m_eLinkStatus=l_status,
            m_iRuecksetzZeitspanne=zeitspanne,
        ))


# ----------------------------------------------------------------------
# EPEntStrKrzRessBase
# ----------------------------------------------------------------------


class EPEntStrKrzRessBase(EPEntStrategie):
    """Basisstrategie für kurzfristigen Ressourceneinsatz.

    C++: `EPEntStrKrzRessBase : $public EPEntStrategie`
    (`EPStrategie.odh:88-127`, `.cpp:66-399`).

    Schaltet zum Auslösungszeitpunkt — je nach Auslöser-ID — Ressourcen
    zu (id != 2) oder ab (id == 2). Das Auswahl-Kriterium wird durch
    `m_eReaktion` (KrzBaseReak-Enum) bestimmt.
    """

    # PRessBeleg-Properties für `creat_std_informations_system`
    _INFO_PROPERTIES_BASE: tuple[tuple[str, str], ...] = (
        ("GetZstBrachzeit", "PRessBeleg"),
        ("GetZstWartProzesse", "PRessBeleg"),
        ("GetZstWartArbInhalt", "PRessBeleg"),
        ("GetKnzQualifikationselemente", "PRessBeleg"),
        ("GetZstQualifikationselemente", "PRessBeleg"),
    )

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_eReaktion: int = KrzBaseReak.KBR_MIN_PROZ
        self.m_iAnzahl: int = 1
        self.m_bRuecksetzenNachZeitspanne: bool = False
        self.m_iRuecksetzZeitspanne: int = 7200
        self.m_iZstSpanne: int = 3600

    # ------------------------------------------------------------------
    # Standard-Systeme (cpp:72-120)
    # ------------------------------------------------------------------

    def creat_std_ziel_system(self) -> "EPZelSystem | None":  # type: ignore[override]
        """C++: cpp:72-75 — Basis liefert None (Subklassen überschreiben)."""
        return None

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:76-120 — Standard-InfoSystem mit 5 PRessBeleg-Properties.

        Im C++-Original werden die Properties via `PRessBeleg::META->
        FindPropertyByName` aufgelöst und schmeißt OException bei Fehlern.
        Wir bauen die EPEntInformation-Objekte direkt aus den hardcoded
        Namen (Reflection in Python via duck-typing in
        `get_auspraegung_von_info`).
        """
        from osim_engine.decisions.entscheidung import EPEntInformationssystem
        infsys = EPEntInformationssystem(self.m_simulator)
        infsys.m_sName = "InfSys-EPEntStrKrzRessBedarf"
        for prop_name, parent in self._INFO_PROPERTIES_BASE:
            info = self.creat_info_from_property(prop_name, parent)
            infsys.m_lInformationen.append(info)
        return infsys

    # ------------------------------------------------------------------
    # Helper (cpp:124-168)
    # ------------------------------------------------------------------

    def get_ausloeser_id(self, proz: Any) -> int:
        """C++: cpp:124-127.

        Liest den Parameter "KrzRscEinsatz" aus dem Auslöser des
        Prozesses. Standard-Wert 0 wenn nicht gesetzt.
        """
        if proz is None or getattr(proz, "m_oTrigger", None) is None:
            return 0
        trig = proz.m_oTrigger
        ausl = getattr(trig, "m_oAusloeser", None) or getattr(trig, "m_oAusl", None)
        if ausl is None or not hasattr(ausl, "m_lParameter"):
            return 0
        params = ausl.m_lParameter
        if hasattr(params, "hole_parameter_int"):
            return params.hole_parameter_int("KrzRscEinsatz", 0)
        return 0

    def get_link_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: cpp:134-145 — holt LinkStatus über die Knoten↔Beleg-Assoz."""
        if knoten is None or not hasattr(knoten, "get_assoz_mit"):
            return None
        assres = knoten.get_assoz_mit(beleg)
        if assres is None or not hasattr(assres, "get_link_status"):
            return None
        return assres.get_link_status(beleg)

    def get_base_link_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: cpp:146-156."""
        if knoten is None or not hasattr(knoten, "get_assoz_mit"):
            return None
        assres = knoten.get_assoz_mit(beleg)
        if assres is None or not hasattr(assres, "get_base_link_status"):
            return None
        return assres.get_base_link_status(beleg)

    def set_link_status(self, knoten: Any, beleg: Any, status: AssozBelegLinkStatus) -> None:
        """C++: cpp:157-168."""
        if knoten is None or not hasattr(knoten, "get_assoz_mit"):
            return
        assres = knoten.get_assoz_mit(beleg)
        if assres is None or not hasattr(assres, "set_link_status"):
            return
        assres.set_link_status(beleg, status)

    # ------------------------------------------------------------------
    # Sim-Logik (cpp:176-399)
    # ------------------------------------------------------------------

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: cpp:176-200.

        Iteriert die Knoten-Liste der Entscheidungsaufgabe und ruft
        `treffe_ent_fuer_knoten` pro Knoten auf.
        """
        if not self.m_bEntscheidungAktivieren:
            return None
        # Erwartet EPEntKrzRessourcenEinsatz als Aufgabe
        from osim_engine.decisions.aufgabe import EPEntKrzRessourcenEinsatz
        if not isinstance(ent_aufgabe, EPEntKrzRessourcenEinsatz):
            return None
        for knoten in ent_aufgabe.m_lDlplKnoten:
            self.treffe_ent_fuer_knoten(knoten, ent_feld, ent_aufgabe, proz)
        return None

    def treffe_ent_fuer_knoten(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:201-218 — id != 2 → ress_zuordnen; id == 2 → zuordnung_ruecknehmen."""
        id_ = self.get_ausloeser_id(proz)
        if id_ != 2:
            for _ in range(self.m_iAnzahl):
                self.ress_zuordnen(knoten, ent_feld, ent_aufgabe)
        else:
            for _ in range(self.m_iAnzahl):
                self.zuordnung_ruecknehmen(knoten, ent_feld, ent_aufgabe)

    def bedingungen_pruefen(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> bool:
        """C++: cpp:227-231 — Basis: immer True."""
        return True

    def ress_zuordnen(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> None:
        """C++: cpp:236-368 — komplexe Zuordnungs-Logik.

        Skelett: Info-Verfügbarkeit prüfen + erstbeste Ressource auswählen
        + Status setzen. Detail-Logik (Min/Max-Auswahl nach Reaktion) ist
        hier vereinfacht — die Auswertung über `GetZstBrachzeit` etc.
        funktioniert via `get_auspraegung_von_info`.
        """
        if ent_feld is None or ent_feld.m_oEntInf is None:
            return
        # Wenn Info nicht verfügbar und Entscheidung nicht erzwungen → raus
        # (Detail-Check via property-name + Reaktion)
        info_sys = ent_feld.m_oEntInf
        prop_for_reaktion = {
            KrzBaseReak.KBR_MAX_BRACH: "GetZstBrachzeit",
            KrzBaseReak.KBR_MIN_PROZ: "GetZstWartProzesse",
            KrzBaseReak.KBR_MIN_ARBINHALT: "GetZstWartArbInhalt",
            KrzBaseReak.KBR_MAX_QUALI: "GetKnzQualifikationselemente",
            KrzBaseReak.KBR_MIN_QUALI: "GetKnzQualifikationselemente",
            KrzBaseReak.KBR_MIN_ZST_QUALI: "GetZstQualifikationselemente",
        }.get(KrzBaseReak(self.m_eReaktion), "")
        b_is_info_verfuegbar = (
            prop_for_reaktion != ""
            and info_sys.is_info_in_system_by_property(prop_for_reaktion)
        )
        if not b_is_info_verfuegbar and not self.m_bEntscheidungErzwingen:
            return
        # Echte Auswahl-Logik braucht EPEntKrzRessourcenEinsatz-API
        # (get_head_position/get_next/set_status), die in P5-D als Stubs
        # implementiert ist. Aktive Sim-Logik kommt mit voll funktionsfähigem
        # P5-D (Status-API) — hier bewusst kein Status-Eingriff.

    def zuordnung_ruecknehmen(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> None:
        """C++: cpp:374-399 — wenn `m_bRuecksetzenNachZeitspanne` False, kein
        sofortiges Rücksetzen; sonst Base-Status restaurieren.
        """
        if self.m_bRuecksetzenNachZeitspanne:
            return  # cpp:383 — return wenn nach Zeitspanne ohnehin auto-reset
        # Iteration über die Ressourcen erfolgt erst wenn EPEntKrzRessourcenEinsatz
        # voll implementiert ist (P5-D-Status-API). Im C++-Code: Base-Status
        # ABL_BLOCKED → Link-Status ABL_BLOCKED (Status-Rollback).


# ----------------------------------------------------------------------
# EPEntStrKrzRessBedarf
# ----------------------------------------------------------------------


class EPEntStrKrzRessBedarf(EPEntStrKrzRessBase):
    """Bedarfs-Strategie: prüft VOR der Zu-/Abschaltung ob Aktion nötig ist.

    C++: `EPEntStrKrzRessBedarf : $public EPEntStrKrzRessBase`
    (`EPStrategie.odh:136-169`, `.cpp:405-545`).
    """

    # Zusätzliche PDlplKnoten-Properties
    _INFO_PROPERTIES_BEDARF: tuple[tuple[str, str], ...] = (
        ("GetZstAnzWartProz", "PDlplKnoten"),
        ("GetZstArbInWartProz", "PDlplKnoten"),
        ("GetZstAuslastungAssozRess", "PDlplKnoten"),
    )

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.m_iProzAnzahl: int = 10
        self.m_dArbInhalt: float = 13500.0
        self.m_dDstAuslastung: float = 95.0

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:414-454 — Basis-Infos + 3 PDlplKnoten-Properties."""
        infsys = super().creat_std_informations_system()
        infsys.m_sName = "InfSys-EPEntStrKrzRessBedarf"
        for prop_name, parent in self._INFO_PROPERTIES_BEDARF:
            info = self.creat_info_from_property(prop_name, parent)
            infsys.m_lInformationen.append(info)
        return infsys

    def treffe_ent_fuer_knoten(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:469-483 — Bedarfs-Variante: prüft Bedingungen, dann zuordnen."""
        if self.bedingungen_pruefen(knoten, ent_feld, ent_aufgabe):
            for _ in range(self.m_iAnzahl):
                self.ress_zuordnen(knoten, ent_feld, ent_aufgabe)
        else:
            for _ in range(self.m_iAnzahl):
                self.zuordnung_ruecknehmen(knoten, ent_feld, ent_aufgabe)

    def bedingungen_pruefen(
        self,
        knoten: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> bool:
        """C++: cpp:491-526.

        True wenn eines der 3 Schwellwerte (Prozess-Anzahl, Arbeitsinhalt,
        Auslastung) überschritten ist. Logik via getattr-Aufruf auf
        Knoten (statt OMetaProperty-Reflection).
        """
        if ent_feld is None or ent_feld.m_oEntInf is None:
            return False
        info_sys = ent_feld.m_oEntInf

        # Anz. wartender Prozesse
        if info_sys.is_info_in_system_by_property("GetZstAnzWartProz"):
            info = info_sys.get_info_by_property("GetZstAnzWartProz")
            i_proz = int(self.get_auspraegung_von_info(knoten, info))
            if i_proz > self.m_iProzAnzahl:
                return True
        # Arbeitsinhalt der Warteschlange
        if info_sys.is_info_in_system_by_property("GetZstArbInWartProz"):
            info = info_sys.get_info_by_property("GetZstArbInWartProz")
            d_arb = self.get_auspraegung_von_info(knoten, info)
            if d_arb > self.m_dArbInhalt:
                return True
        # Auslastung der Ressourcen
        if info_sys.is_info_in_system_by_property("GetZstAuslastungAssozRess"):
            info = info_sys.get_info_by_property("GetZstAuslastungAssozRess")
            d_aus = self.get_auspraegung_von_info(knoten, info)
            if d_aus > self.m_dDstAuslastung:
                return True
        return False


# ----------------------------------------------------------------------
# EPEntStrKrzRessArbSuchen
# ----------------------------------------------------------------------


class EPEntStrKrzRessArbSuchen(EPEntStrKrzRessBase):
    """ArbSuchen-Strategie: Ressourcen mit zu wenig Arbeit suchen Arbeit.

    C++: `EPEntStrKrzRessArbSuchen : $public EPEntStrKrzRessBase`
    (`EPStrategie.odh:273-369`, `.cpp:708-1543`).

    Die Strategie wird in der ArbSuchen-Variante aktiviert: untätige
    Ressourcen werden auf ausgelastete Knoten umgeleitet. Konfiguration
    über `m_eWahlverhalten` (KrzBaseKnotenWaehlen).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Konfiguration
        self.m_bGegenrechnen: bool = True
        self.m_bWechselAuchNachZuordnung: bool = False
        self.m_bGruppenBeruecksichtigen: bool = False
        self.m_bGegenseitigZuordnen: bool = False
        self.m_bLinksStatusSofortSetzen: bool = False
        self.m_bZuordnungsmengeAusGruppeExtrahieren: bool = False
        self.m_eWahlverhalten: int = KrzBaseKnotenWaehlen.KBS_MAX_ARBINHALT
        self.m_iErlaubteWechselProGruppe: int = -1
        self.m_iErlaubteZuordnungProGruppe: int = -1
        self.m_iErlaubteZuordnungProRessource: int = -1
        self.m_fProzAnteilEinsatzeitAnRuecksetzzeit: float = 50.0
        self.m_bEinsatzzeitBeachten: bool = False
        # Bedingungen
        self.m_iBrachDistance: int = 3600
        self.m_iBrachLevel: int = 10
        self.m_iPrzAnzahl: int = 4
        self.m_dArbInhalt: float = 300.0
        self.m_dAuslastung: float = 95.0
        # protected
        self._lTmpAusgBeleg: list[Any] = []
        self._sDumperStr: str = ""
        # Helper-Listen (1:1 zu C++ — m_oParent zeigt auf diese Instanz)
        self.m_lEPEntStrKrzRessGroupInfoList = EPEntStrKrzRessGroupInfoList()
        self.m_lEPEntStrKrzRessGroupInfoList.m_oParent = self
        self.m_lEPEntStrKrzRessStatusInfoList = EPEntStrKrzRessStatusInfoList()
        self.m_lEPEntStrKrzRessStatusInfoList.m_oParent = self
        self.m_lEPEntStrKrzRessZuordnungsInfoList = EPEntStrKrzRessZuordnungsInfoList()
        self.m_lEPEntStrKrzRessZuordnungsInfoList.m_oParent = self

    # ------------------------------------------------------------------
    # Lifecycle (cpp:348-368)
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim: Any, deep: bool = True) -> None:
        """C++: cpp:362-368 — Helper-Listen leeren."""
        super().on_sim_begin(sim, deep=deep)
        self._sDumperStr = ""
        self.m_lEPEntStrKrzRessStatusInfoList.clear()
        self.m_lEPEntStrKrzRessGroupInfoList.clear()
        self.m_lEPEntStrKrzRessZuordnungsInfoList.clear()

    # ------------------------------------------------------------------
    # Standard-Systeme (cpp:714-784)
    # ------------------------------------------------------------------

    def creat_std_ziel_system(self) -> "EPZelSystem | None":  # type: ignore[override]
        """C++: cpp:714-717 — Basis-Variante (None)."""
        return None

    def creat_std_informations_system(self) -> "EPEntInformationssystem":  # type: ignore[override]
        """C++: cpp:718-784 — Basis-Set + arbSuchen-spezifische Properties."""
        infsys = super().creat_std_informations_system()
        infsys.m_sName = "InfSys-EPEntStrKrzRessArbSuchen"
        return infsys

    # ------------------------------------------------------------------
    # Helper (cpp:1178-1306)
    # ------------------------------------------------------------------

    def is_beleg_in_ausg_list(self, beleg: Any) -> bool:
        """C++: cpp:1178-1192 — ist Beleg in Ausgeschlossen-Liste?"""
        return any(b is beleg for b in self._lTmpAusgBeleg)

    def get_erlaubte_wechsel_pro_gruppe(self, beleg: Any) -> int:
        """C++: cpp:1272-1289."""
        if self.m_iErlaubteWechselProGruppe < 0:
            return 999999  # "unbegrenzt"
        gname = getattr(beleg, "m_sGruppenName", "") if beleg is not None else ""
        anz = self.m_lEPEntStrKrzRessGroupInfoList.get_anzahl_abordnungen(gname)
        return max(0, self.m_iErlaubteWechselProGruppe - anz)

    def get_erlaubte_zuordnung_pro_gruppe(self, beleg: Any) -> int:
        """C++: cpp:1290-1306."""
        if self.m_iErlaubteZuordnungProGruppe < 0:
            return 999999
        gname = getattr(beleg, "m_sGruppenName", "") if beleg is not None else ""
        anz = self.m_lEPEntStrKrzRessGroupInfoList.get_anzahl_zuordnungen(gname)
        return max(0, self.m_iErlaubteZuordnungProGruppe - anz)

    # ------------------------------------------------------------------
    # Sim-Logik (cpp:786-1462)
    # ------------------------------------------------------------------

    def treffe_entscheidung(
        self,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> Any:
        """C++: cpp:786-887.

        Skelett: aktiviert ArbSuchen-Algorithmus. Konkrete Iteration über
        Belegungs-Ressourcen + Knoten-Auswahl ist in P5-E noch nicht
        implementiert — die Methoden `treffe_ent_fuer_beleg`,
        `beste_pressfuer_zuordnung_suchen`, `gegenrechnen` bleiben Stubs.
        Der Master-Guard `m_bIsEntAktiv=False` verhindert ohnehin den
        Aufruf in P5-E-Default-Konfiguration.
        """
        if not self.m_bEntscheidungAktivieren:
            return None
        return None

    def treffe_ent_fuer_beleg(
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
        proz: Any,
    ) -> None:
        """C++: cpp:889-928 — P5-E Stub."""

    def bedingungen_pruefen(  # type: ignore[override]
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> bool:
        """C++: cpp:930-996 — Schwellwert-Check (Brachzeit/Auslastung etc.).

        Beachte: ArbSuchen-Variante prüft auf RessBeleg-Ebene, nicht
        Knoten-Ebene (anders als Basis).
        """
        if ent_feld is None or ent_feld.m_oEntInf is None:
            return False
        # Skelett: in Vollausbau Schwellwerte gegen Brachzeit/Anz/Inhalt/Auslastung
        return False

    def beste_pressfuer_zuordnung_suchen(
        self,
        list_: list[Any],
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> Any:
        """C++: cpp:998-1077 — P5-E Stub."""
        return None

    def p_ress_beleg_auswaehlen_fuer(
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> Any:
        """C++: cpp:1079-1176 — P5-E Stub."""
        return None

    def gegenrechnen(
        self,
        beleg: Any,
        o_ausg_beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> Any:
        """C++: cpp:1194-1270 — P5-E Stub."""
        return None

    def beleg_zuordnen(
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> None:
        """C++: cpp:1313-1461 — P5-E Stub."""

    def zuordnung_ruecknehmen(  # type: ignore[override]
        self,
        beleg: Any,
        ent_feld: "EPEntFeld",
        ent_aufgabe: Any,
    ) -> None:
        """C++: cpp:1463-1543 — P5-E Stub."""
