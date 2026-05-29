---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-29T10:25:00.000Z"
current_phase: 01-live-viewer-bridge
current_plan: "01-07"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 7
  completed_plans: 7
  percent: 100
decisions:
  - "01-01: Frame als @dataclass(slots=True) statt Pydantic (D-1.4)"
  - "01-01: geteilter SeqCounter-Objekt (streaming/seq.py) für globale monotone seq"
  - "01-01: gantt_durchlauf status='unbekannt' solange P5-D Skelett (partial-Stream)"
  - "01-02: eigener Zustand-Store useLiveStreamStore (D-4.2), getrennt vom Modellierungs-State"
  - "01-02: Tail-Reader mit Byte-Offset-Seek + Carry-Puffer für halbe letzte Zeile (T-01-04), restart-fest (AC-5-Basis)"
  - "01-02: Per-Stream-Buffer-Cap MAX_FRAMES_PER_STREAM=10000 + 30Hz-Render-Coalescing (T-01-05/D-4.4)"
  - "01-03: Insights-Klassen sind Period-Aggregatoren (P5-N geschlossen, D-3.2); kpi_auswertung mit 11 kinds via AuswertungListener"
  - "01-03: KPI period_num = m_periodNum-1 (Kern incrementet vor Listener-Fanout); kauf/eigen=IAuftrag-Subkinds, gesamt=ISimulator-Roll-up"
  - "01-04: alle 6 Sub-Streams abgebaut; gantt_einsatz/gantt_schicht/reporting_record + kpi_auswertung partial in meta.json (missing_slices P5-D/L/M)"
  - "01-04: meta.json-Finalize via MetaFinalizeListener im Registry (idempotent), attach.py/__init__.py/core/simulator.py unangetastet (SPEC §5)"
  - "01-05: UI-Render-Schicht komplett — KpiTile (N/N-1-Trend, Symbol+Text A11y) + RecordTable (@tanstack/react-table, Sort/Filter, Windowing-Cap) + StreamRouter (Tag-Multiplex, AC-4) + PartialBanner"
  - "01-05: schema_version-Major-Mismatch = best-effort schemaMismatch-Flag im Store + gelbes Warn-Banner, KEIN Hard-Block/Crash (D-OP-4, AC-7)"
  - "01-06: 6 JSON-Schemas (Draft 2020-12) + Golden-Record-Tests (full+partial+Negativ-Pin) via jsonschema; schema_version=1.0 (O-5, AC-1)"
  - "01-06: AC-2 Latenz p95=2.5ms (<50ms); AC-8 als Option 2 (honestly-relaxed) — Write-Path-Overhead 15.3% (<20% best-of-11) statt literaler <5% full-vs-no-streaming (User-Entscheid, Deviation)"
  - "01-06: batch_n-Default 100 unveraendert (Option 1 = Bump auf 200 verworfen); literales AC-8 verlangte Background-Thread, von DISCUSSION-LOG Q1.3 fuer Phase 01 verworfen -> deferred"
  - "01-07: Demo-Lauf verifiziert 2017 Frames (0 Schema-Fehler, gantt+kpi vorhanden, seq monoton); /live->StreamRouter verdrahtet (01-05-Stub geschlossen)"
  - "01-07: E2E live-stream.spec.ts test.fixme (ehrlich pending) bis Backend-Stream-Read-Endpoint (M2/SPEC §4); Human-Verify-Checkpoint (Browser-UAT/AC-9-Parity) offen — NICHT gefaelscht"
last_session:
  stopped_at: "Completed 01-07-e2e-demo-uat-PLAN.md (autonome Anteile); Human-Verify-Checkpoint offen"
  resume_file: ".planning/phases/01-live-viewer-bridge/UAT.md"
---
