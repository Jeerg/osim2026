---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-29T16:00:00.000Z"
current_phase: 01-live-viewer-bridge
current_plan: "01-12"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 12
  completed_plans: 12
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
  - "01-08: Sim-Lauf als separater OS-Prozess (subprocess.Popen von run_otx), NIE Thread/inline (Reproduzierbarkeitsvertrag)"
  - "01-08: --pace = reine Wall-Clock-Drossel am Flush-/Period-Boundary; Stream byte-identisch pace 0 vs >0 (PAWLICEK-LCG unangetastet); server-default 0.2s"
  - "01-08: run_otx gibt RUN_DIR= FRUEH aus (vor Pacing-Schleife, geflusht); RunService liest ohne blockierendes wait — paced Lauf laeuft live weiter"
  - "01-08: Run-Ownership via run_meta.json + tenant-praefixierter Pfad; KEINE DB-Tabelle/Migration; ReadFn-Vertrag {text,next_offset} fuer 01-09; periods-Cap 24"
  - "01-08: osim-ui-venv psycopg-Treiber fehlt + stale uv.sources -> 4 Endpoint-Tests ehrlich geskippt (needs_app_import), Logik gruen via Service-Pfad (deferred-items.md)"
  - "01-09: Topbar-Nav als neues zentriertes <nav> (3. Flex-Kind) zwischen Wordmark + gelockter 3FLS-Rechts-Gruppe; Links Live/Bibliothek, aktiv via activeProps font-weight+Unterstrich (nicht nur Farbe), Token-Focus-Ring"
  - "01-09: Modell-Picker als natives <select> (nicht Radix) fuer E2E-Robustheit; KEIN E2E--Filter im /live-Picker (anders als models/index); read via useMemo run-getrieben (noopRead nur run-loser Default)"
  - "01-09: Store-Reset bei Run-(Re-)Start gegen Frame-Vermischung (T-LIVE-FE-03); fetchRunMeta best-effort, coverage_ratio<1 als Hinweis gesurfaced; data-testids fuer 01-10-E2E exponiert"
  - "01-10: E2E live-stream.spec.ts entpinnt (test.fixme weg, 3 aktive Tests AC-3/AC-4/AC-5); realer PACED Run ueber /live-UI statt Test-Schreibpfad; append()/ganttFrame()/test-erfundene IDs (FA-LIVE-001 etc.) entfernt"
  - "01-10: Modell-Weg = Upload (nicht Seed), E2E-live-<ts> via bestehenden Upload-Flow + DELETE-Cleanup; deterministische auftrag_id aus erster gantt-row im DOM gelesen (vom Lauf selbst produziert), AC-5 toHaveCount(1) dagegen"
  - "01-10: NO-FIXME+eslint+tsc clean; Live-Playwright-Run stack-/UAT-abhaengig (psycopg/uv-sources-Gap) -> AC-3/AC-5 erst gegen laufenden Dev-Stack (3 passed) bewiesen, NICHT gefaelscht; Human-Check PENDING"
  - "01-11: Analyse-Feldsaetze 1:1 gegen ../OSim2004 ISimulatorViewerAusw*.cpp gepinnt (keine erfundene Generik mehr); now-buildable prod_auftrag/nbearbeit/wschlange mit echten records, slice-gated pers/betr/kauf/eigen/kalkulation/gesamt/schicht mit null + missing_slice"
  - "01-11: best_auftrag im headless-Port quellenlos (kein m_bestell-Modell) -> gated (leere records + missing_slice), nicht erfunden; gantt_schicht = person/schichten/ueberstunden/einheiten (ISimulatorViewerSchicht) statt soll-/iststunden"
  - "01-12: /live-Tabs aus VIEWER_TABS (echte OSim-Labels: Durchlaufplan/Einsatzzeit/Schicht/Gesamt/Produktionsauftraege/...) statt roher Stream-Tags"
  - "01-12: Durchlaufplan = Default-/Primaer-Grafik-Viewer; Lauf-START aus generischer Button-Leiste IN den Grafik-Viewer verschoben (FSimulatorViewerGfx-treu: Start/Pause/Reset ueber dem Live-Render-Canvas); Pause/Reset honestly disabled (headless-Port hat nur Start)"
  - "01-12: AuswertungTable 3 Render-Modi (records/snapshot/sections) je kind; Spalten-keys an 01-11-Feldnamen gebunden, Header 1:1 .cpp; slice-gated -> '(Slice offen)' (T-01-12A), nie 0/erfunden"
last_session:
  stopped_at: "Completed 01-12-PLAN.md (gap_closure: UI echte OSim2004-Viewer + Grafik-Viewer-Pflicht). viewer-config + AuswertungTable/SchichtTable/DurchlaufplanGantt; /live traegt echte OSim-Viewer-Tabs, Durchlaufplan ist Default-/Primaer-Grafik-Viewer und der Lauf wird VON IHM aus gestartet (FSimulatorViewerGfx-treu) statt ueber generische Standard-Flaeche. 42 live-stream-Tests gruen, 6 touched files lint(0 err)+tsc-clean. Phase 01: 12/12 Plaene"
  resume_file: "None"
---
