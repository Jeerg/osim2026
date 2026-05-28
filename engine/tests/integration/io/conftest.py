"""Fixtures für OTX-Roundtrip-Integrationstests.

Stellt drei OTX-Fixtures bereit:

  - `embb_pre_run_otx_path` — aus `engine/tests/fixtures/otx/` (immer
    verfügbar, im Repo committed).
  - `dummy_otx_path` — aus dem OSim2004-Vorstellung04-Verzeichnis
    (`C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04/Dummy.otx`).
    Skipt automatisch, wenn das Verzeichnis nicht erreichbar ist (CI ohne
    Original-OSim2004-Checkout).
  - `fertigungsstruktur1_otx_path` — analog für
    `Fertigungsstruktur1_mit_AslFj.otx`.

Die externen Fixtures werden NICHT ins Repo kopiert — Tests bekommen den
Original-Pfad und parsen direkt.
"""

from __future__ import annotations

from pathlib import Path

import pytest


# Path-Helper: in-repo Fixtures
_IN_REPO_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "otx"

# OSim2004-Vorstellung04: kanonische Beispielmodelle
_OSIM2004_VORSTELLUNG04 = Path(
    "C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04"
)


@pytest.fixture(scope="session")
def embb_pre_run_otx_path() -> Path:
    """Pre-Run-Snapshot des Embb-AslFj-Modells (im Repo, ~1480 OIDs)."""
    path = _IN_REPO_FIXTURES / "embb_pre_run.otx"
    if not path.exists():
        pytest.skip(f"In-repo fixture missing: {path}")
    return path


@pytest.fixture(scope="session")
def dummy_otx_path() -> Path:
    """Pfad zum Dummy.otx aus OSim2004/Vorstellung04 — sonst Skip."""
    path = _OSIM2004_VORSTELLUNG04 / "Dummy.otx"
    if not path.exists():
        pytest.skip(f"OSim2004 fixture not available: {path}")
    return path


@pytest.fixture(scope="session")
def fertigungsstruktur1_otx_path() -> Path:
    """Pfad zum Fertigungsstruktur1_mit_AslFj.otx — sonst Skip."""
    path = _OSIM2004_VORSTELLUNG04 / "Fertigungsstruktur1_mit_AslFj.otx"
    if not path.exists():
        pytest.skip(f"OSim2004 fixture not available: {path}")
    return path


# ----------------------------------------------------------------------
# Phase 01.3 W3 — PAssozMenge-Familie (Plan 01.3-04, AUDIT Sektion 5.2:
# konstruiertes pytest-Fixture analog test_v5_material._make_lager etc.).
# ----------------------------------------------------------------------


def build_passozmenge_demo_sim():
    """Baut einen minimalen PSimulator mit allen 4 konkreten PAssozMenge-
    Subklassen, jeweils an einem eigenen V1-Top-Level-Knoten, mit zwei
    PRessMenge-Lagern (eines fuer Erzgt+Verbr, eines fuer VerbrZwischen+Abfr).

    Aufbau:
        - 2 PRessMenge: L1 (Bestand=10, unlim), L2 (Bestand=10, unlim)
        - 4 PDpKnKonstant: KE / KV / KZ / KA mit Dauer 10/20/30/40
        - 4 PAssozMenge-Instanzen (1 pro Subklasse):
            KE → PAssozMengeErzgt(m_iMengeAus=2)        → L1
            KV → PAssozMengeVerbr(m_iMengeEin=3)        → L1
            KZ → PAssozMengeVerbrZwischen(m_iMengeEin=1)→ L2
            KA → PAssozMengeAbfr(m_iMengeAbfr=4)        → L2
        - 4 PAslEinzel (1 pro Knoten, Trigger-Termine 10/20/30/40)

    Total: 13 Sim-Objekte + ASimulator (Wurzel) = 14 OTX-Eintraege.
    """
    from osim_engine.pps.ausloeser.einzel import PAslEinzel
    from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.assoziation.menge import (
        PAssozMengeAbfr,
        PAssozMengeErzgt,
        PAssozMengeVerbr,
        PAssozMengeVerbrZwischen,
    )
    from osim_engine.resources.menge import PRessMenge

    sim = PSimulator()

    l1 = PRessMenge(sim)
    l1.m_sName = "L1"
    l1.m_iBestandAnfang = 10
    l1.m_iBestandMax = -1
    sim.register_ress_menge(l1)

    l2 = PRessMenge(sim)
    l2.m_sName = "L2"
    l2.m_iBestandAnfang = 10
    l2.m_iBestandMax = -1
    sim.register_ress_menge(l2)

    def _knoten(name: str, dauer: int) -> PDpKnKonstant:
        k = PDpKnKonstant(sim)
        k.m_sName = name
        k.m_iDurchfuehrungszeit = dauer
        sim.register_knoten(k)
        return k

    ke = _knoten("KE", 10)
    kv = _knoten("KV", 20)
    kz = _knoten("KZ", 30)
    ka = _knoten("KA", 40)

    erzgt = PAssozMengeErzgt(sim)
    erzgt.m_sName = "e_KE_L1"
    erzgt.m_lMengRess = l1
    erzgt.m_iMengeAus = 2
    ke.add_assoziation(erzgt)

    verbr = PAssozMengeVerbr(sim)
    verbr.m_sName = "v_KV_L1"
    verbr.m_lMengRess = l1
    verbr.m_iMengeEin = 3
    kv.add_assoziation(verbr)

    vzw = PAssozMengeVerbrZwischen(sim)
    vzw.m_sName = "z_KZ_L2"
    vzw.m_lMengRess = l2
    vzw.m_iMengeEin = 1
    kz.add_assoziation(vzw)

    abfr = PAssozMengeAbfr(sim)
    abfr.m_sName = "a_KA_L2"
    abfr.m_lMengRess = l2
    abfr.m_iMengeAbfr = 4
    ka.add_assoziation(abfr)

    for i, kn in enumerate((ke, kv, kz, ka), start=1):
        asl = PAslEinzel(sim)
        asl.m_sName = f"asl_{kn.m_sName}"
        asl.m_iBeginTermin = 10 * i
        asl.m_lDlpl = kn
        sim.register_ausloeser(asl)

    return sim


@pytest.fixture(scope="session")
def passozmenge_minimal_otx_path() -> Path:
    """Im-Repo committed Demo-OTX mit allen 4 PAssozMenge-Subklassen.

    Datei: engine/tests/fixtures/otx/passozmenge_minimal.otx (programmatisch
    via `build_passozmenge_demo_sim()` + dump_simulator_to_otx erzeugt,
    siehe scripts/build_passozmenge_minimal_fixture.py).
    """
    path = _IN_REPO_FIXTURES / "passozmenge_minimal.otx"
    if not path.exists():
        pytest.skip(f"In-repo fixture missing: {path}")
    return path
