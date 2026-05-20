"""V3-KPI-Tests: kritischer Weg + Kosten-Verteilung.

Verifiziert die V3-Erweiterungen von PDurchlaufplan:
- get_knz_min_dlfz (kritischer Weg via _calc_krit_weg_rek)
- prz_kosten_berechnen (Kosten-Aufteilung über Knoten)
"""

from __future__ import annotations

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator


def _ka(sim, name: str, ubg: int = 0) -> PDpKaUebergang:
    ka = PDpKaUebergang(sim)
    ka.m_sName = name
    ka.m_iUebergangszeit = ubg
    return ka


def _kn(sim, name: str, dauer: int) -> PDpKnKonstant:
    k = PDpKnKonstant(sim)
    k.m_sName = name
    k.m_iDurchfuehrungszeit = dauer
    return k


def _build_linear_3() -> tuple[PSimulator, PDurchlaufplan]:
    """K1(100) → K2(50) → K3(150), alle Kanten mit Übergang 10s."""
    sim = PSimulator()
    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    k1, k2, k3 = _kn(sim, "K1", 100), _kn(sim, "K2", 50), _kn(sim, "K3", 150)
    plan.add_knoten(k1); plan.add_knoten(k2); plan.add_knoten(k3)

    kS = _ka(sim, "S", 10); k12 = _ka(sim, "K12", 10)
    k23 = _ka(sim, "K23", 10); kE = _ka(sim, "E", 10)
    plan.add_kante(kS); plan.add_kante(k12); plan.add_kante(k23); plan.add_kante(kE)

    plan.set_start_kante(kS); kS.m_lNachfolger.append(k1); k1.m_lKanteEin = kS
    k1.m_lKanteAus = k12; k12.m_lVorgaenger.append(k1); k12.m_lNachfolger.append(k2)
    k2.m_lKanteEin = k12; k2.m_lKanteAus = k23
    k23.m_lVorgaenger.append(k2); k23.m_lNachfolger.append(k3); k3.m_lKanteEin = k23
    k3.m_lKanteAus = kE; kE.m_lVorgaenger.append(k3)
    plan.set_end_kante(kE)

    sim.register_plan(plan)
    return sim, plan


def test_kritischer_weg_linear() -> None:
    """Linear: 10+100+10+50+10+150+10 = 340s."""
    sim, plan = _build_linear_3()
    assert plan.get_knz_min_dlfz() == 340.0


def test_kritischer_weg_diamond() -> None:
    """Diamond: K0(50) → split → (K1(100), K2(200)) → join → K3(30).
    Kritischer Weg: 50 + 200 + 30 = 280s (über K2)."""
    sim = PSimulator()
    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    k0, k1, k2, k3 = (_kn(sim, "K0", 50), _kn(sim, "K1", 100),
                      _kn(sim, "K2", 200), _kn(sim, "K3", 30))
    for k in [k0, k1, k2, k3]:
        plan.add_knoten(k)

    kS = _ka(sim, "S"); kSplit = _ka(sim, "Split"); kJ = _ka(sim, "J"); kE = _ka(sim, "E")
    for ka in [kS, kSplit, kJ, kE]:
        plan.add_kante(ka)

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

    sim.register_plan(plan)
    # Erwartet: 0 (S) + 50 (K0) + 0 (Split) + 200 (K2, langsamer Pfad) + 0 (J) + 30 (K3) + 0 (E) = 280
    assert plan.get_knz_min_dlfz() == 280.0


def test_kritischer_weg_matches_sim_dauer() -> None:
    """Bei Konstant-Knoten + Konstant-Kanten muss kritischer Weg == tatsächliche
    Sim-Durchlaufzeit sein."""
    sim, plan = _build_linear_3()
    krit_weg = plan.get_knz_min_dlfz()

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)
    sim.start()
    assert ausl.m_dPtkDurchlaufzeit == krit_weg


def test_kosten_verteilung_linear() -> None:
    """Lineare Kette: Kosten bleiben unverändert über alle Knoten."""
    sim, plan = _build_linear_3()
    plan.prz_kosten_berechnen(d_ein_kosten=1000.0)

    # Jeder Knoten bekommt die gleichen Eingangs-Kosten (kein Split)
    for kn in plan.m_lKnoten:
        assert kn.m_dEinKostenVorgaenger == 1000.0
    # Plan-Periodenkosten = Summe über End-Vorgänger (nur K3)
    assert plan.get_knz_periodenkosten() == 1000.0


def test_kosten_verteilung_split_propagiert_hauptweg() -> None:
    """Diamond mit Split: K3 bekommt NUR den Hauptweg-Kostenbetrag (500),
    nicht die Summe (1000) — das ist C++-Treue, möglicherweise ein Bug
    im Original-Code aber wir portieren 1:1.

    Hintergrund: CalcProzKostenRek nutzt `dEinKostenNext = oKnoten->
    GetKnzPeriodenkosten()` vom ersten Nachfolger (Hauptweg). Die m_dHelp-
    Akkumulation an der Join-Kante (kJ.m_dHelp = 500+500 = 1000) wird NICHT
    an die Nachfolger weitergereicht. C++ nutzt nur das `dEinKosten` aus
    der Hauptweg-Iteration für den nächsten Knoten.
    """
    sim = PSimulator()
    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    k0, k1, k2, k3 = (_kn(sim, "K0", 50), _kn(sim, "K1", 100),
                      _kn(sim, "K2", 200), _kn(sim, "K3", 30))
    for k in [k0, k1, k2, k3]:
        plan.add_knoten(k)
    kS = _ka(sim, "S"); kSplit = _ka(sim, "Split"); kJ = _ka(sim, "J"); kE = _ka(sim, "E")
    for ka in [kS, kSplit, kJ, kE]:
        plan.add_kante(ka)
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
    sim.register_plan(plan)

    plan.prz_kosten_berechnen(d_ein_kosten=1000.0)

    # K0 bekommt 1000 (nur ein Eingang)
    assert k0.m_dEinKostenVorgaenger == 1000.0
    # K1 und K2 bekommen je 500 (Split halbiert)
    assert k1.m_dEinKostenVorgaenger == 500.0
    assert k2.m_dEinKostenVorgaenger == 500.0
    # K3 bekommt 500 (Hauptweg-Propagation, NICHT 1000) — C++-Verhalten
    assert k3.m_dEinKostenVorgaenger == 500.0
    # kJ.m_dHelp akkumuliert allerdings korrekt
    assert kJ.m_dHelp == 1000.0


def test_min_kosten_analog() -> None:
    """min_prz_kosten_berechnen folgt dem gleichen Pfad wie prz_kosten_berechnen."""
    sim, plan = _build_linear_3()
    plan.min_prz_kosten_berechnen(d_min_ein_kosten=500.0)

    for kn in plan.m_lKnoten:
        assert kn.m_dEinMinKostenVorgaenger == 500.0
    assert plan.get_knz_min_periodenkosten() == 500.0
