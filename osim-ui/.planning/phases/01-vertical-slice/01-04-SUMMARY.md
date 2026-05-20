---
phase: 01-vertical-slice
plan: 04
subsystem: portal
tags: [portal, viewer-foundation, octrl, auth, react, tanstack-router, zustand, tailwind]
dependency_graph:
  requires:
    - "phase 01-02 — Backend Auth + Lazy Tenant Bootstrap (POST /api/v1/auth/me)"
  provides:
    - "portal/src/viewers/core/ViewerFrame (TS-Klasse)"
    - "portal/src/viewers/core/ClientCtrl (TS-Klasse, ChildDialog-Routing)"
    - "portal/src/viewers/core/ChildDialog (React-Context-Provider + useChildDialog-Hook)"
    - "portal/src/viewers/core/ChildCtrl (React-Wrapper fuer nested ChildDialogs)"
    - "portal/src/viewers/core/ViewerHost (React-Mountpoint, abonniert frame.subscribe)"
    - "portal/src/viewers/core/viewer-registry (registerViewer/getViewer/getRegisteredKlasses + FALLBACK_KLASS=PGObjBase)"
    - "portal/src/viewers/core/OCtrl.types — OCtrlProps + useOCtrlBinding<T> + TYPE_MAP-Helper"
    - "portal/src/viewers/octrl/{OCtrlVariable,OCtrlBool,OCtrlEnum,OCtrlLink,OCtrlList,OCtrlMethod,OCtrlTabViewer,OCtrlCOLORREF,OCtrlLOGFONT} — 9er-Familie"
    - "portal/src/state/model-store (Zustand-Store mit tree/dirty/undoStack/oidIndex)"
    - "portal/src/auth/{firebase,auth-provider,use-auth} — Firebase + AuthProvider mit POST /auth/me-Bootstrap"
    - "portal/src/api/{fetch,client,error-message} — apiFetch + ApiError"
  affects:
    - portal/
tech_stack:
  added:
    - "@tanstack/react-query@^5.90 (Server-State)"
    - "@tanstack/react-router@^1.167 (file-based Routing + beforeLoad-Guards)"
    - "@tanstack/router-plugin@^1.167 (routeTree.gen-Generierung)"
    - "zustand@^5.0 (Modell-Store)"
    - "firebase@^11 (Auth-SDK + Emulator-Connect)"
    - "tailwindcss@^4.2 + @tailwindcss/vite + @tailwindcss/forms"
    - "react@^19.2 + react-dom + @types/react"
    - "vite@^7.3 + @vitejs/plugin-react"
    - "vitest@^2.1 + happy-dom + @testing-library/react + @testing-library/jest-dom + @testing-library/user-event"
    - "eslint@^9 + typescript-eslint + eslint-plugin-react-hooks + eslint-plugin-react-refresh"
    - "dexie@^4 (vorbereitet fuer Plan 09 IndexedDB-Snapshot)"
    - "react-arborist@^3.4 (vorbereitet fuer Plan 05 Sidebar-Tree)"
    - "reactflow@^11.11 (vorbereitet fuer Plan 07 PDurchlaufplanViewer-Design)"
  patterns:
    - "Hybrid OViewer-Pattern (D-05): ViewerFrame/ClientCtrl = TS-Klasse, ChildDialog/OCtrl = React-Components"
    - "Viewer-Registry mit klass->Component-Mapping + PGObjBase-Fallback (D-07)"
    - "useOCtrlBinding<T>(property)-Hook als zentraler Binding-Vertrag fuer alle OCtrls"
    - "Snapshot-basiertes Undo (max 50 Eintraege, Ringbuffer, JSON.stringify pro Edit) — Phase-1-pragmatisch, Phase 3+ Command-Pattern wenn Performance noetig"
    - "TanStack-Router beforeLoad-Auth-Guard mit context.auth — Self-Service-Signup via createUserWithEmailAndPassword"
key_files:
  created:
    - portal/package.json (updated)
    - portal/tsconfig.json (updated)
    - portal/vite.config.ts (updated)
    - portal/vitest.config.ts
    - portal/eslint.config.js
    - portal/.env.example
    - portal/src/main.tsx (updated)
    - portal/src/app.tsx (updated)
    - portal/src/styles/globals.css (updated)
    - portal/src/test-setup.ts
    - portal/src/auth/firebase.ts
    - portal/src/auth/auth-provider.tsx
    - portal/src/auth/use-auth.ts
    - portal/src/api/fetch.ts
    - portal/src/api/client.ts
    - portal/src/api/error-message.ts
    - portal/src/routes/__root.tsx
    - portal/src/routes/_authenticated.tsx
    - portal/src/routes/_authenticated/workspace.tsx
    - portal/src/routes/login.tsx
    - portal/src/routes/index.tsx
    - portal/src/routeTree.gen.ts (vom Plugin generiert; committed)
    - portal/src/state/model-store.ts
    - portal/src/viewers/core/types.ts
    - portal/src/viewers/core/viewer-registry.ts
    - portal/src/viewers/core/ViewerFrame.ts
    - portal/src/viewers/core/ClientCtrl.ts
    - portal/src/viewers/core/ChildDialog.tsx
    - portal/src/viewers/core/ChildCtrl.tsx
    - portal/src/viewers/core/ViewerHost.tsx
    - portal/src/viewers/core/OCtrl.types.ts
    - portal/src/viewers/octrl/OCtrlVariable.tsx
    - portal/src/viewers/octrl/OCtrlBool.tsx
    - portal/src/viewers/octrl/OCtrlEnum.tsx
    - portal/src/viewers/octrl/OCtrlLink.tsx
    - portal/src/viewers/octrl/OCtrlList.tsx
    - portal/src/viewers/octrl/OCtrlMethod.tsx
    - portal/src/viewers/octrl/OCtrlTabViewer.tsx
    - portal/src/viewers/octrl/OCtrlCOLORREF.tsx
    - portal/src/viewers/octrl/OCtrlLOGFONT.tsx
    - portal/src/viewers/octrl/index.ts
    - portal/src/viewers/core/__tests__/viewer-registry.test.ts
    - portal/src/viewers/core/__tests__/ClientCtrl.test.ts
    - portal/src/viewers/octrl/__tests__/OCtrlVariable.test.tsx
decisions:
  - "Hybrid-Pattern (D-05): ViewerFrame/ClientCtrl als TS-Klasse, ChildDialog/OCtrl als React. ViewerHost als Bindeglied (useEffect+subscribe)."
  - "viewer-registry mit `getViewer(klass)` + Fallback auf `PGObjBase` (Konstante `FALLBACK_KLASS` in ClientCtrl.ts). last-wins bei Doppelregistrierung, console.warn."
  - "useOCtrlBinding<T>(property) als zentraler Binding-Vertrag — alle 9 OCtrls nutzen den Hook, kein Property-Drilling."
  - "PropertyValue = unknown (gelockerter Constraint), damit OCtrlLOGFONT strukturierte Werte ohne Type-Casts halten kann."
  - "Snapshot-Undo (max 50 Eintraege, Ringbuffer). Tree-Walk-Updates immutable nur entlang des Pfades (vermeidet komplettes deepClone). oid-Index als Map<Oid, Node>."
  - "TanStack-Router file-based mit beforeLoad-Auth-Guard. Routes: `__root` -> AuthState-Context; `/login` (public, Self-Service-Signup); `/` redirect; `/_authenticated/workspace` (Phase-1-Landing)."
  - "Vite-Dev-Server: Port 3000, Proxy /api -> :8000 (vermeidet CORS-Setup in Phase 1)."
  - "vitest.config.ts separat von vite.config.ts (vermeidet Type-Konflikt zwischen vitest@2.1's gebundle-tem vite und der Projekt-vite@7-Version)."
  - "react-hooks/static-components + react-refresh/only-export-components in `src/viewers/core/`, `src/viewers/octrl/` und `src/routes/` deaktiviert: Dynamic-Viewer-Pattern (Registry-Lookup zur Render-Zeit) ist intendiert."
  - "AuthProvider ruft IMMER POST /auth/me (nicht nur beim ersten Login), weil osim-ui-Backend tenant_id+role direkt aus AuthMeResponse liefert; Firebase-Custom-Claims werden erst nach dem ersten Roundtrip gesetzt."
metrics:
  duration_minutes: 25
  completed_date: 2026-05-20
  tasks_completed: 3
  files_changed: 43
  tests_added: 30
  commits: 3
---

# Phase 1 Plan 04: Viewer-Foundation Frontend Summary

Foundation des gesamten Viewer-Systems: Hybrid-Portierung des C++-`OViewer`-Patterns als TypeScript-Klassen (Frame/ClientCtrl) plus React-Composition (ChildDialog/ChildCtrl/OCtrl-Familie), Zustand-Modell-Store mit immutable-Tree-Updates und Snapshot-Undo, Firebase-Auth-Frontend mit Lazy-Tenant-Bootstrap, TanStack-Router-Setup mit beforeLoad-Guard, vollstaendige 9er-OCtrl-Familie und 30 vitest-Tests.

## Was geliefert wurde

**Welle-2-Frontend-Spur, Foundation-Layer fuer Plan 05-08.** Drei atomare Commits:

| Task | Commit | Was                                                                                                                                                          |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 1fbe0c8 | Vite/React/Auth-Skelett: package.json mit allen Phase-1-Deps, vite.config (Port 3000, /api-Proxy), tsconfig (strict), eslint, AuthProvider, apiFetch, Routes |
| 2    | 7d7c921 | Viewer-Core: ViewerFrame, ClientCtrl, ChildDialog (Context+Hook), ChildCtrl, ViewerHost, viewer-registry, OCtrl.types, model-store + 13 Tests                |
| 3    | 14569a2 | 9er OCtrl-Familie + index.ts + 17 Tests (OCtrlVariable detailliert, andere als Smoke-Tests, COLORREF-Conversion-Helper)                                      |

## Architektur-Recap

```
ViewerFrame (TS-Klasse)
  └─ ClientCtrl (TS-Klasse)
       ├─ current: OtxJsonNode | null
       ├─ childDialogKlass: Klass | null
       └─ pickChildDialog(klass) -> viewer-registry lookup, fallback PGObjBase
                ↓
ViewerHost (React)              <-- frame.subscribe(setState)-Trigger
  └─ <ChildDialog obj=… onPropertyChange=updateProperty>
       └─ <KonkreterDialog>     <-- aus viewer-registry, Plan 05+ registriert
            ├─ <OCtrlVariable property="m_sName" />     useOCtrlBinding-Hook
            ├─ <OCtrlBool property="m_bActive" />
            └─ <ChildCtrl obj={subObj}>                  nested
                 └─ <SubDialog>
                      └─ <OCtrl…>
```

Daten-Flow:
- **setObj**: ClientCtrl.setObj(obj) -> Registry-Lookup -> frame.update() -> React re-render
- **Edit**: OCtrl.onChange -> useOCtrlBinding.setValue -> ChildDialogContext.onPropertyChange -> useModelStore.updateProperty (immutable Tree-Update + dirty.add + undo-Snapshot)
- **Method**: OCtrlMethod.click -> ChildDialogContext.onMethodCall -> ViewerHost stub (Plan 09 ergaenzt Backend-Roundtrip)
- **Undo**: useModelStore.undo() -> pop Snapshot -> setTree, current Snapshot auf redoStack

## Verifikation

- `npm install` ohne Errors (472 packages, 6 audit warnings, alle non-critical).
- `npx tsc -b` clean (strict, noUnusedLocals/Parameters, isolatedModules).
- `npm run lint` (`eslint . --max-warnings=0`) clean.
- `npm test` (vitest run): **30/30 grün**, 3 Test-Files, ~1s.
- `npm run build` (tsc + vite build) clean, dist ~417 KB index.js + 16 KB CSS.
- `npm run dev` startet Vite-Dev-Server auf http://localhost:3000/ in ~870ms (manuell verifiziert).

## Decisions

Siehe Frontmatter `decisions:` — die zentralen 10 Entscheidungen sind dort dokumentiert. Kern: **Hybrid-Pattern bestaetigt** (D-05 wird in der TS-Welt sauber abbildbar), **useOCtrlBinding als single-Hook-Pattern** ist der Hebel, der Plan 05+ minimalen Code abverlangt (nur ChildDialog + TYPE_MAP-Registration pro Klasse).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] OCtrlLink hat "Maximum update depth exceeded" produziert**
- **Found during:** Task 3 (OCtrl-Tests)
- **Issue:** `useModelStore((s) => selectByKlass(s, klass))` lieferte bei jedem Render ein neues Array → Zustand-getSnapshot-Cache schlug fehl → React-19-Render-Loop.
- **Fix:** Direkte Subscription auf `s.tree` (primitive Identitaet) + `useMemo` mit lokalem tree-Walk fuer Kandidaten.
- **File:** `portal/src/viewers/octrl/OCtrlLink.tsx`
- **Commit:** 14569a2

**2. [Rule 3 — Blocking] vitest+vite Type-Konflikt im vite.config.ts**
- **Found during:** Task 1 (`tsc -b`)
- **Issue:** vitest@2.1 bundelt eine eigene vite-Version; `defineConfig({ ... test: {...} })` aus `vitest/config` mit react/tailwind-Plugins aus der Projekt-vite-Version waren type-incompatible (Hunderte verschachtelter Type-Errors).
- **Fix:** vitest-Konfig in eigene `vitest.config.ts` ausgelagert (kein TanStackRouterVite/react/tailwind drin).
- **Files:** `portal/vite.config.ts`, `portal/vitest.config.ts`
- **Commit:** 1fbe0c8

**3. [Rule 2 — Critical] react-hooks/static-components + react-refresh-Regel blockierten intendierten Dynamic-Viewer-Pattern**
- **Found during:** Task 2 (`npm run lint`)
- **Issue:** `react-hooks/static-components` meckerte ueber `getViewer(klass)`-Aufrufe zur Render-Zeit (Komponente "during render created"). Das ist der **zentrale Sinn** der viewer-registry (D-07 Querschnitts-Foundation).
- **Fix:** Regel pro Folder (`src/viewers/core/**`, `src/viewers/octrl/**`, `src/routes/**`) deaktiviert mit Begruendung im eslint.config.js-Comment.
- **File:** `portal/eslint.config.js`
- **Commit:** 7d7c921

**4. [Rule 1 — Bug] OCtrlVariable's `useEffect+setDraft` triggert React-19 set-state-in-effect-Lint-Error**
- **Found during:** Task 3 (`npm run lint` after first OCtrl-Version)
- **Issue:** Initial-Version mit lokalem `draft`-State + `useEffect(() => setDraft(value))` ist React-19-Antipattern (cascading renders).
- **Fix:** Lokaler draft entfernt, direkter `value`-controlled input + onChange-Validation (NaN-Revert via early-return statt revert-setState).
- **File:** `portal/src/viewers/octrl/OCtrlVariable.tsx`
- **Commit:** 14569a2

**5. [Rule 3 — Blocking] TanStack-Router file-conflict zwischen `index.tsx` und `_authenticated/index.tsx`**
- **Found during:** Task 1 (`vite build`)
- **Issue:** `_authenticated`-Layout-Route ohne URL-Praefix kombiniert mit `_authenticated/index.tsx` mapped auf `/` und kollidiert mit dem public `/`.
- **Fix:** `_authenticated/index.tsx` umbenannt zu `_authenticated/workspace.tsx` (Pfad `/workspace`); public `/` ist ein redirect (eingeloggt -> `/workspace`, sonst -> `/login`).
- **Files:** `portal/src/routes/index.tsx`, `portal/src/routes/_authenticated/workspace.tsx`
- **Commit:** 1fbe0c8

## NICHT implementiert in Phase 1 (s. risks-Block im Plan)

- **Kommando-Routing** (OViewer.h 3.1): keine Menues, keine Toolbars, keine Accelerators in Phase 1. Plan 09+ kann ViewerMenuSpec ausbauen.
- **Echte Store-Validierung**: `ClientCtrl.store()` liefert IMMER true (Phase-1-Festlegung). Alle Edits flussen sofort durch onPropertyChange in den model-store.
- **IndexedDB-Snapshot**: dexie ist installiert, aber kein Subscriber registriert — Plan 09 ergaenzt `useModelStore.subscribe(persist-to-idb)`.
- **TYPE_MAP-Eintraege**: TYPE_MAP ist leer; `getMetadataFor(klass, prop)` liefert Default `{ type: "string" }`. Plan 05+ registriert pro konkreter OSim-Klasse via `registerTypeMetadata(klass, {…})`.
- **PGObjBase-Fallback-Komponente**: FALLBACK_KLASS ist als Konvention definiert, aber die konkrete Component wird in Plan 05 registriert.
- **onMethodCall-Backend-Roundtrip**: aktuell nur console.info in ViewerHost. Plan 09 / Engine-Integration verdrahtet das.
- **shadcn**: bewusst nicht in Plan 04 (Foundation soll dependency-leicht bleiben). Plan 05+ kann shadcn nachziehen, wenn die konkreten ChildDialogs es brauchen.

## Authentication Gates

Keine. Auth-Frontend ist auto-konfiguriert: Firebase-Emulator wird im Dev-Mode automatisch via `connectAuthEmulator` angesprochen (Port 9099), Self-Service-Signup ist im LoginPage-UI verbaut. Backend muss laufen + `firebase-emulator` muss via docker-compose laufen, dann ist der Flow durchgaengig browserbar.

## Known Stubs

- **`_authenticated/workspace.tsx`** zeigt nur Auth-State-Karte ("E-Mail / Tenant-ID / Rolle / Bootstrap-Flag") — kein echter Workspace-Content. **Wird in Plan 05 ersetzt** mit echter Modell-Liste + Sidebar-Tree.
- **`ViewerHost.onMethodCall`**: console.info-Stub. **Wird in Plan 09 ersetzt** mit echtem Engine-Method-Roundtrip (oder vorher in Plan 05, wenn Method-Calls fuer Properties-Bearbeitung in den konkreten Dialogen gebraucht werden).
- **`getMetadataFor`** liefert Default `{ type: "string" }` fuer alle (Klasse, Property)-Kombinationen. **Wird in Plan 05 pro Klasse befuellt** durch `registerTypeMetadata` in den ChildDialog-Modulen.

Diese Stubs sind im Plan dokumentiert (Plan 04 ist explizit Foundation-Layer); kein Stub blockiert die Foundation-Funktion selbst.

## Self-Check: PASSED

- Alle 43 Dateien aus `key_files` existieren (verifiziert nach jedem Task via Build + Tests).
- Alle 3 Commit-Hashes (1fbe0c8, 7d7c921, 14569a2) sind im `git log` auf main.
- 30/30 Tests grün.
- npm run build clean.
- vite dev startet auf Port 3000.
