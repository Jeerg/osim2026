---
phase: 01-vertical-slice
plan: 08
type: execute
wave: 4
depends_on:
  - 01-07-property-schema-store-sidebar-workspace
files_modified:
  - portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx
  - portal/src/viewers/PSimulator/PSimulatorViewer.tsx
  - portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx
  - portal/src/viewers/PDlpl/PDlplBetriebsmittelViewer.tsx
  - portal/src/viewers/PDlpl/PDlplPersonalViewer.tsx
  - portal/src/viewers/AZeit/AEinsatzWunschViewer.tsx
  - portal/src/viewers/AZeit/AKapBedViewer.tsx
  - portal/src/viewers/AZeit/AGruppeViewer.tsx
  - portal/src/viewers/setup.ts
  - portal/src/viewers/__tests__/PGObjBaseViewer.spec.tsx
  - portal/src/viewers/__tests__/PSimulatorViewer.spec.tsx
  - portal/src/viewers/__tests__/PDurchlaufplanViewerStd.spec.tsx
  - portal/src/viewers/__tests__/AGruppeViewer.spec.tsx
autonomous: true
requirements:
  - SC-4
  - SC-6
priority: high

must_haves:
  truths:
    - "PGObjBaseViewer ist der vollwertige Property-Editor-Fallback: rendert für ein beliebiges Object alle Properties aus PropertySchema mit dem passenden OCtrl."
    - "PSimulatorViewer zeigt Top-Level-Modell-Properties (Name, Seed, Start/Ende, Periodenlänge) im PGObjBase-Layout."
    - "PDurchlaufplanViewerStd zeigt Property-Editor + OCtrlList für Knoten + OCtrlList für Kanten."
    - "PDlplBetriebsmittel/PDlplPersonal zeigen Verknüpfungs-Editoren (Knoten ↔ Ressource per Combobox)."
    - "AEinsatzWunsch/AKapBed/AGruppe zeigen Schicht/Kapazitäts/Personalgruppen-Editoren."
    - "Alle 8 Viewer sind in viewerRegistry registriert; Sidebar-Click auf passendes Object öffnet den jeweiligen Viewer."
    - "Edit eines Properties (OCtrl-onChange) ruft useModelStore.patchObject(oid, patch) und setzt dirty=true."
  artifacts:
    - path: "portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx"
      provides: "Generic-Property-Editor (Fallback + Basis-Komponente für Subclassing)"
      contains: "PGObjBaseViewer"
    - path: "portal/src/viewers/setup.ts"
      provides: "Side-effect-Modul für viewerRegistry-Registrierungen aller 8 Property-Viewer"
      contains: "viewerRegistry.register"
  key_links:
    - from: "viewerRegistry (Plan 06)"
      to: "alle 8 PXyzViewer-Files (jeweils registrieren via setup.ts)"
      via: "setup.ts importiert alle Viewer und registriert (klass, hint, Component) Tuple"
      pattern: "viewerRegistry.register"
    - from: "OCtrlVariable.onChange (Plan 06)"
      to: "ViewerFrame.onPatch → useModelStore.patchObject"
      via: "Props-Drill durch PGObjBaseViewer + PXyzViewer"
      pattern: "onChange"
---

<objective>
8 von 12 konkreten Viewern aus SC-04: alle PROPERTY-orientierten Viewer (kein Matrix, kein graphisch). PGObjBaseViewer ist die Schlüssel-Komponente — er kann ein beliebiges Object mit beliebigem PropertySchema rendern und ist als Fallback registriert. Die spezialisierten Viewer (PSimulator, PDurchlaufplanStd, PDlpl-Verknüpfung, AZeit-Viewer) wrappen PGObjBaseViewer mit zusätzlichen OCtrlList-Sektionen für Sub-Objekte (Knoten/Kanten/Personalgruppen-Members).

Matrix-Viewer (PRessBeleg/PRessMenge/PRessVerknüpfung) und Design-Viewer (PDurchlaufplanDesign) sind separat in Plan 09 bzw. Plan 10.

Purpose: SC-4 (8/12 Viewer) + SC-6 (Edit-Operationen funktional) für die Property-orientierten Klassen.

Output: 8 Viewer-Files, ein zentrales setup.ts, 4 representative Tests (PGObjBase + PSimulator + PDurchlaufplanStd + AGruppe als Stichprobe pro Familie). Manueller Smoke: Workspace-Sidebar-Click auf einen Knoten → PGObjBaseViewer zeigt 5 Properties; Click auf Durchlaufplan → PDurchlaufplanViewerStd zeigt Property-Editor + 2 Sub-Listen.
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
@.planning/phases/01-vertical-slice/01-06-oviewer-core-octrl-family-PLAN.md
@.planning/phases/01-vertical-slice/01-07-property-schema-store-sidebar-workspace-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 06 -->
```typescript
// portal/src/viewers/core/types.ts
export interface ViewerProps<T extends OBaseObj = OBaseObj> {
  obj: T;
  schema: ClassSchema;
  allObjects: Record<number, OBaseObj>;
  onChange: (patch: Partial<T["attrs"]>) => void;
  onCommand: (cmd: ViewerCommand) => void;
  disabled?: boolean;
}

// portal/src/viewers/core/ChildDialog.tsx — Base-Layout
export function ChildDialog({title, description, children, footer}): JSX.Element

// portal/src/viewers/core/octrl/index.ts — alle 9 OCtrls + OCtrlBaseProps
export { OCtrlVariable, OCtrlBool, OCtrlEnum, OCtrlLink, OCtrlList, OCtrlMethod, OCtrlTabViewer, OCtrlColorRef, OCtrlLogFont }

// portal/src/viewers/core/ViewerRegistry.ts
export const viewerRegistry: ViewerRegistry
```

<!-- Aus Plan 07 -->
```typescript
// portal/src/stores/model-store.ts
useModelStore.getState().patchObject(oid, patch)
useModelStore.getState().createObject(klass, attrs) -> number
useModelStore.getState().deleteObject(oid)
```

<!-- C++-Header-Konzeptquellen (PFLICHTLEKTÜRE für Viewer-Strukturen) -->
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PSimulatorViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplViewerStd.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PGObjBaseViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplBetriebsmittelViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplPersonalViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\AEinsatzWunschViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\AKapBedViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\AGruppeViewer.h
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PGObjBaseViewer (Generic Property-Editor + Fallback) + Test</name>
  <files>portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx, portal/src/viewers/__tests__/PGObjBaseViewer.spec.tsx</files>
  <read_first>
    - portal/src/viewers/core/types.ts (Plan 06 — ViewerProps, PropertyMeta, ClassSchema)
    - portal/src/viewers/core/ChildDialog.tsx (Plan 06)
    - portal/src/viewers/core/octrl/index.ts (Plan 06 — alle 9 OCtrls)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PGObjBaseViewer.h (Konzept-Vorlage)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Open Questions #3 (PGObjBase als Catch-All)
  </read_first>
  <behavior>
    - `<PGObjBaseViewer obj={...} schema={...} allObjects={...} onChange={...} onCommand={...} />` rendert eine `<ChildDialog title={schema.label_de + " — " + (obj.attrs.m_sName ?? `oid ${obj.oid}`)}>`.
    - Body: für jede property in schema.properties, render passender OCtrl basierend auf property.octrl_type.
    - Property-Layout: vertikale Stack, jede property bekommt 1 Zeile.
    - Mapping (octrl_type → OCtrl-Component):
      - "Variable" → OCtrlVariable
      - "Bool" → OCtrlBool
      - "Enum" → OCtrlEnum
      - "Link" → OCtrlLink (mit allObjects-Prop)
      - "List" → OCtrlList (mit allObjects-Prop)
      - "Method" → OCtrlMethod (mit onClick → onCommand)
      - "COLORREF" → OCtrlColorRef
      - "LOGFONT" → OCtrlLogFont
      - "TabViewer" → KEIN direct-render hier (Tab-Container ist Layout-Element, nicht Property — PGObjBaseViewer ignoriert TabViewer-Props)
    - Jeder OCtrl bekommt `value={obj.attrs[property.name]}`, `onChange={(v) => onChange({[property.name]: v})}`, `schema={property}`, `disabled={disabled}`.
    - Wenn schema null oder schema.properties leer → zeige `<div>Keine Properties verfügbar für Klasse {obj.klass}.</div>`.
    - Test: render mit Mock-obj (PSimulator-Daten) und Mock-Schema → assert dass für jede property der passende OCtrl im DOM ist (via data-octrl-id). Click auf einen Input → onChange wurde aufgerufen mit korrektem patch-Objekt.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx`:
    - Imports: ViewerProps + alle OCtrls (Barrel-Import).
    - Helper `renderOCtrl(prop: PropertyMeta, obj, allObjects, onChange, onCommand, disabled): JSX`:
      - switch prop.octrl_type:
        - "Variable" → `<OCtrlVariable key={prop.name} value={obj.attrs[prop.name] as number|string|null} onChange={(v) => onChange({[prop.name]: v})} schema={prop} disabled={disabled} />`
        - "Bool" → analog
        - "Enum" → analog
        - "Link" → `<OCtrlLink ... allObjects={allObjects} onOpenSubViewer={(oid) => onCommand({type:"open-sub-viewer", oid})} />`
        - "List" → `<OCtrlList ... allObjects={allObjects} onCreate={(newOid) => onCommand({type:"create", objKlass: prop.list_item_klass!})} onOpenSubViewer={(oid) => onCommand({type:"open-sub-viewer", oid})} />`
        - "Method" → `<OCtrlMethod schema={prop} onClick={() => onCommand({type:"method", name: prop.name, oid: obj.oid})} />` (ViewerCommand-Union enthält `method` ab Plan 06 types.ts — keine Cast, keine TODO mehr.)
        - "COLORREF" → OCtrlColorRef
        - "LOGFONT" → OCtrlLogFont
        - default → null
    - Component:
      ```jsx
      export function PGObjBaseViewer({obj, schema, allObjects, onChange, onCommand, disabled}: ViewerProps) {
        if (!schema || !schema.properties.length) {
          return <ChildDialog title={`${obj.klass} (oid ${obj.oid})`}><p>Keine Properties verfügbar.</p></ChildDialog>;
        }
        const title = `${schema.label_de} — ${obj.attrs.m_sName ?? `oid ${obj.oid}`}`;
        return (
          <ChildDialog title={title} description={schema.klass}>
            <div className="space-y-3 max-w-2xl">
              {schema.properties.map(prop => <div key={prop.name}>{renderOCtrl(prop, obj, allObjects, onChange, onCommand, disabled)}</div>)}
            </div>
          </ChildDialog>
        );
      }
      ```

    (Hinweis: Die `method`- und `sub_refs_update`-Varianten von ViewerCommand werden bereits in Plan 06 types.ts vollständig definiert — kein TODO mehr nötig.)

    Erstelle `portal/src/viewers/__tests__/PGObjBaseViewer.spec.tsx`:
    - Test 1 "rendert alle properties als OCtrls": Mock obj + schema mit 3 Properties (Variable, Bool, Enum). Render. Assert `[data-octrl-id="m_sName"]`, `[data-octrl-id="m_iSeed"]`, `[data-octrl-id="m_bAktiv"]` sind im DOM.
    - Test 2 "ohne schema rendert Fallback-Message": render mit schema=null → assert "Keine Properties" im DOM.
    - Test 3 "onChange wird mit korrektem patch aufgerufen": user-event types in OCtrlVariable → assert onChange wurde mit `{m_sName: "neu"}` aufgerufen.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- PGObjBase 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    PGObjBaseViewer.tsx + Test existieren. 3 Tests grün. Mapping deckt alle 8 OCtrl-Types (TabViewer wird skipped). onChange dispatcht korrekten patch.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PSimulatorViewer + PDurchlaufplanViewerStd + Tests</name>
  <files>portal/src/viewers/PSimulator/PSimulatorViewer.tsx, portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx, portal/src/viewers/__tests__/PSimulatorViewer.spec.tsx, portal/src/viewers/__tests__/PDurchlaufplanViewerStd.spec.tsx</files>
  <read_first>
    - portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx (aus Task 1 — Basis-Komponente zum Wrappen)
    - portal/src/viewers/core/types.ts (Plan 06)
    - portal/src/viewers/core/octrl/index.ts (Plan 06)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PSimulatorViewer.h, PDlplViewerStd.h
    - app/static/schemas/v1/schemas.json (Plan 07 — PSimulator-Schema und PDurchlaufplan-Schema)
  </read_first>
  <behavior>
    - `PSimulatorViewer` rendert PGObjBaseViewer mit PSimulator-Schema. Zusätzlich: "Sim-Lauf starten"-Button im footer (disabled mit Tooltip "kommt in Phase 2"). KEINE zusätzlichen Sub-Listen (Pläne werden im Tree gezeigt).
    - `PDurchlaufplanViewerStd` rendert PGObjBaseViewer-Layout, ABER mit OCtrlTabViewer als äußerstem Container: Tab 1 "Eigenschaften" zeigt PGObjBaseViewer, Tab 2 "Knoten" zeigt OCtrlList von Knoten-Oids aus obj.sub_refs[0], Tab 3 "Kanten" zeigt OCtrlList von Kanten-Oids aus obj.sub_refs[1]. Sub-Click → onCommand({type:"open-sub-viewer", oid}).
    - Tests: render mit mock obj+schema+allObjects → assert dass für PSimulatorViewer Properties Name/Seed sichtbar sind; für PDurchlaufplanViewerStd 3 Tabs sichtbar und Knoten-Tab zeigt korrekte Anzahl.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PSimulator/PSimulatorViewer.tsx`:
    - Wrap PGObjBaseViewer mit zusätzlichem Footer-Button:
      ```jsx
      export function PSimulatorViewer(props: ViewerProps) {
        return (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              <PGObjBaseViewer {...props} />
            </div>
            <div className="border-t p-3 flex justify-end">
              <Button variant="default" disabled title="Sim-Lauf-Start wird in Phase 2 implementiert">
                Sim-Lauf starten
              </Button>
            </div>
          </div>
        );
      }
      ```

    Erstelle `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx`:
    - State: `const [tab, setTab] = useState("eigenschaften")`
    - sub_refs-Mapping: knotenOids = obj.sub_refs[0] ?? [], kantenOids = obj.sub_refs[1] ?? []. HINWEIS: sub_refs-Layout muss aus Plan 04 SUMMARY oder docs/engine-coverage.md verifiziert werden — wenn anders, anpassen.
    - Synthetische PropertyMeta für die Listen:
      - knotenListMeta: `{name: "_knoten", label_de: "Knoten", octrl_type: "List", list_item_klass: "PDpKnKonstant"}` (list_item_klass kann auch null bleiben — OCtrlList akzeptiert dann alle Klassen).
      - kantenListMeta: analog mit list_item_klass: "PDlplKante".
    - Render:
      ```jsx
      <ChildDialog title={`Durchlaufplan — ${obj.attrs.m_sName ?? `oid ${obj.oid}`}`}>
        <OCtrlTabViewer value={tab} onChange={setTab} tabs={[
          {id:"eigenschaften", label:"Eigenschaften", content: <PGObjBaseViewer {...props} />},
          {id:"knoten", label: `Knoten (${knotenOids.length})`, content: <OCtrlList value={knotenOids} onChange={...} schema={knotenListMeta} allObjects={allObjects} onOpenSubViewer={(oid) => onCommand({type:"open-sub-viewer", oid})} disabled={disabled} />},
          {id:"kanten", label: `Kanten (${kantenOids.length})`, content: <OCtrlList value={kantenOids} onChange={...} schema={kantenListMeta} allObjects={allObjects} onOpenSubViewer={(oid) => onCommand({type:"open-sub-viewer", oid})} disabled={disabled} />},
        ]} />
      </ChildDialog>
      ```
    - onChange für Knoten/Kanten-Liste: dispatcht onChange-Prop des PDurchlaufplanViewers mit `{_sub_refs_knoten: newList}` — wobei der ModelStore das speziell handhaben muss. ALTERNATIV einfacher: dispatcht direkt onCommand({type:"sub_refs_update", oid: obj.oid, slot: 0, newList}) und ViewerCommand-Type um diesen Variant erweitern (passiert in Plan 11 Refactor). Phase-1-MVP: onChange für sub_refs ist NO-OP mit toast.info("Knoten-Reordering kommt in Plan 10"). Hinzufügen/Entfernen geht über onCommand.

    Tests:
    - PSimulatorViewer.spec: render mit obj+schema → assert Properties + Button "Sim-Lauf starten" + Button disabled.
    - PDurchlaufplanViewerStd.spec: render mit obj.sub_refs=[[10,11],[20]] + 4 dummies in allObjects → assert 3 Tabs, Knoten-Tab zeigt "Knoten (2)", Kanten-Tab zeigt "Kanten (1)". Click Tab 2 → switcht.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- PSimulator PDurchlaufplan 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    PSimulatorViewer + PDurchlaufplanViewerStd existieren. 2 Tests grün. Tab-Navigation in PDurchlaufplanStd funktioniert. sub_refs-Sub-Listen werden gezeigt.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: PDlplBetriebsmittelViewer + PDlplPersonalViewer (Verknüpfungs-Editoren)</name>
  <files>portal/src/viewers/PDlpl/PDlplBetriebsmittelViewer.tsx, portal/src/viewers/PDlpl/PDlplPersonalViewer.tsx</files>
  <read_first>
    - portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx (aus Task 1)
    - portal/src/viewers/core/octrl/OCtrlLink.tsx (Plan 06)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDlplBetriebsmittelViewer.h, PDlplPersonalViewer.h
    - app/static/schemas/v1/schemas.json (Plan 07 — PDlplBetriebsmittel + PDlplPersonal Schemas)
  </read_first>
  <behavior>
    - `PDlplBetriebsmittelViewer` zeigt 3 OCtrlLinks: (Knoten, Betriebsmittel) + 1 OCtrlVariable: Anteil.
    - Identische Struktur für PDlplPersonalViewer mit (Knoten, Personal) + Anteil.
    - Beide nutzen PGObjBaseViewer als Basis ohne weitere Anpassungen (PropertySchema enthält bereits die 3 Properties).
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PDlpl/PDlplBetriebsmittelViewer.tsx` als reines Wrap:
    - `export function PDlplBetriebsmittelViewer(props: ViewerProps) { return <PGObjBaseViewer {...props} />; }`
    - Hinweis-Kommentar: "Aktuell identisch mit PGObjBaseViewer; spezialisierte UI kommt wenn Drag-and-Drop-Editor in Phase 4 Knoten↔Ressource visualisiert."

    Analog `portal/src/viewers/PDlpl/PDlplPersonalViewer.tsx`.

    KEIN eigener Test — Coverage via PGObjBaseViewer-Test.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    2 Files existieren. Beide wrappen PGObjBaseViewer (Phase-1-MVP-Stand).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: AEinsatzWunschViewer + AKapBedViewer + AGruppeViewer + Test für AGruppe</name>
  <files>portal/src/viewers/AZeit/AEinsatzWunschViewer.tsx, portal/src/viewers/AZeit/AKapBedViewer.tsx, portal/src/viewers/AZeit/AGruppeViewer.tsx, portal/src/viewers/__tests__/AGruppeViewer.spec.tsx</files>
  <read_first>
    - portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx (aus Task 1)
    - portal/src/viewers/core/octrl/OCtrlList.tsx (Plan 06)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\AEinsatzWunschViewer.h, AKapBedViewer.h, AGruppeViewer.h
    - app/static/schemas/v1/schemas.json (Plan 07)
  </read_first>
  <behavior>
    - `AEinsatzWunschViewer` rendert PGObjBaseViewer (Name, Beginn, Ende, Anteil — alles Properties im Schema).
    - `AKapBedViewer` rendert PGObjBaseViewer (Periode-Link, SollKapazität, IstKapazität, Auslastung).
    - `AGruppeViewer` rendert PGObjBaseViewer + zusätzlich OCtrlList für m_oids_personal (Personalgruppen-Mitglieder).
    - AGruppe-Test: render mit obj.attrs.m_oids_personal=[1,2,3] + 3 Personal-Objekte in allObjects → assert Tabelle zeigt 3 Rows.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/AZeit/AEinsatzWunschViewer.tsx` als reines Wrap:
    - `export function AEinsatzWunschViewer(props: ViewerProps) { return <PGObjBaseViewer {...props} />; }`

    Erstelle `portal/src/viewers/AZeit/AKapBedViewer.tsx` analog.

    Erstelle `portal/src/viewers/AZeit/AGruppeViewer.tsx`:
    - PGObjBaseViewer rendert bereits m_oids_personal als OCtrlList (octrl_type:"List" im schema). Also: einfach PGObjBaseViewer wrappen.
    - `export function AGruppeViewer(props: ViewerProps) { return <PGObjBaseViewer {...props} />; }`
    - Spezialisierter Aufbau (z.B. Mitglieder als Tab) kann in späterem Phase als optionale Verbesserung.

    Erstelle `portal/src/viewers/__tests__/AGruppeViewer.spec.tsx`:
    - Test "rendert Mitglieder-Liste mit korrekter Anzahl": Mock obj.attrs.m_oids_personal=[1,2,3]; schema mit property m_oids_personal type="List"; allObjects mit 3 Persons. Render → DOM enthält Tabelle mit 3 Rows.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- AGruppe 2>&amp;1 | tail -10 &amp;&amp; cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    3 AZeit-Viewer existieren als PGObjBase-Wraps. AGruppe-Test grün.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: setup.ts mit Registrierung aller 8 Viewer + Fallback-Replacement</name>
  <files>portal/src/viewers/setup.ts, portal/src/app.tsx</files>
  <read_first>
    - portal/src/viewers/setup.ts (aus Plan 07 — temporärer Stub-Fallback)
    - portal/src/viewers/core/ViewerRegistry.ts (Plan 06)
    - portal/src/app.tsx (aus Plan 03 — Side-effect-Import-Punkt)
    - Alle 8 Viewer aus Tasks 1-4
  </read_first>
  <behavior>
    - `portal/src/viewers/setup.ts` ersetzt den Stub-Fallback aus Plan 07 mit echtem PGObjBaseViewer.
    - Alle 8 Viewer sind registriert:
      - viewerRegistry.register({klass:"PSimulator", Component: PSimulatorViewer})
      - viewerRegistry.register({klass:"PDurchlaufplan", hint:"std", Component: PDurchlaufplanViewerStd})
      - viewerRegistry.register({klass:"PDlplBetriebsmittel", Component: PDlplBetriebsmittelViewer})
      - viewerRegistry.register({klass:"PDlplPersonal", Component: PDlplPersonalViewer})
      - viewerRegistry.register({klass:"AEinsatzWunsch", Component: AEinsatzWunschViewer})
      - viewerRegistry.register({klass:"AKapBed", Component: AKapBedViewer})
      - viewerRegistry.register({klass:"AGruppe", Component: AGruppeViewer})
      - viewerRegistry.setFallback(PGObjBaseViewer)
    - `portal/src/app.tsx` importiert setup.ts side-effect-only (`import "@/viewers/setup"`).
  </behavior>
  <action>
    Überschreibe `portal/src/viewers/setup.ts`:
    - Imports aller 8 Viewer-Components.
    - Import viewerRegistry.
    - Registriere alle 8 + setFallback(PGObjBaseViewer).
    - KEIN Stub-Code mehr.

    Erweitere `portal/src/app.tsx`:
    - Top-Level-Import (side-effect): `import "@/viewers/setup";` (vor `import { App } from ...`).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5 &amp;&amp; cd portal &amp;&amp; npm run test:run 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    setup.ts hat 7 register + 1 setFallback. app.tsx importiert setup side-effect. Gesamte Vitest-Suite grün.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| obj.attrs ↔ Viewer-Render | obj.attrs kommt aus dem Wire (User-Upload via Backend); React-Escape schützt vor XSS |
| PropertySchema-Validation | Frontend trust schema (vom Backend); Property-Names sind nicht user-supplied |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-01 | Tampering | OCtrl-Value ist invalid (z.B. negative Periodenlänge) | accept | Frontend macht Soft-Validation; Backend macht Authority-Validation beim Save (Plan 04 wire_to_otx); kein Server-Crash |
| T-08-02 | Tampering | obj.klass passt nicht zu schema.klass | mitigate | Viewer rendert Properties aus schema, nicht aus obj — wenn Mismatch, Properties leer (Defense) |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run -- viewers` zeigt alle Tests aus Plan 06 + Plan 08 grün (~24 Tests)
- Manueller Smoke (mit Backend + Login + Dummy.otx hochgeladen):
  - /models/{id} → Sidebar-Click auf Modell-Root → PSimulatorViewer öffnet sich, zeigt Name/Seed/Start/Ende/PeriodenLänge editierbar + "Sim-Lauf starten"-Button (disabled).
  - Edit Name → blur → useModelStore.dirty == true (Plan 11 zeigt Save-Indicator).
  - Sidebar-Click auf Durchlaufplan → PDurchlaufplanViewerStd öffnet, 3 Tabs sichtbar.
  - Sidebar-Click auf Knoten → PGObjBaseViewer (Fallback) öffnet.
</verification>

<success_criteria>
SC-4 (12 konkrete Viewer): 8/12 erfüllt (Property-Viewer-Familie). Matrix in Plan 09, Design in Plan 10.
SC-6 (Edit-Operationen): VOLLSTÄNDIG für Property-Edit + List-View-Edit. Backend-Save kommt in Plan 11.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-08-SUMMARY.md` with:
- Liste der 8 Viewer + welche PGObjBase-Wrap vs. eigener Composite
- Registry-State: alle registrierten (klass, hint, Component) Tuple
- Bekannte Defizite:
  - Knoten/Kanten-Reordering im PDurchlaufplanStd ist noop (kommt in Plan 10)
  - PDlpl-Verknüpfung sind reine PGObjBase-Wraps (spezialisierte UI in Phase 4)
  - ViewerCommand-Type-Erweiterung für "method"-Variant nötig
- Was Plan 09 + 10 noch ergänzen müssen für vollständige SC-4
</output>
</content>
</invoke>