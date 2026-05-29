---
phase: 01-live-viewer-bridge
plan: 07
subsystem: engine/streaming + osim-ui/live-stream
tags: [e2e, demo, uat, playwright, stream-router, route-wiring, parity, ac-3, ac-5, ac-6, ac-9]
requires:
  - "01-01: attach_streaming_listeners + run-dir/meta.json + JsonlStreamWriter"
  - "01-02: /live-Route + useLiveStreamStore + tail-reader (Offset-Restart-Basis)"
  - "01-05: StreamRouter + KpiTile/RecordTable/PartialBanner + data-testids (kpi-grid/gantt-panel/record-table/schema-mismatch-banner)"
  - "01-06: 6 JSON-Schemas + jsonschema-Validierungspipeline (Reuse fuer Demo-Verifikation)"
provides:
  - "engine/scripts/demo_stream_run.py: reproduzierbarer >=1000-Frame-Demo-Lauf (--validate gegen die 6 Schemas)"
  - "osim-ui/portal/tests/live-stream.spec.ts: Playwright-E2E AC-3 (Tail<1s) / AC-4 (Filter) / AC-5 (Offset-Restart), test.fixme bis Backend-Stream-Endpoint"
  - ".planning/phases/01-live-viewer-bridge/UAT.md: manuelles UAT-Skript AC-3/5/6/7/9"
  - "/live-Route konsumiert StreamRouter pro Tab (Route->StreamRouter-Stub aus 01-05 geschlossen)"
affects:
  - "Phase-Abschluss: 7/7 Plaene; Human-Verify-Checkpoint (Task 3) bleibt offen fuer den User"
tech-stack:
  added: []
  patterns:
    - "Demo-Sim: linearer Durchlaufplan + N gestaffelte PAslEinzel pro Periode x P Perioden (deterministisch, separater OS-Prozess)"
    - "Eine Periode pro sim.start()-Aufruf (re-entrant ueber m_simStatus) — P Aufrufe = P Perioden"
    - "E2E mit test.fixme markiert statt gefaelschtem Pass, solange Backend-ReadFn (M2) fehlt"
    - "playwright testMatch deckt e2e/ + tests/ ab (Spec-Discovery ohne testDir-Verlust)"
key-files:
  created:
    - engine/scripts/demo_stream_run.py
    - osim-ui/portal/tests/live-stream.spec.ts
    - .planning/phases/01-live-viewer-bridge/UAT.md
  modified:
    - osim-ui/portal/src/routes/_authenticated/live.tsx
    - osim-ui/portal/playwright.config.ts
decisions:
  - "01-07: Demo-Dimensionierung 4 Perioden x 70 Auftraege x 6 Knoten ~= 2017 Frames (robust > 1000, AC-6)"
  - "01-07: E2E live-stream.spec.ts test.fixme — ehrlich pending, weil Backend-Stream-Read-Endpoint (injizierbare ReadFn, M2/SPEC §4) noch fehlt; KEIN gefaelschter Pass"
  - "01-07: AC-9-Parity mit zwei Referenz-Pfaden dokumentiert (A C++-Lauf falls Tree verfuegbar / B SPEC §6.3-Referenz) — C++-Tree-Verfuegbarkeit ehrlich offengelegt"
metrics:
  duration: ~30min
  completed: 2026-05-29
  tasks: 2
  files: 5
---

# Phase 01 Plan 07: E2E-Demo + UAT Summary

Abschluss-Integration der Live-Viewer-Bridge: ein reproduzierbarer Demo-Lauf der
Engine schreibt einen **2017-Frame**-Stream (autonom verifiziert, 0 Schema-Fehler),
die `/live`-Route konsumiert jetzt den `StreamRouter` pro Tab (der letzte
Route→StreamRouter-Stub aus 01-05 ist geschlossen), der Playwright-E2E für
Tail-Pickup/Filter/Offset-Restart ist geschrieben und type-checkt, und das
`UAT.md`-Skript führt durch die Human-Verify-Kriterien (Crash-Robustheit AC-5,
1000-Event-Demo AC-6, Schema-Mismatch AC-7, C++/Python-Parity AC-9).

Die Human-Verify-Anteile (Browser-UAT, AC-6-Visual-Check, AC-9-Parity-Spot-Check)
sind **bewusst NICHT als bestanden markiert** — sie sind als auszuführende
Schritte in `UAT.md` dokumentiert und als Checkpoint (Task 3) offen.

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| 1 | demo_stream_run.py + live-stream.spec.ts + /live→StreamRouter-Wiring + playwright testMatch | 7337a60 |
| 2 | UAT.md (AC-3/5/6/7/9, dev-up.sh, localhost:3002/live, Default-User, Grafik-Viewer) | 099b0f4 |

## Autonom verifizierte Ergebnisse

### Demo-Lauf (AC-6) — `engine/scripts/demo_stream_run.py --validate`

```
[demo] stream.jsonl  = .../2026-05-29T10-20-30-0001/stream.jsonl (2017 Frames)
[demo]   lifecycle          9
[demo]   gantt_durchlauf    1680
[demo]   gantt_einsatz      0
[demo]   gantt_schicht      4
[demo]   kpi_auswertung     44
[demo]   reporting_record   280
[demo] seq strikt monoton = True
[demo] Schema-Validierung: 0 Fehler bei 2017 Frames
[demo] meta.schema_version = 1.0
[demo] meta.drop_count     = 0
[demo] meta.streams partial = ['gantt_einsatz', 'gantt_schicht', 'kpi_auswertung', 'reporting_record']
```

- **2017 Frames** (≥ 1000 — AC-6 erfüllt).
- `gantt_durchlauf` (1680) UND `kpi_auswertung` (44) vorhanden (AC-6-Mindestinhalt).
- Alle 2017 Frames validieren gegen die 6 JSON-Schemas (Reuse 01-06): **0 Fehler**.
- `seq` strikt monoton (keine Lücken/Duplikate), `meta.json` mit
  `schema_version=1.0` + vollständigem `streams`-Status-Block.

> `gantt_einsatz`=0 ist erwartet: dieser Stream ist laut 01-04 `partial` (P5-L-
> Skelett); er ist über den meta.json-`partial`-Eintrag repräsentiert (D-2.4).

### Route→StreamRouter (O-3-Abschluss)

`/live` rendert jetzt pro Tab `<StreamRouter tag={tag} />` statt des
Platzhalter-Texts + bespoke-GanttDurchlaufPanel. Damit greifen die
01-05-data-testids (`kpi-grid`, `record-table`, `gantt-panel`,
`schema-mismatch-banner`, `partial-status-*`) am Produktiv-Route-Pfad. Optionale
`meta`-Prop spiegelt meta.json in den Store (Schema-Mismatch-Banner, AC-7).

- `npm run test:run -- src/features/live-stream` → **29 passed** (unverändert grün).
- `/live`-Route + StreamRouter type-checken sauber; `eslint live.tsx` → 0 errors
  (1 erwartete react-refresh-Warnung wie alle Route-Dateien).

### E2E-Spec (AC-3/4/5) — geschrieben, type-checkt, ehrlich pending

`osim-ui/portal/tests/live-stream.spec.ts`: 3 Tests (Tail-Pickup < 1s,
Stream-Filter, Offset-Restart) gegen `/live` am Dev-Stack. Discovery verifiziert
(`npx playwright test --list` → 3 Tests), `tsc`/`eslint` clean.

**Lauf-Status — ehrlich pending (kein gefälschter Pass):** Die Spec ist
`test.fixme`-markiert, weil sie einen **Backend-Stream-Read-Endpoint**
voraussetzt (die injizierbare ReadFn der `/live`-Route — M1-Stub aus 01-02; der
HTTP/WS-Transport ist laut SPEC §4 erst M2). Solange dieser Endpoint fehlt,
liest die Produktiv-Route via `noopRead` leere Steps — die Tail-Assertion KANN
heute nicht grün sein. Sobald der Endpoint existiert: `test.fixme()` entfernen,
`prepareDemoRun` an den realen Flow anschließen, ausführen. (Begründung im
Datei-Header + UAT.md dokumentiert.)

## Human-Verify — PENDING (Task 3 Checkpoint, NICHT gefälscht)

Diese Kriterien sind in `UAT.md` als nummerierte Schritte dokumentiert und vom
User auszuführen — sie werden hier ausdrücklich **nicht** als bestanden gemeldet:

- **AC-6 Visual-Check** — Gantt + KPI live in der Browser-UI (localhost:3002/live).
- **AC-3 Latenz < 1s** — visuell am laufenden Stack.
- **AC-5 Crash-Robustheit** — UI-Reload mid-stream, Offset-Fortsetzung ohne Doppelung.
- **AC-7 Schema-Mismatch-Banner** — manuelle meta.json-Major-Manipulation.
- **AC-9 C++/Python-KPI-Parity** — Spot-Check (Δ ≤ ±1). **Ehrliche Note:** der
  OSim2004-C++-Tree ist in diesem Workspace nicht garantiert verfügbar; UAT.md
  bietet zwei Referenz-Pfade (A: echter C++-Lauf falls Tree bereitgestellt /
  B: SPEC §6.3 + test_streaming_kpi.py-Referenzwerte als Fallback). Eine echte
  C++-Parität setzt voraus, dass der C++-Tree verfügbar gemacht wird.

## Sacred Constraint (SPEC §5)

`git diff` über `core/simulator.py`, `recorder.py`, `observability/bus.py` und
`streaming/attach.py` ist leer (listener-only). Der Demo-Lauf nutzt
ausschließlich `attach_streaming_listeners` + das Registry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] playwright.config testMatch um `tests/` erweitert**
- **Found during:** Task 1 (E2E-Spec-Discovery).
- **Issue:** Das PLAN-Frontmatter mandatiert die Spec unter
  `osim-ui/portal/tests/live-stream.spec.ts`, die playwright.config hatte aber
  `testDir: "./e2e"` — `npm run test:e2e` hätte die Spec NICHT gefunden.
- **Fix:** `testDir: "."` + `testMatch: ["e2e/**/*.spec.ts", "tests/**/*.spec.ts"]`.
  Beide Verzeichnisse werden weiterhin gefunden (15 bestehende e2e-Specs +
  3 neue live-stream-Tests, Discovery verifiziert).
- **Files:** osim-ui/portal/playwright.config.ts
- **Commit:** 7337a60

**2. [Rule 2 - kritische Funktionalität] /live→StreamRouter verdrahtet + meta-Spiegelung**
- **Found during:** Task 1 (Objective-DO-Item).
- **Issue:** 01-05 baute StreamRouter + Komponenten, die `/live`-Route trug aber
  noch den Platzhalter-Pfad (Known Stub aus 01-05). Ohne diese Verdrahtung
  zeigen die data-testids (kpi-grid/record-table/schema-mismatch-banner) am
  Produktiv-Pfad nichts — AC-4/AC-6/AC-7 wären am realen `/live` nicht prüfbar.
- **Fix:** TabsContent rendert `<StreamRouter tag={tag} />`; optionale
  `meta`-Prop spiegelt meta.json in den Store (Schema-Mismatch-Banner).
- **Files:** osim-ui/portal/src/routes/_authenticated/live.tsx
- **Commit:** 7337a60

### Bewusst NICHT ausgeführt (Human-Verify)

Browser-UAT, AC-6-Visual, AC-9-Parity — siehe Abschnitt „Human-Verify — PENDING".
Diese sind nicht autonom verifizierbar und werden NICHT als bestanden gemeldet.

## Threat-Mitigationen umgesetzt

- **T-01-15 (DoS / UI-Crash während Engine schreibt):** der automatisierbare
  Offset-Restart-Pfad ist als E2E-Test geschrieben (AC-5-Teil, pending bis
  Backend-Endpoint); der vollständige Crash-Robustheit-Check ist als
  UAT-Schritt 3 dokumentiert (Engine-Schreibpfad append-only entkoppelt).
- **T-01-16 (Integrity / falsche KPI gegen C++):** AC-9-Parity-Spot-Check als
  UAT-Schritt 5 mit ±1-Toleranz + Δ-Tabelle; Referenzquelle ehrlich offengelegt.

## Known Stubs

| Stub | Datei | Grund / Auflösung |
|------|-------|-------------------|
| `prepareDemoRun()` wirft (Platzhalter) | tests/live-stream.spec.ts | Intentional — Backend-Stream-Read-Endpoint (ReadFn, M2/SPEC §4) fehlt. Spec ist test.fixme; Setup wird beim Endpoint-Wiring angeschlossen. KEIN gefälschter Pass. |
| `gantt_einsatz` 0 Frames im Demo | engine (P5-L-Skelett) | Intentional — Stream ist `partial` (01-04), über meta.json repräsentiert (D-2.4). |

## Self-Check

- FOUND: engine/scripts/demo_stream_run.py (ausgeführt, 2017 Frames, 0 Schema-Fehler)
- FOUND: osim-ui/portal/tests/live-stream.spec.ts (3 Tests discovered, tsc+eslint clean)
- FOUND: .planning/phases/01-live-viewer-bridge/UAT.md (AC-3/5/6/7/9, alle Konventionen)
- FOUND commit 7337a60 (Task 1), 099b0f4 (Task 2)
- core/simulator.py + recorder.py + bus.py + attach.py unverändert (SPEC §5)
- live-stream Vitest: 29 passed (unverändert grün)

**Autonom verifizierbare Kriterien: PASSED.**
**Human-Verify-Kriterien (Browser-UAT / AC-9-Parity): PENDING — Task-3-Checkpoint offen, NICHT gefälscht.**
