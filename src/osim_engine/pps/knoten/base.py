"""PDlplKnoten — Basis-Knoten im Plan-Graphen.

Provenienz: `OSimPro/PDlplKnoten.odh` + `OSimPro/PDlplKnoten.cpp`.

In V1 minimale Implementierung:
    - Felder: m_lProzesse, m_sName, Counter
    - Methoden: add_prozess, ress_verfuegbar (V1: immer True),
      bearbeit_beginnen, on_proz_beendet
    - Kein Routing nach m_lKanteAus (kein Plan-Graph in V1)
    - Listener-Mechanik ist vorhanden, aber niemand subscribed

V2 ergänzt: m_lKanteEin/m_lKanteAus, m_lKnotenOber, Routing-Logik,
Listener-Subklasse für UI-/Observability-Hooks, KPI-Methoden.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDlplKnoten(PSimObj):
    """C++-Äquivalent: `PDlplKnoten` (`PDlplKnoten.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lProzesse: list["PtProzess"] = []

        # In V1 keine Kanten/Plan-Hierarchie
        self.m_lKanteEin: Any = None       # PDlplKante (V2)
        self.m_lKanteAus: Any = None       # PDlplKante (V2)
        self.m_lKnotenOber: Any = None     # PDlplKnoten (V2)
        self.m_lAssozSpeich: Any = None    # PAssozSpeicher (P3)

        # Protokoll-Counter — werden inkrementiert während Sim-Lauf
        self.m_iPtkAusloesungCount: int = 0
        self.m_iPtkBegAusloesungCount: int = 0
        self.m_iPtkProzessCount: int = 0
        self.m_iPtkProzRefuseCount: int = 0
        self.m_dPtkDurchlaufzeit: float = 0.0
        self.m_dTmpDurchlaufzeit: float = 0.0
        self.m_dEinKostenVorgaenger: float = 0.0
        self.m_dEinMinKostenVorgaenger: float = 0.0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def on_rec_init(self, deep: bool = True) -> None:
        """Protokoll-Counter zurücksetzen. PDlplKnoten.odh `OnRecInit`."""
        self.m_iPtkAusloesungCount = 0
        self.m_iPtkBegAusloesungCount = 0
        self.m_iPtkProzessCount = 0
        self.m_iPtkProzRefuseCount = 0
        self.m_dPtkDurchlaufzeit = 0.0
        self.m_dTmpDurchlaufzeit = 0.0

    # ------------------------------------------------------------------
    # Sim-Methoden (virtual, polymorph) — V1-Subset
    # ------------------------------------------------------------------

    def add_prozess(self, proz: "PtProzess") -> None:
        """Prozess in Knoten-Liste einhängen."""
        self.m_lProzesse.append(proz)

    def remove_prozess(self, proz: "PtProzess") -> None:
        try:
            self.m_lProzesse.remove(proz)
        except ValueError:
            pass

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """Sind Ressourcen verfügbar? In V1 immer True (keine Ressourcen-Logik)."""
        return True

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """Bearbeitung initiieren.

        Reihenfolge (siehe REVIEW-REQUEST Heikle Stelle 3, verifiziert in V1):
            1. m_iPtkBegAusloesungCount++
            2. RessVerfuegbar prüfen → bei False return False
            3. (V2+) on_proz_bearbeit_beginn-Listener notifizieren
            4. proz.bearbeit_beginnen()
            5. return True
        """
        if not self.ress_verfuegbar(proz):
            return False
        self.m_iPtkBegAusloesungCount += 1
        # Listener-Notifikation (V2+): self._notify("on_proz_bearbeit_beginn", proz)
        proz.bearbeit_beginnen()
        return True

    def on_proz_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """Wird vom Prozess gerufen, wenn er fertig ist.

        Phase-1-Pfad: nur Counter inkrementieren + aus Liste entfernen.
        Phase-2-Pfad: weiterleiten via m_lKanteAus.proz_weitergeben(...).
        """
        if self.is_ptk:
            self.m_iPtkAusloesungCount += 1

        self.remove_prozess(proz)

        # V1: kein Routing — der Prozess ist hiermit abgeschlossen.
        # Notifiziere den Trigger (für End-to-End-Kette)
        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_dlpl_beendet(proz)

        # V2+: hier Listener-Notifikation für on_proz_bearbeit_ende
