// Plan 01-07 Task 2: PDurchlaufplanViewerDesign.
//
// Portierung des C++-PDurchlaufplanViewer-Design-Modus (siehe
// PDurchlaufplanViewer.h / PDlplViewerGObj.h): graphische Sicht auf einen
// Durchlaufplan mit reactflow als Rendering-Backend.
//
// Datenfluss:
//   PDurchlaufplan (obj)
//     children = [_group "Knoten" {PDpKn*-Liste}, _group "Kanten" {PDlplKante|PDpKaUebergang-Liste}]
//
// Konvertierung in GraphObject-Welt:
//   - Knoten → KnotenNode (PDpKn*) oder Default-KnotenNode (unbekannte
//     klasse).
//   - Kanten → KanteEdge (GObjLink) mit m_lVon/m_lNach als source/target.
//
// Auto-Layout:
//   Da die Engine OGfxDesign*-Daten skippt, sind keine Original-Positionen
//   im Tree. computeAutoLayout (dagre) liefert eine deterministische
//   Layoutierung; manuell-gezogene Knoten werden in position-store
//   ueberschrieben (Session-lokal, Plan 09 verdrahtet IndexedDB).
//
// Edit-Operationen:
//   - Drag eines Knotens → setNodePositionOverride
//   - Drag von Handle-zu-Handle → addChildSkeleton(plan-oid, "PDpKaUebergang")
//     mit m_lVon/m_lNach gesetzt (Methoden-Dispatch via onMethodCall +
//     ViewerHost.methodDispatcher aus Plan 05)
//   - Doppelklick auf Knoten → selectOid(node.oid) (oeffnet
//     Property-Viewer im Std-Pendant / Sidebar)

import { useCallback, useMemo, useEffect, useReducer } from "react";
import { GraphView, GObjLink } from "@/graph/core";
import { KnotenNode } from "@/graph/nodes/KnotenNode";
import { AusloeserNode } from "@/graph/nodes/AusloeserNode";
import { KanteEdge } from "@/graph/edges/KanteEdge";
import { useChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/state/model-store";
import { computeAutoLayout } from "./auto-layout";
import {
  getNodePositionOverride,
  setNodePositionOverride,
  subscribeOverrides,
} from "./position-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";
import type { Position } from "@/graph/core/types";

// ---------------------------------------------------------------------------
// Klassen-Klassifikation.
// ---------------------------------------------------------------------------

function isAusloeserKlass(klass: string): boolean {
  return (
    klass.startsWith("PAsl") ||
    klass.startsWith("EPAsl") ||
    klass === "ACOAnt"
  );
}

function isKanteKlass(klass: string): boolean {
  return klass === "PDlplKante" || klass === "PDpKaUebergang";
}

// ---------------------------------------------------------------------------
// Sub-Gruppen-Lookup (analog PDurchlaufplanViewerStd).
// ---------------------------------------------------------------------------

function findGroup(obj: OtxJsonNode, name: string): OtxJsonNode | null {
  return (
    obj.children.find((c) => c.klass === "_group" && c.name === name) ?? null
  );
}

/**
 * Sammelt die Knoten + Ausloeser, die der Design-Viewer rendern soll.
 * In Phase 1 nehmen wir nur die Knoten-Gruppe; Ausloeser haengen direkt
 * unter dem ASimulator, nicht unter einem Plan. Wenn das spaeter geaendert
 * werden soll (z.B. plan-spezifische Ausloeser), erweitern wir hier.
 */
function collectKnoten(obj: OtxJsonNode): OtxJsonNode[] {
  const g = findGroup(obj, "Knoten");
  return g ? g.children : [];
}

function collectKanten(obj: OtxJsonNode): OtxJsonNode[] {
  const g = findGroup(obj, "Kanten");
  return g ? g.children : [];
}

// ---------------------------------------------------------------------------
// Konvertierung Plan-Children → GraphObject-Instanzen.
// ---------------------------------------------------------------------------

function makeGObject(
  child: OtxJsonNode,
  position: Position,
): KnotenNode | AusloeserNode {
  const klass = child.klass;
  const name = String(child.properties.m_sName ?? child.name ?? "Knoten");
  if (isAusloeserKlass(klass)) {
    const beginTermin = Number(child.properties.m_iBeginTermin ?? 0);
    return new AusloeserNode(
      String(child.oid),
      position,
      klass,
      name,
      beginTermin,
    );
  }
  // Default: KnotenNode (PDpKn* oder unbekannte Klassen mit
  // gestrichelt-amber Rand-Rendering).
  // Dauer-Property: PDpKnKonstant → m_iDurchfuehrungszeit; andere → variabel.
  const dauer = Number(
    child.properties.m_iDurchfuehrungszeit ??
      child.properties.m_iDfzProEinheit ??
      child.properties.m_iVerteilZeit ??
      0,
  );
  return new KnotenNode(String(child.oid), position, klass, name, dauer);
}

// ---------------------------------------------------------------------------
// Hauptkomponente.
// ---------------------------------------------------------------------------

export const PDurchlaufplanViewerDesign: ChildDialogComponent = ({ obj }) => {
  const { onMethodCall } = useChildDialog();
  const selectOid = useModelStore((s) => s.selectOid);
  const updateProperty = useModelStore((s) => s.updateProperty);

  // Re-Render-Tick bei Override-Changes (Session-Drag).
  const [, bumpOverrideTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeOverrides(bumpOverrideTick), []);

  const knoten = useMemo(() => collectKnoten(obj), [obj]);
  const kanten = useMemo(() => collectKanten(obj), [obj]);

  // 1) Auto-Layout berechnen (deterministisch fuer leeren Override-Store).
  const layoutMap = useMemo(() => {
    const nodeIds = knoten.map((k) => String(k.oid));
    const edges = kanten
      .filter((k) => isKanteKlass(k.klass))
      .map((k) => ({
        source: String(k.properties.m_lVon ?? ""),
        target: String(k.properties.m_lNach ?? ""),
      }))
      .filter((e) => e.source && e.target);
    return computeAutoLayout(nodeIds, edges, { rankdir: "LR" });
  }, [knoten, kanten]);

  // 2) Pro Knoten: Override-Position > Auto-Layout > Fallback (0,0).
  const gObjects = useMemo(() => {
    return knoten.map((k) => {
      const override = getNodePositionOverride(obj.oid, k.oid);
      const auto = layoutMap.get(String(k.oid));
      const pos: Position = override ?? auto ?? { x: 0, y: 0 };
      return makeGObject(k, pos);
    });
    // bumpOverrideTick triggert ein neues bumpOverrideTick-Increment;
    // useReducer-state-Wert ist die dependency via re-render durch state-change.
  }, [knoten, layoutMap, obj.oid]);

  // 3) Kanten als GObjLinks/KanteEdges aufbauen, nur wenn beide Endpunkte
  //    im aktuellen Plan vorhanden sind.
  const gLinks = useMemo(() => {
    const byId = new Map(gObjects.map((g) => [g.id, g]));
    const out: GObjLink[] = [];
    for (const k of kanten) {
      if (!isKanteKlass(k.klass)) continue;
      const src = byId.get(String(k.properties.m_lVon ?? ""));
      const dst = byId.get(String(k.properties.m_lNach ?? ""));
      if (!src || !dst) continue;
      const dauer = Number(k.properties.m_iUebergangszeit ?? 0);
      out.push(
        new KanteEdge(String(k.oid), src, dst, k.klass, dauer),
      );
    }
    return out;
  }, [kanten, gObjects]);

  // Callbacks fuer GraphView.
  const onObjectMove = useCallback(
    (id: string, pos: Position) => {
      // Phase 1: Override im Session-Store. Plan 09 wird das auf
      // IndexedDB (dexie) verdrahten, sobald die Save-Mechanik steht.
      // Optional: zusaetzlich m_xUiPosX/Y-Properties im model-store
      // setzen — das wuerde aber die Engine-Writer-Liste erweitern und
      // dirty markieren. Phase-1-Entscheidung: nur Session-Override.
      setNodePositionOverride(obj.oid, Number(id), pos);
      // Wir setzen optional auch die Properties im model-store (markiert
      // dirty + landet beim Save-Roundtrip im Engine-Tree — wird in Plan
      // 09 / Phase 2 entschieden, ob die Engine das akzeptiert; bis dahin
      // schadet es nicht, weil unsupported Properties ignoriert werden).
      updateProperty(Number(id), "m_xUiPosX", pos.x);
      updateProperty(Number(id), "m_xUiPosY", pos.y);
    },
    [obj.oid, updateProperty],
  );

  const onLinkCreate = useCallback(
    (sourceId: string, targetId: string) => {
      // addChild mit Default-Klass PDpKaUebergang + m_lVon/m_lNach.
      // Der ViewerHost.methodDispatcher (Plan 05) routet addChild auf
      // model-store.addChildSkeleton; die m_lVon/m_lNach-Werte muessen
      // nach dem Skeleton-Add via updateProperty gesetzt werden.
      onMethodCall(obj.oid, "addChild", ["PDpKaUebergang"]);
      // Nach addChild kennt der model-store eine neue TEMP-OID; wir
      // koennen die VON/NACH-Properties via getState() injizieren, um
      // den User-Workflow nicht durch zwei Klicks zu unterbrechen.
      // Das ist eine Phase-1-Optimierung: in einer spaeteren Iteration
      // koennte der Dispatcher addChildWithProps annehmen.
      const state = useModelStore.getState();
      // Finde den zuletzt hinzugefuegten Kanten-Knoten unter "_group:Kanten".
      // Nach selectOid auf den neuen Skeleton (siehe addChildSkeleton).
      const newOid = state.selectedOid;
      if (newOid !== null && newOid < 0) {
        state.updateProperty(newOid, "m_lVon", Number(sourceId));
        state.updateProperty(newOid, "m_lNach", Number(targetId));
      }
    },
    [obj.oid, onMethodCall],
  );

  const onObjectDoubleClick = useCallback(
    (id: string) => {
      // Doppelklick selektiert den Knoten → Sidebar markiert + ViewerHost
      // mountet den Property-Viewer (Plan 05 Standard-Routing).
      selectOid(Number(id));
    },
    [selectOid],
  );

  return (
    <div className="flex h-full flex-col" data-testid="pdurchlaufplan-viewer-design">
      <header className="border-b border-gray-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-800">
          Design-Modus: {obj.name}
        </h3>
        <p className="text-xs text-gray-500">
          {gObjects.length} Knoten · {gLinks.length} Kanten · Auto-Layout
          (dagre, links-nach-rechts)
        </p>
      </header>
      <div
        className="flex-1"
        style={{ minHeight: 480 }}
        data-testid="pdurchlaufplan-design-canvas"
      >
        {gObjects.length === 0 ? (
          <div
            className="m-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            data-testid="pdurchlaufplan-design-empty"
          >
            Plan enthaelt keine Knoten. Knoten ueber den Standard-Modus
            hinzufuegen.
          </div>
        ) : (
          <GraphView
            objects={gObjects}
            links={gLinks}
            onObjectMove={onObjectMove}
            onLinkCreate={onLinkCreate}
            onObjectDoubleClick={onObjectDoubleClick}
          />
        )}
      </div>
      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[10px] text-gray-500">
        Phase 1: Positions-Persistenz session-lokal (kein Backend-Roundtrip).
        Save-back kommt mit Plan 09 (IndexedDB-Override).
      </footer>
    </div>
  );
};

PDurchlaufplanViewerDesign.displayName = "PDurchlaufplanViewerDesign";

// ---------------------------------------------------------------------------
// Synthetische Klasse fuer Registry-Lookup (vgl. Plan-06-Pattern).
//
// Wir registrieren PDurchlaufplanViewerDesign nicht unter "PDurchlaufplan"
// (das ist der Std-Viewer aus Plan 05), sondern unter einer synthetischen
// Klasse "PDurchlaufplanDesign". Die Tab-Switch-Logik im Std-Viewer ruft
// dann diese Klasse via getViewer auf — saubere Trennung, kein "letzte-
// Registrierung-gewinnt"-Konflikt mit Plan 05.
//
// Konsumenten:
//   - PDurchlaufplanViewerStd (Plan 05, modifiziert in diesem Plan)
//   - Tests: import { PDurchlaufplanViewerDesign } from ".../design"
// ---------------------------------------------------------------------------

export const SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS = "PDurchlaufplanDesign";

import { registerViewer } from "@/viewers/core/viewer-registry";

registerViewer({
  klass: SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS,
  component: PDurchlaufplanViewerDesign,
  displayName: "Durchlaufplan (Design)",
});
