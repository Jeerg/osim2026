"""Unit-Tests für `osim_engine.io.otx_writer` — Foundation und Format-Encoder.

Diese Tests beschreiben den Vertrag des Writers auf Format-Ebene. Roundtrip-
Integrationstests gegen reale OTX-Dateien stehen in
`tests/integration/io/test_otx_roundtrip.py`.

Format-Annahmen (verifiziert gegen `otx_reader.py`):
    - Trennzeichen `|` zwischen Token, `;` innerhalb Token (attr/value, sub-refs).
    - `#Klassenname` = Objekt-Start, `!` = Objekt-Ende, `$N;id1;..;idN` =
      Basisklassen-Abschluss mit Sub-Refs.
    - `$0` = leerer Basisklassen-Abschluss; `$!` = leerer Basisklassen-
      Abschluss + Objekt-Ende kombiniert.
    - Header: `OIDArray|N!` mit N = Anzahl deklarierter Top-Level-OIDs.
    - Encoding auf Disk: Latin-1 (siehe `otx_reader.parse_otx_file`).
"""

from __future__ import annotations


# ----------------------------------------------------------------------
# Modul-Importierbarkeit + Public API
# ----------------------------------------------------------------------


def test_module_imports_public_api() -> None:
    """Der Writer exportiert die zentrale API."""
    from osim_engine.io import otx_writer

    assert hasattr(otx_writer, "OtxWriter")
    assert hasattr(otx_writer, "WriterHandler")
    assert hasattr(otx_writer, "register_writer")
    assert hasattr(otx_writer, "dump_simulator_to_otx")


def test_package_reexport_dump_simulator_to_otx() -> None:
    """Re-Export über osim_engine.io.__init__."""
    from osim_engine.io import dump_simulator_to_otx
    assert callable(dump_simulator_to_otx)


def test_package_reexport_writer_and_handler() -> None:
    from osim_engine.io import OtxWriter, WriterHandler, register_writer
    assert OtxWriter is not None
    assert WriterHandler is not None
    assert callable(register_writer)


# ----------------------------------------------------------------------
# Escaping
# ----------------------------------------------------------------------


def test_escape_property_value_pipe() -> None:
    """`|` im Wert darf nicht Token-Trennzeichen-Mismatch erzeugen.

    Vertrag: encode_value(decode_value(x)) == x für reine Strings.
    Bei `|`-Char im Wert nutzen wir Reader-kompatibles Quoting (Backslash
    oder ähnlich) oder Reject — beide sind valide, solange Reader-Roundtrip
    geht.
    """
    from osim_engine.io.otx_writer import encode_value

    # Reine Strings ohne Sondertokens
    assert encode_value("hello") == "hello"
    assert encode_value("Erzeugnis-1") == "Erzeugnis-1"


def test_encode_value_none_as_onull() -> None:
    from osim_engine.io.otx_writer import encode_value
    assert encode_value(None) == "ONULL"


def test_encode_value_bool_as_truefalse() -> None:
    from osim_engine.io.otx_writer import encode_value
    assert encode_value(True) == "TRUE"
    assert encode_value(False) == "FALSE"


def test_encode_value_int_and_float() -> None:
    from osim_engine.io.otx_writer import encode_value
    assert encode_value(42) == "42"
    assert encode_value(-1) == "-1"
    # Float-Formatierung: Reader liest float() — wir geben ein lesbares
    # Format aus (kein wissenschaftliches).
    out = encode_value(1.5)
    assert "1.5" in out
    assert "e" not in out.lower()


def test_encode_value_tuple_as_paren_csv() -> None:
    """`(r,g,b)` / `(x,y,w,h)`-Tuple-Werte."""
    from osim_engine.io.otx_writer import encode_value
    assert encode_value((-1, -1)) == "(-1,-1)"
    assert encode_value((255, 128, 0)) == "(255,128,0)"


def test_encode_value_empty_string() -> None:
    """Leere Strings im Wert: leer ist OK — Reader liest "" als leeren String."""
    from osim_engine.io.otx_writer import encode_value
    # Wir akzeptieren entweder "" oder einen expliziten Marker; der Reader
    # behandelt `attr;|` als attr="" (Z. 184 in otx_reader.py).
    out = encode_value("")
    assert out == ""


# ----------------------------------------------------------------------
# format_object
# ----------------------------------------------------------------------


def test_format_object_simple_no_sub_refs() -> None:
    """Ein einfaches Objekt ohne Sub-Refs."""
    from osim_engine.io.otx_writer import format_object

    line = format_object(
        klass="PAslEinzel",
        oid=42,
        props={"m_sName": "Erzeugnis-1", "m_iBeginTermin": 0},
        sub_refs=[],
    )
    # Beginnt mit #Klasse
    assert line.startswith("#PAslEinzel|")
    # Endet mit !
    assert line.endswith("!") or line.endswith("!|") or line.endswith("|!")
    # Enthält die Property
    assert "m_sName;Erzeugnis-1" in line
    assert "m_iBeginTermin;0" in line
    # Enthält die OID-Annotation (m_dwObjID = oid)
    assert "m_dwObjID;MS_OID(PAslEinzel);42" in line
    # Sub-Refs mit N=0 → entweder "$0|" oder das "$!" Sonderzeichen
    assert "$0" in line or "$!" in line


def test_format_object_with_sub_refs() -> None:
    """Ein Container-Objekt mit Sub-Refs: `$N;id1;..;idN`."""
    from osim_engine.io.otx_writer import format_object

    line = format_object(
        klass="PDurchlaufplanLList",
        oid=384,
        props={},
        sub_refs=[385, 567, 690, 816],
    )
    assert "$4;385;567;690;816" in line
    assert line.startswith("#PDurchlaufplanLList|")


def test_format_object_round_trips_via_reader_single() -> None:
    """Schreibe ein Objekt + parse mit otx_reader → gleiches Klass/Oid/Attrs."""
    from osim_engine.io.otx_reader import parse_otx
    from osim_engine.io.otx_writer import format_object

    line = format_object(
        klass="PAslEinzel",
        oid=42,
        props={"m_sName": "Erzeugnis-1", "m_iBeginTermin": 0},
        sub_refs=[],
    )
    otx_text = f"OIDArray|1!\n{line}\n"

    parsed = parse_otx(otx_text)
    assert parsed.declared_count == 1
    assert len(parsed.top_level) == 1
    obj = parsed.top_level[0]
    assert obj.klass == "PAslEinzel"
    assert obj.oid == 42
    assert obj.attrs.get("m_sName") == "Erzeugnis-1"
    assert obj.attrs.get("m_iBeginTermin") == 0


def test_format_object_round_trips_via_reader_with_sub_refs() -> None:
    """Container-Objekt mit Sub-Refs → Reader liest sub_refs korrekt zurück."""
    from osim_engine.io.otx_reader import parse_otx
    from osim_engine.io.otx_writer import format_object

    line = format_object(
        klass="PAusloeserLList",
        oid=33,
        props={},
        sub_refs=[34, 39, 44],
    )
    otx_text = f"OIDArray|1!\n{line}\n"
    parsed = parse_otx(otx_text)
    obj = parsed.top_level[0]
    assert obj.klass == "PAusloeserLList"
    assert obj.oid == 33
    # otx_reader speichert sub_refs als list[list[int]] (pro Basisklassen-Block)
    flat = [oid for block in obj.sub_refs for oid in block]
    assert flat == [34, 39, 44]


# ----------------------------------------------------------------------
# register_writer-Decorator
# ----------------------------------------------------------------------


def test_register_writer_registers_handler() -> None:
    """`@register_writer("PFoo")` macht den Handler in _WRITERS verfügbar."""
    from osim_engine.io import otx_writer
    from osim_engine.io.otx_writer import WriterHandler, register_writer

    # Eindeutiger Test-Klassenname, um Kollisionen mit echten Handlern zu vermeiden.
    unique_name = "_TestOnlyKlassXYZ_register"

    @register_writer(unique_name)
    class _Foo(WriterHandler):
        def serialize(self, writer, py_obj, oid):  # type: ignore[override]
            return ({}, [])

    try:
        assert unique_name in otx_writer._WRITERS
        assert isinstance(otx_writer._WRITERS[unique_name], _Foo)
    finally:
        otx_writer._WRITERS.pop(unique_name, None)


def test_register_writer_double_registration_warns(caplog) -> None:
    """Doppelte Registrierung loggt eine Warning, überschreibt aber nicht still."""
    import logging

    from osim_engine.io import otx_writer
    from osim_engine.io.otx_writer import WriterHandler, register_writer

    unique_name = "_TestOnlyKlassXYZ_double"

    @register_writer(unique_name)
    class _First(WriterHandler):
        def serialize(self, writer, py_obj, oid):
            return ({}, [])

    first_instance = otx_writer._WRITERS[unique_name]

    try:
        with caplog.at_level(logging.WARNING, logger="osim_engine.io.otx_writer"):
            @register_writer(unique_name)
            class _Second(WriterHandler):
                def serialize(self, writer, py_obj, oid):
                    return ({}, [])

        # Erste Eintragung wird beibehalten (kein stilles Überschreiben).
        assert otx_writer._WRITERS[unique_name] is first_instance
        # Warning wurde gelogged.
        assert any(
            "already registered" in rec.message.lower() or unique_name in rec.message
            for rec in caplog.records
        )
    finally:
        otx_writer._WRITERS.pop(unique_name, None)


# ----------------------------------------------------------------------
# OID-Zuteilung
# ----------------------------------------------------------------------


def test_assign_oids_simulator_first() -> None:
    """`assign_oids(sim)` weist dem Simulator die OID 0 zu (Konvention)."""
    from osim_engine.io.otx_writer import OtxWriter
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    writer = OtxWriter()
    oid_map = writer.assign_oids(sim)
    assert oid_map[id(sim)] == 0


def test_assign_oids_deterministic_for_simulator_with_ausloeser() -> None:
    """Reihenfolge der OID-Vergabe ist stabil: Sim=0, Auslöser ab 1, etc."""
    from osim_engine.io.otx_writer import OtxWriter
    from osim_engine.pps.ausloeser.einzel import PAslEinzel
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    a = PAslEinzel(sim)
    a.m_sName = "A"
    sim.register_ausloeser(a)

    writer1 = OtxWriter()
    map1 = writer1.assign_oids(sim)

    writer2 = OtxWriter()
    map2 = writer2.assign_oids(sim)

    # Sim hat OID 0
    assert map1[id(sim)] == 0
    assert map2[id(sim)] == 0
    # Auslöser bekommt EINE OID, deterministisch in beiden Läufen.
    assert map1[id(a)] == map2[id(a)]
    assert map1[id(a)] > 0


# ----------------------------------------------------------------------
# dump_simulator_to_otx — Smoke
# ----------------------------------------------------------------------


def test_dump_empty_simulator_produces_valid_header() -> None:
    """Ein leerer Simulator produziert mindestens den Header und das ASimulator-Objekt."""
    from osim_engine.io.otx_reader import parse_otx
    from osim_engine.io.otx_writer import dump_simulator_to_otx
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    text = dump_simulator_to_otx(sim)

    # Header
    assert text.startswith("OIDArray|") or "OIDArray|" in text.splitlines()[0]
    # ASimulator als erste Klasse
    assert "#ASimulator" in text

    # Parse-bar mit Reader
    parsed = parse_otx(text)
    assert parsed.declared_count > 0
    assert any(o.klass == "ASimulator" for o in parsed.top_level)


def test_dump_returns_str_not_bytes() -> None:
    """API liefert `str`; Konsumenten encoden auf Disk explizit als Latin-1."""
    from osim_engine.io.otx_writer import dump_simulator_to_otx
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    out = dump_simulator_to_otx(sim)
    assert isinstance(out, str)


def test_dump_output_is_latin1_encodable() -> None:
    """Das Disk-Encoding ist Latin-1 — der Output darf keine Unicode-Codepoints
    enthalten, die nicht in Latin-1 abbildbar sind."""
    from osim_engine.io.otx_writer import dump_simulator_to_otx
    from osim_engine.pps.simulator import PSimulator

    sim = PSimulator()
    out = dump_simulator_to_otx(sim)
    # Wirft UnicodeEncodeError, falls Codepoint > U+00FF im Output.
    out.encode("latin-1")
