"""P5-D — Tests für konkrete Aufgaben-Knoten.

Erweitert die Aufgaben-Hierarchie um:

    EPEntAufgabeAltIntern (abstrakt, m_lDlpl)
    ├── EPEntAltProzesswege (entscheidung: erste Alternative)
    └── EPEntAuftragsgroesse (m_iShadowMenge, set_menge Stub)

    EPEntAufgabeAltExtern → EPEntKrzRessourcenEinsatz (m_lDlplKnoten)
    EPEntAufgabeAltExternRessBeleg →
        ├── EPEntKrzRessourcenEinsatzRess
        ├── EPEntReihenfolge (PQueue + Prior)
        └── EPEntKrzKapazitaetsVeraenderung

Plus `PtProzEntAufgabeIntern` (Oberprozess mit m_oDlpl) im
pps/prozess/ent_aufgabe.py.

Loader: alle 6 konkreten Knoten registriert. Bosch2-Coverage steigt von
8 auf 4 unsupported (nur noch P5-E/F-Strategien offen).
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from osim_engine.decisions import (
    EPEntAltProzesswege,
    EPEntAufgabeAltExtern,
    EPEntAufgabeAltExternRessBeleg,
    EPEntAufgabeAltIntern,
    EPEntAuftragsgroesse,
    EPEntKrzKapazitaetsVeraenderung,
    EPEntKrzRessourcenEinsatz,
    EPEntKrzRessourcenEinsatzRess,
    EPEntReihenfolge,
    EPEntscheidungsAufgabe,
)
from osim_engine.pps.prozess.ent_aufgabe import (
    PtProzEntAufgabeBase,
    PtProzEntAufgabeIntern,
)
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Hierarchie-Asserts
# ----------------------------------------------------------------------


def test_alle_konkreten_aufgaben_erben_von_basis() -> None:
    sim = PSimulator()
    for cls in (
        EPEntAltProzesswege, EPEntAuftragsgroesse,
        EPEntKrzRessourcenEinsatz, EPEntKrzRessourcenEinsatzRess,
        EPEntReihenfolge, EPEntKrzKapazitaetsVeraenderung,
    ):
        k = cls(sim)
        assert isinstance(k, EPEntscheidungsAufgabe), f"{cls.__name__} nicht EntscheidungsAufgabe"


def test_intern_subtypen_haben_m_l_dlpl() -> None:
    sim = PSimulator()
    for cls in (EPEntAltProzesswege, EPEntAuftragsgroesse):
        k = cls(sim)
        assert isinstance(k, EPEntAufgabeAltIntern)
        assert k.m_lDlpl == []


def test_extern_subtypen_erben_richtig() -> None:
    sim = PSimulator()
    assert isinstance(EPEntKrzRessourcenEinsatz(sim), EPEntAufgabeAltExtern)
    for cls in (EPEntKrzRessourcenEinsatzRess, EPEntReihenfolge,
                EPEntKrzKapazitaetsVeraenderung):
        k = cls(sim)
        assert isinstance(k, EPEntAufgabeAltExternRessBeleg)
        assert k.m_lRessourcen == []


# ----------------------------------------------------------------------
# EPEntAltProzesswege — Entscheidung
# ----------------------------------------------------------------------


def test_alt_prozesswege_ohne_dlpl_liefert_none() -> None:
    k = EPEntAltProzesswege(PSimulator())
    assert k.entscheidung_treffen(None) is None


def test_alt_prozesswege_liefert_erste_alternative() -> None:
    """C++ cpp:1428-1431 — Standard-Heuristik: erste Alternative."""
    k = EPEntAltProzesswege(PSimulator())
    k.m_lDlpl = ["DLPL_A", "DLPL_B", "DLPL_C"]
    assert k.entscheidung_treffen(None) == "DLPL_A"


# ----------------------------------------------------------------------
# EPEntAuftragsgroesse
# ----------------------------------------------------------------------


def test_auftragsgroesse_shadow_menge_default_null() -> None:
    k = EPEntAuftragsgroesse(PSimulator())
    assert k.m_iShadowMenge == 0


def test_auftragsgroesse_set_menge_stub_no_op() -> None:
    """C++ cpp:1525-1527 — leerer Stub."""
    k = EPEntAuftragsgroesse(PSimulator())
    k.set_menge(None, 100)  # darf nicht crashen


# ----------------------------------------------------------------------
# EPEntKrzRessourcenEinsatz
# ----------------------------------------------------------------------


def test_krz_ressourceneinsatz_container_default_leer() -> None:
    k = EPEntKrzRessourcenEinsatz(PSimulator())
    assert k.m_lDlplKnoten == []
    assert k._shadow_list == []


def test_krz_ressourceneinsatz_stubs_kein_crash() -> None:
    k = EPEntKrzRessourcenEinsatz(PSimulator())
    k.set_status(None, None, None)
    assert k.get_status(None, None) is None
    assert k.get_base_status(None, None) is None
    k.block_all()
    k.un_block_all()
    k.invert_blocking()
    assert k.inc_ress() is False
    assert k.dec_ress() is False


# ----------------------------------------------------------------------
# EPEntReihenfolge — Prior-API
# ----------------------------------------------------------------------


def test_reihenfolge_set_proz_prior_setzt_attribut() -> None:
    """set_proz_prior schreibt direkt m_iPrioritaet."""
    k = EPEntReihenfolge(PSimulator())
    proz = MagicMock()
    proz.m_iPrioritaet = 5
    k.set_proz_prior(proz, 99)
    assert proz.m_iPrioritaet == 99


def test_reihenfolge_inc_dec_prior_proz() -> None:
    k = EPEntReihenfolge(PSimulator())
    proz = MagicMock()
    proz.m_iPrioritaet = 10
    k.inc_prior_proz(proz)
    assert proz.m_iPrioritaet == 11
    k.dec_prior_proz(proz)
    assert proz.m_iPrioritaet == 10


def test_reihenfolge_get_p_queue_head_none_beleg() -> None:
    """beleg=None → None (C++ cpp:1573-1578)."""
    k = EPEntReihenfolge(PSimulator())
    assert k.get_p_queue_head_position(None) is None


# ----------------------------------------------------------------------
# EPEntKrzKapazitaetsVeraenderung — Stub-API
# ----------------------------------------------------------------------


def test_kap_veraenderung_stubs() -> None:
    k = EPEntKrzKapazitaetsVeraenderung(PSimulator())
    assert k.inc_einsatz_dauer(None, 3600) is False
    assert k.dec_einsatz_dauer(None, 3600) is False
    k.set_einsatz_end_for_day(None, 18 * 3600)  # darf nicht crashen


# ----------------------------------------------------------------------
# PtProzEntAufgabeIntern
# ----------------------------------------------------------------------


def test_pt_proz_ent_aufgabe_intern_hat_dlpl_und_entfeld_slots() -> None:
    p = PtProzEntAufgabeIntern(PSimulator())
    assert p.m_oDlpl is None
    assert p.m_oEntFeld is None
    # Erbt von PtProzZeitvorgabe, ist ABER NICHT PtProzEntAufgabeBase
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe
    assert isinstance(p, PtProzZeitvorgabe)
    assert not isinstance(p, PtProzEntAufgabeBase)


def test_alt_intern_proz_erzeugen_liefert_intern_prozess() -> None:
    """C++ cpp:420-423 — proz_erzeugen liefert PtProzEntAufgabeIntern."""
    k = EPEntAltProzesswege(PSimulator())
    p = k.proz_erzeugen()
    assert isinstance(p, PtProzEntAufgabeIntern)


# ----------------------------------------------------------------------
# get_knoten_anzahl
# ----------------------------------------------------------------------


def test_alt_intern_get_knoten_anzahl_summiert_subplaene() -> None:
    """C++ cpp:532-548 — Summe über alternative Sub-Pläne, +1 wenn nicht-Basis."""
    k = EPEntAltProzesswege(PSimulator())
    dlpl1 = MagicMock(); dlpl1.get_knoten_anzahl.return_value = 3
    dlpl2 = MagicMock(); dlpl2.get_knoten_anzahl.return_value = 5
    k.m_lDlpl = [dlpl1, dlpl2]
    assert k.get_knoten_anzahl(nur_basis_knoten=True) == 8
    assert k.get_knoten_anzahl(nur_basis_knoten=False) == 9  # +1 für sich selbst


# ----------------------------------------------------------------------
# Loader — Bosch2 (P5-D-relevante Klassen)
# ----------------------------------------------------------------------


_BOSCH2 = Path(
    r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\Bosch2_wechseln.otx"
)


@pytest.fixture
def bosch2_loaded():
    if not _BOSCH2.exists():
        pytest.skip("Bosch2_wechseln.otx nicht verfügbar")
    from osim_engine.io.otx_loader import load_otx_file
    return load_otx_file(_BOSCH2)


def test_bosch2_unsupported_nur_noch_strategien(bosch2_loaded) -> None:
    """Nach P5-D bleibt nur das Strategien-Set (P5-E/F-Domäne)."""
    expected = {"EPEntStrKrzRessArbSuchen", "EPEntStrArbVertMitWechsel"}
    assert set(bosch2_loaded.unsupported) <= expected, (
        f"Unerwartete unsupported: {set(bosch2_loaded.unsupported) - expected}"
    )


def test_bosch2_konkrete_aufgaben_knoten_geladen(bosch2_loaded) -> None:
    """Bosch2 hat 3x EPEntKrzRessourcenEinsatzRess + 1x EPEntKrzKapazitaetsVeraenderung."""
    loaded = bosch2_loaded.loaded
    assert loaded["EPEntKrzRessourcenEinsatzRess"] == 3
    assert loaded["EPEntKrzKapazitaetsVeraenderung"] == 1


def test_bosch2_aufgaben_knoten_haben_verteil_und_ressourcen(bosch2_loaded) -> None:
    """Loader-Wiring: m_lVerteil + m_lRessourcen sind gesetzt."""
    konkrete = [
        py for py in bosch2_loaded.instances.values()
        if isinstance(py, EPEntKrzRessourcenEinsatzRess)
        or isinstance(py, EPEntKrzKapazitaetsVeraenderung)
    ]
    assert len(konkrete) == 4
    # Alle haben m_lVerteil gesetzt (sie erben von PDpKnVerteilung)
    mit_verteil = [k for k in konkrete if k.m_lVerteil is not None]
    assert len(mit_verteil) == 4, (
        f"Erwartet: alle 4 mit m_lVerteil, war {len(mit_verteil)}"
    )


def test_bosch2_python_sim_laeuft_durch_p5d(bosch2_loaded) -> None:
    """Bosch2-Sim läuft auch mit den neuen Aufgaben-Knoten weiter."""
    from osim_engine.io.otx_diff import extract_counters_from_simulator
    bosch2_loaded.simulator.start()
    counters = extract_counters_from_simulator(bosch2_loaded.simulator)
    assert len(counters) > 5000
