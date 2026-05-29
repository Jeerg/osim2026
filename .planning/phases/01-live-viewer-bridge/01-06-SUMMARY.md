---
phase: 01-live-viewer-bridge
plan: 06
subsystem: engine/streaming
tags: [streaming, json-schema, golden-record, benchmark, latenz, overhead, ac-1, ac-2, ac-8, jsonschema]
requires:
  - "01-01: Frame-Dataclass + JsonlStreamWriter (batch_n=100, drop-oldest) + attach_streaming_listeners + SeqCounter"
  - "01-03: 11 kpi_auswertung-kind-Diskriminatoren + ihre v-Pflichtfelder"
  - "01-04: gantt_einsatz/gantt_schicht/reporting_record-Felder + partial-Frame-Semantik (D-2.4)"
provides:
  - "streaming/schemas/<stream>.json: 6 Draft-2020-12-Schemas (lifecycle/gantt_durchlauf/gantt_einsatz/gantt_schicht/kpi_auswertung/reporting_record)"
  - "tests/integration/test_streaming_schema.py: Golden-Record-Validierung full + partial + Negativ-Pin (AC-1, O-5)"
  - "tests/integration/test_streaming_bench.py: AC-2-Latenz-Benchmark (p95 < 50ms) + AC-8-Schreib-Overhead-Benchmark (< 20% best-of-11, Option 2)"
  - "pyproject.toml: bench/slow-Marker registriert"
affects:
  - "01-07 (E2E/Demo): Schema-Tests + Benchmarks sind Teil der Engine-Suite/CI-Gate"
tech-stack:
  added:
    - "jsonschema>=4.21 (dev-dependency) — Golden-Record-Validierung nur in Tests/CI (D-1.4)"
  patterns:
    - "JSON-Schema Draft 2020-12 je Sub-Stream; kpi_auswertung via if-then ueber 11 kind-Diskriminatoren"
    - "Golden-Records full + partial je Stream; bewusst defekte Zeile (fehlendes seq) als Negativ-Pin (pytest.raises)"
    - "Benchmark-Subklassen von JsonlStreamWriter: _TimedWriter (Latenz-Stempel) + _NoDiskWriter (Baseline ohne Disk-I/O)"
    - "Best-of-N (Minimum) statt Mittelwert gegen Windows-Timing-Rauschen (AV/Scheduler)"
    - "AC-8 misst Write-Path-Overhead (mit vs. ohne Disk-Schreiben), NICHT full-streaming-vs-no-streaming (Option 2)"
key-files:
  created:
    - engine/src/osim_engine/streaming/schemas/lifecycle.json
    - engine/src/osim_engine/streaming/schemas/gantt_durchlauf.json
    - engine/src/osim_engine/streaming/schemas/gantt_einsatz.json
    - engine/src/osim_engine/streaming/schemas/gantt_schicht.json
    - engine/src/osim_engine/streaming/schemas/kpi_auswertung.json
    - engine/src/osim_engine/streaming/schemas/reporting_record.json
    - engine/tests/integration/test_streaming_schema.py
    - engine/tests/integration/test_streaming_bench.py
    - engine/tests/integration/golden/README.md
  modified:
    - engine/pyproject.toml
decisions:
  - "01-06: schema_version=1.0 (meta.json), 6 Draft-2020-12-Schemas; Bump nur bei Breaking Change (O-5)"
  - "01-06: AC-8 als Option 2 (honestly-relaxed) implementiert — Write-Path-Overhead < 20% best-of-11 statt literaler <5% full-vs-no-streaming (User-Entscheid, Deviation)"
  - "01-06: batch_n-Default 100 UNVERAENDERT gelassen (Option 1 = Bump auf 200 verworfen, User-Entscheid)"
metrics:
  duration: ~20min
  completed: 2026-05-29
  tasks: 2
  files: 9
---

# Phase 01 Plan 06: Schema-Versionierung + Golden-Record-Tests + Performance-Benchmarks Summary

Sechs JSON-Schemas (Draft 2020-12) je Sub-Stream mit Golden-Record-Validierung (full + partial + Negativ-Pin) und zwei Performance-Benchmarks: AC-2-Latenz (gemessen p95 = 2.5ms ≪ 50ms) und AC-8-Schreib-Overhead (gemessen 15.3% < 20%, Option 2 honestly-relaxed nach User-Entscheid).

## Was gebaut wurde

### Task 1 — 6 JSON-Schemas + Golden-Record-Validierung (bereits committet als `f1cd7fc`)
- Je Sub-Stream ein Draft-2020-12-Schema in `streaming/schemas/` mit den 4 Frame-Pflichtfeldern (`t`, `stream`, `seq`, `v`) plus den stream-spezifischen `v`-Properties (SPEC §6.3).
- `kpi_auswertung.json` mit if-then über alle 11 kind-Diskriminatoren.
- `golden/` mit je einer full- und partial-JSONL pro Stream + Negativ-Pin (`lifecycle.broken.jsonl`, fehlendes `seq`).
- `test_streaming_schema.py` validiert full UND partial via `jsonschema>=4.21` (dev-dependency, D-1.4 — nur Tests/CI, kein Runtime-Overhead).

### Task 2 — Latenz- (AC-2) + Schreib-Overhead-Benchmark (AC-8), committet als `94d564f`
- `test_streaming_bench.py` mit zwei `bench`/`slow`-markierten Tests; Marker in `pyproject.toml` unter `[tool.pytest.ini_options]` registriert (kein `PytestUnknownMarkWarning`).
- **AC-2 (Latenz):** `_TimedWriter` stempelt je Frame den `write()`-Zeitpunkt und trägt beim Flush die Event→Platte-Latenz nach. Über einen synthetischen Sim-Lauf (5000 Auslöser ≈ 10k Frames, skalierbar via `OSIM_BENCH_AUSL`) wird das p95 geprüft.
  - **Gemessen:** `frames=10015 batch_n=100 p50=0.333ms p95=2.509ms max=17.735ms` → Assertion `p95 < 50ms` deutlich erfüllt.
- **AC-8 (Schreib-Overhead, Option 2):** `_NoDiskWriter` (Baseline) erzeugt + serialisiert dieselben Frames, verwirft die Zeilen aber statt sie auf Platte zu schreiben. Gegen den echten `JsonlStreamWriter` (batched flush auf Platte) wird der Write-Path-Overhead best-of-11 gemessen.
  - **Gemessen:** `best-of-11 ausl=5000 batch_n=100 baseline=146.0ms streaming=168.3ms write-overhead=15.32%` → Assertion `< 20%` erfüllt.
- **batch_n-Default:** 100 (unverändert aus 01-01; Option 1 = Bump auf 200 wurde per User-Entscheid verworfen).
- **schema_version:** 1.0 (in `meta.json` via `run_dir.write_meta`), Bump nur bei Breaking Change (O-5).

## Verifikation

```
cd engine && uv run pytest tests/integration/test_streaming_bench.py -m bench -q
[AC-2] frames=10015 batch_n=100 p50=0.333ms p95=2.509ms max=17.735ms
[AC-8] best-of-11 ausl=5000 batch_n=100 baseline=146.0ms streaming=168.3ms write-overhead=15.32%
2 passed in 5.03s
```

Kein `PytestUnknownMarkWarning`. `core/simulator.py`, `recorder.py`, `observability/bus.py` unangetastet (SPEC §5, listener-only).

## Deviations from Plan

### Auto-fixed / dokumentierte Abweichungen

**1. [Rule 3 / User-Entscheid — Deviation] AC-8 als „Option 2 — honestly relaxed threshold" statt literaler SPEC-Lesart**

- **Found during:** Task 2 (AC-8-Benchmark)
- **SPEC-Wortlaut (§9 AC-8):** „Engine-Kern-Performance: < 5% Overhead mit aktivem Streaming gegen Baseline".
- **Befund:** Die literale Lesart („full streaming vs. no streaming at all") ist auf dem trivialen synthetischen Sim-Kern **nicht erreichbar** — gemessen **+163%**. Grund: das Bauen + Serialisieren der Viewer-Frames ist ein unvermeidbarer Per-Event-Preis. Er dominiert proportional nur deshalb, weil der synthetische Kern fast keine Arbeit pro Event leistet; auf einem realistischen Sim-Kern schrumpft der relative Overhead. Die Frame-**Produktion** ist der inhärente Preis des Features selbst — sie zählt nicht ins Schreib-Overhead-Budget.
- **Umsetzung (User-Entscheid):** AC-8 misst den **Write-Path-Overhead** (Frames produziert + serialisiert in beiden Armen; gemessener Delta = persistiert auf Platte via batched `JsonlStreamWriter` vs. verworfen) und assertet eine **ehrlich relaxte Schwelle < 20%** (statt < 5%), **best-of-11** gegen das Timing-Rauschen dieses Windows-Hosts. Das deckt sich mit SPEC §5 („*das Live-Schreiben* darf den Sim nicht verlangsamen") und CONTEXT D-1.3 („AC-8 durch reduzierte syscalls").
- **Gemessen:** Write-Path-Overhead = 15.32% (< 20% erfüllt).
- **`batch_n` unverändert (100):** Ein Bump auf 200 (Option 1) wurde bewusst NICHT gemacht.
- **Strukturelle Alternative deferred:** Ein echtes 5%-vs-no-streaming verlangte einen Background-Writer-Thread oder Event-Sampling. Diese Option (Async-Background-Thread) hat DISCUSSION-LOG Q1.3 für Phase 01 bereits explizit verworfen (gewählt: „Batched"). Damit ist die strukturelle Änderung für eine Folge-Phase aufgeschoben.
- **Files modified:** `engine/tests/integration/test_streaming_bench.py`, `engine/pyproject.toml`
- **Commit:** `94d564f`
- **Rationale:** Explizite User-Entscheidung („Option 2"). Das committete Gate guard die Write-Path-Regression < 20% — die tatsächliche SPEC-Intent (§5 / D-1.3). Dokumentiert, damit der Verifier sieht, dass dies eine bewusste Wahl war, kein stiller Miss.

## Self-Check: PASSED

- FOUND: engine/tests/integration/test_streaming_bench.py
- FOUND: engine/src/osim_engine/streaming/schemas/ (6 Schemas, Task 1)
- FOUND commit f1cd7fc (Task 1)
- FOUND commit 94d564f (Task 2)
- core/simulator.py unverändert (git status clean)
