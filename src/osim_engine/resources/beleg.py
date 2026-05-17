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

from osim_engine.resources.aktor import PAktor
from osim_engine.resources.ressource import PRessource

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


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

        # Aktor-Flag (C++: m_bAktAsActor) — V4: immer False (passiv)
        self.m_bAktAsActor: bool = False

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

    # ------------------------------------------------------------------
    # Lifecycle — C++ PRessBeleg::OnSimBegin / OnSimReset / OnRecInit
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        """PRessBeleg.cpp:415-431."""
        super().on_sim_begin(sim, deep=deep)
        self.m_oProzCurrent = None

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
        """PRessBeleg.cpp:605-616. Setzt Status, merkt Prozess, notifiziert."""
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
    # Helper
    # ------------------------------------------------------------------

    def is_aktive_ress(self) -> bool:
        """PRessBeleg.odh:363 (`IsAktiveRess`). V4: immer False."""
        return self.m_bAktAsActor


# ----------------------------------------------------------------------
# PBetriebsmittel / PPerson — Marker-Subtypen
# ----------------------------------------------------------------------


class PBetriebsmittel(PRessBeleg):
    """C++-Äquivalent: `PBetriebsmittel` (`PRessBeleg.odh:743`).

    V4: keine zusätzliche Logik (kommt in V6 mit OnEinsatzBeginn/Ende).
    """


class PPerson(PRessBeleg):
    """C++-Äquivalent: `PPerson` (`PRessBeleg.odh:819`).

    V4: keine zusätzliche Logik (Ermüdung/Zeitstress kommt in V6+).
    """
