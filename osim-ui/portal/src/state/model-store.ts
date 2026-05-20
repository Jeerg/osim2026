// Plan 01-04 Task 2: Modell-Store (Zustand).
//
// Halt das gerade geladene OTX-Modell als JSON-Tree im Browser-State.
// - Tree-Walk mit O(1)-oid-Index-Cache fuer haeufige updateProperty-Calls.
// - Snapshot-basiertes Undo (max 50 Eintraege, Ringbuffer). Phase-1-
//   Festlegung (CONTEXT D-10 + risks-Block in 01-04-PLAN); Phase 3+ kann
//   das durch Command-Pattern ersetzen wenn die Performance-Grenze
//   ueberschritten wird.
// - dirty-Set (Oid-Set) markiert geaenderte Knoten — Plan 09 nutzt das
//   fuer Auto-Save-Trigger.
// - Persistenz (IndexedDB-Snapshot) kommt in Plan 09 ueber
//   useModelStore.subscribe(...).

import { create } from "zustand";
import type { Oid, OtxJsonNode, PropertyValue } from "@/viewers/core/types";

const UNDO_LIMIT = 50;

/**
 * TEMP-OID-Counter — wird in addChildSkeleton beim Anlegen neuer Objekte
 * verwendet. Negativ, monoton fallend. Server konvertiert beim PUT /tree
 * (Plan 09) zu echten OIDs via id_mapping.
 */
let _nextTempOid = -1;

interface ModelSnapshot {
  tree: OtxJsonNode | null;
  selectedOid: Oid | null;
}

export interface ModelState {
  modelId: number | null;
  version: number | null;
  tree: OtxJsonNode | null;
  selectedOid: Oid | null;
  dirty: Set<Oid>;
  undoStack: ModelSnapshot[];
  redoStack: ModelSnapshot[];

  // oid-Index — wird bei jedem setTree neu aufgebaut.
  // Nicht in der State-Snapshot enthalten, weil aus tree ableitbar.
  _oidIndex: Map<Oid, OtxJsonNode>;

  setTree: (tree: OtxJsonNode, modelId: number, version: number) => void;
  updateProperty: (oid: Oid, key: string, value: PropertyValue) => void;
  addChild: (parentOid: Oid, newNode: OtxJsonNode) => void;
  /**
   * Plan 01-05 Task 3: erzeugt ein Skeleton-Objekt der angegebenen Klasse
   * (Defaults aus TYPE_MAP via getDefaultProperties — wird per Closure
   * injected, weil model-store keine Circular-Import auf viewers/property
   * machen darf) und fuegt es als Kind ein. Liefert die TEMP-OID zurueck,
   * damit der Caller (z.B. selectOid) sie weiter nutzen kann.
   */
  addChildSkeleton: (
    parentOid: Oid,
    childKlass: string,
    getDefaultProps: (klass: string) => Record<string, PropertyValue>,
  ) => Oid | null;
  removeNode: (oid: Oid) => void;
  selectOid: (oid: Oid | null) => void;
  undo: () => void;
  redo: () => void;
  markClean: () => void;
}

/** Tree-Walk: baut oid -> Node Map. */
function buildOidIndex(root: OtxJsonNode | null): Map<Oid, OtxJsonNode> {
  const idx = new Map<Oid, OtxJsonNode>();
  if (!root) return idx;
  const stack: OtxJsonNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    idx.set(node.oid, node);
    for (const child of node.children) stack.push(child);
  }
  return idx;
}

/**
 * Tiefe Kopie eines Knotens (rekursiv). JSON-Roundtrip ist fuer die
 * Phase-1-Datenmenge (~252 Objekte bei Dummy.otx) ausreichend schnell;
 * Bosch2_wechseln (18 MB) ist Read-Only-Test, kein Acceptance-Criterion.
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Immutable update: kopiert nur den Pfad von der Wurzel zum Ziel-Knoten,
 * lasst die anderen Branches per Referenz unveraendert. Reduziert die
 * Memory-Last gegenueber komplettem deepClone. Liefert das neue Root +
 * das gefundene neue Ziel-Knoten-Objekt zurueck.
 */
function updateNodeImmutable(
  root: OtxJsonNode,
  targetOid: Oid,
  mutator: (node: OtxJsonNode) => OtxJsonNode,
): { tree: OtxJsonNode; found: boolean } {
  if (root.oid === targetOid) {
    return { tree: mutator(root), found: true };
  }
  let updated = false;
  const newChildren = root.children.map((c) => {
    if (updated) return c;
    const sub = updateNodeImmutable(c, targetOid, mutator);
    if (sub.found) {
      updated = true;
      return sub.tree;
    }
    return c;
  });
  if (!updated) return { tree: root, found: false };
  return {
    tree: { ...root, children: newChildren },
    found: true,
  };
}

function takeSnapshot(state: ModelState): ModelSnapshot {
  return {
    tree: state.tree ? deepClone(state.tree) : null,
    selectedOid: state.selectedOid,
  };
}

function pushUndo(stack: ModelSnapshot[], snap: ModelSnapshot): ModelSnapshot[] {
  const next = stack.concat(snap);
  if (next.length > UNDO_LIMIT) {
    next.shift();
  }
  return next;
}

export const useModelStore = create<ModelState>((set, get) => ({
  modelId: null,
  version: null,
  tree: null,
  selectedOid: null,
  dirty: new Set<Oid>(),
  undoStack: [],
  redoStack: [],
  _oidIndex: new Map<Oid, OtxJsonNode>(),

  setTree: (tree, modelId, version) => {
    set({
      tree,
      modelId,
      version,
      selectedOid: null,
      dirty: new Set<Oid>(),
      undoStack: [],
      redoStack: [],
      _oidIndex: buildOidIndex(tree),
    });
  },

  updateProperty: (oid, key, value) => {
    const state = get();
    if (!state.tree) return;
    const snap = takeSnapshot(state);
    const { tree: newTree, found } = updateNodeImmutable(
      state.tree,
      oid,
      (node) => ({
        ...node,
        properties: { ...node.properties, [key]: value },
      }),
    );
    if (!found) return;
    const newDirty = new Set(state.dirty);
    newDirty.add(oid);
    set({
      tree: newTree,
      dirty: newDirty,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      _oidIndex: buildOidIndex(newTree),
    });
  },

  addChild: (parentOid, newNode) => {
    const state = get();
    if (!state.tree) return;
    const snap = takeSnapshot(state);
    const { tree: newTree, found } = updateNodeImmutable(
      state.tree,
      parentOid,
      (node) => ({
        ...node,
        children: [...node.children, newNode],
      }),
    );
    if (!found) return;
    const newDirty = new Set(state.dirty);
    newDirty.add(parentOid);
    newDirty.add(newNode.oid);
    set({
      tree: newTree,
      dirty: newDirty,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      _oidIndex: buildOidIndex(newTree),
    });
  },

  addChildSkeleton: (parentOid, childKlass, getDefaultProps) => {
    const state = get();
    if (!state.tree) return null;
    const props = getDefaultProps(childKlass);
    const tempOid = _nextTempOid;
    _nextTempOid -= 1;
    const skeletonName =
      typeof props.m_sName === "string" && props.m_sName.length > 0
        ? props.m_sName
        : `${childKlass}-${tempOid}`;
    const skeleton: OtxJsonNode = {
      oid: tempOid,
      klass: childKlass,
      name: skeletonName,
      properties: props,
      children: [],
    };
    state.addChild(parentOid, skeleton);
    // selectOid auf den neu angelegten Knoten setzen (UX: User sieht
    // ihn sofort).
    set({ selectedOid: tempOid });
    return tempOid;
  },

  removeNode: (oid) => {
    const state = get();
    if (!state.tree) return;
    if (state.tree.oid === oid) {
      // Wurzel kann nicht entfernt werden.
      return;
    }
    const snap = takeSnapshot(state);
    // Finde Parent durch Tree-Walk.
    let parentOid: Oid | null = null;
    const walk = (n: OtxJsonNode): boolean => {
      for (const c of n.children) {
        if (c.oid === oid) {
          parentOid = n.oid;
          return true;
        }
        if (walk(c)) return true;
      }
      return false;
    };
    walk(state.tree);
    if (parentOid === null) return;
    const { tree: newTree } = updateNodeImmutable(
      state.tree,
      parentOid,
      (node) => ({
        ...node,
        children: node.children.filter((c) => c.oid !== oid),
      }),
    );
    const newDirty = new Set(state.dirty);
    newDirty.add(parentOid);
    newDirty.delete(oid);
    set({
      tree: newTree,
      dirty: newDirty,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      _oidIndex: buildOidIndex(newTree),
      selectedOid: state.selectedOid === oid ? null : state.selectedOid,
    });
  },

  selectOid: (oid) => {
    set({ selectedOid: oid });
  },

  undo: () => {
    const state = get();
    const last = state.undoStack[state.undoStack.length - 1];
    if (!last) return;
    const current: ModelSnapshot = takeSnapshot(state);
    set({
      tree: last.tree,
      selectedOid: last.selectedOid,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: state.redoStack.concat(current),
      _oidIndex: buildOidIndex(last.tree),
    });
  },

  redo: () => {
    const state = get();
    const last = state.redoStack[state.redoStack.length - 1];
    if (!last) return;
    const current: ModelSnapshot = takeSnapshot(state);
    set({
      tree: last.tree,
      selectedOid: last.selectedOid,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: state.undoStack.concat(current),
      _oidIndex: buildOidIndex(last.tree),
    });
  },

  markClean: () => {
    set({ dirty: new Set<Oid>() });
  },
}));

/**
 * Selector: liefert alle Nodes einer bestimmten Klasse aus dem Tree.
 * Wird von OCtrlLink benutzt, um Link-Kandidaten-Listen zu fuellen.
 * Re-evaluiert bei jedem tree-Change (Zustand cached nur den Selector,
 * nicht das Ergebnis — fuer Phase 1 ok bei <300 Objekten).
 */
export function selectByKlass(
  state: ModelState,
  klass: string,
): OtxJsonNode[] {
  return Array.from(state._oidIndex.values()).filter((n) => n.klass === klass);
}

/** Lookup-Helper: liefert den Knoten mit der gegebenen Oid (O(1)). */
export function selectByOid(
  state: ModelState,
  oid: Oid | null,
): OtxJsonNode | null {
  if (oid === null) return null;
  return state._oidIndex.get(oid) ?? null;
}
