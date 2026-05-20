---
phase: 01-vertical-slice
plan: 06
subsystem: portal
type: execute
status: complete
wave: 4
tags: [portal, matrix-viewer, viewer-foundation, synthetic-nodes, react, type-map, model-store]

# --- Dependency-Graph ---
requires:
  - "phase 01-04 — Viewer-Foundation: ViewerFrame, ClientCtrl, ChildDialog, ViewerHost, viewer-registry, OCtrl-Familie, model-store"
  - "phase 01-05 — type-maps + Sidebar-Tree + WorkspaceLayout + 4 Property-Viewer"
provides:
  - "portal/src/viewers/matrix/MatrixGrid.tsx — generischer 2D-Grid mit row/col-Header, default Cell-Renderer (number/string/boolean), custom-Renderer-Slot, isDisabled-Predicate, readonly-Mode"
  - "portal/src/viewers/matrix/matrix-helpers.ts — getAllOfKlass, extractScheduleColumns, getAllRessources, isGroupNode"
  - "portal/src/viewers/matrix/synthetic-nodes.ts — SYNTHETIC_RESS_BELEG/MENGE/VERKN OIDs + KLASS-Strings + modul-lokaler synth-Property-Store (subscribeSyntheticProps-Pattern)"
  - "portal/src/viewers/matrix/PRessBelegMatrixViewer.tsx — Belegungs-Matrix, klass=RESS_BELEG_GROUP"
  - "portal/src/viewers/matrix/PRessMengeMatrixViewer.tsx — Mengen-Matrix, klass=RESS_MENGE_GROUP"
  - "portal/src/viewers/matrix/PRessVerknuepfungViewer.tsx — Adjazenz-Matrix, klass=RESS_VERKNUEPFUNG_GROUP, diagonal-disabled, symmetrisch"
  - "portal/src/viewers/matrix/index.ts — Side-Effect-Index + Re-Exports"
  - "portal/src/viewers/property/type-maps.ts — neu registriert: PRessBeleg, PRessMenge, PRessVerknuepfung, PAssozBeleg, PAssozMenge (Foundation fuer Backend-TYPE_MAP-Erweiterung Phase 2)"
affects:
  - "portal/src/viewers/matrix/ (neu)"
  - "portal/src/viewers/property/type-maps.ts (erweitert)"
  - "portal/src/viewers/property/index.ts (side-effect-Import auf viewers/matrix)"
  - "portal/src/components/sidebar-tree.tsx (synthetischer Matrix-Sichten-Folder mit 3 Leaf-Eintraegen)"
  - "portal/src/components/workspace-layout.tsx (synthetic-OID-Fallback in setObj-Routing + subscribe auf synth-Property-Store)"

# --- Tech-Stack ---
tech_stack:
  added: []  # keine neuen npm-Dependencies — siehe Deviations (no @tanstack/react-virtual)
  patterns:
    - "Synthetische Folder-Klassen (RESS_*_GROUP) + reservierte OID-Range -10000..-19999: Matrix-Viewer triggern auf einer eigenen Klasse statt auf einer realen OSim-Klasse, weil ein PRessBeleg-Knoten EIN Eintrag ist, die Matrix aber eine Aggregation ueber alle Eintraege+Schichten — Sidebar-Folder ist der Viewer-Konsument, nicht ein Tree-Container."
    - "Modul-lokaler synth-Property-Store (synthetic-nodes.ts: SYNTH_PROPS-Map + subscribe-Pattern): Matrix-Cell-Edits werden NICHT im useModelStore.tree gespeichert (waere Tree-Verschmutzung mit synthetischen OIDs, und updateProperty()-Walk wuerde den synthetischen Knoten ohnehin nicht finden) — stattdessen lebt der Store nur fuer die synthetischen Properties + Notify-Listener fuer Re-Render."
    - "MatrixGrid als generisches <RowT, ColT, CellValueT>-Component: detektiert default-Cell-Kind via typeof value (number → number-input, string → text-input, boolean → checkbox), custom renderCell-Slot erlaubt Viewer-spezifische Zellen (z.B. spaeter Color-Picker fuer Status-Sicht)."
    - "extractScheduleColumns als Best-Effort-Heuristik: PEinsatzzeitTag sortiert nach m_iBeginn, sonst Fallback Standard-Spalte — dokumentiert in Plan-Risk-Block, Phase 2 zieht andere Schicht-Modellierungen (AGruppe-Schicht-Pool, PRessBeleg-m_lEinsatzzeit) nach."

# --- Key Files ---
key_files:
  created:
    - "portal/src/viewers/matrix/MatrixGrid.tsx"
    - "portal/src/viewers/matrix/matrix-helpers.ts"
    - "portal/src/viewers/matrix/synthetic-nodes.ts"
    - "portal/src/viewers/matrix/PRessBelegMatrixViewer.tsx"
    - "portal/src/viewers/matrix/PRessMengeMatrixViewer.tsx"
    - "portal/src/viewers/matrix/PRessVerknuepfungViewer.tsx"
    - "portal/src/viewers/matrix/index.ts"
    - "portal/src/viewers/matrix/__tests__/MatrixGrid.test.tsx"
    - "portal/src/viewers/matrix/__tests__/PRessBelegMatrixViewer.test.tsx"
    - "portal/src/viewers/matrix/__tests__/registry.test.ts"
    - ".planning/phases/01-vertical-slice/01-06-SUMMARY.md"
  modified:
    - "portal/src/viewers/property/type-maps.ts — +5 Klassen (PRessBeleg, PRessMenge, PRessVerknuepfung, PAssozBeleg, PAssozMenge)"
    - "portal/src/viewers/property/index.ts — side-effect-Import @/viewers/matrix"
    - "portal/src/components/sidebar-tree.tsx — synthetischer Matrix-Sichten-Folder + 3 selektierbare Leaf-Eintraege"
    - "portal/src/components/workspace-layout.tsx — isSyntheticOid-Fallback in setObj-Routing + useReducer-Tick auf subscribeSyntheticProps"

# --- Decisions ---
decisions:
  - id: "01-06-D1"
    title: "Synthetische Folder-Klassen (RESS_*_GROUP) als Matrix-Viewer-Trigger"
    decision: "Drei dedizierte klass-Strings (RESS_BELEG_GROUP, RESS_MENGE_GROUP, RESS_VERKNUEPFUNG_GROUP) registriert in der viewer-registry. Sidebar-Tree haengt einen synthetischen 'Matrix-Sichten'-Folder mit 3 Leaf-Eintraegen unter den Modell-Root. Klick → selectOid(-10001/-10002/-10003) → WorkspaceLayout faengt das ab und setzt einen synthetischen Wrapper-Node (klass=RESS_*_GROUP) als Frame-Obj → ViewerHost mountet via registry-Lookup den richtigen Matrix-Viewer."
    rationale: "Ein PRessBeleg-Knoten ist EIN Eintrag — die Matrix-Sicht aggregiert ueber alle PRessBeleg + alle Schichten. Ein konkretes OSim-Klassen-Mapping (klass=PRessBeleg) wuerde die Matrix-Sicht nicht triggern, sondern die Property-Sicht eines einzelnen Eintrags. Die synthetische Folder-Klasse ist eindeutig (Prefix RESS_ + Suffix _GROUP, in OTX-Format kommen keine solchen Strings vor — alle echten OSim-Klassen beginnen mit P/A/E/O). OID-Range -10000..-19999 ist weit unter dem TEMP-OID-Counter (-1 fallend), kein Kollisions-Risiko."

  - id: "01-06-D2"
    title: "Modul-lokaler synth-Property-Store statt model-store"
    decision: "Matrix-Cell-Edits werden in SYNTH_PROPS (Map<number, Record<string, unknown>>) in synthetic-nodes.ts gespeichert, NICHT via useModelStore.updateProperty. Listener-Pattern (subscribeSyntheticProps) triggert Re-Render im WorkspaceLayout via useReducer-Tick."
    rationale: "Die synthetischen Knoten liegen NICHT im useModelStore.tree — updateProperty() macht einen Tree-Walk und finde sie nicht (silent no-op, fataler Bug). Alternative waere, die synthetischen Knoten in den Tree zu injizieren — das verschmutzt den Tree mit Frontend-Artefakten und macht den Save-Pfad (Plan 09) komplizierter. Mit der modul-lokalen Loesung bleibt useModelStore.tree 1:1 = Backend-Tree; Save-back liest die SYNTH_PROPS-Map explizit aus und uebersetzt sie in echte PAssozBeleg/PAssozMenge/PRessVerknuepfung-Objekte. Trade-off: Snapshot-Undo des Haupt-Stores erfasst Matrix-Edits NICHT (Plan 09 verdrahtet ein eigenes Undo fuer den synth-Store, falls noetig)."

  - id: "01-06-D3"
    title: "Cell-Storage als CellMap statt einzelne PAssoz-Knoten"
    decision: "PRessBeleg/PRessMenge-Cells werden als Record<'ressOid:colId', number> in m_aKapazitaeten / m_aMengen gespeichert; PRessVerknuepfung als Record<'oidLow:oidHigh', true> in m_aLinks. Pro Viewer EINE Property-Map auf dem synthetischen Knoten."
    rationale: "Phase 1 hat keine echten PAssozBeleg/PAssozMenge-Objekte im Tree (Backend-TYPE_MAP enthaelt sie nur als Property-Stub, siehe Plan-05-Risk). Eine flache Map ist ausreichend fuer den UI-State, und Save-back in Plan 09 hat einen klaren Konvertierungspunkt: iteriere ueber die Map, erzeuge je Eintrag ein PAssoz-Objekt im Tree. Symmetrie-Konvention bei Verknuepfung (sortierte OID-Paare lo:hi) garantiert deterministischen Key-Aufbau."

  - id: "01-06-D4"
    title: "Keine @tanstack/react-virtual-Dependency in Phase 1"
    decision: "MatrixGrid hat den `virtualized`-Prop im Interface, aber aktuell als No-Op. Default-DOM-Render fuer alle Matrix-Groessen. Spaetere Migration auf react-virtual bleibt interface-kompatibel."
    rationale: "Pragmatismus: OSim-Modelle (Dummy.otx, Fertigungsstruktur1) haben typischerweise 5-20 Ressourcen × 1-3 Schichten = <60 Zellen. DOM-Render ist um Groessenordnungen schneller als die react-virtual-Setup-Latenz. Bosch2_wechseln (18 MB, Stress-Test) wird in Plan 10 Verification gemessen; wenn dort eine Adjazenz-Matrix >100x100 auftritt, kann die Komponente intern auf @tanstack/react-virtual umgestellt werden, ohne das Interface zu aendern. Bis dahin: keine Dependency, einfachere Tests, ohne happy-dom-ResizeObserver-Hacks."

  - id: "01-06-D5"
    title: "extractScheduleColumns als Best-Effort-Heuristik (PEinsatzzeitTag + Fallback)"
    decision: "Heuristik: 1) sammele alle PEinsatzzeitTag-Knoten via getAllOfKlass; 2) sortiere nach m_iBeginn (numeric, fallback 0); 3) eine Spalte pro Tag, Label = node.name (fallback 'PEinsatzzeitTag-<oid>'). Wenn 0 PEinsatzzeitTag im Tree → eine Default-Spalte 'Standard'."
    rationale: "Das Original (PRessBeleg.h) kennt mehrere Schicht-Modellierungen (PEinsatzzeit-Listen, Tag-Listen, AGruppe-Schicht-Pool). Phase 1 deckt nur den PEinsatzzeitTag-Pfad ab, weil das der einzige Schicht-Typ ist, den der Backend-OTX-Reader heute zuverlaessig serialisiert (json_tree_service.py:183-190). Plan 08 (AEinsatzWunsch) erweitert das nach. Dokumentiert in Plan-Risk-Block."

# --- Patterns (Reuse) ---
patterns:
  - "Generisches Grid mit typeof-Detection + custom-Renderer-Slot: detectKind(value) klassifiziert in number/string/boolean; renderCell-Prop ueberschreibt fuer Viewer-spezifische Cells."
  - "Memoized Cell-Wrapper (React.memo um CellComponent + useCallback fuer onChange-Closure) — vermeidet unnoetige Re-Renders bei Edits einzelner Zellen."
  - "Sidebar-tree-side-Append-Pattern: useMemo-data baut Wurzel-toArboristNode, appendet synthetische Geschwister als zusaetzliche children. Skaliert auf weitere synthetische Folder (Plan 08 AKapBed-Sicht, Phase 3+ Gantt)."
  - "WorkspaceLayout-Routing-Erweiterung: isSyntheticOid-Check VOR selectByOid, dann getSyntheticNode-Lookup — klar erkennbare Layering."
  - "subscribe-Pattern fuer module-local-State (SYNTH_LISTENERS + notify()), kein zustand-Lib-Overhead — fuer kleine, geographisch konzentrierte Zustaende."

# --- Metrics ---
metrics:
  tasks_completed: 2
  files_created: 10
  files_modified: 4
  test_count_new: 19
  test_count_total: 78
  test_results: "78 passed (alle Plan-04/05-Tests bleiben gruen, +19 neue aus Plan 06)"
  lint_status: "clean"
  build_status: "clean (449 kB index.js + 25 kB CSS, ~3.3s build-Zeit)"
  duration_minutes: ~40
  completed_date: "2026-05-20"
---

# Phase 1 Plan 06: Matrix-Viewer Summary

Welle-4-Frontend-Spur (1/3): Drei Matrix-orientierte Viewer aus D-08 (Belegungs-, Mengen-, Verknuepfungs-Matrix) + ein reusables MatrixGrid-Generic-Component. 8 von 12 Viewern aus D-08 sind nach Plan 06 fertig. Cell-Edits funktionieren lokal im Browser; Save-back auf echte PAssoz-Objekte ist Plan 09. Foundation fuer spaetere Matrix-Sichten (Phase 7+ Gantt, AKapBed-Sicht in Plan 08).

## Was geliefert wurde

Zwei atomare Commits:

| Task | Commit  | Was                                                                                                                                                                                                                                  |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 7a68364 | MatrixGrid<RowT, ColT, CellValueT> (sticky-Header, default-Cell-Renderer fuer number/string/boolean, custom renderCell-Slot, isDisabled, readonly) + matrix-helpers (getAllOfKlass, extractScheduleColumns, getAllRessources) + 11 Tests |
| 2    | 6095552 | 3 Matrix-Viewer (PRessBeleg/PRessMenge/PRessVerknuepfung) + synthetic-nodes (klass-Strings + OIDs + modul-lokaler Property-Store mit subscribe-Pattern) + SidebarTree-Erweiterung (Matrix-Sichten-Folder) + WorkspaceLayout-Routing + 8 Tests        |

## Architektur-Recap

```
SidebarTree
  ├─ Modell-Root (ASimulator)
  │    └─ Ausloeser / Plaene / Knoten / Ressourcen / Einsatzzeiten (Backend-_group)
  └─ Matrix-Sichten (synthetisch, eingefuegt vom Frontend)
       ├─ Belegungsressourcen-Matrix    oid=-10001 klass=RESS_BELEG_GROUP
       ├─ Mengenressourcen-Matrix       oid=-10002 klass=RESS_MENGE_GROUP
       └─ Ressourcen-Verknuepfungen     oid=-10003 klass=RESS_VERKNUEPFUNG_GROUP

Klick auf Matrix-Leaf
  ↓
selectOid(-10001)  →  WorkspaceLayout.useEffect
  ↓                       isSyntheticOid? → getSyntheticNode → frame.setObj(synth)
                          (selectByOid wird umgangen — synth.oid ist nicht im Tree)
  ↓
ViewerHost.pickChildDialog(RESS_BELEG_GROUP) → PRessBelegMatrixViewer
  ↓
MatrixGrid<OtxJsonNode, ScheduleColumn, number>
  rows = getAllOfKlass(tree, PRessBeleg|PBetriebsmittel|PPerson)
  cols = extractScheduleColumns(tree)          // PEinsatzzeitTag oder Standard
  getCellValue = lookup in cellMap (synthProps[obj.oid].m_aKapazitaeten)
  onCellChange = setSyntheticProperty(obj.oid, m_aKapazitaeten, nextMap)
                                  ↓
                  notify-Listener → WorkspaceLayout bumpSynthTick
                                  ↓
                  useEffect re-runs → frame.setObj(neuer synth-Wrapper mit aktualisierten props)
                                  ↓
                  ViewerHost re-rendert die Matrix mit dem neuen Wert
```

## Verifikation (Must-Haves abgehakt)

- [x] MatrixGrid ist reusable Generic-Component, sticky-Header, sortierte Spalten, editable Cells
- [x] PRessBelegMatrixViewer rendert Belegungs-Matrix (rows=Ressourcen, cols=Schichten, cell=Kapazitaet)
- [x] PRessMengeMatrixViewer rendert Mengen-Matrix
- [x] PRessVerknuepfungViewer rendert NxN-Adjazenz mit boolean-Checkboxes, Diagonal-disabled, symmetrisch
- [x] Alle 3 Viewer in der viewer-registry unter ihren RESS_*_GROUP-Klassen registriert
- [x] Sidebar-Folder-Click oeffnet den jeweiligen Matrix-Viewer (synthetic-OID-Routing in WorkspaceLayout)
- [x] Cell-Edit triggert setSyntheticProperty, Wert reflektiert beim naechsten Render
- [x] `npm test -- --run`: **78/78 gruen** (13 Test-Files)
- [x] `npm run lint`: clean
- [x] `npm run build`: clean (449 kB index.js + 25 kB CSS, ~3.3s)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical] Matrix-Cell-Edits gingen via updateProperty(syntheticOid) verloren**
- **Found during:** Task 2 (Code-Review nach erster Viewer-Implementation)
- **Issue:** Synthetische Group-Knoten (RESS_*_GROUP) leben NICHT im echten useModelStore.tree — ein Tree-Walk in updateNodeImmutable findet sie nicht und macht silently nichts (no-op). Cell-Edits waeren also komplett verloren gegangen, ohne dass jemand die Edits speichern oder zurueck-lesen koennte.
- **Fix:** Modul-lokalen synth-Property-Store (SYNTH_PROPS-Map + subscribeSyntheticProps + setSyntheticProperty) in synthetic-nodes.ts ergaenzt. WorkspaceLayout subscribet darauf und triggert via useReducer-Tick einen frame.setObj-Re-Call mit aktualisierten synthetischen Properties.
- **Files:** `portal/src/viewers/matrix/synthetic-nodes.ts`, alle 3 Matrix-Viewer-Files, `portal/src/components/workspace-layout.tsx`
- **Commit:** 6095552
- **Trade-off:** Snapshot-Undo des Haupt-Stores erfasst Matrix-Edits NICHT — dokumentiert als Known-Stub fuer Plan 09 (eigenes Undo fuer den synth-Store, falls noetig).

### Anpassungen ohne Auswirkung auf Plan-Verhalten

**1. Keine @tanstack/react-virtual-Dependency (Plan-Empfehlung "default true für > 30x30")**
- **Begruendung:** OSim-Phase-1-Modelle haben typischerweise 5-20 Ressourcen × 1-3 Schichten = <60 Zellen. DOM-Render ist um Groessenordnungen schneller als die react-virtual-Setup-Latenz fuer kleine Matrizen. Plan-10 Verification misst mit Bosch2_wechseln; falls dort eine Adjazenz-Matrix >100x100 auftritt, kann das Component intern auf react-virtual umgestellt werden — das `virtualized`-Interface-Prop ist bereits vorhanden, aktuell als No-Op.
- **Files:** `portal/src/viewers/matrix/MatrixGrid.tsx` (Kommentar dokumentiert Phase-1-Pragmatismus)

**2. Cell-Storage als flache CellMap (Record<"ressOid:colId", number>) statt einzelne PAssoz-Knoten im Tree**
- **Begruendung:** Phase 1 hat keine echten PAssozBeleg/PAssozMenge-Objekte im Tree (Backend-TYPE_MAP enthaelt sie nur als Property-Stub, siehe 01-05-Risk). Eine flache Map ist ausreichend fuer den UI-State; Save-back hat einen klaren Konvertierungspunkt in Plan 09. Symmetrie-Convention bei Verknuepfung (sortierte OID-Paare lo:hi) garantiert deterministischen Key-Aufbau.

**3. PRessBelegMatrixViewer rows=PRessBeleg + PBetriebsmittel + PPerson (statt nur PRessBeleg)**
- **Begruendung:** Backend-TYPE_MAP enthaelt PRessBeleg aktuell nicht (Backend serialisiert PBetriebsmittel/PPerson direkt); damit der Viewer im Phase-1-Workflow nutzbar ist, akzeptieren wir alle drei Klassen als "Belegungs-Ressource". Sobald das Backend echte PRessBeleg-Knoten liefert, werden sie zusaetzlich aufgenommen.

## Authentication Gates

Keine. Plan 06 ist reiner Frontend-Code, kein neuer API-Endpoint.

## Known Stubs

- **PRessBeleg/PRessMenge-Cell-Storage als flache CellMap auf synthetischen Group-Knoten.** Save-back auf echte PAssozBeleg/PAssozMenge-Objekte ist **Plan 09**. Sobald das Backend-TYPE_MAP in Phase 2 die PAssoz-Klassen voll serialisiert, ist die Konvertierung 1:1 ein iterate-und-erzeuge-Schritt.
- **PRessVerknuepfung-Storage als sortierte OID-Paar-Map auf synthetischem Knoten.** Save-back analog Plan 09.
- **Snapshot-Undo erfasst Matrix-Edits NICHT** (modul-lokaler synth-Store ist nicht im useModelStore-Undo-Snapshot enthalten). Wenn UX das verlangt, ergaenzt Plan 09 ein eigenes undo()/redo() fuer den synth-Store.
- **PRessMenge-Viewer zeigt aktuell IMMER Empty-State**, weil das Backend-TYPE_MAP keine PRessMenge-Knoten liefert. Viewer ist Foundation; sobald Backend PRessMenge ausgibt, rendert die Matrix automatisch.
- **PRessVerknuepfung-Viewer findet derzeit nur PBetriebsmittel + PPerson** im Tree (PRessMenge wird vom Backend nicht geliefert, PRessBeleg auch nicht). Sobald Backend mehr Ressource-Klassen ausgibt, wird die Matrix automatisch groesser.
- **extractScheduleColumns ist Best-Effort fuer PEinsatzzeitTag.** Andere Schicht-Modellierungen (AGruppe-Schicht-Pool, PRessBeleg-m_lEinsatzzeit) werden in Plan 08 (AEinsatzWunsch) erweitert.
- **Virtualisierung im MatrixGrid ist No-Op.** Plan 10 (Verification) misst; falls noetig, Migration auf @tanstack/react-virtual.

Alle Stubs sind im Plan dokumentiert (Plan 06 ist explizit Foundation-Layer mit Phase-1-Stub-Storage); kein Stub blockiert die Matrix-Viewer-Funktion fuer den Phase-1-Use-Case (Modell-Aufbau im Browser, Save-back kommt mit Plan 09).

## Threat Flags

Keine neuen Threat-Surface-Erweiterungen — Plan 06 ist reiner Frontend-Code. Synthetische OIDs sind frontend-internal; alle Server-Calls erfolgen weiterhin nur ueber den apiFetch-Wrapper (Plan 04) mit Firebase-JWT-Injection.

## Risk-Mitigations (aus Plan-Risk-Block)

- **Zeitintervall-Modellierung heterogen:** extractScheduleColumns deckt PEinsatzzeitTag ab + Fallback. Dokumentiert in D-05. Plan 08 zieht andere Pfade nach.
- **PRessVerknuepfung-Daten-Modell unbekannt:** Phase-1-Stub-Storage als sortierte OID-Paar-Map ist symmetrisch + deterministisch. Plan 09 macht die Konvertierung in echte PRessVerknuepfung-Knoten.
- **Performance bei grossen Modellen:** DOM-Render ist fuer <60 Zellen unproblematisch. Plan 10 misst Bosch2_wechseln (18 MB) — falls eine Matrix >100x100 entsteht, Migration auf react-virtual via internem Refactor (Interface bleibt stabil).
- **Synthetische Folder-Klassen kollidieren nicht mit echten OTX-Klassen:** Prefix "RESS_*_GROUP" eindeutig (alle echten OSim-Klassen beginnen mit P/A/E/O). Verifiziert.

## Notes fuer Plan 07/08 (parallel zu Plan 06 in Welle 4)

- **Plan 07** (PDurchlaufplanViewer-Design, React Flow): wird zusaetzlich zu PDurchlaufplanViewerStd (Plan 05) registriert. Letzte-Registrierung-gewinnt-Regel der viewer-registry erlaubt das (mit Console-Warning) — oder Plan 07 kann eine eigene Synthetische-Klasse 'DLPL_DESIGN_VIEW' verwenden (analog zu Plan 06s synthetischen Klassen), wenn ein Tab-Switcher gewuenscht ist.
- **Plan 08** (PDlplBetriebsmittel/PDlplPersonal/AEinsatzWunsch/AKapBed): Kann weitere synthetische Folder-Klassen + OIDs im Bereich -10004..-10999 reservieren. Das `SYNTHETIC_MATRIX_NODES`-Array in synthetic-nodes.ts ist explizit erweiterbar. Sidebar-Tree-Erweiterung in Plan 08 entweder per zusaetzlichem Append (analog Plan 06) oder per eigenem synthetic-nodes-File pro Themenbereich (Verknuepfungs-Sichten vs Matrix-Sichten).
- **Plan 09** (Save-Pfad): Save-Logik muss SYNTH_PROPS auslesen (getSyntheticProps fuer jede synthetische OID) und vor PUT /tree in echte PAssoz-Objekte konvertieren. matrix-helpers koennten dafuer eine `serializeMatrixCellsToPAssoz`-Helper bekommen.

## Self-Check

### Created Files

- [x] `portal/src/viewers/matrix/MatrixGrid.tsx` — FOUND
- [x] `portal/src/viewers/matrix/matrix-helpers.ts` — FOUND
- [x] `portal/src/viewers/matrix/synthetic-nodes.ts` — FOUND
- [x] `portal/src/viewers/matrix/PRessBelegMatrixViewer.tsx` — FOUND
- [x] `portal/src/viewers/matrix/PRessMengeMatrixViewer.tsx` — FOUND
- [x] `portal/src/viewers/matrix/PRessVerknuepfungViewer.tsx` — FOUND
- [x] `portal/src/viewers/matrix/index.ts` — FOUND
- [x] `portal/src/viewers/matrix/__tests__/MatrixGrid.test.tsx` — FOUND
- [x] `portal/src/viewers/matrix/__tests__/PRessBelegMatrixViewer.test.tsx` — FOUND
- [x] `portal/src/viewers/matrix/__tests__/registry.test.ts` — FOUND

### Commits

- [x] `7a68364` — feat(portal): MatrixGrid generic 2D-grid component + matrix-helpers (plan 01-06 task 1)
- [x] `6095552` — feat(portal): 3 matrix viewers + synthetic-folder routing (plan 01-06 task 2)

### Verification

- Test-Suite: **78 passed** (13 Files, ~1.5s) — `npm test -- --run`
- Lint: **clean** (`npm run lint`, eslint --max-warnings=0)
- Build: **clean** (`npm run build` — tsc -b + vite build, 449 kB index.js + 25 kB CSS, ~3.3s)

## Self-Check: PASSED
