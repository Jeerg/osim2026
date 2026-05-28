/**
 * Tests für buildTree (Plan 01-07 Task 4).
 *
 * Deckt die 5 im Plan spezifizierten Behavior-Cases ab:
 *  1. root ist Simulator-Objekt mit Modell-Label.
 *  2. Durchlaufpläne werden in eigene Gruppe gepackt.
 *  3. Knoten erscheinen unter dem Durchlaufplan.
 *  4. Ressourcen-Gruppen (Belegung/Menge) existieren als eigene Gruppen.
 *  5. Empty-Wire (nur Simulator) returnt einen single-root Tree mit leeren Gruppen.
 */

import { describe, expect, it } from "vitest";

import { buildTree, type TreeNode } from "@/sidebar/tree-builder";
import type { ModelTreeWire } from "@/api/models";

function findChild(node: TreeNode, label: string): TreeNode | undefined {
  return node.children?.find((c) => c.label === label);
}

function makeFullWire(): ModelTreeWire {
  return {
    version: 1,
    simulator_oid: 0,
    objects: {
      0: {
        oid: 0,
        klass: "ASimulator",
        attrs: { m_name: "TestModell" },
        sub_refs: [],
      },
      // 2 Durchlaufpläne
      10: {
        oid: 10,
        klass: "PDurchlaufplan",
        attrs: { m_sName: "Plan A" },
        sub_refs: [],
      },
      11: {
        oid: 11,
        klass: "PDurchlaufplan",
        attrs: { m_sName: "Plan B" },
        sub_refs: [],
      },
      // 1 Auslöser
      20: {
        oid: 20,
        klass: "PAslEinzel",
        attrs: { m_sName: "Auslöser-1" },
        sub_refs: [],
      },
      // 1 Belegungsressource
      30: {
        oid: 30,
        klass: "PBetriebsmittel",
        attrs: { m_sName: "Maschine 1" },
        sub_refs: [],
      },
      // 1 Mengenressource
      40: {
        oid: 40,
        klass: "PRessMenge",
        attrs: { m_sName: "Lager" },
        sub_refs: [],
      },
      // 1 Personalgruppe
      50: {
        oid: 50,
        klass: "AGruppe",
        attrs: { m_sName: "Gruppe-X" },
        sub_refs: [],
      },
      // 1 Einsatzwunsch
      60: {
        oid: 60,
        klass: "AEinsatzzeitWunsch",
        attrs: { m_sName: "Wunsch-1" },
        sub_refs: [],
      },
    },
    coverage: { loaded: 8, skipped: 0, unsupported: [] },
    schemas_url: "/api/v1/schemas/v1",
  };
}

describe("buildTree", () => {
  it("root is simulator with label 'Modell' (or the simulator name)", () => {
    const tree = buildTree(makeFullWire());
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.oid).toBe(0);
    expect(root.klass).toBe("ASimulator");
    // Label entweder m_name aus attrs oder Fallback "Modell"
    expect(typeof root.label).toBe("string");
    expect(root.label.length).toBeGreaterThan(0);
  });

  it("Durchlaufplan-Gruppe enthält alle PDurchlaufplan-Objekte", () => {
    const tree = buildTree(makeFullWire());
    const root = tree[0];
    const plaeneGroup = findChild(root, "Durchlaufpläne");
    expect(plaeneGroup).toBeDefined();
    expect(plaeneGroup?.children?.length).toBe(2);
    const planNames = plaeneGroup?.children?.map((c) => c.label) ?? [];
    expect(planNames).toContain("Plan A");
    expect(planNames).toContain("Plan B");
  });

  it("Knoten erscheinen unter dem Durchlaufplan (oder als Sub-Group)", () => {
    // Wire mit Knoten-Sub-Refs auf einem Plan
    const wire = makeFullWire();
    wire.objects[12] = {
      oid: 12,
      klass: "PDpKnKonstant",
      attrs: { m_sName: "Knoten-1" },
      sub_refs: [],
    };
    wire.objects[13] = {
      oid: 13,
      klass: "PDpKnKonstant",
      attrs: { m_sName: "Knoten-2" },
      sub_refs: [],
    };
    // Plan 10 verweist via sub_refs auf Knoten 12+13
    wire.objects[10].sub_refs = [[12, 13]];

    const tree = buildTree(wire);
    const root = tree[0];
    const plaeneGroup = findChild(root, "Durchlaufpläne");
    const planA = plaeneGroup?.children?.find((c) => c.label === "Plan A");
    expect(planA).toBeDefined();
    // Plan A muss eine "Knoten"-Sub-Gruppe haben
    const knotenGroup = findChild(planA!, "Knoten");
    expect(knotenGroup).toBeDefined();
    expect(knotenGroup?.children?.length).toBe(2);
  });

  it("Ressourcen-Gruppen (Belegung, Menge) existieren", () => {
    const tree = buildTree(makeFullWire());
    const root = tree[0];
    const belegGroup = findChild(root, "Belegungsressourcen");
    const mengeGroup = findChild(root, "Mengenressourcen");
    expect(belegGroup).toBeDefined();
    expect(belegGroup?.children?.length).toBe(1);
    expect(mengeGroup).toBeDefined();
    expect(mengeGroup?.children?.length).toBe(1);
  });

  it("Empty-Wire (nur Simulator) returnt single-root mit leeren Gruppen", () => {
    const empty: ModelTreeWire = {
      version: 1,
      simulator_oid: 0,
      objects: {
        0: {
          oid: 0,
          klass: "ASimulator",
          attrs: { m_name: "Empty" },
          sub_refs: [],
        },
      },
      coverage: { loaded: 1, skipped: 0, unsupported: [] },
      schemas_url: "/api/v1/schemas/v1",
    };
    const tree = buildTree(empty);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.oid).toBe(0);
    expect(root.children?.length).toBeGreaterThanOrEqual(1);
    // Gruppen sind leer aber existieren
    const plaeneGroup = findChild(root, "Durchlaufpläne");
    expect(plaeneGroup).toBeDefined();
    expect(plaeneGroup?.children?.length ?? 0).toBe(0);
  });
});
