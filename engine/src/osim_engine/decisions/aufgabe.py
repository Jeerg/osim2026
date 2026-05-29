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
        self.m_lRessourcen: list[Any] = []


# ----------------------------------------------------------------------
# EPEntAufgabeAltIntern + 2 konkrete Erben (P5-D)
# ----------------------------------------------------------------------


class EPEntAufgabeAltIntern(EPEntscheidungsAufgabe):
    """Abstrakter Aufgaben-Knoten für interne Alternativen (Sub-Pläne).

    C++: `EPEntAufgabeAltIntern : $public EPEntscheidungsAufgabe`
    (`PDpKnAlternativELogik.odh:158-223`, `.cpp:411-680`). `$abstract`.

    Erweitert um `m_lDlpl` — Liste der alternativen Sub-Pläne, aus
    denen `entscheidung_treffen` einen auswählt. Sub-Plan-Routing:
    - `proz_weitergeben` erzeugt PtProzEntAufgabeIntern als Oberprozess
      mit gewähltem `m_oDlpl`, dann delegiert an PDpKnVerteilung.
    - `on_proz_beendet` triggert `dlpl.dlpl_ausloesen` mit dem Oberprozess
      als prozOber.
    - `on_proz_sub_beendet` reicht den Oberprozess an die ausgehende
      Kante weiter und beendet ihn.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # Alternative Sub-Pläne (PDurchlaufplanLList)
        self.m_lDlpl: list[Any] = []

    def entscheidung_treffen(self, proz: Any) -> Any:
        """C++: cpp:413-416 — Basis liefert None (Subklassen überschreiben)."""
        return None

    def proz_erzeugen(self) -> Any:
        """C++: cpp:420-423 — erzeugt PtProzEntAufgabeIntern als Oberprozess."""
        from osim_engine.pps.prozess.ent_aufgabe import PtProzEntAufgabeIntern
        return PtProzEntAufgabeIntern(self.p_simulator)

    def proz_weitergeben(self, proz_ober: Any, ent: Any) -> None:
        """C++: cpp:429-467 — erzeugt Oberprozess + delegiert an PDpKnVerteilung.

        Anders als EPEntscheidungsAufgabe.proz_weitergeben (welches
        PtProzEntAufgabeBase erzeugt), wird hier ein
        `PtProzEntAufgabeIntern`-Oberprozess angelegt, der den gewählten
        Sub-Plan in `m_oDlpl` trägt. PtkIntervallBegin auf beiden
        Protokoll-Countern (Ges + Ent).
        """
        sim = self.p_simulator
        # Entscheidung treffen — abstrakte Methode der Subklassen
        o_dlpl = self.entscheidung_treffen(proz_ober)

        # Oberprozess anlegen
        proz = self.proz_erzeugen()
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent
        # gewählten Durchlaufplan merken
        if hasattr(proz, "m_oDlpl"):
            proz.m_oDlpl = o_dlpl
        proz.m_sName = "Oberprozess"

        self.add_prozess(proz)
        self.m_iPtkProzessCount += 1

        # Trigger notifizieren
        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        # PtkIntervallBegin — Protokollierung der Entscheidungs-DLZ startet
        curr = sim.evt_curr_time()
        if sim.m_isPtk:
            self.m_dTmpEnaDlzGes += 1.0
            self.m_dPtkEnaDlzGes -= 1.0 * curr
            self.m_dTmpEnaDlzEnt += 1.0
            self.m_dPtkEnaDlzEnt -= 1.0 * curr

        # An Basisklasse PDpKnVerteilung delegieren (NICHT EPEntscheidungsAufgabe!)
        # PDpKnVerteilung ist Großmutter — wir umgehen die EntscheidungsAufgabe-
        # Variante, weil wir bereits oben Oberprozess + Counter selbst gehandhabt
        # haben.
        PDpKnVerteilung.proz_weitergeben(self, proz, ent)

    def bearbeit_beginnen(self, proz_this: Any) -> bool:
        """C++: cpp:470-477 — delegiert an EPEntscheidungsAufgabe."""
        if not super().bearbeit_beginnen(proz_this):
            return False
        return True

    def on_proz_beendet(self, proz_this: Any, ent: Any) -> None:
        """C++: cpp:479-507 — beendet Entscheidungs-Protokoll + löst Sub-Plan aus.

        Stoppt PtkIntervallEnd auf m_dPtkEnaDlzEnt (Ent-Teil endet hier).
        Holt den ausgewählten Sub-Plan aus dem Oberprozess (m_oDlpl) und
        ruft `dlpl.dlpl_ausloesen(trigger, oberprozess, ent)`.
        """
        sim = self.p_simulator
        curr = sim.evt_curr_time()
        # PtkIntervallEnd auf m_dPtkEnaDlzEnt
        if sim.m_isPtk:
            if not (sim.m_ptkBegin > 0 and self.m_dTmpEnaDlzEnt <= 0.0):
                self.m_dPtkEnaDlzEnt += 1.0 * curr
            self.m_dTmpEnaDlzEnt -= 1.0

        # Notifikation
        self.on_proz_bearbeit_ende(proz_this)

        # Sub-Plan aus Oberprozess holen
        ober = proz_this.m_oProzOber
        dlpl = getattr(ober, "m_oDlpl", None) if ober is not None else None
        if dlpl is None:
            return
        # Durchlaufplan auslösen — Sub-Plan startet mit Oberprozess als ProzOber
        if hasattr(dlpl, "dlpl_ausloesen"):
            dlpl.dlpl_ausloesen(proz_this.m_oTrigger, ober, ent)

    def on_proz_sub_beendet(self, proz_this: Any, ent: Any) -> None:
        """C++: cpp:509-521 — Sub-Plan ist fertig, an Kante weitergeben.

        Beendet das gesamte Protokoll (m_dPtkEnaDlzGes) und reicht den
        Oberprozess an die ausgehende Kante weiter, dann bearbeit_beenden.
        """
        sim = self.p_simulator
        curr = sim.evt_curr_time()
        # PtkIntervallEnd auf m_dPtkEnaDlzGes
        if sim.m_isPtk:
            if not (sim.m_ptkBegin > 0 and self.m_dTmpEnaDlzGes <= 0.0):
                self.m_dPtkEnaDlzGes += 1.0 * curr
            self.m_dTmpEnaDlzGes -= 1.0

        # An ausgehende Kante weiter
        if self.m_lKanteAus is not None:
            self.m_lKanteAus.proz_weitergeben(proz_this, ent)

        # Oberprozess beenden (PtProzEntAufgabeIntern)
        if hasattr(proz_this, "bearbeit_beenden"):
            proz_this.bearbeit_beenden()

    def on_proz_bearbeit_ende(self, proz: Any) -> None:
        """C++: cpp:524-528 — delegiert an PDpKnVerteilung (umgeht Basis)."""
        PDpKnVerteilung.on_proz_bearbeit_ende(self, proz)

    def get_knoten_anzahl(self, nur_basis_knoten: bool = True) -> int:
        """C++: cpp:532-548 — summiert über alternative Sub-Pläne (+1 für sich selbst)."""
        i = 0
        for dlpl in self.m_lDlpl:
            if hasattr(dlpl, "get_knoten_anzahl"):
                i += dlpl.get_knoten_anzahl(nur_basis_knoten)
        if nur_basis_knoten:
            return i
        return i + 1

    def get_knz_min_dlfz(self, z_klass: Any = None) -> float:
        """C++: cpp:552-570 — gewichteter Durchschnitt der Min-DLZ über alle
        alternativen Sub-Pläne."""
        anz = self.get_knz_anz_ausloesungen() if hasattr(self, "get_knz_anz_ausloesungen") else 0
        if anz == 0:
            return 0.0
        d_min_dlfz = 0.0
        for dlpl in self.m_lDlpl:
            anz_dlpl = dlpl.get_knz_anz_ausloesungen() if hasattr(dlpl, "get_knz_anz_ausloesungen") else 0
            if hasattr(dlpl, "get_knz_min_dlfz"):
                d_min_dlfz += anz_dlpl * dlpl.get_knz_min_dlfz(z_klass)
        return d_min_dlfz / anz


class EPEntAltProzesswege(EPEntAufgabeAltIntern):
    """Entscheidung über alternative Prozesswege.

    C++: `EPEntAltProzesswege : $public EPEntAufgabeAltIntern`
    (`PDpKnAlternativELogik.odh:327-349`, `.cpp:1428-1431`).

    Standard-Heuristik: `entscheidung_treffen` liefert immer den ersten
    Sub-Plan in `m_lDlpl` (cpp:1428-1431). Subklassen können das
    überschreiben.
    """

    def entscheidung_treffen(self, proz: Any) -> Any:
        """C++: cpp:1428-1431 — erste Alternative."""
        if not self.m_lDlpl:
            return None
        return self.m_lDlpl[0]


class EPEntAuftragsgroesse(EPEntAufgabeAltIntern):
    """Entscheidung über alternative Auftragsgrößen.

    C++: `EPEntAuftragsgroesse : $public EPEntAufgabeAltIntern`
    (`PDpKnAlternativELogik.odh:373-397`, `.cpp:1525-1527`).

    `set_menge` ist im C++-Original leerer Stub — wird hier ebenso
    angelegt für Schnittstellen-Treue.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iShadowMenge: int = 0

    def set_menge(self, dlpl: Any, menge: int) -> None:
        """C++: cpp:1525-1527 — leerer Stub."""


# ----------------------------------------------------------------------
# Konkrete Extern-Aufgaben-Knoten (P5-D)
# ----------------------------------------------------------------------


class EPEntKrzRessourcenEinsatz(EPEntAufgabeAltExtern):
    """Knoten-bezogene Entscheidung über kurzfristigen Ressourceneinsatz.

    C++: `EPEntKrzRessourcenEinsatz : $public EPEntAufgabeAltExtern`
    (`PDpKnAlternativELogik.odh:429-477`).

    Enthält eine Liste zugeordneter Knoten (`m_lDlplKnoten`) und Methoden
    zum Verwalten der Belegungs-Stati. In Slice P5-D als Container +
    Stub-Methoden — die echten Status-Operationen werden in P5-E von der
    Strategie aufgerufen.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # private temporäre Liste (CList in C++)
        self._shadow_list: list[Any] = []
        # Knoten-Liste — wird vom Loader befüllt
        self.m_lDlplKnoten: list[Any] = []

    # ------------------------------------------------------------------
    # Container-Methoden (Iteration über Ressourcen eines Knotens)
    # ------------------------------------------------------------------

    def fill_shadow_list(self, knoten: Any) -> None:
        """C++: EPEntKrzRessourcenEinsatz::FillShadowList (cpp:1810-1829).

        Füllt `_shadow_list` mit allen PRessBeleg-Einträgen aus allen
        PAssozBeleg-Assoziationen des Knotens. Das ist eine flache Sammlung:
        für jede PAssozBeleg in knoten.m_lAssozRess werden alle m_lRessourcen-
        Einträge in die Shadow-List übernommen (C++ AddTail in der inneren Schleife).

        Kein LinkStatus-Filtering hier — das ist Aufgabe der Aufrufer
        (z. B. GetStatus/SetStatus, die dann einzelne Einträge prüfen).
        """
        from osim_engine.resources.assoziation.beleg import PAssozBeleg

        self._shadow_list.clear()
        if knoten is None:
            return
        for assoz in getattr(knoten, "m_lAssozRess", []):
            if not isinstance(assoz, PAssozBeleg):
                continue
            self._shadow_list.extend(assoz.m_lRessourcen)

    # ------------------------------------------------------------------
    # Status-API (in P5-E aktiv)
    # ------------------------------------------------------------------

    def set_status(self, knoten: Any, beleg: Any, status: Any) -> None:
        """C++: SetStatus — P5-D Stub."""

    def get_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: GetStatus — P5-D Stub."""
        return None

    def get_base_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: GetBaseStatus — P5-D Stub."""
        return None

    def reset_status_2_base(self, beleg: Any) -> None:
        """C++: ResetStatus2Base — P5-D Stub."""

    def block_all(self, knoten: Any = None) -> None:
        """C++: BlockAll — P5-D Stub."""

    def un_block_all(self, knoten: Any = None) -> None:
        """C++: UnBlockAll — P5-D Stub."""

    def invert_blocking(self, knoten: Any = None) -> None:
        """C++: InvertBlocking — P5-D Stub."""

    def inc_ress(self, knoten: Any = None, menge: int = 1) -> bool:
        """C++: IncRess — P5-D Stub."""
        return False

    def dec_ress(self, knoten: Any = None, menge: int = 1) -> bool:
        """C++: DecRess — P5-D Stub."""
        return False

    def reset_by_timespan(self, knoten: Any, zeitspanne: int, beleg: Any) -> None:
        """C++: ResetByTimespan — P5-D Stub."""

    def set_by_timespan_2_state(
        self, knoten: Any, zeitspanne: int, beleg: Any, status: Any
    ) -> None:
        """C++: SetByTimespan2State — P5-D Stub."""


class EPEntKrzRessourcenEinsatzRess(EPEntAufgabeAltExternRessBeleg):
    """Ressourcen-bezogene Variante von EPEntKrzRessourcenEinsatz.

    C++: `EPEntKrzRessourcenEinsatzRess : $public EPEntAufgabeAltExternRessBeleg`
    (`PDpKnAlternativELogik.odh:501-529`).

    Identische Status-API wie EPEntKrzRessourcenEinsatz, plus
    Subset-Vergleichsmethoden. P5-D als Stubs.
    """

    def set_status(self, knoten: Any, beleg: Any, status: Any) -> None:
        """C++: SetStatus — P5-D Stub."""

    def get_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: GetStatus — P5-D Stub."""
        return None

    def get_base_status(self, knoten: Any, beleg: Any) -> Any:
        """C++: GetBaseStatus — P5-D Stub."""
        return None

    def reset_status_2_base(self, beleg: Any) -> None:
        """C++: ResetStatus2Base — P5-D Stub."""

    def block_all(self, knoten: Any = None) -> None:
        """C++: BlockAll — P5-D Stub."""

    def un_block_all(self, knoten: Any = None) -> None:
        """C++: UnBlockAll — P5-D Stub."""

    def invert_blocking(self, knoten: Any = None) -> None:
        """C++: InvertBlocking — P5-D Stub."""

    def reset_by_timespan(self, knoten: Any, zeitspanne: int, beleg: Any) -> None:
        """C++: ResetByTimespan — P5-D Stub."""

    def set_by_timespan_2_state(
        self, knoten: Any, zeitspanne: int, beleg: Any, status: Any
    ) -> None:
        """C++: SetByTimespan2State — P5-D Stub."""

    def set_status_as_subset_of(
        self,
        change_beleg: Any,
        source_beleg: Any,
        status: Any,
        reset_by_timspan: int = -1,
        as_base: bool = True,
    ) -> None:
        """C++: SetStatusAsSubsetOf — P5-D Stub."""

    def are_connections_identical(self, beleg0: Any, beleg1: Any) -> bool:
        """C++: AreConnectionsIdentical — P5-D Stub."""
        return False

    def are_base_connections_identical(self, beleg0: Any, beleg1: Any) -> bool:
        """C++: AreBaseConnectionsIdentical — P5-D Stub."""
        return False


class EPEntReihenfolge(EPEntAufgabeAltExternRessBeleg):
    """Entscheidung über Prozess-Reihenfolge (Priorität).

    C++: `EPEntReihenfolge : $public EPEntAufgabeAltExternRessBeleg`
    (`PDpKnAlternativELogik.odh:553-584`, `.cpp:1573-...`).

    PQueue-Iteration über die Warteschlange einer Belegungs-Ressource
    und Methoden zum Setzen/Erhöhen/Senken der Prozess-Priorität.
    P5-D als Stubs; volle Logik in P5-E/F nicht nötig — die Methoden
    sind im C++ relativ kurz und nutzen `PRessBeleg.GetPQueue*`.
    """

    # ------------------------------------------------------------------
    # PQueue-Iteration (in P5-E/F aktiv)
    # ------------------------------------------------------------------

    def get_p_queue_head_position(self, beleg: Any) -> Any:
        """C++: cpp:1573-1578."""
        if beleg is None:
            return None
        if hasattr(beleg, "get_p_queue_head_position"):
            return beleg.get_p_queue_head_position()
        return None

    def get_p_queue_at(self, beleg: Any, pos: Any) -> Any:
        """C++: cpp:1579-... — P5-D Stub (PRessBeleg-API noch nicht da)."""
        return None

    def get_p_queue_next(self, beleg: Any, pos: Any) -> Any:
        """C++: cpp:1585-... — P5-D Stub."""
        return None

    def is_p_queue_empty(self, beleg: Any, pos: Any) -> bool:
        """C++: cpp:1592-... — P5-D Stub."""
        return True

    # ------------------------------------------------------------------
    # Priority-API
    # ------------------------------------------------------------------

    def set_proz_prior(self, proz: Any, prior: int) -> None:
        """C++: cpp:1605-... — setzt direkt `proz.m_iPrioritaet`."""
        if proz is not None and hasattr(proz, "m_iPrioritaet"):
            proz.m_iPrioritaet = prior

    def set_knoten_proz_prior(self, knoten: Any, prior: int) -> None:
        """C++: cpp:1616-... — P5-D Stub (braucht Knoten-Prozess-Iteration)."""

    def inc_prior_knoten(self, knoten: Any) -> None:
        """C++: cpp:1634-... — P5-D Stub."""

    def inc_prior_proz(self, proz: Any) -> None:
        """C++: cpp:1651-... — inkrementiert `proz.m_iPrioritaet`."""
        if proz is not None and hasattr(proz, "m_iPrioritaet"):
            proz.m_iPrioritaet += 1

    def dec_prior_knoten(self, knoten: Any) -> None:
        """C++: cpp:1662-... — P5-D Stub."""

    def dec_prior_proz(self, proz: Any) -> None:
        """C++: cpp:1679-... — dekrementiert `proz.m_iPrioritaet`."""
        if proz is not None and hasattr(proz, "m_iPrioritaet"):
            proz.m_iPrioritaet -= 1


class EPEntKrzKapazitaetsVeraenderung(EPEntAufgabeAltExternRessBeleg):
    """Entscheidung über kurzfristige Kapazitätsveränderung (Arbeitszeit).

    C++: `EPEntKrzKapazitaetsVeraenderung : $public EPEntAufgabeAltExternRessBeleg`
    (`PDpKnAlternativELogik.odh:610-630`).

    Methoden zur Anpassung von Einsatzdauer + Einsatzende. P5-D als Stubs.
    """

    def inc_einsatz_dauer(self, beleg: Any, zeit: int) -> bool:
        """C++: IncEinatzDauer — P5-D Stub."""
        return False

    def dec_einsatz_dauer(self, beleg: Any, zeit: int) -> bool:
        """C++: DecEinatzDauer — P5-D Stub."""
        return False

    def set_einsatz_end_for_day(self, beleg: Any, zeit: Any) -> None:
        """C++: SetEinatzEndForDay — P5-D Stub. Akzeptiert int oder CTime."""
