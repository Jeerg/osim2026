"""Abstrakte Aufgaben-Knoten — Slice P5-C.

Provenienz: `OSimPro/PDpKnAlternativELogik.{odh:29-152, cpp:31-269}`.

Knoten-Hierarchie:

    PDpKnVerteilung (V9 — Python: pps/knoten/zeitvorgabe.py)
    └── EPEntscheidungsAufgabe (abstrakt)
        ├── EPEntAufgabeAltExtern (abstrakt)
        │   └── EPEntAufgabeAltExternRessBeleg (abstrakt, m_lRessourcen)
        └── EPEntAufgabeAltIntern (abstrakt, in P5-D)

Slice-P5-C-Funktionsumfang:
    - `EPEntscheidungsAufgabe` mit allen Sim-Hooks (proz_weitergeben,
      bearbeit_beginnen, on_proz_bearbeit_*, entscheidung_treffen,
      get_entfeld_wenn_keine_belegung)
    - Verzweigung nach `m_eRessUsage` (eaBelegen / eaAnwesenheitPruefen /
      eaKeineBelegung)
    - Counter-Familie m_dPtkEnaDlzGes/Ent + KPIs
    - EPEntAufgabeAltExtern + EPEntAufgabeAltExternRessBeleg als Pass-Through

Aktivierungs-Schutz: Diese Klassen sind im C++-Original `$abstract`. Sie
werden vom Loader nicht direkt registriert (kommen erst durch die
konkreten Subklassen in P5-D). Daher ändert P5-C das Sim-Verhalten
nicht — keine OTX-Instanz triggert proz_weitergeben hier.
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.zeitvorgabe import PDpKnVerteilung

if TYPE_CHECKING:
    from osim_engine.decisions.entscheidung import EPEntFeld
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Enum
# ----------------------------------------------------------------------


class EntAufgabeBelegStatus(IntEnum):
    """C++-Enum aus PDpKnAlternativELogik.odh:21-26.

    Beachte: C++ startet bei 1000 (statt 0), damit die Werte sich von
    anderen Enums unterscheiden. Wir übernehmen das 1:1 für OTX-Treue —
    `m_eRessUsage` wird aus der OTX als Integer geladen und muss exakt
    diesen Wertebereich treffen.
    """
    EABELEGEN = 1000              # Ressource muss frei und anwesend sein
    EAANWESENHEITPRUEFEN = 1001   # Ressource muss nur anwesend sein
    EAKEINEBELEGUNG = 1002        # Ressource wird nicht belegt


# ----------------------------------------------------------------------
# EPEntscheidungsAufgabe
# ----------------------------------------------------------------------


class EPEntscheidungsAufgabe(PDpKnVerteilung):
    """Abstrakte Basis aller Entscheidungs-Aufgaben-Knoten.

    C++: `EPEntscheidungsAufgabe : $public PDpKnVerteilung`
    (`PDpKnAlternativELogik.odh:29-90`, `.cpp:31-269`). `$abstract` —
    wird nur über konkrete Subklassen (P5-D) instanziiert.

    Anders als PDpKnVerteilung:
    - `proz_weitergeben` erzeugt einen `PtProzEntAufgabeBase` statt
      `PtProzZeitvorgabe` (cpp:52-83).
    - `bearbeit_beginnen` verzweigt nach `m_eRessUsage` (cpp:88-131).
    - `on_proz_bearbeit_ende` ruft `entscheidung_treffen` VOR der
      Standard-Logik (cpp:159-163).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_eRessUsage: int = EntAufgabeBelegStatus.EABELEGEN

        # Protokolle: mittlere Durchlaufzeit gesamt / Entscheidungs-Teil
        # (PDpKnAlternativELogik.odh:38-42)
        self.m_dPtkEnaDlzGes: float = 0.0
        self.m_dTmpEnaDlzGes: float = 0.0
        self.m_dPtkEnaDlzEnt: float = 0.0
        self.m_dTmpEnaDlzEnt: float = 0.0

    # ------------------------------------------------------------------
    # Sim-Methoden
    # ------------------------------------------------------------------

    def proz_weitergeben(self, proz_ober: "PtProzess", ent: Any) -> None:
        """C++: `EPEntscheidungsAufgabe::ProzWeitergeben` (cpp:52-83).

        Erzeugt einen neuen `PtProzEntAufgabeBase` (statt PtProzZeitvorgabe
        wie in PDpKnVerteilung). Verknüpft mit Knoten/Trigger/ProzOber/
        Entitaet. Bei `bearbeit_beginnen=False` wird der Prozess in die
        zentrale Wartschlange eingehängt.
        """
        from osim_engine.pps.prozess.ent_aufgabe import PtProzEntAufgabeBase

        proz = PtProzEntAufgabeBase(self.p_simulator)
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent

        # Debug-Name wie im C++ (cpp:65)
        proz_ober_name = getattr(proz_ober, "m_sName", "") or ""
        proz.m_sName = f"{proz_ober_name}|{self.m_sName}"

        self.m_iPtkProzessCount += 1
        self.add_prozess(proz)

        # Trigger notifizieren (cpp:72)
        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        # Bearbeitung initiieren — bei Rückweisung in zentrale Warteschlange
        if not self.bearbeit_beginnen(proz):
            self.p_simulator.m_oWarteSchl.add_tail(proz)

    def bearbeit_beginnen(self, proz_this: "PtProzess") -> bool:
        """C++: `EPEntscheidungsAufgabe::BearbeitBeginnen` (cpp:88-131).

        Verzweigt nach `m_eRessUsage`:
        - `eaBelegen`: Standard-Pfad über `PDpKnVerteilung.bearbeit_beginnen`.
        - `eaAnwesenheitPruefen`: nur `RessAnwesend` (statt RessVerfuegbar);
          counters + on_proz_bearbeit_beginn + proz.bearbeit_beginnen.
        - `eaKeineBelegung`: bestimme EntFeld via `get_entfeld_wenn_keine_belegung`,
          dann direkt bearbeiten.
        """
        if self.m_eRessUsage == EntAufgabeBelegStatus.EABELEGEN:
            return super().bearbeit_beginnen(proz_this)

        if self.m_eRessUsage == EntAufgabeBelegStatus.EAANWESENHEITPRUEFEN:
            self.m_iPtkBegAusloesungCount += 1
            if proz_this.ress_anwesend():
                self.on_proz_bearbeit_beginn(proz_this)
                proz_this.bearbeit_beginnen()
                return True
            # Abgelehnt
            proz_this.on_bearbeit_abgelehnt()
            return False

        # eaKeineBelegung (1002) — direkt entscheiden ohne Ressource
        if self.m_eRessUsage == EntAufgabeBelegStatus.EAKEINEBELEGUNG:
            # m_oEntFeld nur setzen wenn proz das Attribut hat (Duck-Typing)
            if hasattr(proz_this, "m_oEntFeld"):
                proz_this.m_oEntFeld = self.get_entfeld_wenn_keine_belegung()
            self.on_proz_bearbeit_beginn(proz_this)
            proz_this.bearbeit_beginnen()
            return True

        return False

    def get_entfeld_wenn_keine_belegung(self) -> "EPEntFeld | None":
        """C++: `EPEntscheidungsAufgabe::GetEntfeldWennKeineBelegung` (cpp:137-149).

        Iteriert `m_lAssozRess` und liefert das erste EntFeld-Tupel aus
        einer `EPAszEntFeld`-Assoz. Standard-Verhalten: erstes EntFeld
        zurückgeben.
        """
        from osim_engine.resources.assoziation.ent_feld import EPAszEntFeld

        for assoz in self.m_lAssozRess:
            if not isinstance(assoz, EPAszEntFeld):
                continue
            if assoz.m_lEntFeldTupel:
                return assoz.m_lEntFeldTupel[0]
        return None

    def entscheidung_treffen(self, proz: "PtProzess") -> Any:
        """C++: `EPEntscheidungsAufgabe::EntscheidungTreffen` (cpp:35-44).

        Delegiert an `m_oEntFeld.treffe_entscheidung` falls der Prozess
        eine PtProzEntAufgabeBase-Variante ist und ein EntFeld hat. Sonst
        None.
        """
        entfeld = getattr(proz, "m_oEntFeld", None)
        if entfeld is None:
            return None
        return entfeld.treffe_entscheidung(self, proz)

    def on_proz_bearbeit_beginn(self, proz: "PtProzess") -> None:
        """C++: cpp:155-158 — delegiert an PDpKnVerteilung."""
        super().on_proz_bearbeit_beginn(proz)

    def on_proz_bearbeit_ende(self, proz: "PtProzess") -> None:
        """C++: cpp:159-163.

        Ruft `entscheidung_treffen` VOR der Standard-Logik. Das Ergebnis
        wird in der konkreten Subklasse weiterverwertet (z.B. als
        gewählter Sub-Plan in EntAufgabeAltIntern).
        """
        self.entscheidung_treffen(proz)
        super().on_proz_bearbeit_ende(proz)

    def on_proz_bearbeit_unterbr(self, proz: "PtProzess") -> None:
        """C++: cpp:164-167 — delegiert an PDpKnVerteilung."""
        super().on_proz_bearbeit_unterbr(proz)

    # ------------------------------------------------------------------
    # KPIs
    # ------------------------------------------------------------------

    def get_knoten_anzahl(self, nur_basis_knoten: bool = True) -> int:
        """C++: cpp:179-182 — immer 0 (eigene Knoten zählen nicht als Basis)."""
        return 0

    def _ptk_intervall_stop_local(self, ptk_attr: str, tmp_attr: str, ptime: int) -> None:
        """Inline-Helper analog OSimulator.ptk_intervall_stop."""
        tmp_val = getattr(self, tmp_attr)
        sim = self.p_simulator
        if tmp_val != 0.0 and sim.m_isPtk:
            setattr(self, ptk_attr, getattr(self, ptk_attr) + tmp_val * ptime)

    def _ptk_intervall_start_local(self, ptk_attr: str, tmp_attr: str, ptime: int) -> None:
        """Inline-Helper analog OSimulator.ptk_intervall_start."""
        tmp_val = getattr(self, tmp_attr)
        sim = self.p_simulator
        if tmp_val != 0.0 and sim.m_isPtk:
            setattr(self, ptk_attr, getattr(self, ptk_attr) - tmp_val * ptime)

    def get_knz_mit_ena_dlz_ges(self) -> float:
        """C++: `GetKnzMitEnaDlzGes` (cpp:187-210).

        Mittlere Gesamt-Durchlaufzeit des Prozesses durch diesen Knoten.
        Während der Sim wird das Protokoll-Intervall kurz "gestoppt", um
        einen konsistenten Wert zu lesen, und dann wieder "gestartet".
        """
        if self.m_iPtkAusloesungCount == 0:
            return 0.0
        sim = self.p_simulator
        if sim.is_simulating():
            if not sim.m_isPtk:
                return 0.0
            curr = sim.evt_curr_time()
            self._ptk_intervall_stop_local("m_dPtkEnaDlzGes", "m_dTmpEnaDlzGes", curr)
            d_ret = self.m_dPtkEnaDlzGes / self.m_iPtkAusloesungCount
            self._ptk_intervall_start_local("m_dPtkEnaDlzGes", "m_dTmpEnaDlzGes", curr)
            return d_ret
        return self.m_dPtkEnaDlzGes / self.m_iPtkAusloesungCount

    def get_knz_zeg_mit_ena_dlz_ges(self, z_klass: Any = None) -> float:
        """C++: `GetKnzZegMitEnaDlzGes` (cpp:212-221) — Zegna-Indikator."""
        mindlz = self.get_knz_min_dlfz(z_klass)
        mittdlz = self.get_knz_mit_ena_dlz_ges()
        if mittdlz == 0.0:
            return 0.0
        return mindlz / mittdlz

    def get_knz_mit_ena_dlz_ent(self) -> float:
        """C++: `GetKnzMitEnaDlzEnt` (cpp:222-245). Wie Ges, nur auf
        Entscheidungs-Teil bezogen."""
        if self.m_iPtkAusloesungCount == 0:
            return 0.0
        sim = self.p_simulator
        if sim.is_simulating():
            if not sim.m_isPtk:
                return 0.0
            curr = sim.evt_curr_time()
            self._ptk_intervall_stop_local("m_dPtkEnaDlzEnt", "m_dTmpEnaDlzEnt", curr)
            d_ret = self.m_dPtkEnaDlzEnt / self.m_iPtkAusloesungCount
            self._ptk_intervall_start_local("m_dPtkEnaDlzEnt", "m_dTmpEnaDlzEnt", curr)
            return d_ret
        return self.m_dPtkEnaDlzEnt / self.m_iPtkAusloesungCount

    def get_knz_zeg_mit_ena_dlz_ent(self, z_klass: Any = None) -> float:
        """C++: `GetKnzZegMitEnaDlzEnt` (cpp:247-255)."""
        mindlz = self.get_knz_min_dlfz(z_klass)
        mittdlz = self.get_knz_mit_ena_dlz_ent()
        if mittdlz == 0.0:
            return 0.0
        return mindlz / mittdlz

    def get_knz_sum_zeit(self, z_klass: Any = None) -> float:
        """C++: cpp:261-265 — Stub (`throw OException` ist auskommentiert)."""
        return 0.0

    def prz_kosten_berechnen(self, d_ein_kosten: float) -> None:
        """C++: cpp:266-269 — Stub (auskommentiert)."""

    def get_knz_periodenkosten(self, k_klass: Any = None) -> float:
        return 0.0


# ----------------------------------------------------------------------
# EPEntAufgabeAltExtern
# ----------------------------------------------------------------------


class EPEntAufgabeAltExtern(EPEntscheidungsAufgabe):
    """Abstrakter Aufgaben-Knoten für externe Alternativen.

    C++: `EPEntAufgabeAltExtern : $public EPEntscheidungsAufgabe`
    (`PDpKnAlternativELogik.odh:113-129`). `$abstract` — der C++-Header
    enthält keine zusätzlichen Attribute oder Methoden gegenüber der
    Basis. Die Klasse dient nur als Hierarchie-Marker für konkrete
    Subklassen (P5-D: EPEntKrzRessourcenEinsatz, EPEntReihenfolge,
    EPEntKrzKapazitaetsVeraenderung).
    """


# ----------------------------------------------------------------------
# EPEntAufgabeAltExternRessBeleg
# ----------------------------------------------------------------------


class EPEntAufgabeAltExternRessBeleg(EPEntAufgabeAltExtern):
    """Abstrakter Aufgaben-Knoten mit Liste zugeordneter Belegungs-Ressourcen.

    C++: `EPEntAufgabeAltExternRessBeleg : $public EPEntAufgabeAltExtern`
    (`PDpKnAlternativELogik.odh:134-152`). `$abstract`. Erweitert um
    `m_lRessourcen` — die Ressourcen, auf die die Entscheidung Bezug nimmt.

    Konkrete Subklassen in P5-D: EPEntKrzRessourcenEinsatzRess,
    EPEntReihenfolge, EPEntKrzKapazitaetsVeraenderung.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Liste der Entscheidung zugeordneter Ressourcen
        # C++: m_lRessourcen : PRessBelegLList
        from osim_engine.pps.parameter import PParameterLList  # noqa: F401
        self.m_lRessourcen: list[Any] = []
