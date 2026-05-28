"""Unit-Tests für die PAssozMenge-Handler im `osim_engine.io.otx_loader`.

Plan-Provenienz: 01.3-02 (Phase 1.3, Welle 2). Die Handler stehen in
otx_loader.py Sektion "Phase-1.3 W2: PAssozMenge-Familie".

Diese Tests verifizieren — auf Unit-Ebene, ohne reale OTX-Datei —:
    1. Die 5 Handler sind in `_HANDLERS` registriert.
    2. Jeder konkrete Handler liest seine spezifischen Mengen-Attrs aus
       `obj.attrs` per `copy_scalars`.
    3. Der `wire()`-Schritt löst `m_lMengRess` per `resolve_ref` auf eine
       vorab-instanzierte PRessMenge auf.
    4. Fehlt `m_lMengRess` in `obj.attrs`, bleibt `py.m_lMengRess` None
       (resolve_ref-Default — kein KeyError, kein Crash; Sicherheitsnetz
       gegen malformed OTX-Inputs).

Integrationstests (Plan 01.3-04) bauen darauf auf und prüfen den vollen
Roundtrip (load → write → load).
"""

from __future__ import annotations

from osim_engine.io import otx_loader
from osim_engine.io.otx_reader import OtxFile, OtxObject


# ----------------------------------------------------------------------
# Test-Helper
# ----------------------------------------------------------------------


def _stub_loader(instances: dict | None = None) -> otx_loader.OtxLoader:
    """Baut einen minimal befüllten OtxLoader für Unit-Tests.

    - eigener PSimulator (über OtxLoader-Default)
    - `instances`-Dict optional vorbelegt (z.B. mit einer PRessMenge-Stub
      unter einer Test-OID, damit `resolve_ref` ein Ergebnis liefert)
    - leeres OtxFile als `loader.otx` (resolve_ref guckt nur in
      `loader.instances`, OtxFile wird hier nicht weiter benötigt)
    """
    ld = otx_loader.OtxLoader()
    ld.otx = OtxFile(declared_count=0)
    if instances:
        ld.instances.update(instances)
    return ld


# ----------------------------------------------------------------------
# Sektion 1 — Registry-Check
# ----------------------------------------------------------------------


def test_passozmenge_handlers_registered() -> None:
    """Alle 5 PAssozMenge-Schlüssel müssen in _HANDLERS sein.

    Quelle der Liste: 01.3-01-AUDIT.md Sektion 2 (Klassen-Hierarchie).
    """
    for klass in (
        "PAssozMenge",
        "PAssozMengeErzgt",
        "PAssozMengeVerbr",
        "PAssozMengeVerbrZwischen",
        "PAssozMengeAbfr",
    ):
        assert klass in otx_loader._HANDLERS, (
            f"Handler für {klass!r} fehlt in otx_loader._HANDLERS"
        )


# ----------------------------------------------------------------------
# Sektion 2 — instantiate() liest SCALARS aus obj.attrs
# ----------------------------------------------------------------------


def test_passozmenge_erzgt_handler_reads_m_iMengeAus() -> None:
    """PAssozMengeErzgt: m_sName + m_iMengeAus via copy_scalars."""
    h = otx_loader._HANDLERS["PAssozMengeErzgt"]
    obj = OtxObject(
        klass="PAssozMengeErzgt",
        oid=42,
        attrs={"m_sName": "E1", "m_iMengeAus": 5},
        sub_refs=[],
    )
    ld = _stub_loader()
    py = h.instantiate(ld, obj)

    assert type(py).__name__ == "PAssozMengeErzgt"
    assert py.m_sName == "E1"
    assert py.m_iMengeAus == 5


def test_passozmenge_verbr_handler_reads_m_iMengeEin() -> None:
    """PAssozMengeVerbr: m_sName + m_iMengeEin via copy_scalars."""
    h = otx_loader._HANDLERS["PAssozMengeVerbr"]
    obj = OtxObject(
        klass="PAssozMengeVerbr",
        oid=43,
        attrs={"m_sName": "V1", "m_iMengeEin": 7},
        sub_refs=[],
    )
    ld = _stub_loader()
    py = h.instantiate(ld, obj)

    assert type(py).__name__ == "PAssozMengeVerbr"
    assert py.m_sName == "V1"
    assert py.m_iMengeEin == 7


def test_passozmenge_verbr_zwischen_handler_reads_m_iMengeEin() -> None:
    """PAssozMengeVerbrZwischen erbt m_iMengeEin von PAssozMengeVerbr.

    Wichtig: der Handler muss copy_scalars trotzdem explizit aufrufen,
    sonst bleibt der Default 1 — verifiziert durch m_iMengeEin == 9
    (also nicht der Python-Default).
    """
    h = otx_loader._HANDLERS["PAssozMengeVerbrZwischen"]
    obj = OtxObject(
        klass="PAssozMengeVerbrZwischen",
        oid=44,
        attrs={"m_sName": "VZ1", "m_iMengeEin": 9},
        sub_refs=[],
    )
    ld = _stub_loader()
    py = h.instantiate(ld, obj)

    assert type(py).__name__ == "PAssozMengeVerbrZwischen"
    assert py.m_sName == "VZ1"
    assert py.m_iMengeEin == 9


def test_passozmenge_abfr_handler_reads_m_iMengeAbfr() -> None:
    """PAssozMengeAbfr: m_sName + m_iMengeAbfr via copy_scalars."""
    h = otx_loader._HANDLERS["PAssozMengeAbfr"]
    obj = OtxObject(
        klass="PAssozMengeAbfr",
        oid=45,
        attrs={"m_sName": "A1", "m_iMengeAbfr": 4},
        sub_refs=[],
    )
    ld = _stub_loader()
    py = h.instantiate(ld, obj)

    assert type(py).__name__ == "PAssozMengeAbfr"
    assert py.m_sName == "A1"
    assert py.m_iMengeAbfr == 4


def test_passozmenge_abstract_handler_reads_m_sName() -> None:
    """PAssozMenge (abstract): nur m_sName aus PSimObj-Basis."""
    h = otx_loader._HANDLERS["PAssozMenge"]
    obj = OtxObject(
        klass="PAssozMenge",
        oid=46,
        attrs={"m_sName": "Basis"},
        sub_refs=[],
    )
    ld = _stub_loader()
    py = h.instantiate(ld, obj)

    assert type(py).__name__ == "PAssozMenge"
    assert py.m_sName == "Basis"


# ----------------------------------------------------------------------
# Sektion 3 — wire() resolved m_lMengRess (Scalar-Pointer)
# ----------------------------------------------------------------------


def test_passozmenge_handler_wires_m_lMengRess() -> None:
    """wire() setzt py.m_lMengRess auf das in loader.instances gefundene
    Objekt (analog PAssozBeleg-Pattern, aber Scalar statt LList).
    """
    from osim_engine.resources.menge import PRessMenge

    h = otx_loader._HANDLERS["PAssozMengeErzgt"]
    ld = _stub_loader()
    # PRessMenge unter OID 10 vor-instanziiert
    rm = PRessMenge(ld.simulator)
    rm.m_sName = "Lager-A"
    ld.instances[10] = rm

    obj = OtxObject(
        klass="PAssozMengeErzgt",
        oid=47,
        attrs={"m_sName": "E1", "m_iMengeAus": 3, "m_lMengRess": 10},
        sub_refs=[],
    )
    py = h.instantiate(ld, obj)
    # Vor wire(): kein Pointer (Init-Default ist None)
    assert py.m_lMengRess is None
    # wire() löst den Pointer auf
    h.wire(ld, py, obj)
    assert py.m_lMengRess is rm


def test_passozmenge_handler_wires_m_lMengRess_none_when_missing() -> None:
    """Fehlt `m_lMengRess` im OTX, bleibt py.m_lMengRess None.

    Mitigation T-01.3.02-01 (DoS-Hardening): kein KeyError, kein Crash.
    """
    h = otx_loader._HANDLERS["PAssozMengeErzgt"]
    ld = _stub_loader()

    obj = OtxObject(
        klass="PAssozMengeErzgt",
        oid=48,
        attrs={"m_sName": "E_ohne_Ress", "m_iMengeAus": 1},
        sub_refs=[],
    )
    py = h.instantiate(ld, obj)
    h.wire(ld, py, obj)
    assert py.m_lMengRess is None


def test_passozmenge_verbr_handler_wires_m_lMengRess() -> None:
    """Wire-Resolution funktioniert für jeden konkreten Subhandler.

    Cross-Check: nicht nur Erzgt, sondern auch Verbr verdrahtet
    den Pointer korrekt.
    """
    from osim_engine.resources.menge import PRessMenge

    h = otx_loader._HANDLERS["PAssozMengeVerbr"]
    ld = _stub_loader()
    rm = PRessMenge(ld.simulator)
    rm.m_sName = "Lager-B"
    ld.instances[20] = rm

    obj = OtxObject(
        klass="PAssozMengeVerbr",
        oid=49,
        attrs={"m_sName": "V1", "m_iMengeEin": 2, "m_lMengRess": 20},
        sub_refs=[],
    )
    py = h.instantiate(ld, obj)
    h.wire(ld, py, obj)
    assert py.m_lMengRess is rm


def test_passozmenge_abfr_handler_wires_m_lMengRess() -> None:
    """Wire-Resolution auch für die Abfr-Variante."""
    from osim_engine.resources.menge import PRessMenge

    h = otx_loader._HANDLERS["PAssozMengeAbfr"]
    ld = _stub_loader()
    rm = PRessMenge(ld.simulator)
    rm.m_sName = "Lager-C"
    ld.instances[30] = rm

    obj = OtxObject(
        klass="PAssozMengeAbfr",
        oid=50,
        attrs={"m_sName": "A1", "m_iMengeAbfr": 1, "m_lMengRess": 30},
        sub_refs=[],
    )
    py = h.instantiate(ld, obj)
    h.wire(ld, py, obj)
    assert py.m_lMengRess is rm
