---
phase: 01-vertical-slice
plan: 10
type: execute
wave: 6
depends_on:
  - 01-08-viewers-property
  - 01-09-viewers-matrix
files_modified:
  - portal/src/graph/core/GObject.ts
  - portal/src/graph/core/GObjLink.ts
  - portal/src/graph/core/GLink.ts
  - portal/src/graph/core/ReactFlowAdapter.tsx
  - portal/src/graph/core/OsimCustomNode.tsx
  - portal/src/graph/core/graph-builder.ts
  - portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx
  - portal/src/viewers/setup.ts
  - portal/src/graph/core/__tests__/graph-builder.spec.ts
  - portal/src/viewers/__tests__/PDurchlaufplanViewerDesign.spec.tsx
  - portal/package.json
autonomous: true
requirements:
  - SC-4
  - SC-6
priority: high

must_haves:
  truths:
    - "GraphObject-Basis-Schicht existiert: GObject, GObjLink, GLink als TypeScript-Klassen (minimal-Subset von OSim2004/inc/GraphObj.h)."
    - "graph-builder.ts wandelt einen PDurchlaufplan + dessen sub_refs (Knoten + Kanten) in React-Flow-Nodes+Edges um."
    - "PDurchlaufplanViewerDesign rendert React-Flow-Canvas mit den Knoten + Kanten des Plans; pan + zoom + node-drag funktionieren."
    - "Toolbar bietet Buttons: 'Knoten hinzufügen' (öffnet Dialog → Klasse-Picker → click auf Canvas-Position → createObject), 'Auswahl löschen' (deleteObject)."
    - "Connection-Drag von einem Knoten-Handle zum nächsten → createObject('PDlplKante', {m_oid_von, m_oid_nach})."
    - "Node-Drag-Stop ruft patchObject(oid, {m_iPosX, m_iPosY}) — auch wenn Position bisher nicht in PropertySchema, wird hier optional dazugefügt."
    - "Performance-Patterns aus Pitfall #5 eingehalten: React.memo um Custom-Node, nodeTypes außerhalb Component, useCallback für Handlers, onlyRenderVisibleElements=true."
  artifacts:
    - path: "portal/src/graph/core/GObject.ts"
      provides: "Basis-Klasse GObject mit id, position, data {label, state?, viewedOid}"
      contains: "interface GObject"
    - path: "portal/src/graph/core/GObjLink.ts"
      provides: "GObjLink mit prev[] + next[] Link-Listen"
      contains: "interface GObjLink"
    - path: "portal/src/graph/core/GLink.ts"
      provides: "GLink mit from + to + direction"
      contains: "interface GLink"
    - path: "portal/src/graph/core/ReactFlowAdapter.tsx"
      provides: "Wrap um @xyflow/react mit memoized CustomNode und Performance-Optimierungen"
      contains: "ReactFlow"
    - path: "portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx"
      provides: "Graphischer Durchlaufplan-Viewer (12/12 Viewer komplett)"
      contains: "PDurchlaufplanViewerDesign"
  key_links:
    - from: "PDurchlaufplanViewerDesign"
      to: "graph-builder.ts → ReactFlowAdapter"
      via: "buildGraph(plan, allObjects) → React-Flow-Nodes+Edges → ReactFlow Component"
      pattern: "buildGraph"
    - from: "ReactFlowAdapter onNodeDragStop"
      to: "useModelStore.patchObject"
      via: "Position-Update direkt in Store"
      pattern: "patchObject"
    - from: "ReactFlowAdapter onConnect"
      to: "useModelStore.createObject('PDlplKante', ...)"
      via: "Source/Target → neue Kante"
      pattern: "createObject"
---

<objective>
Letzter Viewer aus SC-04: graphische Darstellung eines Durchlaufplans (Knoten + Kanten). Damit ist die 12er-Viewer-Liste komplett. Wir bauen einen MINIMAL-Subset der GraphObject-Schicht aus OSim2004/inc/GraphObj.h (3 Basis-Klassen statt ~30; vollständiger Port in Phase 4).

Phase-1-Scope (MVP-Empfehlung aus RESEARCH §Open Questions #4):
- Graphische Darstellung Read-Only-Topologie funktioniert.
- Knoten/Kanten anlegen via TOOLBAR-Buttons + Click auf Canvas-Position (NICHT Drag-and-Drop aus einer Palette — das ist Phase 4).
- Knoten-Drag bewegt Position (persistiert via patchObject).
- Connection-Drag zwischen zwei Knoten-Handles erzeugt neue Kante.
- Selection + Delete-Button entfernt selektierte Nodes/Edges.

Performance: alle 5 Pitfall-#5-Mitigations strikt einhalten.

Purpose: SC-4 vollständig (12/12). SC-6 Edit-Operationen für graphischen Viewer abgedeckt.

Output: 4 graph/core-Files + 1 Viewer + 2 Tests. 12/12 Viewer registriert in setup.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/phases/01-vertical-slice/01-07-property-schema-store-sidebar-workspace-PLAN.md
@.planning/phases/01-vertical-slice/01-08-viewers-property-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 06+07+08 -->
```typescript
// portal/src/viewers/core/types.ts (Plan 06)
export interface ViewerProps {...}
export interface OBaseObj {...}

// portal/src/stores/model-store.ts (Plan 07)
useModelStore.getState().patchObject(oid, patch)
useModelStore.getState().createObject(klass, attrs) -> number
useModelStore.getState().deleteObject(oid)
useModelStore(s => s.selection)

// portal/src/viewers/core/ViewerRegistry.ts (Plan 06)
viewerRegistry.register({klass, hint, Component})
```

<!-- C++-Quelle -->
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h
  - Z.341 (GObject) — Basis mit id, position, size, state, string, Farben
  - Z.533 (GObjLink) — extends GObject, mit prev[]/next[]
  - Z.1004 (GLink) — extends GObject, mit from/to/direction
  - Z.1000-1030 (GLDirection-Enum, 16 Werte) — Phase 1 vereinfachen
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplViewerGObj.h (Design-Viewer-Vorlage)

<!-- React Flow API -->
- npm view @xyflow/react version: 12.10.2
- API: ReactFlow, Node, Edge, useNodesState, useEdgesState, Position, Handle, MarkerType, Background, Controls, MiniMap
- Performance: onlyRenderVisibleElements, React.memo CustomNode, nodeTypes outside Component
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: package.json + GraphObject-Basis-Schicht (GObject/GObjLink/GLink)</name>
  <files>portal/package.json, portal/src/graph/core/GObject.ts, portal/src/graph/core/GObjLink.ts, portal/src/graph/core/GLink.ts</files>
  <read_first>
    - portal/package.json (aktueller Stand — @xyflow/react fehlt noch)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h Z.341-380 (GObject-Struktur) + Z.533-580 (GObjLink) + Z.1004-1060 (GLink + GLDirection-Enum)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 5 (Z.726-803 vollständiges Skelett)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/graph/core/*`)
  </read_first>
  <behavior>
    - npm install nach Hinzufügen von @xyflow/react@^12.10 erfolgreich.
    - 3 TS-Interfaces existieren mit minimalen Feldern (siehe RESEARCH §Pattern 5 Z.730-744 Tabelle).
    - GLDirection-Enum als String-Literal-Type (vereinfacht von C++ 16 Werten auf 4: "left-right", "top-bottom", "right-left", "bottom-top").
  </behavior>
  <action>
    Erweitere `portal/package.json` deps:
    - `@xyflow/react@^12.10`

    Erstelle `portal/src/graph/core/GObject.ts`:
    - `export type GObjState = "idle" | "busy" | "blocked"` (vereinfacht von C++-Enum, für Phase 4 erweiterbar)
    - `export type GObjNodeType = "konstant" | "alternativ" | "speicher" | "ausloeser" | "kante" | "default"`
    - `export interface GObject { id: string; type: GObjNodeType; position: { x: number; y: number }; size?: { w: number; h: number }; data: { label: string; state?: GObjState; backColor?: string; textColor?: string; viewedOid: number; }; }`
    - Helper-Funktion `export function gObjectFromOBaseObj(obj: OBaseObj): GObject`:
      - id = `oid:${obj.oid}`
      - type = mapping aus obj.klass: PDpKnKonstant → "konstant", PDpKnAlternativ → "alternativ", PRessMenge → "speicher" (für In-Place-Knoten-Speicher), PAslEinzel → "ausloeser", default → "default"
      - position: aus attrs.m_iPosX / m_iPosY wenn vorhanden (number-Cast); sonst default (0,0). HINWEIS: Original-OTX hat Position-Felder per Konvention; wenn fehlend, Layout via Dagre in Task 4.
      - data.label: obj.attrs.m_sName ?? `${obj.klass} (${obj.oid})`
      - data.viewedOid: obj.oid

    Erstelle `portal/src/graph/core/GObjLink.ts`:
    - `export interface GObjLink extends GObject { prev: string[]; next: string[]; }` (prev/next sind id-Strings, NICHT oids)
    - Helper `gObjLinkFromOBaseObj(obj, wire): GObjLink`: nutzt obj.sub_refs[0] für prev/next-Berechnung. HINWEIS: Konkrete Logik abhängig von Engine-Konvention; in Phase 1 leeres prev/next + im Builder via Kanten ableiten.

    Erstelle `portal/src/graph/core/GLink.ts`:
    - `export type GLDirection = "left-right" | "top-bottom" | "right-left" | "bottom-top"`
    - `export interface GLink extends GObject { from: string; to: string; direction: GLDirection; }`
    - Helper `gLinkFromKanteObj(kante: OBaseObj): GLink`:
      - id = `kante:${kante.oid}`
      - type = "kante"
      - from = `oid:${kante.attrs.m_oid_von}`
      - to = `oid:${kante.attrs.m_oid_nach}`
      - direction = "left-right" (default; Phase 1 keine Direction-Differenzierung)
      - position = {x: 0, y: 0} (irrelevant für Kanten)
      - data: {label: kante.attrs.m_sName ?? "", viewedOid: kante.oid}
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    package.json hat @xyflow/react. 3 Files in portal/src/graph/core/ existieren. Helper-Funktionen für Wire→Graph-Transformation bereit.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: graph-builder.ts — wandelt Plan + Wire in React-Flow-Nodes+Edges + Test</name>
  <files>portal/src/graph/core/graph-builder.ts, portal/src/graph/core/__tests__/graph-builder.spec.ts</files>
  <read_first>
    - portal/src/graph/core/GObject.ts + GObjLink.ts + GLink.ts (aus Task 1)
    - portal/src/viewers/core/types.ts (OBaseObj)
    - portal/src/api/models.ts (ModelTreeWire)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h (für 4-Layer-Drawing-Konzept — KOMMT NICHT in Phase 1; nur GObject + Edges)
  </read_first>
  <behavior>
    - `buildGraph(planOid: number, allObjects: Record<number, OBaseObj>) -> { nodes: Node[]; edges: Edge[] }` extrahiert Knoten und Kanten eines Plans.
    - Knoten = sub_refs[0] des Plans → für jeden Knoten-Oid: gObjectFromOBaseObj + map zu React-Flow-Node.
    - Kanten = sub_refs[1] des Plans → für jede Kante-Oid: gLinkFromKanteObj + map zu React-Flow-Edge.
    - Wenn ein Knoten keine Position hat (alle x=0, y=0): wende Auto-Layout an. Phase 1 minimaler Auto-Layout = "horizontal-linear" (Knoten in einer Reihe, dx=200). Dagre als Backlog.
    - 3 Tests:
      - test_builds_nodes_from_sub_refs: Mock Plan mit sub_refs=[[10,11,12],[20]] + 4 objs → buildGraph → 3 Nodes + 1 Edge.
      - test_node_label_from_m_sName: Mock Knoten mit attrs.m_sName="Bearbeitung 1" → Node-data.label === "Bearbeitung 1".
      - test_edge_source_target_from_kante_attrs: Kante mit attrs.m_oid_von=10, m_oid_nach=11 → Edge.source==="oid:10", Edge.target==="oid:11".
  </behavior>
  <action>
    Erstelle `portal/src/graph/core/graph-builder.ts`:
    - Imports: types (OBaseObj), Node/Edge aus @xyflow/react, helpers aus GObject/GLink.
    - `export function buildGraph(planOid: number, allObjects: Record<number, OBaseObj>): { nodes: Node[]; edges: Edge[] }`:
      - plan = allObjects[planOid]; if !plan → return {nodes:[], edges:[]}
      - knotenOids = plan.sub_refs[0] ?? []; kantenOids = plan.sub_refs[1] ?? []
      - knoten = knotenOids.map(oid => allObjects[oid]).filter(Boolean)
      - kanten = kantenOids.map(oid => allObjects[oid]).filter(Boolean)
      - gNodes = knoten.map(gObjectFromOBaseObj)
      - if (alle gNodes haben position.x === 0 && position.y === 0): Apply Linear-Layout (siehe Helper unten).
      - gEdges = kanten.map(gLinkFromKanteObj)
      - return {nodes: gNodes.map(g => ({id: g.id, type: "osim", position: g.position, data: g.data})), edges: gEdges.map(g => ({id: g.id, source: g.from, target: g.to, type: "smoothstep", animated: false}))}
    - Helper `applyLinearLayout(gNodes: GObject[]): GObject[]`:
      - return gNodes.map((g, i) => ({...g, position: {x: 100 + i * 200, y: 200}}))
    - Helper `applyDagreLayout(gNodes, gEdges)`: Stub mit TODO für Phase 4.

    Erstelle `portal/src/graph/core/__tests__/graph-builder.spec.ts`:
    - Fixture: Mock-allObjects mit Plan-oid=100 (sub_refs=[[10,11,12],[20]]) + Knoten 10/11/12 (PDpKnKonstant mit m_sName) + Kante 20 (PDlplKante mit m_oid_von=10, m_oid_nach=11).
    - 3 Tests aus dem `<behavior>`-Block.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- graph-builder 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    graph-builder.ts existiert. 3 Tests grün. Linear-Layout als Fallback.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: OsimCustomNode (memoized) + ReactFlowAdapter mit Performance-Optimierungen</name>
  <files>portal/src/graph/core/OsimCustomNode.tsx, portal/src/graph/core/ReactFlowAdapter.tsx</files>
  <read_first>
    - portal/src/graph/core/GObject.ts (Task 1 — GObjNodeType, GObjState)
    - portal/src/graph/core/graph-builder.ts (Task 2)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #5 (Performance-Patterns)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/graph/core/*` + ReactFlow-Adapter)
    - @xyflow/react Docs (https://reactflow.dev/api-reference/components/custom-node)
  </read_first>
  <behavior>
    - `OsimCustomNode` ist React.memo-wrapped. Rendert ein div mit Background-Color basierend auf data.state (idle=blau, busy=orange, blocked=rot), Border, Label, Klasse-Type-Icon.
    - Hat 2 Handles: Left (target/incoming) und Right (source/outgoing).
    - `ReactFlowAdapter` rendert `<ReactFlow>` mit alle Performance-Mitigations: nodeTypes OUTSIDE component, React.memo CustomNode, useCallback für Handlers, onlyRenderVisibleElements={true}.
    - Hat Background + Controls (zoom in/out/fit) + MiniMap (top-right corner).
  </behavior>
  <action>
    Erstelle `portal/src/graph/core/OsimCustomNode.tsx`:
    - `import { memo } from "react"; import { Handle, Position, type NodeProps } from "@xyflow/react"`
    - Helper `colorForState(s?: GObjState): string`: switch idle/busy/blocked → tailwind-class-Suffix.
    - Helper `iconForType(t: GObjNodeType): string`: emoji oder lucide-icon-name. KONSTANT="▪" ALTERNATIV="◆" SPEICHER="⬭" AUSLOESER="↪" DEFAULT="●".
    - Component:
      ```jsx
      function OsimCustomNodeImpl({data}: NodeProps) {
        const stateClass = data.state === "busy" ? "border-orange-500 bg-orange-50" : data.state === "blocked" ? "border-red-500 bg-red-50" : "border-blue-500 bg-blue-50";
        return (
          <div className={`min-w-[140px] rounded border-2 px-3 py-2 text-sm shadow-sm ${stateClass}`}>
            <Handle type="target" position={Position.Left} />
            <div className="flex items-center gap-2">
              <span className="text-base">{iconForType(data.type as GObjNodeType)}</span>
              <span className="font-medium truncate">{data.label}</span>
            </div>
            <Handle type="source" position={Position.Right} />
          </div>
        );
      }
      export const OsimCustomNode = memo(OsimCustomNodeImpl);
      ```
    - data.type ist eigentlich nicht im data-Object (data hat label, state, viewedOid) — Korrektur: type ist auf Node-Level (Node.type), nicht data.type. Workaround: data.nodeType setzen wenn nötig, oder type aus NodeProps lesen: `({type, data}: NodeProps) => ...`.

    Erstelle `portal/src/graph/core/ReactFlowAdapter.tsx`:
    - Imports: ReactFlow, Background, Controls, MiniMap, Node, Edge, OnConnect, OnNodeDragStop, etc.
    - `import { useCallback, useMemo } from "react"`
    - `const nodeTypes = { osim: OsimCustomNode }` — TOP-LEVEL, NICHT in Component! (Pitfall #5)
    - Props: `{ nodes: Node[]; edges: Edge[]; onNodeDragStop?: (id: string, position: {x:number,y:number}) => void; onConnect?: (params: {source: string; target: string}) => void; onSelectionChange?: (selectedIds: string[]) => void; disabled?: boolean; }`
    - Component:
      ```jsx
      export function ReactFlowAdapter({nodes, edges, onNodeDragStop, onConnect, onSelectionChange, disabled}: Props) {
        const handleNodeDragStop = useCallback((event, node) => onNodeDragStop?.(node.id, node.position), [onNodeDragStop]);
        const handleConnect = useCallback((params) => onConnect?.({source: params.source!, target: params.target!}), [onConnect]);
        const handleSelectionChange = useCallback(({nodes: sel}) => onSelectionChange?.(sel.map(n => n.id)), [onSelectionChange]);
        return (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onSelectionChange={handleSelectionChange}
            onlyRenderVisibleElements
            nodesDraggable={!disabled}
            nodesConnectable={!disabled}
            elementsSelectable={!disabled}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
            <MiniMap position="top-right" pannable zoomable />
          </ReactFlow>
        );
      }
      ```

    KEIN explizites CSS-Import — @xyflow/react v12 lädt sein CSS automatisch (oder manuell `import "@xyflow/react/dist/style.css"` in main.tsx — Executor entscheidet basierend auf React-Flow-Docs).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    OsimCustomNode.tsx + ReactFlowAdapter.tsx existieren. React.memo + nodeTypes-outside + useCallback eingehalten. onlyRenderVisibleElements aktiv. Background + Controls + MiniMap dabei.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: PDurchlaufplanViewerDesign mit Toolbar + Edit-Operationen + Test</name>
  <files>portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx, portal/src/viewers/__tests__/PDurchlaufplanViewerDesign.spec.tsx</files>
  <read_first>
    - portal/src/graph/core/graph-builder.ts (aus Task 2)
    - portal/src/graph/core/ReactFlowAdapter.tsx (aus Task 3)
    - portal/src/stores/model-store.ts (Plan 07)
    - portal/src/viewers/core/types.ts (Plan 06)
    - portal/src/components/ui/button.tsx + dialog.tsx + select.tsx (Plan 03 + 06)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Open Questions #4 (MVP-Empfehlung Toolbar+Klick statt Drag-and-Drop)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplViewerGObj.h
  </read_first>
  <behavior>
    - `<PDurchlaufplanViewerDesign>` rendert:
      - Header: "Durchlaufplan: ${name} (Design-Ansicht)"
      - Toolbar: 3 Buttons: "Knoten hinzufügen" (öffnet Dialog mit Klasse-Picker), "Auswahl löschen" (löscht selektierte Nodes), "Layout neu rechnen" (re-applies linear-layout).
      - Canvas: ReactFlowAdapter mit nodes/edges aus buildGraph(plan.oid, allObjects).
    - Selection: lokal in State; Delete-Button löscht alle selektierten over useModelStore.deleteObject.
    - Knoten hinzufügen: Dialog mit Select (PDpKnKonstant/PDpKnAlternativ/PDpKnSpeicher), nach Auswahl + Klick auf Canvas → createObject mit defaultattrs + füge oid in plan.sub_refs[0] hinzu (über patchObject({_sub_refs_0_append: newOid}) — ALTERNATIV: Custom-Store-Action `addKnotenToPlan(planOid, newOid)`).
    - Node-Drag-Stop: useModelStore.patchObject(viewedOid, {m_iPosX, m_iPosY}). HINWEIS: m_iPosX/m_iPosY müssen im Wire-Format akzeptiert werden — kommt vom Engine als attrs, oder werden hier zur Laufzeit ergänzt (Phase 1: schreibe in attrs, beim Save bleibt erhalten wenn OtxWriter es schreibt — falls nicht, Phase-2-Engine-Feature).
    - Connection-Drag: useModelStore.createObject("PDlplKante", {m_oid_von: parseOidFromId(source), m_oid_nach: parseOidFromId(target)}) + addKanteToPlan.
    - Test:
      - test_renders_canvas_with_nodes: Mock 3-Knoten-Plan → assert ReactFlowAdapter rendered, 3 Nodes (via querySelectorAll(.react-flow__node)).
      - test_add_node_button_opens_dialog: click → assert Dialog visible mit Class-Picker.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx`:
    - Imports: ViewerProps, ReactFlowAdapter, buildGraph, useModelStore, Button, Dialog, Select.
    - Local State: `[selectedIds, setSelectedIds]`, `[isAddDialogOpen, setIsAddDialogOpen]`, `[newKnotenKlass, setNewKnotenKlass]`.
    - useMemo: graph = useMemo(() => buildGraph(obj.oid, allObjects), [obj.oid, allObjects])
    - Handlers (useCallback):
      - onNodeDragStop(id, position): const oid = parseInt(id.replace("oid:", "")); useModelStore.getState().patchObject(oid, {m_iPosX: position.x, m_iPosY: position.y})
      - onConnect({source, target}): const von = parseInt(source.replace("oid:", "")); const nach = parseInt(target.replace("oid:", "")); const newOid = useModelStore.getState().createObject("PDlplKante", {m_oid_von: von, m_oid_nach: nach}); — TODO: addKanteToPlan über sub_refs[1].push — Implementation in model-store als neue Action `appendSubRef(planOid, slot, newOid)`. Hier als TODO markieren wenn Plan 07 das nicht hat.
      - onSelectionChange(ids): setSelectedIds(ids)
      - onDeleteSelected: selectedIds.forEach(id => useModelStore.getState().deleteObject(parseInt(id.replace("oid:", ""))))
      - onAddNode: setIsAddDialogOpen(true)
    - Render:
      ```jsx
      <ChildDialog title={`Durchlaufplan-Design: ${obj.attrs.m_sName ?? `oid ${obj.oid}`}`}>
        <div className="flex h-full flex-col">
          <div className="flex gap-2 border-b p-2">
            <Button size="sm" onClick={onAddNode}>+ Knoten</Button>
            <Button size="sm" variant="destructive" onClick={onDeleteSelected} disabled={!selectedIds.length}>× Auswahl löschen ({selectedIds.length})</Button>
          </div>
          <div className="flex-1">
            <ReactFlowAdapter nodes={graph.nodes} edges={graph.edges} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onSelectionChange={onSelectionChange} disabled={disabled} />
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>...Klasse-Picker + Add-Button...</Dialog>
        </div>
      </ChildDialog>
      ```

    Hinweis im Code: "addKnotenToPlan/addKanteToPlan-Actions im model-store-store müssen ergänzt werden (siehe Plan 11 oder als sofortiges Hotfix in model-store.ts)."

    Test `portal/src/viewers/__tests__/PDurchlaufplanViewerDesign.spec.tsx`:
    - Mock @xyflow/react ist optional; oder render mit jsdom-Polyfill für ResizeObserver. Test prüft Toolbar + Add-Dialog.
    - Test 1 "rendert Toolbar mit 2 Buttons": render → assert "Knoten" und "Auswahl löschen" Button-Text vorhanden.
    - Test 2 "Add-Button öffnet Dialog": click → assert Dialog visible.
    - Wenn React-Flow-Render Probleme macht (ResizeObserver fehlt in jsdom): nutze vi.mock("@xyflow/react") + minimal Mock-ReactFlow als Pass-Through.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- PDurchlaufplanViewerDesign 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    PDurchlaufplanViewerDesign.tsx existiert. Toolbar mit 3 Buttons. ReactFlowAdapter eingebaut. Connection + Drag + Delete dispatchen Store-Actions. 2 Tests grün.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: setup.ts aktualisieren — Design-Viewer registrieren + appendSubRef-Action ergänzen</name>
  <files>portal/src/viewers/setup.ts, portal/src/stores/model-store.ts</files>
  <read_first>
    - portal/src/viewers/setup.ts (Plan 08 + 09 — aktueller Stand mit 11 Viewern)
    - portal/src/stores/model-store.ts (Plan 07 — patchObject/createObject/deleteObject vorhanden, appendSubRef fehlt)
    - portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx (Task 4)
  </read_first>
  <behavior>
    - setup.ts registriert PDurchlaufplanViewerDesign mit hint='design'. PDurchlaufplanViewerStd bleibt als Default (hint='std').
    - model-store erhält neue Action `appendSubRef(parentOid: number, slot: number, childOid: number): void` und `removeSubRef(parentOid, slot, childOid)`.
    - Tests in stores/__tests__/model-store.spec.ts werden um 2 Tests für appendSubRef + removeSubRef erweitert.
  </behavior>
  <action>
    Erweitere `portal/src/viewers/setup.ts`:
    - `import { PDurchlaufplanViewerDesign } from "@/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign"`
    - `viewerRegistry.register({klass:"PDurchlaufplan", hint:"design", Component: PDurchlaufplanViewerDesign})`

    Erweitere `portal/src/stores/model-store.ts`:
    - Action-Interface erweitern: `appendSubRef(parentOid: number, slot: number, childOid: number): void`, `removeSubRef(parentOid: number, slot: number, childOid: number): void`
    - Implementations:
      - appendSubRef: set((s) => { if (!s.wire) return; const parent = s.wire.objects[parentOid]; if (!parent) return; while (parent.sub_refs.length <= slot) parent.sub_refs.push([]); parent.sub_refs[slot].push(childOid); s.dirty = true; })
      - removeSubRef: set((s) => { if (!s.wire) return; const parent = s.wire.objects[parentOid]; if (!parent || !parent.sub_refs[slot]) return; parent.sub_refs[slot] = parent.sub_refs[slot].filter(oid => oid !== childOid); s.dirty = true; })

    Erweitere `portal/src/stores/__tests__/model-store.spec.ts` um 2 Tests:
    - test_append_sub_ref_extends_parent: load wire, appendSubRef(planOid, 0, newOid), assert wire.objects[planOid].sub_refs[0] enthält newOid.
    - test_remove_sub_ref_removes_from_list: appendSubRef, dann removeSubRef, assert sub_refs[slot] enthält newOid nicht mehr.

    Update PDurchlaufplanViewerDesign.tsx (aus Task 4):
    - Nach createObject in onConnect: `useModelStore.getState().appendSubRef(obj.oid, 1, newKantenOid)` (slot 1 = Kanten).
    - Nach createObject in onAddNode: `useModelStore.getState().appendSubRef(obj.oid, 0, newKnotenOid)` (slot 0 = Knoten).
    - TODO-Kommentar entfernen.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5 &amp;&amp; cd portal &amp;&amp; npm run test:run 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    setup.ts registriert 12/12 Viewer. model-store hat appendSubRef + removeSubRef + 2 zusätzliche Tests. Gesamte Vitest-Suite grün.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| React-Flow ↔ User-Input | Drag-Events sind User-controlled; positions sind sanitized via parseFloat (sonst NaN-fallback) |
| Connection-Drag ↔ createObject | Source/Target müssen valide oid-IDs sein; parseOidFromId macht Validation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-01 | DoS | Plan mit 500 Knoten lädt langsam | mitigate | onlyRenderVisibleElements + React.memo + nodeTypes-outside + Linear-Layout-Fallback statt teurer Dagre |
| T-10-02 | Tampering | User drag-drag-drag erzeugt 1000 patches/sec | accept | React-Flow batched onNodeDragStop (nicht onNodeDrag) — ein patch pro drag-stop, nicht pro Frame |
| T-10-03 | Information Disclosure | MiniMap zeigt gesamtes Modell | accept | Modell ist user-eigenes (per Tenant); kein Cross-Tenant-Leak |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run` zeigt alle Tests grün (Plan 06+07+08+09+10)
- Manueller Smoke (Backend + Fertigungsstruktur1.otx hochgeladen):
  - /models/{id} → Sidebar-Click auf einen Durchlaufplan → PDurchlaufplanViewerStd (default-hint).
  - In Toolbar oder Workspace: viewerHint='design'-Switch (Phase 1 manuell, Plan 11) → PDurchlaufplanViewerDesign öffnet.
  - Canvas zeigt Knoten + Kanten. Drag Knoten → Position ändert sich. Drag von Knoten-Handle zu anderen Knoten → neue Kante.
- Performance-Check (in chrome devtools): 50-Knoten-Plan hat >30 FPS bei pan/zoom.
</verification>

<success_criteria>
SC-4 (12 konkrete Viewer): VOLLSTÄNDIG erfüllt (12/12).
SC-6 (Edit-Operationen): VOLLSTÄNDIG für graphischen Viewer (Add, Delete, Position-Drag, Connection-Draw).
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-10-SUMMARY.md` with:
- GraphObject-Subset-Liste (was portiert, was Phase-4-Backlog)
- React-Flow-Performance-Pattern-Checkliste (alle 5 Pitfall-Mitigations bestätigt)
- Edit-Operations-Catalog (was geht, was nicht)
- Bekannte Defizite:
  - viewerHint-Switch im Sidebar fehlt (Plan 11 oder direkt im Workspace via Tab-Switcher)
  - Position-Persistierung über Save-back funktioniert nur wenn OtxWriter m_iPosX/m_iPosY mit-schreibt (verifizieren in Plan 04 SUMMARY oder als Engine-Backlog dokumentieren)
  - Dagre-Layout statt linear: Backlog für Phase 4
- Was Plan 11+12 noch hinzufügen: Auto-Save-Wiring, IndexedDB, Lock-Heartbeat, E2E-Tests
</output>
</content>
</invoke>