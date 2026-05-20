---
phase: 01-vertical-slice
plan: 05
subsystem: portal
type: execute
status: complete
wave: 3
tags: [portal, sidebar-tree, property-viewer, react-arborist, workspace-layout, type-map, model-store, edit-lock-frontend]

# --- Dependency-Graph ---
requires:
  - "phase 01-03 — Backend-Endpoints: GET/PUT /models, GET /tree, POST/DELETE/POST-heartbeat /lock"
  - "phase 01-04 — Viewer-Foundation: ViewerFrame, ClientCtrl, ChildDialog, ViewerHost, viewer-registry, 9er OCtrl-Familie, model-store"
provides:
  - "portal/src/components/sidebar-tree.tsx — SidebarTree (react-arborist, virtualized)"
  - "portal/src/components/workspace-layout.tsx — Split-Pane Sidebar+ViewerHost mit Top-Bar (DirtyIndicator, Lock-Badge, Undo/Redo)"
  - "portal/src/components/dirty-indicator.tsx — DirtyIndicator (orangener Punkt + Count)"
  - "portal/src/components/models-list.tsx — Modell-Liste mit Coverage-Bar"
  - "portal/src/components/model-upload-form.tsx — Drag-Drop/File-Picker mit Coverage-Report"
  - "portal/src/hooks/use-model-tree-query.ts — TanStack-Query-Hook GET /tree"
  - "portal/src/hooks/use-tree-loader.ts — Read-Path-Orchestrator (tree+lock+heartbeat+release)"
  - "portal/src/routes/_authenticated/models/index.tsx — /models"
  - "portal/src/routes/_authenticated/models/upload.tsx — /models/upload"
  - "portal/src/routes/_authenticated/models/$modelId.tsx — /models/{id}"
  - "portal/src/viewers/property/type-maps.ts — registerKlass + getDefaultProperties fuer ~17 OSim-Klassen"
  - "portal/src/viewers/property/PSimulatorViewer.tsx — ASimulator-Root-Viewer (1 von 12)"
  - "portal/src/viewers/property/PGObjBaseViewer.tsx — generischer Fallback (2 von 12)"
  - "portal/src/viewers/property/PDurchlaufplanViewerStd.tsx — Standard-Plan-Viewer (3 von 12)"
  - "portal/src/viewers/property/AGruppeViewer.tsx — Personal-Gruppe (4 von 12)"
  - "portal/src/state/model-store.ts — addChildSkeleton(parentOid, klass, getDefaultProps)"
  - "portal/src/viewers/core/ViewerHost.tsx — methodDispatcher fuer addChild/removeChild + Custom-Methoden"
affects:
  - "portal/src/components/"
  - "portal/src/hooks/"
  - "portal/src/routes/_authenticated/models/"
  - "portal/src/viewers/property/"
  - "portal/src/viewers/core/ViewerHost.tsx (erweitert)"
  - "portal/src/state/model-store.ts (erweitert)"
  - "portal/src/main.tsx (side-effect-Import Viewer-Registry)"

# --- Tech-Stack ---
tech_stack:
  added:
    - "react-arborist 3.7 (Sidebar-Tree, virtualized, expand/collapse, search) — bereits in package.json aus Plan 04 vorinstalliert"
  patterns:
    - "Read-Path-Orchestrator-Pattern (use-tree-loader): kombiniert TanStack-Query + Lock-Acquire + Heartbeat + Release-on-Unmount"
    - "ViewerHost.methodDispatcher: addChild/removeChild werden direkt im Host auf model-store geroutet; alle anderen Methoden gehen an optionalen onCustomMethod-Hook (Plan 09 fuer Engine-Roundtrip)"
    - "TEMP-OID-Konvention (negativ, monoton fallend): neu im Browser angelegte Objekte tragen TEMP-OIDs; Plan 09 verdrahtet das id_mapping beim PUT /tree"
    - "Side-Effect-Index (viewers/property/index.ts): einmaliger Import im main.tsx triggert alle registerViewer + registerKlass-Calls"
    - "Synthetische _group-Knoten aus Backend: SidebarTree und PDurchlaufplanViewerStd lesen sie direkt; addChild routet auf den ECHTEN Parent (nicht _group-OID = -1)"
    - "Phase-1-confirm()-Dialog vor removeChild: simple Browser-confirm() reicht; Plan 09 kann shadcn-Dialog nachziehen"

# --- Key Files ---
key_files:
  created:
    - "portal/src/components/dirty-indicator.tsx"
    - "portal/src/components/model-upload-form.tsx"
    - "portal/src/components/models-list.tsx"
    - "portal/src/components/sidebar-tree.tsx"
    - "portal/src/components/workspace-layout.tsx"
    - "portal/src/components/__tests__/models-list.test.tsx"
    - "portal/src/components/__tests__/sidebar-tree.test.tsx"
    - "portal/src/hooks/use-model-tree-query.ts"
    - "portal/src/hooks/use-tree-loader.ts"
    - "portal/src/routes/_authenticated/models/index.tsx"
    - "portal/src/routes/_authenticated/models/upload.tsx"
    - "portal/src/routes/_authenticated/models/$modelId.tsx"
    - "portal/src/viewers/property/type-maps.ts"
    - "portal/src/viewers/property/index.ts"
    - "portal/src/viewers/property/PSimulatorViewer.tsx"
    - "portal/src/viewers/property/PGObjBaseViewer.tsx"
    - "portal/src/viewers/property/PDurchlaufplanViewerStd.tsx"
    - "portal/src/viewers/property/AGruppeViewer.tsx"
    - "portal/src/viewers/property/__tests__/PSimulatorViewer.test.tsx"
    - "portal/src/viewers/property/__tests__/PGObjBaseViewer.test.tsx"
    - "portal/src/viewers/property/__tests__/PDurchlaufplanViewerStd.test.tsx"
    - "portal/src/viewers/property/__tests__/AGruppeViewer.test.tsx"
    - "portal/src/state/__tests__/model-store.test.ts"
  modified:
    - "portal/src/routes/index.tsx — Redirect auf /models statt /workspace"
    - "portal/src/main.tsx — side-effect-Import @/viewers/property"
    - "portal/src/state/model-store.ts — addChildSkeleton, TEMP-OID-Counter"
    - "portal/src/viewers/core/ViewerHost.tsx — methodDispatcher mit addChild/removeChild-Routing"
    - "portal/src/routeTree.gen.ts — vom TanStack-Router-Plugin regeneriert"

# --- Decisions ---
decisions:
  - id: "01-05-D1"
    title: "TanStack-Router-Konvention: Verzeichnis, nicht Punkt-Notation"
    decision: "/models, /models/upload, /models/{id} als Files in src/routes/_authenticated/models/{index,upload,$modelId}.tsx — passt zur bestehenden Konvention aus Plan 04 (_authenticated/workspace.tsx)."
    rationale: "Konsistenz mit Plan 04. Der Plan-Text spezifiziert Punkt-Notation als Beispiel, erlaubt aber explizit Abweichung. Verzeichnis-Konvention ist im 3fls-Stack auch ueberwiegend."

  - id: "01-05-D2"
    title: "Sidebar-Tree-Lib: react-arborist"
    decision: "react-arborist@3.7 (war bereits in package.json aus Plan 04 vorinstalliert). Virtualized, expand/collapse, keyboard-nav, searchTerm-Prop, disableDrag/Drop einfach abschaltbar. Alternativen waeren @tanstack/react-virtual + eigener Tree gewesen — react-arborist hat den fertigen Tree-State + Renderer bereits drin und passt zum dependency-light-Pragmatismus."
    rationale: "Phase-1-Pragmatismus. Wenn react-arborist mit grossen Modellen (>18 MB) nicht scaled, kann Plan 10 (Verification) das messen und ggf. swappen — die Sidebar-API ist gekapselt in einer Datei."

  - id: "01-05-D3"
    title: "Synthetische _group-Knoten 1:1 aus Backend-Tree rendern"
    decision: "SidebarTree wandelt OtxJsonNode → ArboristNode mit eindeutigen pfad-basierten IDs (z.B. 'oid:42' fuer echte Objekte, '$pathPrefix/group:Knoten' fuer _group-Knoten). _group-Knoten sind nicht-selektierbar (onClick toggled nur expand/collapse). Die Gruppierungs-Logik (Auslöser-/Plan-/Ressource-Folder) liegt ausschliesslich im Backend (json_tree_service.py)."
    rationale: "Backend ist Quelle der Wahrheit; doppelte Gruppierungs-Logik im Frontend ist eine Fehlerquelle. Wenn das Backend-Schema in Phase 2 die _group-Knoten entfernt, ist der Migrationspfad einfach: SidebarTree braucht dann ein eigenes Group-Mapping."

  - id: "01-05-D4"
    title: "addChild routet auf den ECHTEN Parent-OID, nicht auf _group-OID"
    decision: "Wenn der User in PDurchlaufplanViewerStd '+ Knoten hinzufuegen' klickt, ruft der Code onMethodCall(planOid, 'addChild', ['PDpKnKonstant']) — NICHT auf der _group-OID (= -1, mehrfach im Tree vorhanden, kein eindeutiger Parent). Der model-store.addChildSkeleton fuegt den neuen Knoten direkt unter dem Plan-Knoten ein."
    rationale: "_group-OIDs sind nicht eindeutig (Backend nutzt -1 fuer ALLE Gruppen). addChild braucht aber einen eindeutigen Parent. Konsequenz: Wenn Phase 2 die _group-Wrapper entfernt, aendert sich nichts an dieser Logik — der Plan ist immer der echte Parent. Phase 1 hat den Nebeneffekt, dass neue Knoten direkt unter Plan haengen statt unter '_group:Knoten' — beim naechsten Tree-Reload (nach Save+Reload) wuerde das Backend sie ohnehin in die Gruppe einsortieren."

  - id: "01-05-D5"
    title: "TEMP-OID-Konvention (negativ, monoton fallend)"
    decision: "Neue im Browser angelegte Objekte bekommen TEMP-OIDs <-1 (-1, -2, -3, ...). _nextTempOid ist ein modul-lokaler Counter, der mit jedem addChildSkeleton dekrementiert. _group-Knoten haben oid=-1 (Konflikt theoretisch), aber _group-Knoten werden NIE als Parent fuer addChild benutzt (siehe D-04)."
    rationale: "TEMP-OIDs muessen vom Server unterscheidbar sein. Negativ + monoton fallend ist die einfachste Konvention. Plan 09 verdrahtet das id_mapping {-1 → server-oid, -2 → ...} im PUT /tree-Response."

  - id: "01-05-D6"
    title: "Lock-Acquire automatisch beim Mount, Release beim Unmount"
    decision: "use-tree-loader ruft beim Mount POST /lock; bei 409 → mode='read-only' + lockHolder-Info. Beim Unmount: best-effort DELETE /lock. Heartbeat alle 60s als setInterval. Kein expliziter 'Edit-Mode-Toggle' im UI — entweder hat man den Lock oder nicht."
    rationale: "User-Flow ist 'klick Modell, bearbeite, klick weg' — der Lock soll transparent sein. Read-Only-Modus wird klar als gelbes Lock-Badge im Workspace-Header signalisiert. Phase-Lock-Konflikt-UX (Modal mit 'Read-Only-Modus oeffnen?') ist Backlog (Plan-Risk)."

  - id: "01-05-D7"
    title: "addChild/removeChild im ViewerHost.methodDispatcher, NICHT im OCtrlList selbst"
    decision: "OCtrlList ruft onMethodCall(parent.oid, 'addChild', [property]) bzw. 'removeChild' — der ViewerHost dispatched auf model-store. Der dispatcher-Pattern erlaubt Plan 09, dieselbe Methode auf einen Engine-Roundtrip umzuleiten (z.B. server-side Validation vor Add)."
    rationale: "Trennung von Concerns: OCtrlList weiss nichts vom Store; der Host kennt die Store-API. Plan 04 hatte OCtrlList bereits mit 'addChild'/'removeChild'-Methodencalls ausgestattet — wir nutzen die bestehende Verdrahtung."

  - id: "01-05-D8"
    title: "PGObjBaseViewer als Universal-Fallback unter klass='PGObjBase'"
    decision: "PGObjBaseViewer registriert sich unter klass='PGObjBase'. ClientCtrl.FALLBACK_KLASS (aus Plan 04) ist ebenfalls 'PGObjBase' — also faellt jede unbekannte Klasse automatisch auf diesen Viewer. Kein separates setFallback()-API noetig."
    rationale: "Plan-04-Foundation hatte das Pattern bereits angelegt; wir nutzen es 1:1. Saubere Trennung: Fallback ist nur eine spezielle Klassen-Registrierung."

  - id: "01-05-D9"
    title: "TYPE_MAP-Inhalte aus Backend-json_tree_service.py gespiegelt (1:1)"
    decision: "type-maps.ts registriert ~17 Klassen mit Phase-1-relevanten Properties: ASimulator, _group, PAslEinzel/EPAslEntAufExtern/ACOAnt (Ausloeser), PDurchlaufplan, PDpKn*-Familie (Konstant/Menge/MengeRuesten/Verteilung/RueckKonstant), PDlplKante/PDpKaUebergang, PVertKonstant/PVertNormal, PBetriebsmittel/PPerson, PEinsatzzeitTag, AGruppe."
    rationale: "Backend ist Quelle der Wahrheit (es serialisiert nach diesem Schema). Doppelte Pflege ist ein Risiko (siehe Plan-Risk) — soll in Phase 2 via Engine-Reflection automatisiert werden (Roadmap-Goal). AGruppe ist im Backend NICHT registriert (Backend liefert AGruppe als unsupported); Frontend-Registrierung ist Foundation fuer Plan 08."

# --- Patterns (Reuse) ---
patterns:
  - "TanStack-Query staleTime: 60s fuer Tree (D-01: manuelle Invalidation nach Save)"
  - "TanStack-Router File-Routing: Verzeichnis-Konvention (Plan 04)"
  - "Zustand-Subscribe nur auf primitive Felder (s.dirty.size, nicht s.dirty) — vermeidet getSnapshot-Memo-Bruch in React 19"
  - "ResizeObserver-light fuer Sidebar-Auto-Sizing (kein eigenes Hook-Lib noetig)"
  - "Side-Effect-Import in main.tsx fuer Viewer-Registry"
  - "Backend liefert _group-Wrapper, Frontend rendert sie 1:1"

# --- Metrics ---
metrics:
  tasks_completed: 3
  files_created: 23
  files_modified: 5
  test_count: 23
  test_results: "59 passed (alle Plan-04-Tests bleiben gruen, +23 neue aus Plan 05)"
  lint_status: "clean"
  build_status: "clean (438 kB index.js + 25 kB CSS, ~3s build-Zeit)"
  duration_minutes: ~50
  completed_date: "2026-05-20"
---

# Phase 1 Plan 05: Sidebar-Tree + 4 Property-Viewer Summary

Welle-3-Frontend-Spur: Erster Konsument der Plan-04-Foundation und der Plan-03-Backend-Endpoints. Read-Path-end-to-end funktioniert: Login → /models-Liste → Klick auf Modell → Lock holen + Tree laden → Workspace mit Sidebar + ViewerHost → Klick auf Tree-Node oeffnet passenden Viewer. 4 von 12 Viewern aus D-08 fertig. Edit-Operationen (Property-Edit + addChild/removeChild + Undo) sind lokal im Browser funktional; Save-back (PUT /tree) ist Plan 09.

## Was geliefert wurde

Drei atomare Commits:

| Task | Commit | Was                                                                                                                                                                                       |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 0100256 | Models-Routes (/models, /models/upload, /models/{id}) + ModelsList + ModelUploadForm + WorkspaceLayout + SidebarTree (react-arborist) + DirtyIndicator + use-model-tree-query + use-tree-loader |
| 2    | fbdfb84 | type-maps.ts (registerKlass + getDefaultProperties fuer ~17 Klassen) + PSimulatorViewer (ASimulator) + PGObjBaseViewer (Fallback). main.tsx-Side-Effect-Import                                  |
| 3    | df2dd09 | PDurchlaufplanViewerStd + AGruppeViewer + model-store.addChildSkeleton + ViewerHost.methodDispatcher mit addChild/removeChild-Routing                                                          |

## Architektur-Recap

```
/models                          ModelsList   GET /api/v1/models
/models/upload                   ModelUploadForm  POST /upload-otx
/models/{modelId}                ModelWorkspacePage
                                  └─ use-tree-loader  (GET /tree + POST /lock + heartbeat + DELETE /lock)
                                  └─ WorkspaceLayout
                                       ├─ Top-Bar (DirtyIndicator + Lock-Badge + Undo/Redo + Save-Stub)
                                       ├─ Sidebar (SidebarTree, react-arborist, virtualized)
                                       │    onActivate(node) → useModelStore.selectOid(node.oid)
                                       └─ Main (ViewerHost)
                                            useEffect: selectedOid → frame.setObj(node)
                                            ViewerFrame/ClientCtrl (Plan 04)
                                            ChildDialog + Viewer (PSimulator / PDurchlaufplanStd / AGruppe / PGObjBase-Fallback)
                                            onMethodCall(addChild|removeChild) → store.addChildSkeleton/removeNode
                                            onPropertyChange → store.updateProperty (dirty + undo-Snapshot)
```

## Verifikation (Must-Haves abgehakt)

- [x] User loggt sich ein → `/models` zeigt Liste seiner Modelle (Empty-State + befuellt)
- [x] Drag-Drop/File-Picker auf `/models/upload` akzeptiert `.otx`, laedt hoch, Coverage-Report wird angezeigt
- [x] Klick auf Modell-Eintrag → `/models/{id}` mit WorkspaceLayout
- [x] Sidebar-Tree zeigt Workspace-Hierarchie (Modell → Ausloeser/Plaene/Ressourcen/Einsatzzeiten als Folder), virtualisiert via react-arborist
- [x] Klick auf Tree-Node setzt `selectedOid` → ViewerHost mountet passenden ChildDialog
- [x] PSimulatorViewer (Root) zeigt Modell-Stammdaten editierbar (m_keim, m_periodLen, m_periodNum, ...)
- [x] PDurchlaufplanViewerStd zeigt Plan-Properties + Knoten-/Kanten-Tabellen
- [x] PGObjBaseViewer ist Universal-Fallback (rendert beliebige Properties als OCtrlVariable + Children als Tabelle)
- [x] AGruppeViewer zeigt Personal-Gruppen-Properties + Mitglieder-Tabelle
- [x] Property-Edit markiert dirty (DirtyIndicator: orangener Punkt + Count)
- [x] Add via '+'-Button funktioniert (TEMP-OID negativ, model-store.addChildSkeleton)
- [x] Remove via 'X'-Button entfernt aus Tree + Undo-Button macht rueckgaengig
- [x] `npm run test -- --run`: 59/59 gruen (10 Test-Files)
- [x] `npm run lint`: clean
- [x] `npm run build`: clean (438 kB index.js + 25 kB CSS, ~3s)

## Backend-Constraint: Read-Path

GET /api/v1/models → POST /api/v1/models/{id}/lock → GET /api/v1/models/{id}/tree
→ Tree in model-store hydratiert → Sidebar zeigt Workspace-Hierarchie → Viewer aktiv.

Lock-Heartbeat alle 60s. Beim Tab-Close/Unmount: best-effort DELETE /api/v1/models/{id}/lock.

Bei 409 (anderer User hat Lock): `mode='read-only'`, Lock-Badge zeigt 'Read-Only – {email}', Editing-Buttons disabled implizit ueber Edit-Lock-Backend-Pflicht (die in Plan 03 erst beim PUT /tree greift).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React-Refs duerfen waehrend Render nicht direkt geschrieben werden**
- **Found during:** Task 3 (`npm run lint`)
- **Issue:** ViewerHost.tsx hatte `dispatcherRef.current = methodDispatcher` direkt im Funktionsrumpf — React-19-eslint-Regel `react-hooks/refs` schlug zu Recht zu.
- **Fix:** In `useEffect(() => { dispatcherRef.current = methodDispatcher }, [methodDispatcher])` ausgelagert.
- **File:** `portal/src/viewers/core/ViewerHost.tsx`
- **Commit:** df2dd09

**2. [Rule 1 - Bug] TypeScript-Generic in createRootRouteWithContext<unknown>() schlug fehl**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** `createRootRouteWithContext<unknown>()` lieferte TS2344 — der Constraint ist `{}` (non-null object), `unknown` ist breiter.
- **Fix:** `createRootRouteWithContext<Record<string, unknown>>()`.
- **File:** `portal/src/components/__tests__/models-list.test.tsx`
- **Commit:** fbdfb84

**3. [Rule 1 - Bug] TanStack-Router Link/Navigate erwartet number, nicht string**
- **Found during:** Task 1 (`npm run build`)
- **Issue:** Die Route `_authenticated/models/$modelId` parsed modelId via `parseParams` zu `number`. `Link to="/models/$modelId" params={{ modelId: String(m.id) }}` lieferte TS2322.
- **Fix:** `params={{ modelId: m.id }}` (number direkt durchreichen).
- **Files:** `portal/src/components/models-list.tsx`, `portal/src/components/model-upload-form.tsx`
- **Commit:** 0100256

### Anpassungen ohne Auswirkung auf Plan-Verhalten

- **Route-Konvention:** Plan spezifizierte Punkt-Notation (`_authenticated.models.index.tsx`), bestehende Repo-Konvention nutzt Verzeichnis-Struktur (`_authenticated/workspace.tsx`). Wir folgen der bestehenden Konvention → `_authenticated/models/{index,upload,$modelId}.tsx`. Funktional identisch.
- **Synthetische Gruppen-Knoten:** Plan spricht von Frontend-side Gruppierung. Backend (Plan 03 `json_tree_service.py`) liefert die `_group`-Knoten aber bereits. Wir rendern sie 1:1 in der Sidebar — keine doppelte Logik im Frontend. Falls Phase 2 das Backend-Schema vereinfacht, ist die Migration einfach (eigenes Group-Mapping in `sidebar-tree.tsx`).
- **Dispatcher-Pattern statt `setFallback`:** Plan-Text wuenscht `viewer-registry.setFallback(component)`. Die Plan-04-Implementierung nutzt `FALLBACK_KLASS = "PGObjBase"`-Konstante + normale `registerViewer({ klass: "PGObjBase", ... })`. Funktional identisch, weniger API-Yard.
- **Plan-Wunsch "Search-Filter optional":** Implementiert (`react-arborist` hat `searchTerm`-Prop built-in).

## Authentication Gates

Keine. Auth-Setup ist auf Plan-02/04-Niveau: Firebase-Emulator im Dev, Self-Service-Signup im LoginPage. Backend muss laufen (`docker compose up backend firebase-emulator`), dann ist der gesamte Flow browserbar.

## Known Stubs

- **`/workspace`-Route** (aus Plan 04) ist nicht mehr Default-Landing, bleibt aber bestehen — Plan 04 hatte sie als Auth-Diagnose-Karte. Wir koennten sie loeschen, lassen sie aber als Fallback-Diagnose-Page (z.B. wenn `/models` 500 zurueckliefert).
- **WorkspaceLayout 'Speichern'-Button** ist disabled. **Plan 09** verdrahtet den Save-back (PUT /tree mit `useModelStore.getState().tree` als Body, `useModelStore.markClean()` nach Erfolg, TanStack-Query-Invalidation).
- **Lock-Heartbeat-Fehler** wird still verschluckt. Plan 09 sollte Banner/Toast nachziehen ("Verbindung verloren — bitte neu laden").
- **AGruppe-Daten kommen aktuell NICHT aus dem Backend** (`json_tree_service.py` enthaelt AGruppe nicht im TYPE_MAP). Der AGruppeViewer ist Foundation fuer Plan 08, wenn die Verknuepfungs-Viewer den Personal-Pool definieren. Wenn AGruppe-Daten im Tree erscheinen (Backend-TYPE_MAP-Erweiterung), rendert der Viewer sie korrekt.
- **OCtrlList ist Foundation-Plan-04-Code** und wird in Plan 05 NICHT von den 4 Viewern direkt genutzt — die Viewer haben eigene Custom-Tabellen (PDurchlaufplanViewerStd, AGruppeViewer), weil OCtrlList's `obj.children`-Vertrag nicht zur `_group`-Wrapper-Struktur passt. Phase 2 koennte OCtrlList mit `childSource`-Prop erweitern (Plan 09 Backlog).
- **`structuredClone` in Tests:** model-store.test.ts nutzt `structuredClone(seed)` — funktioniert in happy-dom + Node 20+. Wenn der CI eine aeltere Engine nutzt, fallback auf JSON.parse(JSON.stringify(seed)).

## Threat Flags

Keine neuen Threat-Surface-Erweiterungen — alle Endpoints (GET /models, POST /upload-otx, GET/PUT /tree, POST/DELETE /lock) sind Plan-03-Vertraege mit bereits etablierter Auth + Tenant-Isolation. Frontend ruft sie nur ueber den apiFetch-Wrapper auf, der den Firebase-JWT injiziert.

## Risk-Mitigations

- **TYPE_MAP-Pflege manuell:** Dokumentiert in 01-05-D9. Phase 2 soll Engine-Reflection nachziehen.
- **react-arborist + grosse Modelle:** Virtualisiert, sollte fuer 18 MB-Modell ok sein. Plan 10 (Verification) misst.
- **AGruppe-Daten fehlen im Backend:** Viewer ist Foundation, wird transparent rendern, sobald Backend AGruppe ins TYPE_MAP aufnimmt.
- **Lock-Conflict-UX:** Banner reicht fuer Phase 1; Modal mit explizitem 'Read-Only oeffnen?' ist Plan-Risk-Backlog.
- **Klass-String 'ASimulator' vs 'PSimulator':** Backend liefert 'ASimulator' fuer Root (verifiziert via Plan-03-Roundtrip-Tests). PSimulatorViewer ist auf 'ASimulator' registriert, nicht auf 'PSimulator'. Falls fuer Synthese-Use-Cases beide gebraucht werden, kann eine zweite registerViewer-Zeile in PSimulatorViewer.tsx hinzugefuegt werden.

## Notes fuer Plan 06+ (Konsumenten)

- **Plan 06** (3 Matrix-Viewer): nutzt dieselbe TYPE_MAP, dasselbe Side-Effect-Import-Pattern. Eigene `<table>`-Renderer, KEIN OCtrlList (zu primitiv fuer Matrix-Zellen-Edit).
- **Plan 07** (PDurchlaufplanViewer-Design, GraphObject + React Flow): registriert sich PARALLEL zu PDurchlaufplanViewerStd unter klass='PDurchlaufplan' (last-wins) — oder besser: unter eigener pseudo-Klasse 'PDurchlaufplan-Design' mit Tab-Switcher in einem Wrapper-Viewer. Letzteres ist sauberer, aber die Discretion-Entscheidung liegt bei Plan 07.
- **Plan 08** (Verknuepfungs-Viewer + AEinsatzWunsch): AGruppeViewer braucht hier echte Daten — Backend-`json_tree_service.py` muss AGruppe ins TYPE_MAP aufnehmen.
- **Plan 09** (Save-Pfad + IndexedDB): WorkspaceLayout-'Speichern'-Button verdrahten; TanStack-Query-Invalidation nach PUT /tree; markClean(); Lock-Konflikt-Modal.

## Self-Check

### Created Files

- [x] `portal/src/components/dirty-indicator.tsx` — FOUND
- [x] `portal/src/components/model-upload-form.tsx` — FOUND
- [x] `portal/src/components/models-list.tsx` — FOUND
- [x] `portal/src/components/sidebar-tree.tsx` — FOUND
- [x] `portal/src/components/workspace-layout.tsx` — FOUND
- [x] `portal/src/components/__tests__/models-list.test.tsx` — FOUND
- [x] `portal/src/components/__tests__/sidebar-tree.test.tsx` — FOUND
- [x] `portal/src/hooks/use-model-tree-query.ts` — FOUND
- [x] `portal/src/hooks/use-tree-loader.ts` — FOUND
- [x] `portal/src/routes/_authenticated/models/index.tsx` — FOUND
- [x] `portal/src/routes/_authenticated/models/upload.tsx` — FOUND
- [x] `portal/src/routes/_authenticated/models/$modelId.tsx` — FOUND
- [x] `portal/src/viewers/property/type-maps.ts` — FOUND
- [x] `portal/src/viewers/property/index.ts` — FOUND
- [x] `portal/src/viewers/property/PSimulatorViewer.tsx` — FOUND
- [x] `portal/src/viewers/property/PGObjBaseViewer.tsx` — FOUND
- [x] `portal/src/viewers/property/PDurchlaufplanViewerStd.tsx` — FOUND
- [x] `portal/src/viewers/property/AGruppeViewer.tsx` — FOUND
- [x] `portal/src/viewers/property/__tests__/PSimulatorViewer.test.tsx` — FOUND
- [x] `portal/src/viewers/property/__tests__/PGObjBaseViewer.test.tsx` — FOUND
- [x] `portal/src/viewers/property/__tests__/PDurchlaufplanViewerStd.test.tsx` — FOUND
- [x] `portal/src/viewers/property/__tests__/AGruppeViewer.test.tsx` — FOUND
- [x] `portal/src/state/__tests__/model-store.test.ts` — FOUND

### Commits

- [x] `0100256` — feat(portal): models-routes + sidebar-tree + workspace-layout (plan 01-05 task 1)
- [x] `fbdfb84` — feat(portal): TYPE_MAP + PSimulatorViewer + PGObjBaseViewer (plan 01-05 task 2)
- [x] `df2dd09` — feat(portal): PDurchlaufplanViewerStd + AGruppeViewer + addChildSkeleton (plan 01-05 task 3)

### Verification

- Test-Suite: **59 passed** (10 Files, ~1.5s) — `npm run test -- --run`
- Lint: **clean** (`npm run lint`, eslint --max-warnings=0)
- Build: **clean** (`npm run build` — tsc -b + vite build, 438 kB index.js + 25 kB CSS, ~3s)

## Self-Check: PASSED
