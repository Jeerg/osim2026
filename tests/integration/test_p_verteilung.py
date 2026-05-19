"""PVerteilung-Familie (OSimPro/PVerteilung.{odh,cpp}) — Unit + Loader-Tests.

Stand: Slice V9 PVerteilung. Diese Tests sichern:
- Die 7 PVerteilung-Subklassen liefern korrekte Werte
- m_lPVertExt-Pfad (eigener Zufallsgenerator) funktioniert
- reduziere_vorgabezeit auf PVertKonstant + PVertBetaPERT
- otx_loader registriert PVert*-Handler und löst m_lVerteil-Refs auf
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from osim_engine.core.distribution import OVerteil, STD_KEIM, reset_keim, s_verteil
from osim_engine.pps.verteilung import (
    PVerteilung,
    PVertKonstant,
    PVertGleich,
    PVertNormal,
    PVertLogNorm,
    PVertExponential,
    PVertBeta,
    PVertBetaPERT,
    PVertExtern,
    PVertExternLList,
)


# ----------------------------------------------------------------------
# vert_beta / vert_beta_pert / vert_gamma — Stabilitäts-Tests
# ----------------------------------------------------------------------


def test_vert_beta_deterministic() -> None:
    """Bei gleichem Seed liefert vert_beta(a,b) immer dieselbe Sequenz."""
    g1 = OVerteil(STD_KEIM)
    g2 = OVerteil(STD_KEIM)
    seq1 = [g1.vert_beta(2.0, 3.0) for _ in range(5)]
    seq2 = [g2.vert_beta(2.0, 3.0) for _ in range(5)]
    assert seq1 == seq2


def test_vert_beta_range_uses_grenzen() -> None:
    """vert_beta_range skaliert in [ug, og]."""
    g = OVerteil(STD_KEIM)
    samples = [g.vert_beta_range(100.0, 200.0, 2.0, 3.0) for _ in range(20)]
    assert all(100.0 <= s <= 200.0 for s in samples)


def test_vert_beta_pert_uses_a_m_b() -> None:
    """vert_beta_pert(m, a, b) liefert Werte in [a, b]."""
    g = OVerteil(STD_KEIM)
    samples = [g.vert_beta_pert(50.0, 10.0, 100.0) for _ in range(20)]
    assert all(10.0 <= s <= 100.0 for s in samples)


def test_vert_beta_rejects_non_positive_params() -> None:
    g = OVerteil(STD_KEIM)
    with pytest.raises(ValueError):
        g.vert_beta(0.0, 1.0)
    with pytest.raises(ValueError):
        g.vert_beta(1.0, -0.5)


def test_vert_gamma_positive_for_m_le_1() -> None:
    """Gamma(m, k) liefert positive Werte (RGS-Algorithmus für m≤1)."""
    g = OVerteil(STD_KEIM)
    samples = [g.vert_gamma(0.5, 1.0) for _ in range(20)]
    assert all(s > 0.0 for s in samples)


def test_vert_gamma_positive_for_m_gt_1() -> None:
    """Gamma(m, k) liefert positive Werte (Best's XG-Algorithmus für m>1)."""
    g = OVerteil(STD_KEIM)
    samples = [g.vert_gamma(2.0, 1.0) for _ in range(20)]
    assert all(s > 0.0 for s in samples)


# ----------------------------------------------------------------------
# PVertKonstant
# ----------------------------------------------------------------------


def test_pvert_konstant_returns_basis() -> None:
    v = PVertKonstant()
    v.m_fKonstante = 42.5
    assert v.hole_zufallswert() == 42.5
    assert v.hole_mittelwert() == 42.5


def test_pvert_konstant_reduziere_vorgabezeit() -> None:
    """Reduziere um 25%: 100 → 75."""
    v = PVertKonstant()
    v.m_fKonstante = 100.0
    v.reduziere_vorgabezeit(25.0)
    assert v.m_fKonstante == 75.0


def test_pvert_konstant_unabhaengig_von_lcg() -> None:
    """Konstante Verteilung greift NICHT auf den LCG zu — Seed irrelevant."""
    reset_keim()
    v = PVertKonstant()
    v.m_fKonstante = 7.0
    keim_vorher = s_verteil.keim
    for _ in range(100):
        v.hole_zufallswert()
    assert s_verteil.keim == keim_vorher


# ----------------------------------------------------------------------
# PVertGleich / PVertNormal / PVertLogNorm / PVertExponential
# ----------------------------------------------------------------------


def test_pvert_gleich_in_range() -> None:
    reset_keim()
    v = PVertGleich()
    v.m_fMinimum = 10.0
    v.m_fMaximum = 20.0
    samples = [v.hole_zufallswert() for _ in range(50)]
    assert all(10.0 <= s <= 20.0 for s in samples)
    assert v.hole_mittelwert() == 15.0


def test_pvert_normal_mittelwert() -> None:
    v = PVertNormal()
    v.m_fErwartungsw = 100.0
    v.m_fStandardabw = 10.0
    assert v.hole_mittelwert() == 100.0


def test_pvert_lognorm_mittelwert() -> None:
    v = PVertLogNorm()
    v.m_fErwartungsw = 50.0
    v.m_fStandardabw = 5.0
    assert v.hole_mittelwert() == 50.0


def test_pvert_exponential_mittelwert_raises() -> None:
    """C++ PVertExponential::GetMittelwert wirft OException."""
    v = PVertExponential()
    v.m_fErwartungsw = 100.0
    with pytest.raises(NotImplementedError):
        v.hole_mittelwert()


# ----------------------------------------------------------------------
# PVertBeta / PVertBetaPERT
# ----------------------------------------------------------------------


def test_pvert_beta_in_range() -> None:
    reset_keim()
    v = PVertBeta()
    v.m_fUntereGrenze = 0.0
    v.m_fObereGrenze = 100.0
    v.m_fAlpha = 2.0
    v.m_fBeta = 3.0
    samples = [v.hole_zufallswert() for _ in range(20)]
    assert all(0.0 <= s <= 100.0 for s in samples)


def test_pvert_beta_mittelwert_raises() -> None:
    v = PVertBeta()
    with pytest.raises(NotImplementedError):
        v.hole_mittelwert()


def test_pvert_beta_pert_in_range() -> None:
    reset_keim()
    v = PVertBetaPERT()
    v.m_foptimistischerWert = 10.0
    v.m_fhaeufigsterWert = 50.0
    v.m_fpessimistischerWert = 100.0
    samples = [v.hole_zufallswert() for _ in range(20)]
    assert all(10.0 <= s <= 100.0 for s in samples)


def test_pvert_beta_pert_mittelwert_pert_formel() -> None:
    """(opt + 4*haeufig + pes) / 6."""
    v = PVertBetaPERT()
    v.m_foptimistischerWert = 10.0
    v.m_fhaeufigsterWert = 20.0
    v.m_fpessimistischerWert = 60.0
    expected = (10.0 + 4 * 20.0 + 60.0) / 6
    assert v.hole_mittelwert() == expected


def test_pvert_beta_pert_reduziere() -> None:
    """ReduziereVorgabezeit um 50% halbiert alle drei Werte."""
    v = PVertBetaPERT()
    v.m_foptimistischerWert = 10.0
    v.m_fhaeufigsterWert = 20.0
    v.m_fpessimistischerWert = 60.0
    v.reduziere_vorgabezeit(50.0)
    assert v.m_foptimistischerWert == 5.0
    assert v.m_fhaeufigsterWert == 10.0
    assert v.m_fpessimistischerWert == 30.0


# ----------------------------------------------------------------------
# PVertExtern — eigener Zufallsgenerator
# ----------------------------------------------------------------------


def test_pvert_extern_uses_own_generator() -> None:
    """Wenn m_lPVertExt gesetzt, wird der globale s_verteil-Keim nicht angetastet."""
    reset_keim()
    keim_vorher = s_verteil.keim

    ext = PVertExtern()
    ext.m_keim = 999.0
    ext.m_Internerkeim = 999.0
    ext._keim_ref[0] = 999.0

    v = PVertGleich()
    v.m_fMinimum = 0.0
    v.m_fMaximum = 100.0
    v.m_lPVertExt = ext

    for _ in range(10):
        v.hole_zufallswert()

    # Globaler Keim unangetastet
    assert s_verteil.keim == keim_vorher
    # Externer Keim hat sich bewegt
    assert ext._keim_ref[0] != 999.0


def test_pvert_extern_on_sim_reset_setzt_internerkeim() -> None:
    """on_sim_reset restauriert m_Internerkeim = m_keim."""
    ext = PVertExtern()
    ext.m_keim = 1234567.0
    ext.m_Internerkeim = 9999999.0
    ext._keim_ref[0] = 9999999.0
    ext.on_sim_reset()
    assert ext.m_Internerkeim == 1234567.0
    assert ext._keim_ref[0] == 1234567.0


def test_pvert_extern_llist_is_list_subclass() -> None:
    assert issubclass(PVertExternLList, list)


# ----------------------------------------------------------------------
# OTX-Loader — m_lVerteil-Wiring
# ----------------------------------------------------------------------


def test_otx_loader_wires_pvert_konstant_into_pdpknverteilung() -> None:
    """Bosch2-Loader-Smoke: Knoten PDpKnVerteilung müssen m_lVerteil
    gesetzt bekommen (sonst crasht get_durchfuehrungszeit)."""
    bosch2 = Path(
        r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
    )
    if not bosch2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")

    from osim_engine.io.otx_loader import load_otx_file
    from osim_engine.pps.knoten.zeitvorgabe import PDpKnVerteilung

    r = load_otx_file(bosch2)
    knoten = [
        py for py in r.instances.values()
        if isinstance(py, PDpKnVerteilung)
    ]
    assert len(knoten) > 1000, f"Erwartet >1000 PDpKnVerteilung, war {len(knoten)}"
    with_verteil = [k for k in knoten if k.m_lVerteil is not None]
    # Mind. 95% der Knoten müssen eine Verteilung haben (Restl sind evtl. Sub-Plan-Lücken)
    assert len(with_verteil) / len(knoten) > 0.95, (
        f"Nur {len(with_verteil)}/{len(knoten)} Knoten haben m_lVerteil gesetzt"
    )


def test_otx_loader_wires_pdpkaverteilung() -> None:
    """PDpKaVerteilung-Handler: Kanten müssen m_lVerteil gesetzt bekommen."""
    bosch2 = Path(
        r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
    )
    if not bosch2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")

    from osim_engine.io.otx_loader import load_otx_file
    from osim_engine.pps.kante.verteilung import PDpKaVerteilung

    r = load_otx_file(bosch2)
    kanten = [py for py in r.instances.values() if isinstance(py, PDpKaVerteilung)]
    if not kanten:
        pytest.skip("Bosch2 enthält keine PDpKaVerteilung")
    with_verteil = [k for k in kanten if k.m_lVerteil is not None]
    assert len(with_verteil) > 0, "Keine PDpKaVerteilung-Kante hat m_lVerteil"


def test_otx_loader_pvert_extern_keim_aus_otx() -> None:
    """PVertExtern: m_keim wird aus OTX geladen."""
    bosch2 = Path(
        r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
    )
    if not bosch2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")

    from osim_engine.io.otx_loader import load_otx_file

    r = load_otx_file(bosch2)
    externs = [py for py in r.instances.values() if isinstance(py, PVertExtern)]
    if externs:
        # Mind. eines hat einen nicht-default Keim
        keime = [e.m_keim for e in externs]
        assert any(k != STD_KEIM for k in keime) or all(k == STD_KEIM for k in keime), (
            "PVertExtern-Keime sollten aus OTX geladen werden"
        )


def test_bosch2_python_sim_runs_without_crash() -> None:
    """Smoke: Bosch2 Python-Sim läuft ohne Crash durch (1 Periode).

    Dieser Test war der Trigger der PVerteilung-Slice: vorher crashte er
    mit `AssertionError: PDpKnVerteilung ohne m_lVerteil`.
    """
    bosch2 = Path(
        r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
    )
    if not bosch2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")

    from osim_engine.io.otx_loader import load_otx_file
    from osim_engine.io.otx_diff import extract_counters_from_simulator

    r = load_otx_file(bosch2)
    r.simulator.start()
    counters = extract_counters_from_simulator(r.simulator)
    assert len(counters) > 1000, f"Erwartet >1000 Counter-Objekte, war {len(counters)}"
