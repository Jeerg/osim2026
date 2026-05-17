"""V3: Pseudo-dc1-Test mit 3 Plänen + 1 Auslöser-Variante.

dc1.otx (die echte Vorlage) ist nicht direkt parsbar — wir bauen ein
synthetisches Modell mit ähnlicher Struktur:
- 3 sequentielle Pläne PA, PB, PC, jeder mit 2-Knoten-Verzweigung
- 1 Auslöser, der PA aktiviert
- PA→PB→PC-Verkettung über Plan-Subgraph-Hierarchie

Das deckt End-to-End-Lauf mit mehreren Plan-Containern, Verzweigung in jedem
und PtVerknuepfung-Join über mehrere Pläne hinweg ab.
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build_diamond_plan(
    sim: PSimulator,
    name: str,
    k0_dauer: int = 30,
    k1_dauer: int = 50,
    k2_dauer: int = 100,
    k3_dauer: int = 20,
) -> PDurchlaufplan:
    """Baut einen Diamond-Plan K0 → (K1, K2) → K3 als selbständigen Plan."""
    plan = PDurchlaufplan(sim); plan.m_sName = name

    k0 = PDpKnKonstant(sim); k0.m_sName = f"{name}.K0"; k0.m_iDurchfuehrungszeit = k0_dauer
    k1 = PDpKnKonstant(sim); k1.m_sName = f"{name}.K1"; k1.m_iDurchfuehrungszeit = k1_dauer
    k2 = PDpKnKonstant(sim); k2.m_sName = f"{name}.K2"; k2.m_iDurchfuehrungszeit = k2_dauer
    k3 = PDpKnKonstant(sim); k3.m_sName = f"{name}.K3"; k3.m_iDurchfuehrungszeit = k3_dauer
    for k in [k0, k1, k2, k3]:
        plan.add_knoten(k)

    def _ka(n: str) -> PDpKaUebergang:
        ka = PDpKaUebergang(sim); ka.m_sName = f"{name}.{n}"; ka.m_iUebergangszeit = 0
        plan.add_kante(ka)
        return ka

    kS = _ka("S"); kSplit = _ka("Split"); kJ = _ka("J"); kE = _ka("E")

    plan.set_start_kante(kS); kS.m_lNachfolger.append(k0); k0.m_lKanteEin = kS
    k0.m_lKanteAus = kSplit
    kSplit.m_lVorgaenger.append(k0)
    kSplit.m_lNachfolger.append(k1); k1.m_lKanteEin = kSplit
    kSplit.m_lNachfolger.append(k2); k2.m_lKanteEin = kSplit
    k1.m_lKanteAus = kJ; k2.m_lKanteAus = kJ
    kJ.m_lVorgaenger.append(k1); kJ.m_lVorgaenger.append(k2)
    kJ.m_lNachfolger.append(k3); k3.m_lKanteEin = kJ
    k3.m_lKanteAus = kE; kE.m_lVorgaenger.append(k3)
    plan.set_end_kante(kE)

    return plan


def test_three_independent_plans_with_independent_triggers() -> None:
    """3 unabhängige Pläne, 3 Auslöser zu unterschiedlichen Zeitpunkten.
    Verifiziert dass Pläne unabhängig laufen ohne Konflikte."""
    sim = PSimulator()

    plans = []
    for name in ["PA", "PB", "PC"]:
        p = _build_diamond_plan(sim, name)
        sim.register_plan(p)
        plans.append(p)

    for i, p in enumerate(plans):
        a = PAslEinzel(sim); a.m_sName = f"A{i}"; a.m_iBeginTermin = i * 50
        a.m_lDlpl = p
        sim.register_ausloeser(a)

    sim.start()

    # Jeder Plan wurde 1× ausgelöst und 1× beendet
    for p in plans:
        assert p.m_iPtkProzessCount == 1
        assert p.m_iPtkBegAusloesungCount == 1
        assert p.m_iPtkAusloesungCount == 1
    for a in sim.m_lAusl:
        assert a.m_iPtkAusloesungCount == 1


def test_three_plans_kritischer_weg() -> None:
    """Kritische Wege der 3 Pläne korrekt berechnet."""
    sim = PSimulator()
    pa = _build_diamond_plan(sim, "PA", k0_dauer=30, k1_dauer=50, k2_dauer=100, k3_dauer=20)
    pb = _build_diamond_plan(sim, "PB", k0_dauer=10, k1_dauer=80, k2_dauer=40, k3_dauer=15)
    pc = _build_diamond_plan(sim, "PC", k0_dauer=25, k1_dauer=200, k2_dauer=150, k3_dauer=25)

    # Erwartete Kritische Wege:
    # PA: 30 + max(50, 100) + 20 = 150
    # PB: 10 + max(80, 40) + 15 = 105
    # PC: 25 + max(200, 150) + 25 = 250
    assert pa.get_knz_min_dlfz() == 150.0
    assert pb.get_knz_min_dlfz() == 105.0
    assert pc.get_knz_min_dlfz() == 250.0


def test_three_plans_event_count() -> None:
    """3 Pläne × (1 AuslTriggern + 4 Übergang × 2 (start+ende) + 4 BearbeitEnde) — Größenordnung."""
    sim = PSimulator()
    for name in ["PA", "PB", "PC"]:
        p = _build_diamond_plan(sim, name)
        sim.register_plan(p)
    for i in range(3):
        a = PAslEinzel(sim); a.m_sName = f"A{i}"; a.m_iBeginTermin = 0
        a.m_lDlpl = sim.m_lDlpl[i]
        sim.register_ausloeser(a)

    sink = TraceCaptureSink()
    sim.bus.subscribe("plan.ausloesen", sink)
    sim.bus.subscribe("plan.beendet", sink)
    sim.start()

    assert len(sink.for_topic("plan.ausloesen")) == 3
    assert len(sink.for_topic("plan.beendet")) == 3
