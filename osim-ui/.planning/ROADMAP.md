# Roadmap: osim-ui

## Overview

Vom leeren Repo zur vollwertigen Sim-Web-App mit Modellierungs-Werkzeug, Sim-Lauf, Live-Visualisierung, parallelen Cloud-Workern, Reports und 3fls-Integration. Sieben Phasen, ~14â€“20 Wochen fÃ¼r v0.1.0.

## Querschnitts-Foundations

Vier Bausteine ziehen sich durch ALLE Phasen â€” nicht phasen-spezifisch:

1. **OViewer-Schicht (`portal/src/viewers/core/`)** â€” TypeScript-Port des C++-`OViewer`-Patterns aus `OSim2004/inc/OViewer.h`. Hybrid-Pattern: `ViewerFrame`/`ClientCtrl` als TS-Klassen, `ChildDialog`/`ChildCtrl` als React-Components. VollstÃ¤ndige 9-er `OCtrl`-Familie. Wird in Phase 1 erstgebaut; ALLE konkreten Viewer (Phase 1 Property-/Matrix-Viewer, Phase 3 Form-Editor, Phase 4 graphische Live-Viewer, Phase 6+ Report-/Chart-/Gantt-Viewer) bauen darauf auf.

2. **GraphObject-Schicht (`portal/src/graph/core/`)** â€” TypeScript-Port von `OSim2004/inc/GraphObj.h` (GObject/GObjLink/GLink/GraphView/GraphGrid/Region-Check/Phantom/4-Layer-Drawing). Wird in Phase 1 angerissen (Basis-Klassen fÃ¼r `PDurchlaufplanViewer-Design`), in Phase 4 vollausgebaut; spÃ¤tere graphische Viewer (Phase 6 Charts, Phase 7+ Matrix/Gantt) erweitern.

3. **Engine-Reflection-Schema** â€” JSON-Schema aller Modell-Klassen per Engine-Reflection generiert, nicht hand-geschrieben. Phase 3 etabliert es, alle spÃ¤teren Modell-Erweiterungen profitieren.

4. **3fls-Pattern-KonformitÃ¤t** â€” wo immer 3fls eine etablierte Konvention hat, Ã¼bernimmt osim-ui sie 1:1.

## Phases

- [x] **Phase 1: OViewer-Framework + OTX-Modellierung** â€” Backend-Foundation, OViewer-Schicht, 12 konkrete Viewer, OTX-im-Browser-Bearbeitung (completed 2026-05-21)
- [ ] **Phase 1.1: UI-Polish & LList-Resolution** (INSERTED) â€” Workspace demo-tauglich machen: GraphView des Durchlaufplans als primÃ¤rer Use-Case erreichbar, OCtrlList traversiert Engine-LListPtr-Ketten, Tree navigierbar, kompakte Modell-Bibliothek, Viewer-Toolbar mit Funktion, eigenes Brand-Design
- [ ] **Phase 1.2: Matrix-Foundation + erste Matrix-Viewer** (INSERTED) â€” Graph-Foundation erweitern um Matrix-Cell-Rendering, Spalten-/Zeilen-Header, Inline-Cell-Editing, Block-Select/Copy/Paste. Als Konsumenten: PRessBelegMatrixViewer (kanonisches Matrix-Beispiel), PDlplConnKnotenViewer (Graph-Detail), PRessVerknuepfungViewer (Graph mit Kennzahl-Vorgriff).
- [ ] **Phase 1.3: PAssozMenge Wire-Roundtrip + PRessMengeMatrixViewer-Migration** (INSERTED) â€” Engine-A2-Vorarbeit: OTX-Wire-Roundtrip fÃ¼r die 4 PAssozMenge-Subklassen (Erzgt/Verbr/VerbrZwischen/Abfr) im osim-engine; danach Migration des PRessMengeMatrixViewer von der Legacy-matrix-common.tsx auf die @osim/graphobject Matrix-Foundation. SchlieÃŸt das aus Phase 01.2 Track A deferred A2-Backlog ab.
- [ ] **Phase 2: Sim-Lauf + Trace** â€” Worker, Orchestrator, Status-Polling, Trace-Download
- [ ] **Phase 3: JSON Editor** â€” Engine-Reflection-Schema + Form-Editor (Alternative zum OViewer fÃ¼r strukturierte Felder)
- [ ] **Phase 4: Live Viz** â€” GraphObject-Vollausbau + Durchlaufplan-Live-View + KPI-Charts + WebSocket
- [ ] **Phase 5: Cloud Parallel** â€” Eigenes GCP-Projekt + Cloud Run Jobs + Pub/Sub + Multi-Run
- [ ] **Phase 6: Reports** â€” PDF/Excel/CSV/JSON-Bundle, HKA + Steinbeis Templates
- [ ] **Phase 7: 3fls Iframe** â€” Iframe-Embedding in tbx_stzrim mit On-Behalf-Token-Exchange

## Phase Details

### Phase 1: OViewer-Framework + OTX-Modellierung
**Goal**: Ein angemeldeter User kann ein `.otx`-Modell hochladen, im Browser Ã¼ber das OViewer-Framework (TypeScript-Port des C++-OViewer-Patterns) vollstÃ¤ndig bearbeiten â€” Properties, Anlegen, LÃ¶schen, VerknÃ¼pfen â€” und periodisch zurÃ¼ck in OTX speichern. Multi-Tenant ab Tag 1, volle FastAPI-Backend-Foundation.
**Depends on**: Engine-Erweiterung "OTX-Writer" (`osim_engine.io.otx_writer.dump_simulator_to_otx`) als Welle 0 dieser Phase im osim-engine-Repo.
**Success Criteria** (what must be TRUE):
  1. `docker compose up` startet alle Dev-Services (Postgres, Firebase-Emulator, Minio)
  2. User kann sich via Firebase-Emulator registrieren und einloggen; Tenant-Schema wird lazy beim ersten `/api/v1/auth/me` angelegt
  3. User kann `Vorstellung04/Dummy.otx` hochladen â†’ Server parst (Engine), liefert JSON-Tree â†’ Sidebar-Tree-Navigation zeigt Modell-Hierarchie
  4. Alle 12 konkreten Viewer sind funktionsfÃ¤hig: `PSimulatorViewer`, `PDurchlaufplanViewer-Standard`, `PDurchlaufplanViewer-Design` (graphisch via GraphObject-Basis + React Flow), `PGObjBaseViewer`, drei Ressourcen-Matrix-Viewer (`PRessBeleg`, `PRessMenge`, `PRessVerknuepfung`), zwei VerknÃ¼pfungs-Viewer (`PDlplBetriebsmittel`, `PDlplPersonal`), drei Arbeitszeit-Viewer (`AEinsatzWunsch`, `AKapBed`, `AGruppe`)
  5. VollstÃ¤ndige 9-er `OCtrl`-Familie ist implementiert (Variable, Bool, Enum, Link, List, Method, TabViewer, COLORREF, LOGFONT)
  6. Edit-Operationen vollstÃ¤ndig: Properties editieren, Objekte anlegen, lÃ¶schen, VerknÃ¼pfungen neu zeichnen
  7. Auto-Save alle 30 s + manueller Speichern-Button + IndexedDB-Snapshot pro Ã„nderung + Single-Editor-Lock auf Modell-Ebene
  8. Save-back schreibt versionierte OTX-Datei in Storage (kein In-Place-Overwrite); Original-Upload unverÃ¤ndert
  9. Multi-Tenant-Schemas sind angelegt; alle Queries laufen im richtigen Schema (`search_path` per Request)
**Canonical refs**:
  - .planning/phases/01-vertical-slice/01-CONTEXT.md (verbindlich)
  - .planning/phases/01-vertical-slice/01-DISCUSSION-LOG.md (Audit-Trail)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (PflichtlektÃ¼re)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h (fÃ¼r Design-Viewer)
  - .planning/research/osim-engine-api.md
  - .planning/research/3fls-patterns.md
  - .planning/research/copy-paste-guide.md
  - .planning/research/osim2004-ui-analysis.md
  - .planning/PROJECT.md
  - docs/ARCHITECTURE.md
**Plans**: 12 plans in 7 Wellen (siehe Plan-Liste unten)
Plans:
- [x] 01-01-engine-roundtrip-verify-PLAN.md â€” Welle 0: OTX-Writer Coverage-Verifikation gegen Dummy/Fertigungsstruktur1/Bosch2
- [x] 01-02-backend-foundation-PLAN.md â€” Welle 1: FastAPI-Foundation (Config, DB, Auth-Middleware, RFC-7807, Alembic, Lazy-Bootstrap)
- [x] 01-03-frontend-foundation-PLAN.md â€” Welle 1: Vite + TanStack-Router + Firebase-Client + apiFetch + Auth-Provider
- [x] 01-04-storage-models-locks-api-PLAN.md â€” Welle 2: Storage-Abstraktion, Models-API, Single-Editor-Lock-Service
- [x] 01-05-compose-stack-integration-tests-PLAN.md â€” Welle 2: docker-compose + Integration-Tests (auth, isolation, models, locks)
- [x] 01-06-oviewer-core-octrl-family-PLAN.md â€” Welle 3: OViewer-Foundation (5 Files) + 9 OCtrl-Components
- [x] 01-07-property-schema-store-sidebar-workspace-PLAN.md â€” Welle 3: PropertySchema + ModelStore + Sidebar + Workspace-Route
- [x] 01-08-viewers-property-PLAN.md â€” Welle 4: 8 Property-Viewer (PSimulator/PDurchlaufplanStd/PGObjBase/PDlplÃ—2/AZeitÃ—3)
- [x] 01-09-viewers-matrix-PLAN.md â€” Welle 4: 3 Matrix-Viewer (PRessBeleg/PRessMenge/PRessVerknuepfung)
- [x] 01-10-graphobject-design-viewer-PLAN.md â€” Welle 5: GraphObject-Basis + PDurchlaufplanViewerDesign (React Flow)
- [x] 01-11-save-strategy-indexeddb-PLAN.md â€” Welle 6: Auto-Save + IndexedDB + Lock-Heartbeat + StatusBar
- [x] 01-12-e2e-modeling-flow-PLAN.md â€” Welle 6: Playwright E2E-Tests (modeling-flow, lock-conflict, snapshot-restore)

### Phase 1.1: GraphObject-Foundation + UI-Polish & LList-Resolution (INSERTED)
**Goal**: 1:1-funktionale TypeScript-Portierung der C++-`GraphObject`-Schicht aus OSim2004 als Foundation fÃ¼r ALLE graphischen Viewer in osim-ui â€” Datenstrukturen, Algorithmen, Listen-Topologie, Region-Check, Phantom-Preview, GOIns/Remove/Move-Mechanik exakt wie im Original. Auf dieser Foundation wird der `PDurchlaufplanViewer-Design` als erster Konsument neu gebaut. Im Anschluss UI-Polish-Restschuld + LList-Resolution + Demo-Smoke-Test.
**Depends on**: Phase 1 (komplett abgenommen â€” alle 12 Viewer registriert, Backend-CRUD lauffÃ¤hig, E2E 3/3 grÃ¼n).
**Success Criteria** (what must be TRUE):
  1. **GraphObject-Foundation 1:1-Port** (hÃ¶chste PrioritÃ¤t, Welle 0): VollstÃ¤ndige TypeScript-Portierung der C++-Klassen aus `OSim2004/inc/GraphObj.h` + zugehÃ¶rige `OG*.cpp` â€” `GObject`, `GObjLink`, `GLink`, `GLinkPoint`, `GLinkSquare`, `OGPosition`, `OGPositionGrid`, `GOGridCol`, `GOGridRow`, `OGraphCollection`, `OGraphList`, `OGraphGrid` (mit GOIns/GORemove/GetNextFreeGridPlace/IsGridPlaceTaken/InsertColBefore/InsertRowBefore/RemoveCol/RemoveRow), `OGraphView`, **`GObjSub` mit nested Sub-Grids und D_CLOSED/D_OPEN-State** (siehe SC-2). FunktionalitÃ¤t exakt wie Original; Visualisierung darf modern sein. Volle Unit-Test-Coverage gegen die in `01.1-GRAPHOBJ-NOTES.md` Â§17 spezifizierten Verhaltensgarantien plus die in CONTEXT D-1.1-21 spezifizierten GObjSub-Tests. Welle-Reihenfolge folgt Â§19 der Notes (A: Typen/Konstanten â†’ B: Domain inkl. `GObjSub` â†’ C: OGraphGrid â†’ D: GLink/Routing â†’ E: View-Adapter mit nested-Sub-Grid-Render â†’ F: Interaktionen inkl. Open/Close + IsParentFrom + Phantom â†’ G: Integration).
  2. **Nested Knoten / hierarchische Sub-Grids (`GObjSub`)** (kritisch, Pflicht-Subset von SC-1): Ein `GObjSub`-Knoten kann INNERHALB seiner Ã¤uÃŸeren Rect einen eigenen `OGraphGrid` fÃ¼hren, der wieder `GObjSub`-Knoten enthalten kann â€” beliebig tief geschachtelt. State-Maschine D_CLOSED â†” D_OPEN. `SetChildsVisible(BOOL)` schaltet Sichtbarkeit rekursiv. `IsParentFrom(obj, rekursiv=TRUE)` walks Parent-Kette. `GetCollection(virtp)` liefert die innerste Collection unter dem Cursor. 4-Layer-Drawing (Background â†’ Kinder â†’ Foreground â†’ Helpers) wird durchgereicht. Verifizierung: rekursive Open/Close, GrÃ¶ÃŸen-Anpassung bei GOIns ins Sub-Grid, Hit-Test auf Tiefe â‰¥3.
  3. **Original-Symbole als SVG**: Pflicht-Set von ~25 SVG-Symbolen aus `OSim2004/bmp/` + `OSim2004/ico/` (App-Logo, Tree-Group-Icons, Knoten-Klass-Icons, Toolbar-Icons) im `portal/src/assets/symbols/`-Verzeichnis. Original-BMPs in `.planning/assets/osim2004-original/` archiviert. Tree/Toolbar/Workspace nutzen ausschlieÃŸlich die neuen SVGs statt der heutigen `lucide-react`-Icons. Conversion-Skript `scripts/convert-osim-symbols.py` reproduzierbar. Optisch in das Brand-Schema integriert (Outline brand-700, Fill brand-100).
  4. **PDurchlaufplanViewer-Design auf GraphObject-Foundation**: Der existierende React-Flow-basierte Design-Viewer (Plan 1-10) wird auf die neue GraphObject-Foundation migriert. `OsimCustomNode` rendert ein `GObject` Ã¼ber React-Flow; Drag/Connect/Delete dispatchen in den GraphObject-State (`OGraphGrid.goIns`/`goRemove`/`moveMe`). Position-Drag und Knoten-HinzufÃ¼gen gehen Ã¼ber die Foundation, nicht Ã¼ber Direct-Store-Dispatch. Sub-PlÃ¤ne (`GObjSub`) sind direkt im Design-Viewer Ã¶ffenbar (Doppelklick / Toolbar-Button), nicht erst in Phase 4.
  5. **GraphView-Reachability**: User lÃ¤dt Dummy.otx, klickt im Tree auf einen Durchlaufplan, sieht graphische Knoten-/Kanten-Darstellung. Position-Drag funktioniert, Knoten hinzufÃ¼gen funktioniert, Sub-Plan-Doppelklick Ã¶ffnet die Sub-Hierarchie inline, Save persistiert.
  6. **LList-Resolution im Backend**: `wire_to_otx`/`load_to_wire` traversieren Engine-LListPtr-Ketten und liefern dem Frontend `sub_refs[]: number[]` als echte OID-Arrays statt OID-Pointer-Integer. Damit zeigen OCtrlList-Sektionen (AuslÃ¶ser-Liste, Knoten-Liste, etc.) die tatsÃ¤chlichen Sub-Objekte.
  7. **Sidebar-Tree navigierbar**: Default-State zeigt nur Top-Level-Gruppen. Sub-Gruppen lazy expandiert auf Click. Suchleiste oben filtert. Sinnvolle Labels (m_sName mit Fallback auf Klass-Kurzform). Performance bei 30k+ Objekten (Bosch) bleibt brauchbar.
  8. **Modell-Bibliothek kompakt**: Tabelle/List-View statt 3-Spalten-Karten-Grid. E2E-Test-Modelle automatisch gefiltert.
  9. **ViewerFrame-Toolbar verdrahtet**: 7 Buttons (Â« â€¹ â€º Â» + â†» Ã—) mit Tooltips, Navigation/Create/Reset/Delete in `onCommand` voll implementiert. Sim-Lauf-Button im PSimulatorViewer wird zu "Phase 2"-Hinweis.
 10. **Visuelles Design**: Brand-Farbschema (OSim-IdentitÃ¤t, nicht shadcn-Default), Workspace-Header mit Modell-Name + Breadcrumb, Lock-/Save-Status prominenter Indikator. SVG-Symbole integriert.
 11. **Demo-Smoke-Test**: Playwright-Spec verifiziert Login â†’ Bibliothek â†’ Workspace â†’ Tree â†’ GraphView (mit Knoten/Kanten gerendert auf der neuen Foundation, inkl. einem Sub-Plan-Open/Close-Schritt).
**Canonical refs**:
  - .planning/phases/01.1-ui-polish-llist/01.1-GRAPHOBJ-NOTES.md (verbindliche Algorithmen-Vorlage fÃ¼r Welle 0; Â§19 = Welle-Reihenfolge, Â§17 = Test-Spec, Â§20 = Invarianten)
  - .planning/phases/01.1-ui-polish-llist/01.1-CONTEXT.md
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h (PflichtlektÃ¼re â€” 2913 Zeilen)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\ofc\OGGrid.cpp, OGObject.cpp, OGObjLink.cpp, OGLink.cpp, OGLinkPo.cpp, OGLinkSqr.cpp, OGView.cpp, OGObjElements.cpp, OGObjODlp.cpp, OGObjRect.cpp, OGObjSqr.cpp, OGCollec.cpp, OGfxCtrl.cpp, OGBlock.cpp, OGGridCtrl.cpp, OGGridAlt.cpp (Implementierungs-Quellen)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (Toolbar-Semantik)
  - osim-engine LListPtr-Implementation (fÃ¼r Backend-Resolution)

### Phase 1.2: Matrix-Foundation + erste Matrix-Viewer (INSERTED)
**Goal**: GraphObject-Foundation um die Mechanik erweitern, die alle Matrix-basierten OSim2004-Viewer brauchen (DrawCells-Hook, Header-Rows, Inline-Cell-Edit, Block-Select/Copy/Paste), und damit drei kanonische Viewer aus dem Audit-Katalog implementieren: `PRessBelegMatrixViewer` (Matrix), `PDlplConnKnotenViewer` (Graph-Detail), `PRessVerknuepfungViewer` (Graph mit Kennzahl-Vorgriff). Damit ist die zweite Viewer-Familie der OSim-Suite (Pattern 3: Matrix-Viewer aus dem Katalog) erreichbar â€” ohne dass spÃ¤tere Sim-Auswertungen oder Cloud-Phasen darauf warten mÃ¼ssen.
**Depends on**: Phase 1.1 (komplett abgenommen â€” GraphObject-Foundation inkl. GObjSub-Multi-Grid stabil, PDurchlaufplanViewerDesign produktiv, alle UAT-Punkte verifiziert).
**Success Criteria** (what must be TRUE):
  1. **OGraphGrid.DrawCells-Hook**: Foundation bietet einen renderer-agnostischen Cell-Renderer-Hook (analog OSim2004 `PMatrixBaseViewerOGCtrl::DrawCells()` aus PRessBelegMatrixViewer.cpp). Pro Matrix-Cell kann der Konsument Custom-Inhalt liefern (Text, Farbe, Icon, Status-Indikator). Cell-Inhalt ist NICHT GObject-basiert (Cells sind Wire-Daten-getrieben), aber Cell-Position und -GrÃ¶ÃŸe folgen dem OGraphGrid-Layout.
  2. **Spalten-/Zeilen-Header**: OGraphGrid unterstÃ¼tzt eine separate Header-Reihe (oben) und Header-Spalte (links) mit Custom-Content. Headers scrollen mit beim horizontalen/vertikalen Scrolling, bleiben aber bei Cross-Achse fixiert (Excel-Pattern). Header-Klick triggert Sort/Filter-Callback (Konsument entscheidet).
  3. **Inline-Cell-Editing**: Click auf eine Matrix-Cell setzt sie in Edit-Mode (Textbox-Overlay). Enter speichert, ESC bricht ab. Foundation liefert nur die Mechanik (Focus + Edit-State); Cell-Wert-Validierung und Wire-Persistierung ist Konsumenten-Sache. Read-only-Cells Ã¼berspringen Edit-Mode.
  4. **Block-Select**: Drag-Rectangle auf der Matrix selektiert eine Cell-Range. Selektion ist visuell sichtbar (Cyan-Outline 1:1 zum 3FLS-EAM-Style-Guide). Shift+Click extendet Selektion. Ctrl+Click toggelt einzelne Cells.
  5. **Block-Copy/Paste**: Ctrl+C kopiert selektierte Cell-Range in ein Custom-Clipboard-Format (analog OSim2004 `PMatrixBaseViewerOGCtrl::CopyCell2Buffer` aus OGGrid.cpp). Ctrl+V paste an die aktive Cell, mit Validierung dass die Quelle ins Ziel passt. Cross-Viewer-Paste (zwischen verschiedenen Matrix-Viewern) ist mÃ¶glich, solange die Cell-Typen kompatibel sind.
  6. **PRessBelegMatrixViewer als kanonischer Konsument**: Zeilen = `PRessBeleg`-Objekte (Ressourcen-Belegungen), Spalten = `PDlplKnoten` (Durchlaufplan-Knoten), Cells = `PAssozBeleg`-Assoziationen oder leer. Combobox-View-Modi (ALL/PERS/RESS) filtern Zeilen. Combobox-Verknuepfungs-Modus (AND/OR) Ã¤ndert Cell-Visualisierung. Live im Browser: Modell laden â†’ Plan auswÃ¤hlen â†’ PRessBelegMatrixViewer Ã¶ffnet sich als Tab im Workspace â†’ Cells edit + Block-Copy funktionieren.
  7. **PDlplConnKnotenViewer**: Detail-Viewer fÃ¼r einen einzelnen Durchlaufplan-Knoten â€” zeigt seine zugeordneten Ressourcen-Belegungen und Speicher-Assoziationen als kleinen Graph (Knoten zentral, Ressourcen/Speicher auÃŸenrum, Assoz-Links dazwischen). Verbindungs-Validierung folgt OSim2004-Regeln (PDlplConnKnotenViewer.cpp).
  8. **PRessVerknuepfungViewer**: zeigt fÃ¼r eine Ressource ihre VerknÃ¼pfungen zu allen Durchlaufplan-Knoten als Graph (links: TTY-Ã¤hnliches Ressourcen-Gitter, rechts: Graph der verknÃ¼pften Knoten). Kennzahl-Anzeige-Slot vorgesehen aber inaktiv (Phase 4 aktiviert ihn).
  9. **Foundation-Tests + Viewer-Tests**: Mindestens 15 neue Vitest-Specs fÃ¼r die Foundation-Mechanik (DrawCells-Hook, Header-Sticky, Inline-Edit-State-Machine, Block-Select, Clipboard-Format). Pro Viewer 1 Smoke-Test (rendert ohne Crash, akzeptiert User-Input).
 10. **E2E-Verifikation**: Playwright-Spec lÃ¤dt Modell, Ã¶ffnet Plan, wechselt in PRessBelegMatrixViewer-Tab, editiert eine Cell, prÃ¼ft Persistenz nach F5.
**Canonical refs**:
  - .planning/research/osim2004-viewer-catalog.md (vollstÃ¤ndiger Viewer-Katalog mit Foundation-Gap-Analyse â€” Welle G26)
  - .planning/phases/01.1-ui-polish-llist/01.1-GRAPHOBJ-NOTES.md (Foundation-Vertrag â€” Pflicht-Invarianten gelten weiter)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessBelegMatrixViewer.cpp + .h
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PDlplConnKnotenViewer.cpp + .h
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessVerknuepfungViewer.cpp + .h
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PGObjBaseViewer.h (Graph-Viewer-Base, geteilte Helpers)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\ofc\OGGrid.cpp (DrawCells + CopyCell2Buffer/PasteCellFromBuffer)

**Plans**: 9 plans in 6 Wellen
Plans:
- [x] 01.2-01-PLAN.md â€” Welle 0: Pre-Cleanup (Stub-Diagnose + User-Entscheidung + LÃ¶sch der erfundenen PRessVerknuepfung-Klass)
- [x] 01.2-02-PLAN.md â€” Welle A: Foundation MatrixGrid + MatrixCell + Sticky-Headers (â‰¥15 Specs)
- [x] 01.2-03-PLAN.md â€” Welle B: useInlineCellEdit Hook (Lift aus matrix-common)
- [x] 01.2-04-PLAN.md â€” Welle C: useBlockSelection Hook (Pure-Functions + Ctrl/Shift-Click)
- [x] 01.2-05-PLAN.md â€” Welle D: matrix-clipboard (Copy/Paste mit Custom-MIME)
- [x] 01.2-06-PLAN.md â€” Welle E: PRessBelegMatrixViewer kanonisch (C++-Audit + 2D-Matrix + Combobox-Toolbar)
- [x] 01.2-07-PLAN.md â€” Welle F: PDlplConnKnotenViewer (Graph-Detail + Listener-no-op-Hook)
- [x] 01.2-08-PLAN.md â€” Welle G: PRessVerknuepfungViewer (Graph + Kennzahl-Slot-Placeholder)
- [ ] 01.2-09-PLAN.md â€” Welle H: E2E-Spec + UAT-Checkliste + Phase-Sign-Off

### Phase 1.3: PAssozMenge Wire-Roundtrip + PRessMengeMatrixViewer-Migration (INSERTED)
**Goal**: Vorbereiten und ausfÃ¼hren der A2-Backlog-Welle aus Phase 01.2 Track A. Engine erhÃ¤lt OTX-Wire-Roundtrip fÃ¼r die vier `PAssozMenge`-Subklassen (`PAssozMengeErzgt` / `PAssozMengeVerbr` / `PAssozMengeVerbrZwischen` / `PAssozMengeAbfr`) analog zum existierenden `PAssozBeleg`-Pattern (`engine/src/osim_engine/io/otx_writer.py:917-946`, `otx_loader.py:782-797`). AnschlieÃŸend Migration des `PRessMengeMatrixViewer` (osim-ui) von der Legacy-`matrix-common.tsx` auf die `@osim/graphobject` Matrix-Foundation analog zum `PRessBelegMatrixViewer`. Damit liegt die Material-Familie der OSim-Suite auf demselben Wire+UI-Stand wie die Belegungs-Familie und das Track-A-A2-Defer aus Session 2026-05-28b ist abgeschlossen.
**Depends on**: Phase 1.2 (Matrix-Foundation stabil, `@osim/graphobject`-Paket etabliert, `PRessBelegMatrixViewer` als Referenz-Implementation). Phase 1.1 (GraphObject-Foundation fÃ¼r Matrix-Cells).
**Success Criteria** (what must be TRUE):
  1. **C++-Audit**: `PAssozRessource.odh` + `PAssozRessource.cpp` sind auditiert, alle im OTX persistierten Attrs der PAssozMenge-Subklassen sind in einem AUDIT-Doc dokumentiert (m_iMengeAus fÃ¼r Erzgt, m_iMengeEin fÃ¼r Verbr/VerbrZwischen, abfr-spezifische Felder).
  2. **Engine: PAssozMenge-OTX-Loader-Handler**: `engine/src/osim_engine/io/otx_loader.py` hat Class-Handler fÃ¼r `PAssozMenge`, `PAssozMengeErzgt`, `PAssozMengeVerbr`, `PAssozMengeVerbrZwischen`, `PAssozMengeAbfr`. Handler instanziieren die existierenden Sim-Klassen aus `engine/src/osim_engine/resources/assoziation/menge.py`, lesen `m_sName` + spezifische Mengen-Attrs, resolven `m_lMengRess`-Pointer auf `PRessMenge`.
  3. **Engine: PAssozMenge-OTX-Writer**: `engine/src/osim_engine/io/otx_writer.py` hat Writer fÃ¼r die 4 konkreten Subklassen. Writer schreiben `m_sName` + die jeweils zutreffenden Mengen-Felder (Erzgt: `m_iMengeAus`; Verbr/VerbrZwischen: `m_iMengeEin`; Abfr: ggf. `m_iMengeAbfrage`).
  4. **Round-Trip-Tests**: Mindestens ein Demo-OTX mit PAssozMenge-Instanzen (Vorlage: `v5_erzeuger_verbraucher.otx` oder ein konstruiertes Fixture) round-trippt: `load_to_wire â†’ wire_to_otx â†’ load_to_wire` ergibt strukturell identische Sim-State (gleiche Anzahl PAssozMenge*-Objekte, identische Attr-Werte, intakte Kollektionsverkettung).
  5. **Engine-Tests grÃ¼n**: Alle existierenden Roundtrip-Tests (Stand: 70+) bleiben grÃ¼n; neue Tests fÃ¼r PAssozMenge (â‰¥ 8 â€” pro Subklasse mindestens 1 Roundtrip + 1 Multi-Instance-Test) sind grÃ¼n; `uv run pytest` zeigt 0 Regressionen.
  6. **Schema-Export fÃ¼r UI**: API-Endpoint `/api/v1/schemas` (oder das beim Modul-Import eingelesene `app/static/schemas/v1/schemas.json`) liefert die PAssozMenge-Subklassen mit korrekten Attrs fÃ¼r UI-Konsum; Schema-Generator (`python -m osim_engine.schema dump` oder Reflection-Pfad) deckt die neuen Handler ab.
  7. **PRessMengeMatrixViewer migriert**: `osim-ui/portal/src/viewers/PRessMenge/PRessMengeMatrixViewer.tsx` nutzt `MatrixGrid` aus `@osim/graphobject` (analog `PRessBelegMatrixViewer`). Zeilen = PRessMenge-Objekte (oder die zugewiesenen Material-Instanzen), Spalten = `PDlplKnoten`, Cells = PAssozMenge-Status/-Menge. `matrix-common.tsx` ist gelÃ¶scht; keine Konsumenten mehr.
  8. **PRessMengeMatrixViewer-Tests**: Mindestens 8 Vitest-Specs fÃ¼r 2D-Matrix-Rendering, Cell-Edit, Block-Copy/Paste â€” analog `PRessBelegMatrixViewer`-Spec-Familie. Plus mindestens 1 Clipboard-Spec fÃ¼r Document-Listener-Verdrahtung.
  9. **UI-Wire-Edit funktioniert**: Live im Browser: Modell mit PAssozMenge-Instanzen laden â†’ Plan auswÃ¤hlen â†’ PRessMengeMatrixViewer als Tab im Workspace Ã¶ffnen â†’ Cell-Edit funktioniert (Persistenz hÃ¤ngt am gleichen Save-/Lock-Stand wie Welle 1.2-H; falls Bug noch offen, Ã¼bernehmen wir denselben Stand statt eines neuen).
 10. **E2E-Smoke**: Playwright-Spec lÃ¤dt Demo-Modell mit PAssozMenge, navigiert zum `PRessMengeMatrixViewer`, editiert eine Cell, prÃ¼ft mindestens Foundation-Mechanik (Block-Copy/Paste-Cycle analog `matrix-cell-edit-persistence.spec.ts` Test 2). Persistenz-Test gegen Engine-Round-Trip darf `test.fixme` sein, falls Save-/Lock-Bug aus 1.2-H noch offen.
**Canonical refs**:
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PAssozRessource.odh (Class-Definitionen PAssozMenge*)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PAssozRessource.cpp (Sim-Methoden + Attr-Persistierung)
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\OSimPro\PRessMengeMatrixViewer.cpp + .h (Original-UI-Vorlage)
  - engine/src/osim_engine/resources/assoziation/menge.py (existierende Sim-Resource-Klassen)
  - engine/src/osim_engine/io/otx_writer.py:917-946 (_make_assoz_writer + PAssozBeleg-Pattern als Schablone)
  - engine/src/osim_engine/io/otx_loader.py:782-797 (_PAssozBelegHandler-Pattern als Schablone)
  - osim-ui/portal/src/viewers/PRessBelegMatrix/PRessBelegMatrixViewer.tsx (Referenz-UI-Migration)
  - osim-ui/portal/src/viewers/PRessMenge/matrix-common.tsx (zu lÃ¶schende Legacy-Implementation)
  - osim-ui/portal/packages/graphobject/src/matrix/ (MatrixGrid + MatrixCell als Foundation-Target)
  - .planning/STATE.md (Track-A-A2-Defer-Notiz vom 2026-05-28b)
**Plans**: 7 plans in 5 Wellen
Plans:
- [ ] 01.3-01-PLAN.md - Welle 1: C++-Audit PAssozMenge*-Attrs + LinkStatusList-Analogie + Test-Fixture-Vorschlag (AUDIT.md)
- [ ] 01.3-02-PLAN.md - Welle 2: Engine otx_loader.py - 5 Handler (PAssozMenge + 4 Subklassen) + Unit-Tests
- [ ] 01.3-03-PLAN.md - Welle 2: Engine otx_writer.py - 5 Writer + Unit-Tests
- [ ] 01.3-04-PLAN.md - Welle 3: Engine Round-Trip-Tests (>=8) + Demo-OTX-Fixture passozmenge_minimal.otx
- [ ] 01.3-05-PLAN.md - Welle 3: Schema-Patch schemas.json + API-Container-Sync
- [ ] 01.3-06-PLAN.md - Welle 4: UI PRessMengeMatrixViewer-Rewrite auf @osim/graphobject MatrixGrid + matrix-common.tsx loeschen + Toolbar
- [ ] 01.3-07-PLAN.md - Welle 5: UI Vitest-Specs (>=8) + Clipboard-Spec + Playwright-E2E + Phase-Sign-Off

### Phase 2: Sim-Lauf + Trace
**Goal**: Aus dem in Phase 1 modellierten Modell heraus kann der User einen Sim-Lauf starten, den Status verfolgen und die JSONL-Trace herunterladen. Worker-Isolation (1 Worker = 1 OS-Prozess = 1 `s_verteil`-Singleton) ist strikt durchgesetzt.
**Depends on**: Phase 1 (OViewer fÃ¼r Sim-Konfig-Dialog, OTX-Persistenz als Modell-Quelle)
**Success Criteria** (what must be TRUE):
  1. User startet Sim-Lauf via Konfig-Dialog (Seed, Start-/End-Datum, Perioden-LÃ¤nge) im PSimulatorViewer
  2. UI zeigt Status `queued â†’ running â†’ succeeded|failed` via 2-s-Polling
  3. Cancel-Button bricht laufenden Worker sauber ab
  4. Worker-Isolation: 1 OS-Prozess je Run; PAWLICEK-LCG-Singleton-Vertrag eingehalten
  5. Identischer Seed + identisches Modell â‡’ bit-identische Trace
  6. Per-Run Hard-Timeout (Default 10 min) markiert hÃ¤ngende LÃ¤ufe als `failed`
  7. Nach Erfolg: Summary-Panel + Trace-Download als Signed URL
**Canonical refs**:
  - .planning/phases/02-sim-lauf/02-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md (PSimulator-API)
**Plans**: TBD (Vorplan in `02-PRELIMINARY-PLAN.md` mit 4 Wellen)

### Phase 3: JSON Editor
**Goal**: User legt OSim-Modelle direkt im UI als JSON an (ohne `.otx`-Upload). JSON-Schema wird per Engine-Reflection generiert â€” Engine bleibt Single Source of Truth. Form-Editor ist Alternative zum OViewer-Framework fÃ¼r strukturierte Felder; beide Editierwege bleiben verfÃ¼gbar.
**Depends on**: Phase 1 (OViewer-Framework als Vergleichs-/ErgÃ¤nzungs-Path) + Phase 2 (fÃ¼r Simulation neu angelegter Modelle) + Engine-Voraussetzungen E2.1â€“E2.6 im `osim-engine`-Repo
**Success Criteria** (what must be TRUE):
  1. `python -m osim_engine.schema dump` liefert vollstÃ¤ndiges JSON-Schema aller Modell-Klassen
  2. Frontend rendert Form-Editor automatisch aus Schema (z.B. via `@rjsf/core` + shadcn-Theme)
  3. Minimal-Modell (1 AuslÃ¶ser + 2 Knoten + 1 Kante) im Browser anlegbar
  4. Round-Trip-Test OTXâ†’JSONâ†’Sim ergibt bit-identischen Trace zu OTXâ†’Sim
  5. Schema-Validation lehnt invalide Modelle mit klarer Fehlermeldung ab
  6. Custom-Widgets fÃ¼r Verteilungen, GObjType-Picker, Knoten-Referenzen
**Canonical refs**:
  - .planning/phases/03-json-editor/03-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md
**Plans**: TBD (Vorplan in `03-PRELIMINARY-PLAN.md` mit 5 Wellen)

### Phase 4: Live Viz
**Goal**: GraphObject-Schicht voll ausbauen (vollstÃ¤ndiger TypeScript-Port von `GraphObj.h`) und damit den ersten Live-Konsumenten realisieren: Live-Visualisierung des Durchlaufplans mit Status-Animation und KPI-Dashboard. WebSocket-Channel ersetzt das Polling aus Phase 2.
**Depends on**: Phase 1 (GraphObject-Basis), Phase 2 (Sim-Lauf als Datenquelle), Phase 3 (JSON-Modell-Format fÃ¼r Live-Konsum)
**Success Criteria** (what must be TRUE):
  1. Durchlaufplan wird graphisch mit ein-/ausgehenden Kanten korrekt dargestellt
  2. Knoten fÃ¤rben sich live wÃ¤hrend Sim-Lauf (<500 ms Latenz)
  3. Hierarchische Sub-PlÃ¤ne (`GObjSub`) via Doppelklick Ã¶ffenbar
  4. Region-Check funktioniert (Klick-Mitte = Edit, Rand = Link-ziehen)
  5. Live-KPI-Charts: Sim-Zeit, abgeschlossene PlÃ¤ne, Maschinen-Auslastung (<1 s Update)
  6. Performance: 30 FPS @ 50 Knoten
  7. WebSocket-Channel `/ws/runs/{id}` ersetzt das 2-s-Polling aus Phase 2
  8. Foundation-Bereitschaft: GraphObject-API stabil fÃ¼r Phase-6- und Phase-7+-Konsumenten
**Canonical refs**:
  - .planning/phases/04-live-viz/04-PRELIMINARY-PLAN.md
  - C:\Users\JÃ¶rgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `04-PRELIMINARY-PLAN.md` mit 7 Wellen â€” Vorlage aus alter Phase 3)

### Phase 5: Cloud Parallel
**Goal**: Aus Single-Host-MVP wird horizontal skalierbare Cloud-App. Eigenes GCP-Projekt, Worker als Cloud Run Jobs, Cloud Tasks Queue, Pub/Sub-Live-Events, Multi-Run-Aggregation.
**Depends on**: Phase 4 (fÃ¼r Live-Viz-Multiplexing Ã¼ber Pub/Sub)
**Success Criteria** (what must be TRUE):
  1. GCP-Projekte `osim-ui-staging` und `osim-ui-prod` mit IAM, Workload-Identity, Secret-Manager
  2. Cloud Build deployt API + Worker + Portal automatisch
  3. Multi-Run mit `repeats=10` lÃ¤uft, Aggregation funktioniert
  4. Pub/Sub-basiertes Live-Streaming funktioniert Ã¼ber API-Replicas hinweg
  5. Per-Tenant-Quota + Per-Run-Timeout durchgesetzt
  6. Stress-Test 10 User Ã— 5 Runs in <60 min ohne Stau
**Canonical refs**:
  - .planning/phases/05-cloud-parallel/05-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `05-PRELIMINARY-PLAN.md` mit 7 Wellen â€” Vorlage aus alter Phase 4)

### Phase 6: Reports
**Goal**: User exportiert Sim-Ergebnisse als PDF (druckbar), Excel/CSV (Weiterverarbeitung), JSON-Bundle (Sharing). HKA-Klausur-Template und Steinbeis-Beratungs-Brief eingebaut.
**Depends on**: Phase 5 (fÃ¼r skaliertes Report-Worker-Pattern)
**Success Criteria** (what must be TRUE):
  1. PDF-Generation in <10 s mit allen Original-KPIs
  2. Klausur-Datenblatt-Template (HKA) und Beratungs-Brief-Template (Steinbeis) verfÃ¼gbar
  3. Multi-Run-Report mit Mean/Median/CI Ã¼ber alle Sub-Runs
  4. CSV/Excel-Export mit korrekter Formatierung
  5. JSON-Bundle (Modell + Config + Trace + KPIs) als ZIP downloadbar
**Canonical refs**:
  - .planning/phases/06-reports/06-PRELIMINARY-PLAN.md
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `06-PRELIMINARY-PLAN.md` mit 6 Wellen â€” Vorlage aus alter Phase 5)

### Phase 7: 3fls Iframe
**Goal**: osim-ui ist als Iframe im 3fls-Portal eingebunden. 3fls-User klickt "Simulation" und ist direkt im osim-ui ohne erneuten Login.
**Depends on**: Phase 5 (separate GCP-Projekte stehen) + Phase 6 (Feature-vollstÃ¤ndig)
**Success Criteria** (what must be TRUE):
  1. 3fls-Portal hat Navigations-Item "Simulation" â†’ Ã¶ffnet `/simulation` Route mit iframe
  2. On-Behalf-Token-Exchange funktioniert (3fls-Token â†’ osim-ui-Custom-Token)
  3. Iframe ist responsive (Auto-Resize via PostMessage)
  4. Standalone-Modus von osim-ui bleibt voll funktional
  5. CSP-Header erlauben Embedding NUR durch tbx_stzrim
**Canonical refs**:
  - .planning/phases/07-3fls-iframe/07-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `07-PRELIMINARY-PLAN.md` mit 5 Wellen â€” Vorlage aus alter Phase 6)

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

| Idee | MÃ¶gliche Phase | Notiz |
|---|---|---|
| Visueller Drag-and-Drop Modell-Editor | 8 | React-Flow als Editor; Knoten-Palette aus GObjType-Enum |
| Ressourcen-/Matrix-/Gantt-Viewer (Vollausbau) | 8 | weitere GraphObject-Subklassen Ã¼ber die Phase-1-Matrix-Viewer hinaus |
| Auto-Generation aller ~30 Viewer per Reflection | 8 | aus Bereich-B-Option-C der Phase-1-Discussion |
| DAG-PlÃ¤ne | 9 | sobald Engine v2 verfÃ¼gbar |
| Tutorial-Tour | â€” | HKA-Lehre |
| `AZeitSim.exe`-Interop | â€” | Win32-Bestandsmodelle |
| Modell-Vergleich Side-by-Side | â€” | Klausur-Auswertung |
| Versioning / Modell-Branches | â€” | iteratives Beratungsmodell |
| Audit-Log | â€” | Beratungs-Compliance |
| Datenimport aus SAP-Stammdaten (via 3fls) | â€” | Beratungsprojekte |
| Visueller Report-Template-Editor | â€” | Ã¼ber Phase 6 hinaus |
| Module Federation statt Iframe | â€” | Phase-7-Upgrade |

