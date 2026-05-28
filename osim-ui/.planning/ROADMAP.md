# Roadmap: osim-ui

## Overview

Vom leeren Repo zur vollwertigen Sim-Web-App mit Modellierungs-Werkzeug, Sim-Lauf, Live-Visualisierung, parallelen Cloud-Workern, Reports und 3fls-Integration. Sieben Phasen, ~14–20 Wochen für v0.1.0.

## Querschnitts-Foundations

Vier Bausteine ziehen sich durch ALLE Phasen — nicht phasen-spezifisch:

1. **OViewer-Schicht (`portal/src/viewers/core/`)** — TypeScript-Port des C++-`OViewer`-Patterns aus `OSim2004/inc/OViewer.h`. Hybrid-Pattern: `ViewerFrame`/`ClientCtrl` als TS-Klassen, `ChildDialog`/`ChildCtrl` als React-Components. Vollständige 9-er `OCtrl`-Familie. Wird in Phase 1 erstgebaut; ALLE konkreten Viewer (Phase 1 Property-/Matrix-Viewer, Phase 3 Form-Editor, Phase 4 graphische Live-Viewer, Phase 6+ Report-/Chart-/Gantt-Viewer) bauen darauf auf.

2. **GraphObject-Schicht (`portal/src/graph/core/`)** — TypeScript-Port von `OSim2004/inc/GraphObj.h` (GObject/GObjLink/GLink/GraphView/GraphGrid/Region-Check/Phantom/4-Layer-Drawing). Wird in Phase 1 angerissen (Basis-Klassen für `PDurchlaufplanViewer-Design`), in Phase 4 vollausgebaut; spätere graphische Viewer (Phase 6 Charts, Phase 7+ Matrix/Gantt) erweitern.

3. **Engine-Reflection-Schema** — JSON-Schema aller Modell-Klassen per Engine-Reflection generiert, nicht hand-geschrieben. Phase 3 etabliert es, alle späteren Modell-Erweiterungen profitieren.

4. **3fls-Pattern-Konformität** — wo immer 3fls eine etablierte Konvention hat, übernimmt osim-ui sie 1:1.

## Phases

- [x] **Phase 1: OViewer-Framework + OTX-Modellierung** — Backend-Foundation, OViewer-Schicht, 12 konkrete Viewer, OTX-im-Browser-Bearbeitung (completed 2026-05-21)
- [ ] **Phase 1.1: UI-Polish & LList-Resolution** (INSERTED) — Workspace demo-tauglich machen: GraphView des Durchlaufplans als primärer Use-Case erreichbar, OCtrlList traversiert Engine-LListPtr-Ketten, Tree navigierbar, kompakte Modell-Bibliothek, Viewer-Toolbar mit Funktion, eigenes Brand-Design
- [ ] **Phase 1.2: Matrix-Foundation + erste Matrix-Viewer** (INSERTED) — Graph-Foundation erweitern um Matrix-Cell-Rendering, Spalten-/Zeilen-Header, Inline-Cell-Editing, Block-Select/Copy/Paste. Als Konsumenten: PRessBelegMatrixViewer (kanonisches Matrix-Beispiel), PDlplConnKnotenViewer (Graph-Detail), PRessVerknuepfungViewer (Graph mit Kennzahl-Vorgriff).
- [ ] **Phase 1.3: PAssozMenge Wire-Roundtrip + PRessMengeMatrixViewer-Migration** (INSERTED) — Engine-A2-Vorarbeit: OTX-Wire-Roundtrip für die 4 PAssozMenge-Subklassen (Erzgt/Verbr/VerbrZwischen/Abfr) im osim-engine; danach Migration des PRessMengeMatrixViewer von der Legacy-matrix-common.tsx auf die @osim/graphobject Matrix-Foundation. Schließt das aus Phase 01.2 Track A deferred A2-Backlog ab.
- [ ] **Phase 2: Sim-Lauf + Trace** — Worker, Orchestrator, Status-Polling, Trace-Download
- [ ] **Phase 3: JSON Editor** — Engine-Reflection-Schema + Form-Editor (Alternative zum OViewer für strukturierte Felder)
- [ ] **Phase 4: Live Viz** — GraphObject-Vollausbau + Durchlaufplan-Live-View + KPI-Charts + WebSocket
- [ ] **Phase 5: Cloud Parallel** — Eigenes GCP-Projekt + Cloud Run Jobs + Pub/Sub + Multi-Run
- [ ] **Phase 6: Reports** — PDF/Excel/CSV/JSON-Bundle, HKA + Steinbeis Templates
- [ ] **Phase 7: 3fls Iframe** — Iframe-Embedding in tbx_stzrim mit On-Behalf-Token-Exchange

## Phase Details

### Phase 1: OViewer-Framework + OTX-Modellierung
**Goal**: Ein angemeldeter User kann ein `.otx`-Modell hochladen, im Browser über das OViewer-Framework (TypeScript-Port des C++-OViewer-Patterns) vollständig bearbeiten — Properties, Anlegen, Löschen, Verknüpfen — und periodisch zurück in OTX speichern. Multi-Tenant ab Tag 1, volle FastAPI-Backend-Foundation.
**Depends on**: Engine-Erweiterung "OTX-Writer" (`osim_engine.io.otx_writer.dump_simulator_to_otx`) als Welle 0 dieser Phase im osim-engine-Repo.
**Success Criteria** (what must be TRUE):
  1. `docker compose up` startet alle Dev-Services (Postgres, Firebase-Emulator, Minio)
  2. User kann sich via Firebase-Emulator registrieren und einloggen; Tenant-Schema wird lazy beim ersten `/api/v1/auth/me` angelegt
  3. User kann `Vorstellung04/Dummy.otx` hochladen → Server parst (Engine), liefert JSON-Tree → Sidebar-Tree-Navigation zeigt Modell-Hierarchie
  4. Alle 12 konkreten Viewer sind funktionsfähig: `PSimulatorViewer`, `PDurchlaufplanViewer-Standard`, `PDurchlaufplanViewer-Design` (graphisch via GraphObject-Basis + React Flow), `PGObjBaseViewer`, drei Ressourcen-Matrix-Viewer (`PRessBeleg`, `PRessMenge`, `PRessVerknuepfung`), zwei Verknüpfungs-Viewer (`PDlplBetriebsmittel`, `PDlplPersonal`), drei Arbeitszeit-Viewer (`AEinsatzWunsch`, `AKapBed`, `AGruppe`)
  5. Vollständige 9-er `OCtrl`-Familie ist implementiert (Variable, Bool, Enum, Link, List, Method, TabViewer, COLORREF, LOGFONT)
  6. Edit-Operationen vollständig: Properties editieren, Objekte anlegen, löschen, Verknüpfungen neu zeichnen
  7. Auto-Save alle 30 s + manueller Speichern-Button + IndexedDB-Snapshot pro Änderung + Single-Editor-Lock auf Modell-Ebene
  8. Save-back schreibt versionierte OTX-Datei in Storage (kein In-Place-Overwrite); Original-Upload unverändert
  9. Multi-Tenant-Schemas sind angelegt; alle Queries laufen im richtigen Schema (`search_path` per Request)
**Canonical refs**:
  - .planning/phases/01-vertical-slice/01-CONTEXT.md (verbindlich)
  - .planning/phases/01-vertical-slice/01-DISCUSSION-LOG.md (Audit-Trail)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (Pflichtlektüre)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h (für Design-Viewer)
  - .planning/research/osim-engine-api.md
  - .planning/research/3fls-patterns.md
  - .planning/research/copy-paste-guide.md
  - .planning/research/osim2004-ui-analysis.md
  - .planning/PROJECT.md
  - docs/ARCHITECTURE.md
**Plans**: 12 plans in 7 Wellen (siehe Plan-Liste unten)
Plans:
- [x] 01-01-engine-roundtrip-verify-PLAN.md — Welle 0: OTX-Writer Coverage-Verifikation gegen Dummy/Fertigungsstruktur1/Bosch2
- [x] 01-02-backend-foundation-PLAN.md — Welle 1: FastAPI-Foundation (Config, DB, Auth-Middleware, RFC-7807, Alembic, Lazy-Bootstrap)
- [x] 01-03-frontend-foundation-PLAN.md — Welle 1: Vite + TanStack-Router + Firebase-Client + apiFetch + Auth-Provider
- [x] 01-04-storage-models-locks-api-PLAN.md — Welle 2: Storage-Abstraktion, Models-API, Single-Editor-Lock-Service
- [x] 01-05-compose-stack-integration-tests-PLAN.md — Welle 2: docker-compose + Integration-Tests (auth, isolation, models, locks)
- [x] 01-06-oviewer-core-octrl-family-PLAN.md — Welle 3: OViewer-Foundation (5 Files) + 9 OCtrl-Components
- [x] 01-07-property-schema-store-sidebar-workspace-PLAN.md — Welle 3: PropertySchema + ModelStore + Sidebar + Workspace-Route
- [x] 01-08-viewers-property-PLAN.md — Welle 4: 8 Property-Viewer (PSimulator/PDurchlaufplanStd/PGObjBase/PDlpl×2/AZeit×3)
- [x] 01-09-viewers-matrix-PLAN.md — Welle 4: 3 Matrix-Viewer (PRessBeleg/PRessMenge/PRessVerknuepfung)
- [x] 01-10-graphobject-design-viewer-PLAN.md — Welle 5: GraphObject-Basis + PDurchlaufplanViewerDesign (React Flow)
- [x] 01-11-save-strategy-indexeddb-PLAN.md — Welle 6: Auto-Save + IndexedDB + Lock-Heartbeat + StatusBar
- [x] 01-12-e2e-modeling-flow-PLAN.md — Welle 6: Playwright E2E-Tests (modeling-flow, lock-conflict, snapshot-restore)

### Phase 1.1: GraphObject-Foundation + UI-Polish & LList-Resolution (INSERTED)
**Goal**: 1:1-funktionale TypeScript-Portierung der C++-`GraphObject`-Schicht aus OSim2004 als Foundation für ALLE graphischen Viewer in osim-ui — Datenstrukturen, Algorithmen, Listen-Topologie, Region-Check, Phantom-Preview, GOIns/Remove/Move-Mechanik exakt wie im Original. Auf dieser Foundation wird der `PDurchlaufplanViewer-Design` als erster Konsument neu gebaut. Im Anschluss UI-Polish-Restschuld + LList-Resolution + Demo-Smoke-Test.
**Depends on**: Phase 1 (komplett abgenommen — alle 12 Viewer registriert, Backend-CRUD lauffähig, E2E 3/3 grün).
**Success Criteria** (what must be TRUE):
  1. **GraphObject-Foundation 1:1-Port** (höchste Priorität, Welle 0): Vollständige TypeScript-Portierung der C++-Klassen aus `OSim2004/inc/GraphObj.h` + zugehörige `OG*.cpp` — `GObject`, `GObjLink`, `GLink`, `GLinkPoint`, `GLinkSquare`, `OGPosition`, `OGPositionGrid`, `GOGridCol`, `GOGridRow`, `OGraphCollection`, `OGraphList`, `OGraphGrid` (mit GOIns/GORemove/GetNextFreeGridPlace/IsGridPlaceTaken/InsertColBefore/InsertRowBefore/RemoveCol/RemoveRow), `OGraphView`, **`GObjSub` mit nested Sub-Grids und D_CLOSED/D_OPEN-State** (siehe SC-2). Funktionalität exakt wie Original; Visualisierung darf modern sein. Volle Unit-Test-Coverage gegen die in `01.1-GRAPHOBJ-NOTES.md` §17 spezifizierten Verhaltensgarantien plus die in CONTEXT D-1.1-21 spezifizierten GObjSub-Tests. Welle-Reihenfolge folgt §19 der Notes (A: Typen/Konstanten → B: Domain inkl. `GObjSub` → C: OGraphGrid → D: GLink/Routing → E: View-Adapter mit nested-Sub-Grid-Render → F: Interaktionen inkl. Open/Close + IsParentFrom + Phantom → G: Integration).
  2. **Nested Knoten / hierarchische Sub-Grids (`GObjSub`)** (kritisch, Pflicht-Subset von SC-1): Ein `GObjSub`-Knoten kann INNERHALB seiner äußeren Rect einen eigenen `OGraphGrid` führen, der wieder `GObjSub`-Knoten enthalten kann — beliebig tief geschachtelt. State-Maschine D_CLOSED ↔ D_OPEN. `SetChildsVisible(BOOL)` schaltet Sichtbarkeit rekursiv. `IsParentFrom(obj, rekursiv=TRUE)` walks Parent-Kette. `GetCollection(virtp)` liefert die innerste Collection unter dem Cursor. 4-Layer-Drawing (Background → Kinder → Foreground → Helpers) wird durchgereicht. Verifizierung: rekursive Open/Close, Größen-Anpassung bei GOIns ins Sub-Grid, Hit-Test auf Tiefe ≥3.
  3. **Original-Symbole als SVG**: Pflicht-Set von ~25 SVG-Symbolen aus `OSim2004/bmp/` + `OSim2004/ico/` (App-Logo, Tree-Group-Icons, Knoten-Klass-Icons, Toolbar-Icons) im `portal/src/assets/symbols/`-Verzeichnis. Original-BMPs in `.planning/assets/osim2004-original/` archiviert. Tree/Toolbar/Workspace nutzen ausschließlich die neuen SVGs statt der heutigen `lucide-react`-Icons. Conversion-Skript `scripts/convert-osim-symbols.py` reproduzierbar. Optisch in das Brand-Schema integriert (Outline brand-700, Fill brand-100).
  4. **PDurchlaufplanViewer-Design auf GraphObject-Foundation**: Der existierende React-Flow-basierte Design-Viewer (Plan 1-10) wird auf die neue GraphObject-Foundation migriert. `OsimCustomNode` rendert ein `GObject` über React-Flow; Drag/Connect/Delete dispatchen in den GraphObject-State (`OGraphGrid.goIns`/`goRemove`/`moveMe`). Position-Drag und Knoten-Hinzufügen gehen über die Foundation, nicht über Direct-Store-Dispatch. Sub-Pläne (`GObjSub`) sind direkt im Design-Viewer öffenbar (Doppelklick / Toolbar-Button), nicht erst in Phase 4.
  5. **GraphView-Reachability**: User lädt Dummy.otx, klickt im Tree auf einen Durchlaufplan, sieht graphische Knoten-/Kanten-Darstellung. Position-Drag funktioniert, Knoten hinzufügen funktioniert, Sub-Plan-Doppelklick öffnet die Sub-Hierarchie inline, Save persistiert.
  6. **LList-Resolution im Backend**: `wire_to_otx`/`load_to_wire` traversieren Engine-LListPtr-Ketten und liefern dem Frontend `sub_refs[]: number[]` als echte OID-Arrays statt OID-Pointer-Integer. Damit zeigen OCtrlList-Sektionen (Auslöser-Liste, Knoten-Liste, etc.) die tatsächlichen Sub-Objekte.
  7. **Sidebar-Tree navigierbar**: Default-State zeigt nur Top-Level-Gruppen. Sub-Gruppen lazy expandiert auf Click. Suchleiste oben filtert. Sinnvolle Labels (m_sName mit Fallback auf Klass-Kurzform). Performance bei 30k+ Objekten (Bosch) bleibt brauchbar.
  8. **Modell-Bibliothek kompakt**: Tabelle/List-View statt 3-Spalten-Karten-Grid. E2E-Test-Modelle automatisch gefiltert.
  9. **ViewerFrame-Toolbar verdrahtet**: 7 Buttons (« ‹ › » + ↻ ×) mit Tooltips, Navigation/Create/Reset/Delete in `onCommand` voll implementiert. Sim-Lauf-Button im PSimulatorViewer wird zu "Phase 2"-Hinweis.
 10. **Visuelles Design**: Brand-Farbschema (OSim-Identität, nicht shadcn-Default), Workspace-Header mit Modell-Name + Breadcrumb, Lock-/Save-Status prominenter Indikator. SVG-Symbole integriert.
 11. **Demo-Smoke-Test**: Playwright-Spec verifiziert Login → Bibliothek → Workspace → Tree → GraphView (mit Knoten/Kanten gerendert auf der neuen Foundation, inkl. einem Sub-Plan-Open/Close-Schritt).
**Canonical refs**:
  - .planning/phases/01.1-ui-polish-llist/01.1-GRAPHOBJ-NOTES.md (verbindliche Algorithmen-Vorlage für Welle 0; §19 = Welle-Reihenfolge, §17 = Test-Spec, §20 = Invarianten)
  - .planning/phases/01.1-ui-polish-llist/01.1-CONTEXT.md
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h (Pflichtlektüre — 2913 Zeilen)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\ofc\OGGrid.cpp, OGObject.cpp, OGObjLink.cpp, OGLink.cpp, OGLinkPo.cpp, OGLinkSqr.cpp, OGView.cpp, OGObjElements.cpp, OGObjODlp.cpp, OGObjRect.cpp, OGObjSqr.cpp, OGCollec.cpp, OGfxCtrl.cpp, OGBlock.cpp, OGGridCtrl.cpp, OGGridAlt.cpp (Implementierungs-Quellen)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (Toolbar-Semantik)
  - osim-engine LListPtr-Implementation (für Backend-Resolution)

### Phase 1.2: Matrix-Foundation + erste Matrix-Viewer (INSERTED)
**Goal**: GraphObject-Foundation um die Mechanik erweitern, die alle Matrix-basierten OSim2004-Viewer brauchen (DrawCells-Hook, Header-Rows, Inline-Cell-Edit, Block-Select/Copy/Paste), und damit drei kanonische Viewer aus dem Audit-Katalog implementieren: `PRessBelegMatrixViewer` (Matrix), `PDlplConnKnotenViewer` (Graph-Detail), `PRessVerknuepfungViewer` (Graph mit Kennzahl-Vorgriff). Damit ist die zweite Viewer-Familie der OSim-Suite (Pattern 3: Matrix-Viewer aus dem Katalog) erreichbar — ohne dass spätere Sim-Auswertungen oder Cloud-Phasen darauf warten müssen.
**Depends on**: Phase 1.1 (komplett abgenommen — GraphObject-Foundation inkl. GObjSub-Multi-Grid stabil, PDurchlaufplanViewerDesign produktiv, alle UAT-Punkte verifiziert).
**Success Criteria** (what must be TRUE):
  1. **OGraphGrid.DrawCells-Hook**: Foundation bietet einen renderer-agnostischen Cell-Renderer-Hook (analog OSim2004 `PMatrixBaseViewerOGCtrl::DrawCells()` aus PRessBelegMatrixViewer.cpp). Pro Matrix-Cell kann der Konsument Custom-Inhalt liefern (Text, Farbe, Icon, Status-Indikator). Cell-Inhalt ist NICHT GObject-basiert (Cells sind Wire-Daten-getrieben), aber Cell-Position und -Größe folgen dem OGraphGrid-Layout.
  2. **Spalten-/Zeilen-Header**: OGraphGrid unterstützt eine separate Header-Reihe (oben) und Header-Spalte (links) mit Custom-Content. Headers scrollen mit beim horizontalen/vertikalen Scrolling, bleiben aber bei Cross-Achse fixiert (Excel-Pattern). Header-Klick triggert Sort/Filter-Callback (Konsument entscheidet).
  3. **Inline-Cell-Editing**: Click auf eine Matrix-Cell setzt sie in Edit-Mode (Textbox-Overlay). Enter speichert, ESC bricht ab. Foundation liefert nur die Mechanik (Focus + Edit-State); Cell-Wert-Validierung und Wire-Persistierung ist Konsumenten-Sache. Read-only-Cells überspringen Edit-Mode.
  4. **Block-Select**: Drag-Rectangle auf der Matrix selektiert eine Cell-Range. Selektion ist visuell sichtbar (Cyan-Outline 1:1 zum 3FLS-EAM-Style-Guide). Shift+Click extendet Selektion. Ctrl+Click toggelt einzelne Cells.
  5. **Block-Copy/Paste**: Ctrl+C kopiert selektierte Cell-Range in ein Custom-Clipboard-Format (analog OSim2004 `PMatrixBaseViewerOGCtrl::CopyCell2Buffer` aus OGGrid.cpp). Ctrl+V paste an die aktive Cell, mit Validierung dass die Quelle ins Ziel passt. Cross-Viewer-Paste (zwischen verschiedenen Matrix-Viewern) ist möglich, solange die Cell-Typen kompatibel sind.
  6. **PRessBelegMatrixViewer als kanonischer Konsument**: Zeilen = `PRessBeleg`-Objekte (Ressourcen-Belegungen), Spalten = `PDlplKnoten` (Durchlaufplan-Knoten), Cells = `PAssozBeleg`-Assoziationen oder leer. Combobox-View-Modi (ALL/PERS/RESS) filtern Zeilen. Combobox-Verknuepfungs-Modus (AND/OR) ändert Cell-Visualisierung. Live im Browser: Modell laden → Plan auswählen → PRessBelegMatrixViewer öffnet sich als Tab im Workspace → Cells edit + Block-Copy funktionieren.
  7. **PDlplConnKnotenViewer**: Detail-Viewer für einen einzelnen Durchlaufplan-Knoten — zeigt seine zugeordneten Ressourcen-Belegungen und Speicher-Assoziationen als kleinen Graph (Knoten zentral, Ressourcen/Speicher außenrum, Assoz-Links dazwischen). Verbindungs-Validierung folgt OSim2004-Regeln (PDlplConnKnotenViewer.cpp).
  8. **PRessVerknuepfungViewer**: zeigt für eine Ressource ihre Verknüpfungen zu allen Durchlaufplan-Knoten als Graph (links: TTY-ähnliches Ressourcen-Gitter, rechts: Graph der verknüpften Knoten). Kennzahl-Anzeige-Slot vorgesehen aber inaktiv (Phase 4 aktiviert ihn).
  9. **Foundation-Tests + Viewer-Tests**: Mindestens 15 neue Vitest-Specs für die Foundation-Mechanik (DrawCells-Hook, Header-Sticky, Inline-Edit-State-Machine, Block-Select, Clipboard-Format). Pro Viewer 1 Smoke-Test (rendert ohne Crash, akzeptiert User-Input).
 10. **E2E-Verifikation**: Playwright-Spec lädt Modell, öffnet Plan, wechselt in PRessBelegMatrixViewer-Tab, editiert eine Cell, prüft Persistenz nach F5.
**Canonical refs**:
  - .planning/research/osim2004-viewer-catalog.md (vollständiger Viewer-Katalog mit Foundation-Gap-Analyse — Welle G26)
  - .planning/phases/01.1-ui-polish-llist/01.1-GRAPHOBJ-NOTES.md (Foundation-Vertrag — Pflicht-Invarianten gelten weiter)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessBelegMatrixViewer.cpp + .h
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PDlplConnKnotenViewer.cpp + .h
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessVerknuepfungViewer.cpp + .h
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PGObjBaseViewer.h (Graph-Viewer-Base, geteilte Helpers)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\ofc\OGGrid.cpp (DrawCells + CopyCell2Buffer/PasteCellFromBuffer)

**Plans**: 9 plans in 6 Wellen
Plans:
- [x] 01.2-01-PLAN.md — Welle 0: Pre-Cleanup (Stub-Diagnose + User-Entscheidung + Lösch der erfundenen PRessVerknuepfung-Klass)
- [x] 01.2-02-PLAN.md — Welle A: Foundation MatrixGrid + MatrixCell + Sticky-Headers (≥15 Specs)
- [x] 01.2-03-PLAN.md — Welle B: useInlineCellEdit Hook (Lift aus matrix-common)
- [x] 01.2-04-PLAN.md — Welle C: useBlockSelection Hook (Pure-Functions + Ctrl/Shift-Click)
- [x] 01.2-05-PLAN.md — Welle D: matrix-clipboard (Copy/Paste mit Custom-MIME)
- [x] 01.2-06-PLAN.md — Welle E: PRessBelegMatrixViewer kanonisch (C++-Audit + 2D-Matrix + Combobox-Toolbar)
- [x] 01.2-07-PLAN.md — Welle F: PDlplConnKnotenViewer (Graph-Detail + Listener-no-op-Hook)
- [x] 01.2-08-PLAN.md — Welle G: PRessVerknuepfungViewer (Graph + Kennzahl-Slot-Placeholder)
- [ ] 01.2-09-PLAN.md — Welle H: E2E-Spec + UAT-Checkliste + Phase-Sign-Off

### Phase 1.3: PAssozMenge Wire-Roundtrip + PRessMengeMatrixViewer-Migration (INSERTED)
**Goal**: Vorbereiten und ausführen der A2-Backlog-Welle aus Phase 01.2 Track A. Engine erhält OTX-Wire-Roundtrip für die vier `PAssozMenge`-Subklassen (`PAssozMengeErzgt` / `PAssozMengeVerbr` / `PAssozMengeVerbrZwischen` / `PAssozMengeAbfr`) analog zum existierenden `PAssozBeleg`-Pattern (`engine/src/osim_engine/io/otx_writer.py:917-946`, `otx_loader.py:782-797`). Anschließend Migration des `PRessMengeMatrixViewer` (osim-ui) von der Legacy-`matrix-common.tsx` auf die `@osim/graphobject` Matrix-Foundation analog zum `PRessBelegMatrixViewer`. Damit liegt die Material-Familie der OSim-Suite auf demselben Wire+UI-Stand wie die Belegungs-Familie und das Track-A-A2-Defer aus Session 2026-05-28b ist abgeschlossen.
**Depends on**: Phase 1.2 (Matrix-Foundation stabil, `@osim/graphobject`-Paket etabliert, `PRessBelegMatrixViewer` als Referenz-Implementation). Phase 1.1 (GraphObject-Foundation für Matrix-Cells).
**Success Criteria** (what must be TRUE):
  1. **C++-Audit**: `PAssozRessource.odh` + `PAssozRessource.cpp` sind auditiert, alle im OTX persistierten Attrs der PAssozMenge-Subklassen sind in einem AUDIT-Doc dokumentiert (m_iMengeAus für Erzgt, m_iMengeEin für Verbr/VerbrZwischen, abfr-spezifische Felder).
  2. **Engine: PAssozMenge-OTX-Loader-Handler**: `engine/src/osim_engine/io/otx_loader.py` hat Class-Handler für `PAssozMenge`, `PAssozMengeErzgt`, `PAssozMengeVerbr`, `PAssozMengeVerbrZwischen`, `PAssozMengeAbfr`. Handler instanziieren die existierenden Sim-Klassen aus `engine/src/osim_engine/resources/assoziation/menge.py`, lesen `m_sName` + spezifische Mengen-Attrs, resolven `m_lMengRess`-Pointer auf `PRessMenge`.
  3. **Engine: PAssozMenge-OTX-Writer**: `engine/src/osim_engine/io/otx_writer.py` hat Writer für die 4 konkreten Subklassen. Writer schreiben `m_sName` + die jeweils zutreffenden Mengen-Felder (Erzgt: `m_iMengeAus`; Verbr/VerbrZwischen: `m_iMengeEin`; Abfr: ggf. `m_iMengeAbfrage`).
  4. **Round-Trip-Tests**: Mindestens ein Demo-OTX mit PAssozMenge-Instanzen (Vorlage: `v5_erzeuger_verbraucher.otx` oder ein konstruiertes Fixture) round-trippt: `load_to_wire → wire_to_otx → load_to_wire` ergibt strukturell identische Sim-State (gleiche Anzahl PAssozMenge*-Objekte, identische Attr-Werte, intakte Kollektionsverkettung).
  5. **Engine-Tests grün**: Alle existierenden Roundtrip-Tests (Stand: 70+) bleiben grün; neue Tests für PAssozMenge (≥ 8 — pro Subklasse mindestens 1 Roundtrip + 1 Multi-Instance-Test) sind grün; `uv run pytest` zeigt 0 Regressionen.
  6. **Schema-Export für UI**: API-Endpoint `/api/v1/schemas` (oder das beim Modul-Import eingelesene `app/static/schemas/v1/schemas.json`) liefert die PAssozMenge-Subklassen mit korrekten Attrs für UI-Konsum; Schema-Generator (`python -m osim_engine.schema dump` oder Reflection-Pfad) deckt die neuen Handler ab.
  7. **PRessMengeMatrixViewer migriert**: `osim-ui/portal/src/viewers/PRessMenge/PRessMengeMatrixViewer.tsx` nutzt `MatrixGrid` aus `@osim/graphobject` (analog `PRessBelegMatrixViewer`). Zeilen = PRessMenge-Objekte (oder die zugewiesenen Material-Instanzen), Spalten = `PDlplKnoten`, Cells = PAssozMenge-Status/-Menge. `matrix-common.tsx` ist gelöscht; keine Konsumenten mehr.
  8. **PRessMengeMatrixViewer-Tests**: Mindestens 8 Vitest-Specs für 2D-Matrix-Rendering, Cell-Edit, Block-Copy/Paste — analog `PRessBelegMatrixViewer`-Spec-Familie. Plus mindestens 1 Clipboard-Spec für Document-Listener-Verdrahtung.
  9. **UI-Wire-Edit funktioniert**: Live im Browser: Modell mit PAssozMenge-Instanzen laden → Plan auswählen → PRessMengeMatrixViewer als Tab im Workspace öffnen → Cell-Edit funktioniert (Persistenz hängt am gleichen Save-/Lock-Stand wie Welle 1.2-H; falls Bug noch offen, übernehmen wir denselben Stand statt eines neuen).
 10. **E2E-Smoke**: Playwright-Spec lädt Demo-Modell mit PAssozMenge, navigiert zum `PRessMengeMatrixViewer`, editiert eine Cell, prüft mindestens Foundation-Mechanik (Block-Copy/Paste-Cycle analog `matrix-cell-edit-persistence.spec.ts` Test 2). Persistenz-Test gegen Engine-Round-Trip darf `test.fixme` sein, falls Save-/Lock-Bug aus 1.2-H noch offen.
**Canonical refs**:
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PAssozRessource.odh (Class-Definitionen PAssozMenge*)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PAssozRessource.cpp (Sim-Methoden + Attr-Persistierung)
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessMengeMatrixViewer.cpp + .h (Original-UI-Vorlage)
  - engine/src/osim_engine/resources/assoziation/menge.py (existierende Sim-Resource-Klassen)
  - engine/src/osim_engine/io/otx_writer.py:917-946 (_make_assoz_writer + PAssozBeleg-Pattern als Schablone)
  - engine/src/osim_engine/io/otx_loader.py:782-797 (_PAssozBelegHandler-Pattern als Schablone)
  - osim-ui/portal/src/viewers/PRessBelegMatrix/PRessBelegMatrixViewer.tsx (Referenz-UI-Migration)
  - osim-ui/portal/src/viewers/PRessMenge/matrix-common.tsx (zu löschende Legacy-Implementation)
  - osim-ui/portal/packages/graphobject/src/matrix/ (MatrixGrid + MatrixCell als Foundation-Target)
  - .planning/STATE.md (Track-A-A2-Defer-Notiz vom 2026-05-28b)
**Plans**: TBD (ca. 5-7 Wellen — Engine: Audit / Loader / Writer / Round-Trip-Tests / Schema-Export; UI: Viewer-Migration / Viewer-Tests / E2E-Smoke)

### Phase 2: Sim-Lauf + Trace
**Goal**: Aus dem in Phase 1 modellierten Modell heraus kann der User einen Sim-Lauf starten, den Status verfolgen und die JSONL-Trace herunterladen. Worker-Isolation (1 Worker = 1 OS-Prozess = 1 `s_verteil`-Singleton) ist strikt durchgesetzt.
**Depends on**: Phase 1 (OViewer für Sim-Konfig-Dialog, OTX-Persistenz als Modell-Quelle)
**Success Criteria** (what must be TRUE):
  1. User startet Sim-Lauf via Konfig-Dialog (Seed, Start-/End-Datum, Perioden-Länge) im PSimulatorViewer
  2. UI zeigt Status `queued → running → succeeded|failed` via 2-s-Polling
  3. Cancel-Button bricht laufenden Worker sauber ab
  4. Worker-Isolation: 1 OS-Prozess je Run; PAWLICEK-LCG-Singleton-Vertrag eingehalten
  5. Identischer Seed + identisches Modell ⇒ bit-identische Trace
  6. Per-Run Hard-Timeout (Default 10 min) markiert hängende Läufe als `failed`
  7. Nach Erfolg: Summary-Panel + Trace-Download als Signed URL
**Canonical refs**:
  - .planning/phases/02-sim-lauf/02-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md (PSimulator-API)
**Plans**: TBD (Vorplan in `02-PRELIMINARY-PLAN.md` mit 4 Wellen)

### Phase 3: JSON Editor
**Goal**: User legt OSim-Modelle direkt im UI als JSON an (ohne `.otx`-Upload). JSON-Schema wird per Engine-Reflection generiert — Engine bleibt Single Source of Truth. Form-Editor ist Alternative zum OViewer-Framework für strukturierte Felder; beide Editierwege bleiben verfügbar.
**Depends on**: Phase 1 (OViewer-Framework als Vergleichs-/Ergänzungs-Path) + Phase 2 (für Simulation neu angelegter Modelle) + Engine-Voraussetzungen E2.1–E2.6 im `osim-engine`-Repo
**Success Criteria** (what must be TRUE):
  1. `python -m osim_engine.schema dump` liefert vollständiges JSON-Schema aller Modell-Klassen
  2. Frontend rendert Form-Editor automatisch aus Schema (z.B. via `@rjsf/core` + shadcn-Theme)
  3. Minimal-Modell (1 Auslöser + 2 Knoten + 1 Kante) im Browser anlegbar
  4. Round-Trip-Test OTX→JSON→Sim ergibt bit-identischen Trace zu OTX→Sim
  5. Schema-Validation lehnt invalide Modelle mit klarer Fehlermeldung ab
  6. Custom-Widgets für Verteilungen, GObjType-Picker, Knoten-Referenzen
**Canonical refs**:
  - .planning/phases/03-json-editor/03-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md
**Plans**: TBD (Vorplan in `03-PRELIMINARY-PLAN.md` mit 5 Wellen)

### Phase 4: Live Viz
**Goal**: GraphObject-Schicht voll ausbauen (vollständiger TypeScript-Port von `GraphObj.h`) und damit den ersten Live-Konsumenten realisieren: Live-Visualisierung des Durchlaufplans mit Status-Animation und KPI-Dashboard. WebSocket-Channel ersetzt das Polling aus Phase 2.
**Depends on**: Phase 1 (GraphObject-Basis), Phase 2 (Sim-Lauf als Datenquelle), Phase 3 (JSON-Modell-Format für Live-Konsum)
**Success Criteria** (what must be TRUE):
  1. Durchlaufplan wird graphisch mit ein-/ausgehenden Kanten korrekt dargestellt
  2. Knoten färben sich live während Sim-Lauf (<500 ms Latenz)
  3. Hierarchische Sub-Pläne (`GObjSub`) via Doppelklick öffenbar
  4. Region-Check funktioniert (Klick-Mitte = Edit, Rand = Link-ziehen)
  5. Live-KPI-Charts: Sim-Zeit, abgeschlossene Pläne, Maschinen-Auslastung (<1 s Update)
  6. Performance: 30 FPS @ 50 Knoten
  7. WebSocket-Channel `/ws/runs/{id}` ersetzt das 2-s-Polling aus Phase 2
  8. Foundation-Bereitschaft: GraphObject-API stabil für Phase-6- und Phase-7+-Konsumenten
**Canonical refs**:
  - .planning/phases/04-live-viz/04-PRELIMINARY-PLAN.md
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `04-PRELIMINARY-PLAN.md` mit 7 Wellen — Vorlage aus alter Phase 3)

### Phase 5: Cloud Parallel
**Goal**: Aus Single-Host-MVP wird horizontal skalierbare Cloud-App. Eigenes GCP-Projekt, Worker als Cloud Run Jobs, Cloud Tasks Queue, Pub/Sub-Live-Events, Multi-Run-Aggregation.
**Depends on**: Phase 4 (für Live-Viz-Multiplexing über Pub/Sub)
**Success Criteria** (what must be TRUE):
  1. GCP-Projekte `osim-ui-staging` und `osim-ui-prod` mit IAM, Workload-Identity, Secret-Manager
  2. Cloud Build deployt API + Worker + Portal automatisch
  3. Multi-Run mit `repeats=10` läuft, Aggregation funktioniert
  4. Pub/Sub-basiertes Live-Streaming funktioniert über API-Replicas hinweg
  5. Per-Tenant-Quota + Per-Run-Timeout durchgesetzt
  6. Stress-Test 10 User × 5 Runs in <60 min ohne Stau
**Canonical refs**:
  - .planning/phases/05-cloud-parallel/05-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `05-PRELIMINARY-PLAN.md` mit 7 Wellen — Vorlage aus alter Phase 4)

### Phase 6: Reports
**Goal**: User exportiert Sim-Ergebnisse als PDF (druckbar), Excel/CSV (Weiterverarbeitung), JSON-Bundle (Sharing). HKA-Klausur-Template und Steinbeis-Beratungs-Brief eingebaut.
**Depends on**: Phase 5 (für skaliertes Report-Worker-Pattern)
**Success Criteria** (what must be TRUE):
  1. PDF-Generation in <10 s mit allen Original-KPIs
  2. Klausur-Datenblatt-Template (HKA) und Beratungs-Brief-Template (Steinbeis) verfügbar
  3. Multi-Run-Report mit Mean/Median/CI über alle Sub-Runs
  4. CSV/Excel-Export mit korrekter Formatierung
  5. JSON-Bundle (Modell + Config + Trace + KPIs) als ZIP downloadbar
**Canonical refs**:
  - .planning/phases/06-reports/06-PRELIMINARY-PLAN.md
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `06-PRELIMINARY-PLAN.md` mit 6 Wellen — Vorlage aus alter Phase 5)

### Phase 7: 3fls Iframe
**Goal**: osim-ui ist als Iframe im 3fls-Portal eingebunden. 3fls-User klickt "Simulation" und ist direkt im osim-ui ohne erneuten Login.
**Depends on**: Phase 5 (separate GCP-Projekte stehen) + Phase 6 (Feature-vollständig)
**Success Criteria** (what must be TRUE):
  1. 3fls-Portal hat Navigations-Item "Simulation" → öffnet `/simulation` Route mit iframe
  2. On-Behalf-Token-Exchange funktioniert (3fls-Token → osim-ui-Custom-Token)
  3. Iframe ist responsive (Auto-Resize via PostMessage)
  4. Standalone-Modus von osim-ui bleibt voll funktional
  5. CSP-Header erlauben Embedding NUR durch tbx_stzrim
**Canonical refs**:
  - .planning/phases/07-3fls-iframe/07-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `07-PRELIMINARY-PLAN.md` mit 5 Wellen — Vorlage aus alter Phase 6)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OViewer + OTX-Modellierung | 13/13 | Complete   | 2026-05-21 |
| 2. Sim-Lauf + Trace | 0/TBD | Not started | - |
| 3. JSON Editor | 0/TBD | Not started | - |
| 4. Live Viz | 0/TBD | Not started | - |
| 5. Cloud Parallel | 0/TBD | Not started | - |
| 6. Reports | 0/TBD | Not started | - |
| 7. 3fls Iframe | 0/TBD | Not started | - |

## Backlog (post-v0.1.0)

| Idee | Mögliche Phase | Notiz |
|---|---|---|
| Visueller Drag-and-Drop Modell-Editor | 8 | React-Flow als Editor; Knoten-Palette aus GObjType-Enum |
| Ressourcen-/Matrix-/Gantt-Viewer (Vollausbau) | 8 | weitere GraphObject-Subklassen über die Phase-1-Matrix-Viewer hinaus |
| Auto-Generation aller ~30 Viewer per Reflection | 8 | aus Bereich-B-Option-C der Phase-1-Discussion |
| DAG-Pläne | 9 | sobald Engine v2 verfügbar |
| Tutorial-Tour | — | HKA-Lehre |
| `AZeitSim.exe`-Interop | — | Win32-Bestandsmodelle |
| Modell-Vergleich Side-by-Side | — | Klausur-Auswertung |
| Versioning / Modell-Branches | — | iteratives Beratungsmodell |
| Audit-Log | — | Beratungs-Compliance |
| Datenimport aus SAP-Stammdaten (via 3fls) | — | Beratungsprojekte |
| Visueller Report-Template-Editor | — | über Phase 6 hinaus |
| Module Federation statt Iframe | — | Phase-7-Upgrade |
