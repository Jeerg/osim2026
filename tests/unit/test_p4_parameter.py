"""P4-F: PParameter-Familie — Unit-Tests.

Tests:
    A) PParameterInt — Name-Match, kein ID-Match (Basis ohne fixe ID)
    B) PParameterMenge — Name + ID(PARAM_MENGE)
    C) PParameterPrioritaet — Name + ID(PARAM_PRIORITAET)
    D) PParameterID — Name + ID(PARAM_ID)
    E) PParameterKrzRscEinsatz, ZstIntBegin, ZstIntEnd analog
    F) PParameterFloat — Name-Match, kein ID-Match
    G) PParameterString — Name-Match, kein ID-Match
    H) PParameterLList — sechs Lookup-Methoden (name + by_id × Int/Float/String)
    I) Edge: leere Liste → Default; mehrere gleiche Namen → erster Treffer;
       umbenannter Parameter (PParameterID mit name="custom") — Name-Lookup
       findet ihn unter "custom", aber NICHT mehr unter "id"; ID-Lookup
       findet ihn weiterhin über PARAM_ID
"""

from __future__ import annotations

from osim_engine.pps.parameter import (
    PARAM_ID,
    PARAM_KRZRSCEINSATZ,
    PARAM_MENGE,
    PARAM_PRIORITAET,
    PARAM_USER,
    PARAM_ZSTINTBEGIN,
    PARAM_ZSTINTEND,
    PParameterFloat,
    PParameterID,
    PParameterInt,
    PParameterKrzRscEinsatz,
    PParameterLList,
    PParameterMenge,
    PParameterPrioritaet,
    PParameterString,
    PParameterZstIntBegin,
    PParameterZstIntEnd,
)


# ----------------------------------------------------------------------
# Subtypen-Lookup-Pattern: Name + ID
# ----------------------------------------------------------------------


def test_p4_f_param_int_name_match_no_id() -> None:
    """PParameterInt: Name matcht; ID wird nicht ausgewertet."""
    p = PParameterInt(simulator=None, name="foo", wert=42)
    assert p._hole_int(0, "foo") == (True, 42)
    assert p._hole_int(0, "bar") == (False, 0)
    # ID-Lookup auf der Basis-Int-Klasse: kein Match
    assert p._hole_int(PARAM_MENGE, None) == (False, 0)
    assert p._hole_int(99, None) == (False, 0)


def test_p4_f_param_menge_name_und_id_match() -> None:
    p = PParameterMenge(simulator=None, wert=7)
    # Default-Name
    assert p.m_sName == "menge"
    # Name-Match
    assert p._hole_int(0, "menge") == (True, 7)
    assert p._hole_int(0, "x") == (False, 0)
    # ID-Match (fixe PARAM_MENGE=10)
    assert p._hole_int(PARAM_MENGE, None) == (True, 7)
    # Falsche ID
    assert p._hole_int(PARAM_PRIORITAET, None) == (False, 0)


def test_p4_f_param_prioritaet_name_und_id_match() -> None:
    p = PParameterPrioritaet(simulator=None, wert=5)
    assert p.m_sName == "prioritaet"
    assert p._hole_int(0, "prioritaet") == (True, 5)
    assert p._hole_int(PARAM_PRIORITAET, None) == (True, 5)
    assert p._hole_int(PARAM_MENGE, None) == (False, 0)


def test_p4_f_param_id_name_und_id_match() -> None:
    p = PParameterID(simulator=None, wert=99)
    assert p.m_sName == "id"
    assert p._hole_int(0, "id") == (True, 99)
    assert p._hole_int(PARAM_ID, None) == (True, 99)
    assert p._hole_int(PARAM_MENGE, None) == (False, 0)


def test_p4_f_param_krzrsceinsatz_name_und_id_match() -> None:
    p = PParameterKrzRscEinsatz(simulator=None, wert=1)
    assert p.m_sName == "KrzRscEinsatz"
    assert p._hole_int(0, "KrzRscEinsatz") == (True, 1)
    assert p._hole_int(PARAM_KRZRSCEINSATZ, None) == (True, 1)


def test_p4_f_param_zstintbegin_default_minus1() -> None:
    p = PParameterZstIntBegin(simulator=None)
    assert p.m_sName == "ZstIntBegin"
    assert p.m_iWert == -1  # C++-Default
    assert p._hole_int(PARAM_ZSTINTBEGIN, None) == (True, -1)


def test_p4_f_param_zstintend_default_minus1() -> None:
    p = PParameterZstIntEnd(simulator=None, wert=100)
    assert p.m_sName == "ZstIntEnd"
    assert p._hole_int(0, "ZstIntEnd") == (True, 100)
    assert p._hole_int(PARAM_ZSTINTEND, None) == (True, 100)


def test_p4_f_param_float_name_match() -> None:
    p = PParameterFloat(simulator=None, name="kosten", wert=12.5)
    assert p._hole_float(0, "kosten") == (True, 12.5)
    assert p._hole_float(0, "andere") == (False, 0.0)
    # Float kennt keine fixe PARAM-ID
    assert p._hole_float(PARAM_USER, None) == (False, 0.0)


def test_p4_f_param_string_name_match() -> None:
    p = PParameterString(simulator=None, name="bemerkung", wert="hallo")
    assert p._hole_string(0, "bemerkung") == (True, "hallo")
    assert p._hole_string(0, "andere") == (False, "")
    # String kennt keine fixe PARAM-ID
    assert p._hole_string(99, None) == (False, "")


def test_p4_f_param_string_default_wert() -> None:
    p = PParameterString(simulator=None, name="x")
    assert p.m_sWert == "leer"  # C++-Default


# ----------------------------------------------------------------------
# PParameterLList — Lookup-Container
# ----------------------------------------------------------------------


def test_p4_f_llist_leer_liefert_default() -> None:
    llist = PParameterLList()
    assert llist.hole_parameter_int("x", 42) == 42
    assert llist.hole_parameter_int_by_id(PARAM_MENGE, 99) == 99
    assert llist.hole_parameter_float("y", 1.5) == 1.5
    assert llist.hole_parameter_float_by_id(PARAM_USER, 2.5) == 2.5
    assert llist.hole_parameter_string("z", "fallback") == "fallback"
    assert llist.hole_parameter_string_by_id(0, "fallback") == "fallback"


def test_p4_f_llist_int_by_name() -> None:
    llist = PParameterLList()
    llist.append(PParameterMenge(simulator=None, wert=5))
    llist.append(PParameterID(simulator=None, wert=2))

    assert llist.hole_parameter_int("menge", 0) == 5
    assert llist.hole_parameter_int("id", 0) == 2
    assert llist.hole_parameter_int("unbekannt", 99) == 99


def test_p4_f_llist_int_by_id() -> None:
    llist = PParameterLList()
    llist.append(PParameterMenge(simulator=None, wert=5))
    llist.append(PParameterID(simulator=None, wert=2))
    llist.append(PParameterPrioritaet(simulator=None, wert=10))

    assert llist.hole_parameter_int_by_id(PARAM_MENGE, 0) == 5
    assert llist.hole_parameter_int_by_id(PARAM_ID, 0) == 2
    assert llist.hole_parameter_int_by_id(PARAM_PRIORITAET, 0) == 10
    # Generischer PParameterInt (kein fixed-ID-Subtyp) matcht NICHT per ID
    assert llist.hole_parameter_int_by_id(PARAM_KRZRSCEINSATZ, -7) == -7


def test_p4_f_llist_mixed_int_float_string() -> None:
    """Eine Liste mit gemischten Typen — jeder Lookup findet nur seinen Typ."""
    llist = PParameterLList()
    llist.append(PParameterMenge(simulator=None, wert=3))
    llist.append(PParameterFloat(simulator=None, name="kosten", wert=12.5))
    llist.append(PParameterString(simulator=None, name="note", wert="x"))

    assert llist.hole_parameter_int("menge", 0) == 3
    # Float-Lookup mit Name "menge" findet nichts (PParameterMenge ist Int)
    assert llist.hole_parameter_float("menge", -1.0) == -1.0
    assert llist.hole_parameter_float("kosten", 0.0) == 12.5
    assert llist.hole_parameter_string("note", "fallback") == "x"
    # String-Lookup mit Name "kosten" findet nichts
    assert llist.hole_parameter_string("kosten", "f") == "f"


def test_p4_f_llist_mehrere_gleicher_name_erster_treffer() -> None:
    """Bei mehreren PParameterInt mit gleichem Namen gewinnt der erste.

    Mirror des C++-PSimLList-Iterations-Verhaltens: head→tail, erster Match
    beendet die Schleife (PParameter.cpp:33-45).
    """
    llist = PParameterLList()
    llist.append(PParameterInt(simulator=None, name="x", wert=1))
    llist.append(PParameterInt(simulator=None, name="x", wert=2))
    assert llist.hole_parameter_int("x", 0) == 1


def test_p4_f_llist_umbenannter_id_param_via_id_findbar() -> None:
    """PParameterID mit anderem Namen → Name-Lookup findet ihn nur unter
    dem neuen Namen; ID-Lookup findet ihn weiterhin via PARAM_ID.

    Wichtige 1:1-Eigenschaft: die fixe ID ist Klassen-spezifisch, nicht
    Name-spezifisch.
    """
    p = PParameterID(simulator=None, wert=77)
    p.m_sName = "custom-id"

    llist = PParameterLList()
    llist.append(p)

    # Name-Lookup unter altem Default-Namen "id" findet nicht
    assert llist.hole_parameter_int("id", 0) == 0
    # Name-Lookup unter neuem Namen findet
    assert llist.hole_parameter_int("custom-id", 0) == 77
    # ID-Lookup findet weiterhin
    assert llist.hole_parameter_int_by_id(PARAM_ID, 0) == 77


def test_p4_f_llist_float_by_id_nicht_unterstuetzt() -> None:
    """Float-Subtypen haben keine festen IDs → by_id liefert immer Default."""
    llist = PParameterLList()
    llist.append(PParameterFloat(simulator=None, name="kosten", wert=99.9))
    assert llist.hole_parameter_float_by_id(PARAM_USER, -1.0) == -1.0


def test_p4_f_llist_string_by_id_nicht_unterstuetzt() -> None:
    """String-Subtypen haben keine festen IDs → by_id liefert immer Default."""
    llist = PParameterLList()
    llist.append(PParameterString(simulator=None, name="note", wert="x"))
    assert llist.hole_parameter_string_by_id(PARAM_USER, "fallback") == "fallback"


def test_p4_f_param_konstanten_werte() -> None:
    """Wörtlich aus C++ PParameter.odh:23-29."""
    assert PARAM_MENGE == 10
    assert PARAM_PRIORITAET == 11
    assert PARAM_ID == 12
    assert PARAM_KRZRSCEINSATZ == 13
    assert PARAM_ZSTINTBEGIN == 14
    assert PARAM_ZSTINTEND == 15
    assert PARAM_USER == 100


def test_p4_f_abstract_pparameter_keine_treffer() -> None:
    """Direkte PParameter-Instanz (Basis): alle Hooks returnen FALSE."""
    from osim_engine.pps.parameter import PParameter
    p = PParameter(simulator=None)
    assert p._hole_int(PARAM_MENGE, "menge") == (False, 0)
    assert p._hole_float(0, "x") == (False, 0.0)
    assert p._hole_string(0, "x") == (False, "")
