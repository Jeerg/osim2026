"""P5-E — Tests für rsv-Strategien (kurzfristiger Ressourceneinsatz).

Klassen aus `OSimPro/EPStrategie.{odh:63-369, cpp:60-1543}`:

    EPEntStrategie
    └── EPEntStrKrzRessBase           (KrzBaseReak-Enum)
        ├── EPEntStrKrzRessBedarf
        └── EPEntStrKrzRessArbSuchen  (KrzBaseKnotenWaehlen-Enum + 3 Helper-Listen)

Helper-Klassen:
- EPEntStrKrzRessGroupInfoList     (add/remove/lookup nach Source/Dest-Group)
- EPEntStrKrzRessZuordnungsInfoList (add mit Counter-Akkumulation)
- EPEntStrKrzRessStatusInfoList     (add für Status-Restore)

Tests sichern:
- Enum-Werte 1:1 zu C++
- Helper-Listen-API
- creat_std_informations_system mit den richtigen Property-Namen
- bedingungen_pruefen-Heuristik
- Lifecycle (on_sim_begin clearing der Helper-Listen)
- Bosch2-Loader-Coverage
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from osim_engine.decisions import (
    AssozBelegLinkStatus,
    EPEntStrategie,
    EPEntStrKrzRessArbSuchen,
    EPEntStrKrzRessBase,
    EPEntStrKrzRessBedarf,
    EPEntStrKrzRessGroupInfoList,
    EPEntStrKrzRessStatusInfoList,
    EPEntStrKrzRessZuordnungsInfoList,
    KrzBaseKnotenWaehlen,
    KrzBaseReak,
)
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Enums
# ----------------------------------------------------------------------


def test_krz_base_reak_werte() -> None:
    """C++ EPStrategie.odh:77-85 — Default-Reihenfolge 0..5."""
    assert KrzBaseReak.KBR_MAX_BRACH == 0
    assert KrzBaseReak.KBR_MIN_PROZ == 1
    assert KrzBaseReak.KBR_MIN_ARBINHALT == 2
    assert KrzBaseReak.KBR_MAX_QUALI == 3
    assert KrzBaseReak.KBR_MIN_QUALI == 4
    assert KrzBaseReak.KBR_MIN_ZST_QUALI == 5


def test_krz_base_knoten_waehlen_werte() -> None:
    """C++ EPStrategie.odh:264-271 — 4 Wahlmuster."""
    assert KrzBaseKnotenWaehlen.KBS_MAX_PROZ == 0
    assert KrzBaseKnotenWaehlen.KBS_MAX_ARBINHALT == 1
    assert KrzBaseKnotenWaehlen.KBS_MAX_EGL_ARBINHALT == 2
    assert KrzBaseKnotenWaehlen.KBS_MAX_AUSLASTUNG == 3


def test_assoz_beleg_link_status_werte() -> None:
    """C++ PAssozRessource.odh:150-157."""
    assert AssozBelegLinkStatus.ABL_BLOCKED == 0
    assert AssozBelegLinkStatus.ABL_IF_NEEDED == 1
    assert AssozBelegLinkStatus.ABL_STD == 2
    assert AssozBelegLinkStatus.ABL_PREFER == 3


# ----------------------------------------------------------------------
# Helper-Listen
# ----------------------------------------------------------------------


def test_group_info_list_add_und_lookup() -> None:
    gl = EPEntStrKrzRessGroupInfoList()
    gl.add("beleg1", "Source-A", "Dest-X")
    gl.add("beleg2", "Source-A", "Dest-Y")
    gl.add("beleg3", "Source-B", "Dest-X")
    assert gl.get_anzahl_abordnungen("Source-A") == 2
    assert gl.get_anzahl_abordnungen("Source-B") == 1
    assert gl.get_anzahl_zuordnungen("Dest-X") == 2
    assert gl.is_group_dest_grupe("Dest-X") is True
    assert gl.is_group_dest_grupe("Source-A") is False  # ist Source, nicht Dest


def test_group_info_list_remove_by_beleg() -> None:
    gl = EPEntStrKrzRessGroupInfoList()
    gl.add("beleg1", "Source", "Dest")
    gl.add("beleg2", "Source", "Dest")
    assert len(gl) == 2
    gl.remove_by_beleg("beleg1")
    assert len(gl) == 1
    assert gl[0].m_oRessBeleg == "beleg2"


def test_group_info_list_remove_by_group_name() -> None:
    """Entfernt nur die erste passende — C++-Semantik (cpp:627-641)."""
    gl = EPEntStrKrzRessGroupInfoList()
    gl.add("b1", "GA", "DX")
    gl.add("b2", "GB", "DY")
    gl.add("b3", "GA", "DZ")
    gl.remove_by_group_name("GA")
    assert len(gl) == 2
    assert gl[0].m_oRessBeleg == "b2"


def test_zuordnungs_info_list_add_akkumuliert() -> None:
    """add() mehrmals auf gleichen Beleg → m_iAnzahl++."""
    zl = EPEntStrKrzRessZuordnungsInfoList()
    zl.add("b1")
    zl.add("b1")
    zl.add("b1")
    zl.add("b2")
    assert zl.get_anzahl_zuordnungen("b1") == 3
    assert zl.get_anzahl_zuordnungen("b2") == 1
    assert zl.get_anzahl_zuordnungen("unbekannt") == 0


def test_status_info_list_add() -> None:
    sl = EPEntStrKrzRessStatusInfoList()
    sl.add("dest", "source", AssozBelegLinkStatus.ABL_STD, 3600)
    assert len(sl) == 1
    assert sl[0].m_eLinkStatus == AssozBelegLinkStatus.ABL_STD
    assert sl[0].m_iRuecksetzZeitspanne == 3600


# ----------------------------------------------------------------------
# EPEntStrKrzRessBase
# ----------------------------------------------------------------------


def test_base_defaults() -> None:
    """C++ EPStrategie.odh:91-97."""
    s = EPEntStrKrzRessBase(PSimulator())
    assert s.m_eReaktion == KrzBaseReak.KBR_MIN_PROZ
    assert s.m_iAnzahl == 1
    assert s.m_bRuecksetzenNachZeitspanne is False
    assert s.m_iRuecksetzZeitspanne == 7200
    assert s.m_iZstSpanne == 3600


def test_base_creat_std_ziel_system_none() -> None:
    """C++ cpp:72-75 — Basis liefert None."""
    s = EPEntStrKrzRessBase(PSimulator())
    assert s.creat_std_ziel_system() is None


def test_base_creat_std_informations_system() -> None:
    """C++ cpp:76-120 — 5 PRessBeleg-Properties."""
    s = EPEntStrKrzRessBase(PSimulator())
    infsys = s.creat_std_informations_system()
    assert len(infsys.m_lInformationen) == 5
    namen = [info.m_sPropertyClassName for info in infsys.m_lInformationen]
    assert "GetZstBrachzeit" in namen
    assert "GetZstWartProzesse" in namen
    assert "GetZstQualifikationselemente" in namen


def test_base_treffe_entscheidung_inaktiv_liefert_none() -> None:
    s = EPEntStrKrzRessBase(PSimulator())
    s.m_bEntscheidungAktivieren = False
    assert s.treffe_entscheidung(None, None, None) is None


def test_base_get_ausloeser_id_default_null() -> None:
    s = EPEntStrKrzRessBase(PSimulator())
    assert s.get_ausloeser_id(None) == 0


def test_base_treffe_ent_fuer_knoten_verzweigt_nach_id() -> None:
    """id=2 → zuordnung_ruecknehmen, sonst ress_zuordnen. cpp:201-218."""
    s = EPEntStrKrzRessBase(PSimulator())
    s.m_iAnzahl = 3
    s.ress_zuordnen = MagicMock()
    s.zuordnung_ruecknehmen = MagicMock()
    s.get_ausloeser_id = MagicMock(return_value=1)

    s.treffe_ent_fuer_knoten(None, None, None, None)
    assert s.ress_zuordnen.call_count == 3
    assert s.zuordnung_ruecknehmen.call_count == 0

    s.ress_zuordnen.reset_mock()
    s.zuordnung_ruecknehmen.reset_mock()
    s.get_ausloeser_id = MagicMock(return_value=2)
    s.treffe_ent_fuer_knoten(None, None, None, None)
    assert s.ress_zuordnen.call_count == 0
    assert s.zuordnung_ruecknehmen.call_count == 3


# ----------------------------------------------------------------------
# EPEntStrKrzRessBedarf
# ----------------------------------------------------------------------


def test_bedarf_defaults() -> None:
    """C++ EPStrategie.odh:142-144."""
    s = EPEntStrKrzRessBedarf(PSimulator())
    assert s.m_iProzAnzahl == 10
    assert s.m_dArbInhalt == 13500.0
    assert s.m_dDstAuslastung == 95.0


def test_bedarf_creat_std_informations_system_erweitert_base() -> None:
    """C++ cpp:414-454 — Basis (5) + Bedarf (3) = 8 Infos."""
    s = EPEntStrKrzRessBedarf(PSimulator())
    infsys = s.creat_std_informations_system()
    assert len(infsys.m_lInformationen) == 8
    namen = [info.m_sPropertyClassName for info in infsys.m_lInformationen]
    assert "GetZstAnzWartProz" in namen
    assert "GetZstAuslastungAssozRess" in namen


def test_bedarf_bedingungen_pruefen_ohne_infosys_false() -> None:
    s = EPEntStrKrzRessBedarf(PSimulator())
    from osim_engine.decisions.entscheidung import EPEntFeld
    ef = EPEntFeld()
    # m_oEntInf ist None
    assert s.bedingungen_pruefen(None, ef, None) is False


def test_bedarf_bedingungen_pruefen_schwellwert_ueberschritten() -> None:
    """Schwellwert für Prozess-Anzahl überschritten → True."""
    from osim_engine.decisions.entscheidung import EPEntFeld
    s = EPEntStrKrzRessBedarf(PSimulator())
    s.m_iProzAnzahl = 5
    infsys = s.creat_std_informations_system()
    ef = EPEntFeld()
    ef.m_oEntInf = infsys

    # Knoten-Mock mit GetZstAnzWartProz = 10
    knoten = MagicMock()
    knoten.GetZstAnzWartProz.return_value = 10
    assert s.bedingungen_pruefen(knoten, ef, None) is True

    # Knoten-Mock mit GetZstAnzWartProz = 3 → unter Schwellwert
    knoten2 = MagicMock()
    knoten2.GetZstAnzWartProz.return_value = 3
    knoten2.GetZstArbInWartProz.return_value = 0
    knoten2.GetZstAuslastungAssozRess.return_value = 0
    assert s.bedingungen_pruefen(knoten2, ef, None) is False


# ----------------------------------------------------------------------
# EPEntStrKrzRessArbSuchen
# ----------------------------------------------------------------------


def test_arb_suchen_defaults() -> None:
    """C++ EPStrategie.odh:284-305."""
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    assert s.m_bGegenrechnen is True
    assert s.m_bWechselAuchNachZuordnung is False
    assert s.m_eWahlverhalten == KrzBaseKnotenWaehlen.KBS_MAX_ARBINHALT
    assert s.m_iErlaubteWechselProGruppe == -1
    assert s.m_iBrachDistance == 3600
    assert s.m_iBrachLevel == 10


def test_arb_suchen_helper_listen_initialisiert() -> None:
    """Drei Helper-Listen mit m_oParent = self."""
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    assert isinstance(s.m_lEPEntStrKrzRessGroupInfoList, EPEntStrKrzRessGroupInfoList)
    assert isinstance(s.m_lEPEntStrKrzRessStatusInfoList, EPEntStrKrzRessStatusInfoList)
    assert isinstance(s.m_lEPEntStrKrzRessZuordnungsInfoList, EPEntStrKrzRessZuordnungsInfoList)
    assert s.m_lEPEntStrKrzRessGroupInfoList.m_oParent is s
    assert s.m_lEPEntStrKrzRessStatusInfoList.m_oParent is s
    assert s.m_lEPEntStrKrzRessZuordnungsInfoList.m_oParent is s


def test_arb_suchen_on_sim_begin_clears_helper_lists() -> None:
    """C++ cpp:362-368."""
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    s.m_lEPEntStrKrzRessGroupInfoList.add("b1", "S", "D")
    s.m_lEPEntStrKrzRessZuordnungsInfoList.add("b1")
    s.m_lEPEntStrKrzRessStatusInfoList.add("d", "s", AssozBelegLinkStatus.ABL_STD, 100)
    s._sDumperStr = "noise"
    s.on_sim_begin(None, deep=True)
    assert len(s.m_lEPEntStrKrzRessGroupInfoList) == 0
    assert len(s.m_lEPEntStrKrzRessZuordnungsInfoList) == 0
    assert len(s.m_lEPEntStrKrzRessStatusInfoList) == 0
    assert s._sDumperStr == ""


def test_arb_suchen_is_beleg_in_ausg_list() -> None:
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    beleg = object()
    assert s.is_beleg_in_ausg_list(beleg) is False
    s._lTmpAusgBeleg.append(beleg)
    assert s.is_beleg_in_ausg_list(beleg) is True


def test_arb_suchen_get_erlaubte_wechsel_unbegrenzt() -> None:
    """m_iErlaubteWechselProGruppe=-1 → "unbegrenzt"."""
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    assert s.get_erlaubte_wechsel_pro_gruppe(None) == 999999


def test_arb_suchen_get_erlaubte_wechsel_beschraenkt() -> None:
    """Mit Gruppen-Counter."""
    s = EPEntStrKrzRessArbSuchen(PSimulator())
    s.m_iErlaubteWechselProGruppe = 5
    beleg = MagicMock()
    beleg.m_sGruppenName = "GroupA"
    s.m_lEPEntStrKrzRessGroupInfoList.add(beleg, "GroupA", "GroupB")
    s.m_lEPEntStrKrzRessGroupInfoList.add(beleg, "GroupA", "GroupC")
    # 5 - 2 (Abordnungen aus GroupA) = 3
    assert s.get_erlaubte_wechsel_pro_gruppe(beleg) == 3


# ----------------------------------------------------------------------
# EPEntStrategie — Helper
# ----------------------------------------------------------------------


def test_strategie_creat_info_from_property_name_prefix() -> None:
    """C++ cpp:34 — 'Get'-Prefix wird entfernt, dann Parent-Class in Klammern."""
    s = EPEntStrKrzRessBase(PSimulator())
    info = s.creat_info_from_property("GetZstBrachzeit", "PRessBeleg")
    assert info.m_sName == "ZstBrachzeit(PRessBeleg)"
    assert info.m_sPropertyClassName == "GetZstBrachzeit"
    assert info.m_sParentClassName == "PRessBeleg"


def test_strategie_get_auspraegung_von_info_ruft_methode_auf() -> None:
    """get_auspraegung_von_info verwendet getattr statt Reflection."""
    s = EPEntStrKrzRessBase(PSimulator())
    info = s.creat_info_from_property("GetZstWartProzesse", "PRessBeleg")
    sobj = MagicMock()
    sobj.GetZstWartProzesse.return_value = 42
    assert s.get_auspraegung_von_info(sobj, info) == 42.0


def test_strategie_get_auspraegung_fehlende_methode_liefert_null() -> None:
    """Defensive: getattr-Fehler → 0.0 statt OException."""
    s = EPEntStrKrzRessBase(PSimulator())
    info = s.creat_info_from_property("GetFremd", "Foo")
    assert s.get_auspraegung_von_info(object(), info) == 0.0


# ----------------------------------------------------------------------
# Loader — Bosch2
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


def test_bosch2_arbsuchen_strategien_geladen(bosch2_loaded) -> None:
    """Bosch2 hat 3× EPEntStrKrzRessArbSuchen — alle 3 sollen geladen sein."""
    assert bosch2_loaded.loaded["EPEntStrKrzRessArbSuchen"] == 3
    arb_suchen = [
        s for s in bosch2_loaded.simulator.m_lEntStrategie
        if isinstance(s, EPEntStrKrzRessArbSuchen)
    ]
    assert len(arb_suchen) == 3


def test_bosch2_unsupported_nur_noch_arb_vert_mit_wechsel(bosch2_loaded) -> None:
    """Nach P5-E bleibt nur EPEntStrArbVertMitWechsel offen (P5-F)."""
    assert set(bosch2_loaded.unsupported) <= {"EPEntStrArbVertMitWechsel"}


def test_bosch2_ent_feld_strategie_aufgeloest(bosch2_loaded) -> None:
    """EPEntFeld.m_oEntStrategie wird jetzt resolved (statt None)."""
    from osim_engine.decisions.entscheidung import EPEntFeld
    felder = [
        py for py in bosch2_loaded.instances.values()
        if isinstance(py, EPEntFeld)
    ]
    mit_strat = [f for f in felder if f.m_oEntStrategie is not None]
    # Mind. 3 von 4 EntFeldern müssten jetzt eine Strategie haben (3 ArbSuchen
    # geladen, das 4. ist EPEntStrArbVertMitWechsel — noch unsupported)
    assert len(mit_strat) >= 3


def test_bosch2_python_sim_laeuft_durch_p5e(bosch2_loaded) -> None:
    """Bosch2-Sim läuft mit geladenen Strategien (m_bIsEntAktiv=False)."""
    from osim_engine.io.otx_diff import extract_counters_from_simulator
    bosch2_loaded.simulator.start()
    counters = extract_counters_from_simulator(bosch2_loaded.simulator)
    assert len(counters) > 5000
