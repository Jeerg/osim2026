"""Tests für `osim_engine.io.otx_loader`.

Validiert dass das Embb-AslFj-Modell (1480 OIDs, ~50 Klassen) vollständig
in eine lauffähige PSimulator-Instanz übersetzt werden kann.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.io.otx_loader import LoadResult, OtxLoader, load_otx_file
from osim_engine.io.otx_reader import parse_otx_file


FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"


@pytest.fixture(scope="module")
def loaded() -> LoadResult:
    return load_otx_file(PRE_FILE)


# ----------------------------------------------------------------------
# Coverage / Stat-Properties
# ----------------------------------------------------------------------


def test_load_completes_without_warnings(loaded: LoadResult) -> None:
    assert loaded.warnings == []


def test_full_coverage_of_embb_model(loaded: LoadResult) -> None:
    """100% Coverage erwartet — keine unsupported-Klassen mehr."""
    assert sum(loaded.unsupported.values()) == 0, (
        f"Unsupported-Klassen gefunden: {dict(loaded.unsupported)}"
    )
    assert loaded.coverage_ratio == 1.0


def test_minimum_loaded_object_counts(loaded: LoadResult) -> None:
    """Sanity-Check der wichtigsten Klassen."""
    assert loaded.loaded["PAslEinzel"] == 70
    assert loaded.loaded["PDurchlaufplan"] == 9   # 4 top-level + 5 sub-plans
    assert loaded.loaded["PDpKnMengeRuesten"] == 28
    assert loaded.loaded["PDpKnKonstant"] == 8
    assert loaded.loaded["PBetriebsmittel"] == 8
    assert loaded.loaded["PPerson"] == 5
    assert loaded.loaded["PAssozBeleg"] == 38
    assert loaded.loaded["PDlplKante"] >= 40


# ----------------------------------------------------------------------
# Simulator-Struktur nach Load
# ----------------------------------------------------------------------


def test_simulator_has_all_top_level_ausloeser(loaded: LoadResult) -> None:
    sim = loaded.simulator
    assert len(sim.m_lAusl) == 70


def test_simulator_has_top_level_plans(loaded: LoadResult) -> None:
    """4 Top-Level-Pläne (= Erzeugnisse). Sub-Pläne von Rück/Alt-Knoten
    sind separat geladen, aber nicht in m_lDlpl.
    """
    sim = loaded.simulator
    assert len(sim.m_lDlpl) == 4


def test_simulator_has_ressourcen(loaded: LoadResult) -> None:
    sim = loaded.simulator
    assert len(sim.m_lRessBeleg) == 13  # 8 Maschinen + 5 Personen


def test_simulator_period_settings_loaded(loaded: LoadResult) -> None:
    sim = loaded.simulator
    assert sim.m_periodLen == 86400
    assert sim.m_keim == 1776496601


def test_simulator_m_b_is_ent_aktiv_loaded(loaded: LoadResult) -> None:
    """Embb-OTX hat `m_bIsEntAktiv;TRUE` — muss als True am PSimulator ankommen.

    Vor dem Fix (Diagnose vom 2026-05-20) fehlte das Attribut in
    `_ASimulatorHandler.SCALARS`; der Loader las den Wert nicht und der
    Python-Default `False` blieb. Folge: alle Entscheider-Hooks blieben
    latent — auch dort wo das Modell sie aktiv haben wollte (z.B. Bosch2).
    """
    sim = loaded.simulator
    assert sim.m_bIsEntAktiv is True


# ----------------------------------------------------------------------
# Wiring — Plan + Knoten + Kanten
# ----------------------------------------------------------------------


def test_plan_has_knoten_and_kanten(loaded: LoadResult) -> None:
    """Erster Plan hat seine Knoten + Kanten, Start + End gesetzt."""
    plan = loaded.simulator.m_lDlpl[0]
    assert plan.m_sName.startswith("Durchlaufplan")
    assert len(plan.m_lKnoten) > 0
    assert len(plan.m_lKanten) > 0
    assert plan.m_lStartKante is not None
    assert plan.m_lEndKante is not None


def test_knoten_have_class_specific_attributes(loaded: LoadResult) -> None:
    """PDpKnMengeRuesten muss Dfz und Rüstzeit gesetzt haben."""
    from osim_engine.pps.knoten.zeitvorgabe import PDpKnMengeRuesten
    knoten_21 = next(
        obj for obj in loaded.instances.values()
        if isinstance(obj, PDpKnMengeRuesten) and obj.m_sName == "Knoten 21"
    )
    # Werte aus Embb-Modell (verifiziert via direkter OTX-Inspektion)
    assert knoten_21.m_iDfzProEinheit > 0
    assert knoten_21.m_iRuestzeit >= 0


def test_kante_has_neighbor_lists(loaded: LoadResult) -> None:
    plan = loaded.simulator.m_lDlpl[0]
    sk = plan.m_lStartKante
    assert sk is not None
    assert len(sk.m_lNachfolger) > 0
    # Erster Nachfolger ist ein Knoten desselben Plans
    assert sk.m_lNachfolger[0] in plan.m_lKnoten


def test_ausloeser_has_plan_reference(loaded: LoadResult) -> None:
    a = loaded.simulator.m_lAusl[0]
    assert a.m_lDlpl is not None
    # Plan ist einer der Top-Level oder Sub-Pläne
    from osim_engine.pps.durchlaufplan import PDurchlaufplan
    assert isinstance(a.m_lDlpl, PDurchlaufplan)


def test_ausloeser_has_parameters(loaded: LoadResult) -> None:
    """Embb-Auslöser tragen mind. einen PParameterMenge."""
    from osim_engine.pps.parameter import PParameterMenge
    a = loaded.simulator.m_lAusl[0]
    assert len(a.m_lParameter) >= 1
    assert any(isinstance(p, PParameterMenge) for p in a.m_lParameter)


# ----------------------------------------------------------------------
# Sim startet ohne Crash
# ----------------------------------------------------------------------


def test_loaded_simulator_starts_without_exception() -> None:
    """Sim.start() läuft durch — auch wenn keine Events fallen
    (Auslöser-Beginn liegt in Periode 2, Default ist 1 Periode).
    """
    result = load_otx_file(PRE_FILE)
    result.simulator.start()
    # Eine Periode lief durch
    assert result.simulator.m_periodNum >= 1


# ----------------------------------------------------------------------
# Reset zwischen Tests — Loader nicht über Modul-Singleton
# ----------------------------------------------------------------------


def test_each_load_returns_fresh_simulator() -> None:
    """Zwei separate load_otx_file-Calls → zwei verschiedene Simulator-Objekte."""
    r1 = load_otx_file(PRE_FILE)
    r2 = load_otx_file(PRE_FILE)
    assert r1.simulator is not r2.simulator
    assert len(r1.simulator.m_lAusl) == len(r2.simulator.m_lAusl) == 70


# ----------------------------------------------------------------------
# Robustheit
# ----------------------------------------------------------------------


def test_unknown_class_does_not_crash() -> None:
    """Ein OTX mit einer unbekannten Klasse wird sauber als unsupported gezählt."""
    from osim_engine.io.otx_reader import OtxFile, OtxObject
    otx = OtxFile(declared_count=1)
    fake = OtxObject(klass="PUnknownClass", oid=42, attrs={"m_sName": "X"})
    otx.top_level = [fake]
    otx.by_oid = {42: fake}
    loader = OtxLoader()
    result = loader.load(otx)
    assert result.unsupported["PUnknownClass"] == 1
    assert result.loaded.get("PUnknownClass", 0) == 0
    assert result.warnings == []
