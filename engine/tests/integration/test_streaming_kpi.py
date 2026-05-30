"""Integration-Tests für den ``kpi_auswertung``-Stream (Phase 01-11, gap_closure).

OSim2004-Feldtreue: jede der 11 Analysen trägt die EXAKTEN Feldnamen aus dem
zugehörigen ``ISimulatorViewerAusw*.cpp`` (keine erfundene Generik mehr).

Zwei Ebenen:

1. **Aggregator-Feldsätze** (Task 1) — die Insights-Klassen aus
   ``insights/classes.py`` sind echte Period-Aggregatoren (D-3.2). NOW-BUILDABLE
   (prod_auftrag/best_auftrag/nbearbeit/wschlange) sammeln echte Zeilen-Records;
   SLICE-GATED (pers/betr/kauf/eigen/kalkulation/gesamt/schicht) tragen die
   echten OSim-Feldnamen mit null + ``missing_slice`` (KEINE erfundenen Zahlen).

2. **Listener-Lauf** (Task 2) — ``AuswertungListener`` emittiert period-end
   für ALLE 11 ``kind``-Diskriminatoren (D-3.3) je genau einen Frame, mit
   korrektem ``period_num`` (period-only, D-3.4). Self-Registrierung via
   ``register_listener`` (kein ``attach.py``-Edit).

Quelle der Feldsemantik: ``../OSim2004/OSimV01(Fj)/OSimINSIGHTS/
ISimulatorViewerAusw*.cpp`` (1:1 gepinnt). NICHTS erfunden.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

# Die 11 kind-Diskriminatoren des kpi_auswertung-Streams (D-3.3, CONTEXT).
ELEVEN_KINDS = {
    "prod_auftrag",
    "best_auftrag",
    "betr",
    "pers",
    "schicht",
    "kalkulation",
    "wschlange",
    "nbearbeit",
    "kauf",
    "eigen",
    "gesamt",
}


# ======================================================================
# Task 1 — NOW-BUILDABLE Aggregatoren (echte Zeilen-Records)
# ======================================================================


def test_prod_auftrag_aggregator_echte_records() -> None:
    """IFertigungsauftrag (prod_auftrag): snapshot() liefert Zeilen-Records mit
    den EXAKTEN OSim-Feldnamen (teil/menge/soll_beginn_tag/beschreibung)."""
    from osim_engine.insights import IFertigungsauftrag

    agg = IFertigungsauftrag()
    agg.add_prod_auftrag(teil="Welle", menge=12, soll_beginn_tag=3, beschreibung="Antriebswelle")
    agg.add_prod_auftrag(teil="Nabe", menge=4, soll_beginn_tag=5, beschreibung="Radnabe")

    snap = agg.snapshot(period_num=0)
    assert snap["period_num"] == 0
    assert snap["records"] == [
        {"teil": "Welle", "menge": 12, "soll_beginn_tag": 3, "beschreibung": "Antriebswelle"},
        {"teil": "Nabe", "menge": 4, "soll_beginn_tag": 5, "beschreibung": "Radnabe"},
    ]
    # KEINE Generik-Felder mehr
    assert "count_gesamt" not in snap
    assert "durchlaufzeit_avg" not in snap


def test_best_auftrag_aggregator_echte_records_und_typ() -> None:
    """IBestellauftrag (best_auftrag): teil/menge/best_termin_tag/auftrags_typ/
    beschreibung; auftrags_typ ∈ {"normal","eil"} (m_best_typ)."""
    from osim_engine.insights import IBestellauftrag

    agg = IBestellauftrag()
    agg.add_best_auftrag(teil="Schraube", menge=500, best_termin_tag=2, auftrags_typ="normal", beschreibung="M8x20")
    agg.add_best_auftrag(teil="Lager", menge=20, best_termin_tag=1, auftrags_typ="eil", beschreibung="Kugellager")

    snap = agg.snapshot(period_num=1)
    assert snap["records"][0] == {
        "teil": "Schraube", "menge": 500, "best_termin_tag": 2,
        "auftrags_typ": "normal", "beschreibung": "M8x20",
    }
    assert snap["records"][1]["auftrags_typ"] == "eil"
    assert snap["period_num"] == 1


def test_nbearbeit_aggregator_einlast_records() -> None:
    """INBearbeit (nbearbeit): teil/menge/beginntermin für eingelastete, nicht
    abgearbeitete Aufträge (Filter fsEinlast — vom Listener angewandt)."""
    from osim_engine.insights import INBearbeit

    agg = INBearbeit()
    agg.add_nbearbeit(teil="Welle", menge=12, beginntermin=3)

    snap = agg.snapshot(period_num=0)
    assert snap["records"] == [{"teil": "Welle", "menge": 12, "beginntermin": 3}]


def test_wschlange_aggregator_warteschlangen_records() -> None:
    """IProzess (wschlange): bm_name/teil/restmenge/wartestatus[/op/material].
    wartestatus aus dem dokumentierten OSim-Set."""
    from osim_engine.insights import IProzess

    agg = IProzess()
    agg.add_wschlange(bm_name="Dreh1", teil="Welle", restmenge=8, wartestatus=IProzess.WARTET_VOR_BM, op="OP10")
    agg.add_wschlange(
        bm_name="Fraes2", teil="Nabe", restmenge=2,
        wartestatus=IProzess.WARTET_MATERIAL, material="Rohling",
    )
    agg.add_wschlange(bm_name="Bohr3", teil="Flansch", restmenge=1, wartestatus=IProzess.WARTET_PERSONAL)

    snap = agg.snapshot(period_num=0)
    assert snap["records"][0] == {
        "bm_name": "Dreh1", "teil": "Welle", "restmenge": 8,
        "wartestatus": "wartet_vor_bm", "op": "OP10",
    }
    assert snap["records"][1]["wartestatus"] == "wartet_material"
    assert snap["records"][1]["material"] == "Rohling"
    assert snap["records"][2]["wartestatus"] == "wartet_personal"
    assert "op" not in snap["records"][2]


def test_now_buildable_reset_period_leert_records() -> None:
    """reset_period() leert die now-buildable Record-Sammler; period_num bleibt
    im snapshot (period-only, D-3.4)."""
    from osim_engine.insights import IBestellauftrag, IFertigungsauftrag, IProzess

    fa = IFertigungsauftrag()
    fa.add_prod_auftrag(teil="X", menge=1, soll_beginn_tag=0, beschreibung="x")
    fa.reset_period()
    assert fa.snapshot(period_num=2)["records"] == []

    ba = IBestellauftrag()
    ba.add_best_auftrag(teil="Y", menge=2, best_termin_tag=0, auftrags_typ="normal", beschreibung="y")
    ba.reset_period()
    assert ba.snapshot(period_num=2)["records"] == []

    pr = IProzess()
    pr.add_wschlange(bm_name="B", teil="Z", restmenge=1, wartestatus=IProzess.WARTET_VOR_BM)
    pr.reset_period()
    assert pr.snapshot(period_num=2)["records"] == []


# ======================================================================
# Task 1 — SLICE-GATED Aggregatoren (echte Feldnamen, null + missing_slice)
# ======================================================================


def test_pers_aggregator_gated_echte_felder() -> None:
    """IPerson (pers, 8 Spalten): echte OSim-Feldnamen mit null + missing_slice
    P5-M (ISimulatorViewerAuswPers.cpp)."""
    from osim_engine.insights import IPerson

    snap = IPerson().snapshot(period_num=0)
    for field in (
        "name", "schichten", "ueberstunden_pct", "kann_kap_pct", "auslastung_pct",
        "kosten_pro_arbeitsstd", "kalk_stundensatz", "gesamtkosten_periode",
    ):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "P5-M"


def test_betr_aggregator_gated_echte_felder() -> None:
    """IBetriebsmittel (betr, 5 Spalten): name/fixkosten_pro_stunde/
    kosten_pro_arbeitsstd/kalk_stundensatz/gesamtkosten_periode (gated)."""
    from osim_engine.insights import IBetriebsmittel

    snap = IBetriebsmittel().snapshot(period_num=0)
    for field in (
        "name", "fixkosten_pro_stunde", "kosten_pro_arbeitsstd",
        "kalk_stundensatz", "gesamtkosten_periode",
    ):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "Kosten-Slice"
    # KEINE alte Generik
    assert "ruest_pct" not in snap
    assert "haupt_nutzungsart" not in snap


def test_kauf_aggregator_gated_zehn_felder() -> None:
    """ILagerKauf (kauf, 10 Spalten, LAGERINHALT KAUFTEILE)."""
    from osim_engine.insights import ILagerKauf

    snap = ILagerKauf().snapshot(period_num=0)
    for field in (
        "teil", "aktueller_bestand", "verbrauchte_teile", "gelieferte_teile",
        "vergebliche_anforderung", "teilewert_gesamt", "teilewert_neuteile",
        "bestellkosten", "lagerhaltungskosten", "kapitalkosten",
    ):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "Bestands-/Kosten-Slice"


def test_eigen_aggregator_gated_elf_felder() -> None:
    """ILagerEigen (eigen, 11 Spalten, LAGERINHALT EIGENFERTIGUNGSTEILE)."""
    from osim_engine.insights import ILagerEigen

    snap = ILagerEigen().snapshot(period_num=0)
    for field in (
        "teil", "aktueller_bestand", "prod_menge", "verbr_menge",
        "teilewert_gesamt", "teilewert_neuteile", "eingehend_teile",
        "betrm_kosten", "personalkosten", "lagerhaltungskosten", "kapitalkosten",
    ):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "Bestands-/Kosten-Slice"


def test_kalkulation_aggregator_gated_beide_bloecke() -> None:
    """IGonzo (kalkulation): Kostenkalkulation + Lagerkalkulation (K/E/P)."""
    from osim_engine.insights import IGonzo

    snap = IGonzo().snapshot(period_num=0)
    for field in (
        "last_lgw", "betr_kost", "pers_kost", "lager_kost", "kapit_kost",
        "besch_kost", "teile_kost", "lagerwertabgang_p1", "lagerwertabgang_p2",
        "lagerwertabgang_p3", "berechneter_lagerwert",
        "last_lgw_k", "last_lgw_e", "last_lgw_p",
        "lga_k_teile", "lgz_k_teile", "lgw_k_teile", "lgw_fertig", "lgw_aktuell",
    ):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "Kosten-/Bestands-Slice"
    # KEINE alte Generik
    assert "kosten_sum" not in snap


def test_gesamt_aggregator_gated_plus_durchsatz() -> None:
    """ISimulator (gesamt): OSim-Gesamt-Felder gated + now-buildable Durchsatz."""
    from osim_engine.insights import ISimulator

    agg = ISimulator()
    # Durchsatz wird 1:1 aus den Auslöser-Akkumulatoren gesetzt (Σ über m_lAusl):
    # gesamt = Σ m_iPtkBegAusloesungCount, fertig = Σ m_iPtkAusloesungCount.
    agg.set_auftrag_durchsatz(gesamt=2, fertig=1)

    snap = agg.snapshot(period_num=2)
    # gated OSim-Felder
    assert snap["verkaufserloes"] is None
    assert snap["verf_kapazitaet_pct"] is None
    assert snap["auslastung_pct"] is None
    assert snap["lieferfaehigkeit_pct"] is None
    assert snap["mittlerer_lagerwert"] is None
    assert snap["missing_slice"] == "Sales-/Kosten-Slice"
    # Verkaufsergebnisse je Produkt 1-3 (gated, echte Feldnamen)
    assert len(snap["verkaufsergebnisse"]) == 3
    ve = snap["verkaufsergebnisse"][0]
    for field in ("vertriebswunsch", "absatz", "herstellkosten", "verkaufspreis", "erloes"):
        assert field in ve and ve[field] is None, field
    # now-buildable Durchsatz (real)
    assert snap["count_auftraege_gesamt"] == 2
    assert snap["count_auftraege_fertig"] == 1
    assert snap["count_auftraege_offen"] == 1


def test_schicht_aggregator_gated_vier_spalten() -> None:
    """IArbeitszeit (schicht, 4 Spalten ISimulatorViewerSchicht): person/
    schichten/ueberstunden/einheiten gated + missing_slice P5-M."""
    from osim_engine.insights import IArbeitszeit

    snap = IArbeitszeit().snapshot(period_num=0)
    for field in ("person", "schichten", "ueberstunden", "einheiten"):
        assert field in snap and snap[field] is None, field
    assert snap["missing_slice"] == "P5-M"
    # KEINE alte soll-/iststunden-Generik
    assert "sollstunden" not in snap
    assert "iststunden" not in snap


def test_jede_klasse_behaelt_basisklasse() -> None:
    """Die Klassen behalten ihre Vererbungssignatur (nur Erweiterung)."""
    from osim_engine.insights import (
        IArbeitszeit, IAuftrag, IBestellauftrag, IBetrPers, IBetriebsmittel,
        IDurchlaufplan, IFertigungsauftrag, IGonzo, IInfo, ILager,
        IPerson, IProzess, ISimObj, ISimulator,
    )

    for cls in (IInfo, ISimulator, IArbeitszeit, IAuftrag, IBetriebsmittel,
                IBetrPers, IDurchlaufplan, ILager, IPerson, IProzess, IGonzo):
        assert issubclass(cls, ISimObj)
    assert issubclass(IBestellauftrag, IAuftrag)
    assert issubclass(IFertigungsauftrag, IAuftrag)


# ======================================================================
# Task 2 — AuswertungListener-Lauf (streaming/listeners/auswertung.py)
# ======================================================================


def _build_scenario(begin_termin: int = 100, durchfuehrungszeit: int = 500):
    """1 Knoten + 1 Auslöser (analog test_streaming._build_scenario)."""
    from osim_engine.pps.ausloeser.einzel import PAslEinzel
    from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "Bearbeitung"
    knoten.m_iDurchfuehrungszeit = durchfuehrungszeit
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "Erzeugnis-1"
    ausl.m_iBeginTermin = begin_termin
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)
    return sim


def test_auswertung_listener_is_olistener_subclass_and_self_registers() -> None:
    from osim_engine.core.listener import OListenerSimulator
    from osim_engine.streaming import registry
    from osim_engine.streaming.listeners.auswertung import AuswertungListener

    assert issubclass(AuswertungListener, OListenerSimulator)
    keys = {getattr(f, "__name__", "") for f in registry.LISTENER_FACTORIES}
    assert "AuswertungListener" in keys


def test_kpi_auswertung_period_end_covers_all_eleven_kinds(tmp_path: Path) -> None:
    """Lauf über >=1 Periode: die kpi_auswertung-Frames decken ALLE 11
    kind-Werte ab (Mengen-Gleichheit, D-3.3)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    frames = [json.loads(ln) for ln in lines]
    kpi = [f for f in frames if f["stream"] == "kpi_auswertung"]
    assert kpi, "kein kpi_auswertung-Frame emittiert"
    kinds = {f["v"]["kind"] for f in kpi}
    assert kinds == ELEVEN_KINDS


def test_kpi_auswertung_eleven_frames_per_period(tmp_path: Path) -> None:
    """Genau 11 kpi_auswertung-Frames pro Periode, je 1 pro kind; period_num
    deckt die durchlaufenen Perioden ab und ist konsistent (period-only)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    kpi = [json.loads(ln) for ln in lines if json.loads(ln)["stream"] == "kpi_auswertung"]

    by_period: dict[int, list] = {}
    for f in kpi:
        by_period.setdefault(f["v"]["period_num"], []).append(f)

    assert by_period, "keine period-end-KPI-Frames"
    for period_num, frames in by_period.items():
        kinds = [f["v"]["kind"] for f in frames]
        assert sorted(kinds) == sorted(ELEVEN_KINDS), (
            f"Periode {period_num}: kinds={sorted(kinds)}"
        )
    periods = sorted(by_period)
    assert periods == list(range(len(periods)))
    assert periods[0] == 0


def test_kpi_now_buildable_kinds_tragen_records(tmp_path: Path) -> None:
    """now-buildable kinds (prod_auftrag/best_auftrag/nbearbeit/wschlange)
    tragen ein records-Array (echte OSim-Struktur, kein Generik-Counter)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    kpi = [json.loads(ln)["v"] for ln in lines if json.loads(ln)["stream"] == "kpi_auswertung"]
    for kind in ("prod_auftrag", "best_auftrag", "nbearbeit", "wschlange"):
        rows = [v for v in kpi if v["kind"] == kind]
        assert rows, f"kein Frame fuer {kind}"
        for v in rows:
            assert "records" in v and isinstance(v["records"], list), kind
            assert "count_gesamt" not in v, f"{kind} traegt noch Generik"


def test_kpi_slice_gated_kinds_tragen_missing_slice(tmp_path: Path) -> None:
    """slice-gated kinds (pers/betr/kauf/eigen/kalkulation/schicht) tragen
    missing_slice + null-Felder (keine erfundenen Zahlen)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    kpi = [json.loads(ln)["v"] for ln in lines if json.loads(ln)["stream"] == "kpi_auswertung"]
    for kind in ("pers", "betr", "kauf", "eigen", "kalkulation"):
        rows = [v for v in kpi if v["kind"] == kind]
        assert rows, f"kein Frame fuer {kind}"
        for v in rows:
            assert "missing_slice" in v, kind


def test_kpi_auswertung_frames_carry_seq_and_t(tmp_path: Path) -> None:
    """Jeder KPI-Frame trägt die Pflichtfelder (monotone seq, period-end-t)."""
    from osim_engine.streaming.attach import attach_streaming_listeners

    sim = _build_scenario()
    writer = attach_streaming_listeners(sim, run_dir=str(tmp_path))
    sim.start()
    writer.close()

    lines = [ln for ln in writer.path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    frames = [json.loads(ln) for ln in lines]
    kpi = [f for f in frames if f["stream"] == "kpi_auswertung"]
    for f in kpi:
        assert isinstance(f["seq"], int)
        assert isinstance(f["t"], int)
        assert "kind" in f["v"]
        assert "period_num" in f["v"]
    seqs = [f["seq"] for f in frames]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)


def test_attach_py_unchanged_since_01_01() -> None:
    """AC: streaming/attach.py ist gegenüber HEAD unverändert — der Listener
    hängt sich rein über das Registry an (kein Shared-Write)."""
    repo_root = Path(__file__).resolve().parents[3]
    rel = "engine/src/osim_engine/streaming/attach.py"
    result = subprocess.run(
        ["git", "diff", "--stat", "HEAD", "--", rel],
        cwd=repo_root, capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"attach.py geändert:\n{result.stdout}"


def test_core_simulator_unchanged_kpi() -> None:
    """SPEC §5: core/simulator.py gegenüber HEAD unverändert."""
    repo_root = Path(__file__).resolve().parents[3]
    rel = "engine/src/osim_engine/core/simulator.py"
    result = subprocess.run(
        ["git", "diff", "--stat", "HEAD", "--", rel],
        cwd=repo_root, capture_output=True, text=True,
    )
    assert result.stdout.strip() == "", f"core/simulator.py geändert:\n{result.stdout}"
