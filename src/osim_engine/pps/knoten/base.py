"""PDlplKnoten — Basis-Knoten im Plan-Graphen.

Provenienz: `OSimPro/PDlplKnoten.odh` + `OSimPro/PDlplKnoten.cpp`.

V1: minimal, ohne Plan-Graph-Routing.
V2: m_lKanteAus-Routing in on_proz_beendet, KnotenListener, on_proz_sub_beendet.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


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

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """In V1/V2 immer True (keine Ressourcen-Logik)."""
        return True

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """Bearbeitung initiieren.

        Reihenfolge:
            1. ress_verfuegbar prüfen → bei False return False
            2. m_iPtkBegAusloesungCount++
            3. Listener-Notifikation (V2+)
            4. proz.bearbeit_beginnen()
            5. return True
        """
        if not self.ress_verfuegbar(proz):
            return False
        self.m_iPtkBegAusloesungCount += 1

        for listener in list(self._listeners):
            listener.on_proz_bearbeit_beginn(proz)

        proz.bearbeit_beginnen()
        return True

    def on_proz_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """Wird vom Prozess gerufen, wenn er fertig ist.

        V2-Routing:
            - Wenn is_ptk: Counter++
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
