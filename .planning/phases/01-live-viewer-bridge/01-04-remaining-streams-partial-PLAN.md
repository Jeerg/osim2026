---
phase: 01-live-viewer-bridge
plan: 04
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - engine/src/osim_engine/streaming/listeners/einsatz.py
  - engine/src/osim_engine/streaming/listeners/schicht.py
  - engine/src/osim_engine/streaming/listeners/reporting.py
  - engine/src/osim_engine/streaming/listeners/meta_finalize.py
  - engine/src/osim_engine/streaming/partial.py
  - engine/tests/integration/test_streaming_partial.py
autonomous: true
requirements: [O-2, O-5, AC-1]
must_haves:
  truths:
    - "Alle 6 Sub-Streams werden abgebaut — die drei skelett-abhängigen (gantt_einsatz, gantt_schicht, reporting_record) schreiben minimale partial-Frames"
    - "meta.json enthält pro Stream einen Status-Block status=partial|full mit missing_slices + reason"
    - "Die UI kann anhand meta.json maschinenlesbar erkennen, welche Streams partial sind"
    - "Coverage-Lücken sind als leere/minimale Golden-Records sichtbar, nicht als fehlende Tests"
  artifacts:
    - path: "engine/src/osim_engine/streaming/listeners/einsatz.py"
      provides: "EinsatzListener für gantt_einsatz (on/off Ressourcen-Belegung, partial bei P5-Skelett)"
      contains: "class EinsatzListener"
    - path: "engine/src/osim_engine/streaming/listeners/schicht.py"
      provides: "SchichtListener: period-end-Aggregat für gantt_schicht (partial bei P5-M)"
      contains: "class SchichtListener"
    - path: "engine/src/osim_engine/streaming/listeners/reporting.py"
      provides: "ReportingListener: period-end Detail-Records (partial bei P5-D)"
      contains: "class ReportingListener"
    - path: "engine/src/osim_engine/streaming/partial.py"
      provides: "Skelett-Slice-Detection + streams-Status-Block-Bau für meta.json"
      contains: "def build_streams_status"
  key_links:
    - from: "streaming/partial.py"
      to: "streaming/run_dir.py:write_meta"
      via: "streams-Status-Block fließt in meta.json"
      pattern: "streams|write_meta"
    - from: "streaming/listeners/meta_finalize.py"
      to: "streaming/registry.py:register_listener"
      via: "Self-Registrierung + meta.json-Finalize bei period-reset"
      pattern: "register_listener"
---

<objective>
Vollständiger Stream-Vertrag: die restlichen drei Sub-Streams (`gantt_einsatz`, `gantt_schicht`, `reporting_record`) werden als Listener abgebaut. Wo die Quell-Slices heute Skelett sind (P5-D/L/M), schreiben sie minimale **partial-Frames** und werden in `meta.json` maschinenlesbar als `partial` markiert (D-2.1/D-2.2). Alle Listener registrieren sich über `register_listener` (aus 01-01) selbst — ohne `attach.py` zu editieren (parallel zu 01-03).

Purpose: O-2 (alle 6 Sub-Streams), O-5 (versioniert), AC-1 (Schema-Tests gegen full UND partial Streams, D-2.4). Der Engine-Vertrag steht ab Phase 01 vollständig; Coverage wächst mit Slice-Closure-Folgephasen.
Output: `einsatz.py`, `schicht.py`, `reporting.py`, `meta_finalize.py`, `partial.py`, `test_streaming_partial.py`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md

<interfaces>
<!-- Listener-Vorlage + register_listener + Writer/Frame/run_dir/seq_counter: aus 01-01-SUMMARY.md. -->
<!-- register_listener(factory) mit factory: (seq_counter, writer) -> OListenerSimulator. -->
<!-- write_meta(run_dir, ..., streams=None) (aus 01-01 run_dir.py) nimmt den streams-Status-Block. -->
<!-- Der Writer kennt seinen Pfad → run_dir = writer.path.parent (für meta-Finalize). -->
<!-- Skelett-Marker-Konvention: Stubs sind via Docstring "Slice P5-X Skelett" markiert (docs/skeleton-inventory.md). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Skelett-Slice-Detection + streams-Status-Block für meta.json</name>
  <files>engine/src/osim_engine/streaming/partial.py, engine/tests/integration/test_streaming_partial.py</files>
  <read_first>
    - docs/skeleton-inventory.md (95 Skelett-Marker; treibt D-2.1/D-2.3; welche Slices P5-D/L/M heute Skelett sind)
    - engine/src/osim_engine/streaming/run_dir.py (write_meta-Signatur aus 01-01 — nimmt streams-Block)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-2.1 (alle 6 Streams, partial bei leeren Slices), D-2.2 (meta.json streams-Status-Block: status/missing_slices/reason; UI-Banner), D-2.3 (P5-D Priorität-1), Established Patterns (Skelett-Marker via Docstring "Slice P5-X Skelett")
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.4 (meta.json), §10 R-1 (Skelett-Quellen), §12 (Dependencies P5-D/L/M)
  </read_first>
  <behavior>
    - build_streams_status() liefert für lifecycle + gantt_durchlauf + kpi_auswertung status="full" (bzw. dokumentierten Stand) und für gantt_einsatz/gantt_schicht/reporting_record status="partial" mit nicht-leerer missing_slices-Liste + reason.
    - Der zurückgegebene Block ist JSON-serialisierbar und passt direkt in write_meta(streams=...).
    - Mindestens ein Stream trägt missing_slices, das "P5-D"/"P5-L"/"P5-M" enthält.
  </behavior>
  <action>
    In `partial.py`: `is_slice_skeleton(slice_id: str) -> bool` prüft, ob die Quell-Slice noch Skelett ist (heuristisch über die Docstring-Marker-Konvention "Slice P5-X Skelett" in den betroffenen Modulen, bzw. ein dokumentiertes Mapping aus skeleton-inventory.md — Discretion: einfaches statisches Mapping P5-D→reporting_record+gantt_durchlauf-status, P5-M→gantt_schicht, P5-L→generator/reporting_record, plus optional Laufzeit-Re-Check). `build_streams_status() -> dict[str, dict]` baut den vollständigen 6-Stream-Block: für jeden der 6 Tags ein `{"status": "partial"|"full", "missing_slices": [...], "reason": "..."}`. `lifecycle`+`gantt_durchlauf`+`kpi_auswertung` = `full` (Stand nach 01-01/01-03), die übrigen `partial` mit den zugehörigen Slice-IDs + deutscher reason. Lege `test_streaming_partial.py` an und pinne die Status-Klassifikation.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_partial.py -k "status or partial or meta" -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `build_streams_status()` liefert ein dict mit genau den 6 Stream-Tags als Schlüssel.
    - `gantt_einsatz`, `gantt_schicht`, `reporting_record` haben jeweils `status=="partial"` und eine nicht-leere `missing_slices`-Liste.
    - Mindestens ein `missing_slices`-Eintrag enthält "P5-M" (gantt_schicht) und einer "P5-D" (reporting_record).
    - Der Block ist via `json.dumps` serialisierbar (Test ruft es ohne Fehler).
  </acceptance_criteria>
  <done>partial.py liefert den streams-Status-Block, Status-Tests grün.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: EinsatzListener, SchichtListener, ReportingListener + MetaFinalizeListener (partial + meta.json)</name>
  <files>engine/src/osim_engine/streaming/listeners/einsatz.py, engine/src/osim_engine/streaming/listeners/schicht.py, engine/src/osim_engine/streaming/listeners/reporting.py, engine/src/osim_engine/streaming/listeners/meta_finalize.py, engine/tests/integration/test_streaming_partial.py</files>
  <read_first>
    - engine/src/osim_engine/streaming/listeners/lifecycle.py (Listener-Vorlage aus 01-01 — Frame-Bau, register_listener am Modul-Ende)
    - engine/src/osim_engine/streaming/registry.py (register_listener + LISTENER_FACTORIES aus 01-01)
    - engine/src/osim_engine/streaming/run_dir.py (write_meta aus 01-01)
    - engine/src/osim_engine/streaming/partial.py (build_streams_status aus Task 1)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.3 (Beispiel-Frames: gantt_einsatz on/off mit ressource_id/ressource_typ/start_time/einsatz_typ/kontext/end_time; gantt_schicht period-aggregiert mit person_id/schicht/von/bis/sollstunden/iststunden; reporting_record auftrag mit auftrag_id/art/menge/start/ende_ist/ende_soll/verspaetung/prozesse[]), §7.1
    - OSim2004/OSimV01(Fj)/OSimPro/PEinsatzzeitViewer.cpp, PEinsatzViewer.cpp (gantt_einsatz-Felder), ISimulatorViewerSchicht.cpp (gantt_schicht), ISimulatorViewer{ProdAuftr,BestAuftr,Pers,Betr,Relationen}.cpp (reporting_record-Felder)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-2.1 (partial-Frames für skelett-abhängige Streams), Q-2/§6.3 (reporting period-end-Aggregat)
  </read_first>
  <behavior>
    - EinsatzListener emittiert bei Ressourcen-Belegung einen gantt_einsatz-Frame v.kind=="on" und bei Freigabe v.kind=="off"; wo die Slice Skelett ist, schreibt er minimale partial-Frames (nur Pflichtfelder, restliche Default/leer).
    - SchichtListener emittiert period-end je Person×Schicht einen gantt_schicht-Frame (period-aggregiert); bei P5-M-Skelett minimal-partial.
    - ReportingListener emittiert period-end Detail-Records (kind=="auftrag" etc.); bei P5-D-Skelett minimal-partial.
    - MetaFinalizeListener schreibt bei Lauf-Ende (on_period_reset/letzter Period-End) meta.json mit build_streams_status() + writer.drop_count neu.
    - Alle vier Module registrieren ihre Factory via register_listener beim Import (kein attach.py-Edit).
  </behavior>
  <action>
    Implementiere `EinsatzListener` (gantt_einsatz, on/off via on_sim_ereig), `SchichtListener` (gantt_schicht, period-end-Aggregat) und `ReportingListener` (reporting_record, period-end Detail-Listen) jeweils als `OListenerSimulator`-Subklasse nach dem 01-01-Muster (geteilter seq-Counter + Writer). Für Streams, deren Quell-Slice heute Skelett ist (`partial.is_slice_skeleton`), schreiben sie **minimale partial-Frames** mit nur den Pflicht-/Identifikationsfeldern (restliche Werte Default/leer) statt zu fehlen (D-2.1).

    Implementiere `MetaFinalizeListener(OListenerSimulator)` in `meta_finalize.py`: hält den Writer; in `on_period_reset` (und idempotent auch beim letzten `on_period_end`) leitet er `run_dir = writer.path.parent` ab und ruft `write_meta(run_dir, ..., streams=build_streams_status(), drop_count=writer.drop_count)`, sodass `meta.json` den vollständigen 6-Stream-Status-Block + die finale Drop-Zählung trägt. So bleibt `attach.py` aus 01-01 unangetastet — der Finalize läuft rein über das Registry.

    Jedes der vier Module ruft am Modul-Ende `register_listener(...)` (aus streaming/registry.py). Das listeners-Package importiert diese Module bereits über die feste Namensliste aus 01-01 — KEIN Edit an attach.py/__init__.py. Ergänze in `test_streaming_partial.py` einen End-to-End-Lauf, der prüft, dass alle 6 Stream-Tags im Stream ODER als partial in meta.json repräsentiert sind.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_partial.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - Die drei Stream-Listener-Dateien enthalten je eine `OListenerSimulator`-Subklasse und rufen `register_listener` (`grep -c "OListenerSimulator\|register_listener"` ≥ 2 je Datei).
    - End-to-End-Lauf-Test (via attach_streaming_listeners): nach dem Lauf existiert `meta.json` mit `streams`-Block, in dem `gantt_einsatz`/`gantt_schicht`/`reporting_record` `status=="partial"` haben.
    - Der erzeugte `stream.jsonl` enthält für jeden full-Stream mindestens einen Frame; für partial-Streams entweder minimale partial-Frames oder eine dokumentierte leere Golden-Record (Coverage-Lücke sichtbar, D-2.4).
    - `meta.json.drop_count` ist vorhanden (Integer).
    - `engine/src/osim_engine/streaming/attach.py` unverändert seit 01-01 (`git diff --stat` der Datei leer); `core/simulator.py` unverändert (`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` leer).
  </acceptance_criteria>
  <done>Alle 6 Streams abgedeckt (full + partial), meta.json trägt den Status-Block via MetaFinalizeListener, attach.py unangetastet, Tests grün.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Skelett-Slices → Stream-Status | Falsche full/partial-Klassifikation täuscht der UI vollständige Daten vor |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-09 | Repudiation/Integrity | partial vs full Fehlklassifikation in meta.json | mitigate | build_streams_status gegen skeleton-inventory.md gepinnt + Test, der die partial-Klassifikation der drei skelett-abhängigen Streams erzwingt (D-2.2) |
| T-01-10 | Denial of Service | period-end-Aggregat der Schicht/Reporting-Listener | mitigate | period-end-Snapshot statt per-Event-Detail-Schreiben (Q-2/§6.3); Writer-Backpressure aus 01-01 greift |
</threat_model>

<verification>
- O-2: alle 6 Sub-Streams als Vertrag vorhanden.
- D-2.2: meta.json streams-Status-Block maschinenlesbar.
- AC-1/D-2.4: Schema-Tests laufen gegen full UND partial Streams.
</verification>

<success_criteria>
- `cd engine && uv run pytest tests/integration/test_streaming_partial.py -q` grün.
- meta.json eines Demo-Laufs enthält für alle 6 Streams einen Status-Block.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-04-SUMMARY.md` when done. Dokumentiere den finalen meta.json.streams-Block (Tag→status/missing_slices/reason) + die partial-Frame-Minimalfelder je Stream, damit 01-05 das Banner + stream-router korrekt baut.
</output>
