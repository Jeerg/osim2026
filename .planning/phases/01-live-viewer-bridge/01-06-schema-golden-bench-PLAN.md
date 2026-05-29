---
phase: 01-live-viewer-bridge
plan: 06
type: execute
wave: 3
depends_on: ["01-03", "01-04"]
files_modified:
  - engine/src/osim_engine/streaming/schemas/lifecycle.json
  - engine/src/osim_engine/streaming/schemas/gantt_durchlauf.json
  - engine/src/osim_engine/streaming/schemas/gantt_einsatz.json
  - engine/src/osim_engine/streaming/schemas/gantt_schicht.json
  - engine/src/osim_engine/streaming/schemas/kpi_auswertung.json
  - engine/src/osim_engine/streaming/schemas/reporting_record.json
  - engine/tests/integration/test_streaming_schema.py
  - engine/tests/integration/golden/README.md
  - engine/tests/integration/test_streaming_bench.py
  - engine/pyproject.toml
autonomous: true
requirements: [O-5, AC-1, AC-2, AC-8]
must_haves:
  truths:
    - "Für jeden der 6 Sub-Streams existiert ein JSON-Schema in streaming/schemas/"
    - "Schema-Validation läuft in den Tests gegen full UND partial Golden-Record-JSONL-Dateien (kein Runtime-Overhead)"
    - "Das Schema bumpt nur bei Breaking Changes; meta.json trägt schema_version"
    - "Latenz Engine-Event→JSONL-Line ist als Benchmark gemessen (AC-2) und Streaming-Overhead gegen Baseline < 5% (AC-8)"
  artifacts:
    - path: "engine/src/osim_engine/streaming/schemas/lifecycle.json"
      provides: "JSON-Schema für lifecycle-Frames"
      contains: "$schema|properties"
    - path: "engine/src/osim_engine/streaming/schemas/kpi_auswertung.json"
      provides: "JSON-Schema für kpi_auswertung (11 Kinds)"
      contains: "kind"
    - path: "engine/tests/integration/test_streaming_schema.py"
      provides: "Golden-Record-Schema-Validierung (full + partial)"
      contains: "validate|jsonschema"
    - path: "engine/tests/integration/test_streaming_bench.py"
      provides: "Latenz- (AC-2) + Overhead-Benchmark (AC-8)"
      contains: "def test_"
  key_links:
    - from: "tests/integration/test_streaming_schema.py"
      to: "engine/src/osim_engine/streaming/schemas/"
      via: "lädt Schemas + validiert Golden-Records"
      pattern: "schemas"
    - from: "engine/src/osim_engine/streaming/schemas/"
      to: "meta.json:schema_version"
      via: "Schema-Versionierung"
      pattern: "schema_version"
---

<objective>
Versionierung + Verifikation: ein JSON-Schema je Sub-Stream in `streaming/schemas/`, Golden-Record-Schema-Tests (full + partial, D-2.4) und die Performance-Benchmarks für AC-2 (Latenz < 50ms p95) und AC-8 (< 5% Overhead). Schema-Validation läuft NUR in Tests/CI (D-1.4 — kein Runtime-Overhead).

Purpose: O-5 (versioniert + JSON-Schema-validiert, Schema-Tests Teil der Engine-Suite), AC-1 (Schema-Tests gegen golden/ JSONL), AC-2 (Latenz-Benchmark), AC-8 (Overhead-Benchmark).
Output: 6 Schema-Dateien, `test_streaming_schema.py`, golden/-Records, `test_streaming_bench.py`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-03-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-04-SUMMARY.md

<interfaces>
<!-- Frame-Pflichtfelder + v-Felder je Stream: aus 01-01/01-03/01-04-SUMMARY.md. -->
<!-- attach_streaming_listeners + JsonlStreamWriter: aus 01-01. -->
<!-- jsonschema ist die Standard-Validierungs-Lib (prüfe ob bereits in engine deps; sonst dev-dep ergänzen). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 6 JSON-Schemas + Golden-Record-Schema-Validierung (full + partial)</name>
  <files>engine/src/osim_engine/streaming/schemas/lifecycle.json, engine/src/osim_engine/streaming/schemas/gantt_durchlauf.json, engine/src/osim_engine/streaming/schemas/gantt_einsatz.json, engine/src/osim_engine/streaming/schemas/gantt_schicht.json, engine/src/osim_engine/streaming/schemas/kpi_auswertung.json, engine/src/osim_engine/streaming/schemas/reporting_record.json, engine/tests/integration/test_streaming_schema.py, engine/tests/integration/golden/README.md</files>
  <read_first>
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.2 (Frame-Pflichtfelder), §6.3 (alle Beispiel-Frames je Stream — Quelle der Schema-Properties), §6.4 (schema_version), §9 AC-1
    - .planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md (lifecycle/gantt_durchlauf v-Felder), 01-03-SUMMARY.md (11 kpi_auswertung-Kinds + Felder), 01-04-SUMMARY.md (gantt_einsatz/gantt_schicht/reporting_record + partial-Felder)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-1.4 (Schema-Validation NUR Tests/CI), D-2.4 (Golden-Stub-Files mit minimal partial-Frames; AC-1 gegen full UND partial; Coverage-Lücken als leere Golden-Records sichtbar)
    - engine/tests/unit/core/test_day_of_sim_parity.py (Test-Stil)
  </read_first>
  <behavior>
    - Jedes Schema validiert einen korrekten Frame seines Streams (gemäß §6.3) und lehnt einen Frame mit fehlendem Pflichtfeld ab.
    - kpi_auswertung.json akzeptiert alle 11 kind-Werte und lehnt einen unbekannten kind ab.
    - Schema-Test validiert eine full-Golden-JSONL erfolgreich UND eine partial-Golden-JSONL (minimale partial-Frames) erfolgreich.
    - Eine bewusst defekte Golden-Zeile (fehlendes seq) lässt den Validierungs-Test fehlschlagen (Negativ-Pin).
  </behavior>
  <action>
    Schreibe je Sub-Stream ein JSON-Schema (Draft 2020-12) in `streaming/schemas/<stream>.json`: die 4 Frame-Pflichtfelder (`t` int, `stream` const/enum auf den Tag, `seq` int, `v` object) plus die stream-spezifischen `v`-Properties aus §6.3. Für `kpi_auswertung.json` ein `oneOf`/`if-then` über die 11 `kind`-Diskriminatoren (prod_auftrag/best_auftrag/betr/pers/schicht/kalkulation/wschlange/nbearbeit/kauf/eigen/gesamt) — Pflichtfelder je kind aus 01-03-SUMMARY.md. Markiere optionale partial-Felder als nicht-required, damit partial-Frames valide bleiben (D-2.4).
    Lege `tests/integration/golden/` an mit je einer full- und einer partial-Golden-JSONL pro Stream (minimal, deterministisch) + `golden/README.md` (erklärt full vs. partial, Coverage-Lücken sind leere/minimale Records). `test_streaming_schema.py` lädt jedes Schema und validiert die Golden-Records via `jsonschema` (Standard-Lib; falls nicht in deps, als test/dev-dependency ergänzen). Ein Negativ-Test mit defekter Zeile muss fehlschlagen-erwartet sein (pytest.raises).
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_schema.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - Es existieren genau 6 Dateien in `engine/src/osim_engine/streaming/schemas/` (`ls engine/src/osim_engine/streaming/schemas/*.json | wc -l` === 6).
    - Schema-Test validiert für jeden der 6 Streams eine full- und eine partial-Golden-JSONL ohne Fehler.
    - kpi_auswertung-Test: alle 11 kind-Frames validieren; ein Frame mit `v.kind="nonsense"` schlägt fehl.
    - Negativ-Test: eine Golden-Zeile ohne `seq` lässt die Validierung fehlschlagen (per pytest.raises bestätigt).
  </acceptance_criteria>
  <done>6 Schemas + Golden-Records (full+partial) + Schema-Tests grün, inkl. Negativ-Pin.</done>
</task>

<task type="auto">
  <name>Task 2: Latenz- (AC-2) + Overhead-Benchmark (AC-8)</name>
  <files>engine/tests/integration/test_streaming_bench.py, engine/pyproject.toml</files>
  <read_first>
    - engine/pyproject.toml ([tool.pytest.ini_options] — bestehende Konfiguration; Marker müssen registriert werden, sonst PytestUnknownMarkWarning)
    - engine/src/osim_engine/streaming/jsonl_writer.py (Writer-Verhalten aus 01-01 — batch_n/flush)
    - engine/src/osim_engine/streaming/attach.py (attach_streaming_listeners)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §9 AC-2 (Latenz Engine-Event→JSONL-Line < 50ms p95, Benchmark mit 100k Events), AC-8 (< 5% Overhead mit aktivem Streaming gegen Baseline), §7.4 (Backpressure)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-1.3 (Batched-Flush erreicht AC-2 bei kleinem N, AC-8 durch reduzierte syscalls), Discretion (exaktes N 50-200 via Benchmark)
  </read_first>
  <action>
    `test_streaming_bench.py`: (a) **Latenz-Test (AC-2)** — fahre einen Sim/Synthetik-Lauf mit vielen Events (skalierbar; in CI ggf. reduziert via Marker, lokal bis 100k), miss pro emittiertem Frame die Spanne Event→Zeile-auf-Platte und prüfe p95 < 50ms. (b) **Overhead-Test (AC-8)** — miss die Sim-Laufzeit OHNE Streaming-Listener (Baseline) und MIT `attach_streaming_listeners`, assert Overhead < 5%. Beide Tests als pytest-Funktionen, mit `@pytest.mark.bench`/`slow`-Marker, damit die Schnell-Suite nicht ausgebremst wird. **Registriere beide Marker** unter `[tool.pytest.ini_options]` in `engine/pyproject.toml` via `markers = ["bench: Latenz-/Overhead-Benchmarks (manuell/CI-opt-in)", "slow: lang laufende Tests"]`, sonst wirft pytest `PytestUnknownMarkWarning`. Falls der gewählte `batch_n`-Default (aus 01-01) AC-2/AC-8 verfehlt, justiere den Default im Writer im Rahmen der Discretion (N zwischen 50-200) und dokumentiere den gemessenen Wert im SUMMARY.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_bench.py -m bench -x -q</automated>
  </verify>
  <acceptance_criteria>
    - Latenz-Test misst p95 der Event→JSONL-Latenz und assertet < 50ms (AC-2).
    - Overhead-Test misst Baseline vs. mit-Streaming und assertet Overhead < 5% (AC-8).
    - Beide Tests tragen einen `bench`/`slow`-Marker (`grep -c "pytest.mark" test_streaming_bench.py` ≥ 2).
    - `bench` und `slow` sind unter `[tool.pytest.ini_options] markers` in `engine/pyproject.toml` registriert; `cd engine && uv run pytest tests/integration/test_streaming_bench.py -m bench -x -q` läuft ohne `PytestUnknownMarkWarning`.
    - Der im Writer verwendete batch_n-Default ist im 01-06-SUMMARY mit dem gemessenen Latenz-/Overhead-Wert dokumentiert.
  </acceptance_criteria>
  <done>Latenz- + Overhead-Benchmark grün, batch_n-Default bestätigt/justiert.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Schema-Drift Engine↔UI | abweichende Frame-Felder zwischen Engine-Emit und UI-Erwartung |
| Schreib-Throughput → Sim-Performance | langsame Disk/AV-Pfad könnte Backpressure auslösen |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-13 | Tampering/Integrity | Schema-Drift zwischen Engine + UI | mitigate | JSON-Schema + Golden-Record-Tests in der Engine-Suite/CI (R-3, AC-1); schema_version-Bump bei Breaking Change |
| T-01-14 | Denial of Service | Schreib-Throughput verlangsamt Sim | mitigate | AC-2/AC-8-Benchmark als Regressions-Gate; Backpressure (drop-oldest) aus 01-01 greift bei langsamer Disk (R-2, §7.4) |
</threat_model>

<verification>
- O-5: 6 Schemas + schema_version + Schema-Tests Teil der Engine-Suite.
- AC-1: Golden-Record-Validierung full + partial.
- AC-2/AC-8: Latenz- + Overhead-Benchmark grün.
</verification>

<success_criteria>
- `cd engine && uv run pytest tests/integration/test_streaming_schema.py -q` grün.
- `cd engine && uv run pytest tests/integration/test_streaming_bench.py -m bench -q` grün.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-06-SUMMARY.md` when done. Dokumentiere schema_version, den gemessenen Latenz-p95 + Overhead-% und den finalen batch_n-Default.
</output>
