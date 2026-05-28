"""Tests für ``app/services/otx_json_tree.py`` (OTX ↔ Wire-Format-Adapter).

Pattern: ``@requires_engine`` weil ``load_to_wire`` ``osim_engine.io.otx_loader``
braucht und ``wire_to_otx`` ``osim_engine.io.otx_writer``. Tests laufen gegen
Dummy.otx (Coverage 1.0 aus Plan 01).

Wire-Roundtrip-Vertrag: OID-Set vor/nach Wire-Roundtrip identisch.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.api.schemas.model import ModelCoverage, ModelObject, ModelTreeWire
from app.services.otx_json_tree import (
    _resolve_llist_attrs,
    is_save_safe,
    load_to_wire,
    wire_to_otx,
)


pytestmark = pytest.mark.requires_engine


# ---------------------------------------------------------------------------
# load_to_wire
# ---------------------------------------------------------------------------


def test_load_to_wire_dummy(dummy_otx_path: Path) -> None:
    """Dummy.otx → Wire: simulator_oid=0, objects gefüllt, coverage.loaded > 0."""
    wire = load_to_wire(dummy_otx_path)
    assert isinstance(wire, ModelTreeWire)
    assert wire.simulator_oid == 0
    assert 0 in wire.objects  # ASimulator unter OID 0
    assert len(wire.objects) > 0
    assert wire.coverage.loaded > 0


def test_load_to_wire_returns_pydantic_types(dummy_otx_path: Path) -> None:
    """Wire-Objekte sind Pydantic-Modelle, nicht raw dicts."""
    wire = load_to_wire(dummy_otx_path)
    sim_obj = wire.objects[0]
    assert isinstance(sim_obj, ModelObject)
    assert isinstance(wire.coverage, ModelCoverage)
    # OTX-Klassen-Name am Sim-Root ist 'ASimulator' (Engine-Konvention).
    assert sim_obj.klass == "ASimulator"


def test_load_to_wire_coverage_full_for_dummy(dummy_otx_path: Path) -> None:
    """Dummy.otx hat Coverage 1.0 (kein unsupported)."""
    wire = load_to_wire(dummy_otx_path)
    assert wire.coverage.unsupported == []


def test_wire_to_otx_dummy_roundtrip(dummy_otx_path: Path, tmp_path: Path) -> None:
    """Wire → OTX-Text → Re-parse: OID-Set bleibt erhalten."""
    from osim_engine.io.otx_reader import parse_otx_file

    wire = load_to_wire(dummy_otx_path)
    original_oids = set(wire.objects.keys())

    otx_text = wire_to_otx(wire, original_otx_path=dummy_otx_path)

    # Schreibe in tempfile (Latin-1!) und re-parse über den Engine-Reader.
    rt_path = tmp_path / "roundtrip.otx"
    rt_path.write_text(otx_text, encoding="latin-1")
    re_parsed = parse_otx_file(rt_path)

    re_parsed_oids = set(re_parsed.by_oid.keys())
    # OID-Set MUSS identisch sein — Wire-Format ist symmetrisch zum
    # OtxObject-Modell der Engine.
    assert re_parsed_oids == original_oids, (
        f"OID-Diff: only in original = {original_oids - re_parsed_oids}, "
        f"only in roundtrip = {re_parsed_oids - original_oids}"
    )


def test_is_save_safe_dummy_returns_true(dummy_otx_path: Path) -> None:
    """Dummy.otx-Wire hat keine Coverage-Lücken → save_safe."""
    wire = load_to_wire(dummy_otx_path)
    ok, code = is_save_safe(wire)
    assert ok is True
    assert code is None


# ---------------------------------------------------------------------------
# Welle 9: LList-Resolution
# ---------------------------------------------------------------------------


def test_resolve_llist_attrs_extrahiert_oid_listen() -> None:
    """Synthetischer Test: list-Attribute am inst.__dict__ liefern OID-Listen."""

    class _C:
        pass

    a, b, c = _C(), _C(), _C()
    inst = _C()
    inst.m_lEintraege = [a, b, c]  # type: ignore[attr-defined]
    inst.m_iCount = 3  # primitives soll NICHT auftauchen
    inst.m_emptyList = []  # leere Liste soll NICHT auftauchen
    inst.m_pSingleRef = a  # einzelne Ref soll NICHT auftauchen
    inst._private = [a]  # private (Prefix _) soll NICHT auftauchen

    inst_to_oid = {id(a): 100, id(b): 200, id(c): 300}
    result = _resolve_llist_attrs(inst, inst_to_oid)
    assert result == {"m_lEintraege": [100, 200, 300]}


def test_resolve_llist_attrs_ignoriert_unbekannte_referenzen() -> None:
    """List-Elemente ohne OID-Mapping werden übersprungen."""

    class _C:
        pass

    a, b = _C(), _C()
    inst = _C()
    inst.m_l = [a, b]  # type: ignore[attr-defined]
    # nur a hat eine OID; b wird ignoriert
    result = _resolve_llist_attrs(inst, {id(a): 42})
    assert result == {"m_l": [42]}


def test_load_to_wire_resolves_llist_attrs(dummy_otx_path: Path) -> None:
    """Real-Modell-Test: Dummy.otx hat mindestens ein wire-Objekt mit einem
    aufgelösten list[int]-Attribut (m_lAusl, m_lDpKn, oder ähnlich)."""
    wire = load_to_wire(dummy_otx_path)

    # Suche irgendein Objekt mit einem list[int]-Attribut (= aufgelöste LList).
    any_resolved = False
    for obj in wire.objects.values():
        for key, value in obj.attrs.items():
            if isinstance(value, list) and value and all(
                isinstance(v, int) for v in value
            ):
                any_resolved = True
                break
        if any_resolved:
            break
    assert any_resolved, (
        "Erwartet mindestens ein wire-Objekt mit aufgelöstem list[int]-Attribut "
        "(LList-Resolution Welle 9). Wenn das fehlschlägt, prüfe ob die Engine-"
        "Instanz die LList-Container überhaupt als list-Subklassen exponiert."
    )


def test_is_save_safe_rejects_unsupported() -> None:
    """Wire mit unsupported-Klassen → (False, 'E_OTX_COVERAGE_INCOMPLETE')."""
    wire = ModelTreeWire(
        simulator_oid=0,
        objects={
            0: ModelObject(oid=0, klass="ASimulator", attrs={}, sub_refs=[])
        },
        coverage=ModelCoverage(loaded=1, skipped=0, unsupported=["FooBar"]),
    )
    ok, code = is_save_safe(wire)
    assert ok is False
    assert code == "E_OTX_COVERAGE_INCOMPLETE"


# ---------------------------------------------------------------------------
# PAssozBeleg-Link-Status-Persistenz (P3, 2026-05-27)
# ---------------------------------------------------------------------------


def test_load_to_wire_maps_link_status_to_int(embb_pre_run_otx_path: Path) -> None:
    """PAssozBelegLinkInfo.m_eStatus wird beim Load von ABL_*-Token → UI-Int."""
    wire = load_to_wire(embb_pre_run_otx_path)
    infos = [o for o in wire.objects.values() if o.klass == "PAssozBelegLinkInfo"]
    assert infos, "Fixture muss PAssozBelegLinkInfo enthalten"
    for info in infos:
        st = info.attrs.get("m_eStatus")
        assert isinstance(st, int), f"m_eStatus muss int sein, ist {st!r}"
        assert st in (0, 1, 2, 3)


def test_wire_to_otx_preserves_link_status_pointer(
    embb_pre_run_otx_path: Path,
) -> None:
    """Ohne Edit: PAssozBeleg.m_LinkStatusList überlebt den Wire→OTX-Roundtrip.

    Regression für den Assoz-Writer-Bug (Pointer ging verloren → orphaned
    LinkStatusLists → Status-Verlust), end-to-end durch osim-ui.
    """
    from osim_engine.io.otx_reader import parse_otx

    wire = load_to_wire(embb_pre_run_otx_path)
    text = wire_to_otx(wire, original_otx_path=embb_pre_run_otx_path)
    back = parse_otx(text)

    orig_ptrs = {
        o.attrs.get("m_dwObjID"): o.attrs.get("m_LinkStatusList")
        for o in back.by_oid.values()
        if o.klass == "PAssozBeleg"
    }
    # Mindestens ein PAssozBeleg trägt einen Pointer (nicht None).
    assert any(v is not None for v in orig_ptrs.values()), (
        "Kein PAssozBeleg.m_LinkStatusList-Pointer nach Roundtrip — verloren"
    )


def test_wire_to_otx_persists_new_link_info(embb_pre_run_otx_path: Path) -> None:
    """Ein neu angelegtes PAssozBelegLinkInfo (Cell-Edit) überlebt Save→Reload.

    Simuliert ``setLinkStatus``: neues LinkInfo (Status notfalls=2) in der
    LinkStatusList einer bestehenden PAssozBeleg. Erwartet: nach
    wire_to_otx → reparse ist das LinkInfo da, mit Token ``ABL_IF_NEEDED``
    (Int→Token-Mapping), referenziert die Ressource, und steckt in den
    sub_refs der LinkStatusList.
    """
    from osim_engine.io.otx_reader import parse_otx

    wire = load_to_wire(embb_pre_run_otx_path)

    # Bestehende PAssozBeleg mit LinkStatusList wählen.
    assoc = next(
        o
        for o in wire.objects.values()
        if o.klass == "PAssozBeleg" and isinstance(o.attrs.get("m_LinkStatusList"), int)
    )
    lsl_oid = assoc.attrs["m_LinkStatusList"]
    lsl = wire.objects[lsl_oid]

    # Eine Ressource referenzieren.
    ress = next(
        o for o in wire.objects.values() if o.klass in ("PBetriebsmittel", "PPerson")
    )

    # setLinkStatus-Simulation: neues LinkInfo (notfalls=2) + in LSL einhängen.
    new_oid = max(wire.objects) + 1
    wire.objects[new_oid] = ModelObject(
        oid=new_oid,
        klass="PAssozBelegLinkInfo",
        attrs={"m_oRessBeleg": ress.oid, "m_eStatus": 2, "m_eBaseStatus": 2},
        sub_refs=[],
    )
    if not lsl.sub_refs:
        lsl.sub_refs = [[]]
    lsl.sub_refs[0].append(new_oid)

    text = wire_to_otx(wire, original_otx_path=embb_pre_run_otx_path)
    back = parse_otx(text)

    # 1. Neues LinkInfo da, mit Token-gemapptem Status + Ressourcen-Pointer.
    new_li = back.by_oid.get(new_oid)
    assert new_li is not None and new_li.klass == "PAssozBelegLinkInfo"
    assert new_li.attrs.get("m_eStatus") == "ABL_IF_NEEDED"
    assert new_li.attrs.get("m_eBaseStatus") == "ABL_IF_NEEDED"
    assert new_li.attrs.get("m_oRessBeleg") == ress.oid

    # 2. LinkStatusList-sub_refs enthalten das neue LinkInfo.
    back_lsl = back.by_oid.get(lsl_oid)
    assert back_lsl is not None
    flat = [r for block in back_lsl.sub_refs for r in block]
    assert new_oid in flat

    # 3. PAssozBeleg zeigt weiterhin auf seine LinkStatusList.
    back_assoc = back.by_oid.get(assoc.oid)
    assert back_assoc is not None
    assert back_assoc.attrs.get("m_LinkStatusList") == lsl_oid
