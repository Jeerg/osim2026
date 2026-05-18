"""P4-C: PDpKnMenge + PDpKnMengeRuesten — mengenabhängige Durchführungszeit.

Tests:
    A) PDpKnMenge: t = menge × dfz_pro_einheit (mehrere Mengen)
    B) PDpKnMenge: menge=0 → Dauer 0 (Edge-Case, läuft synchron durch)
    C) PDpKnMenge: ohne Auslöser-Parameter → Default 0 → Dauer 0
    D) PDpKnMenge: m_iPtkKumDurchfuehrungszeit + m_iPtkDurchfuehrungszeitCount
    E) PDpKnMengeRuesten: t = ruestzeit + menge × dfz_pro_einheit
    F) PDpKnMengeRuesten: nur Rüstzeit bei menge=0
    G) on_rec_init resettet Kum-Counter
    H) ProduktionEnde-Branch (m_iZeitRedBeiProzEnde > 0) reduziert Mengen-Anteil
"""

from __future__ import annotations

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnMenge, PDpKnMengeRuesten
from osim_engine.pps.parameter import PParameterMenge
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Konstruktions-Helfer
# ----------------------------------------------------------------------


def _build_menge_sim(*, menge: int | None, dfz_pro_einheit: int,
                     ruestzeit: int | None = None) -> PSimulator:
    """Plan mit einem Menge-(Ruesten-)Knoten."""
    sim = PSimulator()

    if ruestzeit is None:
        knoten = PDpKnMenge(sim); knoten.m_sName = "M"
        knoten.m_iDfzProEinheit = dfz_pro_einheit
    else:
        knoten = PDpKnMengeRuesten(sim); knoten.m_sName = "MR"
        knoten.m_iDfzProEinheit = dfz_pro_einheit
        knoten.m_iRuestzeit = ruestzeit

    plan = PDurchlaufplan(sim); plan.m_sName = "Plan"
    plan.add_knoten(knoten)
    kS = PDpKaUebergang(sim); kS.m_iUebergangszeit = 0; plan.add_kante(kS)
    kE = PDpKaUebergang(sim); kE.m_iUebergangszeit = 0; plan.add_kante(kE)
    plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
    knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

    sim.register_plan(plan)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    if menge is not None:
        ausl.m_lParameter.append(PParameterMenge(sim, wert=menge))
    sim.register_ausloeser(ausl)

    return sim


# ----------------------------------------------------------------------
# PDpKnMenge
# ----------------------------------------------------------------------


def test_p4_menge_menge1_dauer10() -> None:
    """menge=1, dfz=10 → Dauer 10."""
    sim = _build_menge_sim(menge=1, dfz_pro_einheit=10)
    sim.start()

    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 10
    knoten = sim.m_lDlpl[0].m_lKnoten[0]
    assert knoten.m_iPtkKumDurchfuehrungszeit == 10
    assert knoten.m_iPtkDurchfuehrungszeitCount == 1


def test_p4_menge_menge5_dauer50() -> None:
    """menge=5, dfz=10 → Dauer 50."""
    sim = _build_menge_sim(menge=5, dfz_pro_einheit=10)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 50


def test_p4_menge_menge3_dfz_15() -> None:
    """menge=3, dfz=15 → Dauer 45."""
    sim = _build_menge_sim(menge=3, dfz_pro_einheit=15)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 45
    knoten = sim.m_lDlpl[0].m_lKnoten[0]
    assert knoten.m_iPtkKumDurchfuehrungszeit == 45


def test_p4_menge_menge0_dauer0() -> None:
    """menge=0 → Dauer 0 — Prozess läuft synchron durch."""
    sim = _build_menge_sim(menge=0, dfz_pro_einheit=10)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 0
    knoten = sim.m_lDlpl[0].m_lKnoten[0]
    # Counter werden auch bei Menge 0 hochgezählt
    assert knoten.m_iPtkDurchfuehrungszeitCount == 1
    assert knoten.m_iPtkKumDurchfuehrungszeit == 0


def test_p4_menge_kein_parameter_default_0() -> None:
    """Auslöser ohne PParameterMenge → hole_parameter_int liefert Default 0
    → Dauer 0.
    """
    sim = _build_menge_sim(menge=None, dfz_pro_einheit=10)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 0


# ----------------------------------------------------------------------
# PDpKnMengeRuesten
# ----------------------------------------------------------------------


def test_p4_menge_ruesten_menge3_ruestzeit20() -> None:
    """menge=3, dfz=10, ruest=20 → Dauer 50."""
    sim = _build_menge_sim(menge=3, dfz_pro_einheit=10, ruestzeit=20)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 50
    knoten = sim.m_lDlpl[0].m_lKnoten[0]
    assert knoten.m_iPtkKumDurchfuehrungszeit == 50


def test_p4_menge_ruesten_menge0_nur_ruestzeit() -> None:
    """menge=0, ruest=20 → Dauer 20 (nur Rüstung, keine Stück-Zeit)."""
    sim = _build_menge_sim(menge=0, dfz_pro_einheit=10, ruestzeit=20)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 20


def test_p4_menge_ruesten_menge1_einheits_plus_ruest() -> None:
    """menge=1, dfz=5, ruest=15 → Dauer 20."""
    sim = _build_menge_sim(menge=1, dfz_pro_einheit=5, ruestzeit=15)
    sim.start()
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 20


# ----------------------------------------------------------------------
# Counter + Reset
# ----------------------------------------------------------------------


def test_p4_menge_on_rec_init_resettet_counter() -> None:
    """on_rec_init setzt m_iPtkKumDurchfuehrungszeit + Count zurück."""
    sim = _build_menge_sim(menge=4, dfz_pro_einheit=10)
    sim.start()

    knoten = sim.m_lDlpl[0].m_lKnoten[0]
    assert knoten.m_iPtkKumDurchfuehrungszeit == 40
    assert knoten.m_iPtkDurchfuehrungszeitCount == 1

    knoten.on_rec_init(deep=False)
    assert knoten.m_iPtkKumDurchfuehrungszeit == 0
    assert knoten.m_iPtkDurchfuehrungszeitCount == 0


# ----------------------------------------------------------------------
# Produktionsende-Branch
# ----------------------------------------------------------------------


def test_p4_menge_produktion_ende_zeitred() -> None:
    """ProduktionEnde + m_iZeitRedBeiProzEnde=20 → Mengen-Anteil reduziert.

    Wir setzen m_bIsProduktionEnde NACH register_ausloeser aber VOR start,
    weil der Reduktions-Pfad nur in get_durchfuehrungszeit greift, das
    während des laufenden Plans aufgerufen wird.

    Bei menge=10, dfz=10, red=20% → 10 * (10 * 0.8) = 80.
    """
    sim = PSimulator()

    knoten = PDpKnMenge(sim); knoten.m_sName = "M"
    knoten.m_iDfzProEinheit = 10
    knoten.m_iZeitRedBeiProzEnde = 20

    plan = PDurchlaufplan(sim); plan.m_sName = "Plan"
    plan.add_knoten(knoten)
    kS = PDpKaUebergang(sim); kS.m_iUebergangszeit = 0; plan.add_kante(kS)
    kE = PDpKaUebergang(sim); kE.m_iUebergangszeit = 0; plan.add_kante(kE)
    plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
    knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

    sim.register_plan(plan)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    ausl.m_lParameter.append(PParameterMenge(sim, wert=10))
    sim.register_ausloeser(ausl)

    # Produktionsende-Flag aktivieren VOR start (der Auslöser triggert
    # bei t=0 → get_durchfuehrungszeit liest m_bIsProduktionEnde)
    sim.m_bIsProduktionEnde = True

    sim.start()

    # Erwartung: 10 * int(10 * 0.8) = 10 * 8 = 80
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 80
    # Counter werden im ProduktionEnde-Branch NICHT geführt (1:1 zu C++)
    assert knoten.m_iPtkKumDurchfuehrungszeit == 0
    assert knoten.m_iPtkDurchfuehrungszeitCount == 0


def test_p4_menge_ruesten_produktion_ende_nur_menge_reduziert() -> None:
    """ProduktionEnde: Rüstzeit bleibt voll, Stück-Zeit reduziert.

    menge=5, dfz=10, ruest=30, red=50% → 5 * int(10 * 0.5) + 30 = 25+30 = 55.
    """
    sim = PSimulator()

    knoten = PDpKnMengeRuesten(sim); knoten.m_sName = "MR"
    knoten.m_iDfzProEinheit = 10
    knoten.m_iRuestzeit = 30
    knoten.m_iZeitRedBeiProzEnde = 50

    plan = PDurchlaufplan(sim); plan.m_sName = "Plan"
    plan.add_knoten(knoten)
    kS = PDpKaUebergang(sim); kS.m_iUebergangszeit = 0; plan.add_kante(kS)
    kE = PDpKaUebergang(sim); kE.m_iUebergangszeit = 0; plan.add_kante(kE)
    plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
    knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

    sim.register_plan(plan)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = plan
    ausl.m_lParameter.append(PParameterMenge(sim, wert=5))
    sim.register_ausloeser(ausl)

    sim.m_bIsProduktionEnde = True
    sim.start()

    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 55
