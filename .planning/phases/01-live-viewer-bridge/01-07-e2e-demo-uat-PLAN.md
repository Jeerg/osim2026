---
phase: 01-live-viewer-bridge
plan: 07
type: execute
wave: 4
depends_on: ["01-05", "01-06"]
files_modified:
  - osim-ui/portal/tests/live-stream.spec.ts
  - engine/scripts/demo_stream_run.py
  - .planning/phases/01-live-viewer-bridge/UAT.md
autonomous: false
requirements: [O-4, AC-3, AC-5, AC-6, AC-9]
must_haves:
  truths:
    - "Ein 1000-Event-Demo-Sim auf osim-engine schreibt einen Stream, den osim-ui live als Gantt + KPI zeigt (Latenz < 1s)"
    - "Der E2E-Test belegt, dass die UI neu angehängte JSONL-Zeilen innerhalb < 1s aufnimmt"
    - "Bei UI-Crash/Neustart liest die UI vom gespeicherten Offset weiter, während die Engine weiterschreibt"
    - "Ein manueller C++/Python-Parity-Spot-Check zeigt für eine Demo-Sim gleiche KPI-Werte (±1)"
  artifacts:
    - path: "engine/scripts/demo_stream_run.py"
      provides: "Reproduzierbarer 1000-Event-Demo-Lauf, der runs/<run-id>/stream.jsonl schreibt"
      contains: "attach_streaming_listeners"
    - path: "osim-ui/portal/tests/live-stream.spec.ts"
      provides: "Playwright-E2E: Tail-Pickup < 1s + Stream-Filter + Offset-Restart"
      contains: "test("
    - path: ".planning/phases/01-live-viewer-bridge/UAT.md"
      provides: "UAT-Skript für Demo-Run, Crash-Robustheit (AC-5), C++/Python-Parity-Spot-Check (AC-9)"
      contains: "AC-6"
  key_links:
    - from: "osim-ui/portal/tests/live-stream.spec.ts"
      to: "engine/scripts/demo_stream_run.py"
      via: "E2E konsumiert die vom Demo-Lauf erzeugte stream.jsonl"
      pattern: "stream.jsonl|runs"
    - from: "engine/scripts/demo_stream_run.py"
      to: "streaming/attach.py:attach_streaming_listeners"
      via: "Demo verdrahtet das Streaming"
      pattern: "attach_streaming_listeners"
---

<objective>
End-to-End-Beweis: ein reproduzierbarer 1000-Event-Demo-Lauf der Engine schreibt den Stream, die `/live`-UI zeigt Gantt + KPI live (Latenz < 1s). Plus der Playwright-E2E (`live-stream.spec.ts`) für Tail-Pickup/Filter/Offset-Restart und das UAT-Skript für Crash-Robustheit (AC-5) und den manuellen C++/Python-KPI-Parity-Spot-Check (AC-9).

Purpose: O-4 (Demo Latenz < 1s), AC-3 (Tail < 1s), AC-5 (Engine schreibt weiter, UI restartet vom Offset), AC-6 (1000-Event-Demo ergibt vollständigen Gantt + KPI), AC-9 (Parity-Spot-Check, manuell — D-OP-6).
Output: Demo-Script, E2E-Spec, UAT.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-05-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-06-SUMMARY.md
@./osim-ui/CLAUDE.md

<interfaces>
<!-- attach_streaming_listeners + run-dir: aus 01-01. -->
<!-- /live-Route + stream-router + Komponenten: aus 01-02 / 01-05-SUMMARY.md. -->
<!-- Playwright-Runner: portal/package.json "test:e2e": "playwright test". -->
<!-- Reproduzierbarkeit (osim-ui/CLAUDE.md): Sim-Läufe nur in separaten OS-Prozessen, Seed + (start,end,period_len) identifiziert einen Run. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Demo-Lauf-Script (1000 Events) + Playwright-E2E (Tail < 1s, Filter, Offset-Restart)</name>
  <files>engine/scripts/demo_stream_run.py, osim-ui/portal/tests/live-stream.spec.ts</files>
  <read_first>
    - engine/src/osim_engine/streaming/attach.py (attach_streaming_listeners aus 01-01)
    - engine/tests/integration/test_v3_kpi.py (Sim-Aufbau-Pattern: PSimulator, Plan/Knoten/Kanten, register_plan, .start())
    - .planning/phases/01-live-viewer-bridge/01-05-SUMMARY.md (UI-Komponenten + stream-router-Mapping, data-testids)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §9 AC-3 (UI tail < 1s, E2E in portal/tests/live-stream.spec.ts), AC-4, AC-6 (1000-Event-Demo)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.4 (200ms-Polling), D-OP-2 (run-dir)
    - osim-ui/CLAUDE.md (Reproduzierbarkeit: separate OS-Prozesse, Seed+Datum identifiziert Run)
  </read_first>
  <action>
    `engine/scripts/demo_stream_run.py`: baut einen deterministischen Sim (fester Seed + start/end/period_len) mit genug Knoten/Aufträgen, dass ≥ 1000 Events anfallen, ruft `attach_streaming_listeners(sim, run_dir)` und `sim.start()` über mind. 2 Perioden (damit kpi_auswertung-Frames entstehen). CLI-Args `--run-dir`/Env `OSIM_RUN_DIR` respektieren (D-OP-2). Gibt den finalen run-dir-Pfad auf stdout aus, damit der E2E-Test ihn findet.
    `osim-ui/portal/tests/live-stream.spec.ts` (Playwright): (a) **Tail-Pickup (AC-3/AC-6)** — zeige, dass nach Anhängen neuer Zeilen an eine stream.jsonl die `/live`-UI die neuen Gantt-/KPI-Daten innerhalb < 1s rendert (gegen ein Fixture oder den Demo-Output; bei live-Engine: separater Prozess). (b) **Stream-Filter (AC-4)** — Tab-Wechsel isoliert einen Stream. (c) **Offset-Restart (AC-5-automatisierbarer Teil)** — Reader nimmt nach Reload den Stream ab dem gespeicherten Offset wieder auf, ohne Frames zu doppeln. Nutze data-testids aus 01-05.
  </action>
  <verify>
    <automated>cd engine && uv run python scripts/demo_stream_run.py --run-dir /tmp/osim-demo && cd ../osim-ui/portal && npm run test:e2e -- live-stream.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - `demo_stream_run.py` erzeugt einen run-dir mit `stream.jsonl`, der ≥ 1000 Frames enthält und mindestens je einen `gantt_durchlauf`- und `kpi_auswertung`-Frame hat (AC-6).
    - E2E Tail-Test: nach Anhängen neuer Zeilen erscheinen die zugehörigen UI-Elemente innerhalb < 1s (Playwright-Assertion mit Timeout < 1000ms auf das neue Element) (AC-3).
    - E2E Filter-Test: Tab-Wechsel auf einen Stream zeigt nur dessen Render-Komponente (AC-4).
    - E2E Offset-Restart-Test: nach Reload keine doppelten Gantt-Balken/KPI-Werte (AC-5-Teil).
  </acceptance_criteria>
  <done>Demo-Script erzeugt 1000+-Event-Stream, E2E-Spec (Tail/Filter/Restart) grün.</done>
</task>

<task type="auto">
  <name>Task 2: UAT-Skript — Demo, Crash-Robustheit (AC-5), C++/Python-Parity-Spot-Check (AC-9)</name>
  <files>.planning/phases/01-live-viewer-bridge/UAT.md</files>
  <read_first>
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §9 AC-5 (Engine schreibt weiter, UI restartet vom Offset — Manual UAT), AC-6 (Demo 1000 Events vollständiger Gantt + KPI — UAT-Skript), AC-9 (C++/Python KPI-Parity ±1 — Manual Cross-Check gegen OSim2004-Lauf)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-OP-6 (AC-9 manueller Spot-Check für M1)
    - osim-ui/CLAUDE.md (Default-Test-User-/Link-/Grafik-Viewer-Konventionen aus den User-Memories werden hier referenziert)
  </read_first>
  <action>
    Schreibe `UAT.md` (Deutsch) als manuell ausführbares Verifikations-Skript mit nummerierten Schritten:
    1. **Demo-Run (AC-6):** Engine-Demo starten (`uv run python engine/scripts/demo_stream_run.py`), `/live` öffnen (localhost-Link angeben), bestätigen, dass Gantt-Balken UND KPI-Kacheln gefüllt sind und der Lauf vollständig dargestellt wird.
    2. **Latenz (AC-3/O-4):** während die Engine läuft, beobachten, dass neue Daten innerhalb < 1s sichtbar werden.
    3. **Crash-Robustheit (AC-5):** UI-Tab schließen/Browser neu laden, während die Engine weiterschreibt; bestätigen, dass die Engine ununterbrochen weiter in stream.jsonl schreibt und die neu geladene UI vom gespeicherten Offset ohne Doppelung fortsetzt.
    4. **Schema-Mismatch (AC-7):** meta.json schema_version künstlich auf eine höhere Major-Version setzen, `/live` neu laden, bestätigen: gelbes Warn-Banner, KEIN Crash.
    5. **C++/Python-Parity (AC-9):** denselben Demo-Sim als OSim2004-C++-Lauf fahren, die KPI-Werte (z.B. count_abgeschlossen, durchlaufzeit_avg pro kind) der UI gegen die C++-Auswertung vergleichen; Abweichung ≤ ±1 protokollieren. Tabelle mit Spalten kind / Python-Wert / C++-Wert / Δ vorbereiten.
    Jeder Schritt mit erwartetem Ergebnis + Häkchen-Feld. Verweise auf den localhost-Link und die Default-Test-Konventionen.
  </action>
  <verify>
    <automated>test -f .planning/phases/01-live-viewer-bridge/UAT.md && grep -c "AC-5\|AC-6\|AC-9" .planning/phases/01-live-viewer-bridge/UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - `UAT.md` existiert und enthält nummerierte Schritte für AC-3, AC-5, AC-6, AC-7 und AC-9.
    - Der AC-9-Schritt enthält eine Vergleichstabelle (kind / Python / C++ / Δ) mit der ±1-Toleranz.
    - Der AC-5-Schritt beschreibt explizit den Offset-Restart ohne Frame-Doppelung.
  </acceptance_criteria>
  <done>UAT.md deckt AC-3/5/6/7/9 als manuell ausführbares Skript ab.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human-Verify — End-to-End-Demo + UAT (AC-5/AC-6/AC-9)</name>
  <action>Manuelle Verifikation — keine automatisierte Implementierung. Der Executor pausiert hier und übergibt an den User; siehe <what-built>/<how-to-verify>/<resume-signal>. Alle automatisierbaren Schritte sind in Task 1 (Demo-Script + E2E) bereits ausgeführt.</action>
  <what-built>Demo-Lauf-Script + /live-UI + E2E-Spec + UAT.md. Die Engine schreibt einen 1000-Event-Stream, die UI zeigt live Gantt + KPI; E2E belegt Tail < 1s, Filter und Offset-Restart automatisiert; UAT.md führt durch Crash-Robustheit (AC-5) und den C++/Python-Parity-Spot-Check (AC-9).</what-built>
  <how-to-verify>
    1. Engine-Demo starten: `cd engine && uv run python scripts/demo_stream_run.py` — notieren Sie den ausgegebenen run-dir.
    2. UI starten: `cd osim-ui/portal && npm run dev`, dann http://localhost:3002/live öffnen (Standard-Test-User jwfischer69@gmail.com / 123456).
    3. Bestätigen Sie (AC-6/O-4): Gantt-Balken UND KPI-Kacheln sind gefüllt; neue Daten erscheinen innerhalb < 1s.
    4. Arbeiten Sie UAT.md Schritt 3-5 ab (Crash-Robustheit AC-5, Schema-Mismatch-Banner AC-7, C++/Python-Parity AC-9) und tragen Sie die Parity-Tabelle aus.
    5. Bei Sim-Verifikation den Grafik-Viewer nutzen (nicht den Standard-Viewer).
  </how-to-verify>
  <resume-signal>Schreiben Sie "approved" oder beschreiben Sie Abweichungen (insb. Parity-Δ > 1 oder Latenz > 1s).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Engine-Schreibprozess ↔ UI-Leseprozess | parallele Datei-Zugriffe; UI-Crash darf den Engine-Schreibpfad nicht beeinflussen (AC-5) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-15 | Denial of Service | UI-Crash während Engine schreibt | mitigate | Engine-Schreibpfad ist entkoppelt (append-only, kein UI-Feedback-Channel); UI restartet vom gespeicherten Byte-Offset (AC-5) — im E2E + UAT verifiziert |
| T-01-16 | Integrity | Falsche KPI-Werte gegen C++-Original | mitigate | Manueller C++/Python-Parity-Spot-Check mit ±1-Toleranz (AC-9, D-OP-6); Automatisierung als M3 deferred |
</threat_model>

<verification>
- O-4 / AC-6: 1000-Event-Demo → UI zeigt Gantt + KPI live < 1s.
- AC-3: E2E Tail-Pickup < 1s.
- AC-4: E2E Stream-Filter.
- AC-5: UI-Restart vom Offset (E2E-Teil + UAT).
- AC-9: manueller Parity-Spot-Check (UAT-Checkpoint).
</verification>

<success_criteria>
- Demo-Script erzeugt 1000+-Event-Stream.
- `cd osim-ui/portal && npm run test:e2e -- live-stream.spec.ts` grün.
- UAT.md vorhanden, Human-Verify-Checkpoint "approved".
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-07-SUMMARY.md` when done. Dokumentiere das Demo-Ergebnis (Frame-Count, gemessene Latenz), die E2E-Resultate und das AC-9-Parity-Ergebnis (Δ-Tabelle).
</output>
