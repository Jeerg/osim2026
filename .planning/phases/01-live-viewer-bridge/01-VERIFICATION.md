---
phase: 01-live-viewer-bridge
verified: 2026-05-29T10:55:00Z
status: gaps_found
score: 9/9 original-scope must-have truth-groups verified; scope EXPANDED 2026-05-29 (user decision) — end-to-end run+transport+nav pulled into phase, see Scope Expansion gaps
overrides_applied: 0
human_verification:
  - test: "1000-Event-Demo live im Web-Portal (http://localhost:3002/live) anzeigen — Gantt + KPI, Latenz < 1s"
    expected: "Neue Gantt-Balken/KPI-Werte erscheinen < 1s nach Engine-Schreiben (AC-3/AC-6/O-4)"
    why_human: "Erfordert eine Datei-Read-Bridge (Backend-Stream-Endpoint) zwischen containerisiertem Portal und runs/<id>/stream.jsonl. Diese Bridge ist SPEC §4 explizit M2/out-of-scope; die /live-Route nutzt heute noopRead (Walking-Skeleton). Live-Wiring ist nicht in M1-Scope und nur visuell/real-time verifizierbar."
  - test: "Crash-Robustheit / Offset-Restart (AC-5): UI-Reload während Engine weiterschreibt, keine Doppel-Frames"
    expected: "Engine schreibt ununterbrochen weiter; UI setzt vom gespeicherten Byte-Offset fort, ohne zu doppeln"
    why_human: "Real-time-Verhalten über Prozessgrenzen; E2E-Spec ist test.fixme bis Backend-Read-Endpoint existiert. Manuell in UAT.md §3 dokumentiert."
  - test: "Schema-Mismatch-Banner (AC-7): meta.json schema_version 1.0 -> 2.0, /live neu laden"
    expected: "Gelbes Warn-Banner statt Crash (best-effort, D-OP-4)"
    why_human: "Visuelles Banner-Verhalten; benötigt geladene meta.json über Backend-Bridge. UAT.md §4."
  - test: "C++/Python-KPI-Parity-Spot-Check (AC-9): KPI-Werte Δ ≤ ±1 gegen Referenz"
    expected: "Alle verglichenen KPI-Werte innerhalb ±1"
    why_human: "Manueller Spot-Check (D-OP-6, M1-Entscheid; Automatisierung ist M3). OSim2004-C++-Tree NICHT im Workspace -> Referenz ist SPEC §6.3 / Test-gepinnte Hand-Werte (Pfad B). UAT.md §5."
deferred:
  - truth: "gantt_einsatz / gantt_schicht / reporting_record / Teile von kpi_auswertung liefern volle (non-partial) Daten"
    addressed_in: "Folge-Slices P5-D / P5-L / P5-M (parallel-Track, SPEC §13)"
    evidence: "SPEC R-1 + D-2.1/D-2.2/D-2.3: Phase 01 baut den vollständigen Frame-Vertrag aller 6 Streams ab und markiert skelett-abhängige Streams als 'partial' in meta.json; Coverage wächst mit Slice-Closure. meta.streams partial=['gantt_einsatz','gantt_schicht','kpi_auswertung','reporting_record'] im Demo-Lauf bestätigt."
  - truth: "Live-Stream-Transport zwischen Web-Portal und runs/<id>/stream.jsonl"
    addressed_in: "Phase 7 / M2 (HTTP/WS-Transport)"
    evidence: "SPEC §4 Out-of-Scope: 'Live-Streaming über Netzwerk (HTTP/WebSocket) — Phase 1 ist file-basiert; HTTP-Broker als M2'. osim-ui/CLAUDE.md: Live-Channel ist WebSocket /ws/runs/{run_id}."
---

# Phase 01: Live-Viewer-Bridge Verification Report

**Phase Goal:** osim-engine emittiert während der Simulation einen Live-JSONL-Stream nach `runs/<run-id>/stream.jsonl`; osim-ui tail-liest und rendert daraus die Echtzeit-Äquivalente der OSim2004 Gfx-Viewer + ISimulatorViewerAusw*-Reporting-Sichten — listener-only, ohne Engine-Kern-Eingriff.
**Verified:** 2026-05-29T10:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Sim-Lauf erzeugt genau eine append-only `runs/<run-id>/stream.jsonl` | ✓ VERIFIED | jsonl_writer.py öffnet `"a"`-Mode (append), batched flush; Demo-Lauf erzeugte 1 Datei mit 2017 Frames |
| 2 | Jede Zeile = eigenständiges JSON mit Pflichtfeldern t, stream, seq, v | ✓ VERIFIED | frame.py `Frame.serialize()` baut `{t,stream,seq,v}`; 65 Streaming-Tests grün; Demo-Validierung 0 Schema-Fehler bei 2017 Frames |
| 3 | lifecycle-Stream: sim_begin/period_begin/period_end mit monoton steigender seq | ✓ VERIFIED | lifecycle.py-Listener; Demo: 9 lifecycle-Frames, `seq strikt monoton = True` |
| 4 | gantt_durchlauf-Stream: start- und ende-Frames | ✓ VERIFIED | gantt.py-Listener; Demo: 1680 gantt_durchlauf-Frames; meta.streams.gantt_durchlauf=full |
| 5 | Listener-only: Engine-Kern unverändert, Streaming via OListenerSimulator + sim.attach() | ✓ VERIFIED | git: core/simulator.py, recorder.py, observability/bus.py, listener.py NUR im Monorepo-Move (e36b6b1) berührt, KEIN streaming-Content-Edit; grep: keine stream-Referenz in simulator.py/bus.py; attach.py nutzt vorbestehende `OListenerSimulator.attach()` |
| 6 | Buffer-Full → drop-oldest, Sim nie blockiert | ✓ VERIFIED | jsonl_writer.py `collections.deque(maxlen=10_000)` + `drop_count` + Warn-Log; kein fsync-Zwang |
| 7 | osim-ui hat live-stream/-Feature-Modul mit Tail-Reader + eigenem Zustand-Store | ✓ VERIFIED | features/live-stream/{tail-reader.ts, store.ts}; 29 UI-Tests grün; Store ist eigenständig (nicht useNavigatorStore) |
| 8 | Tail-Reader: inkrementell ab Byte-Offset, Parse-Fehler → Skip+Log, seq-Gap-Detection | ✓ VERIFIED | tail-reader.ts `nextOffset`/`parseLines` mit `catch{skipped++}`; store.ts `detectGaps`/`hasGap`; 8 tail-reader-Tests grün |
| 9 | kpi_auswertung: alle 11 ISimulatorViewerAusw*-kinds als period-end-Aggregate, incremental + flush bei on_period_end | ✓ VERIFIED | auswertung.py: 11 kinds (prod_auftrag/best_auftrag/betr/pers/schicht/kalkulation/wschlange/nbearbeit/kauf/eigen/gesamt), `on_sim_ereig` O(1)-Update, `on_period_end`-Flush; insights/classes.py echte Counter (update/snapshot/reset_period — P5-N geschlossen) |
| 10 | Alle 6 Streams abgebaut; skelett-abhängige schreiben partial-Frames; meta.json Status-Block | ✓ VERIFIED | einsatz/schicht/reporting-Listener emittieren Frames; partial.py `build_streams_status()`; Demo meta.streams partial=['gantt_einsatz','gantt_schicht','kpi_auswertung','reporting_record'] |
| 11 | UI rendert KpiTile (Trend N/N-1) + RecordTable (virtualisiert) + stream-router multiplext + partial/Schema-Banner | ✓ VERIFIED | KpiTile.tsx/RecordTable.tsx/stream-router.tsx/PartialBanner.tsx; 18 UI-Komponenten-Tests grün |
| 12 | 6 JSON-Schemas + Schema-Validation gegen full+partial Golden-Records (Tests-only) | ✓ VERIFIED | streaming/schemas/*.json (6 Dateien); test_streaming_schema.py grün; jsonschema dev-dependency |
| 13 | Latenz Engine→JSONL < 50ms p95 (AC-2) + Streaming-Overhead-Gate (AC-8) | ✓ VERIFIED (AC-8 deviation) | test_ac2_event_to_jsonl_latency_p95_under_50ms PASSED (gemessen p95≈2.5ms); test_ac8_write_overhead_under_20pct PASSED (15.32%) — AC-8 ist honestly-relaxed Option-2-Gate (siehe Abweichung unten) |
| 14 | End-to-End: 1000-Event-Demo zeigt im Web-Portal live Gantt+KPI, Latenz < 1s | ⚠ ENGINE+KOMPONENTEN BEWIESEN, LIVE-WIRING NICHT IN M1-SCOPE | Engine-Seite voll bewiesen (Demo 2017 Frames, 0 Fehler); UI-Komponenten getestet; ABER /live nutzt noopRead — kein Datei-Read-Endpoint Portal↔stream.jsonl. SPEC §4 = M2. → human UAT |

**Score:** 13/13 in-scope Truth-Gruppen verifiziert (O-1/O-2/O-3/O-5 + ACs 1/2/4/7/8 engine/component-seitig). Truth #14 (O-4-Live-Wiring) ist außerhalb M1-Scope (M2-Transport) und auf human UAT geroutet.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Volle (non-partial) Daten für gantt_einsatz/gantt_schicht/reporting_record + Teile kpi | Slices P5-D/P5-L/P5-M (parallel-Track, SPEC §13) | D-2.1/D-2.2: Frame-Vertrag vollständig, Coverage partial-by-design, in meta.json markiert |
| 2 | Live-Transport Portal ↔ stream.jsonl (HTTP/WS) | Phase 7 / M2 | SPEC §4 Out-of-Scope; osim-ui/CLAUDE.md WS-Channel |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `engine/src/osim_engine/streaming/frame.py` | Frame-Dataclass + serialize() | ✓ VERIFIED | `class Frame` mit t/stream/seq/v, 6 Stream-Tags gelockt |
| `streaming/jsonl_writer.py` | Bounded buffer + drop-oldest | ✓ VERIFIED | `class JsonlStreamWriter`, deque(maxlen=10_000) |
| `streaming/run_dir.py` | run-id + meta.json + Traversal-Abwehr | ✓ VERIFIED | `make_run_id`, `resolve_run_dir` (..-Abwehr), `write_meta` |
| `streaming/registry.py` | Listener-Factory-Registry | ✓ VERIFIED | `register_listener` / LISTENER_FACTORIES (self-registration ohne attach-Edit) |
| `streaming/attach.py` | attach_streaming_listeners Helper | ✓ VERIFIED | nutzt vorbestehende `listener.attach(sim)` — kein Kern-Edit |
| `streaming/partial.py` | Skelett-Detection + Status-Block | ✓ VERIFIED | `build_streams_status` + `is_slice_skeleton` (Laufzeit-Re-Check) |
| `streaming/listeners/{lifecycle,gantt,auswertung,einsatz,schicht,reporting,meta_finalize}.py` | 7 Listener | ✓ VERIFIED | alle vorhanden + substantiell + self-registered |
| `insights/classes.py` | Counter-Hoster (P5-N geschlossen) | ✓ VERIFIED | update_*/snapshot/reset_period auf ISimulator/IArbeitszeit/IAuftrag/IBetriebsmittel/IPerson/IProzess/IGonzo |
| `streaming/schemas/*.json` (6) | JSON-Schemas | ✓ VERIFIED | 6 Dateien (lifecycle/gantt_durchlauf/gantt_einsatz/gantt_schicht/kpi_auswertung/reporting_record) |
| `features/live-stream/tail-reader.ts` | Offset-Seek + Skip-on-error | ✓ VERIFIED | nextOffset/parseLines/catch-skip |
| `features/live-stream/store.ts` | Eigener Zustand-Store + Gap-Detection | ✓ VERIFIED | create()-Store, detectGaps/hasGap |
| `features/live-stream/components/{GanttRow,KpiTile,RecordTable,PartialBanner}.tsx` | 4 Render-Komponenten | ✓ VERIFIED | alle vorhanden, getestet |
| `features/live-stream/stream-router.tsx` | Stream-Tag-Multiplexer | ✓ VERIFIED | StreamRouter, AC-4 Stream-Isolation |
| `routes/_authenticated/live.tsx` | /live-Route | ✓ VERIFIED (mit M1-noopRead) | createFileRoute, in routeTree.gen.ts registriert; read default = noopRead (M1-Walking-Skeleton) |
| `engine/scripts/demo_stream_run.py` | 1000-Event-Demo | ✓ VERIFIED | wired attach_streaming_listeners; Lauf erzeugt 2017 Frames |
| `tests/live-stream.spec.ts` | Playwright-E2E | ⚠ test.fixme (ehrlich pending) | wartet auf Backend-Read-Endpoint (M2); Header + UAT.md dokumentieren das |
| `UAT.md` | Manuelles UAT-Skript | ✓ VERIFIED | deckt AC-3/AC-5/AC-6/AC-7/AC-9, dokumentiert Parity-Referenz-Pfad B ehrlich |

### Key Link Verification

| From | To | Status | Details |
| ---- | -- | ------ | ------- |
| listeners/lifecycle.py | OListenerSimulator + sim.attach() | ✓ WIRED | Subklasse, attach insert-at-head, kein Kern-Edit |
| listeners → jsonl_writer | writer.write(frame) | ✓ WIRED | alle Listener schreiben via gemeinsamen Writer |
| attach.py → _sim_listeners | listener.attach(sim) | ✓ WIRED | über vorbestehende Listener-Registry |
| auswertung.py → insights/classes.py | Counter-Snapshots | ✓ WIRED | snapshot(period_num) je kind |
| auswertung.py → registry.register_listener | Self-Registrierung | ✓ WIRED | kein attach.py-Edit |
| partial.py → write_meta | streams-Status-Block | ✓ WIRED | meta.streams partial im Demo bestätigt |
| store.ts → tail-reader.ts | ingest(frames) | ✓ WIRED | /live-Tick ruft reader.step()→ingest() |
| live.tsx → GanttRow / StreamRouter | Route rendert | ✓ WIRED | StreamRouter pro Tab |
| demo_stream_run.py → attach_streaming_listeners | Demo verdrahtet Streaming | ✓ WIRED | Z.129 |
| live-stream.spec.ts → stream.jsonl | E2E konsumiert Stream | ⚠ NOT_WIRED (M2) | test.fixme — Backend-Read-Endpoint fehlt (SPEC §4 out-of-scope) |
| **/live (Portal) → runs/<id>/stream.jsonl** | **Datei-Read-Bridge** | **⚠ NOT_WIRED (M2, by design)** | **noopRead default; Transport ist SPEC §4 M2/out-of-scope** |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| live.tsx / StreamRouter | store.frames pro Tag | tail-reader.step() via injizierte ReadFn | Bei noopRead (default): leer; bei injizierter ReadFn (Tests/UAT): echt | ⚠ HOLLOW im Default-Pfad — wired, aber Datenquelle ist M1-Stub (noopRead). Engine-Seite produziert echte Daten (2017 Frames im Demo) |
| KpiTile/RecordTable/GanttRow | frames | store.ingest | Echt sobald ReadFn echte stream.jsonl liefert | ✓ FLOWING in Tests (Mock-Frames), DISCONNECTED im Default-Portal-Pfad (M2-Transport fehlt) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Engine schreibt 1000+ Frames | `uv run python scripts/demo_stream_run.py --validate` | 2017 Frames, 0 Schema-Fehler, seq monoton | ✓ PASS |
| Schema-Validation full+partial | `pytest test_streaming_schema.py` | grün | ✓ PASS |
| AC-2 Latenz p95 < 50ms | `pytest test_streaming_bench.py` | p95≈2.5ms | ✓ PASS |
| AC-8 Write-Overhead < 20% | `pytest test_streaming_bench.py` | 15.32% | ✓ PASS (relaxed gate) |
| UI live-stream Tests | `npm run test:run -- src/features/live-stream` | 29/29 grün | ✓ PASS |
| Streaming-Integration-Tests | `pytest tests/integration/test_streaming*.py` | 65 passed, 1 xpassed | ✓ PASS |
| Live-Pickup im Portal < 1s | Playwright E2E | test.fixme (Backend-Endpoint fehlt) | ? SKIP → human UAT |
| Lint phase-own UI files | `eslint features/live-stream + live.tsx + spec` | 0 errors, 2 warnings | ✓ PASS |

### Probe Execution

Keine konventionellen `scripts/*/tests/probe-*.sh` für diese Phase deklariert. Verifikation erfolgte über die pytest-Integration-Suite + vitest + Demo-Skript (oben).

### Requirements Coverage

| Req | Source Plan | Description | Status | Evidence |
| --- | ----------- | ----------- | ------ | -------- |
| O-1 | 01-01 | Eine append-only stream.jsonl | ✓ SATISFIED | Demo 1 Datei, 2017 Frames |
| O-2 | 01-01/03/04 | 6 Sub-Stream-Typen | ✓ SATISFIED | alle 6 Tags in frame.py + Listenern + Schemas + Demo |
| O-3 | 01-02/05 | live-stream/-Modul + 3 Render-Komponenten | ✓ SATISFIED | GanttRow/KpiTile/RecordTable + tail-reader + store |
| O-4 | 01-01/02/07 | End-to-End-Demo Gantt+KPI live, Latenz < 1s | ⚠ PARTIAL → human UAT | Engine+Komponenten bewiesen; Live-Wiring = M2-Transport (SPEC §4) |
| O-5 | 01-03/04/06 | Versioniertes, JSON-Schema-validiertes Format + Tests | ✓ SATISFIED | schema_version=1.0, 6 Schemas, Tests grün |
| AC-1 | 01-01/03/04/06 | Schema-Tests gegen golden/ | ✓ SATISFIED | test_streaming_schema.py grün (full+partial) |
| AC-2 | 01-06 | Latenz < 50ms p95 | ✓ SATISFIED | gemessen ≈2.5ms |
| AC-3 | 01-02/07 | UI Pickup < 1s | ? NEEDS HUMAN | E2E test.fixme; UAT.md §2; benötigt M2-Transport |
| AC-4 | 01-02/05 | Stream-Isolation (Filter) | ✓ SATISFIED | stream-router + Tab-Test grün |
| AC-5 | 01-02/07 | Crash-Robust + Offset-Restart | ? NEEDS HUMAN | tail-reader hat Offset-Seek; real-time-Verhalten = UAT.md §3 |
| AC-6 | 01-07 | 1000-Event-Demo voller Gantt+KPI in UI | ? NEEDS HUMAN | Engine-Demo 2017 Frames bewiesen; visuelle UI-Darstellung = UAT.md §1; benötigt M2-Transport |
| AC-7 | 01-05 | Schema-Mismatch → Banner statt Crash | ? NEEDS HUMAN | PartialBanner + best-effort-Logik vorhanden; visuell = UAT.md §4 |
| AC-8 | 01-06 | Engine-Overhead-Gate | ✓ SATISFIED (deviation) | Write-Path < 20% (15.32%), Option-2 honestly-relaxed, User-Entscheid |
| AC-9 | 01-03/07 | C++/Python KPI-Parity Δ ≤ ±1 | ? NEEDS HUMAN | manueller Spot-Check (D-OP-6); C++-Tree nicht im Workspace → Pfad B (SPEC-Referenz); UAT.md §5 |

Alle 5 Outcomes + 9 ACs aus den PLAN-Frontmattern sind gegen die SPEC zugeordnet. Keine verwaisten Requirement-IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| live.tsx | 63 | `noopRead` (leere Read-Quelle) | ℹ Info | Bewusster M1-Walking-Skeleton; Transport ist SPEC §4 M2. Dokumentiert im Header. |
| live-stream.spec.ts | 109 | `test.fixme()` | ℹ Info | Ehrlich pending bis Backend-Endpoint; KEIN TODO-Debt-Marker (Playwright-API), im Header + UAT.md begründet |
| (keine) | — | TBD/FIXME/XXX in Phase-Engine-/UI-Dateien | — | grep: 0 Treffer |

Keine 🛑 Blocker-Anti-Patterns. Keine unreferenzierten Debt-Marker.

### Sacred Constraint (Listener-only)

✓ **UPHELD.** git-Historie zeigt für `core/simulator.py`, `engine/recorder.py`, `observability/bus.py`, `core/listener.py` ausschließlich den Monorepo-Move-Commit (e36b6b1), KEINEN streaming-bezogenen Content-Edit. `attach.py` hängt sich über die vorbestehende `OListenerSimulator.attach()`-Mechanik ein. grep: keine `stream`-Referenz in simulator.py/bus.py.

### Documented Deviation (AC-8)

AC-8 misst Write-Path-Overhead (< 20%, gemessen 15.32%) statt literalem „< 5% full-streaming vs no-streaming". Begründung in 01-06-SUMMARY: literale Lesart auf trivialem synthetischem Kern infeasible (+163%, weil Frame-Produktion proportional dominiert). Explizite User-Entscheidung (Option 2, honestly-relaxed). Deckt SPEC §5-Intent („Live-Schreiben darf Sim nicht verlangsamen"). Ehrlich gescoped, kein stiller Miss.

### Note on Engine Test Suite

`pytest tests/integration/` → 3 failed, 453 passed, 1 xfailed, 1 xpassed. Die 3 Fehler (`test_azeitsim_runner.py` x2, `test_python_vs_cpp.py`) sind **C++-Parity-Tests des azeit/Einsatzzeit-Modells (P5-M-Slice)** — git-Historie: zuletzt im Monorepo-Move berührt, NICHT in dieser Phase. SPEC R-1/D-2.1 dokumentiert P5-M als offene Skelett-Slice. **Keine Phase-01-Regression.** Die 65 Streaming-Integration-Tests sind alle grün.

### Human Verification Required

Siehe `UAT.md` (vollständiges Skript, AC-3/AC-5/AC-6/AC-7/AC-9). Voraussetzung für AC-3/AC-6/AC-7 ist ein Backend-Datei-Read-Endpoint (M2-Transport, SPEC §4 out-of-scope) — bis dahin liefert /live über noopRead leere Steps. AC-9 ist manueller Parity-Spot-Check gegen SPEC §6.3-Hand-Werte (C++-Tree nicht im Workspace).

### Gaps Summary

**Keine in-scope-Gaps.** Alle M1-Scope-Deliverables sind geliefert und bewiesen:
- Engine-Streaming (O-1/O-2/O-5, AC-1/AC-2/AC-8): voll verifiziert, Demo erzeugt validierten 2017-Frame-Stream.
- UI-Feature-Modul + Render-Komponenten (O-3, AC-4/AC-7-Logik): voll verifiziert, 29 Tests grün.
- Listener-only-Constraint: per git nachgewiesen unverletzt.

Die einzigen offenen Punkte sind (a) der **bewusst auf M2 geschobene Transport** (Datei-Read-Bridge Portal↔stream.jsonl; SPEC §4 explizit out-of-scope, E2E ehrlich test.fixme) und (b) **pending human UAT** für die visuellen/real-time/Parity-Kriterien (AC-3/AC-5/AC-6/AC-7/AC-9). Beides ist kein in-scope-Miss → Status **human_needed**, nicht gaps_found.

---

## Scope Expansion — Gaps (2026-05-29, User-Entscheidung)

Nach Browser-UAT hat der User entschieden, den End-to-End-Pfad (Modell laden → ausführen → live zusehen) **jetzt** zu liefern statt auf M2/Folgephasen zu warten. Das ist kein retroaktiver Original-Scope-Miss (Original-Scope war vollständig + verifiziert), sondern ein bewusster Scope-Pull-in gegen das Phasen-GOAL O-4. Architektur-Befund: Portal ist reine FastAPI-served Web-App (kein Electron) → Transport MUSS HTTP sein; `osim_engine` ist bereits editable-dep von osim-ui, `OtxLoader.load()` liefert lauffähigen PSimulator, `attach_streaming_listeners` + Subprozess-Run sind bewiesen.

| Gap | Beschreibung | Akzeptanz |
|-----|--------------|-----------|
| GAP-1 (Nav) | `/live`-Route ist verwaist — kein Menü-Eintrag. | Auswählbarer Navigations-Punkt „Live" (im AuthenticatedLayout/ModelTree-Nav), führt zu `/live`. |
| GAP-2 (Backend-Run) | Kein Sim-Run-Trigger. | `POST /api/v1/models/{id}/runs`: lädt gespeicherte OTX → `OtxLoader` → `attach_streaming_listeners` → Lauf als **separater OS-Subprozess** (Reproduzierbarkeitsvertrag), schreibt `runs/<run-id>/stream.jsonl`+`meta.json`; gibt run_id zurück. Backend-pytest grün. |
| GAP-3 (Backend-Transport) | Kein HTTP-Stream-Endpoint. | `GET /api/v1/runs/{run_id}/stream?offset=` (byte-range, inkrementell) + `GET /api/v1/runs/{run_id}/meta`. Speist die tail-reader-`ReadFn`. Backend-pytest grün. |
| GAP-4 (Frontend-Wiring) | `/live` nutzt `noopRead`, kein Run-Auswahl/-Start-UI. | `/live`: Modell wählen → „Lauf starten" → `ReadFn` gegen GAP-3-Endpoint, live Gantt+KPI. Ersetzt `noopRead`. vitest grün; eigene Dateien lint-clean. |
| GAP-5 (E2E) | `live-stream.spec.ts` ist `test.fixme`. | E2E entpinnen: realer Lauf über die GAP-2/3-Endpoints, Tail-Pickup < 1s (AC-3), Filter (AC-4), Offset-Restart (AC-5). Läuft im Stack (`bash scripts/dev-up.sh`, localhost:3002). |

Damit werden O-4 / AC-3 / AC-6 von „nicht vorführbar" zu echt verifizierbar. AC-9 (C++/Python-Parity) bleibt manueller Spot-Check (C++-Tree nicht im Workspace). Überlappung mit osim-ui-eigenem Roadmap (deren Phase 2 Sim-Run, Phase 4 WebSocket) ist bewusst — hier minimaler HTTP-Polling-Transport, kein WebSocket-Broker.

---

_Verified: 2026-05-29T10:55:00Z_
_Verifier: Claude (gsd-verifier)_
_Scope expansion recorded: 2026-05-29 (user decision — full end-to-end slice)_
