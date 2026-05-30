"""OSimINSIGHTS-Klassen — OSim2004-treue Period-Aggregatoren (Slice P5-N, D-3.2).

Provenienz: `OSimINSIGHTS/I*.{odh,cpp}` und die `ISimulatorViewerAusw*`-Familie
(11 Reporting-Sichten, SPEC §6.3 / D-3.3).

GAP-CLOSURE 01-11 — **OSim2004-Feldtreue statt Generik**:
    Die Phase-01-03-Implementierung hat generische Felder ERFUNDEN
    (count_gesamt/durchlaufzeit_avg/auslastung_pct für alle kinds). Das war
    nicht OSim2004. Dieser Stand pinnt jede Analyse 1:1 gegen das zugehörige
    `ISimulatorViewerAusw*.cpp` (echte Spalten/Feldnamen, echte deutsche
    Semantik) — die User-Hartregel: NICHTS erfinden.

Zwei Klassen von Analysen (ehrlicher Slice-Schnitt):

1. **NOW-BUILDABLE** (Daten existieren im headless-Port — Auftrags-/Warte-
   schlangen-Listen): prod_auftrag, best_auftrag, nbearbeit, wschlange.
   Diese Aggregatoren sammeln pro Periode **echte Zeilen-Records** mit den
   exakten OSim-Feldnamen über ``add_*``-Methoden; ``snapshot()`` liefert
   ``{period_num, records: [...]}``.

2. **SLICE-GATED** (brauchen Kosten-/Bestands-/Arbeitszeit-/Sales-Modelle, die
   heute Skelett sind — P5-D/P5-M + Kosten-/Bestands-Slice): pers, betr, kauf,
   eigen, kalkulation, gesamt, schicht. Diese Aggregatoren tragen die **echten
   OSim-Feldnamen mit Wert null** plus einen ``missing_slice``-Marker je Feld-
   Gruppe. KEINE erfundenen Platzhalter-Zahlen (Unterschied zu 01-03: gated =
   null + Marker, NICHT 0.0 als Schein-Wert).

Die Klassen-Identität/Vererbung bleibt unverändert (``test_p5n_insights.py``
und OTX-Loader-Konsumenten brechen nicht). ``snapshot(period_num)`` /
``reset_period()`` bleiben das Aggregator-Protokoll (D-3.1/D-3.4 — period-only,
keine Sliding-Windows in Phase 01).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class ISimObj(PSimObj):
    """C++: ISimObj — OSimINSIGHTS/ISimObj.{odh,cpp}.

    Aggregator-Basis: stellt `snapshot(period_num)` / `reset_period()` als
    minimalen Default bereit, sodass jede Reporting-Sicht period-end einen
    kind-tauglichen Frame liefern kann.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)

    # ------------------------------------------------------------------
    # Aggregator-Protokoll (D-3.1/D-3.4) — Default: leerer Snapshot.
    # ------------------------------------------------------------------

    def snapshot(self, period_num: int) -> dict:
        """Minimaler period-end-Snapshot (nur `period_num`). Subklassen
        erweitern um ihre OSim-Feldsätze."""
        return {"period_num": period_num}

    def reset_period(self) -> None:
        """Counter/Record-Sammler für die neue Periode zurücksetzen
        (period-only, D-3.4). Default no-op (Subklassen überschreiben)."""
        return None


class IInfo(ISimObj):
    """C++: IInfo — Reporting-Info-Container (m_fauftr/m_bestell/Kosten je Periode)."""


class IAuftrag(ISimObj):
    """C++: IAuftrag — gemeinsame Auftrags-Reporting-Basis (Identität erhalten).

    Hinweis: prod_auftrag/best_auftrag sind in OSim eigenständige Sichten mit
    je eigenem Feldsatz (siehe IFertigungsauftrag/IBestellauftrag); IAuftrag
    bleibt als Basis-Identität bestehen (test_p5n_insights / OTX-Loader).
    """


# ======================================================================
# NOW-BUILDABLE — echte Zeilen-Records aus dem Engine-State
# ======================================================================


class IFertigungsauftrag(IAuftrag):
    """C++: IFertigungsauftrag — ``prod_auftrag``-Sicht.

    Quelle: ``ISimulatorViewerAuswProdAuftr.cpp``. Spalten 1:1:
        Teil · Menge · Soll-Beginntermin (Tag) · Beschreibung
    (m_durch->m_name, m_auftr_meng, m_beg_termin, leaf-Tochter-Lager m_beschr).
    Leere Einträge (m_durch==NULL) werden übersprungen.

    NOW-BUILDABLE: sammelt pro Periode echte Zeilen-Records. Doppel-Nutzung als
    ``nbearbeit``-Quelle (siehe ``add_nbearbeit`` / Filter fsEinlast).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.records: list[dict] = []

    def add_prod_auftrag(
        self, teil: str, menge: int, soll_beginn_tag: int, beschreibung: str
    ) -> None:
        """Eine prod_auftrag-Zeile anhängen (m_durch->m_name, m_auftr_meng,
        m_beg_termin, Tochter-Lager m_beschr)."""
        self.records.append(
            {
                "teil": teil,
                "menge": menge,
                "soll_beginn_tag": soll_beginn_tag,
                "beschreibung": beschreibung,
            }
        )

    def snapshot(self, period_num: int) -> dict:
        return {"period_num": period_num, "records": list(self.records)}

    def reset_period(self) -> None:
        self.records = []


class IBestellauftrag(IAuftrag):
    """C++: IBestellauftrag — ``best_auftrag``-Sicht.

    Quelle: ``ISimulatorViewerAuswBestAuftr.cpp``. Spalten 1:1:
        Teil · Menge · Bestelltermin (Tag) · Auftragstyp · Beschreibung
    (m_lager->m_name, m_best_menge, m_best_termin, m_best_typ [btNormal=>
    "normal", sonst "eil"], m_lager->m_beschr). Leere (m_lager==NULL) skip.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.records: list[dict] = []

    def add_best_auftrag(
        self,
        teil: str,
        menge: int,
        best_termin_tag: int,
        auftrags_typ: str,
        beschreibung: str,
    ) -> None:
        """Eine best_auftrag-Zeile anhängen. auftrags_typ ∈ {"normal","eil"}."""
        self.records.append(
            {
                "teil": teil,
                "menge": menge,
                "best_termin_tag": best_termin_tag,
                "auftrags_typ": auftrags_typ,
                "beschreibung": beschreibung,
            }
        )

    def snapshot(self, period_num: int) -> dict:
        return {"period_num": period_num, "records": list(self.records)}

    def reset_period(self) -> None:
        self.records = []


class INBearbeit(IFertigungsauftrag):
    """``nbearbeit``-Sicht — NICHT ABGEARBEITETE PRODUKTIONSAUFTRÄGE.

    Quelle: ``ISimulatorViewerAuswNBearbeit.cpp``. Spalten 1:1:
        zu produz. Teil · Menge · Beginntermin
    (m_durch->m_name, m_auftr_meng, m_beg_termin), Filter: nur Aufträge mit
    Status fsEinlast (eingelastet, aber nicht abgearbeitet).
    """

    def add_nbearbeit(self, teil: str, menge: int, beginntermin: int) -> None:
        """Eine nbearbeit-Zeile anhängen (nur fsEinlast-Aufträge)."""
        self.records.append(
            {"teil": teil, "menge": menge, "beginntermin": beginntermin}
        )


class IProzess(ISimObj):
    """C++: IProzess — ``wschlange``-Sicht (Warteschlangen je Betriebsmittel).

    Quelle: ``ISimulatorViewerAuswWSchlange.cpp``. Spalten 1:1:
        Betriebsmittel · zu produz. Teil · Restmenge · aktueller Status [· OP]
    (m_betr->m_name, m_auftr->m_fauftr->m_durch->m_name, m_rest_meng,
    m_wstatus/m_pattr, optional m_dnode->m_name).
    wartestatus ∈ {"wartet_vor_bm","unterbrochen","wartet_material",
    "wartet_personal"}; bei Material zusätzlich der Material-Name.
    """

    # wartestatus-Vokabular (1:1 gegen die OSim-Statustexte gemappt).
    WARTET_VOR_BM = "wartet_vor_bm"
    UNTERBROCHEN = "unterbrochen"
    WARTET_MATERIAL = "wartet_material"
    WARTET_PERSONAL = "wartet_personal"

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.records: list[dict] = []

    def add_wschlange(
        self,
        bm_name: str,
        teil: str,
        restmenge: int | None,
        wartestatus: str,
        op: str | None = None,
        material: str | None = None,
    ) -> None:
        """Eine Warteschlangen-Zeile anhängen. ``op`` = Durchlaufplan-Knoten
        (m_dnode->m_name), ``material`` = wartendes Material (bei
        wartet_material, m_wlink->m_name)."""
        rec: dict = {
            "bm_name": bm_name,
            "teil": teil,
            "restmenge": restmenge,
            "wartestatus": wartestatus,
        }
        if op is not None:
            rec["op"] = op
        if material is not None:
            rec["material"] = material
        self.records.append(rec)

    def snapshot(self, period_num: int) -> dict:
        return {"period_num": period_num, "records": list(self.records)}

    def reset_period(self) -> None:
        self.records = []


# ======================================================================
# SLICE-GATED — echte OSim-Feldnamen, null + missing_slice (keine Erfindung)
# ======================================================================


class IPerson(ISimObj):
    """C++: IPerson — ``pers``-Sicht (8 Spalten).

    Quelle: ``ISimulatorViewerAuswPers.cpp``. Spalten 1:1:
        Personal · Anzahl Schichten · Überstunden · verfügbare Kapazität ·
        Auslastung · Kosten pro Arbeitsstd. · kalkulator. Stundensatz ·
        Gesamtkosten der Periode
    (m_name, m_schichten, m_ueberst, m_kann_kap, m_auslastung, m_fpk,
    m_kalk_stusatz, m_gesamt_kost).

    SLICE-GATED: Arbeitszeit-Modell (P5-M) + Kosten-Slice heute Skelett →
    echte Feldnamen mit null + missing_slice="P5-M".
    """

    MISSING_SLICE = "P5-M"

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "name": None,
            "schichten": None,
            "ueberstunden_pct": None,
            "kann_kap_pct": None,
            "auslastung_pct": None,
            "kosten_pro_arbeitsstd": None,
            "kalk_stundensatz": None,
            "gesamtkosten_periode": None,
            "missing_slice": self.MISSING_SLICE,
        }


class IBetriebsmittel(ISimObj):
    """C++: IBetriebsmittel — ``betr``-Sicht (5 Spalten).

    Quelle: ``ISimulatorViewerAuswBetr.cpp``. Spalten 1:1:
        Betriebsmittel · Fixkosten pro Stunde · Kosten pro Arbeitsstd. ·
        kalkulator. Stundensatz · Gesamtkosten der Periode
    (m_name, m_fbk, m_vbk, m_kalk_stusatz, m_gesamt_kost).

    SLICE-GATED: Kosten-Slice heute Skelett → echte Feldnamen mit null +
    missing_slice="Kosten-Slice".
    """

    MISSING_SLICE = "Kosten-Slice"

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "name": None,
            "fixkosten_pro_stunde": None,
            "kosten_pro_arbeitsstd": None,
            "kalk_stundensatz": None,
            "gesamtkosten_periode": None,
            "missing_slice": self.MISSING_SLICE,
        }


class ILager(ISimObj):
    """C++: ILager — Lager-Reporting (``kauf``- und ``eigen``-Sicht).

    kauf — ``ISimulatorViewerAuswKauf.cpp`` (10 Spalten, LAGERINHALT
    (KAUFTEILE), Filter ltKauf): Teil · aktueller Bestand · verbrauchte Teile ·
    gelieferte Teile · vergebliche Anforderung · Teilewert gesamt · Teilewert
    Neuteile · Bestellkosten · Lagerhaltungskosten · Kapitalkosten
    (m_name, m_bestand_meng, m_num_abbuch, m_num_zubuch, m_num_vergeb, m_fmk,
    m_wert_teil, m_kost_besch, m_kost_lager, m_kost_zins).

    eigen — ``ISimulatorViewerAuswEigen.cpp`` (11 Spalten, LAGERINHALT
    (EIGENFERTIGUNGSTEILE), Filter ltEigen|ltProdukt): Teil · aktueller Bestand
    · prod. Menge · verbr. Menge · Teilewert gesamt · Teilewert Neuteile ·
    eingehend Teile · Betr.M.-kosten · Personalkosten · Lagerhaltungskosten ·
    Kapitalkosten (m_name, m_bestand_meng, m_num_zubuch, m_num_abbuch, m_fmk,
    m_wert_teil, m_kost_eingteil, m_kost_bm, m_kost_pers, m_kost_lager,
    m_kost_zins).

    SLICE-GATED: Bestands-/Kosten-Slice heute Skelett → echte Feldnamen mit
    null + missing_slice="Bestands-/Kosten-Slice".
    """

    MISSING_SLICE = "Bestands-/Kosten-Slice"

    def snapshot_kauf(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "teil": None,
            "aktueller_bestand": None,
            "verbrauchte_teile": None,
            "gelieferte_teile": None,
            "vergebliche_anforderung": None,
            "teilewert_gesamt": None,
            "teilewert_neuteile": None,
            "bestellkosten": None,
            "lagerhaltungskosten": None,
            "kapitalkosten": None,
            "missing_slice": self.MISSING_SLICE,
        }

    def snapshot_eigen(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "teil": None,
            "aktueller_bestand": None,
            "prod_menge": None,
            "verbr_menge": None,
            "teilewert_gesamt": None,
            "teilewert_neuteile": None,
            "eingehend_teile": None,
            "betrm_kosten": None,
            "personalkosten": None,
            "lagerhaltungskosten": None,
            "kapitalkosten": None,
            "missing_slice": self.MISSING_SLICE,
        }


class ILagerKauf(ILager):
    """``kauf``-Subsicht — ILager mit ltKauf-Filter (10 Spalten)."""

    def snapshot(self, period_num: int) -> dict:
        return self.snapshot_kauf(period_num)


class ILagerEigen(ILager):
    """``eigen``-Subsicht — ILager mit ltEigen|ltProdukt-Filter (11 Spalten)."""

    def snapshot(self, period_num: int) -> dict:
        return self.snapshot_eigen(period_num)


class IGonzo(ISimObj):
    """C++: IGonzo — ``kalkulation``-Sicht.

    Quelle: ``ISimulatorViewerAuswKalkulation.cpp``. Zwei Blöcke 1:1:

    Kostenkalkulation (KOSTENKALKULATION): letzter Lagerwert (last_lgw) +
    Betriebsmittelkosten (betr_kost) + Personalkosten (pers_kost) +
    Lagerhaltungskosten (lager_kost) + Kapitalbindungskosten (kapit_kost) +
    Beschaffungskosten (besch_kost) + Zukaufteilekosten (teile_kost) −
    Lagerwertabgang P1/P2/P3 (hst_kosten_i*vsale_i) = berechneter Lagerwert
    (lgw_calc).

    Lagerkalkulation (LAGERKALKULATION, K/E/P-Teile): je Teilegruppe letzter
    Lagerwert (last_lgw_{k,e,p}), abgegangener Lagerwert (lga_{k,e,p}_teile),
    zugegangener Lagerwert (lgz_{k,e,p}_teile), aktueller Lagerwert
    (lgw_{k,e,p}_teile); Materialwert in der Fertigung (lgw_fertig) + aktueller
    Lagerwert gesamt (lgw_aktuell).

    SLICE-GATED: Kosten-/Bestands-Slice heute Skelett → echte Feldnamen mit
    null + missing_slice="Kosten-/Bestands-Slice".
    """

    MISSING_SLICE = "Kosten-/Bestands-Slice"

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            # Kostenkalkulation
            "last_lgw": None,
            "betr_kost": None,
            "pers_kost": None,
            "lager_kost": None,
            "kapit_kost": None,
            "besch_kost": None,
            "teile_kost": None,
            "lagerwertabgang_p1": None,
            "lagerwertabgang_p2": None,
            "lagerwertabgang_p3": None,
            "berechneter_lagerwert": None,
            # Lagerkalkulation (K/E/P)
            "last_lgw_k": None,
            "last_lgw_e": None,
            "last_lgw_p": None,
            "lga_k_teile": None,
            "lga_e_teile": None,
            "lga_p_teile": None,
            "lgz_k_teile": None,
            "lgz_e_teile": None,
            "lgz_p_teile": None,
            "lgw_k_teile": None,
            "lgw_e_teile": None,
            "lgw_p_teile": None,
            "lgw_fertig": None,
            "lgw_aktuell": None,
            "missing_slice": self.MISSING_SLICE,
        }


class ISimulator(ISimObj):
    """C++: ISimulator — ``gesamt``-Sicht (GESAMTERGEBNIS-Roll-up).

    Quelle: ``ISimulatorViewerAuswGesamt.cpp``. Drei Blöcke 1:1:

    Gesamtergebnis: Verkaufserlös (m_verk_erloes).

    Verkaufsergebnisse je Produkt 1-3: Vertriebswunsch (m_vwunsch),
    Absatz (m_vsale), Herstellkosten (m_hst_kosten), Verkaufspreis (m_vpreis),
    Erlös (abgeleitet (m_vpreis-m_hst_kosten)*m_vsale).

    Kennzahlen: Verfügbare Kapazität (m_kann_kap), Auslastung (m_auslastung),
    Lieferfähigkeit (m_lieferfgk), Mittl. Herstellkosten ((hst1+hst2+hst3)/3),
    Mittlerer Lagerwert (m_lgw_mittel).

    SLICE-GATED: Sales-/Kosten-Slice heute Skelett → die OSim-Gesamt-Felder
    tragen null + missing_slice="Sales-/Kosten-Slice". Die Auftrags-Durchsatz-
    Counter (count_auftraege_*) sind dagegen now-buildable und werden 1:1 aus den
    echten OSim-Auslöser-Akkumulatoren gefüllt (PAusloeser m_iPtkBegAusloesungCount
    / m_iPtkAusloesungCount, period-scoped via on_rec_init) — vom AuswertungListener
    am Perioden-Ende über ``set_auftrag_durchsatz`` gesetzt.
    """

    MISSING_SLICE = "Sales-/Kosten-Slice"

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Durchsatz aus den Auslöser-Akkumulatoren (Σ über sim.m_lAusl):
        #   gesamt = Σ m_iPtkBegAusloesungCount (begonnene Auslösungen)
        #   fertig = Σ m_iPtkAusloesungCount    (abgeschlossene Auslösungen)
        # offen  = gesamt − fertig (noch laufende). Period-scoped.
        self.count_auftraege_gesamt: int = 0
        self.count_auftraege_fertig: int = 0

    def set_auftrag_durchsatz(self, gesamt: int, fertig: int) -> None:
        """Setzt den Durchsatz 1:1 aus den OSim-Auslöser-Akkumulatoren (Σ)."""
        self.count_auftraege_gesamt = gesamt
        self.count_auftraege_fertig = fertig

    def snapshot(self, period_num: int) -> dict:
        offen = self.count_auftraege_gesamt - self.count_auftraege_fertig
        return {
            "period_num": period_num,
            # OSim-Gesamtergebnis (gated)
            "verkaufserloes": None,
            # OSim-Verkaufsergebnisse je Produkt 1-3 (gated)
            "verkaufsergebnisse": [
                {
                    "produkt": p,
                    "vertriebswunsch": None,
                    "absatz": None,
                    "herstellkosten": None,
                    "verkaufspreis": None,
                    "erloes": None,
                }
                for p in (1, 2, 3)
            ],
            # OSim-Kennzahlen (gated)
            "verf_kapazitaet_pct": None,
            "auslastung_pct": None,
            "lieferfaehigkeit_pct": None,
            "mittl_herstellkosten": None,
            "mittlerer_lagerwert": None,
            "missing_slice": self.MISSING_SLICE,
            # Zusatz: now-buildable Durchsatz (real, kein OSim-Gesamt-Feld)
            "count_auftraege_gesamt": self.count_auftraege_gesamt,
            "count_auftraege_fertig": self.count_auftraege_fertig,
            "count_auftraege_offen": offen,
        }

    def reset_period(self) -> None:
        self.count_auftraege_gesamt = 0
        self.count_auftraege_fertig = 0


class IArbeitszeit(ISimObj):
    """C++: IArbeitszeit / ISimulatorViewerSchicht — ``schicht``-Sicht
    (gantt_schicht-Stream, 4 Spalten).

    Quelle: ``ISimulatorViewerSchicht.cpp`` (FillList): Person · Schichten ·
    Überstunden · Einheiten (m_oPerson->m_name, m_schichten, m_ueberst,
    m_einheiten). ERSETZT die alten soll-/iststunden-Felder.

    SLICE-GATED: Arbeitszeit-Modell (P5-M) heute Skelett → echte Feldnamen mit
    null + missing_slice="P5-M".
    """

    MISSING_SLICE = "P5-M"

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "person": None,
            "schichten": None,
            "ueberstunden": None,
            "einheiten": None,
            "missing_slice": self.MISSING_SLICE,
        }


# ----------------------------------------------------------------------
# Übrige Reporting-Datenklassen (Identität erhalten, kein eigener Aggregator)
# ----------------------------------------------------------------------


class IBetrPers(ISimObj):
    """C++: IBetrPers — Betrieb-Personal-Reporting."""


class IDurchlaufplan(ISimObj):
    """C++: IDurchlaufplan — Plan-Reporting."""
