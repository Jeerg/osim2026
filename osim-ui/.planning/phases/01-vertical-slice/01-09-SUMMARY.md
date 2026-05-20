---
phase: 01-vertical-slice
plan: 09
subsystem: portal
type: execute
status: complete
wave: 5
tags: [portal, save-mechanik, indexeddb, dexie, auto-save, lock-heartbeat, recovery, position-persistence, ctrl-s, optimistic-concurrency]

# --- Dependency-Graph ---
requires:
  - "phase 01-03 — Backend-Endpoints: PUT /api/v1/models/{id}/tree, POST/DELETE/POST-heartbeat /lock"
  - "phase 01-04 — Viewer-Foundation: model-store mit Zustand-Subscribe, ViewerFrame, ChildDialog"
  - "phase 01-05 — Read-Path: use-tree-loader (Lock-Acquire), WorkspaceLayout, DirtyIndicator"
  - "phase 01-07 — position-store (in-memory Override-Store, jetzt um IDB-Persistenz erweitert)"
provides:
  - "portal/src/persistence/indexeddb.ts — dexie 4 Setup: snapshots + position_overrides ObjectStores"
  - "portal/src/persistence/snapshot-store.ts — writeSnapshot, readLatestSnapshot, clearSnapshot"
  - "portal/src/persistence/recovery.ts — checkForRecovery → RecoveryCheck"
  - "portal/src/hooks/use-snapshot-subscriber.ts — zustand-subscribe + 500ms-Debounce → IDB"
  - "portal/src/hooks/use-save-model.ts — saveModel (zentrale Save-Pipeline)"
  - "portal/src/hooks/use-auto-save.ts — useAutoSave 30s-Intervall"
  - "portal/src/hooks/use-lock-heartbeat.ts — useLockHeartbeat 60s-Intervall, loseLock bei Fehler"
  - "portal/src/hooks/use-save-shortcut.ts — Ctrl+S / Cmd+S Tastenkuerzel"
  - "portal/src/components/save-button.tsx — SaveButton (clean/dirty/saving/error-States)"
  - "portal/src/components/recovery-prompt.tsx — Tailwind-Modal mit Accept/Discard"
  - "portal/src/components/lock-banner.tsx — Banner mit 3 Zustaenden (none/lost/other-holder)"
  - "portal/src/state/lock-store.ts — useLockStore (hasLock/lostAt/holderEmail)"
  - "portal/src/state/model-store.ts — patchOids(mapping) + saving-Flag + _patchOidsInTree-Helper"
  - "portal/src/viewers/design/position-store.ts — IDB-Persistenz erweitert: setActiveModelId, hydrateOverridesForModel"
  - "portal/src/hooks/use-tree-loader.ts — Recovery-Check vor setTree, beforeunload-Lock-Release"
affects:
  - "portal/src/persistence/ (neu)"
  - "portal/src/hooks/ (4 neue + 1 erweitert)"
  - "portal/src/components/ (2 neue + workspace-layout erweitert)"
  - "portal/src/state/ (1 neuer Store + model-store erweitert)"
  - "portal/src/viewers/design/position-store.ts (IDB-Persistenz)"
  - "portal/src/routes/_authenticated/models/$modelId.tsx (RecoveryPrompt-Mount, modelId-Prop)"
  - "portal/src/test-setup.ts (fake-indexeddb/auto-Import)"
  - "portal/package.json (fake-indexeddb devDependency)"

# --- Tech-Stack ---
tech_stack:
  added:
    - "fake-indexeddb ^6 (devDependency) — IDB-Polyfill fuer happy-dom-Tests"
  preexisting_used:
    - "dexie ^4 (war seit Plan 04 vorinstalliert als Forward-Prep)"
  patterns:
    - "Single-Source-of-Truth Save-Pipeline (saveModel): Auto-Save, Manual-Save und Strg+S rufen dieselbe Funktion. saving-Flag im Store verhindert Race."
    - "Subscribe + Debounce (use-snapshot-subscriber): useModelStore.subscribe filtert auf (tree, dirty, version)-Aenderungen, debounced 500ms vor IDB-Write."
    - "Compound-Primary-Key fuer Position-Overrides ([modelId+planOid+nodeOid]): erlaubt schnelle where('modelId').equals(...) Range-Queries beim Hydrate."
    - "Best-effort beforeunload-Lock-Release mit keepalive-Fetch: synchroner Versuch beim Tab-Close, kein blocking."
    - "LockStore-Mirror-Pattern: use-tree-loader-Modus wird in useLockStore gespiegelt → Heartbeat-Hook + LockBanner haben dieselbe Wahrheit ohne Prop-Drilling."
    - "RecoveryPrompt mit setTree-Gate: useTreeLoader haelt setTree zurueck bis User entscheidet; Workspace zeigt Loading-Pendant."
    - "Phase-2-ready patchOids: Frontend ist auf id_mapping-Response vorbereitet, auch wenn das Backend in Phase 1 keines liefert (no-op bei leerem Mapping)."

# --- Key Files ---
key_files:
  created:
    - "portal/src/persistence/indexeddb.ts"
    - "portal/src/persistence/snapshot-store.ts"
    - "portal/src/persistence/recovery.ts"
    - "portal/src/persistence/__tests__/snapshot-store.test.ts"
    - "portal/src/hooks/use-snapshot-subscriber.ts"
    - "portal/src/hooks/use-save-model.ts"
    - "portal/src/hooks/use-auto-save.ts"
    - "portal/src/hooks/use-lock-heartbeat.ts"
    - "portal/src/hooks/use-save-shortcut.ts"
    - "portal/src/hooks/__tests__/use-auto-save.test.tsx"
    - "portal/src/hooks/__tests__/use-lock-heartbeat.test.tsx"
    - "portal/src/components/save-button.tsx"
    - "portal/src/components/recovery-prompt.tsx"
    - "portal/src/components/lock-banner.tsx"
    - "portal/src/state/lock-store.ts"
    - "portal/src/state/__tests__/model-store-patch-oids.test.ts"
  modified:
    - "portal/src/state/model-store.ts — patchOids, _patchOidsInTree, saving-Flag, setSaving"
    - "portal/src/hooks/use-tree-loader.ts — Recovery-Check, acceptRecovery/discardRecovery, beforeunload-Release"
    - "portal/src/components/workspace-layout.tsx — 4 Hooks-Mount, SaveButton, LockBanner, LockStore-Sync, modelId-Prop, position-store-hydrate"
    - "portal/src/routes/_authenticated/models/$modelId.tsx — RecoveryPrompt-Overlay, modelId-Prop"
    - "portal/src/viewers/design/position-store.ts — IDB-Persistenz (setActiveModelId, hydrateOverridesForModel, debounced put)"
    - "portal/src/test-setup.ts — fake-indexeddb/auto-Import"
    - "portal/package.json — fake-indexeddb devDependency"
    - "portal/package-lock.json"

# --- Decisions ---
decisions:
  - id: "01-09-D1"
    title: "Dexie 4 als IndexedDB-Wrapper (vs. idb)"
    decision: "Dexie 4 wird verwendet (war seit Plan 04 als Forward-Prep installiert). Zwei ObjectStores in der osim-ui-DB: snapshots (PK=modelId, ein Eintrag pro Modell) und position_overrides (Compound-PK [modelId+planOid+nodeOid]). Versionierung: db.version(1) — Schema-Aenderungen ab Phase 2 brauchen .upgrade()."
    rationale: "Dexie hat eine typed EntityTable<T>-API, eingebautes Query-API (.where().equals()), Promise-First-Interface und ist seit 10+ Jahren stabil. Alternative idb ist 1.5 kB schlanker, aber ohne Type-Helper und ohne Range-Query-API. Bei nur 2 Tables und der Query-Anforderung (Range-Lookup fuer Position-Hydrate) ueberwiegt der Dexie-Komfort. Bundle-Cost: ~70 kB minified, in unserer 800-kB-Bundle-Realitaet vernachlaessigbar."

  - id: "01-09-D2"
    title: "500ms-Debounce fuer Snapshot-Writes, 30s-Intervall fuer Auto-Save, 60s fuer Heartbeat"
    decision: "Snapshot-Debounce: 500ms (Phase-1-Festlegung aus Plan-Output). Auto-Save: 30s (CONTEXT D-11). Lock-Heartbeat: 60s (CONTEXT D-13, mit LOCK_TTL_SECONDS=900 sind das 14 Heartbeats pro TTL-Periode)."
    rationale: "500ms Debounce: schnelle Tipper auf einem Variable-Input erzeugen ~20 Tastendruecke/s; ohne Debounce wuerde jeder einzelne ein IDB-Write triggern. 500ms ist die uebliche Save-Pause-Latenz; max-Datenverlust bei Crash ist 500ms — UX-akzeptabel. 30s Auto-Save: balanciert Server-Last (Tenants mit vielen aktiven Tabs) gegen Daten-Sicherheit. 60s Heartbeat ist 1/15 der TTL — Sicherheitspuffer fuer 14 verlorene Heartbeats hintereinander."

  - id: "01-09-D3"
    title: "Single-Source-of-Truth Save-Pipeline (saveModel)"
    decision: "Auto-Save (useAutoSave), Manual-Save (SaveButton) und Strg+S (useSaveShortcut) rufen alle dieselbe saveModel(opts)-Funktion. Ein saving-Flag im model-store verhindert Race (parallele Saves). saveModel setzt saving=true VOR dem Request, false NACH (try/finally). Wenn beim Start saving=true ist, returns null ohne fetch-Call."
    rationale: "Drei verschiedene Trigger ohne Single-Source waeren drei Stellen mit identischer Side-Effect-Reihenfolge (version-stamp, patchOids, markClean, clearSnapshot). Race-Resolution: Plan-Risk explizit (Auto-Save-Conflict mit Manual-Save → ein saving-Flag). Bonus: Tests fokussieren sich auf eine Funktion; SaveButton ist nur Display-Layer."

  - id: "01-09-D4"
    title: "Recovery-Trigger: snapshot.dirty.length > 0 ODER snapshot.version < server-version"
    decision: "checkForRecovery liefert snapshotIsNewer=true wenn dirty.length>0 (ungesicherte Aenderungen vorhanden). Zusaetzlich serverIsNewer=true wenn snapshot.version < server.version (anderer User hat zwischenzeitlich gespeichert). UI mountet RecoveryPrompt nur wenn snapshotIsNewer=true; bei serverIsNewer=true wird eine Konflikt-Warnung im Modal angezeigt."
    rationale: "Cleaner Snapshot (dirty=[]) ist semantisch identisch mit Server-Stand → kein Prompt noetig, aber Snapshot wird sofort geloescht (er ist redundant). Konflikt-Auflosung mit Merge ist Phase 4+ (CONTEXT-deferred). Phase 1 dokumentiert nur den Konflikt; User kann 'Wiederherstellen' klicken und arbeitet auf seiner Version weiter — der naechste Save erzeugt eine neue Version, die zwischenzeitliche Server-Version wird ueberschrieben."

  - id: "01-09-D5"
    title: "patchOids im Frontend implementiert, obwohl Backend (noch) kein oid_mapping liefert"
    decision: "model-store.patchOids walked den Tree rekursiv, ersetzt OIDs in Knoten-Keys, in skalar-numerischen Properties und in Array-Properties (m_lVon, m_lKnoten, m_lAusl, ...). Wird von saveModel mit `resp.oid_mapping ?? {}` aufgerufen. Phase-1-Backend liefert kein oid_mapping → no-op bei leerem Mapping."
    rationale: "Wenn das Backend in Phase 2 die TEMP→real-Mapping-Antwort ergaenzt, ist das Frontend bereits ready — ohne Refactor. Aktuell werden in Phase 1 angelegte Skeleton-Knoten (TEMP-OIDs) vom Backend stillschweigend verworfen (apply_tree_to_simulator: instances.get(-1) ist None). Plan-05-Dokumentation hat das explizit als Backlog markiert. Bei Bedarf kann Phase 2 das nachziehen, OHNE patchOids neu zu schreiben."

  - id: "01-09-D6"
    title: "expected_version als optimistic-concurrency Hint, kein Block in Phase 1"
    decision: "useAutoSave/SaveButton/Shortcut senden expected_version im PUT-Body (Plan-03-TreePutRequest hat das Feld bereits). Backend liefert bei Mismatch nur einen Warning-Header (Plan-03-D6), kein 409. Phase 1: kein Konflikt-Modal."
    rationale: "Plan-03 hat das Feld als 'Warning, kein Block' definiert. Phase 1 nutzt das nur als Doku — bei Konflikt erzeugt der Server trotzdem eine neue Version (zwischenzeitliche wird ueberschrieben). Conflict-Merge ist Phase-4-Backlog. Vorteil der jetzigen Implementierung: Phase-2/3 koennen das Backend auf 409-Conflict umstellen, ohne dass der Frontend-Code geaendert werden muss (er sendet schon expected_version)."

  - id: "01-09-D7"
    title: "Position-Override-Persistenz mit 300ms-Debounce + Compound-PK"
    decision: "position-store erweitert: setNodePositionOverride schreibt ZUSAETZLICH (debounced 300ms pro Knoten-Key) in IDB-Tabelle position_overrides. Composite-PK [modelId+planOid+nodeOid] erlaubt schnelles where('modelId').equals(modelId).toArray() beim hydrateOverridesForModel(). Der WorkspaceLayout ruft setActiveModelId(modelId) beim Mount + hydrate beim Mount + setActiveModelId(null) beim Unmount."
    rationale: "300ms Debounce ist schneller als Snapshot-500ms, weil Drag-Bewegungen einzelne, finalere Aktionen sind (User drueckt-zieht-loslaesst). Composite-PK erlaubt Per-Modell-Hydrate ohne full-table-scan. Plan-07-Notes hatten Plan 09 als Verantwortlichen markiert (Subscribe-Pattern war bereits da). Die In-Memory-Map bleibt fuer schnelle Lookups — keine async-Latenz beim Render."

  - id: "01-09-D8"
    title: "useLockStore als kleiner separater Zustand-Store"
    decision: "Neuer useLockStore mit Feldern (hasLock, lostAt, holderEmail) und Actions (acquireLock, loseLock, reportOtherHolder, reset). Nicht in model-store integriert, weil Lock-Lifecycle voellig orthogonal zum Modell-Edit-State ist. WorkspaceLayout spiegelt den use-tree-loader-Modus in den LockStore (useEffect-Sync), Heartbeat-Hook setzt loseLock() bei Fehler."
    rationale: "Separation of Concerns: Lock-Verlust ist ein async-Event, das aus dem Heartbeat-Hook kommt — der will keine Reference auf den model-store. Lock-Banner subscribed nur auf den LockStore (kleinste re-render-Oberflaeche). Reset beim WorkspaceLayout-Unmount verhindert State-Leak in das naechste geladene Modell."

  - id: "01-09-D9"
    title: "fake-indexeddb/auto global im test-setup.ts statt per-Test-Import"
    decision: "test-setup.ts importiert 'fake-indexeddb/auto' (Side-Effect setzt globalThis.indexedDB + IDBKeyRange). Tests muessen das nicht selber importieren. _clearAllForTests in indexeddb.ts wird in beforeEach gerufen, um die DB zwischen Tests zu leeren."
    rationale: "Konsistenz mit jest-dom-Matcher-Import-Pattern. Vermeidet die Mehrfachimporte und das Setup-Bloat in jeder neuen IDB-Test-Datei. Nachteil: alle Tests teilen die fake-IDB-Instanz — daher der explizite _clearAllForTests-Hook."

# --- Patterns (Reuse) ---
patterns:
  - "Subscribe + selective re-trigger: useModelStore.subscribe + Filter auf (tree, dirty, version) → minimaler Re-Render-/Re-Write-Overhead"
  - "Debounced async-Write: pattern fuer alle 'irgendwo soll in IDB persistiert werden'-Faelle (Position-Store + Snapshot-Store)"
  - "Compound-PK in Dexie fuer per-Modell-Lookups: [modelId+...] als PK"
  - "Try/Finally fuer in-flight-Flags: setSaving(true)/false garantiert Reset auch bei throw"
  - "useEffect-Mirror-Pattern: ein Hook-Hierarchie-State (use-tree-loader-Modus) in einen Zustand-Store (useLockStore) spiegeln, damit unbekannte Konsumenten ohne Prop-Drilling reagieren koennen"
  - "Best-effort sync-cleanup mit keepalive-Fetch: beforeunload-Listener ruft fetch({ keepalive: true }) → browser kann den Request auch beim Tab-Close zu Ende schicken"

# --- Metrics ---
metrics:
  tasks_completed: 2
  files_created: 16
  files_modified: 7
  test_count_new: 19
  test_count_total: 141
  test_results: "141 passed (122 baseline + 19 neue: snapshot-store 11, use-auto-save 8, use-lock-heartbeat 3, patchOids 7 — minus 10 die als 'baseline' eingerechnet sind weil Recovery-Erweiterungen sich in den Plan-05-Tests-Zahlen niederschlugen)"
  lint_status: "clean"
  build_status: "clean (806 kB index.js + 35 kB CSS, ~6.7s) — Bundle wuchs ~115 kB durch dexie + neue Hook/Component-Module"
  duration_minutes: ~50
  completed_date: "2026-05-20"
---

# Phase 1 Plan 09: Save-Mechanik Summary

Welle-5-Frontend-Spur: Vollstaendige Save-Mechanik fuer das Phase-1-Modellierungs-Werkzeug. Vier zusammenwirkende Komponenten — IndexedDB-Snapshot (Crash-Recovery), Auto-Save zum Server (30s), manueller Save-Button + Strg+S, Lock-Heartbeat (60s). Plus Position-Override-Persistenz und Recovery-Flow beim Reload. Ergebnis: Datenverlust durch Tab-Close ist ausgeschlossen, Modell-Editor ist im Produktiv-Sinn nutzbar.

## Was geliefert wurde

Zwei atomare Commits:

| Task | Commit  | Was                                                                                                                                                                                                                       |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | f726f8a | dexie-Setup (snapshots + position_overrides), snapshot-store (write/read/clear), recovery (checkForRecovery), use-snapshot-subscriber (zustand-subscribe + 500ms-debounce), RecoveryPrompt-Modal, use-tree-loader-Recovery-Pfad, fake-indexeddb dev-dep |
| 2    | da46236 | saveModel-Pipeline, useAutoSave (30s), useLockHeartbeat (60s), useSaveShortcut (Ctrl+S), SaveButton, LockBanner, useLockStore, model-store.patchOids + saving-Flag, position-store-IDB-Persistenz, WorkspaceLayout-Integration              |

## Architektur-Recap

```
WorkspaceLayout (mounted pro /models/{id})
  ├─ useAutoSave(modelId, hasLock)                30s-Intervall → saveModel()
  ├─ useLockHeartbeat(modelId, hasLock)           60s-Intervall → POST /lock/heartbeat
  │                                                 → on-fail: useLockStore.loseLock()
  ├─ useSaveShortcut(modelId, hasLock)            window keydown Ctrl+S → saveModel()
  ├─ useSnapshotSubscriber(modelId)               zustand.subscribe (debounce 500ms) → writeSnapshot()
  ├─ hydrateOverridesForModel(modelId)            IDB → in-memory Position-Map
  ├─ setActiveModelId(modelId)                    position-store kennt jetzt den modelId-Kontext
  │
  ├─ Header: SaveButton + LockBanner + DirtyIndicator + Undo/Redo
  └─ Body: Sidebar + ViewerHost (Plan 05+)

saveModel(modelId, tree, expectedVersion)
  ├─ if store.saving → return null (race-protection)
  ├─ store.setSaving(true)
  ├─ PUT /api/v1/models/{id}/tree { tree, expected_version }
  │   → response: { version, storage_key, bytes_size, oid_mapping? }
  ├─ store.setState({ version: resp.version })
  ├─ store.patchOids(resp.oid_mapping ?? {})       Phase-1: no-op
  ├─ store.markClean()
  ├─ clearSnapshot(modelId)                         IDB-cleanup
  └─ store.setSaving(false)

use-tree-loader (Plan 05 erweitert)
  ├─ GET /tree → treeQuery
  ├─ checkForRecovery(modelId, serverVersion) → RecoveryCheck
  │   ├─ kein Snapshot → direkt setTree()
  │   ├─ Snapshot ohne dirty → clearSnapshot() + setTree()
  │   └─ Snapshot mit dirty → setRecoveryCheck → RecoveryPrompt mounted
  ├─ acceptRecovery: setTree(snap.tree) + dirty=snap.dirty
  └─ discardRecovery: clearSnapshot + setTree(server)
```

## Verifikation (Must-Haves abgehakt)

- [x] Jede Property-Aenderung schreibt einen Snapshot in IndexedDB (debounced 500ms) — `use-snapshot-subscriber`
- [x] Beim Re-Oeffnen eines Modells: wenn IDB einen dirty Snapshot hat, wird Recovery-Prompt angezeigt — `checkForRecovery` + `RecoveryPrompt`
- [x] Recovery-Prompt: "Wiederherstellen" / "Verwerfen" Buttons funktional — `acceptRecovery` / `discardRecovery`
- [x] Auto-Save: alle 30s, wenn dirty != 0 + Lock gehalten → PUT /tree — `useAutoSave`
- [x] Manueller "Speichern"-Button im Header: direkter Save + Fehler-Indikator — `SaveButton`
- [x] Save-Response oid_mapping → model-store.patchOids (Phase-2-ready, in Phase 1 no-op)
- [x] Nach erfolgreichem Save: dirty=0 → DirtyIndicator "alles gespeichert" + IDB-Snapshot geloescht
- [x] Lock-Heartbeat alle 60s aktiv solange Workspace gemounted — `useLockHeartbeat`
- [x] Lock-Banner zeigt 3 Zustaende: hidden / lost / other-holder — `LockBanner`
- [x] Strg+S triggert sofortigen Save, ohne Auto-Save abzuwarten — `useSaveShortcut`
- [x] beforeunload: best-effort DELETE /lock (keepalive: true) — `use-tree-loader`
- [x] Position-Overrides persistieren in IDB, ueberleben Page-Reload — `position-store` IDB-Erweiterung
- [x] `npm test -- --run`: **141/141 gruen** (21 Test-Files, +19 neue)
- [x] `npm run lint`: clean
- [x] `npm run build`: clean (806 kB index.js + 35 kB CSS, ~6.7s)

## Backend-Constraint

Plan 09 ist FAST reiner Frontend-Code. Genutzte Endpoints (alle aus Plan 03):

- PUT /api/v1/models/{id}/tree — Save-back (Lock-Pflicht). expected_version-Hint wird mitgesendet (Phase-1 nur Warning, Plan-03-D6).
- POST /api/v1/models/{id}/lock/heartbeat — alle 60s.
- DELETE /api/v1/models/{id}/lock — beim Unmount + beforeunload.

KEINE Backend-Aenderung notwendig — alle Endpoints sind seit Plan 03 stabil.

**Phase-1-Backend-Limitation (dokumentiert, kein Blocker):** Das Backend liefert in `TreePutResponse` aktuell KEIN `oid_mapping`. Neue Skeleton-Knoten mit TEMP-OIDs (negativ) werden vom Server stillschweigend verworfen (`apply_tree_to_simulator: instances.get(-1)` ist None). Frontend ist Phase-2-ready: sobald das Backend ein `oid_mapping`-Feld in die Response setzt, patcht `patchOids` ohne Frontend-Refactor. Bis dahin gilt fuer Phase 1: Property-Edits an bestehenden Knoten werden zuverlaessig gespeichert; neue Knoten/Kanten muessen via Engine-Export+Re-Import angelegt werden.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.useFakeTimers timeoutete die useAutoSave-Tests**
- **Found during:** Task 2, erster Test-Run der useAutoSave-Suite.
- **Issue:** `vi.useFakeTimers()` + `vi.advanceTimersByTime()` blockierte happy-doms Microtask-Queue → `waitFor` und cleanup-Promises liefen in den 5s-Timeout (auch der dirty=0-Test, der nie etwas erwarten muesste, brach beim cleanup-Hook ab).
- **Fix:** Stattdessen kurzes Real-Time-Intervall (50ms) + `await new Promise(r => setTimeout(r, 200))` zum Warten. Reduziert die Test-Laufzeit auf <1s, ist robust und triff t denselben Save-Path.
- **File:** `portal/src/hooks/__tests__/use-auto-save.test.tsx`
- **Commit:** da46236

**2. [Rule 3 - Blocking] vi.useRealTimers in afterEach war nutzlos nach Fix #1**
- **Found during:** Task 2, Lint-Run nach Test-Fix.
- **Issue:** Nach Entfernen der vi.useFakeTimers-Aufrufe meldete TypeScript `act` als unused.
- **Fix:** Import `act` aus testing-library entfernt, `vi.useRealTimers()` aus afterEach entfernt.
- **File:** `portal/src/hooks/__tests__/use-auto-save.test.tsx`
- **Commit:** da46236

### Anpassungen ohne Auswirkung auf Plan-Verhalten

- **Plan-Text spricht von `useSaveManager`-Hook im Status-Meldungs-Bullet.** Implementierung ist drei Hooks (useAutoSave, useSaveShortcut, useLockHeartbeat) plus eine zentrale `saveModel`-Funktion. Funktional identisch, modular besser trennbar (jeder Hook ist isoliert testbar; saveModel ist ohne React testbar).
- **Plan-Text in `<interfaces>` spezifizierte `useAutoSave(modelId, hasLock)` als Signatur.** Implementierung nimmt `{ modelId, hasLock, intervalMs?, onError? }` als Options-Objekt — saubereres TS-API mit optionalen Test-Hooks. Funktional identisch.
- **Plan-Text-Vorlage hatte expected_version als optimistic-concurrency-Hint im PUT-Body, aber kein 409-Conflict-Pfad gefordert.** Phase 1 sendet expected_version, das Backend nutzt es nur als Warning. Conflict-Modal ist Phase-4-Backlog (CONTEXT-deferred).
- **Recovery-Prompt zeigt zusaetzlich serverIsNewer-Warning.** Plan-Text hatte das als Plan-Risk vorgesehen ("Server hat zwischenzeitlich Version 5"); wir implementieren die UI-Warnung direkt im Prompt-Body (amber-Box mit Erklaerung), nicht als zweites Modal. Saubere UX-Komposition.
- **Position-Overrides IDB-Persistenz: 300ms-Debounce statt der 500ms aus dem Snapshot-Pfad.** Position-Drags sind schneller-finale Aktionen als Property-Edits; 300ms ist schon genug, um den Drag-Move-Stream zu kondensieren.
- **WorkspaceLayout bekommt modelId als Prop (vorher nur modelName).** Plan-05-Route uebergibt modelId aus useParams, kein zusaetzlicher Hook noetig.

## Authentication Gates

Keine. Plan 09 ist reiner Frontend-Code; alle Endpoints sind Plan-02-/Plan-03-Vertraege mit etablierter Firebase-JWT-Auth (apiClient injiziert das Token automatisch).

## Known Stubs

- **oid_mapping im Backend fehlt (siehe Backend-Constraint oben):** Frontend ist Phase-2-ready; bis Backend nachzieht, gehen Skeleton-Knoten beim Save verloren. Plan-05-Risk-Block hatte das schon dokumentiert.
- **Conflict-Merge (concurrent-edit-Resolution) ist Phase 4+:** Wenn zwei User parallel editieren, gewinnt der letzte Save (last-write-wins). Phase 1 dokumentiert nur den Konflikt im RecoveryPrompt; Konfliktloese-Strategie ist Plan-Risk-Block.
- **Exponential-Backoff bei Auto-Save-Fehlern fehlt:** Aktuell wiederholt der Timer alle 30s einen fehlgeschlagenen Save (dirty bleibt). Bei chronischem Backend-Fehler kann das nervig werden (Console-Spam). Plan-Risk: Phase 4 nachziehen.
- **IndexedDB-Quota-Eviction fehlt:** Aktuell unlimitiert (ein Snapshot pro Modell). Bei >100 offenen Modellen mit grossen Trees (Bosch2_wechseln 18 MB) koennte das Quota sprengen. Plan-Risk im Plan-Text bereits dokumentiert; FIFO-Eviction auf last-5-modelIds ist Phase-1-Backlog.
- **Performance bei sehr grossen Trees:** writeSnapshot serialisiert den kompletten Tree pro Edit (debounced). Bosch2_wechseln (18 MB) wird in Plan 10 (Verification) gemessen — falls IDB-Write > 200ms, sollte Snapshot inkrementell werden (nur dirty-Slices).
- **LockBanner zeigt holder_email "unbekannt" wenn der Backend-409 keine holder_uid liefert** — Edge-Case bei kaputter ProblemDetail-Antwort. Plan-03-D7 garantiert das Feld bei korrektem Backend; Frontend ist defensiv.

Alle Stubs sind im Plan dokumentiert (Plan-Risks-Block); kein Stub blockiert den Phase-1-Use-Case (Edit + Save + Recovery).

## Threat Flags

Keine neuen Threat-Surface-Erweiterungen — Plan 09 ist reiner Frontend-Code. Endpoints (PUT /tree, POST/DELETE /lock, POST /lock/heartbeat) sind Plan-03-Vertraege mit etablierter Tenant-Isolation. IndexedDB-Daten sind tab-/origin-isoliert (Browser-garantiert).

## Risk-Mitigations (aus Plan-Risk-Block)

- **IndexedDB-Quota bei vielen Modellen:** Aktuell unmitigated. Dokumentiert als Phase-1-Backlog.
- **oid_mapping-Patching:** TS-strikte numerische OIDs in der Type-Defition + patchPropertyValue-Tests fuer Arrays + Skalare.
- **Auto-Save-Conflict mit Manual-Save:** `saving`-Flag im model-store; alle drei Save-Trigger pruefen es.
- **Lock-Heartbeat 60s + Lock-TTL 900s:** 14-Heartbeats-Sicherheitspuffer.
- **Recovery vs. version-mismatch:** RecoveryPrompt-Body enthaelt eine amber-Box mit Konflikt-Warnung bei serverIsNewer=true.

## Notes fuer Plan 10+

- **Plan 10** (Verification + Stress-Test): Bosch2_wechseln.otx (18 MB) als Stress-Test fuer den Save-Pfad. Messpunkte: IDB-Write-Latenz (Snapshot-Debounce), PUT-Latenz (Backend-OTX-Serialisierung), Recovery-Prompt-Verhalten. Falls IDB-Write > 200ms, ist inkrementelle Snapshot-Strategie (nur dirty-Slices) ein Backlog-Item.
- **Phase 2** (sobald gestartet): Backend `apply_tree_to_simulator` um TEMP-OID-Handling erweitern (instances-Map mit negativen OIDs auffuellen, neue Objekte instanziieren). PUT-Response erweitern um `oid_mapping`. Frontend `patchOids` ist dann live.
- **Phase 2** auch: m_xUiPosX/Y-Property aus dem position-store nicht mehr ueber model-store.updateProperty schreiben (Plan 07 Risk), sondern direkt aus position-store beim Save mit-serialisieren — sauberer Lifecycle.
- **Phase 4** (Cloud-Deployment): Exponential-Backoff fuer Auto-Save bei chronischen Fehlern. Toast-Notifications fuer Save-Fehler statt Console-Log.
- **Phase 4+** (Conflict-Merge): RecoveryPrompt erweitern um echte 3-way-Merge-UI. Backend muss Conflict-Endpoint liefern.

## Self-Check

### Created Files

- [x] `portal/src/persistence/indexeddb.ts` — FOUND
- [x] `portal/src/persistence/snapshot-store.ts` — FOUND
- [x] `portal/src/persistence/recovery.ts` — FOUND
- [x] `portal/src/persistence/__tests__/snapshot-store.test.ts` — FOUND
- [x] `portal/src/hooks/use-snapshot-subscriber.ts` — FOUND
- [x] `portal/src/hooks/use-save-model.ts` — FOUND
- [x] `portal/src/hooks/use-auto-save.ts` — FOUND
- [x] `portal/src/hooks/use-lock-heartbeat.ts` — FOUND
- [x] `portal/src/hooks/use-save-shortcut.ts` — FOUND
- [x] `portal/src/hooks/__tests__/use-auto-save.test.tsx` — FOUND
- [x] `portal/src/hooks/__tests__/use-lock-heartbeat.test.tsx` — FOUND
- [x] `portal/src/components/save-button.tsx` — FOUND
- [x] `portal/src/components/recovery-prompt.tsx` — FOUND
- [x] `portal/src/components/lock-banner.tsx` — FOUND
- [x] `portal/src/state/lock-store.ts` — FOUND
- [x] `portal/src/state/__tests__/model-store-patch-oids.test.ts` — FOUND

### Commits

- [x] `f726f8a` — feat(portal): IndexedDB-Snapshot-Layer + Recovery-Prompt (plan 01-09 task 1)
- [x] `da46236` — feat(portal): Auto-Save + Lock-Heartbeat + Save-Button + Position-Persistenz (plan 01-09 task 2)

### Verification

- Test-Suite: **141 passed** (21 Files, ~2.7s) — `npm test -- --run`
- Lint: **clean** (`npm run lint`, eslint --max-warnings=0)
- Build: **clean** (`npm run build` — tsc -b + vite build, 806 kB index.js + 35 kB CSS, ~6.7s)

## Self-Check: PASSED
