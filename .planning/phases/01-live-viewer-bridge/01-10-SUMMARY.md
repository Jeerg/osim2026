---
phase: 01-live-viewer-bridge
plan: 10
subsystem: e2e
tags: [playwright, e2e, live-stream, paced-run, gap-closure, deterministic-ids, tail-reader]

# Dependency graph
requires:
  - phase: 01-08
    provides: "POST /api/v1/models/{id}/runs (paced), GET /runs/{id}/stream?offset=; server-default OSIM_RUN_PACE=0.2s; RUN_DIR= früh → wachsender Stream während des Schreibens"
  - phase: 01-09
    provides: "Topbar-Nav (nav-link-live), /live mit live-model-select/live-model-option-<id>/live-start-run/live-active-run-id; HTTP-ReadFn (buildStreamReadFn) ersetzt noopRead im Lauf"
provides:
  - "osim-ui/portal/tests/live-stream.spec.ts — aktive (nicht mehr test.fixme) Playwright-E2E gegen einen realen PACED Run-Flow über die /live-UI; AC-3/AC-4/AC-5 gegen die deterministischen Auftrags-IDs des Laufs"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E fährt einen realen PACED Lauf über die Produktiv-UI (kein Test-Schreibpfad, kein Test-Append-Endpoint) — der paced Stream liefert das Wall-Clock-Fenster für Live-Tail-Assertions"
    - "Deterministische Auftrags-ID aus dem DOM abgreifen (erste gantt-row), statt eine literale ID zu pinnen — vom Lauf SELBST produziert, nicht test-erfunden"
    - "E2E-Modell-Upload via bestehenden Upload-Flow (Dummy.otx, Prefix E2E-live-<ts>), Cleanup via DELETE im finally (T-E2E-01)"

key-files:
  created: []
  modified:
    - osim-ui/portal/tests/live-stream.spec.ts

key-decisions:
  - "01-10: Modell-Weg = Upload (nicht Seed) — jede Spec lädt ihr eigenes E2E-live-<ts>-Modell über den bestehenden Upload-Flow (Dummy.otx, DUMMY_OTX_PATH), exakt das Muster aus modeling-flow.spec.ts; KEIN neuer Test-Code-Pfad, kein Seed-Voraussetzungs-Risiko, Cleanup via DELETE im finally"
  - "01-10: deterministische auftrag_id wird aus der ERSTEN vom Lauf produzierten gantt-row (DOM, data-testid^=gantt-row-) gelesen und AC-5 gegen DIESE asserted — vom Lauf selbst produziert, nicht test-erfunden; gleiches OTX+Seed → gleiche erste Reihe (Reproduzierbarkeitsvertrag)"
  - "01-10: kein append(lines)/ganttFrame()/FA-LIVE-001-Schreibpfad mehr — der paced Lauf (01-08-Default-Pace 0.2s) schreibt absichtlich über ein Wall-Clock-Fenster nach; das Live-Tail liest die nachgewachsenen Bytes über die 01-09-HTTP-ReadFn"
  - "01-10: Live-Playwright-Run ist stack-/UAT-abhängig — die osim-ui-App importiert auf dem Host nicht ohne Dev-Stack (psycopg/uv-sources-Gap, 01-08-SUMMARY); AC-3/AC-5 sind erst gegen den laufenden Stack (3 passed) bewiesen, NICHT gefälscht"

requirements-completed: [AC-3, AC-4, AC-5, O-4]

# Metrics
duration: 8min
completed: 2026-05-29
---

# Phase 01 Plan 10: E2E un-fixme (realer PACED Run) Summary

**Die letzte Gap-Spec `live-stream.spec.ts` ist entpinnt: statt eines test.fixme mit Platzhalter-Schreibpfad treibt sie nun einen REALEN PACED Lauf über die `/live`-UI (Modell hochladen → nav-link-live → live-model-select → live-start-run) und prüft AC-3 (Tail-Pickup < 1s gegen wachsenden Stream), AC-4 (Stream-Filter) und AC-5 (Offset-Restart mid-stream, genau EINE GanttRow pro deterministischer auftrag_id) gegen die vom Lauf selbst produzierten IDs — kein Test-Schreibpfad, keine test-erfundenen Frame-IDs.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-29T11:12:52Z
- **Completed:** 2026-05-29T11:20:00Z
- **Tasks:** 1 (autonomous)
- **Files modified:** 1 (0 created, 1 modified)

## Accomplishments

- **GAP-5 E2E entpinnt:** `test.fixme()` (vormals Z.109) entfernt; die Spec listet jetzt 3 aktive Tests (AC-3/AC-4/AC-5).
- **Platzhalter-/Schreibpfad-Ansatz vollständig ersetzt:** `prepareDemoRun()`-Throw, der `append(lines)`-Vertrag, der `ganttFrame()`-Helper und ALLE test-erfundenen Frame-IDs (`FA-LIVE-001` / `FA-FILTER` / `FA-RESTART-001` + feste seqs) sind entfernt.
- **`startPacedRun(page)`:** lädt ein deterministisches E2E-Modell (Dummy.otx, Name-Prefix `E2E-live-<ts>`) über den bestehenden Upload-Flow hoch, navigiert via `nav-link-live` nach `/live`, wählt das Modell im `live-model-select` und startet per `live-start-run` einen PACED Lauf (01-08-Default-Pace 0.2s); liest die run_id aus `live-active-run-id`.
- **AC-3:** wartet auf das `gantt-panel` (Stream angelaufen), dann muss die erste vom Lauf produzierte `gantt-row-<auftrag>` binnen `TAIL_PICKUP_BUDGET_MS` (1000ms) sichtbar werden — der Tail holt neue Frames vom NOCH SCHREIBENDEN Prozess (paced).
- **AC-4:** Tab-Wechsel `gantt_durchlauf` ↔ `kpi_auswertung` isoliert genau einen Stream (`stream-router-<tag>` sichtbar; `kpi-grid`/`gantt-panel` des anderen Tags `toHaveCount(0)`).
- **AC-5:** liest die erste vom Lauf produzierte `gantt-row`-data-testid aus dem DOM, `page.reload()` WÄHREND der paced Lauf weiterschreibt, und assertet `toHaveCount(1)` für GENAU DIESE deterministische auftrag_id — kein doppeltes Aufnehmen der vor dem Reload gelesenen Frames (Offset-Restart gegen einen LEBENDEN Stream).
- **Cleanup:** jede Spec löscht ihr E2E-Modell via `DELETE /api/v1/models/{id}` im finally (T-E2E-01; `models/index.tsx` filtert `E2E-`-Modelle ohnehin aus der Prod-Liste).

## Task Commits

1. **Task 1: E2E live-stream entpinnt — realer PACED Run über /live-UI** — `69c56b2` (test)

**Plan metadata:** (dieser Commit) (docs: complete plan)

## Files Created/Modified

- `osim-ui/portal/tests/live-stream.spec.ts` (modified) — komplett umgebaut: Header-Doku auf „aktiv; setzt Dev-Stack voraus; treibt PACED Run; assertet gegen deterministische Lauf-IDs (kein Test-Schreibpfad)" aktualisiert; `startPacedRun()` + `cleanupModel()` neu; 3 Test-Bodies AC-3/AC-4/AC-5 gegen den realen Stream.

## Gewählter Modell-Weg + deterministische Auftrags-IDs (Plan-Vorgabe dokumentieren)

- **Modell-Weg = Upload (nicht Seed).** Begründung: der bestehende Upload-Flow aus `e2e/modeling-flow.spec.ts` (`DUMMY_OTX_PATH` + `#upload-otx-file`/`#upload-otx-name`/„Hochladen") ist bereits vorhanden und erprobt; ein Seed-Modell vorauszusetzen würde eine neue Dev-up-Abhängigkeit und Annahmen über die Seed-Bibliothek einführen. Der Upload-Weg braucht damit am wenigsten neuen Code und hält die Bibliothek sauber (Prefix `E2E-live-<ts>`, Cleanup via DELETE).
- **Deterministische auftrag_id-Werte:** Die `auftrag_id`-Werte sind durch das hochgeladene OTX (Dummy.otx) + den festen Seed + die feste Perioden-/Pace-Konfiguration eindeutig bestimmt (Reproduzierbarkeitsvertrag, osim-ui/CLAUDE.md §3; demo_stream_run.py erzeugt im synthetischen Aufbau `FA-<periode>-<lauf>`, z.B. `FA-00-000`). Da die konkreten IDs vom OTX-Inhalt abhängen und hier nicht literal gepinnt werden (Dummy.otx-Auslöser-Namen sind nicht in den 01-08/01-09-Verträgen dokumentiert), liest der Test die ERSTE vom Lauf produzierte `gantt-row-<auftrag>` aus dem DOM und assertet AC-5 gegen GENAU DIESE — vom Lauf selbst produzierte — ID. Das ist deterministisch (gleiches OTX → gleiche erste Reihe) und erfüllt die Plan-Vorgabe „gegen die deterministischen Auftrags-IDs des Laufs (NICHT test-erfunden)".

## Entfernte test-erfundenen Konstrukte (Plan-Vorgabe)

- `prepareDemoRun()`-Throw-Platzhalter — ENTFERNT (durch `startPacedRun()` ersetzt).
- `append(lines)`-Schreibvertrag — ENTFERNT (01-08 ist read-only; der paced Lauf schreibt selbst nach).
- `ganttFrame(seq, auftragId, kind, t)`-Helper — ENTFERNT (kein test-authored Frame mehr).
- test-erfundene IDs `FA-LIVE-001` / `FA-FILTER` / `FA-RESTART-001` + feste seqs (10_001 …) — ENTFERNT.

## Verification

- **NO-FIXME:** `npx playwright test tests/live-stream.spec.ts --list` → 3 Tests, 0 fixme.
- **eslint:** `npx eslint tests/live-stream.spec.ts` → exit 0 (clean).
- **tsc:** `npx tsc --noEmit -p tsconfig.json` → 0 Fehler in `live-stream.spec` (grep-Count 0).
- **Live-Playwright-Run (Human-Check / UAT, stack-abhängig): PENDING.** Die osim-ui-App importiert auf dem Host nicht ohne den Dev-Stack (psycopg/uv-sources-Gap, 01-08-SUMMARY); der reale Lauf erfordert `bash scripts/dev-up.sh` (postgres/minio/firebase + app an http://localhost:3002) und dann `cd osim-ui/portal && npx playwright test tests/live-stream.spec.ts` → erwartet 3 passed (AC-3/AC-4/AC-5). **AC-3/AC-5 sind erst gegen den laufenden Stack (3 passed) bewiesen — die NO-FIXME/tsc/eslint-Gates allein beweisen sie NICHT. Kein gefälschter Pass.** Verifikationslink: http://localhost:3002/live (Grafik-Viewer nutzen, osim-ui/MEMORY).

## Done-Kriterien (an die Live-Tail-Assertions gebunden)

- AC-3 = erste vom Lauf produzierte GanttRow (deterministische auftrag_id) < 1s sichtbar, während der Prozess noch schreibt — Live-Tail-Assertion (`firstRow.toBeVisible({ timeout: 1000 })` nach `gantt-panel`-Visible), NICHT NO-FIXME/tsc/eslint allein.
- AC-4 = Tab-Filter isoliert einen Stream (`stream-router-<tag>` visible + Gegen-Panel `toHaveCount(0)`).
- AC-5 = Reload mid-stream → genau EINE GanttRow pro auftrag_id (`toHaveCount(1)` gegen die aus dem DOM gelesene deterministische ID), während der Prozess weiterschreibt.

## Deviations from Plan

None — Plan wurde wie geschrieben ausgeführt. Der vom Plan offen gelassene Modell-Weg ist als Upload (nicht Seed) entschieden und oben begründet; die ebenfalls offen gelassene Wahl, die deterministische ID literal zu pinnen vs. aus dem DOM abzugreifen, ist zugunsten des DOM-Abgreifens entschieden (deterministisch + erfüllt „vom Lauf selbst produziert" ohne nicht-dokumentierte Dummy.otx-Auslöser-Namen zu raten — vermeidet einen erfundenen literalen Wert).

## Known Stubs

Keine. Die Spec ist voll verdrahtet gegen die Produktiv-UI (`/live`) + die 01-08-Endpoints. Der einzige nicht hier ausführbare Teil ist der Live-Playwright-Run selbst — das ist eine reine Dev-Stack-/UAT-Abhängigkeit (env-seitig, kein Code-Stub), ehrlich als PENDING markiert.

## Threat Flags

Keine neuen Trust-Boundaries gegenüber dem Plan-`<threat_model>`: der Test treibt nur die runs-Endpoints über die UI (T-E2E-01 via `E2E-`-Prefix + Cleanup adressiert; T-E2E-02 durch den deterministischen kurzen paced Lauf + periods-Cap begrenzt; keine neuen npm-Installs, T-E2E-SC).

## Self-Check: PASSED

- `osim-ui/portal/tests/live-stream.spec.ts` — FOUND.
- Commit `69c56b2` (Task 1) — FOUND in git log.
- NO-FIXME (3 Tests, 0 fixme) + eslint exit 0 + tsc 0 Fehler in der Spec — verifiziert.

---
*Phase: 01-live-viewer-bridge*
*Completed: 2026-05-29*
