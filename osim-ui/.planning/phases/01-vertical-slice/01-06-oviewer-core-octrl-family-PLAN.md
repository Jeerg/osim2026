---
phase: 01-vertical-slice
plan: 06
type: execute
wave: 3
depends_on:
  - 01-03-frontend-foundation
  - 01-04-storage-models-locks-api
files_modified:
  - portal/src/viewers/core/types.ts
  - portal/src/viewers/core/ViewerRegistry.ts
  - portal/src/viewers/core/ClientCtrl.ts
  - portal/src/viewers/core/ViewerFrame.tsx
  - portal/src/viewers/core/ChildDialog.tsx
  - portal/src/viewers/core/octrl/OCtrlVariable.tsx
  - portal/src/viewers/core/octrl/OCtrlBool.tsx
  - portal/src/viewers/core/octrl/OCtrlEnum.tsx
  - portal/src/viewers/core/octrl/OCtrlLink.tsx
  - portal/src/viewers/core/octrl/OCtrlList.tsx
  - portal/src/viewers/core/octrl/OCtrlMethod.tsx
  - portal/src/viewers/core/octrl/OCtrlTabViewer.tsx
  - portal/src/viewers/core/octrl/OCtrlColorRef.tsx
  - portal/src/viewers/core/octrl/OCtrlLogFont.tsx
  - portal/src/viewers/core/octrl/index.ts
  - portal/src/viewers/core/__tests__/ViewerRegistry.spec.ts
  - portal/src/viewers/core/__tests__/ClientCtrl.spec.ts
  - portal/src/viewers/core/octrl/__tests__/OCtrlVariable.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlBool.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlEnum.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlLink.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlList.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlMethod.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlTabViewer.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlColorRef.spec.tsx
  - portal/src/viewers/core/octrl/__tests__/OCtrlLogFont.spec.tsx
  - portal/src/components/ui/checkbox.tsx
  - portal/src/components/ui/select.tsx
  - portal/src/components/ui/tabs.tsx
  - portal/src/components/ui/combobox.tsx
  - portal/src/components/ui/table.tsx
  - portal/src/components/ui/dialog.tsx
  - portal/package.json
autonomous: true
requirements:
  - SC-5
priority: critical

must_haves:
  truths:
    - "Die 5-File-OViewer-Foundation existiert: types.ts, ViewerRegistry.ts, ClientCtrl.ts, ViewerFrame.tsx, ChildDialog.tsx."
    - "Alle 9 OCtrl-Components existieren als React-Components mit einheitlicher Props-Signatur (value, onChange, schema, disabled, data-octrl-id)."
    - "Jeder OCtrl ist mit mindestens einem Render-Test + einem Interaktions-Test abgesichert."
    - "ViewerRegistry resolve(klass, hint?) liefert Component-Type; Fallback auf PGObjBaseViewer wenn nicht registriert."
    - "OCtrlColorRef nutzt react-colorful (NICHT shadcn — hat keine native Color-Picker-Komponente)."
    - "OCtrlLogFont ist Eigenbau mit Select (Family) + Input (Size) + Toggles (Bold/Italic), nicht extern."
  artifacts:
    - path: "portal/src/viewers/core/types.ts"
      provides: "OBaseObj, ViewerProps<T>, ViewerCommand, PropertyMeta, ClassSchema, AttrValue, OCtrlBaseProps<T>"
      exports: ["OBaseObj", "ViewerProps", "PropertyMeta", "ClassSchema", "OCtrlBaseProps"]
    - path: "portal/src/viewers/core/ViewerRegistry.ts"
      provides: "ViewerRegistry-Klasse mit register/setFallback/resolve + viewerRegistry Singleton-Export"
      contains: "class ViewerRegistry"
    - path: "portal/src/viewers/core/ClientCtrl.ts"
      provides: "ClientCtrl-TS-Klasse für Routing-State (resolveViewer, setObject, setViewerHint)"
      contains: "class ClientCtrl"
    - path: "portal/src/viewers/core/ViewerFrame.tsx"
      provides: "React-Wrapper mit Toolbar + Resolver; rendert resolved Viewer für aktuelle selection"
      contains: "ViewerFrame"
    - path: "portal/src/viewers/core/octrl/index.ts"
      provides: "Barrel-Export aller 9 OCtrls + OCtrlBaseProps"
      exports: ["OCtrlVariable", "OCtrlBool", "OCtrlEnum", "OCtrlLink", "OCtrlList", "OCtrlMethod", "OCtrlTabViewer", "OCtrlColorRef", "OCtrlLogFont"]
  key_links:
    - from: "ViewerFrame.tsx"
      to: "ViewerRegistry.ts (via ClientCtrl)"
      via: "resolveViewer(obj) → Component → render mit props"
      pattern: "resolveViewer"
    - from: "Jedes OCtrl"
      to: "shadcn-Komponente (Input/Checkbox/Select/Combobox/Tabs/Table) ODER react-colorful (Color)"
      via: "wrap mit OCtrlBaseProps-Signatur + schema-driven Verhalten"
      pattern: "OCtrlBaseProps<"
---

<objective>
Foundation-Layer der OViewer-Schicht: 5 Core-Files (Typen, Registry, ClientCtrl als TS-Klasse, ViewerFrame + ChildDialog als React) plus 9 OCtrl-Components. KEIN konkreter Viewer in diesem Plan — die 12 PXyzViewer kommen in Plan 08 und 09. Dieser Plan baut nur das Framework, in das die Viewer sich einklinken.

Pattern-Quelle ist überwiegend NEU (kein direktes 3fls-Analog), siehe PATTERNS.md §"Frontend — OViewer-Foundation". RESEARCH.md §Pattern 1 und §Pattern 2 liefern komplette Code-Skeleton.

OCtrl-Mapping auf Libs:
- 7 OCtrls nutzen shadcn-Komponenten als Basis (Variable→Input, Bool→Checkbox, Enum→Select, Link→Combobox, List→Table, Method→Button, TabViewer→Tabs).
- OCtrlColorRef nutzt `react-colorful` (4 KB, MIT) — shadcn hat keinen Color-Picker.
- OCtrlLogFont ist Eigenbau (Select+Input+Toggles).

Purpose: SC-5 ("Vollständige 9-er OCtrl-Familie implementiert") wird hier abgehakt. Außerdem Foundation für SC-4 (12 konkrete Viewer) und SC-6 (Edit-Operationen).

Output: 5 Foundation-Files + 9 OCtrl-Files (+ 1 barrel-export) + 9 OCtrl-Tests + 2 Foundation-Tests + 6 shadcn-Components. Vitest läuft mit ~18 Tests grün. KEIN konkreter Viewer wird hier registriert — der Registry-Fallback ist initial undefined; Plan 07 setzt PGObjBaseViewer als Fallback.
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
@.planning/phases/01-vertical-slice/01-03-frontend-foundation-PLAN.md
@CLAUDE.md
@portal/src/lib/utils.ts
@portal/src/components/ui/button.tsx
@portal/src/components/ui/input.tsx
</context>

<interfaces>
<!-- Pflichtlektüre (RESEARCH-Vorgabe) — C++-Original als Konzept-Quelle für die TS-Port-Entscheidungen -->
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (Konzept-Grundlage; LIES NICHT 1:1, sondern für Routing-Konzept)
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrlVariable.h, OCtrlBool.h, OCtrlEnum.h, OCtrlLink.h, OCtrlList.h, OCtrlMethod.h, OCtrlTabViewer.h, OCtrlCOLORREF.h, OCtrlLOGFONT.h (für Props-Analyse — Welche Felder hat die C++-Variante, was muss der TS-Port unterstützen?)

<!-- Bereits in Plan 03 verfügbar -->
```typescript
// portal/src/lib/utils.ts
export function cn(...inputs: ClassValue[]): string

// portal/src/components/ui/button.tsx
export const Button: React.FC<ButtonProps>

// portal/src/components/ui/input.tsx
export const Input: React.FC<InputProps>

// portal/src/api/error-message.ts
export function apiErrorMessage(err: unknown, fallback?: string): string
```

<!-- Wire-Format aus Plan 04 (Pydantic-Schemas; TypeScript-Mirror lebt in portal/src/viewers/core/types.ts) -->
```python
# app/api/schemas/model.py
class ModelObject(BaseModel):
    oid: int
    klass: str
    attrs: dict[str, AttrValue]
    sub_refs: list[list[int]]
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: shadcn-Components für OCtrl-Family (Checkbox, Select, Tabs, Combobox, Table, Dialog) + react-colorful in package.json</name>
  <files>portal/src/components/ui/checkbox.tsx, portal/src/components/ui/select.tsx, portal/src/components/ui/tabs.tsx, portal/src/components/ui/combobox.tsx, portal/src/components/ui/table.tsx, portal/src/components/ui/dialog.tsx, portal/package.json</files>
  <read_first>
    - portal/package.json (aktueller Stand — Plan 03)
    - portal/src/components/ui/button.tsx (aus Plan 03 — Stil-Vorlage)
    - portal/src/lib/utils.ts (aus Plan 03 — cn-Helper)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 2 (OCtrl-Mapping-Tabelle)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/viewers/core/octrl/*` — Lib-Bindings)
  </read_first>
  <behavior>
    - `npm install` läuft erfolgreich nach Hinzufügen von react-colorful, @radix-ui/react-checkbox, @radix-ui/react-select, @radix-ui/react-tabs, @radix-ui/react-dialog, cmdk (für Combobox).
    - 6 neue shadcn-Components existieren als wrapped Radix-Primitives mit Tailwind-Styles.
    - Tests in Vitest können `<Checkbox>`, `<Select>` etc. rendern ohne Errors.
  </behavior>
  <action>
    Erweitere `portal/package.json` dependencies:
    - `react-colorful@^5.6` (für OCtrlColorRef)
    - `@radix-ui/react-checkbox@^1.1`
    - `@radix-ui/react-select@^2.1`
    - `@radix-ui/react-tabs@^1.1`
    - `@radix-ui/react-dialog@^1.1`
    - `@radix-ui/react-slot@^1.1` (für Button asChild — falls noch fehlend)
    - `cmdk@^1.0` (für Combobox)
    - `@radix-ui/react-popover@^1.1` (für Combobox-Popover)
    - `@tanstack/react-table@^8.20` (für OCtrlList)

    Versuche `cd portal && npx shadcn@latest add checkbox select tabs dialog --yes` um die shadcn-Standardvarianten automatisch zu generieren. Wenn das offline / blocked ist:

    Erstelle MANUELL nach shadcn-Default-Templates (alle Pattern aus https://ui.shadcn.com/):
    - `portal/src/components/ui/checkbox.tsx`: forwardRef-Wrapper um Radix.Checkbox.Root + Checkbox.Indicator mit Check-Icon (lucide-react).
    - `portal/src/components/ui/select.tsx`: kompletter Set (Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem) basierend auf Radix.Select.
    - `portal/src/components/ui/tabs.tsx`: Tabs, TabsList, TabsTrigger, TabsContent basierend auf Radix.Tabs.
    - `portal/src/components/ui/dialog.tsx`: Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter (Radix.Dialog).
    - `portal/src/components/ui/table.tsx`: Table, TableHeader, TableBody, TableRow, TableCell, TableHead — reine HTML mit Tailwind (kein Radix).
    - `portal/src/components/ui/combobox.tsx`: Eigenes Composite aus shadcn-Popover + cmdk-Command (siehe shadcn-Docs https://ui.shadcn.com/docs/components/combobox). API: `<Combobox value={...} onChange={...} options={...} placeholder={...} />`.

    KEIN tailwindcss-animate-Setup hier — Phase 1 ohne Animations OK.

    Nach allen Änderungen: `cd portal && npm install` + `cd portal && npx tsc -b --noEmit`.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    package.json hat 9 neue Deps. 6 shadcn-Components existieren in portal/src/components/ui/. tsc -b grün. Combobox ist composite (Popover + cmdk).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Foundation-Types + ViewerRegistry + ClientCtrl + ViewerFrame + ChildDialog</name>
  <files>portal/src/viewers/core/types.ts, portal/src/viewers/core/ViewerRegistry.ts, portal/src/viewers/core/ClientCtrl.ts, portal/src/viewers/core/ViewerFrame.tsx, portal/src/viewers/core/ChildDialog.tsx, portal/src/viewers/core/__tests__/ViewerRegistry.spec.ts, portal/src/viewers/core/__tests__/ClientCtrl.spec.ts</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 1 (OViewer-Hybrid, Z.430-547 — vollständiges Skeleton)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/viewers/core/*`)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h (Z.1-540 für Routing-Konzept — gezielt für Routing-Decisions, NICHT 1:1)
    - portal/src/components/ui/button.tsx (aus Plan 03 — für Toolbar in ViewerFrame)
    - portal/src/lib/utils.ts (cn-Helper)
  </read_first>
  <behavior>
    - `types.ts` exportiert: `ObjectKlass`, `ViewerHint`, `AttrValue`, `OBaseObj`, `ViewerProps<T>`, `ViewerCommand`, `PropertyMeta`, `ClassSchema`, `OCtrlBaseProps<T>`.
    - `viewerRegistry` ist Singleton; `viewerRegistry.register({klass, hint?, Component})` und `viewerRegistry.resolve(klass, hint?)` arbeiten korrekt mit Fallback-Logik (exact > klass-only > fallback).
    - `ClientCtrl` ist plain TS-Klasse (NICHT React); `resolveViewer(obj)` returnt Component oder null.
    - `ViewerFrame` React-Component: rendert Toolbar (5 Buttons: First/Prev/Next/Last/+/-/Delete/Reset — als Skeleton ohne Funktion) + resolved Viewer + EmptyState wenn selection==null.
    - `ChildDialog` ist Base-Layout-Component für Property-Editors (Title, Body, Footer); wird in Plan 08 von konkreten Viewer subclassed-wrapped.
    - `viewerRegistry.spec.ts`: 4 Tests (exact match, klass-only-Fallback, fallback, no-match-returns-undefined).
    - `clientCtrl.spec.ts`: 3 Tests (resolveViewer mit registriertem Klass, mit unregistriertem Klass + Fallback, setObject ändert state-callback).
  </behavior>
  <action>
    Erstelle `portal/src/viewers/core/types.ts` (RESEARCH §Pattern 1 Z.455-481):
    - `export type ObjectKlass = string`
    - `export type ViewerHint = string`
    - `export type AttrValue = number | string | boolean | null | number[]`
    - `export interface OBaseObj { oid: number; klass: ObjectKlass; attrs: Record<string, AttrValue>; sub_refs: number[][]; }`
    - `export type ViewerCommand = | { type: "navigate"; direction: "first" | "prev" | "next" | "last" } | { type: "create"; objKlass: ObjectKlass } | { type: "delete"; oid: number } | { type: "reset"; oid: number } | { type: "open-sub-viewer"; oid: number } | { type: "method"; name: string; oid?: number } | { type: "sub_refs_update"; oid: number; slot: number; newList: number[] };` — die Varianten `method` und `sub_refs_update` sind Phase-1-Pflicht: OCtrlMethod in dieser Datei sowie PDurchlaufplanViewerDesign in Plan 10 hängen davon ab. ViewerFrame muss alle Varianten beim onCommand-Dispatch durchreichen.
    - `export interface ViewerProps<T extends OBaseObj = OBaseObj> { obj: T; schema: ClassSchema; allObjects: Record<number, OBaseObj>; onChange: (patch: Partial<T["attrs"]>) => void; onCommand: (cmd: ViewerCommand) => void; disabled?: boolean; }` (allObjects ist nötig damit OCtrlLink Lookup-Listen rendern kann)
    - `export interface PropertyMeta { name: string; label_de: string; octrl_type: "Variable" | "Bool" | "Enum" | "Link" | "List" | "Method" | "TabViewer" | "COLORREF" | "LOGFONT"; value_type?: "string" | "int" | "float" | "boolean"; enum_values?: { value: number; label_de: string }[]; link_target_klass?: string; list_item_klass?: string; readonly?: boolean; nullable?: boolean; description_de?: string; }`
    - `export interface ClassSchema { klass: string; label_de: string; properties: PropertyMeta[]; viewer_hints: ViewerHint[]; }`
    - `export interface OCtrlBaseProps<T> { value: T | null; onChange: (value: T | null) => void; schema: PropertyMeta; disabled?: boolean; "data-octrl-id"?: string; }`

    Erstelle `portal/src/viewers/core/ViewerRegistry.ts` (RESEARCH §Pattern 1 Z.483-504):
    - `type ViewerEntry = { klass: ObjectKlass; hint?: ViewerHint; Component: React.ComponentType<ViewerProps>; }`
    - `class ViewerRegistry`:
      - `private entries: ViewerEntry[] = []`
      - `private fallback?: React.ComponentType<ViewerProps>`
      - `register(entry: ViewerEntry): void` — push to entries
      - `setFallback(C: React.ComponentType<ViewerProps>): void`
      - `resolve(klass: ObjectKlass, hint?: ViewerHint): React.ComponentType<ViewerProps> | undefined`:
        - 1. exact match: `entries.find(e => e.klass === klass && e.hint === hint)`
        - 2. klass-only match (wenn hint gegeben, aber kein exact): `entries.find(e => e.klass === klass && !e.hint)`
        - 3. fallback
      - `clear(): void` — für Tests
    - `export const viewerRegistry = new ViewerRegistry()`

    Erstelle `portal/src/viewers/core/ClientCtrl.ts` (RESEARCH §Pattern 1 Z.506-524):
    - `class ClientCtrl`:
      - constructor params: registry, getState, setSelection, setViewerHint (callbacks)
      - `resolveViewer(obj: OBaseObj | null) → ComponentType | null`
      - `setObject(oid: number | null) → void` → calls setSelection
      - `setViewerHint(hint: ViewerHint | null) → void` → calls setViewerHint
    - `export { ClientCtrl }`

    Erstelle `portal/src/viewers/core/ViewerFrame.tsx` (RESEARCH §Pattern 1 Z.526-547):
    - Functional-Component `ViewerFrame()`:
      - Liest selection + tree aus dem (in Plan 07 angelegten) ModelStore — VORÜBERGEHEND aus props: `interface ViewerFrameProps { selection: number | null; objects: Record<number, OBaseObj>; getSchemaFor: (klass: string) => ClassSchema | null; onSelectionChange: (oid: number | null) => void; onPatch: (oid: number, patch: Record<string, AttrValue>) => void; onCommand: (cmd: ViewerCommand) => void; viewerHint?: ViewerHint; disabled?: boolean; }` — ModelStore-Integration kommt in Plan 07. `disabled` wird an die resolved Viewer-Component durchgereicht (Plan 11 nutzt das für den Read-Only-Modus bei foreign Lock).
      - Rendert `<div className="flex h-full flex-col">`:
        - `<ViewerToolbar />` (interner sub-component): 7 Buttons (◄◄ ◄ ► ►► + - × =) als Icon-Buttons mit lucide-Icons (ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Plus, Minus, X, RotateCcw). Click dispatcht ViewerCommand.
        - Body: wenn obj == null → `<EmptyState />` (zentrierter Hint "Wähle ein Objekt im Tree links"); sonst Component aus registry resolve, rendere mit `<Viewer obj={obj} schema={schema} allObjects={objects} onChange={(patch) => onPatch(obj.oid, patch)} onCommand={onCommand} disabled={disabled ?? false} />`.
    - Note: ViewerFrame ist read-only bzgl. Wire-Daten in dieser Welle; ModelStore-Hooks kommen in Plan 07. EmptyState ist inline-defined.

    Erstelle `portal/src/viewers/core/ChildDialog.tsx`:
    - Functional Component `ChildDialog({ title, description, children, footer })`:
      - Layout: `<div className="flex h-full flex-col p-4 gap-4">`
        - Header: `<h3 className="text-lg font-semibold">{title}</h3>` + optional description
        - Body: `<div className="flex-1 overflow-auto">{children}</div>`
        - Footer optional: `<div className="border-t pt-3">{footer}</div>`

    Erstelle Tests:
    - `portal/src/viewers/core/__tests__/ViewerRegistry.spec.ts`:
      - test "exact match wins over klass-only" (register klass+hint, register klass-only, resolve mit hint → ersten)
      - test "klass-only fallback wenn hint nicht passt"
      - test "fallback wenn kein klass match"
      - test "undefined wenn nichts registriert und kein fallback"
    - `portal/src/viewers/core/__tests__/ClientCtrl.spec.ts`:
      - test "resolveViewer mit registriertem klass returnt component"
      - test "resolveViewer mit unregistriertem klass returnt fallback"
      - test "setObject ruft setSelection-callback"
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10 &amp;&amp; npm run test:run -- viewers/core 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    5 Foundation-Files existieren. 2 Test-Files mit 7 Tests grün. ViewerRegistry.resolve hat 3-stufige Fallback-Logik. ClientCtrl ist plain TS (kein React). ViewerFrame ist props-driven (Store kommt in Plan 07).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: OCtrlVariable + OCtrlBool + OCtrlEnum + Tests</name>
  <files>portal/src/viewers/core/octrl/OCtrlVariable.tsx, portal/src/viewers/core/octrl/OCtrlBool.tsx, portal/src/viewers/core/octrl/OCtrlEnum.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlVariable.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlBool.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlEnum.spec.tsx</files>
  <read_first>
    - portal/src/viewers/core/types.ts (aus Task 2 — OCtrlBaseProps)
    - portal/src/components/ui/input.tsx + checkbox.tsx + select.tsx (aus Plan 03 + Task 1)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrlVariable.h, OCtrlBool.h, OCtrlEnum.h (Konzept-Quellen — welche Property-Types werden unterstützt?)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 2 (Mapping-Tabelle Z.552-563)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/viewers/core/octrl/*` + Editable-Cell-Inspiration)
  </read_first>
  <behavior>
    - `<OCtrlVariable value={42} onChange={...} schema={{value_type:"int",...}} />` rendert ein `<Input type="number">` mit value=42; onChange ruft parent mit Integer (parseInt). Bei value_type="string" → type="text". Bei value_type="float" → type="number" + step="any". Empty string + nullable → onChange(null).
    - `<OCtrlBool value={true} onChange={...} />` rendert `<Checkbox checked>`; click toggles. Wenn nullable=true → tri-state mit Indeterminate-Icon (Phase 1: zwei-state reicht — note in Code).
    - `<OCtrlEnum value={1} onChange={...} schema={{enum_values:[{value:0,label_de:"Aus"},{value:1,label_de:"Ein"}]}} />` rendert `<Select>` mit zwei Items; current value = "Ein". Bei schema.octrl_type === "Enum" und display-Hint "radio" (zukünftig) → RadioGroup. Phase 1: nur Dropdown.
    - Jeder OCtrl hat data-octrl-id={schema.name} im Root-Element für E2E-Tests.
    - Tests pro OCtrl: render-test (DOM enthält erwartete Elemente), interaction-test (user-event triggers onChange mit korrektem value).
  </behavior>
  <action>
    Erstelle `portal/src/viewers/core/octrl/OCtrlVariable.tsx`:
    - Props: `OCtrlBaseProps<string | number>`
    - if schema.value_type === "int": `<Input type="number" step="1" value={value ?? ""} onChange={(e) => { const v = e.target.value === "" ? (schema.nullable ? null : 0) : parseInt(e.target.value, 10); onChange(v); }} disabled={disabled || schema.readonly} data-octrl-id={schema.name}` und Label-Wrap: `<label className="grid gap-1 text-sm"><span className="text-muted-foreground">{schema.label_de}</span>...</label>`.
    - Analog für "float" (step="any", parseFloat) und "string" (type="text", kein parse).
    - Default-Case (kein value_type angegeben): string-Input.

    Erstelle `portal/src/viewers/core/octrl/OCtrlBool.tsx`:
    - Props: `OCtrlBaseProps<boolean>`
    - `<label className="flex items-center gap-2 text-sm"><Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} disabled={disabled || schema.readonly} data-octrl-id={schema.name} /><span>{schema.label_de}</span></label>`
    - Comment im Code: "Tri-State (true/false/null) für nullable-Schemas in Phase 2 (Radix-Checkbox hat 'indeterminate'-State)."

    Erstelle `portal/src/viewers/core/octrl/OCtrlEnum.tsx`:
    - Props: `OCtrlBaseProps<number>`
    - Validate: schema.enum_values muss gesetzt sein (sonst console.warn + render empty Select).
    - `<label className="grid gap-1 text-sm"><span>{schema.label_de}</span><Select value={value?.toString() ?? ""} onValueChange={(s) => onChange(parseInt(s, 10))} disabled={disabled || schema.readonly}><SelectTrigger data-octrl-id={schema.name}><SelectValue placeholder="Bitte wählen" /></SelectTrigger><SelectContent>{schema.enum_values.map(ev => <SelectItem key={ev.value} value={ev.value.toString()}>{ev.label_de}</SelectItem>)}</SelectContent></Select></label>`

    Tests pro Component:
    - render-test: render mit value, suche `[data-octrl-id="x"]`, assert toBeInTheDocument
    - interaction-test: userEvent.type/click, assert onChange wurde mit korrektem Wert aufgerufen (vi.fn())
    - schema.readonly-test: render mit readonly=true, assert disabled-attr
    - OCtrlVariable: zusätzlich value-type-Test: int parsed zu number, string bleibt string

    Verwendung von `@testing-library/react` + `@testing-library/user-event`.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- viewers/core/octrl 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    3 OCtrl-Components + 3 Test-Files. Jeder OCtrl hat data-octrl-id-Attribut. Tests prüfen render + interaction + readonly. value_type-Branching in OCtrlVariable funktioniert.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: OCtrlLink + OCtrlList + OCtrlMethod + OCtrlTabViewer + Tests</name>
  <files>portal/src/viewers/core/octrl/OCtrlLink.tsx, portal/src/viewers/core/octrl/OCtrlList.tsx, portal/src/viewers/core/octrl/OCtrlMethod.tsx, portal/src/viewers/core/octrl/OCtrlTabViewer.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlLink.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlList.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlMethod.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlTabViewer.spec.tsx</files>
  <read_first>
    - portal/src/components/ui/combobox.tsx (aus Task 1)
    - portal/src/components/ui/table.tsx (aus Task 1)
    - portal/src/components/ui/tabs.tsx (aus Task 1)
    - portal/src/components/ui/button.tsx (Plan 03)
    - portal/src/viewers/core/types.ts (aus Task 2 — link_target_klass, list_item_klass)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrlLink.h, OCtrlList.h, OCtrlMethod.h, OCtrlTabViewer.h
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 2 Z.557-561
  </read_first>
  <behavior>
    - `<OCtrlLink value={42} onChange={...} schema={{link_target_klass:"PRessBeleg",...}} allObjects={...} />` rendert Combobox mit allen Objekten der Klasse PRessBeleg (aus allObjects gefiltert + Labels aus attrs.m_sName). Selection setzt oid; "Öffnen"-Button daneben dispatcht onCommand({type:"open-sub-viewer", oid:42}).
    - `<OCtrlList value={[1,2,3]} onChange={...} schema={{list_item_klass:"PDpKnKonstant"}} allObjects={...} />` rendert Tabelle mit Spalten {OID, Klasse, Name} für jeden referenced Object. Toolbar: "Hinzufügen" (öffnet Dialog mit Klasse-Picker → onChange mit appended oid) und "Entfernen" (selected row → onChange mit gefilterter Liste).
    - `<OCtrlMethod schema={{name:"reset", label_de:"Zurücksetzen"}} />` rendert `<Button>Zurücksetzen</Button>`; onClick ruft `props.onCommand?.({type:"method", name:"reset"})` ODER (Phase 1 ohne sub-method-API): noop mit Toast "Methoden-Aufruf in Phase 2".
    - `<OCtrlTabViewer tabs={[{id:"std", label:"Standard", content: <Comp1/>}, {id:"design", label:"Design", content: <Comp2/>}]} value="std" onChange={...} />` rendert Tabs; click switched. KEIN OCtrlBaseProps-Schema hier — TabViewer ist Container, nicht Property-Editor.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/core/octrl/OCtrlLink.tsx`:
    - Props: `OCtrlBaseProps<number> & { allObjects: Record<number, OBaseObj>; onOpenSubViewer?: (oid: number) => void; }`
    - Filtere allObjects nach `obj.klass === schema.link_target_klass`.
    - Map zu Combobox-Options: `{ value: oid.toString(), label: obj.attrs.m_sName ?? `${klass} (${oid})` }`.
    - Render: `<label><span>{schema.label_de}</span><div className="flex gap-2"><Combobox value={value?.toString() ?? ""} onChange={(s) => onChange(s ? parseInt(s,10) : null)} options={options} placeholder="Objekt wählen" data-octrl-id={schema.name} />{value && onOpenSubViewer && <Button variant="outline" size="sm" onClick={() => onOpenSubViewer(value)}>Öffnen</Button>}</div></label>`

    Erstelle `portal/src/viewers/core/octrl/OCtrlList.tsx`:
    - Props: `OCtrlBaseProps<number[]> & { allObjects: Record<number, OBaseObj>; onCreate?: (newOid: number) => void; onOpenSubViewer?: (oid: number) => void; }`
    - Render: `<div className="space-y-2">`
      - Header: `<div className="flex items-center justify-between"><span className="text-sm font-medium">{schema.label_de}</span><div className="flex gap-2"><Button size="sm" onClick={...}>Hinzufügen</Button><Button size="sm" variant="outline" onClick={...}>Entfernen</Button></div></div>`
      - Table: für jede oid in value (default []), zeige Row mit OID, Klasse, Name (lookup in allObjects). Click → onOpenSubViewer.
    - "Hinzufügen" öffnet Dialog mit Select (Klassen-Picker, basierend auf schema.list_item_klass — wenn nicht gegeben, alle Klassen). Im Phase 1: einfache Implementierung — neues Object erstellen passiert in Plan 07 ModelStore via createObject; OCtrlList ruft nur onCreate-callback der vom Parent verdrahtet wird.
    - "Entfernen": removes selected oid (selection-State intern via useState).

    Erstelle `portal/src/viewers/core/octrl/OCtrlMethod.tsx`:
    - Props: nur `schema: PropertyMeta` und optional `onClick?: () => void` und `disabled?`
    - Render: `<Button variant="outline" size="sm" onClick={onClick} disabled={disabled} data-octrl-id={schema.name}>{schema.label_de}</Button>`
    - Wenn onClick nicht gegeben: console.warn + zeige toast "Methoden-Aufruf in Phase 2 implementiert" beim Klick.

    Erstelle `portal/src/viewers/core/octrl/OCtrlTabViewer.tsx`:
    - Props: `{ tabs: { id: string; label: string; content: ReactNode }[]; value: string; onChange: (id: string) => void; }`
    - Render: `<Tabs value={value} onValueChange={onChange}><TabsList>{tabs.map(t => <TabsTrigger value={t.id} key={t.id}>{t.label}</TabsTrigger>)}</TabsList>{tabs.map(t => <TabsContent value={t.id} key={t.id}>{t.content}</TabsContent>)}</Tabs>`

    Tests:
    - OCtrlLink.spec: render mit allObjects={1:{klass:"PRessBeleg",attrs:{m_sName:"Maschine A"}}}, schema.link_target_klass="PRessBeleg" → assert "Maschine A" im DOM. Click auf Combobox-Item → onChange aufgerufen mit 1. Click "Öffnen" → onOpenSubViewer(1).
    - OCtrlList.spec: render mit value=[1,2], allObjects=mit 1+2 → 2 Rows. Click "Hinzufügen" → öffnet Dialog (assert dialog visible).
    - OCtrlMethod.spec: click → onClick wurde gerufen ODER toast "Phase 2".
    - OCtrlTabViewer.spec: render mit 2 Tabs, click 2. Tab → onChange("tab2"); content wechselt.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- viewers/core/octrl 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    4 OCtrl-Components + 4 Test-Files. Combobox/Table/Tabs sind voll funktional. Tests prüfen Hauptpfade.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: OCtrlColorRef (react-colorful) + OCtrlLogFont (Eigenbau) + Tests + Barrel-Export</name>
  <files>portal/src/viewers/core/octrl/OCtrlColorRef.tsx, portal/src/viewers/core/octrl/OCtrlLogFont.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlColorRef.spec.tsx, portal/src/viewers/core/octrl/__tests__/OCtrlLogFont.spec.tsx, portal/src/viewers/core/octrl/index.ts</files>
  <read_first>
    - portal/src/components/ui/dialog.tsx + button.tsx + input.tsx + select.tsx (aus Task 1 + Plan 03)
    - portal/src/viewers/core/types.ts (aus Task 2)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrlCOLORREF.h, OCtrlLOGFONT.h
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 2 Z.561-563 (COLORREF + LOGFONT Eigenbau)
    - react-colorful Docs (https://github.com/omgovich/react-colorful)
  </read_first>
  <behavior>
    - `<OCtrlColorRef value={0xFF0000} onChange={...} schema={{...}} />` rendert `<Button>`-Trigger mit Color-Swatch (background-color = hex), click öffnet Dialog mit `<HexColorPicker />` von react-colorful. Save-Button im Dialog ruft onChange mit number (parseInt aus hex). C++-COLORREF ist 0x00BBGGRR (BGR, NICHT RGB) — Phase 1 vereinfachen auf RGB (note im Code mit TODO für Phase 4 bei Live-Viz-Konsistenz).
    - `<OCtrlLogFont value={{family:"Arial", size:10, bold:false, italic:false}} onChange={...} schema={{...}} />` rendert Form mit Select (Family: Arial/Times/Courier/Verdana — Standard-Web-Safe-Fonts) + Input (Size: number 6-72) + 2 Checkboxes (Bold, Italic). C++-LOGFONT hat ~14 Felder; Phase-1-Subset reicht (siehe RESEARCH §Pattern 2: "minimal mit Family+Size").
    - Barrel-Export `index.ts` exportiert alle 9 OCtrls + Re-export OCtrlBaseProps von types.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/core/octrl/OCtrlColorRef.tsx`:
    - Props: `OCtrlBaseProps<number>` (Number = COLORREF-Int z.B. 0xFF8800)
    - Helper `numToHex(n: number): string` und `hexToNum(h: string): number` (RGB-Encoding; siehe TODO unten).
    - Local-State: `[isOpen, setIsOpen]`.
    - Render: `<Dialog open={isOpen} onOpenChange={setIsOpen}><DialogTrigger asChild><Button variant="outline" size="sm" data-octrl-id={schema.name} className="gap-2"><div className="h-4 w-4 rounded border" style={{backgroundColor: numToHex(value ?? 0)}} /><span>{numToHex(value ?? 0).toUpperCase()}</span></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{schema.label_de}</DialogTitle></DialogHeader><HexColorPicker color={numToHex(value ?? 0)} onChange={(hex) => onChange(hexToNum(hex))} /><DialogFooter><Button onClick={() => setIsOpen(false)}>Übernehmen</Button></DialogFooter></DialogContent></Dialog>`
    - Import: `import { HexColorPicker } from "react-colorful"`.
    - Code-Comment: `// TODO Phase 4: COLORREF aus OSim2004 ist 0x00BBGGRR (BGR); für Live-Viz-Konsistenz muss hier ein Endian-Swap erfolgen.`

    Erstelle `portal/src/viewers/core/octrl/OCtrlLogFont.tsx`:
    - Types: `interface LogFontValue { family: string; size: number; bold?: boolean; italic?: boolean; }`
    - Props: `OCtrlBaseProps<LogFontValue>`
    - Const `FONT_FAMILIES = ["Arial", "Calibri", "Times New Roman", "Courier New", "Verdana", "Tahoma"]`.
    - Render Layout (grid mit 4 Feldern): Select (Family), Input (Size, type=number 6-72), Checkbox (Bold), Checkbox (Italic). Jede onChange ruft `onChange({...value, [field]: newVal})`.
    - data-octrl-id auf Root-Container.
    - Default-Value wenn value === null: `{family:"Arial", size:10, bold:false, italic:false}`.

    Erstelle `portal/src/viewers/core/octrl/index.ts` (Barrel):
    - `export { OCtrlVariable } from "./OCtrlVariable"`
    - `export { OCtrlBool } from "./OCtrlBool"`
    - `export { OCtrlEnum } from "./OCtrlEnum"`
    - `export { OCtrlLink } from "./OCtrlLink"`
    - `export { OCtrlList } from "./OCtrlList"`
    - `export { OCtrlMethod } from "./OCtrlMethod"`
    - `export { OCtrlTabViewer } from "./OCtrlTabViewer"`
    - `export { OCtrlColorRef } from "./OCtrlColorRef"`
    - `export { OCtrlLogFont } from "./OCtrlLogFont"`
    - `export type { OCtrlBaseProps } from "../types"`

    Tests:
    - OCtrlColorRef.spec: render mit value=0xFF8800 → assert color-swatch hat correct backgroundColor. Click trigger → DialogContent sichtbar. onChange-Mock wird mit number aufgerufen wenn HexColorPicker-onChange triggert.
    - OCtrlLogFont.spec: render mit value={family:"Arial",size:10} → Select zeigt "Arial". Change Size → onChange({family:"Arial",size:NEW,...}).

    KEIN dynamic-import für react-colorful (Bundle-Größe ist nur 4 KB, OK statisch).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- viewers/core/octrl 2>&amp;1 | tail -15 &amp;&amp; cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    2 OCtrl-Components (Color+Font) + 2 Test-Files. Barrel-Export listet alle 9 OCtrls. Color nutzt react-colorful. Font ist Eigenbau mit 4 Feldern. 2 Tests grün, Gesamtsuite (alle OCtrls) hat ~18 Tests grün.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| OCtrl ↔ User-Input | Browser-only; keine Backend-Interaktion direkt aus OCtrl (wird vom Parent verdrahtet) |
| OCtrl ↔ schema | schema kommt vom Backend (PropertySchema in Plan 07); kann theoretisch maliziös sein |
| Combobox-Options ↔ allObjects | allObjects kann user-controlled Strings enthalten (m_sName aus OTX-Upload) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Tampering | XSS via m_sName in Combobox/Table-Display | mitigate | React escaped automatisch in JSX; KEIN dangerouslySetInnerHTML in OCtrls |
| T-06-02 | Tampering | XSS via schema.label_de | mitigate | React-Escape; PropertySchema ist Hand-curated in Plan 07 (kein User-Content); in Phase 3 mit Engine-Reflection bleibt es engine-controlled |
| T-06-03 | Information Disclosure | OCtrlLink leakt fremde Objekte ans Frontend | accept | allObjects ist gesamtes Wire-Tree; bereits dem User zugänglich (er hat das Modell hochgeladen) — kein neuer Leak |
| T-06-04 | DoS | OCtrlList mit 10000+ Items rendert ohne Virtualisierung | accept | Phase 1: <500 Items realistisch; Virtualisierung via @tanstack/react-virtual in Phase 4 wenn nötig |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run -- viewers/core` zeigt ~18 Tests grün (7 Foundation + 9×~2 OCtrl-Tests)
- `cd portal && npm run lint` grün
- Barrel-Export `import { OCtrlVariable, OCtrlBool, OCtrlEnum, OCtrlLink, OCtrlList, OCtrlMethod, OCtrlTabViewer, OCtrlColorRef, OCtrlLogFont } from "@/viewers/core/octrl"` funktioniert ohne Type-Errors
- ViewerRegistry-Resolution: register klass+hint → resolve mit hint findet exact; ohne hint findet klass-only; kein match → fallback
</verification>

<success_criteria>
SC-5 (Vollständige 9-er OCtrl-Familie): VOLLSTÄNDIG implementiert in diesem Plan. Live-Verwendung in Plan 08/09.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-06-SUMMARY.md` with:
- Datei-Liste der 5 Foundation + 9 OCtrl
- Welche shadcn-Components hinzugefügt wurden (6 + react-colorful + 4 Radix-Primitives)
- OCtrl-Mapping-Tabelle (welcher OCtrl → welche Lib)
- TODO-Liste für Phase 4 (COLORREF BGR-Endian, OCtrlList-Virtualisierung)
- Pflicht-Lese-Hinweis für Plan 07: types.ts ist die Quelle der Wahrheit für Wire-Modelle (TypeScript-Side)
</output>
</content>
</invoke>