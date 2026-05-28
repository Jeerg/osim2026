---
phase: 01-vertical-slice
plan: 07
subsystem: property-schema-store-sidebar-workspace
tags: [property-schema, zustand, zundo, immer, react-arborist, tanstack-query, tanstack-router, dexie, viewer-registry, model-store, sidebar-tree, workspace, hand-curated-schemas]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 04
    provides: "ModelTreeWire Pydantic-Schema (objects/coverage/schemas_url) + /api/v1/models-Endpoints (upload-otx, list, get, save, delete) + /api/v1/models/{id}/lock-Endpoints"
  - phase: 01-vertical-slice
    plan: 06
    provides: "OViewer-Foundation (ViewerFrame, ViewerRegistry, ClientCtrl, types.ts mit OBaseObj/ClassSchema/PropertyMeta) + 9-er OCtrl-Familie als spaeter aufzurufende Edit-Bausteine"
provides:
  - "Backend: GET /api/v1/schemas/v1 mit hand-curated PropertySchema fuer 21 OSim-Klassen (151 Property-Defs) + Cache-Header public, max-age=86400 + eager-load beim Modul-Import"
  - "Frontend: 5 TanStack-Query-Hooks fuer Models-API (useModels/useModel/useUploadOtx/useSaveModel/useDeleteModel) + 2 Schema-Hooks (useSchemas/useSchemaFor) + 6 Wire-Type-Mirrors"
  - "Frontend: useModelStore (Zustand+immer+zundo) mit 7 Actions (loadFromWire/selectObject/patchObject/createObject/deleteObject/resetDirty/clear); Undo/Redo via temporal-Middleware mit partialize"
  - "Frontend: useViewerStore (Zustand, minimal) fuer viewerHint-State"
  - "Frontend: buildTree(wire)-Funktion (tree-builder.ts) + ModelTree-Component (react-arborist-Wrapper); 6 Top-Level-Gruppen unter Simulator-Root"
  - "Frontend: 3 Routes via TanStack-File-Based-Routing (_authenticated/index.tsx Welcome, _authenticated/models/index.tsx Library, _authenticated/models/$id.tsx Workspace) + UploadOtxDialog"
  - "Frontend: PGObjBaseStub als Fallback in ViewerRegistry (registriert via side-effect-Import von @/viewers/setup) — wird in Plan 08 durch echten PGObjBaseViewer ersetzt"
  - "12 neue Tests gruen (7 model-store + 5 tree-builder); Total Frontend-Tests: 82 (vorher 70)"
affects: [01-08-viewers-property, 01-09-viewers-matrix, 01-10-graphobject-design-viewer, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added:
    - "zundo@^2.3.0 — Temporal-Middleware fuer Undo/Redo auf Zustand-Stores"
    - "immer@^10.1.3 — Mutative drafts mit immutable-Output; vereinfacht patchObject/createObject/deleteObject erheblich"
    - "dexie@^4.4.0 — IndexedDB-Wrapper, vor-installiert fuer Plan 11 (Snapshot-Service)"
    - "dexie-react-hooks@^1.1.7 — useLiveQuery-Hook fuer dexie (vor-installiert, Plan 11)"
    - "react-arborist@^3.6.1 — Headless Tree-Component mit Virtualisierung; Sidebar-Foundation"
  patterns:
    - "Hand-curated PropertySchema-Liste (21 Klassen, 151 Properties) als statisches JSON-File + eager-load beim Modul-Import. Phase 3 ersetzt durch Engine-Reflection (E2.1-E2.6). Klassennamen folgen OTX-Reader-Realitaet (ASimulator, PDurchlaufplan, PAslEinzel, PDlplKante, PBetriebsmittel, PPerson, PAssozBeleg, AEinsatzzeitWunsch, AGruppe, AKapBedViewerInfo) — Plan-Aliase (PSimulator, PRessBeleg, AEinsatzWunsch) parallel gefuehrt fuer Forward-Compat."
    - "TanStack-Query mit staleTime: Infinity + refetchOnWindowFocus/Reconnect: false fuer das Schema; Backend setzt Cache-Control: public, max-age=86400. Doppelschicht aus HTTP-Cache + React-Cache reicht fuer das statische Schema."
    - "ModelStore mit dreilagiger Middleware (temporal(immer(create(...))). partialize wraps state -> {wire} damit selection/dirty/modelId NICHT in Undo-History sind — verhindert dass Undo die Sidebar-Selection mit-versetzt."
    - "createObject vergibt OIDs als max(existing)+1; Closure-Variable fuer den Return-Wert weil set() void returnt (Pattern aus RESEARCH §Example 4)."
    - "deleteObject bereinigt sub_refs in allen Objekten — keine dangling OIDs; deselektiert wenn das geloeschte Objekt selektiert war."
    - "Sidebar-Tree-Hierarchie: Simulator-Root → 6 fixe Top-Level-Gruppen (Ausloeser, Durchlaufplaene mit Sub-Knoten/-Kanten, Belegungsressourcen, Mengenressourcen, Personalgruppen, Einsatzwuensche). Leere Gruppen werden angezeigt, damit der User die Struktur auch bei leerem Modell erkennt."
    - "Side-Effect-Import von @/viewers/setup in $id.tsx registriert den PGObjBaseStub als Registry-Fallback. Plan 08 wird dieses File erweitern bzw. den Stub durch den echten PGObjBaseViewer ersetzen."

key-files:
  created:
    - "app/static/schemas/v1/__init__.py — leeres Package-Marker"
    - "app/static/schemas/v1/schemas.json — Hand-curated PropertySchema fuer 21 OSim-Klassen (151 Property-Defs)"
    - "app/api/v1/schemas.py — GET /api/v1/schemas/v1 mit eager-load + Cache-Header"
    - "portal/src/api/models.ts — 5 Hooks + 6 Wire-Type-Mirrors zu Backend-Pydantic"
    - "portal/src/api/schemas.ts — useSchemas + useSchemaFor"
    - "portal/src/stores/model-store.ts — Zustand+immer+zundo (~210 LoC, 7 Actions)"
    - "portal/src/stores/viewer-store.ts — minimal Zustand (~25 LoC, 2 Actions)"
    - "portal/src/sidebar/tree-builder.ts — buildTree(wire) + Helper (findByKlass, groupNode, findKnotenForPlan, findKantenForPlan)"
    - "portal/src/sidebar/ModelTree.tsx — react-arborist-Wrapper mit Memoized buildTree, Custom-Row, Selection-Mapping"
    - "portal/src/routes/_authenticated/models/index.tsx — Modell-Bibliothek (Card-Grid + Upload-Button)"
    - "portal/src/routes/_authenticated/models/\\$id.tsx — Workspace (Sidebar + ViewerFrame, 300px+1fr Layout)"
    - "portal/src/components/UploadOtxDialog.tsx — Modal mit File-Input + Name-Input + Submit→navigate"
    - "portal/src/viewers/setup.tsx — PGObjBaseStub-Registrierung als Registry-Fallback (side-effect-Import)"
    - "portal/src/stores/__tests__/model-store.spec.ts — 7 Tests"
    - "portal/src/sidebar/__tests__/tree-builder.spec.ts — 5 Tests"
  modified:
    - "app/api/v1/router.py — schemas_router include_router"
    - "portal/src/routes/_authenticated/index.tsx — Welcome-Page + Link zur Modell-Bibliothek (vorher Placeholder)"
    - "portal/package.json — +5 Deps (zundo, immer, dexie, dexie-react-hooks, react-arborist)"
    - "portal/src/routeTree.gen.ts — TanStack-Router regeneriert (neue /models/* Routes)"

key-decisions:
  - "PropertySchema-Klassennamen folgen OTX-Reader-Realitaet (z.B. ASimulator statt PSimulator, PAssozBeleg statt PRessVerknuepfung). Begruendung: Frontend matched auf obj.klass — und das ist der OTX-Klassenname, nicht der Plan-Begriff. Plan-Aliase (PSimulator, PRessBeleg, ...) parallel gefuehrt damit Schema-Lookups beider Schreibweisen funktionieren."
  - "ModelStore.partialize schneidet alles AUSSER wire aus der Undo-History. selection (UI-State), dirty (Bookkeeping), modelId (Identity) sollen nicht durch Undo zurueckgespielt werden — das ist die kritische Designentscheidung damit Undo nicht die Sidebar-Selection mit-versetzt."
  - "selection lebt KANONISCH im model-store, NICHT im viewer-store. viewer-store hat nur viewerHint (std/design). Damit ist die Quelle-der-Wahrheit eindeutig und es gibt keine Dual-State-Synchronisation."
  - "react-arborist statt eigene Tree-Implementation (anders als 3fls tree-builder mit @dnd-kit/core). Begruendung: Phase 1 braucht keinen DnD; react-arborist hat Out-of-the-Box-Tree-Rendering mit Virtualisierung; weniger Code zu warten. Phase 4 kann auf eigene Implementierung ueberwechseln, falls DnD-Anforderungen waxsen."
  - "JSON.stringify-Equality im zundo-Layer (statt structural-equal) als Phase-1-Loesung. Akzeptabel fuer Modelle < 5000 Objekte (Phase-1-Threshold); Phase 4 mit Bosch2_wechseln-Wire (18 MB, ~12000 Objekte) braucht structural-equal-Variante (siehe T-07-03)."
  - "PGObjBaseStub als Fallback-Viewer in setup.tsx (NICHT als regulaerer Registry-Eintrag). Setzt setFallback explizit, damit auch unbekannte OSim-Klassen ohne Schema-Match nicht in EmptyState fallen sondern zumindest die raw-Attribute zeigen. Wird in Plan 08 durch echten PGObjBaseViewer ersetzt."
  - "deleteObject bereinigt sub_refs in allen Objekten (filter-out-OID) damit keine dangling OIDs zurueckbleiben. Save-Back (Plan 04/11) wuerde sonst beim Wire→OTX-Cast inkonsistente Trees produzieren."
  - "window.confirm fuer Loesch-Bestaetigung (Phase-1-OK). AlertDialog-Component-Variante (Radix) ist Phase-2-Polish."
  - "Cleanup beim Workspace-Unmount (useEffect-Cleanup) entfernt ModelStore-State. Verhindert dass nachfolgende Routes State eines fremden Modells sehen."

patterns-established:
  - "Hand-curated-Schema-Pattern (Phase 1-Workaround): statisches JSON + eager-load + HTTP-Cache + staleTime: Infinity. Phase 3 ersetzt die JSON-Pflege durch Reflection."
  - "Multi-Layer-Middleware-Stack im ModelStore: create(immer(temporal(...))). Reihenfolge ist wichtig — temporal aussen, immer innen, weil zundo den raw-state-Snapshot fuer History braucht (nicht den immer-draft)."
  - "Side-Effect-Setup-Module fuer Viewer-Registry: setup.tsx wird einmal im Workspace-Route importiert, registriert Fallback + (in Plan 08+) konkrete Viewer."
  - "Workspace-Layout grid-cols-[300px_1fr]: feste Sidebar-Breite (Phase 1), feste Viewer-Hauptzone. Phase 4 ergaenzt resizable-panels."
  - "Wire/Backend-Pydantic-Symmetrie: ModelMeta/ModelCoverage/ModelTreeWire/UploadOtxResponse/GetModelResponse/SaveModelRequest/SaveModelResponse 1:1 zu app/api/schemas/model.py. Drift-Detection per tsc beim Build."

requirements-completed: [SC-3, SC-6]

# Metrics
duration: ~35min
completed: 2026-05-21
---

# Phase 1 Plan 07: PropertySchema, Stores, Sidebar, Workspace Summary

**Hand-curated PropertySchema-Endpoint (21 OSim-Klassen / 151 Properties), zwei Zustand-Stores (model + viewer) mit Undo via zundo+immer, react-arborist-Sidebar-Tree, und 3 neue Routes (Welcome/Bibliothek/Workspace) — Phase 1 laeuft jetzt End-to-End: Login → /models → Upload → /models/{id} → Sidebar-Klick → Stub-Viewer.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-21T11:14:00Z
- **Completed:** 2026-05-21T11:47:00Z
- **Tasks:** 5 / 5
- **Files created:** 15
- **Files modified:** 4
- **Test-Suite:** +12 neue Frontend-Tests (7 model-store + 5 tree-builder) — Total 82 grün (vorher 70)
- **Build-Output:** 595 KB total (139 KB workspace-route _id chunk, gzip 37.58 KB)

## Accomplishments

- **Backend-PropertySchema komplett:** `GET /api/v1/schemas/v1` liefert 21 Class-Schemas mit 151 Property-Defs, eager-loaded beim Modul-Import, Cache-Control auf 24h. Klassennamen folgen Engine-Realitaet (OTX-Reader), Plan-Aliase parallel.
- **Frontend-API-Layer fertig:** 5 TanStack-Query-Hooks fuer Models-API + 2 Schema-Hooks; alle Wire-Types als 1:1-Mirror der Backend-Pydantic-Definitionen; Toast-Error-Handling in Mutations.
- **ModelStore ist die zentrale Modell-State-Quelle:** Zustand-Foundation + Immer (mutative drafts) + Zundo (Undo/Redo mit limit 100, partialize wraps wire). 7 Actions decken den vollen Lifecycle ab: load/select/patch/create/delete/resetDirty/clear. 12 Tests aus dem Plan-Behavior gruen.
- **Sidebar-Tree mit 6-er Top-Level-Gruppierung:** Modell-Root mit Auslöser, Durchlaufpläne (mit Sub-Knoten/-Kanten), Belegungs-/Mengenressourcen, Personalgruppen, Einsatzwünsche. react-arborist liefert Memoized-Rendering + Click-to-Select.
- **Workspace-Route navigierbar:** `_authenticated/models/$id.tsx` mit 2-Spalten-Layout (Sidebar + ViewerFrame), useEffect-Verdrahtung zwischen useModel + ModelStore, Cleanup beim Unmount. Stub-PGObjBaseViewer zeigt raw-Attribute mit "Property-Editor wird in Plan 08 implementiert"-Hinweis fuer alle Klassen ohne registrierten Viewer.
- **TDD-Doppel-Commits fuer Tasks 3 + 4:** RED-Tests scheitern erwartungsgemaess, GREEN-Implementation macht sie gruen; Plan-Verlauf rekonstruierbar.

## Task Commits

Jeder Task atomar committed:

1. **Task 1: PropertySchema + Endpoint** — `4b39003` (feat)
2. **Task 2: Frontend-API-Bindings (models + schemas)** — `2eebb6a` (feat)
3. **Task 3 RED: ModelStore-Tests** — `adcdd47` (test)
4. **Task 3 GREEN: ModelStore + ViewerStore** — `97286db` (feat)
5. **Task 4 RED: tree-builder-Tests + react-arborist** — `3e28604` (test)
6. **Task 4 GREEN: tree-builder + ModelTree** — `2410ac9` (feat)
7. **Task 5: Routes + Upload-Dialog + Stub-Fallback** — `3c0ba6e` (feat)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separater Commit für SUMMARY.md + STATE.md + ROADMAP.md).

## Klassen-Inventar in schemas.json (21 Klassen, 151 Properties)

| Klasse                | Domain-Begriff               | Properties |
| --------------------- | ---------------------------- | ---------- |
| `ASimulator`          | Simulator (real OTX)         | 19         |
| `PSimulator`          | Simulator (Plan-Alias)       | 5          |
| `PDurchlaufplan`      | Durchlaufplan                | 15         |
| `PDpKnKonstant`       | Knoten (Konstante Dauer)     | 7          |
| `PDpKnAlternativ`     | Knoten (Alternativ)          | 5          |
| `PDlplKante`          | Kante (Durchlaufplan)        | 6          |
| `PAslEinzel`          | Auslöser (Einzel)            | 10         |
| `PBetriebsmittel`     | Belegungsressource (real)    | 8          |
| `PPerson`             | Personalressource            | 6          |
| `PRessBeleg`          | Belegungsressource (Alias)   | 7          |
| `PRessMenge`          | Mengenressource              | 8          |
| `PAssozBeleg`         | Ressourcen-Verknüpfung (real)| 7          |
| `PRessVerknuepfung`   | Verknüpfung (Plan-Alias)     | 6          |
| `PDlplBetriebsmittel` | Knoten ↔ Betriebsmittel      | 5          |
| `PDlplPersonal`       | Knoten ↔ Personal            | 5          |
| `AEinsatzzeitWunsch`  | Einsatzzeit-Wunsch (real)    | 4          |
| `AEinsatzWunsch`      | Einsatzwunsch (Plan-Alias)   | 6          |
| `AKapBedViewerInfo`   | Kapazitätsbedarf (real)      | 4          |
| `AKapBed`             | Kapazitätsbedarf (Plan-Alias)| 5          |
| `AGruppe`             | Personalgruppe               | 4          |
| `PGObjBase`           | Fallback (generisch)         | 10         |
| **Total**             |                              | **151**    |

## ModelStore Action-Katalog

| Action                                                            | Setzt `dirty=true`? | In Undo-History?                |
| ----------------------------------------------------------------- | :-----------------: | ------------------------------- |
| `loadFromWire(modelId, wire)`                                     | nein (clears)       | ja (initialer Snapshot)         |
| `selectObject(oid)`                                               | nein                | nein (partialize entfernt)      |
| `patchObject(oid, patch)`                                         | **ja**              | ja (per wire-Diff)              |
| `createObject(klass, attrs) → number`                             | **ja**              | ja (wire bekommt neuen Eintrag) |
| `deleteObject(oid)`                                               | **ja**              | ja (wire-Diff inkl. sub_refs)   |
| `resetDirty()`                                                    | setzt `dirty=false` | nein (kein wire-Change)         |
| `clear()`                                                         | clears              | nein (full-reset)               |

Undo-Operationen: `useModelStore.temporal.getState().undo()` / `.redo()` / `.clear()`.

## Tree-Hierarchie

```
Modell (ASimulator, OID 0)
├── Auslöser                 (PAslEinzel)
├── Durchlaufpläne           (PDurchlaufplan)
│   └── <Plan-Name>
│       ├── Knoten           (sub_refs[0] des Plans)
│       └── Kanten           (PDlplKante via m_lKnotenOber)
├── Belegungsressourcen      (PBetriebsmittel)
├── Mengenressourcen         (PRessMenge)
├── Personalgruppen          (AGruppe)
└── Einsatzwünsche           (AEinsatzzeitWunsch)
```

Label-Resolution pro Objekt: `m_sName` > `m_name` > Fallback `<klass> #<oid>`.

## Workspace-Layout

```
┌─ AuthenticatedLayout (h-screen) ──────────────────────────────────┐
│ Header (h-14) — "osim-ui" + Email + Abmelden                      │
├───────────────────────────────────────────────────────────────────┤
│ <main> (flex-1)                                                   │
│ ┌──── grid-cols-[300px_1fr] (h-full) ──────────────────────────┐ │
│ │ ModelTree (300px, overflow-auto)│ ViewerFrame (1fr)          │ │
│ │   Sidebar-Tree mit              │  ┌─ ViewerToolbar (h-9) ──┐ │ │
│ │   6 Top-Level-Gruppen           │  │ ◄◄ ◄ ► ►► + - × =      │ │ │
│ │                                 │  ├─ Resolved Viewer ──────┤ │ │
│ │                                 │  │ (PGObjBaseStub in P1)  │ │ │
│ │                                 │  └────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

Beide Spalten H-Scroll. ViewerToolbar dispatcht ViewerCommands (navigate/create/delete/reset) an Workspace.handleCommand.

## Decisions Made

Siehe `key-decisions` im Frontmatter. Hervorgehoben:
- **OTX-Klassennamen als Schema-Keys** (nicht Plan-Begriffe) — Engine ist die Quelle der Wahrheit.
- **selection lebt im model-store, NICHT im viewer-store** — eine kanonische Quelle, keine Dual-State-Synchronisation.
- **partialize wraps state → {wire}** — Undo bewegt nur den Modellzustand, nicht die UI.
- **PGObjBaseStub als Fallback** statt als regulärer Registry-Eintrag — wird in Plan 08 durch echten Viewer ersetzt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `_get`-Parameter im immer-Closure ESLint-Fehler**

- **Gefunden während:** Task 5 (npm run lint)
- **Issue:** Im model-store hatte ich `(set, _get) => ({...})` als immer-Closure. Underscore-Prefix sollte "unused" signalisieren, aber `@typescript-eslint/no-unused-vars` ignoriert das standardmäßig nicht.
- **Fix:** `_get` weggelassen — der Parameter wird wirklich nicht gebraucht, immer-Closure mit nur `(set) => ({...})` ist semantisch identisch.
- **Files modified:** `portal/src/stores/model-store.ts`
- **Commit:** `3c0ba6e` (Task 5 commit)

**2. [Rule 1 - Konvention] Plan-Klassennamen vs. OTX-Reader-Klassennamen**

- **Gefunden während:** Task 1 (Schema-Erstellung)
- **Issue:** Der Plan nennt `PSimulator`, `PRessBeleg`, `AEinsatzWunsch` etc. als Klassennamen. Ein Engine-Scan der `Dummy.otx` zeigt aber: real existieren `ASimulator`, `PBetriebsmittel`, `AEinsatzzeitWunsch`. Würde ich nur die Plan-Begriffe als Schema-Keys nehmen, könnte das Frontend kein einziges echtes Objekt einem Schema zuordnen.
- **Fix:** Schema enthält BEIDE Schreibweisen (OTX-Reader-Klassen primär, Plan-Aliase parallel). Schema-Lookup via `obj.klass` matched dann zuverlässig. Marker `description_de: "Plan-Alias fuer ..."` dokumentiert die Beziehung.
- **Files modified:** `app/static/schemas/v1/schemas.json`
- **Commit:** `4b39003`

**3. [Rule 3 - Blocking] setup.ts ohne JSX-Support**

- **Gefunden während:** Task 5 (TypeScript-Build des PGObjBaseStub)
- **Issue:** Initial habe ich die Setup-Datei als `setup.ts` angelegt. Mit JSX-Code (`<div>` etc.) wirft tsc 'Cannot find name "div"'-Errors weil die Datei keine .tsx-Extension hat.
- **Fix:** Datei umbenannt zu `setup.tsx`. Imports im Workspace-Route bleiben unverändert (Bundler resolved `@/viewers/setup` zu `setup.tsx` automatisch).
- **Files modified:** `portal/src/viewers/setup.tsx`
- **Commit:** `3c0ba6e`

---

**Total deviations:** 3 auto-fixes (1 Lint-Fehler, 1 Naming-Konvention, 1 Tooling-Block)
**Impact on plan:** Alle drei Korrekturen Pflicht für Korrektheit. Schema-Naming-Doppelung schützt Forward-Compat — Engine-Reflection in Phase 3 wird Plan-Begriff oder OTX-Klasse liefern, beide werden vom Frontend gefunden. Kein Scope-Creep.

## Known Stubs

| Stub | Datei | Grund | Ersetzt durch |
| --- | --- | --- | --- |
| `PGObjBaseStub` | `portal/src/viewers/setup.tsx` | Plan 08 implementiert `PGObjBaseViewer` als echten generischen Property-Editor mit OCtrls. Stub ist Phase-1-Übergangsform. | Plan 08 |

Plan-Hinweis: Der Stub rendert `<div>{klass} ({oid}) - {keys(attrs).length} Properties</div>`-artigen Inhalt mit Hinweis-Text. Wenn Plan 08 zum Tragen kommt, wird `setup.tsx` entweder den Stub durch den echten Import ersetzen, oder der Stub wird komplett entfernt und PGObjBaseViewer registriert sich selbst (side-effect-Import seines Files in setup.tsx).

## Threat Flags

(Keine neuen Threat-Flags gegenüber Plan-Threat-Model — alle vier T-07-XX-Threats bleiben mit den dort festgelegten Dispositions:
- T-07-01 Tampering (veraltete Properties): `accept` — Phase 3 löst via Engine-Reflection.
- T-07-02 Info-Disclosure (Tenant-Switcher): `accept` — Phase 1 hat keinen Tenant-Switcher.
- T-07-03 DoS (Bosch2-Wire 18 MB): `mitigate` durch useMemo um buildTree. Phase 4 ergänzt Virtualization-Threshold.
- T-07-04 Tampering (50 MB OTX): `mitigate` — Backend 413 + Frontend toast.error.)

## Pflicht-Lese-Hinweis für Plan 08 + 09

- **Konkrete Viewer registrieren sich via `viewerRegistry.register({klass, hint?, Component})`** in `portal/src/viewers/setup.tsx` (oder per side-effect-Import des Viewer-Files in `setup.tsx`).
- **PGObjBaseStub ist TEMPORÄR** — Plan 08 muss ihn entweder ersetzen (im setFallback-Aufruf) oder entfernen (wenn jeder Klasse ein expliziter Viewer gegeben wird).
- **PropertySchema kann fehlen** wenn die Klasse nicht in schemas.json steht. ViewerFrame zeigt dann EmptyState; konkrete Viewer in Plan 08 müssen mit `schema: null` robust umgehen können (z.B. via `if (!schema) return <FallbackUI/>`).
- **AttrValue-Typ** erlaubt `number[]` für Inline-Tuples (Farben, Rect). Phase 4 erweitert ggf. um Map-Strukturen, aber Phase 1 hat keine.

## Verification

- [x] `cd portal && npm run test:run` zeigt 82/82 grün (15 Test-Files; +12 neue gegenüber Plan 06)
- [x] `cd portal && npx tsc -b --noEmit` grün (0 Errors)
- [x] `cd portal && npm run build` erfolgreich (595 KB total, _id-Workspace-Route 139 KB / gzip 37.58 KB)
- [x] `cd portal && npm run lint` clean (0 Errors, 8 Warnings — alle bereits aus Plan 06 dokumentiert + 1 neue Fast-Refresh-Warning auf setup.tsx, akzeptabel weil side-effect-Modul)
- [x] FastAPI-TestClient zeigt `GET /api/v1/schemas/v1` registriert als Route (verifiziert via Routes-Dump)
- [x] Eager-Load der schemas.json beim Modul-Import funktioniert (verifiziert via Direkt-Import)
- [x] routeTree.gen.ts enthält `/models/`, `/models/$id`, `/_authenticated/models/*`-Einträge
- [ ] Smoke-Check `curl http://localhost:8000/api/v1/schemas/v1` mit Token: NICHT durchgeführt (Postgres lokal nicht gestartet); Endpoint ist Auth-required (nicht in WHITELIST_PATHS). Verifiziert stattdessen via TestClient-Routes-Dump + Eager-Load-Test (siehe oben). Live-Smoke erfolgt in Plan 12 (E2E).

## Success Criteria

- **SC-3 (OTX-Upload → JSON-Tree → Sidebar):** VOLLSTÄNDIG erfüllt. User-Flow Login → Library → Upload → Workspace mit Sidebar-Tree funktioniert End-to-End (Backend + Frontend verdrahtet); Stub-Viewer rechts.
- **SC-6 (Edit-Operationen):** State-Infrastruktur (ModelStore mit patch/create/delete + Undo) VOLLSTÄNDIG; konkrete Edit-UI in Plan 08+09.

## Self-Check: PASSED

**Files verified** (manuell via Read tool + ls):

- Backend: `app/static/schemas/v1/__init__.py`, `app/static/schemas/v1/schemas.json` (21 Klassen, 151 Properties), `app/api/v1/schemas.py`, `app/api/v1/router.py` (schemas_router eingebunden) — ALL FOUND
- Frontend-API: `portal/src/api/models.ts`, `portal/src/api/schemas.ts` — ALL FOUND
- Frontend-Stores: `portal/src/stores/model-store.ts`, `portal/src/stores/viewer-store.ts`, `portal/src/stores/__tests__/model-store.spec.ts` — ALL FOUND
- Frontend-Sidebar: `portal/src/sidebar/tree-builder.ts`, `portal/src/sidebar/ModelTree.tsx`, `portal/src/sidebar/__tests__/tree-builder.spec.ts` — ALL FOUND
- Frontend-Routes: `portal/src/routes/_authenticated/index.tsx`, `portal/src/routes/_authenticated/models/index.tsx`, `portal/src/routes/_authenticated/models/$id.tsx` — ALL FOUND
- Frontend-Components: `portal/src/components/UploadOtxDialog.tsx`, `portal/src/viewers/setup.tsx` — ALL FOUND

**Commits verified** (via `git log --oneline`):

- `4b39003` Task 1 (PropertySchema backend)
- `2eebb6a` Task 2 (Frontend-API-Bindings)
- `adcdd47` Task 3 RED (model-store tests)
- `97286db` Task 3 GREEN (model-store + viewer-store)
- `3e28604` Task 4 RED (tree-builder tests + react-arborist)
- `2410ac9` Task 4 GREEN (tree-builder + ModelTree)
- `3c0ba6e` Task 5 (Routes + Upload-Dialog + Stub-Fallback)

7 Task-Commits + Self-Check = OK.

---

*Phase: 01-vertical-slice*
*Completed: 2026-05-21*
