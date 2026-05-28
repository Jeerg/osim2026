/**
 * Tests für useModelStore (Plan 01-07 Task 3).
 *
 * Deckt die 7 im Plan spezifizierten Behavior-Cases ab:
 *  1. loadFromWire setzt wire + clears dirty.
 *  2. selectObject updated selection.
 *  3. patchObject modifies attrs + sets dirty.
 *  4. createObject appends to objects + returns OID.
 *  5. deleteObject removes obj + cleans sub_refs.
 *  6. undo reverts last patch.
 *  7. clear resets all state.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { useModelStore } from "@/stores/model-store";
import type { ModelTreeWire } from "@/api/models";

function makeWire(): ModelTreeWire {
  return {
    version: 1,
    simulator_oid: 0,
    objects: {
      0: {
        oid: 0,
        klass: "ASimulator",
        attrs: { m_name: "TestSim" },
        sub_refs: [[1, 2]],
      },
      1: {
        oid: 1,
        klass: "PDurchlaufplan",
        attrs: { m_sName: "Plan A", m_iUserInt: 10 },
        sub_refs: [],
      },
      2: {
        oid: 2,
        klass: "PDurchlaufplan",
        attrs: { m_sName: "Plan B", m_iUserInt: 20 },
        sub_refs: [],
      },
    },
    coverage: { loaded: 3, skipped: 0, unsupported: [] },
    schemas_url: "/api/v1/schemas/v1",
  };
}

describe("useModelStore", () => {
  beforeEach(() => {
    // State + Undo-History zwischen Tests reseten.
    useModelStore.getState().clear();
    useModelStore.temporal.getState().clear();
  });

  it("loadFromWire sets wire and clears dirty", () => {
    const wire = makeWire();
    useModelStore.getState().loadFromWire("model-1", wire);
    const state = useModelStore.getState();
    expect(state.wire).not.toBeNull();
    expect(state.wire?.simulator_oid).toBe(0);
    expect(state.modelId).toBe("model-1");
    expect(state.dirty).toBe(false);
  });

  it("selectObject updates selection", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    useModelStore.getState().selectObject(2);
    expect(useModelStore.getState().selection).toBe(2);
    useModelStore.getState().selectObject(null);
    expect(useModelStore.getState().selection).toBeNull();
  });

  it("patchObject modifies attrs and sets dirty", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    expect(useModelStore.getState().dirty).toBe(false);
    useModelStore
      .getState()
      .patchObject(1, { m_sName: "Plan A (geändert)", m_iUserInt: 99 });
    const obj = useModelStore.getState().wire?.objects[1];
    expect(obj?.attrs.m_sName).toBe("Plan A (geändert)");
    expect(obj?.attrs.m_iUserInt).toBe(99);
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it("createObject appends to objects and returns new OID", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    const newOid = useModelStore
      .getState()
      .createObject("PDurchlaufplan", { m_sName: "Plan C" });
    // max existing OID = 2 → new must be 3
    expect(newOid).toBe(3);
    const created = useModelStore.getState().wire?.objects[newOid];
    expect(created?.klass).toBe("PDurchlaufplan");
    expect(created?.attrs.m_sName).toBe("Plan C");
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it("deleteObject removes obj and cleans sub_refs", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    useModelStore.getState().deleteObject(1);
    const state = useModelStore.getState();
    // Object 1 entfernt
    expect(state.wire?.objects[1]).toBeUndefined();
    // sub_refs in object 0 (war [[1, 2]]) muss jetzt [[2]] sein
    expect(state.wire?.objects[0]?.sub_refs[0]).toEqual([2]);
    expect(state.dirty).toBe(true);
  });

  it("undo reverts last patch", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    // Wichtig: temporal.clear() entfernt die loadFromWire-History; ab jetzt
    // ist der "geladene" State der einzige in der History — patches gehen
    // als neue Entries rein.
    useModelStore.temporal.getState().clear();
    useModelStore
      .getState()
      .patchObject(1, { m_sName: "geändert" });
    expect(useModelStore.getState().wire?.objects[1]?.attrs.m_sName).toBe(
      "geändert",
    );
    useModelStore.temporal.getState().undo();
    expect(useModelStore.getState().wire?.objects[1]?.attrs.m_sName).toBe(
      "Plan A",
    );
  });

  it("appendSubRef extends parent sub_refs slot with new oid", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    // sub_refs[0] = [1, 2] vor dem Append
    useModelStore.getState().appendSubRef(0, 0, 99);
    const slot = useModelStore.getState().wire?.objects[0]?.sub_refs[0];
    expect(slot).toEqual([1, 2, 99]);
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it("appendSubRef creates missing intermediate slots as empty arrays", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    // sub_refs hat heute nur Slot 0; Slot 2 anlegen muss Slot 1 als []
    // dazwischen erzeugen.
    useModelStore.getState().appendSubRef(0, 2, 77);
    const refs = useModelStore.getState().wire?.objects[0]?.sub_refs;
    expect(refs).toHaveLength(3);
    expect(refs?.[1]).toEqual([]);
    expect(refs?.[2]).toEqual([77]);
  });

  it("removeSubRef removes oid from slot list (all occurrences)", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    // Erst doppelt anhängen — entfernt müssen ALLE Vorkommen werden.
    useModelStore.getState().appendSubRef(0, 0, 42);
    useModelStore.getState().appendSubRef(0, 0, 42);
    expect(useModelStore.getState().wire?.objects[0]?.sub_refs[0]).toEqual([
      1, 2, 42, 42,
    ]);
    useModelStore.getState().removeSubRef(0, 0, 42);
    expect(useModelStore.getState().wire?.objects[0]?.sub_refs[0]).toEqual([
      1, 2,
    ]);
  });

  it("clear resets all state", () => {
    useModelStore.getState().loadFromWire("m", makeWire());
    useModelStore.getState().selectObject(2);
    useModelStore.getState().patchObject(1, { m_sName: "x" });
    expect(useModelStore.getState().dirty).toBe(true);
    useModelStore.getState().clear();
    const state = useModelStore.getState();
    expect(state.wire).toBeNull();
    expect(state.modelId).toBeNull();
    expect(state.selection).toBeNull();
    expect(state.dirty).toBe(false);
  });
});
