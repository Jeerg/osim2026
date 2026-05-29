---
phase: 01-live-viewer-bridge
plan: 05
type: execute
wave: 3
depends_on: ["01-02", "01-03", "01-04"]
files_modified:
  - osim-ui/portal/src/features/live-stream/components/KpiTile.tsx
  - osim-ui/portal/src/features/live-stream/components/RecordTable.tsx
  - osim-ui/portal/src/features/live-stream/stream-router.tsx
  - osim-ui/portal/src/features/live-stream/components/PartialBanner.tsx
  - osim-ui/portal/src/features/live-stream/__tests__/KpiTile.spec.tsx
  - osim-ui/portal/src/features/live-stream/__tests__/RecordTable.spec.tsx
  - osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx
autonomous: true
requirements: [O-3, AC-4, AC-7]
must_haves:
  truths:
    - "Die UI rendert KPI-Werte aus dem kpi_auswertung-Stream als KpiTile mit Trend (Periode N gegen N-1)"
    - "Die UI rendert reporting_record-Details als virtualisierte, filter-/sortierbare RecordTable"
    - "Der stream-router multiplext anhand des Stream-Tags auf die passende Render-Komponente (GanttRow/KpiTile/RecordTable)"
    - "Ein partial markierter Stream zeigt ein Banner; ein schema_version-Mismatch zeigt ein gelbes Warn-Banner statt Crash (best-effort)"
  artifacts:
    - path: "osim-ui/portal/src/features/live-stream/components/KpiTile.tsx"
      provides: "Card mit KPI-Zahl + Trend gegen Vorperiode"
      contains: "KpiTile"
    - path: "osim-ui/portal/src/features/live-stream/components/RecordTable.tsx"
      provides: "Virtualisierte Tabelle (@tanstack/react-table) mit Filter/Sort"
      contains: "RecordTable"
    - path: "osim-ui/portal/src/features/live-stream/stream-router.tsx"
      provides: "Stream-Tag → Render-Komponente Multiplexer"
      contains: "stream-router|StreamRouter"
    - path: "osim-ui/portal/src/features/live-stream/components/PartialBanner.tsx"
      provides: "Banner für partial-Streams + schema-mismatch (best-effort, gelb)"
      contains: "Banner"
  key_links:
    - from: "features/live-stream/stream-router.tsx"
      to: "features/live-stream/components/KpiTile.tsx"
      via: "Routing nach Stream-Tag"
      pattern: "KpiTile"
    - from: "features/live-stream/components/PartialBanner.tsx"
      to: "features/live-stream/store.ts"
      via: "liest meta.streams-Status + schema_version"
      pattern: "store|useLiveStreamStore"
---

<objective>
UI-Render-Komplettierung: KpiTile (Card + Trend), RecordTable (virtualisiert, Filter/Sort), der stream-router (Tag→Komponente) und die Banner für partial-Streams + schema-mismatch. Damit ist O-3 (3 Render-Komponenten + Tag-Aktivierung) erfüllt und der best-effort-Schema-Mismatch-Pfad (D-OP-4, AC-7) verankert.

Purpose: O-3, AC-4 (Stream-Isolation über stream-router), AC-7 (schema_version-Mismatch → Warnung statt Crash).
Output: KpiTile, RecordTable, stream-router, PartialBanner + Specs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-02-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-03-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-04-SUMMARY.md
@./osim-ui/CLAUDE.md

<interfaces>
<!-- Store-API + GanttRow-Props: aus 01-02-SUMMARY.md (useLiveStreamStore, selectActiveFrames, setMeta). -->
<!-- 11 KPI-kind-Diskriminatoren + v-Felder: aus 01-03-SUMMARY.md. -->
<!-- meta.streams-Status-Block (Tag→status/missing_slices/reason): aus 01-04-SUMMARY.md. -->
<!-- shadcn UI-Primitives vorhanden: components/ui/{table,tabs,tooltip,sonner}.tsx. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: KpiTile (Card + Periode-N/N-1-Trend) + stream-router</name>
  <files>osim-ui/portal/src/features/live-stream/components/KpiTile.tsx, osim-ui/portal/src/features/live-stream/stream-router.tsx, osim-ui/portal/src/features/live-stream/__tests__/KpiTile.spec.tsx, osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx</files>
  <read_first>
    - .planning/phases/01-live-viewer-bridge/01-03-SUMMARY.md (11 kind-Diskriminatoren + v-Felder)
    - .planning/phases/01-live-viewer-bridge/01-02-SUMMARY.md (Store-API + GanttRow-Props)
    - osim-ui/portal/src/components/ui/tabs.tsx, osim-ui/portal/src/components/ui/tooltip.tsx (shadcn-Primitives)
    - osim-ui/CLAUDE.md + docs/3FLS-EAM-STYLE-GUIDE.md (Blau-Primary #1E4F9C, Tokens, KEINE ad-hoc Hex, Status nie nur via Farbe — A11y)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.3 (KpiTile = Card mit Zahl + Trend), §8.3
  </read_first>
  <action>
    `KpiTile.tsx`: shadcn-Card mit Titel (kind), aktuellem Zahlenwert (ein Feld aus dem snapshot, z.B. count_gesamt oder durchlaufzeit_avg) und Trend-Indikator (Periode N vs. N-1 — ↑/↓/→ plus prozentuale/absolute Differenz; Trend nie NUR über Farbe — A11y, zusätzliches Icon/Text). Props: `kind`, `current` (Frame.v der aktuellen Periode), `previous` (Frame.v der Vorperiode | undefined). Tokens-only-Styling.
    `stream-router.tsx`: `StreamRouter`-Komponente, die anhand des aktiven Stream-Tags auf GanttRow (gantt_durchlauf/gantt_einsatz/gantt_schicht), KpiTile-Grid (kpi_auswertung — eine Kachel pro kind) oder RecordTable (reporting_record) multiplext; lifecycle als einfache Status-Liste. Liest die Frames über den Store-Selector aus 01-02.
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/KpiTile.spec.tsx src/features/live-stream/__tests__/stream-router.spec.tsx && npm run lint</automated>
  </verify>
  <acceptance_criteria>
    - KpiTile-Test: current count_gesamt=12, previous=10 → Komponente zeigt "12" und einen Aufwärts-Trend-Indikator (Icon/Text, nicht nur Farbe).
    - stream-router-Test: bei aktivem Tag "kpi_auswertung" rendert StreamRouter KpiTile(s); bei "reporting_record" rendert er RecordTable; bei "gantt_durchlauf" GanttRow (AC-4 Multiplex über genau einen Stream).
    - `npm run lint` grün (keine ad-hoc-Hex/Token-Verstöße).
  </acceptance_criteria>
  <done>KpiTile + stream-router rendern Tag-korrekt, Tests + Lint grün.</done>
</task>

<task type="auto">
  <name>Task 2: RecordTable (virtualisiert, Filter/Sort) + PartialBanner / Schema-Mismatch-Banner</name>
  <files>osim-ui/portal/src/features/live-stream/components/RecordTable.tsx, osim-ui/portal/src/features/live-stream/components/PartialBanner.tsx, osim-ui/portal/src/features/live-stream/__tests__/RecordTable.spec.tsx</files>
  <read_first>
    - .planning/phases/01-live-viewer-bridge/01-04-SUMMARY.md (meta.streams-Status-Block + reporting_record partial-Felder)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.3 (reporting_record-Frame: auftrag_id/art/menge/start/ende_ist/ende_soll/verspaetung/prozesse[]), §8.3 (RecordTable virtualisiert mit Filter/Sort), §6.4 (schema_version), §9 AC-7
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.3 (RecordTable via @tanstack/react-table), D-OP-4 (schema-mismatch best-effort + gelbes Banner, NICHT hard-block), D-2.2 (partial-Banner pro Stream)
    - osim-ui/portal/src/components/ui/table.tsx (shadcn-Table-Primitive)
    - osim-ui/CLAUDE.md + docs/3FLS-EAM-STYLE-GUIDE.md (Tokens, A11y, gelbe Warnung über Token, nicht ad-hoc)
  </read_first>
  <action>
    `RecordTable.tsx`: virtualisierte Tabelle über `@tanstack/react-table` (D-4.3) für reporting_record-Frames. Spalten aus den §6.3-Feldern (auftrag_id, art, menge, start, ende_ist, ende_soll, verspaetung). Spalten-Sortierung + Text-Filter. Falls `@tanstack/react-table` noch nicht in package.json ist, ergänze es (Package-Legitimacy: etablierte TanStack-Lib, bereits genutzt im Stack — siehe Threat-Model T-01-SC). Virtualisierung über die Tabellenhöhe (windowing) für große Record-Listen.
    `PartialBanner.tsx`: liest aus dem Store (a) `meta.streams[tag].status` → bei `partial` ein neutral-informatives Banner "Stream unvollständig (fehlende Slices: …, Grund: …)"; (b) einen schema_version-Mismatch-Zustand → gelbes Warn-Banner "einige Daten möglicherweise unvollständig" (D-OP-4, best-effort, KEIN Hard-Block/Crash, AC-7). Beide Banner über Tokens gestylt, Status nie nur über Farbe (Icon + Text).
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/RecordTable.spec.tsx && npm run lint</automated>
  </verify>
  <acceptance_criteria>
    - RecordTable-Test: gerendert mit 3 reporting_record-Frames zeigt 3 Zeilen; Sortier-Klick auf eine Spalte ändert die Zeilenreihenfolge; Filter-Eingabe reduziert die sichtbaren Zeilen.
    - PartialBanner-Test (in RecordTable.spec oder eigener describe): bei meta.streams.reporting_record.status="partial" wird ein Banner mit dem reason-Text gerendert.
    - Schema-Mismatch-Test: bei gesetztem Mismatch-Flag rendert PartialBanner ein gelbes Warn-Banner und die App wirft NICHT (kein Crash) — Render läuft durch (AC-7, D-OP-4).
    - `@tanstack/react-table` ist in `osim-ui/portal/package.json` dependencies vorhanden.
    - `npm run lint` grün.
  </acceptance_criteria>
  <done>RecordTable virtualisiert + sortier-/filterbar, Banner für partial + schema-mismatch (best-effort), Tests + Lint grün.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| meta.json (Engine) → UI Banner-Logik | schema_version/streams-Status steuern, ob die UI warnt oder rendert |
| npm install (@tanstack/react-table) | Supply-Chain bei neuer Dependency |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-11 | Denial of Service | schema_version-Mismatch | mitigate | Best-effort-Rendering + gelbes Banner statt Hard-Block/Crash (D-OP-4, AC-7); UI rendert was sie versteht |
| T-01-12 | Denial of Service | große reporting_record-Listen | mitigate | Virtualisierung/Windowing via @tanstack/react-table (D-4.3, §8.3) |
| T-01-SC | Tampering | npm install @tanstack/react-table | accept | Etablierte, weit verbreitete TanStack-Lib (gleiche Org wie der bereits genutzte TanStack-Router); via npmjs.com/package/@tanstack/react-table verifizierbar. Kein [ASSUMED]/[SUS]-Risiko, das einen blockierenden Checkpoint erfordert. |
</threat_model>

<verification>
- O-3: KpiTile + RecordTable + (GanttRow aus 01-02) = 3 Render-Komponenten, Tag-aktiviert via stream-router.
- AC-4: stream-router isoliert einen Stream.
- AC-7: schema-Mismatch → Warnung, kein Crash.
</verification>

<success_criteria>
- `cd osim-ui/portal && npm run test:run -- src/features/live-stream` grün.
- `npm run lint` grün.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-05-SUMMARY.md` when done. Dokumentiere die Komponenten-Props + wie der stream-router pro Tag mappt, damit 01-07 (E2E/Demo) die UI-Erwartungen ansteuern kann.
</output>
