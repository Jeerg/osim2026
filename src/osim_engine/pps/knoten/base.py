"""PDlplKnoten — Basis-Knoten im Plan-Graphen.

Provenienz: `OSimPro/PDlplKnoten.odh` + `OSimPro/PDlplKnoten.cpp`.

V1: minimal, ohne Plan-Graph-Routing.
V2: m_lKanteAus-Routing in on_proz_beendet, KnotenListener, on_proz_sub_beendet.
V4: m_lAssozRess wird aktive Liste; bearbeit_beginnen wird C++-konform
restrukturiert (Counter immer, dann ress_verfuegbar, dann
on_proz_bearbeit_beginn + proz.bearbeit_beginnen ODER
proz.on_bearbeit_abgelehnt).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.assoziation.base import PAssozRessource


class KnotenListener:
    """Listener für PDlplKnoten-Notifikationen.

    Python-Mapping von `PListenerDlplKnoten` (SUPPLEMENT § 6.1).
    Override `on_proz_bearbeit_beginn/ende/unterbr` für UI-/Observability-Hooks.
    """

    def __init__(self) -> None:
        self.m_oKnoten: "PDlplKnoten | None" = None

    def attach(self, knoten: "PDlplKnoten") -> None:
        assert self.m_oKnoten is None
        knoten._listeners.insert(0, self)
        self.m_oKnoten = knoten

    def detach(self) -> None:
        if self.m_oKnoten is None:
            return
        try:
            self.m_oKnoten._listeners.remove(self)
        except ValueError:
            pass
        self.m_oKnoten = None

    def on_proz_bearbeit_beginn(self, proz: "PtProzess") -> None: ...
    def on_proz_bearbeit_ende(self, proz: "PtProzess") -> None: ...
    def on_proz_bearbeit_unterbr(self, proz: "PtProzess") -> None: ...


class PDlplKnoten(PSimObj):
    """C++-Äquivalent: `PDlplKnoten` (`PDlplKnoten.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lProzesse: list["PtProzess"] = []

        # Plan-Graph-Felder (in V2 aktiv)
        self.m_lKanteEin: "PDlplKante | None" = None
        self.m_lKanteAus: "PDlplKante | None" = None
        self.m_lKnotenOber: "PDlplKnoten | None" = None

        # Ressourcen-Assoziationen — in V4 aktiv
        self.m_lAssozRess: list["PAssozRessource"] = []
        self.m_lAssozSpeich: Any = None    # PAssozSpeicher (P3)

        # Protokoll-Counter
        self.m_iPtkAusloesungCount: int = 0
        self.m_iPtkBegAusloesungCount: int = 0
        self.m_iPtkProzessCount: int = 0
        self.m_iPtkProzRefuseCount: int = 0
        self.m_dPtkDurchlaufzeit: float = 0.0
        self.m_dTmpDurchlaufzeit: float = 0.0
        self.m_dEinKostenVorgaenger: float = 0.0
        self.m_dEinMinKostenVorgaenger: float = 0.0

        self._listeners: list[KnotenListener] = []

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def on_rec_init(self, deep: bool = True) -> None:
        self.m_iPtkAusloesungCount = 0
        self.m_iPtkBegAusloesungCount = 0
        self.m_iPtkProzessCount = 0
        self.m_iPtkProzRefuseCount = 0
        self.m_dPtkDurchlaufzeit = 0.0
        self.m_dTmpDurchlaufzeit = 0.0

    # ------------------------------------------------------------------
    # Sim-Methoden (virtual, polymorph)
    # ------------------------------------------------------------------

    def add_prozess(self, proz: "PtProzess") -> None:
        self.m_lProzesse.append(proz)

    def remove_prozess(self, proz: "PtProzess") -> None:
        try:
            self.m_lProzesse.remove(proz)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # Assoziations-Helper (V4)
    # ------------------------------------------------------------------

    def add_assoziation(self, assoz: "PAssozRessource") -> None:
        """Hängt eine PAssozRessource (z. B. PAssozBeleg) an den Knoten.

        Setzt den Rück-Link `assoz.m_lKnoten = self`. Die Assoziation wird
        NICHT separat ins Simulator-Lifecycle eingehängt — in V4 reicht das,
        da PAssozBeleg.on_sim_* nur Entscheider-State zurücksetzt (in V4
        deaktiviert) bzw. Protokoll-Arrays initialisiert (V6+).
        """
        assoz.m_lKnoten = self
        self.m_lAssozRess.append(assoz)

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """Default-Delegate an `proz.ress_verfuegbar()`.

        Ohne Assoziationen (V1-V3-Pfad) → immer True. Mit Assoziationen
        (V4+) iteriert die Prozess-Seite alle PAssozRessource des Knotens.
        """
        return proz.ress_verfuegbar()

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """Bearbeitung initiieren — C++-konform.

        C++ `PDlplKnoten::BearbeitBeginnen` (PDlplKnoten.cpp:35-57):
            1. m_iPtkBegAusloesungCount++  (zählt JEDE Auslösung, auch refused)
            2. ress_verfuegbar prüfen
               True  → OnProzBearbeitBeginn (Listener) + proz.bearbeit_beginnen
               False → proz.on_bearbeit_abgelehnt + return False
        """
        self.m_iPtkBegAusloesungCount += 1

        if self.ress_verfuegbar(proz):
            # DLZ-Akkumulation vorbereiten: Begin am Prozess merken
            proz._knoten_begin_zeit = self.p_simulator.evt_curr_time()  # type: ignore[attr-defined]

            for listener in list(self._listeners):
                listener.on_proz_bearbeit_beginn(proz)

            proz.bearbeit_beginnen()
            return True

        # Ressource(n) nicht verfügbar: Relationen aufräumen, Refuse-Counter
        proz.on_bearbeit_abgelehnt()
        self.m_iPtkProzRefuseCount += 1
        return False

    def on_proz_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """Wird vom Prozess gerufen, wenn er fertig ist.

        V2-Routing:
            - Wenn is_ptk: Counter++
            - DLZ akkumulieren (Sample für KPI; C++ `PtkIntervallEnd`).
              Bei zwischenzeitlich unterbrochenen Prozessen (V6) ist
              `_knoten_begin_zeit` der Anchor des LETZTEN aktiven
              Intervalls (Resume-Zeitpunkt); ältere Intervalle wurden
              bereits in `on_proz_unterbr` akkumuliert.
            - Listener notifizieren (on_proz_bearbeit_ende)
            - Prozess aus Liste entfernen
            - Routing:
                a) Wenn m_lKanteAus gesetzt → über Kante an Nachfolger weiter
                b) Wenn proz.m_oTrigger gesetzt aber kein m_lKanteAus
                   → V1-Verhalten: Trigger direkt notifizieren
                   (für Auslöser-direkt-an-Knoten ohne Plan, V1-Kompatibilität)
        """
        if self.is_ptk:
            self.m_iPtkAusloesungCount += 1

        # DLZ akkumulieren (V3 KPI, V6 mit Unterbrechungs-Anteil)
        begin = getattr(proz, "_knoten_begin_zeit", None)
        if begin is not None:
            self.m_dPtkDurchlaufzeit += float(self.p_simulator.evt_curr_time() - begin)
            proz._knoten_begin_zeit = None  # type: ignore[attr-defined]

        for listener in list(self._listeners):
            listener.on_proz_bearbeit_ende(proz)

        self.remove_prozess(proz)

        if self.m_lKanteAus is not None:
            # V2-Pfad: über Kante an Nachfolger
            self.m_lKanteAus.proz_weitergeben(proz, ent)
        elif proz.m_oTrigger is not None:
            # V1-Pfad (kein Plan-Graph): Trigger direkt notifizieren
            proz.m_oTrigger.on_dlpl_beendet(proz)

    def on_proz_sub_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """Sub-Plan ohne ausgehende Kante meldet seine Fertigstellung.

        C++ PDlplKnoten.cpp — Hook für Plan-in-Plan-Hierarchien.
        V2 minimale Implementation: leitet an on_proz_beendet weiter.
        """
        self.on_proz_beendet(proz, ent)

    def on_proz_unterbr(self, proz: "PtProzess", ent: Any) -> None:
        """C++: `PDlplKnoten::OnProzUnterbr` (PDlplKnoten.cpp:69-74) +
        `PDlplKnoten::OnProzBearbeitUnterbr` (PDlplKnoten.cpp:811-821).

        Wird vom Prozess gerufen, wenn er extern unterbrochen wird
        (z. B. Einsatzzeit-Ende bei rsvStandard):
            - DLZ-Intervall schließen (analog C++ PtkIntervallEnd)
            - Listener `on_proz_bearbeit_unterbr` notifizieren
            - Prozess bleibt in m_lProzesse (Resume per
              proz_wart_ausloesen)
        """
        del ent  # V6 unbenutzt
        # DLZ-Intervall schließen (V6 — Pausen-Zeit wird NICHT akkumuliert)
        begin = getattr(proz, "_knoten_begin_zeit", None)
        if begin is not None:
            self.m_dPtkDurchlaufzeit += float(self.p_simulator.evt_curr_time() - begin)
            proz._knoten_begin_zeit = None  # type: ignore[attr-defined]

        for listener in list(self._listeners):
            listener.on_proz_bearbeit_unterbr(proz)

    # ------------------------------------------------------------------
    # KPI-Methoden (V3)
    # ------------------------------------------------------------------

    def get_knz_mittl_dlfz(self, z_klass: Any = None) -> float:
        """Mittlere Durchlaufzeit = m_dPtkDurchlaufzeit / m_iPtkAusloesungCount.

        C++: PDlplKnoten::GetKnzMittlDlfz. Liefert 0.0 bei keinem Lauf
        (vermeidet Division-by-zero).
        """
        if self.m_iPtkAusloesungCount == 0:
            return 0.0
        return self.m_dPtkDurchlaufzeit / self.m_iPtkAusloesungCount

    def get_knz_min_dlfz(self, z_klass: Any = None) -> float:
        """Minimale Durchlaufzeit = Approximation für kritischen Weg.

        Default: gibt die mittlere DLZ zurück (= geschätzt minimal für
        Konstant-Knoten). Subklassen wie PDpKnZeitvorgabe überschreiben.
        """
        return self.get_knz_mittl_dlfz(z_klass)

    def get_knz_periodenkosten(self, k_klass: Any = None) -> float:
        """Periodenkosten = Eingangs-Kosten + Knoten-eigene Kosten.

        In V1/V2 (ohne Ressourcen): nur Eingangs-Kosten + 0.
        """
        return self.m_dEinKostenVorgaenger

    def get_knz_min_periodenkosten(self, k_klass: Any = None) -> float:
        """Min-Periodenkosten — analog get_knz_periodenkosten."""
        return self.m_dEinMinKostenVorgaenger

    def prz_kosten_berechnen(self, d_ein_kosten: float) -> None:
        """Default-Knoten-Kosten-Setter: Eingangs-Kosten merken.

        C++: PDlplKnoten::PrzKostenBerechnen (Defaultverhalten).
        """
        self.m_dEinKostenVorgaenger = d_ein_kosten

    def min_prz_kosten_berechnen(self, d_min_ein_kosten: float) -> None:
        """Default-Knoten-Min-Kosten-Setter."""
        self.m_dEinMinKostenVorgaenger = d_min_ein_kosten
