"""Tests fuer json_tree_service.serialize_simulator_to_tree und
apply_tree_to_simulator (Direct-Tests, ohne HTTP)."""

from __future__ import annotations

import pytest

from app.services.json_tree_service import (
    SCHEMA_VERSION,
    TYPE_MAP,
    apply_tree_to_simulator,
    serialize_simulator_to_tree,
)
from app.services.otx_service import parse_otx_bytes


def test_serialize_produces_valid_schema(dummy_otx_bytes) -> None:
    result = parse_otx_bytes(dummy_otx_bytes)
    tree = serialize_simulator_to_tree(
        result.simulator,
        load_result=result,
        original_otx=result.otx,
    )
    assert tree["schema_version"] == SCHEMA_VERSION
    root = tree["root"]
    assert isinstance(root, dict)
    assert root["oid"] == 0
    # Mit original_otx liefert root das OTX-Label "ASimulator"
    assert root["klass"] == "ASimulator"
    assert "children" in root
    # Mindestens ein Auslöser-Knoten sollte sichtbar sein.
    group_kinds = {
        c.get("properties", {}).get("_group_kind")
        for c in root["children"]
        if c.get("klass") == "_group"
    }
    assert "ausloeser-list" in group_kinds


def test_serialize_oids_are_stable_with_load_result(dummy_otx_bytes) -> None:
    """Wenn load_result mitkommt, sind die OIDs identisch zu denen aus
    dem Loader -- Voraussetzung fuer Roundtrip-Stabilitaet."""
    result = parse_otx_bytes(dummy_otx_bytes)
    tree = serialize_simulator_to_tree(
        result.simulator,
        load_result=result,
        original_otx=result.otx,
    )

    # Sammle alle OIDs aus dem Tree (ohne _group-Knoten).
    seen: set[int] = set()

    def walk(node):
        if node.get("klass") != "_group":
            seen.add(node["oid"])
        for c in node.get("children", []):
            walk(c)

    walk(tree["root"])

    # Alle OIDs muessen im LoadResult.instances sein.
    for oid in seen:
        assert oid in result.instances, f"OID {oid} nicht im Loader-Mapping"


def test_serialize_works_without_load_result(dummy_otx_bytes) -> None:
    """Ohne load_result vergibt der Serializer deterministisch neue OIDs."""
    result = parse_otx_bytes(dummy_otx_bytes)
    tree = serialize_simulator_to_tree(result.simulator)
    assert tree["schema_version"] == SCHEMA_VERSION
    assert tree["root"]["oid"] == 0
    # Ohne Original-OTX nutzt der interne Tree-Iterator ASimulator
    # als kanonisches Sim-Label (analog OtxWriter._iter_simulator_tree).
    assert tree["root"]["klass"] == "ASimulator"


def test_apply_tree_round_trip_preserves_simulator_identity(dummy_otx_bytes) -> None:
    """serialize -> deserialize -> serialize -> identische Tree-OIDs."""
    result = parse_otx_bytes(dummy_otx_bytes)
    tree1 = serialize_simulator_to_tree(
        result.simulator,
        load_result=result,
        original_otx=result.otx,
    )
    # Tree zurueckspielen (keine Aenderungen) -> Sim sollte identisch sein.
    apply_tree_to_simulator(tree1, load_result=result)
    tree2 = serialize_simulator_to_tree(
        result.simulator,
        load_result=result,
        original_otx=result.otx,
    )

    # Tree-Struktur (OIDs + Klassen + Properties) muss identisch sein.
    assert _walk_oids(tree1) == _walk_oids(tree2)
    assert _walk_props(tree1) == _walk_props(tree2)


def test_apply_tree_changes_property(dummy_otx_bytes) -> None:
    """Aenderung im Tree wird auf das PSimulator-Objekt angewendet."""
    result = parse_otx_bytes(dummy_otx_bytes)

    # Finde den ersten PAslEinzel mit m_iBeginTermin im TYPE_MAP.
    target_oid = None
    target_obj = None
    for oid, obj in result.instances.items():
        if type(obj).__name__ == "PAslEinzel" and hasattr(obj, "m_iBeginTermin"):
            target_oid = oid
            target_obj = obj
            break
    if target_oid is None:
        pytest.skip("Kein PAslEinzel mit m_iBeginTermin -- Fixture-Untauglich")

    original_value = int(target_obj.m_iBeginTermin)
    new_value = original_value + 12345

    tree = serialize_simulator_to_tree(
        result.simulator, load_result=result, original_otx=result.otx
    )
    # Modifiziere den entsprechenden Knoten in-place.
    _patch_property(tree["root"], target_oid, "m_iBeginTermin", new_value)
    apply_tree_to_simulator(tree, load_result=result)

    assert int(target_obj.m_iBeginTermin) == new_value


def test_apply_tree_ignores_unknown_properties(dummy_otx_bytes) -> None:
    """Properties, die nicht in TYPE_MAP stehen, werden ignoriert."""
    result = parse_otx_bytes(dummy_otx_bytes)
    tree = serialize_simulator_to_tree(
        result.simulator, load_result=result, original_otx=result.otx
    )
    # Inject ein Garbage-Property in den Root.
    tree["root"]["properties"]["m_doesNotExist"] = "garbage"
    # Should not raise.
    apply_tree_to_simulator(tree, load_result=result)
    # Und nicht gesetzt:
    assert not hasattr(result.simulator, "m_doesNotExist")


def test_apply_tree_rejects_unknown_schema_version(dummy_otx_bytes) -> None:
    result = parse_otx_bytes(dummy_otx_bytes)
    bad = {"schema_version": "9.9", "root": {"oid": 0, "klass": "ASimulator",
            "name": "x", "properties": {}, "children": []}}
    with pytest.raises(ValueError):
        apply_tree_to_simulator(bad, load_result=result)


def test_type_map_contains_core_classes() -> None:
    """Sanity: die haeufigsten Loader-Klassen sind in TYPE_MAP."""
    core = {
        "ASimulator", "PAslEinzel", "PDurchlaufplan",
        "PDpKnKonstant", "PDpKnMenge", "PDpKnMengeRuesten",
        "PDlplKante", "PBetriebsmittel", "PPerson",
    }
    missing = core - set(TYPE_MAP)
    assert not missing, f"TYPE_MAP fehlt: {missing}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _walk_oids(tree) -> list[int]:
    out: list[int] = []

    def walk(node):
        out.append(node["oid"])
        for c in node.get("children", []):
            walk(c)

    walk(tree["root"])
    return out


def _walk_props(tree) -> list[tuple[int, str, dict]]:
    out: list[tuple[int, str, dict]] = []

    def walk(node):
        out.append((node["oid"], node["klass"], dict(node.get("properties", {}))))
        for c in node.get("children", []):
            walk(c)

    walk(tree["root"])
    return out


def _patch_property(node, target_oid, prop, value) -> bool:
    if node.get("oid") == target_oid:
        node["properties"][prop] = value
        return True
    for c in node.get("children", []):
        if _patch_property(c, target_oid, prop, value):
            return True
    return False
