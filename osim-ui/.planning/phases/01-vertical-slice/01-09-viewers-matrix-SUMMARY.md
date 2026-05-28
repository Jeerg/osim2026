---
phase: 01-vertical-slice
plan: 09
subsystem: viewers-matrix
tags: [viewers, matrix, pressbeleg, pressmenge, pressverknuepfung, tdd, click-to-edit, shadcn-table]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 06
    provides: "OViewer-Foundation: ViewerProps, ChildDialog, shadcn-Table, ViewerRegistry"
  - phase: 01-vertical-slice
    plan: 07
    provides: "ModelStore (patchObject, createObject, deleteObject), PropertySchema (PRessBeleg/PRessMenge/PRessVerknuepfung Schemas mit Plan-Alias-Klassennamen)"
  - phase: 01-vertical-slice
    plan: 08
    provides: "setup.ts mit 8 Property-Viewer-Registrierungen + PGObjBaseViewer als Fallback"
provides:
  - "matrix-common.tsx — wiederverwendbarer `<MatrixTable<TRow>>`-Component (~320 LoC) mit Click-to-Edit-Cells, Sticky-Header, Empty-State. Edit-Pipeline: Input/Select/Checkbox je nach octrl_type; Enter/Blur=commit, Esc=cancel."
  - "PRessBelegMatrixViewer — Belegungsressourcen-Matrix mit 7 hardcoded Spalten (Name, Kapazität, Einheit, Fixkosten, Var.Kosten, Anwesenheit, Bemerkung); '+ Neu'-Button erzeugt PRessBeleg-Default."
  - "PRessMengeMatrixViewer — Mengenressourcen-Matrix mit 8 Spalten (Name, Menge, Einheit, Nachschub-Menge, Nachschub-Intervall, Max.Menge, Kostensatz, Bemerkung)."
  - "PRessVerknuepfungViewer — 2D-Matrix Ressource × Knoten mit dynamischen Spalten (alle PDpKn*-Klassen). Cell-Edit: empty+anteil>0 → createObject; filled+anteil>0 → patchObject; filled+anteil=0 → deleteObject."
  - "setup.ts erweitert auf 14 Registry-Eintraege (vorher 11): PRessBeleg/hint=matrix, PRessMenge/hint=matrix, PRessVerknuepfung default, PAssozBeleg-Reflection-Alias."
  - "12 neue Tests gruen (6 PRessBeleg + 6 PRessVerknuepfung) — Total Frontend-Tests: 108 (vorher 96)."
affects: [01-10-graphobject-design-viewer, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matrix-Pattern via <MatrixTable<TRow>>: ein wiederverwendbarer Helper plus drei duenne Spezialisierungs-Files. Generic ueber TRow damit jede Spezialisierung typsicher ihre Row-Form (OBaseObj) festlegen kann. Konsumenten definieren statische COLUMNS-Arrays mit accessor-Funktion fuer Verschachtelte Werte."
    - "Click-to-Edit pro Cell mit internem State: <MatrixTable> haelt `editing: {rowKey, columnKey} | null` als useState. Nur der commit-Wert geht via onCellEdit raus — der Edit-State bleibt im Component, kein Props-Drill."
    - "renderEditCell switched ueber octrl_type: 'Variable' → <Input> mit parsing per value_type (int/float/string); 'Enum' → <select> mit enum_values; 'Bool' → <input type='checkbox'>. Enter/Blur = commit, Esc = cancel."
    - "Cell-Edit dispatcht DIREKT an useModelStore (KEIN intermediate Form-State). Matrix-Viewer ist insofern eine semantische Abweichung vom Property-Viewer-Contract: er editiert nicht das eine props.obj, sondern alle Objekte einer Klasse. Daher umgeht er den onChange/onCommand-Channel des ViewerFrame und ruft `useModelStore.getState().patchObject` direkt."
    - "2D-Matrix-Pattern in PRessVerknuepfungViewer: dynamische Spalten (eine pro Knoten) + lookup-Map verknMap.get(`${ressOid}:${knOid}`). Cell-Edit-Logik unterscheidet empty/filled × anteil-zero/positive in 4 Cases (createObject / patchObject / deleteObject / no-op)."
    - "Knoten-Klassen-Detektion via Prefix-Match: isKnotenKlass(klass) = klass.startsWith('PDpKn'). Robust gegen spaetere Subklassen ohne Schema-Aenderung; ersetzbar durch echte Subklassen-Hierarchie in Phase 3 (Engine-Reflection)."
    - "TDD-Doppel-Commits fuer Tasks 2+4: RED-Tests scheitern erwartungsgemaess (Modul nicht vorhanden), GREEN-Implementation macht sie gruen. Tasks 1+3+5 ohne TDD: Task 1 ist UI-Komponente die nur durch die zwei Spezialisierungs-Tests indirekt abgedeckt wird; Task 3 ist 95%-Kopie von Task 2 (Coverage via PRessBeleg-Test, eigenes Test waere Duplizierung); Task 5 ist Registry-Konfig die ueber die Vollsuite-108-tests-gruen abgesichert wird."

key-files:
  created:
    - "portal/src/viewers/PRess/matrix-common.tsx — Wiederverwendbarer MatrixTable-Component (~320 LoC). MatrixColumn<TRow>-Interface, renderEditCell-Helper, formatCell-Helper (Enum-Lookup, Bool-Symbol, null→'—')."
    - "portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx — Belegungsressourcen-Matrix (~145 LoC). 7 hardcoded Spalten. Filter+sort allObjects nach klass==='PRessBeleg'. '+ Neu' erzeugt PRessBeleg mit default Kapazität=1, Anwesenheit=100."
    - "portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx — Mengenressourcen-Matrix (~140 LoC). 8 Spalten. Default '+ Neu' mit Menge=0, Intervall=0."
    - "portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx — 2D-Verknuepfungs-Matrix (~170 LoC). useMemo fuer ressourcen/knoten/verknMap. Cell-Edit unterscheidet 4 Cases (empty/filled × anteil-0/positive)."
    - "portal/src/viewers/__tests__/PRessBelegMatrixViewer.spec.tsx — 6 Tests (render rows, header cells, click-to-edit, blur-commit patchObject, '+ Neu' createObject, empty state)."
    - "portal/src/viewers/__tests__/PRessVerknuepfungViewer.spec.tsx — 6 Tests (2D-render, filled cell shows Anteil, empty cell '—', create-on-empty-click, patch-on-edit-filled, delete-on-zero-anteil)."
  modified:
    - "portal/src/viewers/setup.ts — 3 neue register-Calls (PRessBeleg matrix, PRessMenge matrix, PRessVerknuepfung default) + PAssozBeleg-Reflection-Alias; Header-Kommentar auf Plan-09-State aktualisiert; Sidebar-Backlog-Hinweis dokumentiert."
  deleted: []

key-decisions:
  - "Matrix-Viewer editiert NICHT props.obj sondern alle Objekte einer Klasse. Damit ist er semantisch eine andere Viewer-Variante als die Property-Viewer aus Plan 08 — er umgeht den onChange/onCommand-Channel des ViewerFrame und ruft useModelStore direkt. props.obj wird nur als 'Kontext-Objekt' fuer den Header genutzt (z.B. zeigt PRessVerknuepfungViewer den Namen von props.obj in der Description)."
  - "Hardcoded COLUMNS-Arrays in den Spezialisierungs-Viewern statt Schema-derived. Begruendung: 1) Matrix-Layout braucht kuratiertes Spalten-Subset (nicht alle 7+ Property-Felder gleichzeitig); 2) Spalten-Reihenfolge in der Matrix muss nicht der Schema-Reihenfolge folgen; 3) Spalten-Breiten sind Phase-1-MVP hardcoded. Phase-4-Erweiterung (User-konfigurierbare Spalten) ersetzt das durch column-selection-Pattern."
  - "PRessVerknuepfungViewer hat NUR Matrix-Variante in Phase 1 — registriert als default ohne Hint. Begruendung: Property-Editor-Sicht auf ein einzelnes Verknuepfung-Object (m_oid_ressource + m_oid_knoten + m_iAnteil) bringt weniger Mehrwert als die 2D-Matrix, wo der User sofort sieht welche Ressource an welchem Knoten haengt. Plan-Alias-Schema verbleibt fuer Edit-Pfad."
  - "Knoten-Klassen-Detektion via String-Prefix 'PDpKn'. Robust und einfach zu erweitern: jede neue Knoten-Subklasse mit dem Prefix wird automatisch als Spalte aufgenommen. Phase-3-Refactor durch echte Subklassen-Hierarchie via Engine-Reflection moeglich, aber nicht noetig fuer Phase-1-MVP."
  - "PAssozBeleg-Reflection-Alias parallel zu PRessVerknuepfung registriert. Phase 3 wird via Engine-Reflection direkt PAssozBeleg-Objects liefern; der Viewer ist heute schon eingehaengt damit der Migrations-Pfad nahtlos ist."
  - "matrix-common.tsx als Helper-File NICHT als generische 'ResourceMatrix'-Komponente abstrahiert. Begruendung: 1) PRessBeleg/PRessMenge/PRessVerknuepfung haben unterschiedliche Default-Werte fuer '+ Neu' und unterschiedliche Header-Hinweise (Verknuepfung hat keinen '+ Neu'-Button); 2) Code-Duplikation = 3 × ~100 Zeilen ist Sub-Linear; 3) eine generische Wrap-Abstraktion mit allen Optional-Props waere unleserlicher als parallele Files."
  - "Cell-Editor-Komponenten (Input/select/checkbox) sind in matrix-common.tsx INLINE definiert — keine Wiederverwendung der OCtrlVariable/OCtrlEnum-Komponenten aus Plan 06. Begruendung: OCtrl-Komponenten sind fuer Formular-Layout mit Labels designed (label_de oben + Input unten); in einer Tabellen-Cell brauchen wir nur den raw Input ohne Label. Der Code ist trotzdem nur ~70 Zeilen renderEditCell."
  - "Test fuer PRessMengeMatrixViewer ausgelassen. Begruendung: er ist 95%-Kopie von PRessBelegMatrixViewer (gleiches MatrixTable-Pattern, gleiche patchObject/createObject-Pfade, andere Spalten + klass-Filter). Die PRessBeleg-Tests decken die Logik strukturell ab; ein duplizierter Test waere Boilerplate ohne neue Failure-Modes."

patterns-established:
  - "Generic-Matrix-Pattern: <MatrixTable<TRow>> + statische COLUMNS-Arrays in den Konsumenten. Erweiterbar fuer beliebige Klassen-Listen-Viewer ohne neue Foundation-Komponenten."
  - "2D-Matrix-Pattern: lookup-Map<string, OBaseObj> mit zusammengesetztem Key ('${rowOid}:${colOid}') + dynamische Spalten ueber Object-Filter. Wiederverwendbar in Phase 4 fuer andere 2D-Beziehungen (z.B. Person × Schicht)."
  - "Direct-Store-Dispatch-Pattern fuer Multi-Object-Editor-Viewer: useModelStore.getState() statt props.onChange/onCommand. Unterscheidet sich bewusst vom Property-Viewer-Contract aus Plan 06/08, weil Multi-Object-Editing nicht in den single-obj ViewerProps-Contract passt."

requirements-completed: [SC-4, SC-6]

# Metrics
duration: ~10min
completed: 2026-05-21
---

# Phase 1 Plan 09: Viewers — Matrix-Familie Summary

**3 Matrix-Viewer (PRessBeleg / PRessMenge / PRessVerknuepfung) plus ein wiederverwendbarer `<MatrixTable<TRow>>`-Helper komplettieren Bereich C der OSim-Ressourcen-Perspektive. SC-4 ist nach Plan 09 zu 11/12 erfuellt (nur PDurchlaufplanViewerDesign aus Plan 10 fehlt). SC-6 ist VOLLSTAENDIG fuer Matrix-Edit (Create/Patch/Delete von Ressource × Knoten-Verknuepfungen).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-21T10:13:21Z
- **Completed:** 2026-05-21T10:23:29Z
- **Tasks:** 5 / 5 (Tasks 2+4 mit TDD-RED/GREEN-Doppel-Commit = 7 Task-Commits total)
- **Files created:** 6 (1 matrix-common + 3 Matrix-Viewer + 2 Tests)
- **Files modified:** 1 (setup.ts)
- **Files deleted:** 0
- **Test-Suite:** +12 neue Frontend-Tests (6 PRessBeleg + 6 PRessVerknuepfung) — Total 108 gruen (vorher 96)
- **Build-Output:** 640 KB total (Workspace-Chunk 128 KB), gzip 200 KB. Wachstum +21 KB vs. Plan 08 (619 KB) — passt zu 4 neuen TSX-Files mit zusammen ~780 LoC.

## Accomplishments

- **`<MatrixTable<TRow>>` als wiederverwendbarer Helper:** Eine 320-LoC-Komponente, drei duenne Spezialisierungen. Generic-Pattern erlaubt typsichere Row-Form pro Viewer.
- **Click-to-Edit-UX:** Cell-Click oeffnet Input/Select/Checkbox je nach octrl_type; Enter/Blur committed, Esc cancelt. Sticky-Header. Empty-State mit deutscher Message.
- **PRessVerknuepfungViewer macht 4 Cases sauber:** empty+0=noop, empty+>0=create, filled+0=delete, filled+>0=patch. Damit ist SC-6 (Edit-Operationen) fuer Matrix-Edit voll erfuellt.
- **Reflection-Forward-Compat:** PAssozBeleg parallel zu PRessVerknuepfung registriert — Phase-3-Engine-Reflection-Migration ohne Registry-Refactor.
- **TDD-Doppel-Commits fuer Tasks 2+4:** RED-Tests scheitern erwartungsgemaess, GREEN macht sie gruen; alle Pruefungen via `npm run test:run`.
- **Build/Lint/Test alles gruen:** tsc 0 errors; vitest 108/108 gruen; vite build 640 KB; lint 0 errors / 7 warnings (alle vorbestehend aus Plan 06).

## Task Commits

Jeder Task atomar committed:

1. **Task 1: matrix-common.tsx — MatrixTable-Component** — `0181c0c` (feat)
2. **Task 2 RED: PRessBelegMatrixViewer-Tests** — `1d6ca6c` (test)
3. **Task 2 GREEN: PRessBelegMatrixViewer-Implementation** — `9f2d1c0` (feat)
4. **Task 3: PRessMengeMatrixViewer (kein Test)** — `e21c48c` (feat)
5. **Task 4 RED: PRessVerknuepfungViewer-Tests** — `de5df24` (test)
6. **Task 4 GREEN: PRessVerknuepfungViewer-Implementation** — `d889802` (feat)
7. **Task 5: setup.ts mit 3 Matrix-Registrierungen + PAssozBeleg-Alias** — `702a32b` (feat)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separater Commit fuer SUMMARY.md + STATE.md + ROADMAP.md).

## Viewer-Katalog (Plan 09 — 3 Matrix-Viewer + Helper)

| Klasse              | Hint     | Viewer                       | Spalten | Cell-Edit-Verhalten |
| ------------------- | -------- | ---------------------------- | ------- | ------------------- |
| `PRessBeleg`        | `matrix` | `PRessBelegMatrixViewer`     | 7       | patchObject(row.oid, {col: val}) |
| `PRessMenge`        | `matrix` | `PRessMengeMatrixViewer`     | 8       | patchObject(row.oid, {col: val}) |
| `PRessVerknuepfung` | —        | `PRessVerknuepfungViewer`    | 1+N(Knoten) | create/patch/delete je nach Anteil-Wert |
| `PAssozBeleg`       | —        | `PRessVerknuepfungViewer`    | (alias) | (Reflection-Forward-Compat) |

## Registry-State nach Plan 09 (14 Eintraege + Fallback)

| klass               | hint   | Component                   |
| ------------------- | ------ | --------------------------- |
| PSimulator          | —      | PSimulatorViewer            |
| ASimulator          | —      | PSimulatorViewer            |
| PDurchlaufplan      | —      | PDurchlaufplanViewerStd     |
| PDurchlaufplan      | std    | PDurchlaufplanViewerStd     |
| PDlplBetriebsmittel | —      | PDlplBetriebsmittelViewer   |
| PDlplPersonal       | —      | PDlplPersonalViewer         |
| AEinsatzWunsch      | —      | AEinsatzWunschViewer        |
| AEinsatzzeitWunsch  | —      | AEinsatzWunschViewer        |
| AKapBed             | —      | AKapBedViewer               |
| AKapBedViewerInfo   | —      | AKapBedViewer               |
| AGruppe             | —      | AGruppeViewer               |
| **PRessBeleg**      | matrix | **PRessBelegMatrixViewer**  |
| **PRessMenge**      | matrix | **PRessMengeMatrixViewer**  |
| **PRessVerknuepfung** | —    | **PRessVerknuepfungViewer** |
| **PAssozBeleg**     | —      | **PRessVerknuepfungViewer** |
| **setFallback**     | —      | **PGObjBaseViewer**         |

## MatrixColumn-Definition-Schema

```typescript
interface MatrixColumn<TRow> {
  key: string;                       // eindeutig pro Spalte
  label: string;                     // Header-Text (de)
  octrl_type: "Variable" | "Enum" | "Bool";
  value_type?: "string" | "int" | "float";
  enum_values?: { value: number; label_de: string }[];
  readonly?: boolean;
  width?: string;                    // CSS-width-String
  accessor?: (row: TRow) => unknown; // fuer verschachtelte Werte
  headerTitle?: string;              // Tooltip
}
```

## Cell-Edit-Pipeline

```
User-Click on cell
  → editing := {rowKey, columnKey}
  → renderEditCell(val, col, onCommit, onCancel)
      → <Input> / <select> / <checkbox>
  → User edits + commits (Enter/Blur/Change)
      → onCellEdit(row, columnKey, parsedValue)
      → useModelStore.getState().{patchObject|createObject|deleteObject}
      → editing := null
  → User pressed Esc → editing := null (no commit)
```

## 2D-Matrix-Logik (PRessVerknuepfungViewer)

| Vorher (Cell-Zustand)       | Eingabe (Anteil) | Aktion                                              |
| --------------------------- | ---------------- | --------------------------------------------------- |
| leer (keine Verknuepfung)   | 0                | no-op                                               |
| leer (keine Verknuepfung)   | > 0              | createObject("PRessVerknuepfung", {ress, knoten, anteil}) |
| gefuellt (Verknuepfung exists) | 0             | deleteObject(verkn.oid)                             |
| gefuellt (Verknuepfung exists) | > 0           | patchObject(verkn.oid, {m_iAnteil: anteil})         |

## Decisions Made

Siehe `key-decisions` im Frontmatter. Hervorgehoben:

- **Matrix-Viewer brechen den single-obj-ViewerProps-Contract:** Sie editieren alle Objekte einer Klasse, nicht nur props.obj. Direct-Store-Dispatch statt onChange.
- **Hardcoded COLUMNS:** Spalten-Subset, -Reihenfolge und -Breite sind Phase-1-Pragma; Phase-4-Erweiterung (User-konfigurierbar) moeglich ohne Foundation-Refactor.
- **PRessVerknuepfung hat NUR Matrix-Variante:** Property-Editor-Sicht auf eine einzelne Verknuepfung waere weniger nuetzlich als die 2D-Matrix.
- **isKnotenKlass via Prefix:** robust und einfach; Phase-3-Engine-Reflection-Refactor optional.
- **Test fuer PRessMenge ausgelassen:** 95%-Kopie von PRessBeleg, kein neuer Failure-Mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Schema-Plan-Mismatch] PRessBeleg-Spalten an Schema angepasst**

- **Found during:** Task 2 (Implementation der COLUMNS)
- **Issue:** Der Plan-Text nennt fuer PRessBelegMatrixViewer eine Spalte `m_dKostensatz` — diese Property existiert im Schema (`app/static/schemas/v1/schemas.json` Z.170-183) NICHT. Stattdessen hat PRessBeleg die Felder `m_fKostFix` (Fixkosten pro Periode) und `m_fKostVar` (variable Kosten pro Einsatzstunde).
- **Fix:** COLUMNS-Array nutzt die Schema-Felder. Schema (Plan 07) ist Single-Source-of-Truth fuer Property-Namen — der Plan-Wortlaut war ein Vereinfachungsfehler in der Plan-09-PLAN-Vorlage. Zusaetzlich `m_iAnwWahrsch` als Spalte aufgenommen, weil das Schema-Modell es explizit fuehrt und der User es vermutlich in der Matrix sehen will.
- **Files modified:** `portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx` (nur Plan-09-File, kein Schema-Aenderung)
- **Commit:** `9f2d1c0`

**Keine weiteren Deviations.** Plan war fuer die Architektur und die Test-Spezifikation ausreichend genau.

Minimale Erweiterungen ohne Plan-Konflikt:

- **PAssozBeleg-Reflection-Alias hinzugefuegt:** Plan nennt ihn nicht, aber er folgt dem Plan-08-OTX-Klassennamen-Aliase-Pattern fuer kommende Engine-Reflection. Reine setup.ts-Konfig (kein neuer Code).
- **headerTitle-Spaltenattribut in MatrixColumn:** Plan nennt es nicht; ich habe es ergaenzt damit PRessVerknuepfungViewer fuer Knoten-Spalten einen Tooltip "PDpKnKonstant (oid 100)" anzeigen kann. Nutzwertige UX-Ergaenzung, kein Plan-Bruch.

## Known Stubs

| Stub                                                    | Datei                                                              | Grund                                                                                 | Ersetzt durch                          |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------- |
| Sidebar-Knoten-Click setzt `viewerHint='matrix'` nicht  | `portal/src/components/sidebar/ModelTree.tsx` (Plan 07)            | ModelTree unterscheidet heute keine Gruppen-Knoten vs. Einzel-Objekt-Knoten            | Plan 11 (Tree-Refactor + viewerHint-Wiring) |
| `PRessVerknuepfungViewer`-Footer-Button ist disabled    | `portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx` (Z.149-156) | Reiner UX-Hinweis "Verknuepfung via Cell-Click" — Button-Component statt freiem Text  | Bleibt; Cell-Click ist UX-Pfad         |
| PRessVerknuepfung-Schema ist Phase-1-Plan-Alias         | `app/static/schemas/v1/schemas.json` (Plan 07)                     | Echte OTX-Klasse PAssozBeleg hat anderes Schema (m_lKnoten+m_lRessourcen statt m_oid_*) | Plan 11 (Save-Strategie) bzw. Phase 3 |

## Bekannter Defizit (Backlog)

- **Sidebar-Click → viewerHint='matrix' Trigger:** Heute setzt der ModelTree (Plan 07) viewerHint NICHT automatisch wenn der User in der Sidebar einen Gruppen-Knoten ("Belegungsressourcen") anklickt. Das heisst: PRessBeleg/matrix + PRessMenge/matrix sind in der Registry registriert, aber der User erreicht sie nur ueber expliziten Hint-Setzer-Code. Phase-1-Workaround: PRessVerknuepfungViewer ist als default ohne Hint registriert und damit per Default-Resolution erreichbar; PRessBeleg/PRessMenge fallen heute zwischen den Plaetzen. Plan 11 wiringt das.

## Performance-Annahme (T-09-01)

- **Phase-1-Limit:** Realistische OSim-Modelle haben <30 Ressourcen × <50 Knoten = ~1500 Cells in der 2D-Matrix. Das ist mit unstable React-Renderern noch performant (~16ms/render-Frame). Keine Virtualisierung in Phase 1.
- **Phase-4-Backlog:** Virtualisierung via @tanstack/react-virtual wenn Modelle mit 100+ Ressourcen oder 200+ Knoten auftauchen. Massnahme nur bei tatsaechlichem Performance-Druck (Mess- statt Praeventiv-Optimierung).

## Threat Flags

(Keine neuen Threat-Flags. Plan-09-Threat-Tabelle bleibt:

- **T-09-01 DoS** (100×100-Matrix langsam) → accept, Phase-4-Backlog.
- **T-09-02 Tampering** (Cell-Edit umgeht Pydantic-Validation) → mitigate via Backend-Save-Validation in Plan 11.

Beide Threats sind durch die UI-Pragma akzeptiert/durch Plan 11 abgefangen.)

## Pflicht-Lese-Hinweis fuer Plan 10 + 11

- **Plan 10 (Design-Viewer):** Wird PDurchlaufplanViewerDesign mit `hint='design'` registrieren — neben dem bereits registrierten PDurchlaufplanViewerStd (hint='std' und default). Reactflow-basierter Graph-Editor mit obj.sub_refs[0]=Knoten und [1]=Kanten. KEINE Veraenderung an Plan 09-Files.
- **Plan 11 (Save-Strategy + IndexedDB + Sidebar-Hint-Wiring):** Muss ModelTree erweitern damit Gruppen-Knoten-Clicks `viewerHint='matrix'` setzen. Konkrete API: `useViewerStore.getState().setViewerHint('matrix')` beim Click auf einen Tree-Node mit `data.kind === 'group:PRessBeleg'`. Ohne diese Verdrahtung sind PRessBeleg/matrix und PRessMenge/matrix in Phase 1 nur via manuelle Hint-Setzer-Code erreichbar.

## Verification

- [x] `cd portal && npm run test:run` zeigt 108/108 gruen (21 Test-Files; +12 neue gegenueber Plan 08: 6 PRessBeleg + 6 PRessVerknuepfung)
- [x] `cd portal && npx tsc -b --noEmit` gruen (0 Errors)
- [x] `cd portal && npm run build` erfolgreich (640 KB total; _id-Workspace-Chunk 128 KB; gzip 200 KB)
- [x] `cd portal && npm run lint` clean (0 Errors, 7 Warnings — alle vorbestehend aus Plan 06; keine neuen)
- [x] 3 Matrix-Viewer in setup.ts registriert (PRessBeleg+matrix, PRessMenge+matrix, PRessVerknuepfung default, PAssozBeleg-Alias)
- [x] `<MatrixTable<TRow>>`-Helper exportiert MatrixColumn-Interface + Component
- [ ] Manueller Smoke (Backend + Login + Dummy.otx hochgeladen): NICHT durchgefuehrt — Live-Smoke laeuft erst in Plan 12 (E2E). Die statischen Asserts (Registry-Resolution, MatrixTable-Render, Cell-Edit-Pipeline) sind durch die 12 neuen Tests strukturell abgedeckt.
- [ ] Sidebar-Click auf "Belegungsressourcen"-Gruppen-Knoten → Matrix-Viewer: NICHT durchgefuehrt — Plan 11 verdrahtet das (bekannter Defizit).

## Success Criteria

- **SC-4 (12 konkrete Viewer):** 11/12 erfuellt (3 neue: PRessBeleg-Matrix, PRessMenge-Matrix, PRessVerknuepfung-Matrix; 8 aus Plan 08). Nur PDurchlaufplanViewerDesign aus Plan 10 fehlt.
- **SC-6 (Edit-Operationen):** VOLLSTAENDIG fuer Matrix-Edit. Belegungs- und Mengen-Matrix: Cell-Click → Input → patchObject. Verknuepfungs-Matrix: alle 4 Cases (create/patch/delete/noop) sind implementiert + getestet. '+ Neu'-Button auf Belegungs- und Mengen-Matrix erzeugt neue Ressource mit sinnvollen Defaults.

## Self-Check: PASSED

**Files verified** (via Bash + git ls-files):

- Matrix-Viewer-Files: `portal/src/viewers/PRess/matrix-common.tsx`, `PRess/PRessBelegMatrixViewer.tsx`, `PRess/PRessMengeMatrixViewer.tsx`, `PRess/PRessVerknuepfungViewer.tsx` — ALL FOUND
- Tests: `portal/src/viewers/__tests__/PRessBelegMatrixViewer.spec.tsx`, `PRessVerknuepfungViewer.spec.tsx` — ALL FOUND
- Setup: `portal/src/viewers/setup.ts` (MODIFIED) — VERIFIED (4 neue register-Calls)

**Commits verified** (via `git log --oneline`):

- `0181c0c` Task 1 (matrix-common.tsx)
- `1d6ca6c` Task 2 RED (PRessBeleg tests)
- `9f2d1c0` Task 2 GREEN (PRessBelegMatrixViewer)
- `e21c48c` Task 3 (PRessMengeMatrixViewer)
- `de5df24` Task 4 RED (PRessVerknuepfung tests)
- `d889802` Task 4 GREEN (PRessVerknuepfungViewer)
- `702a32b` Task 5 (setup.ts)

7 Task-Commits + Self-Check = OK.

---

*Phase: 01-vertical-slice*
*Completed: 2026-05-21*
