---
phase: 01-vertical-slice
plan: 11
type: execute
wave: 7
depends_on:
  - 01-10-graphobject-design-viewer
files_modified:
  - portal/src/snapshot/db.ts
  - portal/src/snapshot/snapshot-service.ts
  - portal/src/snapshot/__tests__/snapshot-service.spec.ts
  - portal/src/api/locks.ts
  - portal/src/stores/lock-store.ts
  - portal/src/hooks/useAutoSave.ts
  - portal/src/hooks/useLockHeartbeat.ts
  - portal/src/hooks/useSnapshotRestore.ts
  - portal/src/components/WorkspaceStatusBar.tsx
  - portal/src/components/ViewerHintSwitcher.tsx
  - portal/src/routes/_authenticated/models/$id.tsx
  - portal/src/sidebar/ModelTree.tsx
  - portal/src/stores/__tests__/lock-store.spec.ts
  - portal/src/hooks/__tests__/useAutoSave.spec.ts
autonomous: true
requirements:
  - SC-7
priority: critical

must_haves:
  truths:
    - "Auto-Save dispatcht alle 30 s eine PUT-Request, wenn store.dirty === true."
    - "Manueller 'Speichern'-Button in der Statusbar speichert sofort + setzt dirty=false."
    - "Bei jeder Store-Mutation wird ein IndexedDB-Snapshot geschrieben (via dexie + Sequence-Counter gegen Race aus Pitfall #6)."
    - "Beim Workspace-Mount wird IndexedDB nach Snapshots für modelId durchsucht; wenn newer-than-server → User-Dialog 'Snapshot wiederherstellen?'."
    - "Lock wird beim Workspace-Mount via POST /lock acquired; alle 30 s Heartbeat; bei beforeunload via navigator.sendBeacon released."
    - "Bei 409-Lock-Conflict zeigt UI 'Modell wird von X bearbeitet' und schaltet alle OCtrls auf disabled (read-only)."
    - "WorkspaceStatusBar zeigt: dirty-Indicator (Punkt), letzte-Save-Zeit, lock-status (own/foreign/expired), [Speichern]-Button, [Undo]/[Redo]-Buttons."
    - "ViewerHintSwitcher in Workspace ermöglicht Wechsel zwischen std/design/matrix Viewer-Varianten."
  artifacts:
    - path: "portal/src/snapshot/db.ts"
      provides: "Dexie-DB-Schema mit snapshots-Table (modelId + timestamp compound key, sequence index)"
      contains: "class OsimDB"
    - path: "portal/src/snapshot/snapshot-service.ts"
      provides: "saveSnapshot/loadLatestSnapshot/clearSnapshots mit Sequence-Counter (Pitfall #6)"
      contains: "saveSnapshot"
    - path: "portal/src/hooks/useAutoSave.ts"
      provides: "Hook: 30s-Interval + Save-bei-dirty; cancel on unmount"
      contains: "useAutoSave"
    - path: "portal/src/hooks/useLockHeartbeat.ts"
      provides: "Hook: 30s-Heartbeat + beforeunload-Release; expired → toast + read-only"
      contains: "useLockHeartbeat"
    - path: "portal/src/components/WorkspaceStatusBar.tsx"
      provides: "Footer-Bar mit Save/Undo/Lock-Status/Speichern-Button"
      contains: "WorkspaceStatusBar"
  key_links:
    - from: "Jede Store-Mutation"
      to: "snapshot-service.saveSnapshot"
      via: "Zustand-subscribeWithSelector (subscribe nur auf wire-Änderungen)"
      pattern: "subscribe"
    - from: "useAutoSave-Hook"
      to: "useSaveModel (Plan 07 mutation) + lockToken aus useLockStore"
      via: "setInterval(30000); on tick if dirty && lockToken → mutate"
      pattern: "30000"
    - from: "useLockHeartbeat-Hook"
      to: "POST /api/v1/models/{id}/lock/heartbeat"
      via: "setInterval(30000) + onUnmount → sendBeacon for release"
      pattern: "sendBeacon"
---

<objective>
Die letzte Funktional-Komponente der Phase 1: Auto-Save + IndexedDB-Crash-Recovery + Lock-Heartbeat + Read-Only-Mode für gelockte Modelle + Status-Bar. Plus ViewerHintSwitcher um zwischen std/design Viewern zu wechseln (war Defizit aus Plan 10).

Diese Welle macht Phase 1 wirklich produktiv — vorher konnte man editieren, aber Änderungen gingen bei Reload verloren und Multi-User-Conflict war unentdeckbar.

Purpose: SC-7 ("Auto-Save 30s + manueller Button + IndexedDB-Snapshot + Single-Editor-Lock") wird vollständig erfüllt.

Output: 9 neue Files (Snapshot-Layer + Lock-Store + 3 Hooks + 2 Komponenten + 2 Tests) + Workspace-Page-Erweiterung. Manueller Smoke: Login → Modell öffnen → Lock acquired → Edit → 30s warten → Auto-Save passiert → Refresh → User wird gefragt "Snapshot wiederherstellen?".
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/phases/01-vertical-slice/01-04-storage-models-locks-api-PLAN.md
@.planning/phases/01-vertical-slice/01-07-property-schema-store-sidebar-workspace-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 04 -->
```python
# Backend-Endpoints (alle implementiert)
POST /api/v1/models/{id}/lock              -> {token, expires_at} | 409 {code:E_MODEL_LOCKED, owner_user_uid, expires_at}
POST /api/v1/models/{id}/lock/heartbeat    -> {expires_at} | 404 {code:E_LOCK_EXPIRED}
DELETE /api/v1/models/{id}/lock?token=<>   -> 204
PUT  /api/v1/models/{id}                   -> SaveModelResponse | 423 {code:E_LOCK_EXPIRED}
```

<!-- Aus Plan 07 -->
```typescript
// portal/src/api/models.ts
export function useSaveModel(modelId: string): UseMutationResult<SaveModelResponse, ApiError, {wire: ModelTreeWire, lockToken: string}>

// portal/src/stores/model-store.ts
useModelStore((s) => s.dirty)
useModelStore.subscribe((state, prev) => ...)  // zustand subscribe
useModelStore.temporal.getState().undo() / .redo()

// portal/src/api/error-message.ts
import { apiErrorMessage } from "@/api/error-message"
import { ApiError } from "@/api/fetch"
```

<!-- Aus Plan 03 -->
```typescript
import { toast } from "sonner"
import { Button, Input } from "@/components/ui/..."
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Snapshot-Layer (db.ts + snapshot-service.ts + Test mit Race-Schutz)</name>
  <files>portal/src/snapshot/db.ts, portal/src/snapshot/snapshot-service.ts, portal/src/snapshot/__tests__/snapshot-service.spec.ts</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 5 (Z.1187-1236)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #6 (IndexedDB-Race)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/snapshot/*`)
    - portal/src/api/models.ts (Plan 07 — ModelTreeWire-Type)
    - portal/package.json (dexie sollte vorhanden sein aus Plan 07 Task 3)
  </read_first>
  <behavior>
    - `db.snapshots`-Table hat compound primary key [modelId, timestamp], plus indizes auf modelId und sequence.
    - `saveSnapshot(modelId, wire)` schreibt einen Snapshot mit monotonic sequence-Counter (Pitfall #6).
    - `loadLatestSnapshot(modelId) -> wire | null` liefert den jüngsten Snapshot oder null.
    - `clearSnapshots(modelId)` löscht alle Snapshots eines Modells (nach erfolgreichem Server-Save).
    - Cleanup behält max. 20 jüngste Snapshots pro Modell.
    - 4 Tests: roundtrip, sequence-counter-prevents-race, cleanup-keeps-20, clear-removes-all.
  </behavior>
  <action>
    Erstelle `portal/src/snapshot/db.ts` (RESEARCH §Example 5 Z.1192-1211):
    - `import Dexie, { type Table } from "dexie"`
    - `import type { ModelTreeWire } from "@/api/models"`
    - `interface SnapshotRow { modelId: string; timestamp: number; sequence: number; wire: ModelTreeWire; }`
    - `class OsimDB extends Dexie { snapshots!: Table<SnapshotRow, [string, number]>; constructor() { super("OsimUiDB"); this.version(1).stores({snapshots: "[modelId+timestamp], modelId, sequence"}); } }`
    - `export const db = new OsimDB()`
    - `export type { SnapshotRow }`

    Erstelle `portal/src/snapshot/snapshot-service.ts` (RESEARCH §Example 5 Z.1213-1236 + Pitfall #6):
    - `import { db, type SnapshotRow } from "./db"; import type { ModelTreeWire } from "@/api/models"`
    - Modul-State: `let seq = 0` (monotonic counter, schützt vor Race)
    - `export async function saveSnapshot(modelId: string, wire: ModelTreeWire): Promise<void>`:
      - mySeq = ++seq
      - `await db.snapshots.put({modelId, timestamp: Date.now(), sequence: mySeq, wire: structuredClone(wire)})`
      - Cleanup: behalte nur 20 jüngste pro modelId
        - `const all = await db.snapshots.where("modelId").equals(modelId).reverse().sortBy("timestamp")`
        - `if (all.length > 20) await db.snapshots.bulkDelete(all.slice(20).map(s => [s.modelId, s.timestamp]))`
    - `export async function loadLatestSnapshot(modelId: string): Promise<ModelTreeWire | null>`:
      - `const latest = await db.snapshots.where("modelId").equals(modelId).reverse().sortBy("timestamp")`
      - return latest[0]?.wire ?? null
    - `export async function clearSnapshots(modelId: string): Promise<void>`:
      - `await db.snapshots.where("modelId").equals(modelId).delete()`
    - `export async function getSnapshotCount(modelId: string): Promise<number>` (für UI-Anzeige):
      - `return db.snapshots.where("modelId").equals(modelId).count()`

    Erstelle `portal/src/snapshot/__tests__/snapshot-service.spec.ts`:
    - Setup: `import "fake-indexeddb/auto"` (npm: `fake-indexeddb` — devDep hinzufügen)
    - beforeEach: `await db.snapshots.clear()`
    - 4 Tests:
      - test_save_load_roundtrip: saveSnapshot(id, wire); loadLatestSnapshot(id) → deep-equal zu wire.
      - test_concurrent_saves_dont_lose_data: `await Promise.all([saveSnapshot(id, w1), saveSnapshot(id, w2)])`; loadLatest → einer der beiden (welcher ist egal — wichtig: kein Crash, kein leeres Result).
      - test_cleanup_keeps_only_20: save 25 snapshots → count() === 20.
      - test_clear_removes_all: save 3 → clearSnapshots → count() === 0.

    Erweitere `portal/package.json` devDependencies: `fake-indexeddb@^6` (für vitest-Tests).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npm run test:run -- snapshot 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    db.ts + snapshot-service.ts existieren. 4 Tests grün. fake-indexeddb in devDeps.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lock-Store + locks-API + Test</name>
  <files>portal/src/api/locks.ts, portal/src/stores/lock-store.ts, portal/src/stores/__tests__/lock-store.spec.ts</files>
  <read_first>
    - portal/src/api/fetch.ts (Plan 03)
    - portal/src/api/error-message.ts (Plan 03 — E_MODEL_LOCKED/E_LOCK_EXPIRED bereits gemappt)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/stores/lock-store.ts`)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-13 (Lock TTL 15 min, Heartbeat)
  </read_first>
  <behavior>
    - `useLockStore`: state `{modelId, token, expiresAt, ownerUid?, status: "idle"|"own"|"foreign"|"expired"}`.
    - `acquire(modelId)`: POST /lock; success → status="own"; 409 → status="foreign", ownerUid+expiresAt aus response; andere Fehler → toast + status="idle".
    - `heartbeat(modelId)`: POST /lock/heartbeat; 200 → expiresAt update; 404 → status="expired" + toast.
    - `release(modelId)`: DELETE /lock?token=; setState idle.
    - 4 Tests gegen fetch-Mock.
  </behavior>
  <action>
    Erstelle `portal/src/api/locks.ts`:
    - Type-Mirrors zu Backend-Pydantic:
      - `export interface LockOut { token: string; expires_at: string }`
      - `export interface LockConflict { code: "E_MODEL_LOCKED"; owner_user_uid: string; owner_email: string | null; expires_at: string }`
      - `export interface HeartbeatResponse { expires_at: string }`
    - Funktionen (NICHT Hooks — pure async functions, vom Store gerufen):
      - `export async function acquireLock(modelId: string): Promise<LockOut>` → POST `/api/v1/models/${modelId}/lock`
      - `export async function heartbeatLock(modelId: string, token: string): Promise<HeartbeatResponse>` → POST `/api/v1/models/${modelId}/lock/heartbeat` body {token}
      - `export async function releaseLock(modelId: string, token: string): Promise<void>` → DELETE `/api/v1/models/${modelId}/lock?token=${token}` (oder im Body — Plan 04 hat query-param)
      - Beacon-Version für unload: `export function releaseLockSync(modelId: string, token: string): void` mit `navigator.sendBeacon(url)` (POST mit `{model_id, token}` JSON-blob).

    Erstelle `portal/src/stores/lock-store.ts`:
    - `import { create } from "zustand"`
    - `interface LockState { modelId: string | null; token: string | null; expiresAt: Date | null; ownerUid: string | null; ownerEmail: string | null; status: "idle"|"own"|"foreign"|"expired"; }`
    - `interface LockActions { acquire(modelId): Promise<boolean>; heartbeat(): Promise<boolean>; release(): Promise<void>; reset(): void; }`
    - `export const useLockStore = create<LockState & LockActions>((set, get) => ({initial state, ...actions}))`
    - acquire-Impl:
      - try `const res = await acquireLock(modelId); set({modelId, token: res.token, expiresAt: new Date(res.expires_at), status: "own", ownerUid: null, ownerEmail: null}); return true`
      - catch ApiError: if status===409 → `set({modelId, status: "foreign", ownerUid: err.body.owner_user_uid, ownerEmail: err.body.owner_email, expiresAt: new Date(err.body.expires_at)}); toast.warning(apiErrorMessage(err))`; return false
      - other → toast.error; return false
    - heartbeat-Impl: try heartbeatLock(modelId, token); 200 → setexpiresAt; 404 → set status="expired", toast.error("Lock abgelaufen — bitte Seite neu laden"); return success.
    - release-Impl: try releaseLock; set idle. KEIN await im beforeunload — separate releaseLockSync via Beacon-API.
    - reset-Impl: set initial.

    Erstelle `portal/src/stores/__tests__/lock-store.spec.ts`:
    - vi.mock @/api/locks → mock acquireLock/heartbeatLock/releaseLock.
    - 4 Tests:
      - test_acquire_success_sets_own_status
      - test_acquire_409_sets_foreign_status_with_owner
      - test_heartbeat_404_sets_expired
      - test_release_resets_to_idle
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- lock-store 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    api/locks.ts + lock-store.ts existieren. 4 Tests grün. Status-Maschine korrekt (idle → own / foreign / expired).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: useAutoSave + useLockHeartbeat + useSnapshotRestore Hooks + Test</name>
  <files>portal/src/hooks/useAutoSave.ts, portal/src/hooks/useLockHeartbeat.ts, portal/src/hooks/useSnapshotRestore.ts, portal/src/hooks/__tests__/useAutoSave.spec.ts</files>
  <read_first>
    - portal/src/snapshot/snapshot-service.ts (Task 1)
    - portal/src/stores/model-store.ts (Plan 07)
    - portal/src/stores/lock-store.ts (Task 2)
    - portal/src/api/models.ts (Plan 07 — useSaveModel)
    - portal/src/api/locks.ts (Task 2 — releaseLockSync für beforeunload)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-11/D-12 (Auto-Save 30s + IndexedDB pro Property-Change)
  </read_first>
  <behavior>
    - `useAutoSave(modelId)`: setInterval(30000) prüft store.dirty + lock.status==="own"; bei beiden true → useSaveModel.mutate({wire, lockToken: token}); on success → store.resetDirty, toast.success("Auto-gespeichert"), clearSnapshots(modelId).
    - Außerdem: zustand-subscribe auf store.wire-Änderungen → saveSnapshot(modelId, wire) (debounced 1s; Pitfall #6 Sequence-Counter im Service ist active).
    - `useLockHeartbeat(modelId)`: on mount acquire(modelId); setInterval(30000) heartbeat; on unmount release.
    - Außerdem: `window.addEventListener("beforeunload", () => releaseLockSync(modelId, token))` für Tab-Close.
    - `useSnapshotRestore(modelId, serverWire)`: bei mount, prüft loadLatestSnapshot; wenn snapshot newer than server (snapshot timestamp > server.updated_at — Vergleich nur grob, server-updated_at gibt's noch nicht; Phase-1-Heuristik: zeige Dialog wenn Snapshot existiert UND store hat noch nicht geladen): zeige `<Dialog>` "Lokale Änderungen gefunden — wiederherstellen oder verwerfen?". User → store.loadFromWire(snapshot) ODER clearSnapshots+store.loadFromWire(serverWire).
    - 2 Tests für useAutoSave:
      - test_30s_interval_triggers_save_when_dirty: mock setInterval, mock useSaveModel.mutate; setDirty(true); advance timer 30s; assert mutate called.
      - test_save_not_called_when_lock_not_own: store.dirty=true, lock.status="foreign"; advance timer; assert mutate NOT called.
  </behavior>
  <action>
    Erstelle `portal/src/hooks/useAutoSave.ts`:
    - Imports: useEffect, useRef; useModelStore + useLockStore; useSaveModel; saveSnapshot, clearSnapshots; toast; apiErrorMessage.
    - Hook signature: `export function useAutoSave(modelId: string): void`
    - Implementation:
      - useSaveModel-Mutation init
      - useEffect für Auto-Save-Interval:
        - intervalId = setInterval(() => { const wire = useModelStore.getState().wire; const dirty = useModelStore.getState().dirty; const lockToken = useLockStore.getState().token; const lockStatus = useLockStore.getState().status; if (dirty && lockStatus === "own" && lockToken && wire) { saveMutation.mutate({wire, lockToken}, {onSuccess: () => { useModelStore.getState().resetDirty(); clearSnapshots(modelId); toast.success("Auto-gespeichert"); }, onError: (err) => toast.error(apiErrorMessage(err, "Auto-Save fehlgeschlagen"))}); } }, 30000)
        - return () => clearInterval(intervalId)
      - useEffect für IndexedDB-Snapshots **MIT debounce — Pflicht** (ohne debounce drohen bei großen Modellen wie Bosch2_wechseln.otx (18 MB) und 50 schnellen Edits/min IndexedDB-Quota-Errors und Browser-Lag):
        - Eigene 6-Zeilen-Debounce-Hilfe `function debounce<F extends (...args: any[]) => void>(fn: F, ms: number) { let t: ReturnType<typeof setTimeout> | null = null; const wrapped = (...args: Parameters<F>) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; wrapped.cancel = () => { if (t) clearTimeout(t); }; return wrapped; }`
        - `const debouncedSave = useMemo(() => debounce((wire: ModelTreeWire) => saveSnapshot(modelId, wire), 1000), [modelId])`
        - Subscribe: `const unsub = useModelStore.subscribe(s => s.wire, (newWire) => { if (newWire) debouncedSave(newWire); }, {fireImmediately: false})`
        - Cleanup: `return () => { unsub(); debouncedSave.cancel(); }` — wichtig, damit ein anstehender Save beim Unmount nicht mehr feuert.

    Erstelle `portal/src/hooks/useLockHeartbeat.ts`:
    - Hook: `export function useLockHeartbeat(modelId: string): void`
    - useEffect: acquire(modelId) on mount. setInterval(heartbeat, 30000). beforeunload: releaseLockSync. On unmount: clearInterval + release (async).
    - Window-Visibility-Handler: optional pause-and-resume on tab-blur/focus.

    Erstelle `portal/src/hooks/useSnapshotRestore.ts`:
    - Hook: `export function useSnapshotRestore(modelId: string, serverWire: ModelTreeWire | undefined): { dialogVisible: boolean; restore: () => void; discard: () => void }`
    - useEffect on modelId change: loadLatestSnapshot(modelId). Wenn vorhanden + serverWire vorhanden → setDialogVisible(true) UND speichere snapshot in useRef für restore/discard.
    - restore: useModelStore.loadFromWire(modelId, snapshot); setDialogVisible(false).
    - discard: clearSnapshots(modelId); useModelStore.loadFromWire(modelId, serverWire); setDialogVisible(false).

    Erstelle `portal/src/hooks/__tests__/useAutoSave.spec.ts`:
    - vi.useFakeTimers() + vi.mock useModelStore + vi.mock useLockStore + vi.mock @/api/models.
    - 2 Tests aus dem `<behavior>`-Block.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- useAutoSave 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    3 Hooks existieren. 2 Tests grün für useAutoSave. Beacon-Release on beforeunload. Snapshot-Restore-Dialog-Logic.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: WorkspaceStatusBar + ViewerHintSwitcher</name>
  <files>portal/src/components/WorkspaceStatusBar.tsx, portal/src/components/ViewerHintSwitcher.tsx</files>
  <read_first>
    - portal/src/stores/model-store.ts (Plan 07 — dirty, temporal für Undo)
    - portal/src/stores/lock-store.ts (Task 2 — status)
    - portal/src/components/ui/button.tsx + select.tsx (Plan 03 + 06)
    - portal/src/api/models.ts (Plan 07 — useSaveModel)
    - lucide-react icons (Save, Undo2, Redo2, Lock, AlertTriangle)
  </read_first>
  <behavior>
    - `WorkspaceStatusBar` rendert Footer-Bar:
      - Links: dirty-Indicator (●/✓), letzte Save-Zeit ("vor 2 min"), Lock-Status (Icon + Tooltip).
      - Mitte: Coverage-Hint (z.B. "Coverage 100 %" oder "5 unsupported Klassen — siehe Doku").
      - Rechts: Undo/Redo-Buttons (disabled wenn keine history), Manueller Save-Button (disabled wenn !dirty || lock-status !== "own").
    - `ViewerHintSwitcher` rendert oben im Viewer-Pane einen Toggle (z.B. shadcn-ToggleGroup oder Tabs) zwischen den verfügbaren Hints (basierend auf aktueller selection-klass und schema.viewer_hints).
  </behavior>
  <action>
    Erstelle `portal/src/components/WorkspaceStatusBar.tsx`:
    - Props: `{ modelId: string; }`
    - State subscriptions: useModelStore (dirty, wire), useLockStore (status, ownerEmail, expiresAt), useSaveModel(modelId).
    - Undo/Redo: `const {undo, redo, pastStates, futureStates} = useModelStore.temporal()` (zundo-API).
    - Last-Save-Time-Tracking: useState mit lastSavedAt; update bei useSaveModel.onSuccess.
    - Render Footer-Bar layout (`<footer className="border-t flex items-center justify-between px-4 py-2 text-sm">`):
      - Links: `<div className="flex items-center gap-3">{dirty ? <span className="text-orange-600">● Ungespeichert</span> : <span className="text-muted-foreground">✓ Gespeichert{lastSavedAt && ` ${formatTimeAgo(lastSavedAt)}`}</span>}{status === "foreign" && <span className="text-red-600 flex items-center gap-1"><Lock className="h-3 w-3" />Gesperrt von {ownerEmail}</span>}{status === "expired" && <span className="text-red-600">Lock abgelaufen — neu laden</span>}</div>`
      - Mitte: `<div className="text-muted-foreground">{wire ? `${Object.keys(wire.objects).length} Objekte` : ""}</div>`
      - Rechts: `<div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={undo} disabled={!pastStates.length}><Undo2 className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={redo} disabled={!futureStates.length}><Redo2 className="h-4 w-4" /></Button><Button size="sm" variant="default" onClick={onManualSave} disabled={!dirty || status !== "own"}><Save className="h-4 w-4 mr-1" />Speichern</Button></div>`
    - Helper `formatTimeAgo(date)`: kompakt deutsch ("vor 5 s", "vor 2 min", ...).
    - onManualSave: triggert useSaveModel.mutate, gleicher Pfad wie useAutoSave.

    Erstelle `portal/src/components/ViewerHintSwitcher.tsx`:
    - Props: `{ availableHints: string[]; currentHint: string | null; onHintChange: (hint: string | null) => void; }`
    - Wenn availableHints.length <= 1: render null (kein Switcher nötig).
    - Render: kleine ToggleGroup oder Tabs am oberen Rand des Viewer-Panes:
      - Label "Ansicht:" + Buttons für jeden hint ({hint === "std" ? "Standard" : hint === "design" ? "Design" : hint === "matrix" ? "Matrix" : hint})
      - active-Variant wenn currentHint === hint.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    WorkspaceStatusBar.tsx + ViewerHintSwitcher.tsx existieren. Statusbar zeigt dirty/lock/save-time. ViewerHintSwitcher rendert basierend auf availableHints.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Workspace-Page-Integration (Hooks + Statusbar + Switcher + Read-Only-Disabled-Wiring)</name>
  <files>portal/src/routes/_authenticated/models/$id.tsx, portal/src/sidebar/ModelTree.tsx</files>
  <read_first>
    - portal/src/routes/_authenticated/models/$id.tsx (Plan 07 — Workspace-Page)
    - portal/src/sidebar/ModelTree.tsx (Plan 07)
    - portal/src/hooks/useAutoSave.ts + useLockHeartbeat.ts + useSnapshotRestore.ts (Task 3)
    - portal/src/components/WorkspaceStatusBar.tsx + ViewerHintSwitcher.tsx (Task 4)
    - portal/src/stores/lock-store.ts (Task 2)
    - portal/src/api/schemas.ts (Plan 07 — useSchemaFor for available-hints)
  </read_first>
  <behavior>
    - Workspace-Layout: `grid-rows-[1fr_auto]` mit Workspace-Body (Sidebar + Viewer) im oberen Bereich + StatusBar als bottom-row.
    - Hooks: useLockHeartbeat(id), useAutoSave(id), useSnapshotRestore(id, data?.wire).
    - Wenn snapshot-restore-Dialog visible: render Modal.
    - ViewerHintSwitcher oben im Viewer-Pane: liest current selection-klass → schemas → availableHints; bei Wechsel → useViewerStore.setViewerHint.
    - Wenn lockStore.status !== "own" → disabled-Prop wird an ViewerFrame durchgereicht (alle OCtrls = readonly).
    - ModelTree: zusätzlich Click auf Gruppen-Knoten "Belegungsressourcen" setzt viewerHint="matrix" über useViewerStore.setViewerHint + selectObject(null) (kein einzelnes Object, nur die Matrix-Sicht).
  </behavior>
  <action>
    Erweitere `portal/src/routes/_authenticated/models/$id.tsx`:
    - Imports der 3 Hooks + WorkspaceStatusBar + ViewerHintSwitcher.
    - Aufruf am Anfang der Component:
      - `useLockHeartbeat(id)`
      - `useAutoSave(id)`
      - `const {dialogVisible, restore, discard} = useSnapshotRestore(id, data?.wire)`
    - Lock-Status lesen: `const lockStatus = useLockStore(s => s.status)`
    - Disabled-Prop: `const disabled = lockStatus !== "own"`
    - Available-hints: `const currentObj = data?.wire?.objects[selection ?? 0]; const schema = useSchemaFor(currentObj?.klass ?? null); const availableHints = schema?.viewer_hints ?? []`
    - Layout:
      ```jsx
      <div className="grid grid-rows-[1fr_auto] h-[calc(100vh-56px)]">
        <div className="grid grid-cols-[300px_1fr] overflow-hidden">
          <ModelTree wire={data.wire} selection={selection} onSelect={onSelectionChange} onGroupSelect={(klassGroup) => { useViewerStore.getState().setViewerHint("matrix"); useModelStore.getState().selectObject(klassGroup === "PRessBeleg" ? findFirstByKlass(data.wire, "PRessBeleg")?.oid ?? null : ...); }} />
          <div className="flex flex-col overflow-hidden">
            {availableHints.length > 1 && <div className="border-b px-4 py-2"><ViewerHintSwitcher availableHints={availableHints} currentHint={viewerHint} onHintChange={(h) => useViewerStore.getState().setViewerHint(h)} /></div>}
            <div className="flex-1 overflow-auto"><ViewerFrame selection={selection} objects={data.wire.objects} getSchemaFor={getSchemaFor} onSelectionChange={onSelectionChange} onPatch={onPatch} onCommand={onCommand} viewerHint={viewerHint} disabled={disabled} /></div>
          </div>
        </div>
        <WorkspaceStatusBar modelId={id} />
      </div>
      {dialogVisible && <Dialog open><DialogContent><DialogTitle>Ungespeicherte Änderungen gefunden</DialogTitle><DialogDescription>Es existieren lokale Änderungen, die nicht zum Server gesendet wurden.</DialogDescription><DialogFooter><Button variant="outline" onClick={discard}>Verwerfen</Button><Button onClick={restore}>Wiederherstellen</Button></DialogFooter></DialogContent></Dialog>}
      ```

    Erweitere `portal/src/sidebar/ModelTree.tsx`:
    - Erweiterte Props um `onGroupSelect?: (klassGroup: string) => void`.
    - Im Tree-onSelect-Handler: wenn node.data.oid === undefined (synthetic group node) → onGroupSelect(node.data.groupKey ?? node.data.label).
    - tree-builder.ts erweitern: groupNode setzt zusätzlich `groupKey` (z.B. "PRessBeleg" für die Belegungsressourcen-Gruppe).

    Disabled-Wiring durch ViewerFrame: ViewerFrame muss disabled-Prop an die resolved Viewer durchreichen (in Plan 06 ist disabled in ViewerProps; in setup.ts ist sicherzustellen dass jeder Viewer disabled an PGObjBaseViewer durchreicht).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5 &amp;&amp; cd portal &amp;&amp; npm run test:run 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    Workspace-Page integriert alle 3 Hooks + StatusBar + ViewerHintSwitcher + Snapshot-Restore-Dialog. Sidebar-Group-Click setzt viewerHint. Disabled-Prop ist verdrahtet bei foreign-Lock.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| IndexedDB-Snapshot ↔ Browser-Origin | Per-Origin isoliert; kein Cross-Tenant-Leak innerhalb Browser |
| Auto-Save Interval ↔ Server | Server-Authority (Lock-Token + Pydantic-Validation in PUT) |
| beforeunload-Beacon | Best-Effort; Server hat TTL+Cleanup als Backup |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-01 | Information Disclosure | IndexedDB-Snapshots persistieren beim Logout | mitigate | clearSnapshots(modelId) on successful save; Phase 2: clearAll() bei signOut |
| T-11-02 | Tampering | User manipuliert IndexedDB direkt mit DevTools | accept | Greift nur lokal; Server validiert beim Save |
| T-11-03 | DoS | 30s-Interval triggert auch bei 100ms-Edits → viele saves | mitigate | useSaveModel.mutate ist idempotent; pending-mutation wird nicht doppelt gefeuert (TanStack-Query batched) |
| T-11-04 | Repudiation | Auto-Save passiert silent; User merkt nichts | accept | toast.success("Auto-gespeichert"); StatusBar zeigt save-time |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run` zeigt alle Tests grün (+~10 neue aus Tasks 1+2+3)
- Manueller Smoke (Backend + Dummy.otx hochgeladen):
  - /models/{id} → Lock wird acquired (status="own") → StatusBar zeigt "Gesperrt durch Sie"
  - Edit Property → StatusBar zeigt "● Ungespeichert" → manueller Klick "Speichern" → "✓ Gespeichert vor 1 s"
  - 30s warten ohne Edit → kein Auto-Save (dirty=false)
  - Edit → 30s warten → toast "Auto-gespeichert"
  - F5 (Refresh) → Workspace lädt → Snapshot-Restore-Dialog wenn lokale Änderungen jünger als Server
  - Zweiter User loggt sich ein → opens gleiches Modell → status="foreign", read-only, alle OCtrls disabled
</verification>

<success_criteria>
SC-7 (Auto-Save 30s + manueller Button + IndexedDB-Snapshot + Single-Editor-Lock): VOLLSTÄNDIG erfüllt.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-11-SUMMARY.md` with:
- Save-Strategie-Diagramm (Auto + Manuell + IndexedDB-Snapshot + Lock-Heartbeat in einer Sequenz-Doku)
- Race-Schutz: Sequence-Counter im snapshot-service, optimistic-update verzichten in PUT (server is authoritative)
- Lock-State-Maschine (idle → own ↔ foreign / expired)
- Edge-Cases:
  - Tab-Close ohne Save → Beacon-Release + Server-TTL-Cleanup
  - Browser-Crash → IndexedDB-Snapshot wiederherstellbar
  - Lock-Expired während Edit → toast + read-only-Mode, User muss neu laden
- Was Plan 12 noch macht: End-to-End-Test mit Playwright über kompletten Modellierungs-Flow
</output>
</content>
</invoke>