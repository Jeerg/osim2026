"""V2: Mehrere Knoten in einem Plan (linear + Verzweigung mit Join-Counter).

Verifiziert dass:
- Sequentielle 3-Knoten-Kette korrekt durchläuft (S→K1→K12→K2→K23→K3→E)
- Verzweigung mit Join via PtVerknuepfung funktioniert
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _build_linear_3_knoten() -> tuple[PSimulator, PDurchlaufplan, list[PDpKnKonstant], PAslEinzel]:
    """Plan: S → K1 → K12 → K2 → K23 → K3 → E
    Drei Knoten je 100s, vier Kanten je 10s Übergang.
    Gesamtzeit: 10+100+10+100+10+100+10 = 340s
    """
    sim = PSimulator()
    plan = PDurchlaufplan(sim)
    plan.m_sName = "P"

    knoten = []
    for i in range(3):
        k = PDpKnKonstant(sim)
        k.m_sName = f"K{i+1}"
        k.m_iDurchfuehrungszeit = 100
        plan.add_knoten(k)
        knoten.append(k)

    # 4 Kanten: Start, K1↔K2, K2↔K3, End
    edges = []
    for i, name in enumerate(["S", "K12", "K23", "E"]):
        ka = PDpKaUebergang(sim)
        ka.m_sName = name
        ka.m_iUebergangszeit = 10
        plan.add_kante(ka)
        edges.append(ka)

    # Verkabelung
    plan.set_start_kante(edges[0])
    edges[0].m_lNachfolger.append(knoten[0])
    knoten[0].m_lKanteEin = edges[0]

    knoten[0].m_lKanteAus = edges[1]
    edges[1].m_lVorgaenger.append(knoten[0])
    edges[1].m_lNachfolger.append(knoten[1])
    knoten[1].m_lKanteEin = edges[1]

    knoten[1].m_lKanteAus = edges[2]
    edges[2].m_lVorgaenger.append(knoten[1])
    edges[2].m_lNachfolger.append(knoten[2])
    knoten[2].m_lKanteEin = edges[2]

    knoten[2].m_lKanteAus = edges[3]
    edges[3].m_lVorgaenger.append(knoten[2])
    plan.set_end_kante(edges[3])

    sim.register_plan(plan)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)

    return sim, plan, knoten, ausl


def test_linear_3_knoten_durchlaufzeit_summiert() -> None:
    """3 Knoten × 100s + 4 Kanten × 10s = 340s."""
    sim, plan, knoten, ausl = _build_linear_3_knoten()
    sim.start()

    assert ausl.m_iPtkAusloesungCount == 1
    assert ausl.m_dPtkDurchlaufzeit == 340.0

    # Jeder Knoten genau 1× bearbeitet
    for k in knoten:
        assert k.m_iPtkProzessCount == 1
        assert k.m_iPtkBegAusloesungCount == 1
        assert k.m_iPtkAusloesungCount == 1
        assert k.m_lProzesse == []


def test_linear_3_knoten_event_count() -> None:
    """4 Übergänge + 3 Bearbeitungs-Enden + 1 Auslöser = 8 Events insgesamt."""
    sim, plan, knoten, ausl = _build_linear_3_knoten()
    sim.start()
    # Events: 1 Ausl + 4 Übergang-Ende + 3 Bearbeit-Ende = 8
    assert sim.evt_get_sum() == 8
    assert sim.evt_get_cur() == 0


def test_linear_3_knoten_bearbeit_reihenfolge() -> None:
    """Die 3 Bearbeitungs-Starts kommen in K1 → K2 → K3-Reihenfolge."""
    sim, plan, knoten, ausl = _build_linear_3_knoten()
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.bearbeit.start", sink)
    sim.start()

    starts = sink.for_topic("proz.bearbeit.start")
    assert len(starts) == 3
    assert starts[0].data["knoten"] == "K1"
    assert starts[1].data["knoten"] == "K2"
    assert starts[2].data["knoten"] == "K3"

    # K1 startet bei t=10 (nach Start-Übergang), K2 bei t=10+100+10=120, K3 bei t=230
    assert starts[0].sim_time == 10
    assert starts[1].sim_time == 120
    assert starts[2].sim_time == 230


def _build_diamond_plan() -> tuple[PSimulator, PDurchlaufplan, list[PDpKnKonstant], PAslEinzel]:
    """Diamond: S → K0 → (K1, K2) → join → K3 → E
                                  ↑ Join hier (K12 mit 2 Vorgängern)

    K0 = 50s, K1 = 100s, K2 = 200s, K3 = 30s.
    Pfad-K1: 50 + 100 + max-warten + 30 = ?
    Pfad-K2: 50 + 200 + 30 = 280s ohne Übergänge

    Mit 0-Übergangs-Kanten: K0 endet bei 50. Dann parallel K1 und K2.
    K1 endet bei 150, K2 bei 250. Join wartet auf langsamsten = 250.
    K3 startet bei 250, endet bei 280. Plan-Total: 280.
    """
    sim = PSimulator()
    plan = PDurchlaufplan(sim)
    plan.m_sName = "P"

    k0 = PDpKnKonstant(sim); k0.m_sName = "K0"; k0.m_iDurchfuehrungszeit = 50
    k1 = PDpKnKonstant(sim); k1.m_sName = "K1"; k1.m_iDurchfuehrungszeit = 100
    k2 = PDpKnKonstant(sim); k2.m_sName = "K2"; k2.m_iDurchfuehrungszeit = 200
    k3 = PDpKnKonstant(sim); k3.m_sName = "K3"; k3.m_iDurchfuehrungszeit = 30
    plan.add_knoten(k0); plan.add_knoten(k1); plan.add_knoten(k2); plan.add_knoten(k3)

    def _ka(name: str) -> PDpKaUebergang:
        ka = PDpKaUebergang(sim); ka.m_sName = name; ka.m_iUebergangszeit = 0
        plan.add_kante(ka)
        return ka

    kS = _ka("S"); k01a = _ka("K01a"); k01b = _ka("K01b")
    kJ = _ka("J"); k3E = _ka("E")

    # S → K0
    plan.set_start_kante(kS)
    kS.m_lNachfolger.append(k0); k0.m_lKanteEin = kS
    # K0 → splits into K01a, K01b
    # but real semantic: K0 → (K1, K2). Need: K0.m_lKanteAus geht an EINE Kante,
    # die zu BEIDEN Nachfolgern routet. Das ist die "Split"-Funktionalität:
    # m_lNachfolger hat 2 Einträge.
    # Lass mich das richtig modellieren:
    plan.m_lKanten.remove(k01a); plan.m_lKanten.remove(k01b)
    kSplit = _ka("Split")
    k0.m_lKanteAus = kSplit
    kSplit.m_lVorgaenger.append(k0)
    kSplit.m_lNachfolger.append(k1); k1.m_lKanteEin = kSplit
    kSplit.m_lNachfolger.append(k2); k2.m_lKanteEin = kSplit

    # K1 → J, K2 → J — Join mit 2 Vorgängern
    k1.m_lKanteAus = kJ
    k2.m_lKanteAus = kJ
    kJ.m_lVorgaenger.append(k1)
    kJ.m_lVorgaenger.append(k2)
    kJ.m_lNachfolger.append(k3); k3.m_lKanteEin = kJ

    # K3 → E
    k3.m_lKanteAus = k3E
    k3E.m_lVorgaenger.append(k3)
    plan.set_end_kante(k3E)

    sim.register_plan(plan)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)

    return sim, plan, [k0, k1, k2, k3], ausl


def test_diamond_join_waits_for_slowest() -> None:
    """K3 startet erst nach K2 (langsamerer Vorgänger), nicht nach K1."""
    sim, plan, knoten, ausl = _build_diamond_plan()
    sink = TraceCaptureSink()
    sim.bus.subscribe("proz.bearbeit.start", sink)
    sim.start()

    k3_start = next(r for r in sink.for_topic("proz.bearbeit.start")
                    if r.data["knoten"] == "K3")
    # K0 endet bei 50, dann parallel:
    # K1 50→150, K2 50→250. K3 wartet auf beide → startet bei 250.
    assert k3_start.sim_time == 250


def test_diamond_total_durchlaufzeit() -> None:
    """50 (K0) + 200 (K2, slowest parallel) + 30 (K3) = 280s."""
    sim, plan, knoten, ausl = _build_diamond_plan()
    sim.start()
    assert ausl.m_dPtkDurchlaufzeit == 280.0
    # Alle 4 Knoten durchlaufen
    for k in knoten:
        assert k.m_iPtkAusloesungCount == 1


def test_diamond_join_uses_verknuepfung() -> None:
    """Nach Sim-Ende ist die Join-Verknüpfung wieder leer (sauber aufgeräumt)."""
    sim, plan, knoten, ausl = _build_diamond_plan()
    sim.start()
    # PtProzDurchlaufplan ist nach bearbeit_beenden aus plan.m_lProzesse weg,
    # also können wir m_oVerknuepfungen nicht direkt prüfen. Wir prüfen indirekt:
    # Kein hängender Prozess im Plan oder in den Kanten
    assert plan.m_lProzesse == []
    for ka in plan.m_lKanten:
        assert ka.m_lProzesse == []
