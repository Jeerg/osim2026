---
phase: 01-live-viewer-bridge
plan: 09
subsystem: frontend
tags: [tanstack-router, tanstack-query, live-stream, navigation, polling, gap-closure, a11y, 3fls]

# Dependency graph
requires:
  - phase: 01-08
    provides: "POST /api/v1/models/{id}/runs, GET /runs/{id}/stream?offset=, GET /runs/{id}/meta; ReadFn-Vertrag {text, next_offset}"
  - phase: 01-02
    provides: "injizierbare ReadFn + createTailReader (Byte-Offset, Carry-Puffer); /live-Route mit 200ms-Tail + 30Hz-Coalescing"
  - phase: 01-05
    provides: "StreamRouter (Tag-Multiplex, Gantt/KPI/RecordTable/Banner) + Live-Stream-Store (ingest/reset/setMeta)"
provides:
  - "osim-ui/portal/src/api/runs.ts — startRun + buildStreamReadFn (snake->camel-Mapping) + fetchRunMeta gegen die 01-08-Endpoints"
  - "Topbar-Navigation: zentriertes <nav data-testid=topbar-nav> mit TanStack-Links Live (nav-link-live) + Bibliothek (nav-link-models)"
  - "/live mit Modell-Picker (live-model-select) + Lauf-Start (live-start-run) + run_id-Exposition (live-active-run-id); noopRead durch echte HTTP-ReadFn ersetzt"
affects: [01-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ReadFn aus run_id ableiten via useMemo (runId===null -> noopRead, sonst buildStreamReadFn) — Tail-Tick re-initialisiert nur bei Run-Wechsel"
    - "Store-Reset bei Run-(Re-)Start gegen Frame-Vermischung (T-LIVE-FE-03, Reproduzierbarkeitsvertrag)"
    - "Aktiv-Markierung via TanStack activeProps mit font-weight + Unterstrich (nicht nur Farbe, A11y) + Token-Focus-Ring"
    - "Test-Override-Props (read/meta) bleiben erhalten, werden im Normalbetrieb vom internen Run-State überschrieben"

key-files:
  created:
    - osim-ui/portal/src/api/runs.ts
    - osim-ui/portal/src/features/live-stream/__tests__/runs-api.spec.ts
  modified:
    - osim-ui/portal/src/components/AuthenticatedLayout.tsx
    - osim-ui/portal/src/routes/_authenticated/live.tsx

key-decisions:
  - "01-09: Modell-Picker als natives <select> (nicht Radix-Select) — robusteres E2E + native A11y, token-gestylt, data-testid live-model-select + Option live-model-option-<id>"
  - "01-09: KEIN E2E--Prefix-Filter im /live-Picker (anders als models/index.tsx) — der 01-10-E2E braucht sein Modell sichtbar"
  - "01-09: read als useMemo(readOverride ?? (runId===null ? noopRead : buildStreamReadFn(runId))) — Test-Override gewinnt, sonst run-getrieben"
  - "01-09: meta-Read ist best-effort (try/catch + console.warn) — der Stream läuft auch ohne meta.json weiter; coverage_ratio<1 wird als Hinweis gesurfaced, nicht versteckt"

requirements-completed: [O-3, O-4, AC-3, AC-4]

# Metrics
duration: 4min
completed: 2026-05-29
---

# Phase 01 Plan 09: Frontend-Wiring + Navigation Summary

**`/live` ist nicht mehr verwaist: ein zentriertes Topbar-`<nav>` führt von jeder authentifizierten Seite zu `/live`, dort wählt der User ein gespeichertes Modell, startet per „Lauf starten" einen realen Lauf gegen die 01-08-Endpoints und sieht live Gantt+KPI — `noopRead` ist nur noch der run-lose Default, im Lauf pollt eine echte HTTP-ReadFn `GET /runs/{id}/stream`.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-29T11:05:46Z
- **Completed:** 2026-05-29T11:09:32Z
- **Tasks:** 2 (autonomous)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **GAP-1 Navigation:** In `AuthenticatedLayout.tsx` ein NEUES, drittes Flex-Kind zwischen Wordmark (links) und die 3FLS-gelockte Rechts-Gruppe (Logo + User-Pill, UNVERÄNDERT) eingefügt — ein zentriertes `<nav data-testid="topbar-nav">` mit TanStack-`<Link to="/live">` („Live", `nav-link-live`) + `<Link to="/models">` („Bibliothek", `nav-link-models`). Aktiv-Markierung über `activeProps` (font-semibold + Unterstrich — nicht nur Farbe, A11y), weiße Schrift auf dem Gradient, Token-Focus-Ring (`focus-visible:ring-ring`), tokens-only (keine ad-hoc Hex).
- **runs-API-Client** (`api/runs.ts`): `startRun(modelId)` (POST), `buildStreamReadFn(runId)` (mapped `next_offset`→`nextOffset` auf die tail-reader-ReadFn-Signatur, baut `?offset=`-URL), `fetchRunMeta(runId)`. Wire-Type-Mirrors `StartRunResponse` + `StreamChunk`.
- **GAP-4 /live wiring:** Run-Setup über den Tabs — `useModels()`-Picker, „Lauf starten"-Button → `startRun` → `setRunId` → `fetchRunMeta` → Store-Reset → ReadFn = `buildStreamReadFn(runId)`. `noopRead` bleibt nur der run-lose Default. coverage_ratio<1 als Hinweis gesurfaced.

## Task Commits

1. **Task 1: Topbar-Nav + runs-API-Client (GAP-1)** — `aaa6d9a` (feat)
2. **Task 2: /live wiring — Picker + Lauf-Start + HTTP-ReadFn (GAP-4)** — `88d910c` (feat)

**Plan metadata:** (dieser Commit) (docs: complete plan)

## Files Created/Modified

- `osim-ui/portal/src/api/runs.ts` (created) — startRun + buildStreamReadFn + fetchRunMeta; snake→camel-Mapping der ReadFn.
- `osim-ui/portal/src/features/live-stream/__tests__/runs-api.spec.ts` (created) — 5 Tests (POST-URL, Stream-URL mit Offset, snake→camel-Mapping inkl. kein next_offset-Leak, meta).
- `osim-ui/portal/src/components/AuthenticatedLayout.tsx` (modified) — neues mittleres `<nav>`; linke Wordmark + rechte 3FLS-Gruppe unverändert.
- `osim-ui/portal/src/routes/_authenticated/live.tsx` (modified) — Run-Setup-Bereich, run-getriebene ReadFn (useMemo), Store-Reset bei Run-Wechsel, meta-Nachladen, coverage-Hinweis.

## data-testids für 01-10 (E2E)

| testid | Element | Zweck |
|--------|---------|-------|
| `topbar-nav` | `<nav>` | Container der Topbar-Navigation |
| `nav-link-live` | `<Link to="/live">` | Navigation zu /live (O-3) |
| `nav-link-models` | `<Link to="/models">` | Navigation zur Bibliothek |
| `live-model-select` | natives `<select>` | Modell-Auswahl |
| `live-model-option-<id>` | `<option>` | je Modell-Option (id = ModelMeta.id) |
| `live-start-run` | `<Button>` | „Lauf starten" |
| `live-active-run-id` | `<span>` | trägt den vom Backend vergebenen run_id-String, sobald gesetzt |
| `live-coverage-hint` | `<p role=status>` | nur bei coverage_ratio<1 (partielles Modell) |

(Bestehend, unverändert: `live-tab-*`, `gantt-panel`, `kpi-grid`, `record-table`, `stream-router-<tag>`, `live-gap-banner`.)

## Decisions Made

Siehe `key-decisions` im Frontmatter. Kernpunkte: natives `<select>` statt Radix (E2E-Robustheit + native A11y), kein E2E--Filter im /live-Picker (der E2E braucht sein Modell), run-getriebene ReadFn via useMemo mit Test-Override-Vorrang, best-effort meta-Read.

## Deviations from Plan

None — Plan wurde exakt wie geschrieben ausgeführt. Die in `<files_modified>` gelistete `runs-api.spec.ts` wurde wie spezifiziert erstellt; alle vier `must_haves.truths` sind erfüllt.

## Known Stubs

Keine. `noopRead` bleibt bewusst als run-loser Default-Pfad bestehen (vom Plan vorgeschrieben: „noopRead ist nur noch der run-lose Default") — kein Stub, sondern definiertes Degradationsverhalten, solange kein Lauf gewählt ist. Sobald ein Lauf gestartet ist, läuft die echte HTTP-ReadFn.

## Verification

- `npm run test:run -- src/features/live-stream` → **34 Tests grün** (29 bestehende + 5 neue runs-api-Tests), 7 Test-Files.
- `npx eslint` der drei berührten Code-Dateien → **0 errors**. `live.tsx` hat 1 `react-refresh/only-export-components`-WARNING (Route+Component im selben File) — pre-existing TanStack-File-Route-Pattern in JEDER Route-Datei, nicht durch 01-09 eingeführt, nicht gating.
- `npx tsc --noEmit` → **0 Fehler** in allen drei berührten Dateien (`live.tsx`, `runs.ts`, `AuthenticatedLayout.tsx`).
- Repo-weiter Lint-Stand (~77 Fremd-Fehler) bewusst NICHT angefasst (Plan-Vorgabe).

## Threat Surface

Keine neuen Trust-Boundaries gegenüber dem Plan-`<threat_model>`: die ReadFn pollt nur den von `startRun` erhaltenen run_id (T-LIVE-FE-01, AuthZ serverseitig, apiFetch hängt Firebase-Token an); Store-Reset + Offset-Reset bei Run-Wechsel adressieren T-LIVE-FE-03 (keine Frame-Vermischung, keine UI-seitige Reorder — Reproduzierbarkeitsvertrag); keine neuen npm-Installs (T-LIVE-FE-SC).

## Next Phase Readiness

01-10 (E2E) kann gegen die oben dokumentierten data-testids bauen: Nav-Link „Live" → /live → `live-model-select` (E2E-Modell sichtbar) → `live-start-run` → run_id aus `live-active-run-id` lesen → Gantt-Balken erscheinen aus dem realen Stream.

## Self-Check: PASSED

- `osim-ui/portal/src/api/runs.ts` — FOUND.
- `osim-ui/portal/src/features/live-stream/__tests__/runs-api.spec.ts` — FOUND.
- Commit `aaa6d9a` (Task 1) — FOUND.
- Commit `88d910c` (Task 2) — FOUND.
- 34/34 live-stream-Tests grün; 3 touched files lint- (0 errors) + tsc-clean.

---
*Phase: 01-live-viewer-bridge*
*Completed: 2026-05-29*
