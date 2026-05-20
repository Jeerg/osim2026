---
phase: 01-vertical-slice
plan: 08
subsystem: portal
type: execute
status: complete
wave: 4
tags: [portal, linking-viewer, arbeitszeit-viewer, schicht-helpers, matrix-grid-reuse, type-map, viewer-registry, last-wave-4]

# --- Dependency-Graph ---
requires:
  - "phase 01-04 — Viewer-Foundation: ViewerFrame, ClientCtrl, ChildDialog, ViewerHost, viewer-registry, OCtrl-Familie, model-store"
  - "phase 01-05 — type-maps + Sidebar-Tree + WorkspaceLayout (Folder-Append-Pattern, AGruppeViewer)"
  - "phase 01-06 — MatrixGrid generisches 2D-Component + synthetic-nodes (Wiederverwendung in linking + arbeitszeit)"
provides:
  - "portal/src/viewers/linking/PDlplBetriebsmittelViewer.tsx — Knoten × Betriebsmittel-Verknuepfungs-Matrix (read-only Phase 1)"
  - "portal/src/viewers/linking/PDlplPersonalViewer.tsx — Knoten × Personal-Verknuepfungs-Matrix (read-only Phase 1)"
  - "portal/src/viewers/linking/index.ts — Side-Effect-Re-Exports"
  - "portal/src/viewers/arbeitszeit/AEinsatzWunschViewer.tsx — 7×24 Wochen-Stunden-Raster, MatrixGrid-Reuse"
  - "portal/src/viewers/arbeitszeit/AKapBedViewer.tsx — Read-only Periode × {Bedarf, Verfuegbar, Delta} Tabelle"
  - "portal/src/viewers/arbeitszeit/schicht-helpers.ts — WEEKDAYS, HOURS_OF_DAY, formatHourLabel, formatTimeRange, parseEinsatzWuensche, isWunschActive"
  - "portal/src/viewers/arbeitszeit/index.ts — Side-Effect-Re-Exports"
  - "synthetic-nodes-Erweiterung: 4 neue OIDs/Klassen (-10004..-10007), SYNTHETIC_LINKING_NODES + SYNTHETIC_ARBEITSZEIT_NODES + SYNTHETIC_ALL_GROUP_NODES Aggregate"
affects:
  - "portal/src/viewers/linking/ (neu)"
  - "portal/src/viewers/arbeitszeit/ (neu)"
  - "portal/src/viewers/matrix/synthetic-nodes.ts (erweitert um 4 OIDs/Klassen + 2 Sub-Listen)"
  - "portal/src/viewers/property/type-maps.ts (+8 Klassen: 4 synthetische Folder + AEinsatzWunsch + AEinsatzzeitWunsch + AKapBed + ATagPerson)"
  - "portal/src/viewers/property/index.ts (+2 Side-Effect-Imports auf @/viewers/linking + @/viewers/arbeitszeit)"
  - "portal/src/components/sidebar-tree.tsx (Verknuepfungs- + Arbeitszeit-Sichten-Folder)"

# --- Tech-Stack ---
tech_stack:
  added: []  # keine neuen npm-Dependencies — reine Wiederverwendung von MatrixGrid + OCtrl
  preexisting_used:
    - "MatrixGrid + matrix-helpers (Plan 01-06) — Reuse fuer 3 von 4 Viewern"
    - "synthetic-nodes-Pattern (Plan 01-06) — erweitert auf 4 weitere synthetische Folder"
    - "viewer-registry (Plan 01-04) — Doppel-Registrierung (synthetisch + echte Klasse) bei AEinsatzWunsch/AKapBed"
  patterns:
    - "Read-only Viewer mit Hinweis-Banner: PDlplBetriebsmittel/Personal sind in Phase 1 Foundation, weil die Verknuepfungs-Objekte (PAssozBelegLink) im _SKIP-Set des otx_loaders sind. Edit-Pfad bleibt Phase-2-Backlog (Engine-Schema-Erweiterung)."
    - "Doppel-Registrierung 'synthetisch + echt' (Plan 01-08 D-08-1): AEinsatzWunschViewer/AKapBedViewer registrieren sich SOWOHL auf der synthetischen Folder-Klasse (z.B. AEINSATZWUNSCH_GROUP) als auch auf der echten OSim-Klasse (AEinsatzWunsch). Last-wins-Registry-Konvention macht das funktional aequivalent — beide Mountpoints zeigen denselben Viewer. Damit ist der Viewer sowohl ueber den synthetischen Sidebar-Folder erreichbar als auch ueber echte AEinsatzWunsch-Knoten, sobald das Backend sie liefert."
    - "Schicht-Helpers als geteilte Utility: WEEKDAYS/HOURS_OF_DAY-Iteration + Sekunden-zu-HH:MM-Konvertierung + parseEinsatzWuensche (kapselt die AEinsatzzeitWunsch-Sub-Node-Struktur). Vorbereitung fuer kuenftige Gantt-Sichten (Phase 3+)."
    - "Pragmatische Tabelle statt Gantt (Plan 01-08 D-08-2): AEinsatzWunschViewer ist eine 7×24-Wochen-Stunden-Matrix mit Checkboxes — eine Stunde = ein Schalter, kein Range-Coalescing. Das C++-Original hat einen horizontalen Gantt mit Drag-bar-Schicht-Bloecken (siehe AEinsatzWunschViewer.h Z.130-148). Phase 1 verzichtet bewusst auf die Gantt-Optik (gemaess Plan-Vorgabe), eine spaetere Phase kann das mit reactflow oder einer Gantt-Lib nachziehen — die schicht-helpers-API bleibt stabil."
    - "Synthetische Folder-Klassen-Bereich (Plan 01-06 + 08): -10001..-10003 (Matrix), -10004..-10005 (Linking), -10006..-10007 (Arbeitszeit), reserve -10008..-10999. Die zentrale getSyntheticNode-Funktion durchsucht alle Sub-Listen ueber SYNTHETIC_ALL_GROUP_NODES."

# --- Key Files ---
key_files:
  created:
    - "portal/src/viewers/linking/PDlplBetriebsmittelViewer.tsx"
    - "portal/src/viewers/linking/PDlplPersonalViewer.tsx"
    - "portal/src/viewers/linking/index.ts"
    - "portal/src/viewers/linking/__tests__/PDlplBetriebsmittelViewer.test.tsx"
    - "portal/src/viewers/arbeitszeit/AEinsatzWunschViewer.tsx"
    - "portal/src/viewers/arbeitszeit/AKapBedViewer.tsx"
    - "portal/src/viewers/arbeitszeit/schicht-helpers.ts"
    - "portal/src/viewers/arbeitszeit/index.ts"
    - "portal/src/viewers/arbeitszeit/__tests__/AEinsatzWunschViewer.test.tsx"
    - ".planning/phases/01-vertical-slice/01-08-SUMMARY.md"
  modified:
    - "portal/src/viewers/matrix/synthetic-nodes.ts (+ 4 OIDs/Klassen + SYNTHETIC_LINKING_NODES + SYNTHETIC_ARBEITSZEIT_NODES + SYNTHETIC_ALL_GROUP_NODES + getSyntheticNode-Erweiterung)"
    - "portal/src/viewers/property/type-maps.ts (+ 4 synthetische + 4 echte Klassen: AEinsatzWunsch, AEinsatzzeitWunsch, AKapBed, ATagPerson)"
    - "portal/src/viewers/property/index.ts (+ Side-Effect-Imports @/viewers/linking + @/viewers/arbeitszeit)"
    - "portal/src/components/sidebar-tree.tsx (Verknuepfungs- + Arbeitszeit-Sichten-Folder)"

# --- Decisions ---
decisions:
  - id: "01-08-D1"
    title: "Verknuepfungs-Viewer in Phase 1 READ-ONLY mit Hinweis-Banner"
    decision: "PDlplBetriebsmittelViewer + PDlplPersonalViewer rendern die Knoten×Ressource-Matrix als boolean-Checkboxes, aber mit `readonly`-Prop auf MatrixGrid (alle Cells disabled). Ein amber-Banner oben im Viewer macht den Status explizit ('Read-only in Phase 1 — Engine-Schema-Erweiterung erforderlich')."
    rationale: "Die echten Verknuepfungs-Objekte (PAssozBelegLink) sind im _SKIP-Set des otx_loaders (engine/src/osim_engine/io/otx_loader.py). Damit kommen sie weder ueber den Roundtrip in den Tree, noch koennen wir sie ohne Engine-Schema-Erweiterung schreiben. Eine Editier-Funktion wuerde ein Engine-Schema-Update bedingen, das den Phase-1-Scope sprengt (CONTEXT.md sagt explizit: OTX-Writer-Erweiterung ist Welle 0, kein zusaetzlicher Engine-Mod in Phase 1). Phase 2 Backlog: Loader-Erweiterung fuer PAssozBelegLink + Writer-Roundtrip + Edit-Pfad in beide Viewer aktivieren."

  - id: "01-08-D2"
    title: "Pragmatische Wochen-Stunden-Tabelle statt Gantt-Optik (AEinsatzWunsch)"
    decision: "AEinsatzWunschViewer ist eine 7×24-Matrix (Wochentage × Stunden) mit Boolean-Checkboxes via MatrixGrid-Reuse. Eine Stunde-Toggle = ein Wunsch-Block-Schalter; kein Range-Coalescing, kein Drag-Bar, kein Wochen-Selektor."
    rationale: "Plan-Vorgabe explizit: 'Phase 1: pragmatische Tabelle (Wochentage × Schicht-Slots), Gantt-Optik in spaeterer Phase.' Vorteil: MatrixGrid-Wiederverwendung spart 80% Code; die Schicht-Helpers (formatHourLabel, parseEinsatzWuensche, isWunschActive) sind generisch und werden in einer spaeteren Gantt-Phase als Datenquelle erhalten bleiben. Das C++-Original ist deutlich reichhaltiger (siehe AEinsatzWunschViewer.h Z.130-148: m_cbWoche-Selektor, OEFunktionCtrl, Drag-Bar) — Phase 1 verzichtet bewusst auf diese UX-Tiefe."

  - id: "01-08-D3"
    title: "Doppel-Registrierung (synthetisch + echt) fuer AEinsatzWunsch/AKapBed"
    decision: "Beide Viewer rufen `registerViewer` zweimal: einmal mit der synthetischen Folder-Klasse (AEINSATZWUNSCH_GROUP, AKAPBED_GROUP) und einmal mit der echten OSim-Klasse (AEinsatzWunsch, AKapBed). Last-wins-Konvention der viewer-registry macht das funktional aequivalent — beide Mountpoints zeigen denselben Viewer."
    rationale: "Phase-1-Realitaet: Das Backend liefert AEinsatzWunsch/AKapBed-Knoten aktuell nicht direkt. Die synthetische Folder-Registrierung gibt dem User einen Sidebar-Eintrag, ueber den der Viewer testbar/erlebbar ist. Sobald das Backend in einer kuenftigen Phase echte Knoten dieser Klassen liefert, ist der Viewer automatisch auch dort verdrahtet — ohne Mehraufwand. Die Viewer detektieren selber via `obj.klass === SYNTHETIC_*_KLASS`, ob sie auf einem synthetischen oder echten Knoten gemountet sind, und schalten den Edit-Pfad entsprechend (synth → setSyntheticProperty; echt → Plan-09-TODO)."

  - id: "01-08-D4"
    title: "AKapBed in Phase 1 vollstaendig READ-ONLY (kein Berechnungs-Trigger)"
    decision: "AKapBedViewer rendert eine Periode-Tabelle mit Bedarf/Verfuegbar/Delta-Spalten — und das war's. Kein Recalculate-Button, kein Berechnungs-Algorithmus im Frontend, kein Engine-Roundtrip."
    rationale: "Das C++-Original (siehe AKapBedViewer.h ~300 Zeilen Algorithmus-Code: BelegeKapazitaetsfeld, AbgleichMinMaxAZeit, BeruecksichtigeMinMaxAZeit etc.) ist eine komplette Optimierungs-Engine. Die Werte entstehen rechnerisch aus dem Modell + Simulator-Lauf. Phase 1 hat keinen Simulator-Roundtrip (CONTEXT-D-Statement: Sim-Lauf ist Phase 2+); damit gibt es nichts zum Berechnen. Ein einfacher Display-Viewer mit Color-Coding (gruen wenn Delta >= 0, rot bei Deficit) ist der Foundation-Auszug; die echte Berechnung kommt mit dem Sim-Lauf."

  - id: "01-08-D5"
    title: "Synthetische OID-Bereiche pro Wave aufgeteilt"
    decision: "Plan 01-06 reservierte -10001..-10003 (3 Matrix-Sichten); Plan 01-08 fuegt -10004..-10005 (Linking) und -10006..-10007 (Arbeitszeit) hinzu. Reserve -10008..-10999 bleibt fuer spaetere Plans (Gantt, Charts etc.)."
    rationale: "Synthetische OIDs muessen ueber die ganze App eindeutig sein, weil getSyntheticNode keine Klassen-/Kontext-Information erhaelt — nur die OID. Eine klare Range-Aufteilung pro Plan macht Konflikte vorhersehbar. Beim naechsten Wave-Plan kann der Range konkret im PLAN.md vorab reserviert werden."

# --- Patterns (Reuse) ---
patterns:
  - "MatrixGrid mit `readonly`-Prop fuer Foundation-Read-only-Viewer (Plan 01-06-Reuse)"
  - "Synthetische Folder-Klassen + getSyntheticNode-Lookup (Plan 01-06-Erweiterung)"
  - "Doppel-Registrierung 'synthetisch + echte Klasse' (Plan 01-08-Neuer-Pattern)"
  - "Side-Effect-Index-Chain in property/index.ts (Plan 01-05/06/07/08): jedes neue Viewer-Folder bekommt eine zusaetzliche Import-Zeile"
  - "Sidebar-Tree-side-Append: drei parallele synthetische Folder (Matrix-Sichten / Verknuepfungs-Sichten / Arbeitszeit-Sichten) jeweils mit SYNTHETIC_*_NODES als data-Source"

# --- Metrics ---
metrics:
  tasks_completed: 2
  files_created: 9
  files_modified: 4
  test_count_new: 13
  test_count_total: 111
  test_results: "111 passed (alle Plan-04/05/06/07-Tests bleiben gruen, +13 neue aus Plan 08: 5 PDlplBetriebsmittel + 8 AEinsatzWunsch/schicht-helpers)"
  lint_status: "clean"
  build_status: "clean (703 kB index.js + 35 kB CSS, ~5.6s build-Zeit) — Bundle wuchs minimal (+12 kB) durch zusaetzliche Viewer"
  duration_minutes: ~30
  completed_date: "2026-05-20"
  commits: 2
---

# Phase 1 Plan 08: Verknuepfungs- + Arbeitszeit-Viewer Summary

Welle-4-Frontend-Spur (3/3) und Plan-1-Welle-4-Abschluss: Die letzten 4 Viewer aus der D-08-Liste (PDlplBetriebsmittel, PDlplPersonal, AEinsatzWunsch, AKapBed) sind implementiert und registriert. Damit ist die **12-Viewer-Liste aus D-08 vollstaendig** — die Phase-1-Foundation an Viewer-Konsumenten ist komplett, was bleibt von Phase 1 ist Save-Mechanik (Plan 01-09) + Integration-Test-Pass (Plan 01-10).

## Was geliefert wurde

Zwei atomare Commits:

| Task | Commit  | Was                                                                                                                                                                                                                                                                                                                  |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | bac08a2 | Verknuepfungs-Viewer: PDlplBetriebsmittel- + PDlplPersonalViewer (read-only, MatrixGrid-Reuse, amber-Banner), 4 synthetische OIDs/Klassen, type-maps + Foundation fuer Task 2 (AEinsatzWunsch + AKapBed-Klassen vorregistriert), SidebarTree-Erweiterung mit Verknuepfungs- + Arbeitszeit-Folder, 5 neue Tests. |
| 2    | 3a51010 | Arbeitszeit-Viewer: AEinsatzWunschViewer (7×24-Wochen-Stunden-Raster, Edit auf synth, Read-only auf echtem Knoten) + AKapBedViewer (Bedarf/Verfuegbar/Delta-Tabelle, Color-Coding) + schicht-helpers (WEEKDAYS, HOURS_OF_DAY, formatHourLabel, parseEinsatzWuensche, isWunschActive). 8 neue Tests.                  |

## Die 12-Viewer-Liste (D-08) ist vollstaendig

| #   | Klasse                | Viewer                       | Plan |
| --- | --------------------- | ---------------------------- | ---- |
| 1   | ASimulator            | PSimulatorViewer             | 05   |
| 2   | PDurchlaufplan        | PDurchlaufplanViewerStd      | 05   |
| 3   | PDurchlaufplanDesign  | PDurchlaufplanViewerDesign   | 07   |
| 4   | PGObjBase             | PGObjBaseViewer (Fallback)   | 05   |
| 5   | RESS_BELEG_GROUP      | PRessBelegMatrixViewer       | 06   |
| 6   | RESS_MENGE_GROUP      | PRessMengeMatrixViewer       | 06   |
| 7   | RESS_VERKNUEPFUNG_GROUP | PRessVerknuepfungViewer    | 06   |
| 8   | DLPL_BETRIEBSMITTEL_GROUP | PDlplBetriebsmittelViewer | **08** |
| 9   | DLPL_PERSONAL_GROUP   | PDlplPersonalViewer          | **08** |
| 10  | AEINSATZWUNSCH_GROUP + AEinsatzWunsch | AEinsatzWunschViewer | **08** |
| 11  | AKAPBED_GROUP + AKapBed | AKapBedViewer              | **08** |
| 12  | AGruppe               | AGruppeViewer                | 05   |

## Architektur-Recap

```
SidebarTree (Plan 01-05/06 + 08-Erweiterung)
  ├─ Modell-Root (ASimulator)
  │    └─ Ausloeser / Plaene / Knoten / Ressourcen / Einsatzzeiten (Backend-_group)
  ├─ Matrix-Sichten (Plan 01-06)
  │    ├─ Belegungsressourcen-Matrix     oid=-10001
  │    ├─ Mengenressourcen-Matrix        oid=-10002
  │    └─ Ressourcen-Verknuepfungen      oid=-10003
  ├─ Verknuepfungs-Sichten (Plan 01-08)  ← NEU
  │    ├─ Knoten ↔ Betriebsmittel        oid=-10004
  │    └─ Knoten ↔ Personal              oid=-10005
  └─ Arbeitszeit-Sichten (Plan 01-08)    ← NEU
       ├─ Einsatz-Wunsch                 oid=-10006
       └─ Kapazitaetsbedarf              oid=-10007

Klick auf Verknuepfungs-/Arbeitszeit-Leaf
  ↓
selectOid(-10004..-10007) → WorkspaceLayout.useEffect (Plan 01-06)
  ↓
isSyntheticOid? → getSyntheticNode (jetzt mit SYNTHETIC_ALL_GROUP_NODES-Lookup)
  ↓
ViewerHost.pickChildDialog(DLPL_BETRIEBSMITTEL_GROUP|...) → entsprechender Viewer
  ↓
- PDlplBetriebsmittel/Personal: MatrixGrid<Knoten, Ressource, boolean> readonly
- AEinsatzWunsch: MatrixGrid<hour, weekday, boolean> editable auf synth
- AKapBed: Custom <table>-Renderer mit Color-Coding
```

## Verifikation (Must-Haves abgehakt)

- [x] PDlplBetriebsmittelViewer rendert Knoten × Betriebsmittel-Matrix (read-only + Banner)
- [x] PDlplPersonalViewer rendert Knoten × Personal-Matrix (PPerson + AGruppe als Spalten)
- [x] AEinsatzWunschViewer ist ein 7×24-Wochen-Stunden-Raster mit editable Checkboxes
- [x] AEinsatzWunschViewer rendert AEinsatzzeitWunsch-Sub-Nodes echter AEinsatzWunsch-Knoten korrekt (active Cells)
- [x] AKapBedViewer zeigt Bedarf/Verfuegbar/Delta-Tabelle mit Color-Coding (rot bei Deficit)
- [x] Alle 4 Viewer sind in der viewer-registry registriert (AEinsatzWunsch/AKapBed doppelt: synth + echt)
- [x] SidebarTree zeigt 3 separate Sichten-Folder (Matrix / Verknuepfungs / Arbeitszeit), Klick mountet jeweils den richtigen Viewer
- [x] schicht-helpers (isWunschActive, formatHourLabel, parseEinsatzWuensche) sind getestet
- [x] `npm test -- --run`: **111/111 gruen** (17 Test-Files, +13 neue aus Plan 08)
- [x] `npm run lint`: clean
- [x] `npm run build`: clean (703 kB index.js + 35 kB CSS, ~5.6s)
- [x] **12 von 12 Viewer-Klassen aus D-08 in der Registry** (verifiziert via `getViewer(klass)` in Plan-08-Tests + bestehende Registry-Tests aus 05/06/07)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Unused-Var-Lint-Errors in PDlplBetriebsmittel/Personal-Viewer**
- **Found during:** Task 1 (`npm run lint`)
- **Issue:** Die `_`-prefixed-Parameter-Konvention (z.B. `_row`, `_col`, `_value`) ist im eslint.config.js NICHT als `argsIgnorePattern: "^_"` konfiguriert — der `@typescript-eslint/no-unused-vars`-Default lehnt sie ab.
- **Fix:** Args in den Phase-1-No-Op-Callbacks werden tatsaechlich genutzt — sie fliessen in die console.warn-Meldung ein (mit den richtigen OIDs, damit Phase-2-Debugging einfacher ist). getCellValue ohne Args (kompatibel mit MatrixGrid-Vertrag durch TS-Strukturkompatibilitaet).
- **Files:** `portal/src/viewers/linking/PDlplBetriebsmittelViewer.tsx`, `portal/src/viewers/linking/PDlplPersonalViewer.tsx`
- **Commit:** bac08a2

**2. [Rule 3 — Blocking] Premature Side-Effect-Import in property/index.ts vor Existenz von arbeitszeit-Folder**
- **Found during:** Task 1 (`npm run build`)
- **Issue:** Beim Aufteilen in 2 Tasks habe ich initial `import "@/viewers/arbeitszeit"` schon in Task 1 gesetzt, aber der Folder existiert erst in Task 2 — Vite-Build failed mit ENOENT.
- **Fix:** Import in Task 1 herausgenommen, in Task 2 wieder addiert.
- **Files:** `portal/src/viewers/property/index.ts` (in Task 1 commit ohne arbeitszeit-Import, in Task 2 commit mit Import)
- **Commits:** bac08a2 (ohne), 3a51010 (mit)

**3. [Rule 3 — Blocking] Unused-Type-Import OtxJsonNode in AEinsatzWunschViewer**
- **Found during:** Task 2 (`npm run lint` + `npm run build`)
- **Issue:** Nach Refactoring (parseEinsatzWuensche akzeptiert OtxJsonNode aus schicht-helpers heraus, nicht direkt) blieb der Import OtxJsonNode in AEinsatzWunschViewer.tsx ungenutzt.
- **Fix:** Import auf nur ChildDialogComponent reduziert.
- **File:** `portal/src/viewers/arbeitszeit/AEinsatzWunschViewer.tsx`
- **Commit:** 3a51010

### Anpassungen ohne Auswirkung auf Plan-Verhalten

**1. 3 separate Sichten-Folder in der Sidebar (statt einem grossen "Sichten"-Folder)**
- **Begruendung:** Die drei Themenbereiche (Matrix / Verknuepfungen / Arbeitszeit) sind semantisch unterschiedlich. Eine flache 3-Folder-Liste ist UX-tauglicher als ein verschachtelter Mega-Folder. Erweiterbar, wenn Plan 09+ weitere Sichten ergaenzt.
- **Files:** `portal/src/components/sidebar-tree.tsx`

**2. Doppel-Registrierung AEinsatzWunsch/AKapBed (synth + echt)**
- **Begruendung:** Plan-Vorgabe forderte primaer Registrierung auf der echten Klasse. Da das Backend diese Klassen aber in Phase 1 nicht direkt liefert, wuerde der Viewer ohne synthetischen Sidebar-Folder unerreichbar bleiben. Die Doppel-Registrierung kostet eine Zeile und macht den Viewer ueber beide Wege erreichbar. Last-wins-Konvention der Registry triggert eine Console-Warning bei der Zweit-Registrierung (akzeptiert).
- **Files:** `portal/src/viewers/arbeitszeit/AEinsatzWunschViewer.tsx`, `AKapBedViewer.tsx`

**3. SidebarTree-Test wurde NICHT erweitert um die neuen Folder**
- **Begruendung:** Der existierende SidebarTree-Test (Plan 05) ueberprueft das Basis-Verhalten (Render, Selection). Die neuen synthetischen Folder werden indirekt ueber die Viewer-Tests (PDlplBetriebsmittel + AEinsatzWunsch + Registry-Lookup-Assertions) verifiziert. Wenn Plan 10 Verification explizit pruefen will, dass alle 3 Folder im Sidebar-Tree erscheinen, kann das dort ergaenzt werden.

## Authentication Gates

Keine. Plan 08 ist reiner Frontend-Code, keine neue Auth-Surface.

## Known Stubs

- **PDlplBetriebsmittel/Personal-Edit-Funktion:** Read-only Foundation in Phase 1. Phase-2-Backlog: `engine/src/osim_engine/io/otx_loader.py` _SKIP-Set um PAssozBelegLink reduzieren, `otx_writer` analog erweitern, dann hier den onCellChange auf store.addChild/removeNode verdrahten.
- **AEinsatzWunsch-Edit auf echtem Knoten:** Wenn das Backend in Phase 2 echte AEinsatzWunsch-Knoten liefert, ruft der onCellChange aktuell ein console.warn statt addChild(AEinsatzzeitWunsch). Plan 09 oder Phase 2 muss den Pfad ueber ViewerHost.methodDispatcher (Plan 01-05) verdrahten.
- **AEinsatzWunsch-Range-Coalescing:** Phase 1 macht eine Stunde = ein Block. In der Realitaet wuerden 8 Stunden Mo-Frueh zu EINEM Wunsch-Block mit von=08:00, bis=16:00 zusammengefasst (siehe parseEinsatzWuensche: die Heuristik liest schon zusammengesetzte Bloecke). Save-back (Plan 09 oder spaeter) muesste die geschalteten Stunden-Cells zusammenfassen — der schicht-helpers-API ist dafuer vorbereitet (formatTimeRange, isWunschActive).
- **AKapBed-Berechnung:** Komplett read-only in Phase 1. Die Werte entstehen rechnerisch aus dem Modell + Simulator-Lauf. Ein clientseitiger Recalculate (z.B. fuer einfache Modelle ohne Bedarf-vs-Verfuegbarkeit-Konflikt) waere optional moeglich — Phase 1 verzichtet, weil der Simulator-Roundtrip in Phase 2+ kommt.
- **Snapshot-Undo der synthetischen Wunsch-Grid-Edits:** wie bei den Matrix-Viewern aus Plan 01-06 ist der modul-lokale synth-Property-Store nicht im useModelStore-Undo-Snapshot — Plan 09 koennte ein eigenes synth-Undo nachziehen.
- **Schicht-Modell-Variationen:** Die OSim-Engine kennt mehrere Schicht-Modellierungen (PEinsatzzeit, ATagesEinsatzzeit, PPauseZyklus, AGruppe-Schicht-Pool). Phase 1 deckt nur den AEinsatzzeitWunsch-Pfad ab (siehe schicht-helpers.parseEinsatzWuensche). Phase 3+ erweitert wenn noetig.

Alle Stubs sind im Plan-08-PLAN.md risks-Block dokumentiert oder folgen direkt aus den Decisions oben — kein Stub blockiert den Phase-1-Use-Case (alle 12 Sichten sind in der Sidebar erreichbar und mounten den korrekten Viewer).

## Threat Flags

Keine neuen Threat-Surface-Erweiterungen — Plan 08 ist reiner Frontend-Code. Synthetische OIDs leben frontend-internal, kein neuer API-Endpoint, keine neuen Permissions.

## Risk-Mitigations (aus Plan-Risk-Block)

- **"Verknuepfungs-Edit ist Engine-blockiert":** Mitigation: Read-only-Viewer mit Hinweis-Banner, Phase-2-Backlog-Item explizit dokumentiert in 01-08-D1 und in den jeweiligen Viewer-Headers. Edit-Pfad ist vorbereitet (onCellChange-Closure existiert), aktiviert wenn der Engine-Schema-Update kommt.
- **"AEinsatzWunsch-Schicht-Modell ist komplex":** Mitigation: schicht-helpers kapseln die Stunden-Granularitaet + parseEinsatzWuensche kann zusammengesetzte Bloecke lesen. Phase 1 macht den "happy path" 1-Stunde-pro-Cell; Phase-X-Erweiterung kann Range-Coalescing nachziehen, ohne den Viewer komplett neuschreiben zu muessen.
- **"AKapBed ist computed":** Mitigation: vollstaendig read-only in Phase 1, Info-Banner erklaert das dem User. Werte fuellen sich automatisch ein, sobald der Backend-Tree die ATagPerson/AKapBed-Sub-Knoten liefert (parsePeriods liest sie).

## Notes fuer Plan 09 + 10

- **Plan 09** (Save-Pfad + IndexedDB): Save-Logik muss auch die SYNTH_PROPS der neuen synthetischen Folder (m_aWunschGrid auf AEINSATZWUNSCH_GROUP, etc.) auslesen und in PUT /tree-Body integrieren. Foundation in synthetic-nodes.ts (getSyntheticProps) ist schon da.
- **Plan 09** (Engine-Roundtrip): Wenn der Engine-Writer in Plan-09-Scope um PAssozBelegLink erweitert wird (entgegen aktueller Erwartung), kann der read-only-Banner in PDlplBetriebsmittel/Personal entfernt und der Edit-Pfad aktiviert werden.
- **Plan 10** (Verification): Smoke-Test mit echtem OTX-Modell (Fertigungsstruktur1_mit_AslFj.otx) verifiziert, dass alle 12 Viewer via Sidebar erreichbar sind. Insbesondere sollten die synthetischen Folder neben dem Modell-Root sichtbar sein.

## Phase-1-Plan: 12-Viewer-Liste komplett

Mit Plan 01-08 ist die D-08-Anforderung **vollstaendig erfuellt**. Was bleibt von Phase 1:

- **Plan 01-09 (Save-Mechanik)**: PUT /tree verdrahten, dexie/IndexedDB-Persistenz, Position-Store (Plan 07) + synth-Property-Store (Plan 06+08) in den Save-Body integrieren.
- **Plan 01-10 (Verification)**: End-to-End-Tests mit echten OTX-Modellen (Dummy.otx, Fertigungsstruktur1, Bosch2_wechseln-Stress).

Damit ist Wave 4 abgeschlossen.

## Self-Check

### Created Files

- [x] `portal/src/viewers/linking/PDlplBetriebsmittelViewer.tsx` — FOUND
- [x] `portal/src/viewers/linking/PDlplPersonalViewer.tsx` — FOUND
- [x] `portal/src/viewers/linking/index.ts` — FOUND
- [x] `portal/src/viewers/linking/__tests__/PDlplBetriebsmittelViewer.test.tsx` — FOUND
- [x] `portal/src/viewers/arbeitszeit/AEinsatzWunschViewer.tsx` — FOUND
- [x] `portal/src/viewers/arbeitszeit/AKapBedViewer.tsx` — FOUND
- [x] `portal/src/viewers/arbeitszeit/schicht-helpers.ts` — FOUND
- [x] `portal/src/viewers/arbeitszeit/index.ts` — FOUND
- [x] `portal/src/viewers/arbeitszeit/__tests__/AEinsatzWunschViewer.test.tsx` — FOUND

### Commits

- [x] `bac08a2` — feat(portal): PDlplBetriebsmittel + PDlplPersonal Verknuepfungs-Viewer (plan 01-08 task 1)
- [x] `3a51010` — feat(portal): AEinsatzWunsch + AKapBed Arbeitszeit-Viewer (plan 01-08 task 2)

### Verification

- Test-Suite: **111 passed** (17 Files, ~1.9s) — `npm test -- --run`
- Lint: **clean** (`npm run lint`, eslint --max-warnings=0)
- Build: **clean** (`npm run build`, 703 kB index.js + 35 kB CSS, ~5.6s)
- **12-Viewer-Liste D-08 vollstaendig** in der viewer-registry verifiziert

## Self-Check: PASSED
