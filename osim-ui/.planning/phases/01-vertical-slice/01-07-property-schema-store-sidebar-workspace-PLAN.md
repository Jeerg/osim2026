---
phase: 01-vertical-slice
plan: 07
type: execute
wave: 3
depends_on:
  - 01-04-storage-models-locks-api
  - 01-06-oviewer-core-octrl-family
files_modified:
  - app/static/schemas/v1/__init__.py
  - app/static/schemas/v1/schemas.json
  - app/api/v1/schemas.py
  - app/api/v1/router.py
  - portal/src/api/models.ts
  - portal/src/api/schemas.ts
  - portal/src/stores/model-store.ts
  - portal/src/stores/viewer-store.ts
  - portal/src/sidebar/tree-builder.ts
  - portal/src/sidebar/ModelTree.tsx
  - portal/src/routes/_authenticated/models/index.tsx
  - portal/src/routes/_authenticated/models/$id.tsx
  - portal/src/routes/_authenticated/index.tsx
  - portal/src/components/UploadOtxDialog.tsx
  - portal/src/stores/__tests__/model-store.spec.ts
  - portal/src/sidebar/__tests__/tree-builder.spec.ts
  - portal/package.json
autonomous: true
requirements:
  - SC-3
  - SC-6
priority: critical

must_haves:
  truths:
    - "Backend liefert `GET /api/v1/schemas/v1` mit hand-curated PropertySchema für die ~15 Klassen der 12 Phase-1-Viewer."
    - "Modell-Bibliothek-Route /models zeigt Liste der hochgeladenen Modelle + Upload-Button."
    - "Upload-Dialog akzeptiert .otx-Datei, ruft /upload-otx, leitet bei Success nach /models/{id} um."
    - "Workspace-Route /models/{id} lädt wire vom Backend, baut Sidebar-Tree (react-arborist), zeigt rechts den Viewer für die aktuelle Selection."
    - "ModelStore (Zustand+immer+zundo) hat patchObject/createObject/deleteObject; alle Mutationen setzen dirty=true; undo/redo funktioniert."
    - "ViewerStore hält selection (oid) + viewerHint (z.B. 'std'/'design'); Sidebar-Klick → selection-update → ViewerFrame re-rendert."
  artifacts:
    - path: "app/static/schemas/v1/schemas.json"
      provides: "Hand-curated PropertySchema-Liste (~15 Klassen × ~10-20 Properties = ~225 PropertyMetas)"
      contains: "PDurchlaufplan"
    - path: "app/api/v1/schemas.py"
      provides: "GET /api/v1/schemas/v1 + Cache-Header staleTime: Infinity"
      contains: "schemas/v1"
    - path: "portal/src/stores/model-store.ts"
      provides: "useModelStore mit loadFromWire/selectObject/patchObject/deleteObject/createObject + undo/redo via zundo"
      contains: "temporal"
    - path: "portal/src/sidebar/ModelTree.tsx"
      provides: "react-arborist-Wrapper für Modell-Hierarchie (Modell→Auslöser/Durchlaufpläne→Knoten→Ressourcen→...)"
      contains: "Tree"
    - path: "portal/src/routes/_authenticated/models/$id.tsx"
      provides: "Workspace-Page: Sidebar links + ViewerFrame rechts"
      contains: "ModelWorkspace"
  key_links:
    - from: "Workspace-Page"
      to: "useModelStore + useViewerStore + ViewerFrame + ModelTree"
      via: "loadFromWire auf mount (useQuery), tree-Click → setSelection, Viewer auto-rerender via Store-Subscription"
      pattern: "loadFromWire"
    - from: "ModelStore.patchObject"
      to: "ViewerFrame.onPatch"
      via: "OCtrl onChange → ViewerFrame.onPatch → store.patchObject(oid, patch); dirty=true triggert Save-Indicator in Plan 11"
      pattern: "patchObject"
    - from: "PropertySchema (Backend)"
      to: "useSchemas hook (Frontend) → ViewerFrame.getSchemaFor(klass)"
      via: "TanStack-Query mit staleTime: Infinity (Schema ändert sich nicht zur Laufzeit)"
      pattern: "schemas/v1"
---

<objective>
Verbindet die in Plan 06 gebaute Viewer-Foundation mit echten Daten (Modell-API aus Plan 04) und macht das Workspace navigierbar. Dies ist der Plan, in dem Phase 1 zum ersten Mal "läuft": User loggt sich ein, sieht Modell-Bibliothek, lädt ein OTX hoch, kommt in den Workspace, sieht Sidebar-Tree + (noch leeren) Viewer rechts. Konkrete Viewer-Komponenten (PSimulator etc.) registrieren sich erst in Plan 08+09 in der Registry — dieser Plan setzt nur einen Placeholder-PGObjBase-Stub als Fallback.

User-Entscheidung (vor Spawn beantwortet): PropertySchema wird in Phase 1 HAND-CURATED in osim-ui (~1 Personentag, ~15 Klassen × ~15 Properties = ~225 Property-Defs); Engine-Reflection kommt in Phase 3.

Purpose: SC-3 (OTX-Upload → JSON-Tree → Sidebar zeigt Hierarchie) wird vollständig realisiert. SC-6 (Edit-Operationen) bekommt die State-Infrastruktur (Store mit patch/create/delete + Undo).

Output: User kann von Login → /models → Upload → /models/{id} → Sidebar-Tree-Click → "Property-Editor wird in Plan 08 implementiert"-Placeholder. ModelStore-Tests grün. PropertySchema-Backend-Endpoint liefert JSON.
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
@.planning/phases/01-vertical-slice/01-06-oviewer-core-octrl-family-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 06 -->
```typescript
// portal/src/viewers/core/types.ts
export interface OBaseObj { oid: number; klass: string; attrs: Record<string, AttrValue>; sub_refs: number[][]; }
export interface ClassSchema { klass: string; label_de: string; properties: PropertyMeta[]; viewer_hints: string[]; }
export interface PropertyMeta { name; label_de; octrl_type; value_type?; enum_values?; link_target_klass?; list_item_klass?; readonly?; nullable?; description_de?; }

// portal/src/viewers/core/ViewerRegistry.ts
export const viewerRegistry: ViewerRegistry  // singleton

// portal/src/viewers/core/ViewerFrame.tsx
interface ViewerFrameProps { selection; objects; getSchemaFor; onSelectionChange; onPatch; onCommand; viewerHint?; }
```

<!-- Aus Plan 04 -->
```typescript
// Backend-Responses (zu mirroren)
interface UploadOtxResponse { model: ModelMeta; wire: ModelTreeWire }
interface GetModelResponse { model: ModelMeta; wire: ModelTreeWire }
interface ModelMeta { id: string; name: string; created_at: string; original_storage_key: string; current_version_key: string | null; created_by_uid: string }
interface ModelTreeWire { version: 1; simulator_oid: number; objects: Record<number, ModelObject>; coverage: ModelCoverage; schemas_url: string }
interface ModelObject { oid: number; klass: string; attrs: Record<string, AttrValue>; sub_refs: number[][] }
```

<!-- Aus Plan 03 -->
```typescript
import { apiFetch, ApiError } from "@/api/fetch"
import { apiErrorMessage } from "@/api/error-message"
import { useAuth } from "@/auth/use-auth"
import { Button, Input } from "@/components/ui/..."
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: PropertySchema hand-curated (~15 Klassen) + GET /api/v1/schemas/v1-Endpoint</name>
  <files>app/static/schemas/v1/__init__.py, app/static/schemas/v1/schemas.json, app/api/v1/schemas.py, app/api/v1/router.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-CONTEXT.md (D-08 Viewer-Liste — welche Klassen brauchen Schema)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Open Questions #2 (Hand-Curated-Entscheidung)
    - .planning/research/osim-engine-api.md (Engine-Klassen-Übersicht für Phase-1-Subset)
    - C:\Users\JörgWFischer\PycharmProjects\osim-engine\engine\src\osim_engine\pps (Engine-Klassen lesen für Attribut-Namen + Typen; ggf. via Grep auf class-Definitions)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc (für deutsche Labels und Property-Listen aus C++-Headern)
    - app/api/schemas/model.py (aus Plan 04 — wire-Format-Pendant)
  </read_first>
  <behavior>
    - `app/static/schemas/v1/schemas.json` enthält PropertySchema-Definitionen für mindestens 15 Klassen (alle 12 Phase-1-Viewer + ggf. interne Klassen wie PDpKnKonstant, PDpKnAlternativ).
    - Jede Klasse hat: klass, label_de, properties[], viewer_hints[].
    - Jede property hat: name (engine-attr-name), label_de, octrl_type, value_type | enum_values | link_target_klass | list_item_klass.
    - `GET /api/v1/schemas/v1` antwortet mit `{"schemas": [...]}` aus dem JSON-File.
    - Response hat `Cache-Control: public, max-age=86400` (Schema ist statisch; Frontend nutzt staleTime: Infinity).
  </behavior>
  <action>
    Erstelle `app/static/schemas/v1/__init__.py` (leer).

    Erstelle `app/static/schemas/v1/schemas.json` mit folgenden ~15 Klassen. Für jede ein vollständiges ClassSchema-Objekt mit deutschen Labels und korrekten Property-Bindings. Datenquelle: C++-Header in OSim2004/inc + Engine-Source in osim_engine/pps:

    Pflicht-Klassen (Liste mit ungefährer Property-Anzahl):
    - PSimulator (~5 props): m_sName, m_iSeed, m_dtStart, m_dtEnde, m_iPeriodenLaenge
    - PDurchlaufplan (~6 props): m_sName, m_iAuftragsmenge, m_iPriorität, m_sBemerkung, m_oid_auslöser (Link)
    - PDpKnKonstant (~5 props): m_sName, m_iDurchführungszeit, m_iRüstzeit, m_oid_betriebsmittel (Link), m_sBemerkung
    - PDpKnAlternativ (~5 props): m_sName, m_oids_alternativen (List), m_iAuswahlstrategie (Enum), m_sBemerkung
    - PDlplKante (~4 props): m_oid_von, m_oid_nach, m_iWartezeit, m_sBemerkung
    - PAslEinzel (~5 props): m_sName, m_dtErsterAuslöser, m_iAnzahl, m_iIntervall, m_oid_durchlaufplan (Link)
    - PRessBeleg (~5 props): m_sName, m_iKapazität, m_sEinheit, m_dKostensatz, m_sBemerkung
    - PRessMenge (~5 props): m_sName, m_iMenge, m_sEinheit, m_iNachschubMenge, m_iNachschubIntervall
    - PRessVerknüpfung (~4 props): m_oid_ressource (Link), m_iAnteil, m_sBemerkung, m_iPriorität (Enum)
    - PDlplBetriebsmittel (~3 props): m_oid_knoten (Link), m_oid_betriebsmittel (Link), m_iAnteil
    - PDlplPersonal (~3 props): m_oid_knoten (Link), m_oid_personal (Link), m_iAnteil
    - AEinsatzWunsch (~4 props): m_sName, m_dtBeginn, m_dtEnde, m_iAnteil
    - AKapBed (~4 props): m_oid_periode (Link), m_iSollKapazität, m_iIstKapazität, m_iAuslastung
    - AGruppe (~4 props): m_sName, m_oids_personal (List), m_iSchichtModell (Enum), m_sBemerkung

    viewer_hints pro Klasse:
    - PSimulator: ["std"]
    - PDurchlaufplan: ["std", "design"]  (zwei Viewer-Varianten, siehe SC-04)
    - PRessBeleg, PRessMenge: ["std", "matrix"]
    - alle anderen: ["std"]

    Format-Beispiel-Skeleton-Struktur (NICHT die ganze Datei hier — nur als Pattern; Executor füllt ~225 Property-Defs aus den Quellen):
    `{"schemas": [{"klass": "PSimulator", "label_de": "Simulator", "viewer_hints": ["std"], "properties": [{"name": "m_sName", "label_de": "Name", "octrl_type": "Variable", "value_type": "string"}, ...]}, ...]}`

    Wo C++-Header oder Engine-Code unklar ist (z.B. m_iAuswahlstrategie Enum-Werte): markiere mit `"description_de": "TODO: Enum-Werte aus Engine in Phase 3 via Reflection klären"` und setze provisorische enum_values aus dem C++-Header. WICHTIG: Lieber ehrlich-unvollständig als verfälschend-vollständig.

    Erstelle `app/api/v1/schemas.py`:
    - `from fastapi import APIRouter, Response` + `import json` + `from pathlib import Path`
    - Modul-Konstante: `_SCHEMAS_PATH = Path(__file__).parent.parent.parent / "static" / "schemas" / "v1" / "schemas.json"`
    - Modul-Konstante: `_SCHEMAS_CACHE = json.loads(_SCHEMAS_PATH.read_text(encoding="utf-8"))` (eager-load at import)
    - `router = APIRouter(tags=["schemas"])`
    - `@router.get("/schemas/v1")`:
      - return JSONResponse(content=_SCHEMAS_CACHE, headers={"Cache-Control": "public, max-age=86400"})

    Aktualisiere `app/api/v1/router.py`:
    - `from app.api.v1.schemas import router as schemas_router`
    - `api_router.include_router(schemas_router)` (kein extra prefix)
  </action>
  <verify>
    <automated>uv run python -c "import json; s = json.loads(open('app/static/schemas/v1/schemas.json', encoding='utf-8').read()); print('classes:', len(s['schemas'])); print('first:', s['schemas'][0]['klass'])" &amp;&amp; uv run python -c "from app.main import app; from fastapi.testclient import TestClient; c = TestClient(app); r = c.get('/api/v1/schemas/v1'); print('status:', r.status_code, 'classes:', len(r.json().get('schemas', [])))"</automated>
  </verify>
  <done>
    schemas.json hat ≥15 Klassen mit total ≥150 Property-Defs (Untergrenze für Phase-1-Subset; vollständige Detail-Coverage kommt mit Phase 3 Engine-Reflection). GET /api/v1/schemas/v1 returnt 200 mit der Liste. Cache-Header gesetzt.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Frontend-API-Bindings für models + schemas (Type-Mirrors + TanStack-Query-Hooks)</name>
  <files>portal/src/api/models.ts, portal/src/api/schemas.ts, portal/package.json</files>
  <read_first>
    - portal/src/api/fetch.ts (aus Plan 03 — apiFetch + ApiError)
    - app/api/schemas/model.py (aus Plan 04 — Backend-Pendants)
    - app/api/schemas/lock.py (aus Plan 04)
    - portal/src/viewers/core/types.ts (aus Plan 06 — OBaseObj, ClassSchema, PropertyMeta — Wire-Types mirroren)
    - portal/package.json (aktueller Stand)
  </read_first>
  <behavior>
    - `import { useModels, useModel, useUploadOtx, useSaveModel, useDeleteModel } from "@/api/models"` liefert TanStack-Query-Hooks.
    - `useModels()` → `UseQueryResult<ModelMeta[]>` mit queryKey `["models"]`.
    - `useModel(modelId)` → `UseQueryResult<GetModelResponse>` mit queryKey `["model", modelId]`.
    - `useUploadOtx()` → `UseMutationResult<UploadOtxResponse, ApiError, {file: File, name: string}>`.
    - `useSaveModel(modelId)` → `UseMutationResult<SaveModelResponse, ApiError, {wire: ModelTreeWire, lockToken: string}>`. Invalidates queryKey `["model", modelId]` und `["models"]`.
    - `useDeleteModel()` → `UseMutationResult<void, ApiError, string>`.
    - `useSchemas()` → `UseQueryResult<ClassSchema[]>` mit staleTime: Infinity, queryKey `["schemas-v1"]`.
    - Helper `useSchemaFor(klass)` extrahiert ClassSchema aus useSchemas-Result.
  </behavior>
  <action>
    Erweitere `portal/package.json` dependencies um `vite-tsconfig-paths@^5` (wenn Test-Configs path-Alias brauchen — optional).

    Erstelle `portal/src/api/models.ts`:
    - Imports: `useQuery`, `useMutation`, `useQueryClient` aus @tanstack/react-query; apiFetch + ApiError; toast aus sonner; apiErrorMessage; types aus @/viewers/core/types.
    - Type-Mirrors (1:1 zu Backend-Pydantic — TypeScript-Side):
      - `export interface ModelMeta { id: string; name: string; created_at: string; original_storage_key: string; current_version_key: string | null; created_by_uid: string; }`
      - `export interface ModelCoverage { loaded: number; skipped: number; unsupported: string[]; }`
      - `export interface ModelTreeWire { version: 1; simulator_oid: number; objects: Record<number, OBaseObj>; coverage: ModelCoverage; schemas_url: string; }`
      - `export interface UploadOtxResponse { model: ModelMeta; wire: ModelTreeWire; }`
      - `export interface GetModelResponse { model: ModelMeta; wire: ModelTreeWire; }`
      - `export interface SaveModelResponse { model: ModelMeta; saved_version_key: string; }`
    - Hooks:
      - `useModels()`: useQuery({queryKey:["models"], queryFn: () => apiFetch<ModelMeta[]>("/api/v1/models")})
      - `useModel(modelId: string | null)`: useQuery({queryKey:["model", modelId], queryFn: () => apiFetch<GetModelResponse>(`/api/v1/models/${modelId}`), enabled: !!modelId})
      - `useUploadOtx()`: useMutation mit mutationFn FormData-Upload (multipart/form-data; field "file" + field "name"); onSuccess invalidate ["models"]; onError toast.error.
      - `useSaveModel(modelId)`: useMutation mit body=JSON.stringify({wire, lock_token}); onSuccess invalidate ["model", modelId] + ["models"]; onError toast.error.
      - `useDeleteModel()`: useMutation DELETE; onSuccess invalidate ["models"]; onError toast.

    Erstelle `portal/src/api/schemas.ts`:
    - Import `ClassSchema` aus @/viewers/core/types
    - `interface SchemasResponse { schemas: ClassSchema[] }`
    - `export function useSchemas(): UseQueryResult<SchemasResponse>`: useQuery({queryKey:["schemas-v1"], queryFn: () => apiFetch<SchemasResponse>("/api/v1/schemas/v1"), staleTime: Infinity})
    - `export function useSchemaFor(klass: string | null): ClassSchema | null`: lookup helper, returns null wenn klass null oder nicht gefunden.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    portal/src/api/models.ts exportiert 5 Hooks + 6 Type-Mirrors. portal/src/api/schemas.ts exportiert useSchemas + useSchemaFor. tsc -b grün.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: ModelStore mit Zustand + immer + zundo + Tests</name>
  <files>portal/src/stores/model-store.ts, portal/src/stores/viewer-store.ts, portal/src/stores/__tests__/model-store.spec.ts, portal/package.json</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 4 (Z.1120-1185 — Skelett)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/stores/model-store.ts`)
    - portal/src/viewers/core/types.ts (aus Plan 06 — OBaseObj, AttrValue)
    - portal/src/api/models.ts (aus Task 2 — ModelTreeWire-Type)
    - portal/package.json (aktueller Stand — zundo + immer noch nicht installiert)
  </read_first>
  <behavior>
    - `npm install` läuft erfolgreich nach Hinzufügen von `zundo`, `immer`, `dexie` (dexie für Plan 11 vor-installiert).
    - `useModelStore` hat State: `{wire: ModelTreeWire | null, selection: number | null, dirty: boolean, modelId: string | null}`.
    - Actions: `loadFromWire(modelId, wire)`, `selectObject(oid)`, `patchObject(oid, patch)`, `createObject(klass, attrs) -> number`, `deleteObject(oid)`, `resetDirty()`, `clear()`.
    - patchObject + createObject + deleteObject setzen dirty=true.
    - loadFromWire setzt dirty=false.
    - Undo/Redo via zundo-middleware: `useModelStore.temporal.getState().undo() / .redo()`. partialize: nur wire in History; selection ist UI-state.
    - 7 Tests in model-store.spec.ts:
      - test_load_sets_wire_and_clears_dirty
      - test_select_object_updates_selection
      - test_patch_object_modifies_attrs_and_sets_dirty
      - test_create_object_appends_to_objects_and_returns_oid
      - test_delete_object_removes_and_cleans_subrefs
      - test_undo_reverts_last_patch
      - test_clear_resets_all_state
  </behavior>
  <action>
    Erweitere `portal/package.json` deps:
    - `zundo@^2.3`
    - `immer@^10`
    - `dexie@^4.4` (vor-installiert für Plan 11)
    - `dexie-react-hooks@^1.1` (optional; nice-to-have)

    Erstelle `portal/src/stores/model-store.ts` (RESEARCH §Example 4 als Skelett + extensions):
    - Imports: `create` aus zustand, `temporal` aus zundo, `immer` aus zustand/middleware/immer, types aus @/api/models und @/viewers/core/types.
    - State-Interface `ModelState`:
      - `wire: ModelTreeWire | null`
      - `modelId: string | null`
      - `selection: number | null`
      - `dirty: boolean`
    - Action-Interface `ModelActions`:
      - `loadFromWire(modelId: string, wire: ModelTreeWire): void`
      - `selectObject(oid: number | null): void`
      - `patchObject(oid: number, patch: Record<string, AttrValue>): void`
      - `createObject(klass: string, attrs: Record<string, AttrValue>): number`
      - `deleteObject(oid: number): void`
      - `resetDirty(): void`
      - `clear(): void`
    - `export const useModelStore = create<ModelState & ModelActions>()(temporal(immer((set, get) => ({...}))), {limit: 100, partialize: (s) => ({wire: s.wire}), equality: (a, b) => JSON.stringify(a.wire) === JSON.stringify(b.wire)}))`
    - createObject-Implementation (RESEARCH-Skelett Z.1162-1170):
      - newOid = max(Object.keys(wire.objects).map(Number)) + 1
      - wire.objects[newOid] = {oid: newOid, klass, attrs, sub_refs: []}
      - dirty = true; return newOid (siehe RESEARCH — set() returnt nichts, also Closure-Variable für return)
    - deleteObject-Implementation: delete wire.objects[oid]; clean sub_refs in allen anderen objects (filter oid raus).

    Erstelle `portal/src/stores/viewer-store.ts`:
    - Simpler Zustand-Store (KEIN zundo, KEIN immer nötig)
    - State: `{selection: number | null, viewerHint: string | null}`
    - Actions: `setSelection(oid)`, `setViewerHint(hint)`
    - HINWEIS: selection ist DOPPELT — in ModelStore (für Undo-Awareness sollte sie partialized-out sein) + in ViewerStore (für reines UI). Hier Entscheidung: ModelStore.selection ist die KANONISCHE Quelle für "welches Object ist im Editor". ViewerStore hat nur viewerHint (welche Variante: std vs. design). selectObject in ModelStore ist also nicht im undo-Stack (partialize entfernt selection automatisch via JSON.stringify-Equality auf wire).
    - Korrektur: model-store.selection BLEIBT, aber partialize: state => ({wire: state.wire}) — selection ist UI-only, kommt nicht in History.

    Erstelle `portal/src/stores/__tests__/model-store.spec.ts`:
    - Setup-Helper: `beforeEach(() => useModelStore.getState().clear())`
    - 7 Tests aus dem `<behavior>`-Block.
    - Wichtig: `useModelStore.temporal.getState().clear()` zwischen Tests, um Undo-History zu reseten.
    - test_undo_reverts_last_patch: load wire → patch attr → expect attr neu; undo → expect attr zurück auf alt.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npm run test:run -- stores 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    package.json hat zundo+immer+dexie. model-store.ts + viewer-store.ts existieren. 7 Tests grün. Undo/Redo funktioniert via zundo. patchObject/createObject/deleteObject setzen dirty.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Sidebar-Tree (tree-builder + ModelTree mit react-arborist) + Tests</name>
  <files>portal/src/sidebar/tree-builder.ts, portal/src/sidebar/ModelTree.tsx, portal/src/sidebar/__tests__/tree-builder.spec.ts, portal/package.json</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 4 (Tree-Builder Z.692-724) + §Standard Stack react-arborist 3.6.1
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/sidebar/ModelTree.tsx`)
    - portal/src/api/models.ts (aus Task 2 — ModelTreeWire)
    - portal/src/viewers/core/types.ts (aus Plan 06 — OBaseObj)
    - portal/src/stores/model-store.ts + viewer-store.ts (aus Task 3)
    - react-arborist-Docs (npm view react-arborist; oder Repo-Readme)
  </read_first>
  <behavior>
    - `npm install` läuft erfolgreich nach Hinzufügen von `react-arborist@^3.6.1`.
    - `buildTree(wire) -> TreeNode[]` erzeugt verschachtelte TreeNode-Liste mit Gruppierungen: Modell → Auslöser/Durchlaufpläne (jeder Plan hat Sub: Knoten, Kanten) / Ressourcen (Belegungs/Mengen/Verknüpfung) / Personalgruppen / Einsatzwünsche.
    - `<ModelTree wire={wire} selection={selection} onSelect={...} />` rendert react-arborist `<Tree>` mit Custom-Row (Icon + Label) und navigierbarem Tree.
    - Click auf einen Knoten ruft onSelect(oid) → setzt selection in stores.
    - 5 Tests in tree-builder.spec.ts:
      - test_root_is_simulator_with_label_modell
      - test_durchlaufplaene_gruppiert
      - test_knoten_unter_durchlaufplan
      - test_ressourcen_gruppen_existieren
      - test_empty_wire_returns_single_root
  </behavior>
  <action>
    Erweitere `portal/package.json` dependencies: `react-arborist@^3.6.1`.

    Erstelle `portal/src/sidebar/tree-builder.ts`:
    - Typen: `interface TreeNode { id: string; oid?: number; klass?: string; label: string; icon?: string; children?: TreeNode[]; }`
    - Helper `findByKlass(wire, klass): OBaseObj[]`: filter wire.objects values
    - Helper `groupNode(label, objs, wire, subBuilder?)`: erzeugt einen "synthetic" group-Node (oid=null) mit objs als children
    - `export function buildTree(wire: ModelTreeWire): TreeNode[]`:
      - sim = wire.objects[wire.simulator_oid]
      - return [{id: `oid:${sim.oid}`, oid: sim.oid, klass: sim.klass, label: sim.attrs.m_sName as string ?? "Modell", children: [
          groupNode("Auslöser", findByKlass(wire, "PAslEinzel"), wire),
          groupNode("Durchlaufpläne", findByKlass(wire, "PDurchlaufplan"), wire, (plan) => [
            groupNode("Knoten", findKnotenForPlan(wire, plan), wire),
            groupNode("Kanten", findKantenForPlan(wire, plan), wire),
          ]),
          groupNode("Belegungsressourcen", findByKlass(wire, "PRessBeleg"), wire),
          groupNode("Mengenressourcen", findByKlass(wire, "PRessMenge"), wire),
          groupNode("Personalgruppen", findByKlass(wire, "AGruppe"), wire),
          groupNode("Einsatzwünsche", findByKlass(wire, "AEinsatzWunsch"), wire),
        ]}]
    - Helper findKnotenForPlan + findKantenForPlan: nutzen sub_refs vom Plan-Object zu Knoten (PDpKn*) und Kanten (PDlplKante). Konvention: Plan.sub_refs[0] sind Knoten-Oids, sub_refs[1] sind Kanten-Oids — wenn engine-spezifisch anders, im Code mit `// TODO: sub_refs-Layout aus Engine via Plan 04 SUMMARY verifizieren` markieren.

    Erstelle `portal/src/sidebar/ModelTree.tsx`:
    - Import: `import { Tree, NodeApi } from "react-arborist"`
    - Props: `{ wire: ModelTreeWire; selection: number | null; onSelect: (oid: number | null) => void }`
    - Memoize tree via useMemo([wire]) → buildTree(wire)
    - Render Container mit fixer height (Container muss Höhe haben, sonst rendert arborist nichts): `<div className="h-full overflow-auto"><Tree data={tree} openByDefault={true} width="100%" height={containerHeight} indent={20} rowHeight={28} onSelect={(nodes) => { const n = nodes[0]; if (n && n.data.oid != null) onSelect(n.data.oid); }} selection={selection ? `oid:${selection}` : undefined}>{({node, style, dragHandle}) => <div style={style} ref={dragHandle} className="cursor-pointer hover:bg-accent px-2 py-1 text-sm flex items-center gap-2"><span className="text-muted-foreground">{node.isLeaf ? "•" : node.isOpen ? "▾" : "▸"}</span>{node.data.label}</div>}</Tree></div>`
    - height: use useMeasure-Pattern oder `style={{height: 'calc(100vh - 80px)'}}` (Phase 1 quick fix).
    - Hinweis im Code: "Drag-and-Drop disabled in Phase 1 (kein onMove). Inline-Rename disabled (kein onRename)."

    Erstelle `portal/src/sidebar/__tests__/tree-builder.spec.ts`:
    - 5 Tests aus dem `<behavior>`-Block.
    - Test-Wire-Fixture: Minimal-Wire mit Sim (oid=0), 2 Pläne, 3 Knoten, 1 Auslöser, 1 PRessBeleg.
    - test_root_is_simulator: tree[0].oid === 0
    - test_durchlaufplaene_gruppiert: tree[0].children.find(c => c.label === "Durchlaufpläne").children.length === 2
    - usw.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npm run test:run -- sidebar 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    package.json hat react-arborist. tree-builder.ts + ModelTree.tsx existieren. 5 Tests grün. Tree zeigt 6 Top-Level-Gruppen unter Modell-Root.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Routes /models (Library + Upload) + /models/$id (Workspace) + Stub-Fallback-Viewer</name>
  <files>portal/src/routes/_authenticated/index.tsx, portal/src/routes/_authenticated/models/index.tsx, portal/src/routes/_authenticated/models/$id.tsx, portal/src/components/UploadOtxDialog.tsx</files>
  <read_first>
    - portal/src/routes/_authenticated.tsx (aus Plan 03 — Layout-Wrap)
    - portal/src/components/AuthenticatedLayout.tsx (aus Plan 03)
    - portal/src/api/models.ts + portal/src/api/schemas.ts (aus Task 2)
    - portal/src/stores/model-store.ts + viewer-store.ts (aus Task 3)
    - portal/src/sidebar/ModelTree.tsx (aus Task 4)
    - portal/src/viewers/core/ViewerFrame.tsx + ViewerRegistry.ts (aus Plan 06)
    - portal/src/components/ui/dialog.tsx + button.tsx + input.tsx (aus Plan 03 + Plan 06)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 6 (Z.1271-1285 Workspace-Skelett)
  </read_first>
  <behavior>
    - `/` (Dashboard) zeigt Welcome-Text + Link "Modell-Bibliothek" → /models.
    - `/models` zeigt: Header mit "Modell-Bibliothek" + Upload-Button. Liste aller Models (Card-Grid) mit name, created_at, "Öffnen"-Button → navigate /models/{id}. "Löschen"-Button mit Confirm-Dialog.
    - Upload-Dialog: File-Input (akzeptiert .otx), Name-Input (default: filename ohne Extension), "Hochladen"-Button. Bei Erfolg → toast.success("Modell hochgeladen") + navigate /models/{id}.
    - `/models/{id}` (Workspace): `grid grid-cols-[300px_1fr] h-full`:
      - Links: `<ModelTree>` aus dem geladenen wire.
      - Rechts: `<ViewerFrame>` mit selection/objects/getSchemaFor aus Stores+Hooks.
    - Bei Workspace-Mount: useModel(id) lädt wire → useModelStore.loadFromWire. useSchemas() lädt Schemas (TanStack-cached).
    - Bei Sidebar-Click → setSelection im model-store → ViewerFrame re-rendert.
    - Stub-Fallback: PGObjBaseViewer wird hier als minimal-Component registriert: rendert für jeden obj ein einfaches `<div>{klass} ({oid}) - {keys(attrs).length} Properties</div>` mit "Property-Editor kommt in Plan 08"-Hinweis. ENTFERNT NACH PLAN 08, wo der echte PGObjBaseViewer landet.
  </behavior>
  <action>
    Überschreibe `portal/src/routes/_authenticated/index.tsx` (aus Plan 03 war Placeholder):
    - import Link aus tanstack-router
    - Component Dashboard: simple page mit `<h2>Willkommen</h2><p>Modelle hochladen und im Browser editieren.</p><Link to="/models">Zur Modell-Bibliothek →</Link>`

    Erstelle `portal/src/components/UploadOtxDialog.tsx`:
    - Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`
    - Local state: file: File | null, name: string
    - useUploadOtx-Hook (aus Task 2)
    - Render: Dialog mit Input (type="file" accept=".otx") + Input (text, name) + Footer mit Cancel/Hochladen-Buttons.
    - onUpload: if !file → toast.error; mutate({file, name: name || file.name.replace(/\.otx$/i, "")}) → onSuccess: toast.success, onOpenChange(false), navigate to /models/{data.model.id}.

    Erstelle `portal/src/routes/_authenticated/models/index.tsx`:
    - `createFileRoute("/_authenticated/models/")` + component ModelLibraryPage
    - useModels-Hook → data, isLoading, error
    - useState für UploadDialog open-State
    - Render: `<div className="p-6"><div className="flex items-center justify-between mb-6"><h2>Modell-Bibliothek</h2><Button onClick={() => setOpen(true)}>Modell hochladen</Button></div>` + grid mit Cards für jeden Model.
    - Card: name + created_at + 2 Buttons (Öffnen → navigate, Löschen → Confirm-Dialog → useDeleteModel.mutate(id)).
    - `<UploadOtxDialog open={open} onOpenChange={setOpen} />`

    Erstelle `portal/src/routes/_authenticated/models/$id.tsx` (RESEARCH §Example 6):
    - `createFileRoute("/_authenticated/models/$id")` + component ModelWorkspace
    - Route.useParams() → {id}
    - useModel(id) → data, isLoading
    - useSchemas() → schemas-data
    - useEffect: on data.wire ändern → useModelStore.getState().loadFromWire(id, data.wire) UND useModelStore.temporal.getState().clear() (reset undo-history per neu geladenem Modell)
    - selection = useModelStore(s => s.selection)
    - viewerHint = useViewerStore(s => s.viewerHint)
    - getSchemaFor = useCallback((klass) => useSchemaFor(klass), [schemas-data])
    - onPatch = (oid, patch) => useModelStore.getState().patchObject(oid, patch)
    - onSelectionChange = (oid) => useModelStore.getState().selectObject(oid)
    - onCommand: switch über command.type — navigate/create/delete/reset/open-sub-viewer → entsprechende Store-Actions
    - Render: `<div className="grid grid-cols-[300px_1fr] h-[calc(100vh-56px)]"><ModelTree wire={data.wire} selection={selection} onSelect={onSelectionChange} /><ViewerFrame selection={selection} objects={data.wire.objects} getSchemaFor={getSchemaFor} onSelectionChange={onSelectionChange} onPatch={onPatch} onCommand={onCommand} viewerHint={viewerHint} /></div>`
    - Loading-State: zeige Spinner während useModel.isLoading.
    - Error-State: zeige Error-Card mit apiErrorMessage.

    PGObjBaseStub-Registrierung — direkt in $id.tsx oder besser in einem Module-Top-Level-Setup-File `portal/src/viewers/setup.ts`:
    - `import { viewerRegistry } from "@/viewers/core/ViewerRegistry"`
    - Stub-Component: `function PGObjBaseStub({obj}: ViewerProps) { return <div className="p-6"><h3>{obj.klass} (oid={obj.oid})</h3><p>Property-Editor wird in Plan 08 implementiert. Properties: {Object.keys(obj.attrs).join(", ")}</p></div>; }`
    - `viewerRegistry.setFallback(PGObjBaseStub)` als Module-Top-Level (side-effect-Import in app.tsx).

    HINWEIS: routeTree.gen.ts wird automatisch regeneriert beim nächsten `npm run dev`.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10 &amp;&amp; cd portal &amp;&amp; timeout 8 npm run dev 2>&amp;1 | tail -5 || true</automated>
  </verify>
  <done>
    3 Route-Files + UploadOtxDialog + setup.ts existieren. routeTree.gen.ts wird regeneriert. tsc -b grün. PGObjBaseStub ist als Fallback registriert. Manueller Smoke: /models zeigt Library, /models/{id} zeigt Workspace mit Sidebar + Stub-Viewer.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| schemas.json ↔ Frontend | Backend liefert via cached endpoint; Frontend trusted weil Backend-Authoritative |
| ModelStore ↔ IndexedDB | In Plan 11; aktuell nur in-memory |
| /upload-otx Frontend → Backend | FormData multipart; Browser validiert nicht; Backend macht size-Check + MIME-Check (Plan 04) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01 | Tampering | Hand-curated schemas.json hat veraltete Property-Names | accept | Phase 3 ersetzt durch Engine-Reflection (E2.1-E2.6); Hand-Curated ist explicit Phase-1-Trade-Off |
| T-07-02 | Information Disclosure | useModel + useModels invalidiert Cache nicht beim Tenant-Wechsel | accept | Phase 1 hat keinen Tenant-Switcher; jeder User hat exakt 1 Tenant via Lazy-Bootstrap |
| T-07-03 | DoS | Bosch2_wechseln-Wire (18 MB) blockiert Browser-Render | mitigate | useMemo um buildTree (re-render-Schutz); large-wire-Warnung wenn objects > 5000 (Phase 4 mit Virtualization) |
| T-07-04 | Tampering | User uploadet eine 50 MB .otx-Datei | mitigate | Backend lehnt mit 413 ab (Plan 04 Task 4); Frontend zeigt apiErrorMessage |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run -- stores sidebar` grün (12 Tests aus Task 3+4)
- `cd portal && npm run lint` grün
- `curl /api/v1/schemas/v1` returnt JSON mit ≥15 Klassen
- Manueller Smoke (mit docker compose up + seed-firebase aus Plan 05):
  - Login → /models → "Modell hochladen" → Dummy.otx auswählen → submit
  - Redirect zu /models/{id} → Sidebar zeigt Modell + Auslöser + Durchlaufpläne + Ressourcen
  - Click auf einen Knoten in Sidebar → ViewerFrame zeigt "PXxx (oid=N) — Property-Editor wird in Plan 08 implementiert"
</verification>

<success_criteria>
SC-3 (OTX-Upload → JSON-Tree → Sidebar): VOLLSTÄNDIG erfüllt nach diesem Plan (mit Stub-Viewer rechts).
SC-6 (Edit-Operationen): State-Infrastruktur vollständig (Store mit patch/create/delete + Undo); konkrete Edit-UI in Plan 08+09.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-07-SUMMARY.md` with:
- Liste der ~15 Klassen + Property-Counts in schemas.json
- ModelStore-Action-Catalog (was setzt dirty, was nicht; was geht in Undo-History)
- Tree-Hierarchie-Diagramm (Modell → 6 Gruppen → Sub-Items)
- Workspace-Layout-Diagram (Sidebar links, ViewerFrame rechts, beide H-Scroll)
- PGObjBaseStub als Fallback ist temporär — Plan 08 ersetzt mit echtem PGObjBaseViewer
- Pflicht-Hinweis für Plan 08+09: Viewer registrieren sich via `viewerRegistry.register({...})` in setup.ts oder in jedem konkreten Viewer-File via side-effect-Import
</output>
</content>
</invoke>