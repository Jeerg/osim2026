"""PRessBeleg — passive Belegungs-Ressource (Maschine, Person, …).

Provenienz: `OSimPro/PRessBeleg.odh` + `OSimPro/PRessBeleg.cpp` (700+ Zeilen,
hier in V4 auf den passiven Belegungspfad reduziert).

V4-Umfang (Minimal-Slice "Passive Maschine"):
    - Status-Lebenszyklus rsFrei → rsBelegt → rsFrei
    - `ress_verfuegbar` / `ress_belegen` / `ress_freigeben`
    - `proz_wart_ausloesen` — wartende Prozesse beim Freigeben neu starten
    - Counter `m_iPtkAnfragenGesamt`, `m_iPtkBeiAnfrageAnwesend`,
      `m_iPtkAnfrageErfuellt`
    - Listener `RessBelegListener` (analog `KnotenListener`)

Auf V6/V7 vertagt: PEinsatzzeit-Trigger (rsPause), Tagesarbeitszeit,
Anwesenheits-Wahrscheinlichkeit unter 100, Kostenkennzahlen.

PRessBeleg erbt `PRessource` UND `PAktor` (1:1 wie C++). In Python ist das
einfach Mehrfachvererbung — beide Basen teilen sich `PSimObj` als gemeinsame
Wurzel (Diamond, sauber über MRO aufgelöst).
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.resources.aktor import PAktor
from osim_engine.resources.ressource import PRessource

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.speicher import PSpeicherProz


# ----------------------------------------------------------------------
# Enums — 1:1 aus PRessBeleg.odh
# ----------------------------------------------------------------------


class RessStatus(IntEnum):
    """`PRessBeleg.odh::RessStatus` (Z. 80-86)."""

    RS_FREI = 1000
    RS_BELEGT = 1001
    RS_PAUSE = 1002
    RS_END_FOR_DAY = 1003


class RessPauseVerhalten(IntEnum):
    """`PRessBeleg.odh::RessPauseVerhalten` (Z. 70-78). V6+."""

    RSV_STANDARD = 1100
    RSV_REST_BEARB = 1101
    RSV_REST_BEARB_PROD_END = 1102
    RSV_SELF = 1103


# ----------------------------------------------------------------------
# Listener-Basis (analog KnotenListener)
# ----------------------------------------------------------------------


class RessBelegListener:
    """Listener für `PRessBeleg`-Notifikationen.

    Analog `KnotenListener` (siehe `pps/knoten/base.py`). C++-Vorlage:
    `PListenerRessBeleg` (PRessBeleg.odh:542-573). V4 nur die passiven
    Hooks; `OnEinsatzBeginn/Ende` und `OnPrzQueueAdded/Removed` folgen ab V6.
    """

    def __init__(self) -> None:
        self.m_oBeleg: "PRessBeleg | None" = None

    def attach(self, beleg: "PRessBeleg") -> None:
        assert self.m_oBeleg is None
        beleg._listeners.insert(0, self)
        self.m_oBeleg = beleg

    def detach(self) -> None:
        if self.m_oBeleg is None:
            return
        try:
            self.m_oBeleg._listeners.remove(self)
        except ValueError:
            pass
        self.m_oBeleg = None

    def on_proz_beginn(self, proz: "PtProzess") -> None: ...
    def on_proz_ende(self, proz: "PtProzess") -> None: ...
    def on_proz_unterbr(self, proz: "PtProzess") -> None: ...
    def on_einsatz_beginn(self) -> None: ...
    def on_einsatz_ende(self) -> None: ...


# ----------------------------------------------------------------------
# PRessBeleg
# ----------------------------------------------------------------------


class PRessBeleg(PRessource, PAktor):
    """C++-Äquivalent: `PRessBeleg` (`PRessBeleg.odh:187`).

    Mehrfachvererbung wie in C++. Da `PRessource` und `PAktor` beide von
    `PSimObj` ableiten, entsteht ein Diamond — Python MRO löst das sauber.
    `__init__` muss nur einmal die `super()`-Chain anstoßen.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        # super() läuft via MRO: PRessBeleg → PRessource → PAktor → PSimObj
        super().__init__(simulator)

        # Aktueller Prozess (C++: m_oProzCurrent)
        self.m_oProzCurrent: "PtProzess | None" = None

        # Status (C++: m_rsStatus). Default rsFrei.
        self.m_rsStatus: RessStatus = RessStatus.RS_FREI

        # Konfig (V6+: m_lEinsatz, m_rsvPauseStatus, m_iAnwWahrsch, …)
        self.m_lEinsatz: Any = None  # PEinsatzzeit — V6
        self.m_rsvPauseStatus: RessPauseVerhalten = RessPauseVerhalten.RSV_STANDARD
        self.m_TryedPause: bool = False
        self.m_iAnwWahrsch: int = 100  # Anwesenheitswahrscheinlichkeit in %
        self.m_fKostFix: float = 0.0
        self.m_fKostVar: float = 0.0
        self.m_sGroupName: str = ""

        # Aktor-Flag (C++: m_bAktAsActor) — V4 immer False (passiv);
        # ab Phase 3 wird es im aktiven Aktor-Pfad (on_proz_eingefuegt)
        # auf True gesetzt.
        self.m_bAktAsActor: bool = False

        # Phase 3 (Aktor): Liste der Speicher, die dieser Aktor bedient.
        # 1:1 zu C++ PRessBeleg.odh:199 (`m_lSpeicher`). Pflege via
        # `attach_speicher` (bidirektional mit PSpeicherProz.m_lRessourcen).
        self.m_lSpeicher: list["PSpeicherProz"] = []

        # Counter (C++: m_iPtkAnfragenGesamt, m_iPtkBeiAnfrageAnwesend,
        # m_iPtkAnfrageErfuellt) — vollständig 1:1 in V4 aktiv
        self.m_iPtkAnfragenGesamt: int = 0
        self.m_iPtkAnfrageErfuellt: int = 0
        self.m_iPtkBeiAnfrageAnwesend: int = 0

        # Belegungs-/Einsatzzeit-Protokoll (V6+)
        self.m_dPtkAbgBedarf: float = 0.0
        self.m_dTmpAbgBedarf: float = 0.0
        self.m_dPtkEinsatzzeit: float = 0.0
        self.m_dTmpEinsatzzeit: float = 0.0
        self.m_dPtkUeberzeit: float = 0.0
        self.m_dTmpUeberzeit: float = 0.0

        # Listener-Liste (analog KnotenListener)
        self._listeners: list[RessBelegListener] = []

        # Per-Ressource-Warteschlange (C++: m_lPtkWartschl, PRessBeleg.odh:227).
        # Count-Modus: list[PtProzess], len() == GetKnzProzAnzahl(FALSE).
        # Befüllung: beim add_tail in zentrale WS tragen alle Assoz-Ressourcen
        # den Proz ein; beim ress_belegen wird er wieder ausgetragen.
        # qcContent/Umlage (GetKnzArbeitsinhalt) bleibt out of scope (P5D-SCOPE §3.2).
        self.m_lPtkWartschl: list["PtProzess"] = []

    # ------------------------------------------------------------------
    # Lifecycle — C++ PRessBeleg::OnSimBegin / OnSimReset / OnRecInit
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        """PRessBeleg.cpp:415-431."""
        super().on_sim_begin(sim, deep=deep)
        self.m_oProzCurrent = None
        self.m_lPtkWartschl = []

    def on_sim_reset(self, deep: bool = True) -> None:
        """PRessBeleg.cpp:433-446."""
        super().on_sim_reset(deep=deep)
        self.m_dPtkAbgBedarf = 0.0
        self.m_dTmpAbgBedarf = 0.0

    def on_rec_init(self, deep: bool = True) -> None:
        """PRessBeleg.cpp:448-488 — Counter zurücksetzen, Status rsFrei."""
        self.m_dPtkAbgBedarf = 0.0
        self.m_dTmpAbgBedarf = 0.0
        self.m_dPtkEinsatzzeit = 0.0
        self.m_dTmpEinsatzzeit = 0.0
        self.m_dPtkUeberzeit = 0.0
        self.m_dTmpUeberzeit = 0.0
        self.m_TryedPause = False
        self.m_iPtkAnfragenGesamt = 0
        self.m_iPtkAnfrageErfuellt = 0
        self.m_iPtkBeiAnfrageAnwesend = 0
        self.set_status(RessStatus.RS_FREI)
        self.m_lPtkWartschl = []

    # ------------------------------------------------------------------
    # Per-Ressource-Warteschlange (C++: GetZstWartProzesse, PRessBeleg.cpp:1807-1809)
    # ------------------------------------------------------------------

    def get_zst_wart_prozesse(self) -> int:
        """Count-Modus: Anzahl wartender Prozesse vor dieser Ressource.

        C++: GetZstWartProzesse() → m_lPtkWartschl.GetKnzProzAnzahl(FALSE)
        (PRessBeleg.cpp:1807-1809). 1:1-Äquivalent: len(m_lPtkWartschl).

        qcContent/Umlage (GetKnzArbeitsinhalt) bleibt out of scope.
        """
        return len(self.m_lPtkWartschl)

    # ------------------------------------------------------------------
    # Status-Setter
    # ------------------------------------------------------------------

    def set_status(self, status: RessStatus) -> None:
        """PRessBeleg.cpp:542-553. V4: ohne Entscheider-Protokoll."""
        self.m_rsStatus = status

    # ------------------------------------------------------------------
    # Passiver Belegungspfad
    # ------------------------------------------------------------------

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        """PRessBeleg.cpp:555-589.

        V4-Pfad: m_iAnwWahrsch=100 (Standard). Counter werden geführt:
        - m_iPtkAnfragenGesamt: jede Anfrage
        - m_iPtkBeiAnfrageAnwesend: Anwesenheit (bei 100% immer)
        - m_iPtkAnfrageErfuellt: erfüllt = anwesend + rsFrei
        """
        self.m_iPtkAnfragenGesamt += 1

        if self.m_iAnwWahrsch == 100:
            self.m_iPtkBeiAnfrageAnwesend += 1
            if self.m_rsStatus == RessStatus.RS_FREI:
                self.m_iPtkAnfrageErfuellt += 1
                return True
        else:
            # 1:1 zu C++: Zufallszahl 0..100 ziehen via PAWLICEK-LCG.
            zufallswert = self.p_simulator.s_verteil.vert_gleich(0, 100)
            if self.m_iAnwWahrsch >= zufallswert:
                self.m_iPtkBeiAnfrageAnwesend += 1
                if self.m_rsStatus == RessStatus.RS_FREI:
                    self.m_iPtkAnfrageErfuellt += 1
                    return True
        return False

    def ress_anwesend(self, proz: "PtProzess | None" = None) -> bool:  # noqa: ARG002
        """PRessBeleg.cpp:590-603."""
        if self.m_iAnwWahrsch == 100:
            return True
        zufallswert = self.p_simulator.s_verteil.vert_gleich(0, 100)
        return self.m_iAnwWahrsch >= zufallswert

    def ress_belegen(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:605-616. Setzt Status, merkt Prozess, notifiziert.

        Hinweis (AUDIT-OSIM-TREUE): m_lPtkWartschl wird hier NICHT mehr geleert.
        Im Original bleibt der Proz von der Knoten-Anmeldung bis zum Knoten-
        Verlassen in der Liste — auch während der Bearbeitung. GetZstWartProzesse
        zählt daher wartend + in Bearbeitung. Die Lebensdauer hängt jetzt an
        PDlplKnoten.add_prozess/remove_prozess (= C++ PtkUpDateProcessQueue),
        nicht am RessBelegen.
        """
        self.set_status(RessStatus.RS_BELEGT)
        self.m_oProzCurrent = proz

        self.p_simulator.bus.emit(
            "ress.belegen",
            ressource=self.m_sName,
            proz_id=proz.m_sName,
        )

        self.on_proz_beginn(proz)

    def ress_freigeben(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:619-644.

        Notifiziert, setzt rsFrei, ruft `proz_wart_ausloesen` um wartende
        Prozesse aus der zentralen Warteschlange erneut zu versuchen.

        Der `rsvRestBearb`-Pfad bleibt in V4 abgehandelt aber inaktiv
        (m_TryedPause kann nur durch V6-Pausen-Mechanik gesetzt werden).
        """
        self.on_proz_ende(proz)

        self.m_oProzCurrent = None

        if (
            self.m_rsvPauseStatus == RessPauseVerhalten.RSV_REST_BEARB
            and self.m_TryedPause
        ):
            self.set_status(RessStatus.RS_PAUSE)
            self.m_bAktAsActor = False
            self.p_simulator.bus.emit(
                "ress.freigeben",
                ressource=self.m_sName,
                proz_id=proz.m_sName,
                neuer_status=int(self.m_rsStatus),
            )
            return

        self.set_status(RessStatus.RS_FREI)
        self.m_bAktAsActor = False

        self.p_simulator.bus.emit(
            "ress.freigeben",
            ressource=self.m_sName,
            proz_id=proz.m_sName,
            neuer_status=int(self.m_rsStatus),
        )

        # Wartende Prozesse aufwecken
        self.proz_wart_ausloesen()

    def ress_unterbrechen(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:645-665. V4 ohne aktive Aktor-Schiene."""
        if self.m_rsStatus == RessStatus.RS_BELEGT:
            self.set_status(RessStatus.RS_FREI)

        self.on_proz_unterbr(proz)

        self.m_oProzCurrent = None
        self.m_bAktAsActor = False

    # ------------------------------------------------------------------
    # ProzWartAusloesen — kommt in V4-E aktiv
    # ------------------------------------------------------------------

    def proz_wart_ausloesen(self) -> None:
        """PRessBeleg.cpp:668-696.

        Iteriert die zentrale Warteschlange (m_oWarteSchl) und versucht jeden
        wartenden Prozess via `knoten.bearbeit_beginnen` erneut. Erfolgreiche
        Prozesse werden aus der Warteschlange entfernt. C++ läuft pro Priorität
        0..PTPROZ_MAX_PRIORITAET-1.

        In V4 gibt es nur Priorität 0; die Iteration ist trotzdem 1:1.
        Snapshot der Liste, damit `ws.remove(proz)` während der Iteration
        sicher ist (in C++ wird `oProzNext` vor dem Remove gemerkt).
        """
        ws = self.p_simulator.m_oWarteSchl
        snapshot = list(ws)
        if not snapshot:
            return

        max_prio = max(p.m_iPrioritaet for p in snapshot)

        for prio in range(max_prio + 1):
            for proz in snapshot:
                if self.m_rsStatus != RessStatus.RS_FREI:
                    return
                if proz.m_iPrioritaet != prio:
                    continue
                if ws.find(proz) < 0:
                    continue  # in dieser Schleife schon gestartet & entfernt
                assert proz.m_oKnoten is not None
                if proz.m_oKnoten.bearbeit_beginnen(proz):
                    ws.remove(proz)
            if self.m_rsStatus != RessStatus.RS_FREI:
                return

    # ------------------------------------------------------------------
    # Listener-Forwards (passiver Pfad)
    # ------------------------------------------------------------------

    def on_proz_beginn(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:704-720. V4: Listener notifizieren."""
        for listener in list(self._listeners):
            listener.on_proz_beginn(proz)

    def on_proz_ende(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:723-735."""
        for listener in list(self._listeners):
            listener.on_proz_ende(proz)

    def on_proz_unterbr(self, proz: "PtProzess") -> None:
        """PRessBeleg.cpp:738-747."""
        for listener in list(self._listeners):
            listener.on_proz_unterbr(proz)

    # ------------------------------------------------------------------
    # V6 — Einsatzzeit-Lifecycle
    # ------------------------------------------------------------------

    def on_einsatz_beginn(self, evttyp: Any = None, oezeit: Any = None) -> None:
        """C++: `PRessBeleg::OnEinsatzBeginn` (PRessBeleg.cpp:754-795).

        V6-Pfad (ohne Entscheider, ohne Aktor):
            1. m_TryedPause = False
            2. Einsatzzeit-Protokoll-Intervall starten (PRessBeleg.cpp:779-780)
            3. Listener notifizieren (`on_einsatz_beginn`)
            4. set_status(RS_FREI), m_oProzCurrent = None
            5. proz_wart_ausloesen (passiver Pfad, da m_bAktAsActor=False)
        """
        del evttyp, oezeit  # V6 unbenutzt — Pfade m_bIsEntFunktOn=False
        self.m_TryedPause = False

        # PRessBeleg.cpp:779-780 — Protokoll-Intervall starten
        if self.p_simulator.m_isPtk:
            self.p_simulator.ptk_intervall_begin(
                self, "m_dPtkEinsatzzeit", "m_dTmpEinsatzzeit",
                1.0, self.p_simulator.evt_curr_time(),
            )

        for listener in list(self._listeners):
            listener.on_einsatz_beginn()

        self.set_status(RessStatus.RS_FREI)
        self.m_oProzCurrent = None

        self.p_simulator.bus.emit(
            "ress.einsatz.beginn",
            ressource=self.m_sName,
        )

        # Phase 3: Aktor-Zweig — wenn m_bAktAsActor, sucht der Aktor
        # aktiv den nächsten Proz aus seinen Speichern (statt passiv
        # die zentrale Warteschlange durchzugehen).
        if not self.m_bAktAsActor:
            self.proz_wart_ausloesen()
        else:
            next_proz = self.proz_waehlen()
            if next_proz is not None:
                self.bearbeit_beginnen_aktiv(next_proz)

    def on_einsatz_ende(self, evttyp: Any = None, oezeit: Any = None) -> None:
        """C++: `PRessBeleg::OnEinsatzEnde` (PRessBeleg.cpp:798-933).

        V6-Pfad — nur `rsvStandard`:
            1. Einsatzzeit-Protokoll-Intervall schließen (PRessBeleg.cpp:878-881)
               Nur wenn `m_dTmpEinsatzzeit > 0` (offenes Intervall existiert).
            2. m_TryedPause = True
            3. Listener notifizieren (`on_einsatz_ende`)
            4. SetStatus(RS_PAUSE)
            5. Falls aktuell ein Prozess läuft: `bearbeit_unterbrechen`
        """
        del evttyp, oezeit  # V6 unbenutzt

        # PRessBeleg.cpp:878-881 — Protokoll-Intervall schließen
        if self.m_dTmpEinsatzzeit > 0 and self.p_simulator.m_isPtk:
            self.p_simulator.ptk_intervall_end(
                self, "m_dPtkEinsatzzeit", "m_dTmpEinsatzzeit",
                1.0, self.p_simulator.evt_curr_time(),
            )

        self.m_TryedPause = True

        for listener in list(self._listeners):
            listener.on_einsatz_ende()

        self.p_simulator.bus.emit(
            "ress.einsatz.ende",
            ressource=self.m_sName,
        )

        if self.m_rsvPauseStatus == RessPauseVerhalten.RSV_STANDARD:
            self.set_status(RessStatus.RS_PAUSE)
            if self.m_oProzCurrent is not None:
                self.m_oProzCurrent.bearbeit_unterbrechen()
            return

        # rsvRestBearb / rsvRestBearbProdEnd / rsvSelf — spätere Slices
        # (Entscheider, V7+). Fallback: wie rsvStandard.
        self.set_status(RessStatus.RS_PAUSE)
        if self.m_oProzCurrent is not None:
            self.m_oProzCurrent.bearbeit_unterbrechen()

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    def is_aktive_ress(self) -> bool:
        """PRessBeleg.odh:363 (`IsAktiveRess`). V4: immer False."""
        return self.m_bAktAsActor

    # ------------------------------------------------------------------
    # Phase 3 — Aktor-Pfad (überschreibt PAktor-Stubs)
    # ------------------------------------------------------------------

    def attach_speicher(self, speicher: "PSpeicherProz") -> None:
        """Bidirektionale Aktor↔Speicher-Verknüpfung.

        Fügt diesen Aktor in `speicher.m_lRessourcen` und den Speicher in
        `self.m_lSpeicher` ein. Damit bekommt der Aktor `on_proz_eingefuegt`-
        Notifikationen für jeden in den Speicher gelegten Prozess und kann
        in `on_akt_ende` aus seinen Speichern den nächsten Prozess wählen.
        """
        if speicher not in self.m_lSpeicher:
            self.m_lSpeicher.append(speicher)
        if self not in speicher.m_lRessourcen:
            speicher.m_lRessourcen.append(self)

    def on_proz_eingefuegt(
        self, speicher: "PSpeicherProz", proz: "PtProzess"
    ) -> None:
        """C++: `PRessBeleg::OnProzEingefuegt` (PRessBeleg.cpp:1145-1157).

        Speicher hat einen neuen Prozess bekommen → Aktor reagiert:
        m_bAktAsActor=True, ProzWaehlen mit dem konkreten Proz und
        anschließend bearbeit_beginnen_aktiv.
        """
        self.m_bAktAsActor = True
        own_proz = self.proz_waehlen(proz, speicher)
        self.bearbeit_beginnen_aktiv(own_proz)

    def proz_waehlen(
        self,
        proz: "PtProzess | None" = None,
        speicher: "PSpeicherProz | None" = None,
    ) -> "PtProzess | None":
        """C++: `PRessBeleg::ProzWaehlen` (PRessBeleg.cpp:1166-1192).

        Auswahl-Strategie:
        - mit `proz` und `speicher`: Aktor nimmt genau diesen Prozess
          (z. B. nach `on_proz_eingefuegt`). m_oSpeiProz wird gesetzt.
        - ohne Args: iteriere `m_lSpeicher`, gib den TAIL-Prozess des
          ersten nicht-leeren Speichers zurück. C++-Default-Strategie.
        """
        if proz is not None:
            assert speicher is not None, (
                "PRessBeleg.proz_waehlen: speicher darf nicht None sein, "
                "wenn proz übergeben wird"
            )
            self.m_oSpeiProz = speicher
            return proz

        if not self.m_lSpeicher:
            raise RuntimeError(
                "PRessBeleg.proz_waehlen: Aktor besitzt keine zugeordneten "
                "Prozesspeicher (m_lSpeicher leer). Vorher attach_speicher() "
                "aufrufen."
            )

        for sp in self.m_lSpeicher:
            if sp.m_lProzesse:
                self.m_oSpeiProz = sp
                return sp.m_lProzesse[-1]  # Tail
        return None

    def bearbeit_beginnen_aktiv(self, proz: "PtProzess | None") -> bool:
        """C++: `PRessBeleg::BearbeitBeginnen` (PRessBeleg.cpp:1200-1224).

        Aktor-Pfad (ersetzt für Aktoren den passiven knoten.bearbeit_beginnen-
        Aufruf). Reihenfolge:
            1. proz None → False (leere Speicher)
            2. proz.m_oAktor schon belegt → False (anderer Aktor war schneller)
            3. self.ress_verfuegbar(proz) (PRessBeleg-Selbst-Check) → bei
               False return False
            4. proz.m_oAktor = self
            5. proz.m_oKnoten.bearbeit_beginnen(proz): klassischer Knoten-Pfad.
               Bei FALSE: m_oAktor wieder None (Rollback).
        """
        if proz is None:
            return False
        if proz.m_oAktor is not None:
            return False
        if not self.ress_verfuegbar(proz):
            return False

        proz.m_oAktor = self
        assert proz.m_oKnoten is not None
        if not proz.m_oKnoten.bearbeit_beginnen(proz):
            proz.m_oAktor = None
            return False
        return True

    def on_akt_beginn(self, proz: "PtProzess") -> None:
        """C++: `PRessBeleg::OnAktBeginn` (PRessBeleg.cpp:1230-1261).

        Wird von `PtProzess.bearbeit_beginnen` (super-Kette via
        `aktor.on_akt_beginn`) gerufen, wenn proz.m_oAktor != None:
            1. Proz aus m_oSpeiProz.m_lProzesse entfernen
            2. m_oSpeiProz.on_proz_entnommen (Listener + Bus)
            3. self.ress_belegen(proz) — Aktor belegt sich selbst
        """
        assert self.m_oSpeiProz is not None, (
            "PRessBeleg.on_akt_beginn: m_oSpeiProz ist None — wurde "
            "proz_waehlen vor bearbeit_beginnen_aktiv aufgerufen?"
        )

        try:
            self.m_oSpeiProz.m_lProzesse.remove(proz)
        except ValueError as e:
            raise RuntimeError(
                f"PRessBeleg.on_akt_beginn: proz {proz.m_sName!r} nicht in "
                f"m_oSpeiProz.m_lProzesse"
            ) from e

        self.m_oSpeiProz.on_proz_entnommen(proz)
        self.ress_belegen(proz)

    def on_akt_ende(self, proz: "PtProzess") -> None:
        """C++: `PRessBeleg::OnAktEnde` (PRessBeleg.cpp:1264-1281).

        Wird von `PtProzess.bearbeit_beenden` (super) gerufen. Reihenfolge:
            1. on_proz_ende(proz) — Listener
            2. m_oProzCurrent = None
            3. set_status(RS_FREI) — KEIN ress.freigeben-Bus-Emit (1:1 zu C++,
               das emittiert auch nicht aus OnAktEnde)
            4. bearbeit_beginnen_aktiv(proz_waehlen()) — nächster Proz aus
               einem der angeschlossenen Speicher
        """
        self.on_proz_ende(proz)
        self.m_oProzCurrent = None
        self.set_status(RessStatus.RS_FREI)

        # Nächsten Proz holen — proz_waehlen() ohne Args wirft, wenn
        # m_lSpeicher leer wäre. Im Aktor-Pfad ist m_lSpeicher nie leer,
        # weil on_proz_eingefuegt vorher gefeuert hätte.
        next_proz = self.proz_waehlen()
        if next_proz is not None:
            self.bearbeit_beginnen_aktiv(next_proz)

    def on_akt_unterbr(self, proz: "PtProzess") -> bool:
        """C++: `PRessBeleg::OnAktUnterbr` (PRessBeleg.cpp:1284-1299).

        Wird von `PtProzess.bearbeit_unterbrechen` gerufen. Legt den proz
        zurück in den Speicher (m_oSpeiProz falls gesetzt, sonst ersten
        in m_lSpeicher). Returnt True: damit landet der proz NICHT
        zusätzlich in der zentralen Warteschlange.
        """
        if self.m_oSpeiProz is not None:
            self.m_oSpeiProz.proz_einfuegen(proz)
            self.m_bAktAsActor = True
            return True
        if self.m_lSpeicher:
            self.m_lSpeicher[0].proz_einfuegen(proz)
            self.m_bAktAsActor = True
            return True
        return False


# ----------------------------------------------------------------------
# PBetriebsmittel / PPerson — Marker-Subtypen
# ----------------------------------------------------------------------


class PBetriebsmittel(PRessBeleg):
    """C++-Äquivalent: `PBetriebsmittel` (`PRessBeleg.odh:743`).

    V4: keine zusätzliche Logik (kommt in V6 mit OnEinsatzBeginn/Ende).
    """


class _EvtPErmuedungswertPeriodeEnd(OMetaEvent):
    """$event(5) — Periode-Ende für PPerson-Ermüdungs-Bookkeeping.

    Wird in PPerson.on_sim_begin geschedult bei `t+m_iPeriodenLaenge`,
    feuert dort und plant sich für die nächste Periode neu ein.
    C++: `EvtPErmuedungswertPeriodeEnd` (PRessBeleg.odh:909).
    """
    m_subTime = 5
    m_name = "EvtPErmuedungswertPeriodeEnd"

    def execute(self, obj: "PPerson", para: Any) -> None:  # noqa: ARG002
        obj.p_ermuedungswert_periode_end()


_EVT_PERMUEDUNGSWERT = _EvtPErmuedungswertPeriodeEnd()


class PPerson(PRessBeleg):
    """C++-Äquivalent: `PPerson` (`PRessBeleg.odh:819`).

    V6+ Ermüdungs-Bookkeeping: pro Periode (Default 86399 = 1 Tag, siehe
    `m_iPeriodenLaenge`) feuert ein eigener Event und führt den Periode-
    Counter `m_iPtkAnzahlPerioden`. Das vollständige Ermüdungs-/Zeitstress-
    Modell aus C++ wird in Phase 5 portiert.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Konfiguration — C++ Default (PRessBeleg.odh:828)
        self.m_iPeriodenLaenge: int = 86399
        # Counter — werden in on_rec_init zurückgesetzt
        self.m_dPtkKumZeitstress: float = 0.0
        self.m_iPtkAnzAbgProzesse: int = 0
        self.m_dPtkKumErmuedungswertGesamt: float = 0.0
        self.m_dPtkKumErmuedungswertPeriode: float = 0.0
        self.m_iPtkAnzahlPerioden: int = 0
        self.m_iPtkBeginnZeitpunkt: int = 0

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        """C++: `PPerson::OnSimBegin` (PRessBeleg.odh:873-877).
        Erstes EvtPErmuedungswertPeriodeEnd platzieren.
        """
        super().on_sim_begin(sim, deep=deep)
        sim.evt_insert(
            _EVT_PERMUEDUNGSWERT,
            self,
            sim.evt_curr_time() + self.m_iPeriodenLaenge,
            None,
        )

    def on_rec_init(self, deep: bool = True) -> None:
        """C++: `PPerson::OnRecInit` (PRessBeleg.odh:879-893)."""
        super().on_rec_init(deep=deep)
        self.m_dPtkKumZeitstress = 0.0
        self.m_iPtkAnzAbgProzesse = 0
        self.m_dPtkKumErmuedungswertGesamt = 0.0
        self.m_dPtkKumErmuedungswertPeriode = 0.0
        self.m_iPtkAnzahlPerioden = 0
        self.m_iPtkBeginnZeitpunkt = 0

    def p_ermuedungswert_periode_end(self) -> None:
        """C++: `PPerson::PErmuedungswertPeriodeEnd` (PRessBeleg.cpp:4214-4233).

        Schließt eine Ermüdungs-Periode ab + plant die nächste ein.
        """
        sim = self.p_simulator
        time = sim.evt_curr_time()

        # Gesamt-Ermüdungswert kumulieren
        self.m_dPtkKumErmuedungswertGesamt += self.m_dPtkKumErmuedungswertPeriode
        self.m_dPtkKumErmuedungswertPeriode = 0.0

        # Perioden mitzählen
        self.m_iPtkAnzahlPerioden += 1

        # Nächsten Event einplanen
        sim.evt_insert(
            _EVT_PERMUEDUNGSWERT,
            self,
            time + self.m_iPeriodenLaenge,
            None,
        )
