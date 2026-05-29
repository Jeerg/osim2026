"""Integration-Tests für den ``kpi_auswertung``-Stream (Phase 01-03).

Zwei Ebenen:

1. **Aggregator-Arithmetik** (Task 1) — die Insights-Klassen aus
   ``insights/classes.py`` sind echte Counter-Hoster (P5-N geschlossen, D-3.2).
   Die Snapshot-Felder folgen SPEC §6.3 und werden gegen handgerechnete Werte
   gepinnt (Parity-Stil wie ``tests/unit/core/test_day_of_sim_parity.py``).
   Die Counter-Updates sind O(1) pro Event (kein Re-Scan, D-3.1/§7.3).

2. **Listener-Lauf** (Task 2) — ``AuswertungListener`` emittiert period-end
   für ALLE 11 ``kind``-Diskriminatoren (D-3.3) je genau einen Frame, mit
   korrektem ``period_num`` (period-only, D-3.4). Self-Registrierung via
   ``register_listener`` (kein ``attach.py``-Edit).

Quelle der KPI-Feldsemantik: SPEC §6.3 (Frame-Beispiele) + §7.3
(incremental-Counter-Strategie). Die C++-Referenz ``ISimulatorViewerAusw*``
liefert dieselbe Feldableitung; die Arithmetik (avg=sum/count,
pct=teil/period*100) ist hier deterministisch gepinnt für den AC-9-Spot-Check.
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
# Task 1 — Aggregator-Arithmetik (insights/classes.py)
# ======================================================================


def test_fertigungsauftrag_aggregator_snapshot_arithmetik() -> None:
    """IFertigungsauftrag-Aggregator: nach 3 abgeschlossenen + 1 verspäteten
    Auftrag stimmen count_* und durchlaufzeit_avg/max/min exakt (D-3.1)."""
    from osim_engine.insights import IFertigungsauftrag

    agg = IFertigungsauftrag()
    # 3 abgeschlossen mit Durchlaufzeiten 3600 / 7200 / 18000 (eine verspätet).
    agg.update_auftrag_start()
    agg.update_auftrag_start()
    agg.update_auftrag_start()
    agg.update_auftrag_start()  # 4. Auftrag bleibt laufend
    agg.update_auftrag_ende(durchlaufzeit=3600, verspaetet=False)
    agg.update_auftrag_ende(durchlaufzeit=7200, verspaetet=False)
    agg.update_auftrag_ende(durchlaufzeit=18000, verspaetet=True)

    snap = agg.snapshot(period_num=0)
    assert snap["count_gesamt"] == 4
    assert snap["count_abgeschlossen"] == 3
    assert snap["count_laufend"] == 1
    assert snap["count_verspaetet"] == 1
    # avg = (3600+7200+18000)/3 = 9600
    assert snap["durchlaufzeit_avg"] == 9600
    assert snap["durchlaufzeit_max"] == 18000
    assert snap["durchlaufzeit_min"] == 3600
    assert snap["period_num"] == 0


def test_auftrag_aggregator_leer_snapshot_keine_division_durch_null() -> None:
    """Ohne abgeschlossene Aufträge ist durchlaufzeit_avg/max/min == 0
    (keine ZeroDivision)."""
    from osim_engine.insights import IFertigungsauftrag

    snap = IFertigungsauftrag().snapshot(period_num=0)
    assert snap["count_gesamt"] == 0
    assert snap["durchlaufzeit_avg"] == 0
    assert snap["durchlaufzeit_max"] == 0
    assert snap["durchlaufzeit_min"] == 0


def test_betriebsmittel_aggregator_auslastung_pct() -> None:
    """IBetriebsmittel: auslastung_pct = bearbeitung/period*100 (SPEC §6.3)."""
    from osim_engine.insights import IBetriebsmittel

    agg = IBetriebsmittel()
    agg.set_period_len(10000)
    agg.update_bearbeitung(7840)   # 78.4 %
    agg.update_ruest(960)          # 9.6 %
    agg.update_stillstand(1200)    # 12.0 %

    snap = agg.snapshot(period_num=0)
    assert snap["auslastung_pct"] == 78.4
    assert snap["ruest_pct"] == 9.6
    assert snap["stillstand_pct"] == 12.0
    assert snap["haupt_nutzungsart"] == "bearbeitung"


def test_betriebsmittel_aggregator_period_len_null_keine_division() -> None:
    from osim_engine.insights import IBetriebsmittel

    snap = IBetriebsmittel().snapshot(period_num=0)
    assert snap["auslastung_pct"] == 0.0


def test_reset_period_setzt_counter_zurueck() -> None:
    """reset_period() setzt die Counter für die neue Periode zurück
    (period-only, D-3.4)."""
    from osim_engine.insights import IBetriebsmittel, IFertigungsauftrag

    fa = IFertigungsauftrag()
    fa.update_auftrag_start()
    fa.update_auftrag_ende(durchlaufzeit=5000, verspaetet=True)
    fa.reset_period()
    s = fa.snapshot(period_num=1)
    assert s["count_gesamt"] == 0
    assert s["count_abgeschlossen"] == 0
    assert s["count_verspaetet"] == 0
    assert s["durchlaufzeit_max"] == 0

    bm = IBetriebsmittel()
    bm.set_period_len(10000)
    bm.update_bearbeitung(5000)
    bm.reset_period()
    sb = bm.snapshot(period_num=1)
    assert sb["auslastung_pct"] == 0.0


def test_simulator_rollup_aggregator_snapshot() -> None:
    """ISimulator (gesamt-Roll-up) liefert eine Snapshot mit kind-tauglichen
    Default-Feldern und period_num."""
    from osim_engine.insights import ISimulator

    snap = ISimulator().snapshot(period_num=2)
    assert snap["period_num"] == 2


def test_jede_klasse_behaelt_basisklasse() -> None:
    """Die 14 Klassen behalten ihre Vererbungssignatur (nur Erweiterung)."""
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
        # je kind genau einmal pro Periode
        assert sorted(kinds) == sorted(ELEVEN_KINDS), (
            f"Periode {period_num}: kinds={sorted(kinds)}"
        )
    # period_num beginnt bei 0 und ist lückenlos aufsteigend
    periods = sorted(by_period)
    assert periods == list(range(len(periods)))
    assert periods[0] == 0


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
    # global monotone seq über ALLE Frames bleibt erhalten
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
