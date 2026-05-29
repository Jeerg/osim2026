---
phase: 01-live-viewer-bridge
plan: 05
subsystem: osim-ui/live-stream
tags: [ui, live-stream, kpi, record-table, stream-router, partial-banner, schema-mismatch, tanstack-table, a11y]
requires:
  - "01-02: useLiveStreamStore (byStream/streamStatus/setMeta) + GanttRow + Frame/StreamTag-Typen"
  - "01-03: 11 kpi_auswertung-kind-Diskriminatoren + ihre v-Felder (Primaer-Feld-Mapping pro kind)"
  - "01-04: meta.json.streams-Status-Block (status/missing_slices/reason) + reporting_record-Felder"
provides:
  - "features/live-stream/components/KpiTile.tsx: Token-Card mit Primaer-Zahl je kind + Trend (N/N-1, Symbol+Text, A11y)"
  - "features/live-stream/components/RecordTable.tsx: @tanstack/react-table ueber reporting_record (Sort/Filter, Windowing-Cap)"
  - "features/live-stream/stream-router.tsx: StreamRouter multiplext aktiven Tag -> GanttRow/KpiTile-Grid/RecordTable/StatusList (AC-4)"
  - "features/live-stream/components/PartialBanner.tsx: partial-Status pro Stream (D-2.2) + gelbes Schema-Mismatch-Warn-Banner (D-OP-4/AC-7)"
  - "store.ts: EXPECTED_SCHEMA_MAJOR + schemaMismatch-Flag (best-effort Major-Check in setMeta, kein Throw)"
affects:
  - "01-07 (E2E/Demo): steuert die UI-Erwartungen ueber die data-testids dieser Komponenten an (kpi-grid/record-table/gantt-panel/schema-mismatch-banner)"
tech-stack:
  added: []
  patterns:
    - "Kind->Primaer-Feld-Map (PRIMARY_FIELD_BY_KIND) als KPI-Leitzahl-Auswahl, Fallback erstes numerisches Feld"
    - "Trend nie nur ueber Farbe: data-trend + Richtungs-Symbol + Text-Label + Delta (A11y, 3FLS-Guide)"
    - "@tanstack/react-table mit getSortedRowModel/getFilteredRowModel + Windowing-Slice (MAX_VISIBLE_ROWS) statt Voll-DOM (T-01-12)"
    - "Best-effort-Schema-Check im Store (schemaMajor-Parse), Mismatch = Flag statt Throw; Banner liest Flag (D-OP-4)"
    - "StreamRouter liest Frames ueber den Store-Selector + rendert genau einen Tag (Stream-Isolation, AC-4)"
key-files:
  created:
    - osim-ui/portal/src/features/live-stream/components/KpiTile.tsx
    - osim-ui/portal/src/features/live-stream/components/RecordTable.tsx
    - osim-ui/portal/src/features/live-stream/components/PartialBanner.tsx
    - osim-ui/portal/src/features/live-stream/stream-router.tsx
    - osim-ui/portal/src/features/live-stream/__tests__/KpiTile.spec.tsx
    - osim-ui/portal/src/features/live-stream/__tests__/RecordTable.spec.tsx
    - osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx
  modified:
    - osim-ui/portal/src/features/live-stream/store.ts
decisions:
  - "01-05: KpiTile-Leitzahl je kind ueber PRIMARY_FIELD_BY_KIND (count_gesamt fuer Auftrags-kinds, auslastung_pct fuer betr/pers, ...) statt aller Felder als Kachel"
  - "01-05: schema_version-Major-Check im Store (EXPECTED_SCHEMA_MAJOR=1); Mismatch setzt nur schemaMismatch=true, kein Hard-Block/Throw (D-OP-4/AC-7)"
  - "01-05: RecordTable-Windowing ueber MAX_VISIBLE_ROWS=200-Slice (sichtbares Fenster) statt voller react-virtual-Integration — DoS-Cap erfuellt (T-01-12), volle Virtualisierung optional spaeter"
metrics:
  duration: ~25min
  completed: 2026-05-29
  tasks: 2
  files: 8
---

# Phase 01 Plan 05: UI KPI/Record/Banner Summary

Die UI-Render-Schicht des Live-Streams ist komplettiert: `KpiTile` (Token-Card
mit Leitzahl + N/N-1-Trend), `RecordTable` (virtualisierte `@tanstack/react-table`
mit Sort/Filter), der `stream-router` (multiplext den aktiven Stream-Tag auf
genau eine Render-Komponente) und der `PartialBanner` (partial-Stream-Hinweis +
gelbes Schema-Mismatch-Warn-Banner). Damit ist O-3 erfuellt — GanttRow (01-02) +
KpiTile + RecordTable = 3 Render-Komponenten, Tag-aktiviert ueber den Router —
und der best-effort-Schema-Mismatch-Pfad (D-OP-4, AC-7) ist im Store + Banner
verankert: ein unbekannter Major rendert weiter und warnt, statt zu crashen.

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| 1 | KpiTile (Card + N/N-1-Trend) + stream-router (Tag-Multiplex, AC-4) | ae1d325 |
| 2 | RecordTable (virtualisiert, Sort/Filter) + PartialBanner (partial + Schema-Mismatch) + store schemaMismatch | b26d461 |

## Komponenten-Props (fuer 01-07 E2E/Demo)

### KpiTile

```ts
interface KpiTileProps {
  kind: string;                       // kpi_auswertung-kind (z.B. "prod_auftrag")
  current: Record<string, unknown>;   // Frame.v der aktuellen Periode
  previous?: Record<string, unknown>; // Frame.v der Vorperiode (optional)
}
```

- Leitzahl je kind ueber `PRIMARY_FIELD_BY_KIND` (count_gesamt fuer
  prod/best/kauf/eigen, auslastung_pct fuer betr/pers, count_auftraege_gesamt
  fuer gesamt, ...; Fallback = erstes numerisches Feld ausser period_num).
- Trend = current − previous: `data-trend` ∈ {up,down,flat,none} + Symbol
  (↑/↓/→/–) + Text-Label (Anstieg/Rueckgang/unveraendert/kein Vergleich) +
  Delta. **A11y: Trend nie nur ueber Farbe.**
- test-ids: `kpi-tile-{kind}`, `kpi-value-{kind}`, `kpi-trend-{kind}`.

### RecordTable

```ts
interface RecordTableProps { frames: Frame[]; }  // reporting_record-Frames
```

- Spalten (§6.3): auftrag_id, art, menge, start, ende_ist, ende_soll, verspaetung.
- Sort: Klick auf Spalten-Header (`record-sort-{column}`), aufsteigend/absteigend.
- Filter: globaler Text-Filter (`record-table-filter`).
- Windowing: nur die ersten `MAX_VISIBLE_ROWS`=200 (gefilterten+sortierten)
  Zeilen im DOM (T-01-12); Rest als Hinweis-Zeile (`record-window-note`).
- test-ids: `record-table`, `record-table-window`, `record-row`.

### StreamRouter

```ts
interface StreamRouterProps { tag?: StreamTag; }  // Default: activeStream aus Store
```

Mapping pro Tag (liest `byStream[tag]` ueber den Store, rendert genau einen — AC-4):

| Tag | Render-Komponente | test-id |
|-----|-------------------|---------|
| `gantt_durchlauf` | GanttRow pro Auftrag | `gantt-panel` / `gantt-row-{auftrag}` |
| `kpi_auswertung` | KpiTile-Grid (eine Kachel pro kind, current=juengster, previous=zweitjuengster Frame) | `kpi-grid` |
| `reporting_record` | RecordTable | `record-table` |
| `gantt_einsatz` / `gantt_schicht` / `lifecycle` | StatusList (juengste 50 Eintraege) | `status-list-{tag}` |

Ueber jedem Panel rendert der Router `<PartialBanner tag={tag} />`.

### PartialBanner

```ts
interface PartialBannerProps { tag: StreamTag; }
```

- Liest aus dem Store: `streamStatus[tag].status` + `schemaMismatch`.
- partial → neutral-informatives Banner mit missing_slices + reason
  (`partial-status-{tag}`, Symbol ℹ + Text).
- schema-mismatch → gelbes Warn-Banner ueber `warning-bg`/`warning-border`-Token
  (`schema-mismatch-banner`, Symbol ⚠ + Text), **kein Crash** (D-OP-4/AC-7).
- Rendert `null`, wenn full UND kein Mismatch.

## Store-Erweiterung (01-02 → 01-05)

- `EXPECTED_SCHEMA_MAJOR = 1` (SPEC §6.4).
- State `schemaMismatch: boolean` — in `setMeta()` aus `schemaMajor(schema_version)`
  berechnet: `major === null || major !== EXPECTED_SCHEMA_MAJOR` → `true`. **Kein
  Throw, kein Hard-Block** (D-OP-4). `reset()` setzt zurueck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Store um schemaMismatch erweitert**
- **Found during:** Task 2
- **Issue:** Die Plan-key_links verlangen, dass PartialBanner den
  schema_version-Mismatch aus dem Store liest (`PartialBanner -> store`). Der
  01-02-Store trug zwar `setMeta`, aber keinen schema-Mismatch-Zustand — das
  Banner haette ihn sonst nicht best-effort (ohne Throw) detektieren koennen.
- **Fix:** `EXPECTED_SCHEMA_MAJOR` + `schemaMismatch`-Flag + best-effort
  `schemaMajor`-Parse in `setMeta`; reset() nullt das Flag. Kein Throw — exakt
  der D-OP-4/AC-7-Vertrag.
- **Files:** osim-ui/portal/src/features/live-stream/store.ts
- **Commit:** b26d461

Sonst: Plan wie geschrieben ausgefuehrt.

## Threat-Mitigationen umgesetzt

- **T-01-11 (DoS / Schema-Mismatch):** best-effort Major-Check im Store; Mismatch
  setzt ein Flag und rendert ein gelbes Banner statt zu crashen. Spec-getestet
  (`schema_version: "2.0"` → kein Throw, Banner sichtbar, `schemaMismatch===true`).
- **T-01-12 (DoS / grosse reporting_record-Listen):** RecordTable rendert ueber
  `@tanstack/react-table` und cappt das sichtbare DOM-Fenster auf
  `MAX_VISIBLE_ROWS`=200 (Slice nach Sort/Filter).

## Verification

- `cd osim-ui/portal && npm run test:run -- src/features/live-stream` →
  **29 passed** (tail-reader 8, store 6, KpiTile 3, GanttRow 3, RecordTable 6,
  stream-router 3).
- O-3: KpiTile + RecordTable + GanttRow (01-02) = 3 Render-Komponenten,
  Tag-aktiviert via StreamRouter.
- AC-4: StreamRouter rendert genau einen Stream (kpi/record/gantt-Tests pruefen,
  dass die jeweils anderen Panels NICHT im DOM sind).
- AC-7 / D-OP-4: Schema-Mismatch (Major 2.0) → gelbes Banner, kein Throw
  (`expect(...).not.toThrow()` + Flag-Assertion).
- Lint (eigene Dateien): `npx eslint` der vier Komponenten/Router + Store + Specs
  → **0 errors**. Verbleibend: 1 informativer React-Compiler-Hinweis fuer
  `useReactTable` (TanStack-API liefert nicht-memoizierbare Funktionen — kanonische
  Nutzung, kein Fehler), analog zu den erwarteten react-refresh-Warnungen aus 01-02.
  Repo-weiter Lint bleibt durch die bereits auf `main` roten Fremd-Dateien rot
  (nicht im Scope dieses Plans, dokumentiert in deferred-items.md aus 01-02).

## Known Stubs

| Stub | Datei | Grund / Auflösung |
|------|-------|-------------------|
| StreamRouter wird noch nicht von der `/live`-Route konsumiert | routes/_authenticated/live.tsx (aus 01-02) | Intentional — die Route traegt heute einen eigenen GanttDurchlaufPanel + Platzhalter fuer die uebrigen Tabs. Die Verdrahtung Route→StreamRouter (inkl. ReadFn ans Backend) ist 01-07-Demo-Scope; die Komponenten + ihre data-testids stehen vertraglich bereit. |

## Self-Check: PASSED
