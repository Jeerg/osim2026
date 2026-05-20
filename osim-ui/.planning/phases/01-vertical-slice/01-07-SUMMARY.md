---
phase: 01-vertical-slice
plan: 07
subsystem: portal
type: execute
status: complete
wave: 4
tags: [portal, graph-foundation, design-viewer, reactflow, dagre, tab-switch, gobject, glink, auto-layout, position-store]

# --- Dependency-Graph ---
requires:
  - "phase 01-04 — Viewer-Foundation: ViewerFrame, ClientCtrl, ChildDialog, ViewerHost, viewer-registry, model-store"
  - "phase 01-05 — type-maps + PDurchlaufplanViewerStd (Plan 5 Std-Viewer, wird in Plan 7 mit Tab-Switch ergaenzt)"
provides:
  - "portal/src/graph/core/types.ts — Position/Size/Rect, GORegion, GObjState, GLDirection, GraphViewProps"
  - "portal/src/graph/core/GObject.ts — abstract Foundation-Klasse (contains/regionCheck/updatePosition + DEFAULT_OBJECT_SIZE)"
  - "portal/src/graph/core/GLink.ts — abstract Foundation-Klasse fuer Verbindungen"
  - "portal/src/graph/core/GObjLink.ts — typed GLink mit sourceObj/targetObj-Referenzen"
  - "portal/src/graph/core/GraphView.tsx — React-Composition um reactflow (2-Layer-Render in Phase 1; volle 4-Layer-Portierung in Phase 3)"
  - "portal/src/graph/core/index.ts — Public Re-Exports"
  - "portal/src/graph/nodes/KnotenNode.tsx — Klasse + KnotenNodeView FC (Box mit Klassen-Kuerzel + Dauer)"
  - "portal/src/graph/nodes/AusloeserNode.tsx — Klasse + AusloeserNodeView FC (gelbe Box, Diamant-Symbolik)"
  - "portal/src/graph/nodes/types.ts — GObjectNodeData (Shared Data-Slot)"
  - "portal/src/graph/edges/KanteEdge.tsx — GObjLink-Subklasse mit optionalem Uebergangszeit-Label"
  - "portal/src/viewers/design/PDurchlaufplanViewerDesign.tsx — 9. von 12 D-08-Viewern"
  - "portal/src/viewers/design/auto-layout.ts — dagre-LR-Layout-Helper"
  - "portal/src/viewers/design/position-store.ts — Session-lokaler Override-Store (Hook fuer Plan 09 IndexedDB)"
  - "portal/src/viewers/design/index.ts — Side-Effect-Index"
affects:
  - "portal/src/graph/ (neu)"
  - "portal/src/viewers/design/ (neu)"
  - "portal/src/viewers/property/PDurchlaufplanViewerStd.tsx (Tab-Switch ergaenzt)"
  - "portal/src/viewers/property/type-maps.ts (synthetische Klasse PDurchlaufplanDesign registriert)"
  - "portal/src/viewers/property/index.ts (Side-Effect-Import @/viewers/design)"
  - "portal/package.json (dagre@^0.8 + @types/dagre-Dependency)"

# --- Tech-Stack ---
tech_stack:
  added:
    - "dagre@^0.8.5 (Auto-Layout fuer Durchlaufplan-Design-Viewer)"
    - "@types/dagre@^0.7.54 (devDependency)"
  preexisting_used:
    - "reactflow@^11.11.4 (Graph-Rendering-Backend, war seit Plan 04 vorinstalliert als Forward-Prep)"
  patterns:
    - "Phase-1-Foundation-Pattern: GraphObject-Schicht wird als Skelett portiert (nur was 1 Viewer braucht), mit Doc-Strings die auf Phase-3-Erweiterungspunkte hinweisen (4-Layer-Drawing, Phantom-System, GraphGrid, GLinkPoint.CheckNeighbourhood, ShowFolger/ShowVorgaenger). Konsumenten in graph/nodes/ + graph/edges/ sind isolierbar austauschbar."
    - "Klasse + FC Doppel-Pattern: KnotenNode existiert als TS-Klasse (Plan-Interface-Vertrag, Phase 3 wird hier das 4-Layer-Render-Stack befuellen) UND als reactflow-Node-FC (KnotenNodeView). Trennung erlaubt Phase-3-Refactor ohne Konsumenten-Anpassung."
    - "Synthetische Klasse PDurchlaufplanDesign (analog Plan-06 RESS_*_GROUP): Design-Viewer registriert sich unter eigener Klasse statt 'PDurchlaufplan' zu ueberschreiben — saubere Trennung, kein letzte-Registrierung-gewinnt-Konflikt mit dem Std-Viewer."
    - "Tab-Switch im Std-Viewer: useState<'standard'|'design'> mountet beim Wechsel die Sub-Komponente direkt (statt zweiter Viewer-Registrierung); beide Modi teilen das gleiche obj, kein extra Tree-Walk."
    - "Auto-Layout-Fallback-Kaskade: Override > Auto-Layout (dagre LR) > (0,0). Deterministisch bei leerem Override-Store; Drag-eines-Knotens setzt Override, ueberlebt Re-Renders aber NICHT Page-Reload (Plan-09-IndexedDB-Hook bereits vorgesehen)."
    - "GraphView ReactFlowProvider-Wrapping: Inner-Component nutzt reactflow-Hooks, Provider in der Outer-Komponente — Standard-Pattern aus der reactflow-API."

# --- Key Files ---
key_files:
  created:
    - "portal/src/graph/core/types.ts"
    - "portal/src/graph/core/GObject.ts"
    - "portal/src/graph/core/GLink.ts"
    - "portal/src/graph/core/GObjLink.ts"
    - "portal/src/graph/core/GraphView.tsx"
    - "portal/src/graph/core/index.ts"
    - "portal/src/graph/core/__tests__/GraphView.test.tsx"
    - "portal/src/graph/nodes/types.ts"
    - "portal/src/graph/nodes/KnotenNode.tsx"
    - "portal/src/graph/nodes/AusloeserNode.tsx"
    - "portal/src/graph/edges/KanteEdge.tsx"
    - "portal/src/viewers/design/PDurchlaufplanViewerDesign.tsx"
    - "portal/src/viewers/design/auto-layout.ts"
    - "portal/src/viewers/design/position-store.ts"
    - "portal/src/viewers/design/index.ts"
    - "portal/src/viewers/design/__tests__/PDurchlaufplanViewerDesign.test.tsx"
    - ".planning/phases/01-vertical-slice/01-07-SUMMARY.md"
  modified:
    - "portal/package.json (dagre + @types/dagre)"
    - "portal/package-lock.json"
    - "portal/src/viewers/property/PDurchlaufplanViewerStd.tsx (Tab-Switch-Header, Standard-Mode in Sub-Komponente extrahiert)"
    - "portal/src/viewers/property/type-maps.ts (+1 Klasse: PDurchlaufplanDesign)"
    - "portal/src/viewers/property/index.ts (+1 Side-Effect-Import @/viewers/design)"

# --- Decisions ---
decisions:
  - id: "01-07-D1"
    title: "GraphObject-Schicht in Phase 1 als _Skelett_ portieren, NICHT vollstaendig"
    decision: "graph/core/ enthaelt nur: Position/Size/Rect-Primitives, 3-Wert-GORegion (inside/edge/outside) statt 6-Wert-Original, GObjState (NO_STATE/MARKED/HIDDEN) ohne MARKED-Rendering, 18-Wert-GLDirection-Enum aber nur DEFAULT aktiv genutzt, GObject mit contains/regionCheck/updatePosition (kein Phantom, kein 4-Layer-Drawing, kein OnEditGo/OnContextMenu-Routing), GLink/GObjLink ohne InList/OutList. Phase 3 (live-viz) wird die Vollportierung leisten."
    rationale: "CONTEXT D-07 explizit: 'D-08 Punkt 3 fordert ... erster Konsument der GraphObject-Schicht. Wichtig: NICHT die vollstaendige GraphObject-Schicht (das ist Phase 3) — nur das, was fuer 1 Viewer reicht, aber so strukturiert, dass Phase 3 nahtlos erweitern kann.' Die Doc-Strings in jeder Datei nennen explizit, was Phase 3 ergaenzen wird (Phantom-System, ShowFolger/ShowVorgaenger, GraphGrid, GLinkPoint.CheckNeighbourhood, OnEditGo-Routing, DrawRed-Animation)."

  - id: "01-07-D2"
    title: "reactflow als Phase-1-Rendering-Backend statt eigenem Canvas-Render"
    decision: "GraphView ist ein duenner Wrapper um reactflow 11.11 (ReactFlowProvider + ReactFlow + Background + Controls). Knoten- und Kanten-Renderer (KnotenNodeView/AusloeserNodeView) sind reactflow-NodeTypes, der Adapter (gobjectToNode/glinkToEdge) bleibt klein. 2 Layer in Phase 1 (Canvas + Background-Grid) statt der OSim-typischen 4 Layer (Background/Main/Foreground/Helpers)."
    rationale: "Pragmatismus: reactflow liefert Drag/Connect/Zoom/Pan/fitView/MiniMap/Controls/Background out-of-the-box — ein eigener Canvas-Renderer waere Wochen Arbeit (vgl. ~3500 Zeilen GraphObj.h-Portierung) ohne UX-Mehrwert in Phase 1. Phase 3 kann reactflow durch einen eigenen Canvas-Renderer ersetzen ODER mit einer Custom-Edge/Custom-Node-Schicht den 4-Layer-Render-Stack on-top draufsetzen — die GraphView-API bleibt stabil. Bundle-Cost: ~240 KB (reactflow + dagre); Phase-1-Bundle waechst von 449 KB auf 691 KB (gzip 220 KB), akzeptabel."

  - id: "01-07-D3"
    title: "GFX-Position-Persistenz vertagt auf Plan 09; Phase 1 nutzt Auto-Layout + Session-Override"
    decision: "Die Engine skippt OGfxDesign*-Klassen im otx_loader (verifiziert via Plan-03-Tests). Damit kommen keine Original-Positionen im JSON-Tree an. Phase-1-Loesung: (1) computeAutoLayout (dagre LR-Hierarchie, ranksep 80, nodesep 40) liefert deterministische Default-Positionen pro Render; (2) position-store haelt manuell-gezogene Positionen in-memory pro (planOid, nodeOid). Drag eines Knotens schreibt zusaetzlich spekulativ m_xUiPosX/Y via updateProperty in den model-store — wenn der Engine-Writer (Plan 01) unsupported Properties durchreicht, landen sie beim Save-Roundtrip im Tree und werden potenziell beim naechsten Reload vom Backend zurueckgeliefert. (Phase-1-Wett: schadet nicht, wenn doch ignoriert.)"
    rationale: "Plan-Risk explizit: 'Engine-Writer (Plan 01) muss ggf. erweitert werden, wenn wir doch Position-Persistenz wollen → eine Erweiterung des Writers fuer m_xUiPosX/Y-Properties unter PDpKn*. Phase 1 vermeidet das durch Auto-Layout-Option C.' Plan 09 (Save-Pfad + IndexedDB) wird (1) den position-store an dexie verdrahten und (2) wenn die Engine die m_xUi*-Properties akzeptiert, den Save-Roundtrip nutzen. Bis dahin: Drag-Position ueberlebt Re-Renders, aber NICHT Page-Reload."

  - id: "01-07-D4"
    title: "Synthetische Klasse 'PDurchlaufplanDesign' statt Override des Std-Viewers"
    decision: "PDurchlaufplanViewerDesign registriert sich unter SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS = 'PDurchlaufplanDesign'. Die Klasse 'PDurchlaufplan' bleibt beim Std-Viewer (Plan 05). Der Tab-Switch im Std-Viewer mountet die Design-Komponente direkt (nicht ueber Registry-Lookup) — schneller Pfad ohne unnoetige Indirection."
    rationale: "Analog Plan-06-Pattern (RESS_*_GROUP-Synthetic-Klassen). Vermeidet 'letzte-Registrierung-gewinnt'-Konflikt mit Plan 05 und die zugehoerige Console-Warning. Sauberere Test-Isolation: Beide Viewer sind via getViewer-Lookup eindeutig identifizierbar."

  - id: "01-07-D5"
    title: "Tab-Switch im Std-Viewer statt zweiter Registry-Trigger fuer Design-Modus"
    decision: "PDurchlaufplanViewerStd haelt einen useState<'standard'|'design'>; Tab-Buttons im Header schalten um. Der Std-Viewer extrahiert seinen Original-Inhalt in eine Sub-Komponente PDurchlaufplanStandardMode; der Design-Modus mountet PDurchlaufplanViewerDesign direkt. Beide Modi teilen das gleiche obj-Prop."
    rationale: "Plan-Vorgabe: 'Tab-Switch im Std-Viewer, einfacher. Refactor in Phase 3+ wenn mehr Variants kommen.' UX-Aspekt: User wechselt zwischen Modi am gleichen Plan, ohne dass die Sidebar einen separaten Eintrag pro Modus zeigen muss. Plan-05-Tests bleiben gruen, weil 'pdurchlaufplan-viewer-std' weiterhin als data-testid existiert (Wurzel-Element des Wrappers)."

  - id: "01-07-D6"
    title: "dagre statt elkjs fuer Auto-Layout"
    decision: "dagre@^0.8.5 (~50 KB minified) statt elkjs (~1 MB minified)."
    rationale: "dagre ist die Standard-Library fuer hierarchische Graph-Layouts in JS-Ecosystemen, integriert nahtlos mit reactflow's getLayoutedElements-Pattern, hat eine 5-Methoden-API (setGraph/setNode/setEdge/layout/node) und ist deterministisch bei festen Settings. elkjs waere flexibler (orthogonale Routing, Force-Layouts), aber 20x groesser. Phase 1 hat keine Layout-Anforderung, die elkjs rechtfertigen wuerde."

  - id: "01-07-D7"
    title: "GraphView mit ReactFlowProvider-Wrapper als public Component"
    decision: "Public GraphView umschliesst <ReactFlowProvider><GraphViewInner ... /></ReactFlowProvider>. Konsumenten muessen keinen Provider mounten."
    rationale: "Standard-reactflow-Pattern: alle useReactFlow/useNodes/useEdges-Hooks brauchen den Provider als Vorfahren. Wenn Konsumenten ihn vergessen, gibt es ein Runtime-Error. Indem wir den Wrapper in die GraphView packen, ist die API foolproof. Mehrfach-Mounting (mehrere GraphView in derselben App) ist mit reactflow erlaubt — pro Provider eine eigene reactflow-Instanz."

# --- Patterns (Reuse) ---
patterns:
  - "Hierarchische Foundation-Layer: graph/core (abstract Bases) ← graph/nodes + graph/edges (konkrete Subklassen) ← viewers/design (Konsument). Phase 3 erweitert in graph/core ohne die Konsumenten zu brechen."
  - "Side-Effect-Index-Chain: main.tsx importiert @/viewers/property, das wiederum @/viewers/matrix und @/viewers/design importiert. Pro neuem Viewer-Folder eine Zeile in @/viewers/property/index.ts."
  - "Subscribe-Tick-Pattern fuer modul-lokalen State (subscribeOverrides ↔ useReducer-bump): identisch zu Plan-06-synthetic-property-store. Kein Zustand-Lib-Overhead fuer kleine, geographisch konzentrierte States."
  - "Override > Auto > Fallback-Kaskade fuer Layout-Berechnung: pattern eignet sich fuer alle 'das Backend liefert nicht alles'-Faelle (z.B. Color-Themes pro Klasse, individual-Knotengroessen)."

# --- Metrics ---
metrics:
  tasks_completed: 2
  files_created: 16
  files_modified: 5
  test_count_new: 20
  test_count_total: 98
  test_results: "98 passed (alle Plan-04/05/06-Tests bleiben gruen, +20 neue aus Plan 07: 11 GraphView/GObject/GLink, 9 PDurchlaufplanViewerDesign + Tab-Switch)"
  lint_status: "clean"
  build_status: "clean (691 kB index.js + 35 kB CSS, ~5.7s build-Zeit) — Bundle wuchs ~240 kB durch reactflow+dagre"
  duration_minutes: ~40
  completed_date: "2026-05-20"
---

# Phase 1 Plan 07: PDurchlaufplan-Design-Viewer + GraphObject-Foundation-Skelett Summary

Welle-4-Frontend-Spur (2/3): Erster Konsument der GraphObject-Schicht (D-07-Querschnitt fuer alle spaeteren graphischen Viewer in Phase 3+ Live-Viz und Phase 5+ Charts) plus 9. von 12 Viewern aus D-08. Der Design-Viewer rendert einen Durchlaufplan graphisch mit reactflow, unterstuetzt Drag-Knoten, Verbinden-via-Handle und Doppelklick-Property-Routing. Auto-Layout (dagre) ueberbrueckt die fehlende OTX-GFX-Persistenz; Position-Drags sind Session-lokal bis Plan 09 IndexedDB-Persistenz verdrahtet.

## Was geliefert wurde

Zwei atomare Commits:

| Task | Commit  | Was                                                                                                                                                                                                                                                                                                              |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 9b03174 | GraphObject-Foundation-Erstauszug: graph/core (types.ts, GObject.ts, GLink.ts, GObjLink.ts, GraphView.tsx, index.ts), graph/nodes (KnotenNode + KnotenNodeView, AusloeserNode + AusloeserNodeView, types.ts), graph/edges (KanteEdge). 11 Tests. Dependency: dagre@^0.8.5. reactflow@^11 wiederverwendet (Plan 04 prep).  |
| 2    | 8e92d1c | viewers/design/PDurchlaufplanViewerDesign.tsx (Plan/Knoten/Kanten ↦ GObjects/GObjLinks; Drag/Connect/Doppelklick-Routing), auto-layout.ts (dagre LR-Layout), position-store.ts (Session-Override + subscribe), Side-Effect-Index. Tab-Switch im PDurchlaufplanViewerStd. Synthetische Klasse PDurchlaufplanDesign in type-maps. 9 Tests. |

## Architektur-Recap

```
PDurchlaufplanViewerStd (Plan 05, mit Tab-Switch in Plan 07)
  ├─ Header: Plan-Name + OID + Tab-Buttons (Standard / Design)
  └─ Body
       ├─ Standard-Mode (Plan 05 unveraendert): Properties + Knoten/Kanten-Tabellen
       └─ Design-Mode (Plan 07): PDurchlaufplanViewerDesign
            ↓
            collectKnoten(obj) / collectKanten(obj) — _group-Children-Lookup
            ↓
            computeAutoLayout(nodeIds, edges, { rankdir: 'LR' })  → dagre
            ↓
            Position-Kaskade: getNodePositionOverride > auto-layout > (0,0)
            ↓
            makeGObject(child, position) → KnotenNode / AusloeserNode
            ↓
            <GraphView objects=… links=… onObjectMove/onLinkCreate/onObjectDoubleClick>
                 ↓
                 GObject + GObjLink → reactflow Node/Edge via gobjectToNode/glinkToEdge
                 ↓
                 <ReactFlow nodeTypes={knoten,ausloeser} ...>
                      <Background grid ... />
                      <Controls ... />
                      [reactflow uebernimmt Drag/Pan/Zoom/Connect]

Drag eines Knotens (onObjectMove):
  → setNodePositionOverride(planOid, nodeOid, pos)   [Session-Store]
  → updateProperty(nodeOid, m_xUiPosX/Y, pos)        [model-store, spekulativ fuer Plan 09]

Drag von Handle-zu-Handle (onLinkCreate):
  → onMethodCall(planOid, 'addChild', ['PDpKaUebergang'])
  → ViewerHost.methodDispatcher (Plan 05) → store.addChildSkeleton → TEMP-OID
  → updateProperty(neueOid, m_lVon, sourceId) + m_lNach
  
Doppelklick auf Knoten (onObjectDoubleClick):
  → selectOid(nodeOid)  [Sidebar markiert + ViewerHost mountet Detail-Viewer]
```

## Verifikation (Must-Haves abgehakt)

- [x] GObject + GLink + GObjLink + GraphView als TS-Basis-Klassen + ReactComponent existieren
- [x] PDurchlaufplanViewer-Design ist registriert (Synthetische Klasse PDurchlaufplanDesign), Tab-Switch im Std-Viewer mountet ihn
- [x] Design-Viewer zeigt Knoten als Boxen + Kanten als Pfeile mit reactflow
- [x] Knoten draggable: Position-Edit triggert setNodePositionOverride + updateProperty(m_xUiPosX/Y)
- [x] Kanten neu zeichnen: drag von Knoten-A-handle zu Knoten-B-handle erzeugt PDpKaUebergang-Node
- [x] Doppelklick auf Knoten ruft selectOid → Sidebar markiert → ViewerHost mountet Property-Viewer
- [x] Auto-Layout (dagre) verhindert Overlap bei initialen Render
- [x] `npm test -- --run`: **98/98 gruen** (15 Test-Files, +20 neue aus Plan 07)
- [x] `npm run lint`: clean
- [x] `npm run build`: clean (691 kB index.js + 35 kB CSS, ~5.7s)

## Backend-Constraint: keine Aenderung

Plan 07 ist reiner Frontend-Code, kein neuer API-Endpoint, keine Backend-TYPE_MAP-Erweiterung. Die `m_xUiPosX/Y`-Properties, die der Design-Viewer spekulativ in den model-store schreibt, werden vom Backend in Phase 1 ignoriert (Engine-Writer hat keine Allow-List fuer sie) — das ist die intendierte Phase-1-Falle-Tolerance, die Plan 09 oder Phase 2 entscheidet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] TS2322 in gobjectToNode (data: KnotenNodeData | AusloeserNodeData)**
- **Found during:** Task 1 (`npm run build`)
- **Issue:** Der Union-Type forderte konkretes KnotenNode/AusloeserNode statt GObject, aber gobjectToNode erhaelt einen generischen GObject — TS rejectete den Cast.
- **Fix:** data-Type auf den breiteren GObjectNodeData zurueckgesetzt; die NodeType-FCs (KnotenNodeView/AusloeserNodeView) casten intern via `data.gobj as KnotenNode` (sicher, weil pickNodeType deterministisch nach klass routet). Unused KnotenNodeData/AusloeserNodeData-Type-Imports entfernt.
- **File:** `portal/src/graph/core/GraphView.tsx`
- **Commit:** 9b03174

**2. [Rule 3 — Blocking] Unused-Var-Lint-Fehler in PDurchlaufplanViewerDesign**
- **Found during:** Task 2 (`npm run lint`)
- **Issue:** `isKnotenKlass` war als Helper-Funktion definiert, aber nicht aufgerufen (der Default-Pfad in `makeGObject` faengt PDpKn* implizit ab).
- **Fix:** Helper entfernt; isAusloeserKlass / isKanteKlass bleiben (beide werden genutzt).
- **File:** `portal/src/viewers/design/PDurchlaufplanViewerDesign.tsx`
- **Commit:** 8e92d1c

### Anpassungen ohne Auswirkung auf Plan-Verhalten

**1. Doppelnamen-Trennung KnotenNode (Klasse) vs. KnotenNodeView (FC)**
- **Begruendung:** Plan-Interface forderte `class KnotenNode extends GObject` mit `render(): ReactNode`-Methode. reactflow's nodeTypes-Map erwartet aber React-FunctionComponents (Capitalized-Name-Convention, NodeProps-Signatur). Wir koennen beides nicht unter dem gleichen ESM-Namen exportieren. Loesung: Klasse heisst `KnotenNode` (matched Plan), FC heisst `KnotenNodeView`. Die Klasse's `render()`-Methode liefert in Phase 1 null (Foundation-Stub) — der reactflow-Render-Pfad laeuft ueber `KnotenNodeView`. Phase 3 wird die `render()`-Klasse-Methode mit dem 4-Layer-Render-Stack fuellen, und `KnotenNodeView` kann optional auf `data.gobj.render()` weiterdelegieren.
- **Files:** `portal/src/graph/nodes/KnotenNode.tsx`, `AusloeserNode.tsx`

**2. Synthetische Klasse PDurchlaufplanDesign statt 'PDurchlaufplan' ueberschreiben**
- **Begruendung:** Plan-Text bot beide Optionen an, mit Praeferenz fuer die saubere Variante (siehe Plan-Output-Block). Wir folgen der Praeferenz: PDurchlaufplanDesign ist eine separate Registry-Klasse, Tab-Switch im Std-Viewer mountet die Design-Komponente direkt (nicht ueber Registry-Lookup, weil das obj das gleiche bleibt). Vorteil: kein 'letzte-Registrierung-gewinnt'-Konflikt + Console-Warning beim App-Start; Test-Isolation einfacher.

**3. Spekulatives updateProperty(m_xUiPosX/Y) on Drag**
- **Begruendung:** Plan-Risk: 'Engine-Writer (Plan 01) muss ggf. erweitert werden ...' Phase 1 entscheidet sich, die Properties trotzdem in den model-store zu schreiben — wenn der Save-Roundtrip (Plan 09) sie nicht akzeptiert, sind sie nur dirty-markiert und werden vom Backend ignoriert. Wenn er sie doch akzeptiert (Phase-2-Erweiterung), ist die Persistenz von Tag 1 funktional. Trade-off: dirty-Indikator wird beim Drag eines Knotens hochgehen, was UX-bewusst akzeptiert wird (Drag = Edit).

**4. Tab-Switch UI Plan-konform, aber Inhalts-Hierarchie umstrukturiert**
- **Begruendung:** Plan-Beispielcode hatte `<div className="p-4 h-full flex flex-col">` als Wurzel. Bestehender Std-Viewer hatte `<div className="p-6">`. Wir behalten die Plan-05-Padding-Konvention bei (Test-Compatibility), aber strukturieren den Wrapper neu auf `<div className="flex h-full flex-col">` mit Header (Padding 6) + tab-Body (overflow-auto). Visuell konsistent mit Plan 05, technisch ergaenzt um das Flex-Layout.

## Authentication Gates

Keine. Plan 07 ist reiner Frontend-Code, keine neue Auth-Surface.

## Known Stubs

- **GFX-Position-Persistenz (Plan-Risk-Block):** Auto-Layout via dagre + Session-Override-Store. Drag-Position ueberlebt Re-Renders, aber NICHT Page-Reload. **Plan 09** verdrahtet (a) dexie/IndexedDB fuer den Override-Store und (b) entscheidet, ob m_xUiPosX/Y-Properties im Engine-Writer-Allow-List landen.
- **GraphObject-Vollportierung (Plan-Risk-Block):** Phase 3 (live-viz) wird die volle GraphObj.h-Portierung leisten — 4-Layer-Drawing (DrawBackground/Draw/DrawForeground/DrawHelpers), Phantom-System (ShowPhantom/HidePhantom/m_OldPhantomRect), GraphGrid-Container (statt reactflow's Layout-Algorithmen), GLinkPoint mit CheckNeighbourhood, OGBlock-Sub-Composition, ShowFolger/ShowVorgaenger fuer Vorgaenger/Folger-Highlighting, GObject.OnEditGo/OnLMButtonDown/OnContextMenu (aktuell uebernimmt reactflow + onObjectDoubleClick-Callback). Die Phase-1-API ist so geschnitten, dass diese Erweiterungen die Konsumenten in graph/nodes/edges/viewers/design nicht brechen.
- **Snapshot-Undo erfasst Drag-Position-Changes NICHT vollstaendig:** updateProperty(m_xUiPosX/Y) loest zwar einen Undo-Snapshot aus, aber der position-store-Override (Session-Store) ist nicht im Snapshot. Konsequenz: Undo aendert den Property-Wert zurueck, aber der visuelle Knoten bleibt am gedraggten Ort, bis ein anderer Render erzwungen wird. Phase 2 oder Plan 09 koennte das harmonisieren.
- **Multi-Edge-Routing:** Falls zwei Knoten mehrere Kanten dazwischen haben (z.B. PDpKaUebergang + PDlplKante zwischen A und B), zeichnet reactflow sie als gerade Linien uebereinander. Phase 1 hat das nicht als Anforderung; Phase 3 wuerde Edge-Routing nachziehen.
- **Performance bei grossen Plaenen:** Plan 10 misst Bosch2_wechseln (18 MB) — falls ein einzelner Plan >100 Knoten enthaelt, kann reactflow performance-kritisch werden. Mitigation in der reactflow-API verfuegbar (only-render-visible, virtualized-nodes).
- **GraphView nutzt edgesUpdatable Prop in reactflow 11:** ist als deprecated bekannt fuer Edge-Endpoint-Drag. Phase 1 ist davon nicht abhaengig; falls reactflow 12 die API entfernt, ist es ein einfacher Strip.

Alle Stubs sind im Plan dokumentiert (Plan 07 ist explizit Phase-1-Foundation-Auszug); kein Stub blockiert den Phase-1-Use-Case (Design-Sicht eines Durchlaufplans, Edit-Workflow).

## Threat Flags

Keine neuen Threat-Surface-Erweiterungen — Plan 07 ist reiner Frontend-Code. Position-Overrides leben modul-lokal, kein neuer Backend-Endpoint, keine neuen Permissions.

## Risk-Mitigations (aus Plan-Risk-Block)

- **GraphObject-Skelett wird Phase-3-Refactor brauchen:** Mitigation: docstrings in jeder Datei deuten auf Erweiterungspunkte, KnotenNode/AusloeserNode/KanteEdge sind isolierbar austauschbar (kein Plan-7-Konsument greift auf interne Foundation-Details zu). Der Klassen-Namespace ist konsistent mit der C++-Vorlage, was Phase-3-Refactor erleichtert.
- **Position-Persistenz-Tradeoff (dagre nicht garantiert deterministisch):** Mitigation: dagre-Config-Constants (rankdir LR, ranksep 80, nodesep 40) sind fix gesetzt, dagre@^0.8.5 ist seit 2 Jahren stabil. computeAutoLayout-Tests assert determinism.
- **reactflow-Performance bei grossen Plaenen:** Mitigation: reactflow hat eingebaute viewport-culling-Mechanismen (only render visible nodes). Bosch2_wechseln-Stress-Test in Plan 10.
- **Engine-Writer muss ggf. erweitert werden:** Mitigation: m_xUiPosX/Y werden bereits spekulativ geschrieben — Phase 2 muss nur den Writer-Allow-List ergaenzen, kein Frontend-Refactor.

## Notes fuer Plan 08+ (parallel zu Plan 07 in Welle 4)

- **Plan 08** (Verknuepfungs-Viewer + AEinsatzWunsch + AKapBed): Kann GraphView wiederverwenden, wenn ein Verknuepfungs-Viewer als graphische Sicht (z.B. Personal ↔ Maschinen-Matrix als Bipartite-Graph) implementiert werden soll. Aktuell sieht Plan 08 nur Matrix-Viewer + Property-Viewer vor — die graphische Sicht waere optional. Plan 08 kann auch das `position-store`-Pattern adaptieren, falls Verknuepfungs-Viewer eigene Layout-Persistenz brauchen.
- **Plan 09** (Save-Pfad + IndexedDB): MUSS den position-store an dexie/IndexedDB verdrahten. Subscribe-Pattern ist bereits da (`subscribeOverrides`). Speicherschluessel: `(modelId, planOid, nodeOid)` → Position.
- **Plan 10** (Verification): Bosch2_wechseln-Stress-Test mit Design-Modus aktiviert. Falls reactflow-Performance kritisch wird, only-render-visible-Optimierung evaluieren.

## Self-Check

### Created Files

- [x] `portal/src/graph/core/types.ts` — FOUND
- [x] `portal/src/graph/core/GObject.ts` — FOUND
- [x] `portal/src/graph/core/GLink.ts` — FOUND
- [x] `portal/src/graph/core/GObjLink.ts` — FOUND
- [x] `portal/src/graph/core/GraphView.tsx` — FOUND
- [x] `portal/src/graph/core/index.ts` — FOUND
- [x] `portal/src/graph/core/__tests__/GraphView.test.tsx` — FOUND
- [x] `portal/src/graph/nodes/types.ts` — FOUND
- [x] `portal/src/graph/nodes/KnotenNode.tsx` — FOUND
- [x] `portal/src/graph/nodes/AusloeserNode.tsx` — FOUND
- [x] `portal/src/graph/edges/KanteEdge.tsx` — FOUND
- [x] `portal/src/viewers/design/PDurchlaufplanViewerDesign.tsx` — FOUND
- [x] `portal/src/viewers/design/auto-layout.ts` — FOUND
- [x] `portal/src/viewers/design/position-store.ts` — FOUND
- [x] `portal/src/viewers/design/index.ts` — FOUND
- [x] `portal/src/viewers/design/__tests__/PDurchlaufplanViewerDesign.test.tsx` — FOUND

### Commits

- [x] `9b03174` — feat(portal): GraphObject foundation skeleton + GraphView + node/edge components (plan 01-07 task 1)
- [x] `8e92d1c` — feat(portal): PDurchlaufplanViewerDesign + Std/Design Tab-Switch (plan 01-07 task 2)

### Verification

- Test-Suite: **98 passed** (15 Files, ~1.7s) — `npm test -- --run`
- Lint: **clean** (`npm run lint`, eslint --max-warnings=0)
- Build: **clean** (`npm run build` — tsc -b + vite build, 691 kB index.js + 35 kB CSS, ~5.7s)

## Self-Check: PASSED
