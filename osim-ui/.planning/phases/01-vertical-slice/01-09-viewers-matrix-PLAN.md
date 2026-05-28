---
phase: 01-vertical-slice
plan: 09
type: execute
wave: 5
depends_on:
  - 01-07-property-schema-store-sidebar-workspace
files_modified:
  - portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx
  - portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx
  - portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx
  - portal/src/viewers/PRess/matrix-common.tsx
  - portal/src/viewers/setup.ts
  - portal/src/viewers/__tests__/PRessBelegMatrixViewer.spec.tsx
  - portal/src/viewers/__tests__/PRessVerknuepfungViewer.spec.tsx
autonomous: true
requirements:
  - SC-4
  - SC-6
priority: high

must_haves:
  truths:
    - "PRessBelegMatrixViewer zeigt eine Tabelle: Zeilen = Knoten des Modells, Spalten = Belegungsressourcen-Eigenschaften (Kapazität, Einheit, Kostensatz)."
    - "PRessMengeMatrixViewer zeigt analog: Zeilen = Mengen-Ressourcen, Spalten = Menge/NachschubMenge/NachschubIntervall."
    - "PRessVerknuepfungViewer zeigt Verknüpfungs-Matrix: Zeilen = Ressource, Spalten = Knoten, Zellen = Anteil (editierbar)."
    - "Alle drei Viewer sind in viewerRegistry registriert mit hint='matrix' (PRessBeleg/PRessMenge haben sowohl 'std'=PGObjBaseViewer als auch 'matrix')."
    - "Edit einer Zelle ruft useModelStore.patchObject (oder createObject für neue Verknüpfung)."
  artifacts:
    - path: "portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx"
      provides: "Matrix-Tabellen-Viewer für Belegungs-Ressourcen"
      contains: "PRessBelegMatrixViewer"
    - path: "portal/src/viewers/PRess/matrix-common.tsx"
      provides: "Wiederverwendbarer MatrixTable-Component (Header, Body, Edit-Cell)"
      contains: "MatrixTable"
  key_links:
    - from: "matrix-common.tsx MatrixTable"
      to: "portal/src/components/ui/table.tsx (Plan 06 shadcn-Table)"
      via: "Wrap mit Editable-Cell-Logik"
      pattern: "Table"
    - from: "Matrix-Cell-onChange"
      to: "useModelStore.patchObject"
      via: "Cell-Edit dispatcht patch direkt; KEIN intermediates Form-State"
      pattern: "patchObject"
---

<objective>
3 Matrix-Viewer für die Ressourcen-Perspektive (Bereich C der drei OSim-Perspektiven Prozess/Ressource/Arbeitszeit). Diese sind Tabellen-Layouts, kein Property-Editor — also nicht über PGObjBaseViewer wrapbar. Wir bauen einen wiederverwendbaren `<MatrixTable>`-Helper, der die drei Viewer als dünne Spezialisierungen darstellt.

Phase-1-Scope: Anzeige + Edit-on-Click. Sortierung/Filterung/Spalten-Resize → Phase 4-Backlog.

Purpose: SC-4 (4 von 12 = 3 Matrix + 1 catch-all-Mehrfach-Hint) wird hier ergänzt. Nach diesem Plan: 11/12 Viewer fertig — nur PDurchlaufplanViewerDesign fehlt (Plan 10).

Output: 3 Viewer-Files + 1 shared matrix-common.tsx + 2 Tests. setup.ts aktualisiert.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/phases/01-vertical-slice/01-06-oviewer-core-octrl-family-PLAN.md
@.planning/phases/01-vertical-slice/01-07-property-schema-store-sidebar-workspace-PLAN.md
@.planning/phases/01-vertical-slice/01-08-viewers-property-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 06+07+08 -->
```typescript
// portal/src/viewers/core/types.ts
export interface ViewerProps {...}  // siehe Plan 06

// portal/src/components/ui/table.tsx (Plan 06)
export { Table, TableHeader, TableBody, TableRow, TableCell, TableHead }

// portal/src/components/ui/input.tsx (Plan 03)
export const Input

// portal/src/viewers/core/octrl/OCtrlVariable.tsx, OCtrlEnum.tsx (Plan 06)
// — können als Cell-Editoren wiederverwendet werden

// portal/src/stores/model-store.ts (Plan 07)
useModelStore.getState().patchObject(oid, patch)
useModelStore.getState().createObject(klass, attrs)

// portal/src/viewers/core/ViewerRegistry.ts (Plan 06)
export const viewerRegistry
```

<!-- C++-Header-Konzeptquellen -->
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessBelegMatrixViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessMengeMatrixViewer.h
- C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessVerknuepfungViewer.h
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: matrix-common.tsx — Wiederverwendbarer MatrixTable-Component</name>
  <files>portal/src/viewers/PRess/matrix-common.tsx</files>
  <read_first>
    - portal/src/components/ui/table.tsx (aus Plan 06)
    - portal/src/components/ui/input.tsx (aus Plan 03)
    - portal/src/viewers/core/types.ts (Plan 06)
    - portal/src/viewers/core/octrl/OCtrlVariable.tsx, OCtrlEnum.tsx (Plan 06)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\pages\tree-builder\editable-cell.tsx (Inspiration für Click-to-Edit-Pattern)
  </read_first>
  <behavior>
    - `<MatrixTable<TRow> rows={...} columns={[...]} onCellEdit={...} />` rendert eine Tabelle mit dynamischen Spalten und edit-on-click Cells.
    - Column-Def: `{key, label, octrl_type, value_type?, enum_values?, readonly?, width?}`
    - Cell-Render: für jede {row, col}-Kombination ein "view" String. Beim Click → Switch zu Input/Select-Edit-Mode. Blur/Enter → onCellEdit(row, col.key, newValue). Escape → cancel.
    - Sticky-Header (CSS-only).
    - Empty-State wenn rows.length === 0: zeige Hint "Keine Einträge".
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PRess/matrix-common.tsx`:
    - Typen:
      - `interface MatrixColumn<TRow> { key: string; label: string; octrl_type: "Variable" | "Enum" | "Bool"; value_type?: "string" | "int" | "float"; enum_values?: {value: number; label_de: string}[]; readonly?: boolean; width?: string; accessor?: (row: TRow) => unknown; }`
      - `interface MatrixTableProps<TRow> { rows: TRow[]; columns: MatrixColumn<TRow>[]; rowKey: (row: TRow) => string; onCellEdit?: (row: TRow, columnKey: string, newValue: unknown) => void; disabled?: boolean; emptyMessage?: string; }`
    - Component:
      ```jsx
      export function MatrixTable<TRow>({rows, columns, rowKey, onCellEdit, disabled, emptyMessage = "Keine Einträge"}: MatrixTableProps<TRow>) {
        const [editing, setEditing] = useState<{rowKey: string; columnKey: string} | null>(null);
        if (!rows.length) return <div className="p-8 text-center text-muted-foreground">{emptyMessage}</div>;
        return (
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>{columns.map(c => <TableHead key={c.key} style={{width: c.width}}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const rk = rowKey(row);
                return (
                  <TableRow key={rk}>
                    {columns.map(c => {
                      const val = c.accessor ? c.accessor(row) : (row as any)[c.key];
                      const isEditing = editing?.rowKey === rk && editing?.columnKey === c.key;
                      if (isEditing && !c.readonly && !disabled) {
                        // render Edit-Input basierend auf c.octrl_type
                        return <TableCell key={c.key}>{renderEditCell(val, c, (v) => { onCellEdit?.(row, c.key, v); setEditing(null); }, () => setEditing(null))}</TableCell>;
                      }
                      return <TableCell key={c.key} onClick={() => !c.readonly && !disabled && setEditing({rowKey: rk, columnKey: c.key})} className={c.readonly ? "" : "cursor-pointer hover:bg-accent"}>{formatCell(val, c)}</TableCell>;
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        );
      }
      ```
    - Helper `renderEditCell(val, col, onCommit, onCancel)`: returnt Input/Select mit Auto-Focus, Enter/Blur → onCommit, Escape → onCancel.
    - Helper `formatCell(val, col)`: für Enum → Lookup label_de aus enum_values; für Bool → ✓/✗; sonst String(val).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    matrix-common.tsx exportiert MatrixTable<TRow> + MatrixColumn<TRow>. Click-to-Edit funktioniert. Sticky-Header. Empty-State.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PRessBelegMatrixViewer + Test</name>
  <files>portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx, portal/src/viewers/__tests__/PRessBelegMatrixViewer.spec.tsx</files>
  <read_first>
    - portal/src/viewers/PRess/matrix-common.tsx (aus Task 1)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessBelegMatrixViewer.h
    - app/static/schemas/v1/schemas.json (Plan 07 — PRessBeleg-Schema)
  </read_first>
  <behavior>
    - PRessBelegMatrixViewer rendert eine MatrixTable. Zeilen sind ALLE PRessBeleg-Objekte aus allObjects. Spalten: Name, Kapazität, Einheit, Kostensatz, Bemerkung.
    - Hinweis im UI-Header: "Belegungsressourcen-Matrix — N Einträge".
    - Click auf eine Zelle → Edit-Input. Save → onChange wird DIREKT auf modelStore.patchObject(row.oid, {key: val}) gerufen (NICHT über props.onChange — weil PRessBelegMatrixViewer mehrere Objekte editiert, nicht nur das eine in props.obj).
    - "Neuer PRessBeleg"-Button im Footer → modelStore.createObject("PRessBeleg", {m_sName: "Neue Ressource", m_iKapazität: 1}).
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx`:
    - Imports: ViewerProps + OBaseObj aus types; MatrixTable aus matrix-common; Button; useModelStore aus stores.
    - `export function PRessBelegMatrixViewer({obj, schema, allObjects, disabled}: ViewerProps)`:
      - Filtere allObjects → ressourcen = Object.values(allObjects).filter(o => o.klass === "PRessBeleg")
      - Columns-Def basierend auf Schema (oder hardcoded für Phase-1-MVP):
        - {key: "m_sName", label: "Name", octrl_type: "Variable", value_type: "string", width: "200px"}
        - {key: "m_iKapazität", label: "Kapazität", octrl_type: "Variable", value_type: "int"}
        - {key: "m_sEinheit", label: "Einheit", octrl_type: "Variable", value_type: "string"}
        - {key: "m_dKostensatz", label: "Kostensatz €", octrl_type: "Variable", value_type: "float"}
        - {key: "m_sBemerkung", label: "Bemerkung", octrl_type: "Variable", value_type: "string"}
        - jede Spalte hat accessor: row => row.attrs[col.key]
      - onCellEdit: (row, columnKey, newValue) => useModelStore.getState().patchObject(row.oid, {[columnKey]: newValue})
      - Render:
        ```jsx
        <ChildDialog title={`Belegungsressourcen — ${ressourcen.length} Einträge`} footer={<Button onClick={() => useModelStore.getState().createObject("PRessBeleg", {m_sName: "Neue Belegungsressource"})}>+ Neu</Button>}>
          <MatrixTable rows={ressourcen} columns={columns} rowKey={r => `oid:${r.oid}`} onCellEdit={onCellEdit} disabled={disabled} emptyMessage="Keine Belegungsressourcen vorhanden" />
        </ChildDialog>
        ```

    Erstelle `portal/src/viewers/__tests__/PRessBelegMatrixViewer.spec.tsx`:
    - Test "rendert Tabelle mit Ressourcen": Mock allObjects mit 3 PRessBeleg-Objekten → assert 3 Rows + Header-Cells.
    - Test "Click auf Zelle öffnet Input": userEvent.click auf Kapazität-Cell → assert Input vorhanden.
    - Test "Edit + Blur ruft patchObject": Mock useModelStore.patchObject; click → type "99" → Tab → assert patchObject(oid, {m_iKapazität: 99}) wurde gerufen.
    - Hinweis: useModelStore-Mock via vi.mock("@/stores/model-store", () => ({useModelStore: { getState: vi.fn(() => ({patchObject: vi.fn(), createObject: vi.fn()}))}}))
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- PRessBeleg 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    PRessBelegMatrixViewer existiert. 3 Tests grün. Click-to-Edit + Footer-Button funktionieren.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: PRessMengeMatrixViewer (analog zu PRessBeleg)</name>
  <files>portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx</files>
  <read_first>
    - portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx (aus Task 2 — Vorlage)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessMengeMatrixViewer.h
    - app/static/schemas/v1/schemas.json (PRessMenge-Schema)
  </read_first>
  <behavior>
    - Analog zu PRessBeleg. Spalten: Name, Menge, Einheit, NachschubMenge, NachschubIntervall, Bemerkung.
    - "Neu"-Button erzeugt PRessMenge-Object.
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx` als Kopie von PRessBeleg mit angepassten Columns + Klassen-Name. Wenn die Logik 1:1 identisch ist (modulo columns + klass): refactore zu einem generic `<RessourceMatrix klass="PRessBeleg" columns={...} />` und beide Files sind ~5-Zeilen-Wrap. Empfehlung: Refactor wenn Code wirklich identisch.

    KEIN Test (Coverage via PRessBeleg-Test).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    PRessMengeMatrixViewer existiert. tsc grün.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: PRessVerknuepfungViewer (2D-Matrix Ressource × Knoten) + Test</name>
  <files>portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx, portal/src/viewers/__tests__/PRessVerknuepfungViewer.spec.tsx</files>
  <read_first>
    - portal/src/viewers/PRess/matrix-common.tsx (aus Task 1)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PRessVerknuepfungViewer.h
    - app/static/schemas/v1/schemas.json (PRessVerknüpfung-Schema)
  </read_first>
  <behavior>
    - PRessVerknuepfungViewer zeigt 2D-Matrix: Zeilen = Belegungsressourcen, Spalten = Knoten (dynamisch ermittelt aus allObjects). Zellen = Anteil (float 0-1; leer wenn keine Verknüpfung).
    - Click in leere Zelle: erzeugt neue PRessVerknüpfung mit (Knoten=col, Ressource=row, Anteil=1.0).
    - Click in gefüllte Zelle: editiert Anteil. Anteil=0 → löscht Verknüpfung.
    - Header-Spalten: Knoten-Namen mit Tooltip (oid + klass).
  </behavior>
  <action>
    Erstelle `portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx`:
    - Imports wie Task 2 + zusätzlich Hilfsfunktionen
    - Zustand:
      - ressourcen = filter allObjects für PRessBeleg
      - knoten = filter allObjects für PDpKn* (verschiedene Knoten-Klassen) — Helper `isKnotenKlass(klass)`: returnt true für PDpKnKonstant, PDpKnAlternativ, etc.
      - verknüpfungen = filter allObjects für PRessVerknüpfung
      - lookup-Map: `verknMap = new Map<string, OBaseObj>()` mit key `${ressOid}:${knotenOid}` → Verknüpfung-Object
    - DYNAMISCHE Columns: erste Spalte = "Ressource" (sticky-left, zeigt row.attrs.m_sName), dann je Knoten eine Spalte mit knoten.attrs.m_sName als Label.
    - Cell-Accessor pro Knoten-Spalte: `row => verknMap.get(`${row.oid}:${knotenOid}`)?.attrs.m_iAnteil ?? null`
    - onCellEdit: 
      - if (val === null || val === 0) → if verknüpfung existiert, useModelStore.deleteObject(verkn.oid); sonst noop.
      - if (val > 0 && verknüpfung existiert) → patchObject(verkn.oid, {m_iAnteil: val})
      - if (val > 0 && verknüpfung NICHT existiert) → createObject("PRessVerknüpfung", {m_oid_ressource: row.oid, m_oid_knoten: colKnotenOid, m_iAnteil: val})
    - Render: ChildDialog + MatrixTable (mit dynamic columns).

    Erstelle `portal/src/viewers/__tests__/PRessVerknuepfungViewer.spec.tsx`:
    - Test "rendert 2D-Matrix": Mock 2 Ressourcen + 3 Knoten + 1 Verknüpfung in allObjects → assert 2 Rows + 4 Header-Cells (Ressource + 3 Knoten); 1 Cell hat Anteil-Wert, andere sind leer.
    - Test "Click in leere Zelle + Eingabe + Tab erzeugt neue Verknüpfung": Mock useModelStore.createObject → click leere Cell → type "0.5" → Tab → assert createObject("PRessVerknüpfung", {m_oid_ressource: 1, m_oid_knoten: 10, m_iAnteil: 0.5}).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run -- PRessVerknuepfung 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    PRessVerknuepfungViewer existiert. 2 Tests grün. 2D-Matrix mit Create-On-Empty-Click + Delete-On-Zero-Anteil funktioniert.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: setup.ts aktualisieren — Matrix-Viewer registrieren</name>
  <files>portal/src/viewers/setup.ts</files>
  <read_first>
    - portal/src/viewers/setup.ts (aus Plan 08 — aktueller Stand mit 8 Viewern)
    - alle 3 Matrix-Viewer aus Tasks 2-4
  </read_first>
  <behavior>
    - setup.ts registriert PRessVerknüpfung als default, PRessBeleg/PRessMenge mit hint="matrix" (zusätzlich zur PGObjBase-default).
    - PRessBeleg ohne hint → Fallback PGObjBaseViewer (Property-Editor für Einzelobjekt).
    - PRessBeleg mit hint="matrix" → MatrixViewer.
    - Sidebar-Click auf einen PRessBeleg-Eintrag → PGObjBaseViewer (Standard). Click auf den Gruppen-Knoten "Belegungsressourcen" in Sidebar → wechselt hint zu "matrix" (Logic in Plan 11/refactor — Phase-1-Workaround: ein Tab-Switch im Workspace, oder beide Viewer per Tab nebeneinander).
    - Phase-1-Pragma: nur Sidebar-Click auf Gruppen-Knoten wechselt hint via setViewerHint. Plan 07 ModelTree implementiert das nicht — wir ergänzen es hier oder dokumentieren als bekannten Defizit.
  </behavior>
  <action>
    Erweitere `portal/src/viewers/setup.ts`:
    - Imports der 3 Matrix-Viewer.
    - Register:
      - viewerRegistry.register({klass:"PRessVerknüpfung", Component: PRessVerknuepfungViewer})  // Verknüpfung hat nur Matrix-Variante in Phase 1
      - viewerRegistry.register({klass:"PRessBeleg", hint:"matrix", Component: PRessBelegMatrixViewer})
      - viewerRegistry.register({klass:"PRessMenge", hint:"matrix", Component: PRessMengeMatrixViewer})
    - PRessBeleg/PRessMenge ohne hint → fällt auf Fallback (PGObjBaseViewer).
    - Kommentar im File: "Sidebar-Knoten 'Belegungsressourcen' setzt viewerHint='matrix' (sobald Sidebar das unterstützt, siehe Plan 11 Backlog)."
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5 &amp;&amp; cd portal &amp;&amp; npm run test:run 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    setup.ts hat 10 Registrierungen + 1 Fallback. Gesamte Vitest-Suite grün. 11/12 Viewer registriert (nur PDurchlaufplanDesign fehlt — Plan 10).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cell-Edit ↔ ModelStore.patchObject | Direkter Store-Aufruf statt Props-Drill; Tests müssen Store mocken |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-01 | DoS | PRessVerknüpfungMatrix mit 100×100 Knoten ist langsam | accept | Phase 1: realistische Modelle haben <30 Ressourcen × <50 Knoten = ~1500 Cells; performant; Virtualization in Phase 4 |
| T-09-02 | Tampering | Cell-Edit umgeht Pydantic-Validation | mitigate | Edit dispatcht patchObject; Save zum Backend (Plan 11) validiert via Pydantic; UI bleibt forgiving |
</threat_model>

<verification>
- `cd portal && npx tsc -b --noEmit` grün
- `cd portal && npm run test:run -- PRess` zeigt 5 Tests grün
- Manueller Smoke (mit Backend + Fertigungsstruktur1.otx hochgeladen):
  - /models/{id} → Sidebar-Click auf "Belegungsressourcen" → Workspace zeigt PRessBelegMatrixViewer (sobald Sidebar viewerHint='matrix' setzt — alternative: für Phase 1 click direkt auf eine PRessBeleg in der Liste).
  - Click in eine Kapazität-Zelle → Input erscheint → Edit → Tab → patchObject wurde gerufen.
  - "+ Neu"-Button erzeugt neue Zeile.
</verification>

<success_criteria>
SC-4 (12 konkrete Viewer): 11/12 erfüllt (PDurchlaufplanDesign in Plan 10).
SC-6 (Edit-Operationen): VOLLSTÄNDIG für Matrix-Edit (create/edit/delete von Verknüpfungen).
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-09-SUMMARY.md` with:
- Matrix-Pattern (MatrixTable + 3 Spezialisierungen)
- Bekannter Defizit: Sidebar setzt viewerHint='matrix' noch nicht automatisch (Plan 11 Backlog)
- Performance-Annahme: <1500 Cells; Virtualization in Phase 4
- Was Plan 10 noch macht: PDurchlaufplanViewerDesign (12/12 Viewer komplett)
</output>
</content>
</invoke>