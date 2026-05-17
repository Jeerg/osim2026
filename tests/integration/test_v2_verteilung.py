"""V2: PDpKnVerteilung und PDpKaVerteilung mit echter Stochastik.

Verifiziert dass:
- PDpKnVerteilung Zeit aus einer Verteilung zieht und der LCG-Keim
  reproducible bleibt (für Diff-Tests)
- PDpKaVerteilung dito für Übergangszeiten
"""

from __future__ import annotations

from osim_engine.core.verteilung import OVerteilungKonstant, OVerteilungNormal
from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.kante.verteilung import PDpKaVerteilung
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant, PDpKnVerteilung
from osim_engine.pps.simulator import PSimulator


def _build_plan_with_verteilung(
    knoten_verteilung,
    kante_verteilung=None,
) -> tuple[PSimulator, PDurchlaufplan, PAslEinzel]:
    sim = PSimulator()
    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    k = PDpKnVerteilung(sim)
    k.m_sName = "K"
    k.m_lVerteil = knoten_verteilung
    plan.add_knoten(k)

    kS = PDpKaUebergang(sim); kS.m_sName = "S"; kS.m_iUebergangszeit = 0
    plan.add_kante(kS); plan.set_start_kante(kS)
    kS.m_lNachfolger.append(k); k.m_lKanteEin = kS

    if kante_verteilung is not None:
        kE = PDpKaVerteilung(sim)
        kE.m_lVerteil = kante_verteilung
    else:
        kE = PDpKaUebergang(sim)
        kE.m_iUebergangszeit = 0
    kE.m_sName = "E"
    plan.add_kante(kE); plan.set_end_kante(kE)
    kE.m_lVorgaenger.append(k)
    k.m_lKanteAus = kE

    sim.register_plan(plan)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    sim.register_ausloeser(ausl)
    return sim, plan, ausl


def test_pdpknverteilung_konstant_equivalent_to_pdpknkonstant() -> None:
    """Konstante Verteilung mit wert_basis=150 → wie PDpKnKonstant mit 150s."""
    v = OVerteilungKonstant(wert_basis=150.0)
    sim, plan, ausl = _build_plan_with_verteilung(knoten_verteilung=v)
    sim.start()
    assert ausl.m_dPtkDurchlaufzeit == 150.0


def test_pdpknverteilung_normal_within_range() -> None:
    """Normal-Verteilung mit ew=100, sa=10 → Durchlaufzeit grob um 100."""
    v = OVerteilungNormal(wert_basis=100.0, std_abweich=10.0)
    sim, plan, ausl = _build_plan_with_verteilung(knoten_verteilung=v)
    sim.start()
    # Sample mit STD_KEIM ist ~101 (siehe C0-S-Fixture)
    assert 50.0 < ausl.m_dPtkDurchlaufzeit < 200.0


def test_pdpkaverteilung_kante() -> None:
    """PDpKaVerteilung an der End-Kante: Übergangszeit aus Verteilung."""
    knoten_v = OVerteilungKonstant(wert_basis=100.0)
    kante_v = OVerteilungKonstant(wert_basis=50.0)
    sim, plan, ausl = _build_plan_with_verteilung(
        knoten_verteilung=knoten_v,
        kante_verteilung=kante_v,
    )
    sim.start()
    # 100 (Knoten) + 50 (End-Kante) = 150
    assert ausl.m_dPtkDurchlaufzeit == 150.0


def test_pdpknverteilung_reproducible_with_seed() -> None:
    """Zwei Sim-Läufe mit gleichem Seed produzieren identische Durchlaufzeit."""
    from osim_engine.core import distribution as dist_module

    # Lauf 1
    v1 = OVerteilungNormal(wert_basis=100.0, std_abweich=10.0)
    sim1, plan1, ausl1 = _build_plan_with_verteilung(v1)
    sim1.start()
    dz1 = ausl1.m_dPtkDurchlaufzeit

    # Reset LCG, Lauf 2
    dist_module.s_verteil._keim_intern = dist_module.STD_KEIM
    dist_module.s_verteil._external_ref = None

    v2 = OVerteilungNormal(wert_basis=100.0, std_abweich=10.0)
    sim2, plan2, ausl2 = _build_plan_with_verteilung(v2)
    sim2.start()
    dz2 = ausl2.m_dPtkDurchlaufzeit

    assert dz1 == dz2  # Bit-genau
