"""PDpKnAlternativ — Knoten der zwischen mehreren Sub-Plänen verzweigt.

Provenienz: `OSimPro/PDpKnAlternativ.odh` + `OSimPro/PDpKnAlternativ.cpp`.

Ein Alternativ-Knoten hält N Alternativen, jede mit eigenem
`PDurchlaufplan` (`m_lDlpl`). Pro Auslösung wird **eine** Alternative
gewählt via `alternative_auswaehlen(proz_ober, ent)`; der Sub-Plan dieser
Alternative wird dann via `bearbeit_beginnen` → `m_lDlpl.proz_weitergeben`
gestartet. Bei Sub-Plan-Ende (`on_proz_sub_beendet`) wird der Prozess an
`m_lKanteAus` weitergegeben.

P4-B implementiert die abstract Basis sowie zwei Subtypen (1:1 zu C++):

- `PDpKnAlternativTypID`: Auswahl per Auslöser-Parameter `"id"` (TypID-
  Vergleich mit `PAlternativeTypID.m_iAuswahlID`)
- `PDpKnAlternativVerteilung`: stochastische Auswahl gemäß
  `PAlternativeVerteilung.m_fAuswahlWarschlkt` (kumulative Intervalle,
  Zufallszahl in [0, 100] aus dem PAWLICEK-LCG)

Der dritte Subtyp `PDpKnAlternativELogik` (Entscheider-basiert) gehört zu
**Phase 5**, nicht zu P4-B.

Counter `m_iPtkAuswahlCount` (an jeder Alternative) zählt, wie oft diese
Alternative gewählt wurde.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten
from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.durchlaufplan import PDurchlaufplan
    from osim_engine.pps.prozess.alternativ import PtProzAlternativ
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# PAlternative + Subtypen — C++ PDpKnAlternativ.odh:124-242
# ----------------------------------------------------------------------


class PAlternative(PSimObj):
    """C++-Äquivalent: `PAlternative` (`PDpKnAlternativ.odh:127`). Abstract.

    Trägt den zugehörigen `PDurchlaufplan` + Counter `m_iPtkAuswahlCount`
    für die Anzahl der gewählten Auslösungen.
    """

    def __init__(self, simulator: "PSimulator | None",
                 dlpl: "PDurchlaufplan | None" = None) -> None:
        super().__init__(simulator)
        self.m_lDlpl: "PDurchlaufplan | None" = dlpl
        self.m_iPtkAuswahlCount: int = 0

    def on_rec_init(self, deep: bool = True) -> None:
        # C++: PDpKnAlternativ::OnRecInit (PDpKnAlternativ.odh:57-64) — die
        # Counter werden vom Knoten in einer Schleife über alle Alternativen
        # zurückgesetzt. Hier mirroren wir das pro Alternative.
        super().on_rec_init(deep=deep)
        self.m_iPtkAuswahlCount = 0


class PAlternativeTypID(PAlternative):
    """C++-Äquivalent: `PAlternativeTypID` (`PDpKnAlternativ.odh:144`).

    Auswahl-ID, gegen die der Auslöser-Parameter `"id"` verglichen wird.
    """

    def __init__(self, simulator: "PSimulator | None",
                 dlpl: "PDurchlaufplan | None" = None,
                 auswahl_id: int = 0) -> None:
        super().__init__(simulator, dlpl=dlpl)
        self.m_iAuswahlID: int = auswahl_id


class PAlternativeVerteilung(PAlternative):
    """C++-Äquivalent: `PAlternativeVerteilung` (`PDpKnAlternativ.odh:229`).

    Auswahl-Wahrscheinlichkeit in Prozent (Default 100.0). Die Werte werden
    in `PDpKnAlternativVerteilung.alternative_auswaehlen` kumulativ als
    Intervalle [0, p1), [p1, p1+p2), ... aufgebaut; eine Zufallszahl in
    [0, 100) entscheidet.
    """

    def __init__(self, simulator: "PSimulator | None",
                 dlpl: "PDurchlaufplan | None" = None,
                 ausw_wahrschlkt: float = 100.0) -> None:
        super().__init__(simulator, dlpl=dlpl)
        self.m_fAuswahlWarschlkt: float = ausw_wahrschlkt


# ----------------------------------------------------------------------
# PDpKnAlternativ — abstract Basis
# ----------------------------------------------------------------------


class PDpKnAlternativ(PDlplKnoten):
    """C++-Äquivalent: `PDpKnAlternativ` (`PDpKnAlternativ.odh:23`). Abstract."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Konkrete Alternativen-Liste lebt im Subtyp (TypID-Liste vs.
        # Verteilung-Liste — in C++ jeweils eigene PSimLList). Hier
        # einheitlich als list[PAlternative].
        self.m_lAlternativen: list[PAlternative] = []

    def on_rec_init(self, deep: bool = True) -> None:
        """C++: PDpKnAlternativ::OnRecInit (PDpKnAlternativ.odh:57-64).
        Setzt die Auswahl-Counter aller Alternativen auf 0.
        """
        super().on_rec_init(deep=deep)
        for alt in self.m_lAlternativen:
            alt.m_iPtkAuswahlCount = 0

    # ------------------------------------------------------------------
    # Konstruktions-Helfer
    # ------------------------------------------------------------------

    def add_alternative(self, alt: PAlternative) -> None:
        """Hängt eine Alternative an + setzt `alt.m_lDlpl.m_lKnotenOber = self`.

        C++-Äquivalent: `PDpKnAlternativVerteilungDesignView::AppendAlternative`
        (PDpKnAlternativ.cpp:994-1007): sobald die Alternative einen Sub-Plan
        hat, wird `m_lKnotenOber` auf diesen Knoten gesetzt, damit
        `PDurchlaufplan.on_dlpl_beendet` den Rück-Ruf nach `on_proz_sub_beendet`
        findet.
        """
        self.m_lAlternativen.append(alt)
        if alt.m_lDlpl is not None:
            alt.m_lDlpl.m_lKnotenOber = self

    # ------------------------------------------------------------------
    # Pure overrideables
    # ------------------------------------------------------------------

    @abstractmethod
    def alternative_auswaehlen(self, proz_ober: "PtProzess | None",
                               ent: Any) -> PAlternative:
        """Wählt eine konkrete Alternative für diese Auslösung."""
        ...

    # ------------------------------------------------------------------
    # Sim-Methoden — C++ PDpKnAlternativ.cpp:36-117
    # ------------------------------------------------------------------

    def proz_erzeugen(self) -> "PtProzAlternativ":
        """C++: `PDpKnAlternativ::ProzErzeugen` (PDpKnAlternativ.cpp:39-42)."""
        from osim_engine.pps.prozess.alternativ import PtProzAlternativ
        return PtProzAlternativ(self.p_simulator)

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """C++: `PDpKnAlternativ::ProzWeitergeben` (PDpKnAlternativ.cpp:50-81).

        Reihenfolge wörtlich aus C++:
            1. AlternativeAuswaehlen
            2. PtProzAlternativ anlegen + parametrisieren (inkl. m_oAlternative)
            3. Trigger->OnPrzCreated
            4. AddProzess + m_iPtkProzessCount++
            5. BearbeitBeginnen — bei FALSE in m_oWarteSchl einreihen
        """
        from osim_engine.pps.prozess.alternativ import PtProzAlternativ

        alt = self.alternative_auswaehlen(proz_ober, ent)

        proz = self.proz_erzeugen()
        assert isinstance(proz, PtProzAlternativ)
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger if proz_ober is not None else None
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent
        proz.m_oAlternative = alt
        proz.m_sName = self.m_sName

        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        self.add_prozess(proz)
        self.m_iPtkProzessCount += 1

        self.p_simulator.bus.emit(
            "proz.create",
            proz_id=proz.m_sName,
            knoten=self.m_sName,
            trigger_id=(proz.m_oTrigger.m_sName if proz.m_oTrigger else None),
            alternative=alt.m_sName or None,
        )

        if not self.bearbeit_beginnen(proz):
            self.p_simulator.m_oWarteSchl.add_tail(proz)

    def bearbeit_beginnen(self, proz: "PtProzess") -> bool:
        """C++: `PDpKnAlternativ::BearbeitBeginnen` (PDpKnAlternativ.cpp:84-94).

        1. Basis-Logik (Counter++, ress_verfuegbar, listener, proz.bearbeit_beginnen)
        2. Sub-Plan der gewählten Alternative auslösen via
           `alt.m_lDlpl.proz_weitergeben(proz, ent)`
        """
        if not super().bearbeit_beginnen(proz):
            return False

        from osim_engine.pps.prozess.alternativ import PtProzAlternativ

        assert isinstance(proz, PtProzAlternativ), (
            f"PDpKnAlternativ.bearbeit_beginnen erwartet PtProzAlternativ, "
            f"bekam {type(proz).__name__}"
        )
        assert proz.m_oAlternative is not None, (
            f"PDpKnAlternativ {self.m_sName!r}: PtProzAlternativ ohne "
            "m_oAlternative — proz_weitergeben muss alternative_auswaehlen "
            "vorher setzen"
        )
        assert proz.m_oAlternative.m_lDlpl is not None, (
            f"Alternative {proz.m_oAlternative.m_sName!r} hat keinen Sub-Plan"
        )

        proz.m_oAlternative.m_lDlpl.proz_weitergeben(proz, proz.m_oEntitaet)
        return True

    def on_proz_sub_beendet(self, proz: "PtProzess", ent: Any) -> None:
        """C++: `PDpKnAlternativ::OnProzSubBeendet` (PDpKnAlternativ.cpp:97-107).

        1. Weitergabe an m_lKanteAus (= AUS dem Alternativ-Knoten heraus)
        2. OnProzBearbeitEnde (Counter, Listener, DLZ, m_iPtkAuswahlCount++)
        3. proz.bearbeit_beenden — PtProzAlternativ zerstört sich selbst
        """
        from osim_engine.pps.prozess.alternativ import PtProzAlternativ

        assert isinstance(proz, PtProzAlternativ), (
            f"on_proz_sub_beendet erwartet PtProzAlternativ, "
            f"bekam {type(proz).__name__}"
        )

        # 1. Weitergabe via m_lKanteAus
        if self.m_lKanteAus is not None:
            self.m_lKanteAus.proz_weitergeben(proz, ent)
        elif proz.m_oTrigger is not None:
            # Fallback (kein Plan-Graph nachgelagert): Trigger direkt
            proz.m_oTrigger.on_dlpl_beendet(proz)

        # 2. on_proz_bearbeit_ende mit Counter-Update auf der Alternative
        self.on_proz_bearbeit_ende(proz)

        # 3. PtProzAlternativ beenden + aus m_lProzesse entfernen
        self.remove_prozess(proz)
        proz.bearbeit_beenden()

    def on_proz_bearbeit_ende(self, proz: "PtProzess") -> None:
        """C++: `PDpKnAlternativ::OnProzBearbeitEnde` (PDpKnAlternativ.cpp:110-117).

        1. Auswahl-Counter der gewählten Alternative inkrementieren
        2. PDlplKnoten-Basis-Logik (DLZ-Schließen, Listener, Counter)
        """
        from osim_engine.pps.prozess.alternativ import PtProzAlternativ

        assert isinstance(proz, PtProzAlternativ)
        if proz.m_oAlternative is not None:
            proz.m_oAlternative.m_iPtkAuswahlCount += 1

        # PDlplKnoten-Äquivalent von OnProzBearbeitEnde (Counter + DLZ +
        # Listener — analog der Rücksprung-Implementierung). Die Basis-
        # Klasse hat keine eigene on_proz_bearbeit_ende-Methode; die
        # entsprechende Logik lebt in on_proz_beendet. Hier replizieren
        # wir das Counter-/DLZ-/Listener-Pattern:
        if self.is_ptk:
            self.m_iPtkAusloesungCount += 1

        begin = getattr(proz, "_knoten_begin_zeit", None)
        if begin is not None:
            self.m_dPtkDurchlaufzeit += float(
                self.p_simulator.evt_curr_time() - begin
            )
            proz._knoten_begin_zeit = None  # type: ignore[attr-defined]

        for listener in list(self._listeners):
            listener.on_proz_bearbeit_ende(proz)

    # ------------------------------------------------------------------
    # KPI — C++ PDpKnAlternativ.cpp:126-196
    # ------------------------------------------------------------------

    def get_knz_anz_ausw_alternative(self, alt_index: int) -> int:
        """C++: `GetKnzAnzAuswAlternative` (PDpKnAlternativ.cpp:126-129)."""
        return self.m_lAlternativen[alt_index].m_iPtkAuswahlCount


# ----------------------------------------------------------------------
# Konkrete Subtypen
# ----------------------------------------------------------------------


class PDpKnAlternativTypID(PDpKnAlternativ):
    """C++-Äquivalent: `PDpKnAlternativTypID` (`PDpKnAlternativ.odh:163`).

    Alternative wird über den **Auslöser-Parameter "id"** ausgewählt.
    Erste Alternative mit `m_iAuswahlID == id` gewinnt. Fallback: letzte
    Alternative in der Liste.
    """

    def alternative_auswaehlen(self, proz_ober: "PtProzess | None",
                               ent: Any) -> PAlternative:
        """C++: `PDpKnAlternativTypID::AlternativeAuswaehlen`
        (PDpKnAlternativ.cpp:705-729).

        Liest `id` vom Auslöser-Parameter-Container; sucht erste passende
        Alternative; bei keinem Match wird die letzte zurückgegeben (1:1
        zu C++ "Falls keine Alterantive gefunden wurde, wird immer die
        letzte genommen!").
        """
        del ent  # ungenutzt — wie in C++

        assert self.m_lAlternativen, (
            f"PDpKnAlternativTypID {self.m_sName!r} hat keine Alternativen"
        )
        assert proz_ober is not None and proz_ober.m_oTrigger is not None
        ausl = proz_ober.m_oTrigger.m_oAusloeser
        assert ausl is not None, (
            "PDpKnAlternativTypID: Trigger ohne Auslöser — kein Parameter-Zugriff"
        )

        i_id = ausl.m_lParameter.hole_parameter_int("id", 0)

        for alt in self.m_lAlternativen:
            assert isinstance(alt, PAlternativeTypID), (
                f"PDpKnAlternativTypID enthält Nicht-TypID-Alternative: "
                f"{type(alt).__name__}"
            )
            if alt.m_iAuswahlID == i_id:
                return alt

        return self.m_lAlternativen[-1]


class PDpKnAlternativVerteilung(PDpKnAlternativ):
    """C++-Äquivalent: `PDpKnAlternativVerteilung` (`PDpKnAlternativ.odh:248`).

    Stochastische Auswahl: kumulative Intervalle gemäß
    `PAlternativeVerteilung.m_fAuswahlWarschlkt`. Zufallszahl in [0, 100)
    aus dem PAWLICEK-LCG (`OSimulator::s_verteil.VertGleich() * 100`).
    """

    def alternative_auswaehlen(self, proz_ober: "PtProzess | None",
                               ent: Any) -> PAlternative:
        """C++: `PDpKnAlternativVerteilung::AlternativeAuswaehlen`
        (PDpKnAlternativ.cpp:908-936).

        Zufallszahl `dVert = VertGleich() * 100` einmal ziehen; dann
        sukzessive die kumulative obere Intervallgrenze aufbauen
        (`dMax += m_fAuswahlWarschlkt`) und Alternative wählen, sobald
        `dVert < dMax`. Bei kein Match → letzte Alternative (1:1 zu C++).
        """
        del proz_ober, ent  # ungenutzt — wie in C++

        assert self.m_lAlternativen, (
            f"PDpKnAlternativVerteilung {self.m_sName!r} hat keine Alternativen"
        )

        from osim_engine.core import distribution as dist_module
        d_vert = dist_module.s_verteil.vert_gleich() * 100.0

        d_max = 0.0
        for alt in self.m_lAlternativen:
            assert isinstance(alt, PAlternativeVerteilung), (
                f"PDpKnAlternativVerteilung enthält Nicht-Verteilung-Alternative: "
                f"{type(alt).__name__}"
            )
            d_max += alt.m_fAuswahlWarschlkt
            if d_vert < d_max:
                return alt

        return self.m_lAlternativen[-1]
