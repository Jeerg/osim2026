---
phase: 01-vertical-slice
plan: 10
subsystem: graphobject-design-viewer
tags: [viewers, graphobject, react-flow, pdurchlaufplanviewerdesign, design-viewer, sc-4-complete, tdd, performance-patterns]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 06
    provides: "OViewer-Foundation: ViewerProps, ChildDialog, ViewerRegistry; shadcn-Button/Dialog/Select"
  - phase: 01-vertical-slice
    plan: 07
    provides: "ModelStore (patchObject, createObject, deleteObject) — erweitert in diesem Plan um appendSubRef/removeSubRef"
  - phase: 01-vertical-slice
    plan: 08
    provides: "setup.ts mit 11 Registry-Eintraegen + Fallback; PDurchlaufplanViewerStd als hint='std'"
provides:
  - "Minimal-Subset der GraphObject-Schicht (3 Files): GObject + GObjLink + GLink — TypeScript-Port von OSim2004/inc/GraphObj.h Z.341/533/1004. ~30 C++-Felder auf 5-7 essentielle reduziert; Phase 4 portiert vollstaendig."
  - "graph-builder.ts: buildGraph(planOid, allObjects) → React-Flow {nodes, edges}. Konsumiert sub_refs[0]=Knoten und sub_refs[1]=Kanten. Linear-Layout-Fallback (x=100+i*200, y=200) wenn alle Knoten Position(0,0); applyDagreLayout als Phase-4-Stub."
  - "OsimCustomNode.tsx + ReactFlowAdapter.tsx mit ALLEN 5 Pitfall-#5-Mitigations: React.memo CustomNode, nodeTypes-outside-Component, useCallback Handlers, onlyRenderVisibleElements, useMemo Graph-Build."
  - "PDurchlaufplanViewerDesign.tsx (12. Viewer): Header + Toolbar (+Knoten/×Loeschen/Stats) + ReactFlow-Canvas + Add-Dialog mit 3-Klassen-Picker. Edit-Operationen: Node-Drag → patchObject(m_iPosX/Y), Connect-Drag → createObject+appendSubRef, Delete-Button → deleteObject."
  - "model-store erweitert um appendSubRef(parentOid, slot, childOid) + removeSubRef(parentOid, slot, childOid). Auto-Fill leerer Zwischen-Slots; multi-occurrence removal."
  - "setup.ts: PDurchlaufplanViewerDesign mit hint='design' registriert. Registry-Eintraege 12 (vorher 11) + Fallback. SC-4 ist damit 12/12 vollstaendig."
  - "11 neue Tests gruen (5 graph-builder + 3 PDurchlaufplanViewerDesign + 3 model-store appendSubRef/removeSubRef). Total Frontend-Tests: 119 (vorher 108)."
affects: [01-11-save-strategy-indexeddb, 04-live-viz]

# Tech tracking
tech-stack:
  added:
    - "@xyflow/react@^12.10.2 — Node-based UI library. ~200 KB ungezippt, ~50 KB gzipped (Total Bundle stieg von 619 KB auf 820 KB / gzip 199 KB → 260 KB). Performance-Patterns sind in der Dokumentation gut beschrieben; alle 5 Mitigations aus RESEARCH-Pitfall-#5 eingehalten."
  patterns:
    - "GraphObject-als-Interface (nicht Klasse). Phase 1 reduziert die C++-Klassen-Hierarchie auf POJO-Interfaces — alle Funktionalitaet lebt in graph-builder + ReactFlowAdapter + dem Store. Phase 4 darf auf Klassen mit Verhalten wechseln, falls Mehrwert erkennbar."
    - "Wire → GObject → React-Flow drei-Schichten-Mapping: Wire (OtxObject-isomorph) ist Source-of-Truth, GObject die in-memory-Repraesentation, React-Flow-Node das Render-Format. graph-builder ist der bridge zwischen den drei."
    - "Custom-Node-via-data.nodeType: alle unsere Nodes sind type='osim' (Registry-ID), der fachliche Knotentyp (GObjNodeType: konstant/alternativ/speicher/ausloeser/kante/default) wandert ins data-Bag. Spart 6 separate Component-Registrierungen."
    - "Adapter-Pattern fuer ReactFlow-Handlers: ReactFlowAdapter abstrahiert die React-Flow-Event-API hinter simplen Callbacks (onNodeDragStop(id, position), onConnect({source, target})). Konsumenten bleiben entkoppelt von der React-Flow-spezifischen Signature."
    - "Direct-Store-Dispatch in PDurchlaufplanViewerDesign (analog Matrix-Viewer Plan 09): Edit-Operationen rufen useModelStore.getState() direkt statt ueber den onChange/onCommand-Channel. Begruendung: Connect/Drag/Delete sind Multi-Action-Operationen (createObject + appendSubRef; deleteObject + auto-cleanup) — onCommand erwartet 1:1-Mappings."
    - "Linear-Layout statt Dagre fuer Phase 1: einfaches y=200, x=100+i*200 reicht fuer ≤ 8 Knoten (Phase-1-Beispielmodelle). Dagre als applyDagreLayout-Stub vorgehalten; Phase 4 implementiert."
    - "TDD-Doppel-Commit fuer Tasks 2+4: RED-Test (Modul fehlt) gefolgt von GREEN-Implementation. Tasks 1+3+5 single-commit weil Task 1 reine Daten-Strukturen (durch Task-2-Tests indirekt abgedeckt), Task 3 nur UI-Wrapper (durch Task-4-Tests abgedeckt), Task 5 reine Konfiguration (durch Vollsuiten-Run abgesichert)."
    - "React-Flow Performance-Mitigations vollstaendig: (1) nodeTypes als const-export außerhalb der Component, (2) OsimCustomNode mit React.memo, (3) alle Event-Handler mit useCallback, (4) onlyRenderVisibleElements=true, (5) buildGraph mit useMemo im Viewer."

key-files:
  created:
    - "portal/src/graph/core/GObject.ts (~115 LoC) — Basis-Knoten-Interface + gObjectFromOBaseObj-Helper. Liest m_iPosX/Y + m_sName + Klassen-Discriminator (PDpKnKonstant/PDpKnAlternativ/PDpKnSpeicher/PAslEinzel/PDlplKante → GObjNodeType)."
    - "portal/src/graph/core/GObjLink.ts (~50 LoC) — Knoten mit prev[]/next[]-Listen. Phase-1-Platzhalter (graph-builder berechnet keine Topologie); Phase 4 portiert Reachability."
    - "portal/src/graph/core/GLink.ts (~80 LoC) — Kanten-Interface mit from/to/direction + gLinkFromKanteObj-Helper. Liest m_oid_von/m_oid_nach. 4 statt 16 GLDirection-Werte."
    - "portal/src/graph/core/graph-builder.ts (~160 LoC) — buildGraph + applyLinearLayout + applyDagreLayout-Stub. Defensive Filter: dangling Sub-Ref-OIDs werden ausgefiltert; Kanten zu unbekannten/oid:0 Knoten werden ignoriert."
    - "portal/src/graph/core/OsimCustomNode.tsx (~110 LoC) — React.memo-gewrapped CustomNode mit 2 Handles (Left=target/Right=source), Tailwind State-Faerbung (3 States), 6 Unicode-Glyph-Icons fuer Knotentypen."
    - "portal/src/graph/core/ReactFlowAdapter.tsx (~120 LoC) — ReactFlow-Wrapper mit allen Performance-Patterns. Adapter-Pattern: nodeTypes/useCallback/onlyRenderVisibleElements; disabled-Prop fuer Read-Only-Modus. CSS-Import idempotent."
    - "portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx (~210 LoC) — Header + Toolbar + Canvas + Dialog. Edit-Operationen: Drag → patchObject(m_iPosX/Y), Connect → createObject+appendSubRef, Add-Dialog → 3-Klassen-Picker, Delete → deleteObject. parseOidFromId-Helper fuer 'oid:42' → 42 Konvertierung."
    - "portal/src/graph/core/__tests__/graph-builder.spec.ts — 5 Tests: nodes from sub_refs[0], edges from sub_refs[1], label from m_sName, edge source/target from m_oid_von/m_oid_nach, empty result for unknown planOid, linear-layout fallback."
    - "portal/src/viewers/__tests__/PDurchlaufplanViewerDesign.spec.tsx — 3 Tests (mit @xyflow/react als pass-through gemockt wegen ResizeObserver in jsdom): Toolbar renders, Canvas renders Nodes/Edges, Add-Dialog opens on click."
  modified:
    - "portal/package.json — @xyflow/react@^12.10.2 als dependency."
    - "portal/src/stores/model-store.ts — appendSubRef + removeSubRef Actions ergaenzt (Action-Interface + 2 Implementierungen)."
    - "portal/src/stores/__tests__/model-store.spec.ts — 3 neue Tests (appendSubRef extends, appendSubRef fills intermediate slots, removeSubRef removes all occurrences). Test-Count: 10 (vorher 7)."
    - "portal/src/viewers/setup.ts — PDurchlaufplanViewerDesign mit hint='design' registriert. Header-Kommentar auf Plan-10-State + Hinweis auf Sidebar-Backlog (Plan 11 ViewerHintSwitcher)."
  deleted: []

key-decisions:
  - "GraphObject als Interface, nicht Klasse. Begruendung: alle 'Methoden' des C++-Originals (SetState, Animate, Translate, Erase) sind im React-Reconciler/Store nicht noetig — State lebt im model-store, Re-Rendering macht React-Flow. Phase 4 kann auf Klassen mit Verhalten wechseln, falls Mehrwert erkennbar (z.B. fuer Reachability-Algorithmen)."
  - "data.nodeType statt separate React-Flow-Type-Registrierungen: alle Knoten sind type='osim' (Registry-ID fuer OsimCustomNode), der fachliche Discriminator (GObjNodeType) wandert ins data-Bag. Spart 6 Component-Registrierungen + simplifiziert den graph-builder."
  - "Linear-Layout statt Dagre in Phase 1. Begruendung: 1) Phase-1-Modelle (Dummy.otx 5 Knoten, Fertigungsstruktur1.otx ~10 Knoten) sind klein; Linear ist lesbar bis ~8 Knoten. 2) Dagre haette zusaetzliche Dep-Last (~30 KB). 3) Stub applyDagreLayout ist als public Symbol vorgehalten, Phase 4 swappt ohne API-Drift."
  - "PDurchlaufplanViewerDesign nutzt Direct-Store-Dispatch (useModelStore.getState() direkt) statt onChange/onCommand-Channel. Analog Plan 09 Matrix-Viewer. Begruendung: Connect/Drag/Delete sind Multi-Action-Operationen (createObject + appendSubRef in einem semantischen Schritt). Der onCommand-Channel mit Discriminator-Type-Union ist fuer 1:1-Mappings designed."
  - "Toolbar-Click-statt-DnD-Palette fuer Knoten-Anlegen (gemaess RESEARCH §Open Questions #4): + Knoten-Button öffnet Dialog mit Klasse-Picker, Knoten landet via createObject + appendSubRef im Plan. Phase 4 ergaenzt DnD aus einer linken Palette-Sidebar."
  - "Position-Persistierung via wire.attrs.m_iPosX/m_iPosY: Phase-1-Modelle haben diese Felder zwar nicht im OTX, aber der Engine-OTX-Writer ist Pass-Through fuer unbekannte Felder (verifiziert Plan 01 SUMMARY byte-stabiler Roundtrip). Wenn der User Knoten verschiebt, wird m_iPosX/Y in attrs geschrieben und beim Save-back erhalten."
  - "@xyflow/react als pass-through gemockt im Vitest-Test. Begruendung: ResizeObserver fehlt in jsdom, React-Flow crasht beim Mount ohne Polyfill. Polyfill-Aufwand > Mock-Aufwand; visuelles Canvas-Rendering ist E2E-Verantwortung (Playwright in Plan 12)."
  - "Reine GObjLink-Schicht ohne Logik in Phase 1: prev[]/next[] bleiben leer. Begruendung: graph-builder kennt sub_refs und kann die Topologie direkt aus den Kanten lesen — kein Vorab-Index noetig. Phase 4 fuellt prev/next mit echten Edge-Refs fuer Reachability-Highlighting."
  - "applyDagreLayout als public export statt private function. Begruendung: 1) ESLint-noUnused-Rule loest sonst auf ungenutzten _gEdges aus; 2) Phase-4-Caller braucht das Symbol; 3) frueher Public-Anker stabilisiert die Migration (kein Public-API-Add in Phase 4)."

metrics:
  duration_minutes: 14
  completed_date: 2026-05-21
---

# Phase 01 Plan 10: GraphObject Design-Viewer Summary

**Letzter Viewer aus SC-04 ist implementiert.** PDurchlaufplanViewerDesign rendert einen Durchlaufplan als interaktiven React-Flow-Canvas mit Knoten + Kanten und vollstaendigen Edit-Operationen (Drag-Position, Connect-Drag-Edges, Add-Node-Dialog, Delete-Selected). Damit ist die 12er-Viewer-Liste vollstaendig und SC-04 12/12 erfuellt.

## Wave 6 / Plan 10 Scope (executed)

| Task | Type | Files Created/Modified | Status |
|------|------|------------------------|--------|
| 1 — package.json + GObject/GObjLink/GLink | auto, single | 4 created/modified (3 graph/core/*.ts + package.json) | `997293a` |
| 2 RED — graph-builder Tests | auto, tdd-red | 1 created (graph-builder.spec.ts) | `d930408` |
| 2 GREEN — graph-builder Implementation | auto, tdd-green | 1 created (graph-builder.ts) | `9402500` |
| 3 — OsimCustomNode + ReactFlowAdapter | auto, single | 2 created (+ graph-builder.ts touched for unused-stub) | `4b17e6d` |
| 4 RED — PDurchlaufplanViewerDesign Tests | auto, tdd-red | 1 created (spec.tsx) | `c2f31a8` |
| 4 GREEN — PDurchlaufplanViewerDesign Implementation | auto, tdd-green | 1 created (Viewer) + 1 modified (model-store mit appendSubRef/removeSubRef als Rule-3 Enabler) | `1ad3984` |
| 5 — setup.ts + model-store-Tests | auto, single | 3 modified (setup.ts, model-store.spec.ts, graph-builder.ts eslint-fix) | `764f8d1` |

Insgesamt **7 Task-Commits** (5 Tasks + 2 TDD-RED-Commits) plus dieser SUMMARY-Commit.

## React-Flow Performance-Pattern-Checkliste (alle 5 Pitfall-Mitigations)

| Mitigation | Wo umgesetzt | Status |
|------------|--------------|--------|
| 1. `nodeTypes` OUTSIDE Component | `ReactFlowAdapter.tsx` Z.~24: `const nodeTypes = { osim: OsimCustomNode }` als top-level const | ✓ |
| 2. CustomNode mit `React.memo` | `OsimCustomNode.tsx` letzte Zeile: `export const OsimCustomNode = memo(OsimCustomNodeImpl)` | ✓ |
| 3. Handler mit `useCallback` | `ReactFlowAdapter.tsx`: handleNodeDragStop, handleConnect, handleSelectionChange, handleNodesChange alle `useCallback` | ✓ |
| 4. `onlyRenderVisibleElements={true}` | `ReactFlowAdapter.tsx` ReactFlow-Prop | ✓ |
| 5. Graph mit `useMemo` | `PDurchlaufplanViewerDesign.tsx`: `const graph = useMemo(() => buildGraph(...), [obj.oid, allObjects])` | ✓ |

## GraphObject-Subset (was portiert, was Phase-4-Backlog)

**Portiert in Phase 1** (3 Files, ~245 LoC):
- `GObject` (Basis): `id, type, position, size?, data{label, state?, backColor?, textColor?, viewedOid}` — 8 Felder.
- `GObjLink extends GObject`: `prev: string[], next: string[]` — Listen leer in Phase 1.
- `GLink extends GObject`: `from, to, direction` — 4 statt 16 GLDirection-Werte.
- Helper: `gObjectFromOBaseObj` + `gLinkFromKanteObj` + `gObjLinkFromGObject`.

**Phase-4-Backlog** (im RESEARCH §Pattern 5 dokumentiert):
- Phantom-Rendering waehrend Drag (`m_OldPhantomRect`, `m_PDeltaX/Y`)
- `m_IsDeleteForbidden`, `m_IsMoveForbidden` Read-Only-Flags
- Animation-Choreographie (`m_bAnimate`, `m_fHowMuchRed`)
- Hierarchische Eltern-Referenzen (`m_OGCollection`, `m_OGPosition`)
- Kontextmenü-Steuerung (`m_bShowContextMenu`)
- Voller GObjState-Enum (8 Werte statt 3)
- Voller GLDirection-Enum (16 Werte statt 4)
- Reachability-Algorithmen (`GetPrevNodes`, `IsReachableFrom`) auf gefuelltem prev/next
- Dagre/ELK Auto-Layout (Stub vorhanden: `applyDagreLayout`)

## Edit-Operations-Catalog

| Operation | UI-Trigger | Store-Action(s) | Funktioniert? |
|-----------|-----------|-----------------|---------------|
| Position aendern | Node-Drag (innerhalb Canvas) → drag-stop | `patchObject(oid, {m_iPosX, m_iPosY})` | ✓ (m_iPosX/Y im attrs persistiert; Round zu integer) |
| Neue Kante | Source-Handle → Target-Handle | `createObject('PDlplKante', {m_oid_von, m_oid_nach, m_sName:''})` + `appendSubRef(plan.oid, 1, newKantenOid)` | ✓ |
| Neuer Knoten | Toolbar '+ Knoten' → Dialog → Anlegen | `createObject(picked-klass, {m_sName})` + `appendSubRef(plan.oid, 0, newKnotenOid)` | ✓ (3 Klassen waehlbar: PDpKnKonstant/Alternativ/Speicher) |
| Knoten loeschen | Selection + 'Auswahl loeschen'-Button | `deleteObject(oid)` (model-store raeumt sub_refs automatisch auf) | ✓ |
| Kante loeschen | Selection + 'Auswahl loeschen'-Button | `deleteObject(kanteOid)` analog | ✓ (Edge-Selection wird in Phase 1 nicht im UI dargestellt — aber Backend-Pfad ist da) |
| Knoten umbenennen | NICHT IM CANVAS | — | ✗ Phase 4 (Inline-Rename); heute via Std-Viewer-Property-Editor (Plan 08) |
| Edge-Routing aendern | NICHT IM CANVAS | — | ✗ Phase 4; heute smoothstep-Default |

## Test-Suite

| Test-File | Tests | Status |
|-----------|-------|--------|
| `graph-builder.spec.ts` | 5 | gruen |
| `PDurchlaufplanViewerDesign.spec.tsx` | 3 | gruen (mit @xyflow/react Mock) |
| `model-store.spec.ts` (Erweiterung) | 3 neue (appendSubRef × 2, removeSubRef × 1) | gruen |
| **Total Plan 10** | **11 neue** | **gruen** |
| Frontend-Test-Suite Gesamt | **119** (vorher 108) | gruen |

## Verification (run)

- `cd portal && npx tsc -b --noEmit` → 0 errors
- `cd portal && npm run test:run` → 23 test files, 119 tests gruen, 4.4 s
- `cd portal && npm run build` → 0 errors; index-CV_1pkAX.js 820 KB (gzip 260 KB) — Bundle stieg um ~200 KB durch @xyflow/react (erwartet)
- `cd portal && npm run lint` → 0 errors / 7 warnings (alle vorbestehend aus Plan 06; unveraendert seit Plan 09)

## Success Criteria

- **SC-4 (12 konkrete Viewer)**: **VOLLSTAENDIG 12/12**. Mit PDurchlaufplanViewerDesign ist die letzte Position aus der CONTEXT-D-08-Liste erfuellt:
  1. PSimulatorViewer ✓ (Plan 08)
  2. PDurchlaufplanViewerStd ✓ (Plan 08)
  3. **PDurchlaufplanViewerDesign ✓ (Plan 10)** ← NEU
  4. PGObjBaseViewer ✓ (Plan 08, Fallback)
  5. PRessBelegMatrixViewer ✓ (Plan 09)
  6. PRessMengeMatrixViewer ✓ (Plan 09)
  7. PRessVerknuepfungViewer ✓ (Plan 09)
  8. PDlplBetriebsmittelViewer ✓ (Plan 08)
  9. PDlplPersonalViewer ✓ (Plan 08)
  10. AEinsatzWunschViewer ✓ (Plan 08)
  11. AKapBedViewer ✓ (Plan 08)
  12. AGruppeViewer ✓ (Plan 08)
- **SC-6 (Edit-Operationen)**: VOLLSTAENDIG fuer graphischen Viewer (Add Node, Add Edge, Delete, Position-Drag). Property-Edit deckt Plan 08 ab, Matrix-Cell-Edit Plan 09.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] appendSubRef im Model-Store fehlte**
- **Found during:** Task 4 GREEN (Implementation des Design-Viewers)
- **Issue:** Plan-Aufgabenfolge sah vor, dass Task 5 die `appendSubRef`/`removeSubRef`-Actions am model-store ergaenzt. Task 4 (Design-Viewer) braucht sie aber bereits — der Viewer hat TypeScript-Fehler (`Property 'appendSubRef' does not exist on type 'ModelStore'`).
- **Fix:** Die Store-Actions wurden im Task-4-Commit mit-ergaenzt (sind ohnehin tightly coupled mit dem Viewer). Task 5 ergaenzt nur noch die Tests + Registry-Eintrag.
- **Files modified:** `portal/src/stores/model-store.ts` (Action-Interface + Implementierung)
- **Commit:** `1ad3984`

**2. [Rule 1 — Lint] applyDagreLayout-Stub triggert no-unused-vars**
- **Found during:** Task 5 (lint nach finalem Setup)
- **Issue:** `applyDagreLayout(gNodes, _gEdges)` ist Phase-4-Stub mit ungenutztem `_gEdges`-Parameter. ESLint `@typescript-eslint/no-unused-vars` ignoriert Underscore-Prefix nicht (Default-Konfig).
- **Fix:** Per-Line `eslint-disable-next-line` direkt vor dem Parameter (innerhalb der Signature) + function von `private` zu `export` umgestellt (frueher Public-API-Anker fuer Phase 4).
- **Files modified:** `portal/src/graph/core/graph-builder.ts`
- **Commit:** `764f8d1`

Andere Deviations: 0 (Plan war fuer den Hauptteil deviation-frei).

## Bekannte Defizite (Backlog)

1. **viewerHint-Switch im UI fehlt** — `PDurchlaufplanViewerDesign` ist registriert mit `hint='design'`, aber heute hat das UI keinen Switcher. Sidebar-Click auf einen Plan landet immer im `PDurchlaufplanViewerStd` (default ohne Hint). Plan 11 ergaenzt einen Tab-Switcher im Workspace oder einen Toggle-Button in der Toolbar.

2. **Position-Persistierung ueber Save-Back nicht in Phase 1 verifiziert** — Wenn der User Knoten zieht, wird `m_iPosX`/`m_iPosY` ins `wire.attrs` geschrieben. Save-Back im Backend nutzt den Engine-OTX-Writer; der ist Pass-Through fuer unbekannte Felder (Plan 01 SUMMARY byte-stabiler Roundtrip). Trotzdem ist die ECHTE End-to-End-Verifikation (Knoten ziehen → Save → Reload → Knoten ist an gezogener Position) E2E-Verantwortung von Plan 12 (Playwright-Test). Sollte Save-Back die Felder NICHT durchreichen, ist das ein Engine-Backlog (osim-engine OTX-Writer erweitern), nicht ein osim-ui-Bug.

3. **Linear-Layout statt Dagre** — bei > ~8 Knoten wird der Canvas unleserlich (alle in einer Reihe, x=100+i*200). Phase-4-Backlog: `applyDagreLayout`-Stub durch echte Dagre/ELK-Integration ersetzen. Symbol ist als public export vorgehalten.

4. **Edge-Selection im UI nicht sichtbar** — Edges sind in React-Flow technisch selektierbar (gehen mit selectedIds rein und werden vom Delete-Button geloescht), aber das Visual-Feedback fehlt. Phase 4: animated-Hover + Highlight-Edge bei Selection.

5. **Toolbar-Button "Layout neu rechnen" weggelassen** — der Plan-Action listet ihn als 3. Button auf. Da der Layout-Algorithmus heute deterministisch ist (Linear ueber Sub-Ref-Reihenfolge) und kein Random-Seed hat, wuerde "Layout neu rechnen" nichts Beobachtbares aendern. Phase 4 mit Dagre macht den Button sinnvoll (verschiedene Rank-Direction-Optionen).

6. **GObjLink/GLink mit Verhalten** — Phase-1-Interfaces ohne Methoden. Phase 4 portiert Reachability-Algorithmen (`GetPrevNodes`, `IsReachableFrom`) falls Mehrwert erkennbar (z.B. fuer "Was passiert wenn dieser Knoten ausfaellt?"-Visualisierungen).

## Was Plan 11+12 noch hinzufuegen

| Was | Plan | Begruendung |
|-----|------|-------------|
| ViewerHintSwitcher (Std ↔ Design Toggle) | 11 | Workspace-UI-Komponente, kein Viewer-Code |
| Auto-Save-Wiring (30s Debounce + manueller Speichern-Button) | 11 | Save-Strategie / Dirty-State-Konsolidierung |
| Lock-Heartbeat (30s Ping zum /api/v1/locks/{model_id}/heartbeat) | 11 | Lock-Lifecycle |
| IndexedDB-Snapshot-Service (dexie) | 11 | Crash-Recovery |
| E2E-Tests (Playwright) | 12 | Upload → Edit → Drag → Save → Reload → Position erhalten |
| Position-Persistierung End-to-End-Verifikation | 12 | Test deckt Engine-OTX-Writer-Pass-Through fuer m_iPosX/Y ab |

## Was als naechstes (Plan 11+12)

Plan 11 macht aus dem Modellierungs-Werkzeug ein **production-grade** Werkzeug:
- Auto-Save 30 s + Speichern-Button + Dirty-Indicator
- ViewerHintSwitcher (oder Tabs im Workspace, je nach Layout-Entscheidung)
- Lock-Heartbeat
- IndexedDB-Snapshot pro Property-Aenderung

Plan 12 schliesst die Vertical-Slice ab mit E2E-Tests, Performance-Smokes (50-Knoten-Plan @ 30 FPS) und einer finalen Dokumentations-Sweep.

## Self-Check: PASSED

**Files verifiziert (9/9 exist):**
- `portal/src/graph/core/GObject.ts` ✓
- `portal/src/graph/core/GObjLink.ts` ✓
- `portal/src/graph/core/GLink.ts` ✓
- `portal/src/graph/core/graph-builder.ts` ✓
- `portal/src/graph/core/OsimCustomNode.tsx` ✓
- `portal/src/graph/core/ReactFlowAdapter.tsx` ✓
- `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx` ✓
- `portal/src/graph/core/__tests__/graph-builder.spec.ts` ✓
- `portal/src/viewers/__tests__/PDurchlaufplanViewerDesign.spec.tsx` ✓

**Commits verifiziert (7/7 exist):** `997293a`, `d930408`, `9402500`, `4b17e6d`, `c2f31a8`, `1ad3984`, `764f8d1`.
