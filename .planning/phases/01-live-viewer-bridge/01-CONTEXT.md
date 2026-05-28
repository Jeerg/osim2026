# Phase 01: live-viewer-bridge - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

osim-engine emittiert während der Simulation einen Live-JSONL-Stream nach `runs/<run-id>/stream.jsonl`, den osim-ui (TS-App) tail-liest und in 6 typisierte Sub-Streams (Lifecycle, Gantt Durchlauf, Gantt Einsatz, Gantt Schicht, KPI-Auswertung, Reporting Records) rendert. Ersetzt funktional die OSim2004 Gfx-Viewer + ISimulatorViewerAusw*-Familie ohne den Headless-Engine-Kern zu kompromittieren.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 Outcomes + 9 ACs + 6 Sub-Stream-Vereinbarungen sind gelockt.** Siehe `01-SPEC.md` für vollständige Anforderungen, Boundaries und Akzeptanz-Kriterien.

Downstream-Agents MÜSSEN `01-SPEC.md` vor Plan/Implementation lesen. Requirements werden hier nicht dupliziert.

**In Scope (aus SPEC.md §4):**
- Gfx-Family Viewer (PDlplViewerStd, PEinsatzzeitViewer, Schicht-Viewer)
- ISimulatorViewerAusw*-Reporting (Insights-Auswertungen)
- 6 Sub-Streams (lifecycle / gantt_durchlauf / gantt_einsatz / gantt_schicht / kpi_auswertung / reporting_record)
- Listener-only Engine-Integration (kein Kernel-Eingriff)

**Out of Scope (aus SPEC.md §4):**
- Matrix-Viewer (Phase 2)
- Trace-Viewer (Phase 3)
- Connection-Diagramme (Phase 4)
- Bidirektionale UI→Engine-Eingriffe (Phase 5)
- Replay-Mode (Phase 6)
- HTTP/WebSocket-Transport (Phase 7)
- Engine-Kern-Modifikation (hartes Nicht-Ziel, SPEC §5)

</spec_lock>

<decisions>
## Implementation Decisions

### Streaming-Stack-Architektur

- **D-1.1:** Neues Modul `engine/src/osim_engine/streaming/` ist der Stream-Eigentümer. `engine/recorder.py` bleibt unverändert als Low-Level-Event-Trace (Debug/Forensik). Saubere Trennung: `recorder.py` = Audit, `streaming/` = UI-Vertrag.
- **D-1.2:** Streaming-Komponenten erben direkt von `OListenerSimulator` und hängen sich via `sim.attach()` ein. Nutzen den existierenden `on_*(deep=True)`-Fanout. Kein Detour über `observability/bus.py` — der EventBus bleibt observability-only.
- **D-1.3:** Buffering: **Batched-Flush per N Frames + garantierter Flush bei period-end-Listener-Call.** N wird konfigurierbar, Default initial 100 Frames. Erreicht AC-2 (<50ms) bei kleinem N, AC-8 (<5% Overhead) durch reduzierte syscalls.
- **D-1.4:** Schema-Validation läuft **nur in Tests + CI, kein Runtime-Overhead.** Schemas leben in `engine/src/osim_engine/streaming/schemas/`. Vertraut auf typed Frame-Dataclasses + Golden-Record-Tests gegen `tests/integration/test_streaming.py`.

### Skelett-Slice-Strategie

- **D-2.1:** Phase 01 baut **alle 6 Streams ab**. Für Streams, deren Skelett-Slices heute leer sind (gantt_einsatz, gantt_schicht, reporting_record — abhängig von P5-D/L/M), schreibt der Writer minimale partial-Frames + Stream wird in `meta.json` als `partial` markiert. Engine-Vertrag steht ab Phase 01 vollständig, Coverage wächst mit Slice-Closure-Folgephasen.
- **D-2.2:** `meta.json` enthält pro Stream einen **Status-Block**: `streams: { gantt_einsatz: { status: 'partial' \| 'full', missing_slices: ['P5-D'], reason: '...' } }`. UI liest beim Start, zeigt Banner pro Stream. Maschinen-lesbar.
- **D-2.3:** **P5-D (Aufgabe-Status-State-Machine) ist Priorität-1-Slice-Closure** für die Coverage-Folge. Größter Block (27 Stubs), schaltet `gantt_durchlauf`-Status + `reporting_record`-Aufträge frei. Reihenfolge danach: P5-L Generator, P5-M Arbeitszeit.
- **D-2.4:** Tests via **Golden-Stub-Files mit minimal partial-Frames** je Stream. AC-1 Schema-Validation läuft gegen voll-implementierte UND partial-Streams. Coverage-Lücken sind sichtbar als „leere" Golden-Records, nicht als fehlende Tests.

### KPI-Compute-Granularität

- **D-3.1:** **Incremental Counter, Flush bei `on_period_end(deep=True)`.** Jeder Event aktualisiert seine relevanten Counter (z.B. `.count_abgeschlossen`, `.durchlaufzeit_sum`). Bei period-end-Listener wird Snapshot emittiert. SPEC §7.3-Default.
- **D-3.2:** Counter wohnen **in den Insights-Klassen** (`insights/classes.py`). `IBetriebsmittel` / `IPerson` / `IFertigungsauftrag` etc. bekommen Counter-Attribute. **Diese Entscheidung schließt zugleich das P5-N Skelett** — Insights-Klassen werden von Marker-Stubs zu echten Domain-Aggregatoren.
- **D-3.3:** **Alle 11 `ISimulatorViewerAusw*`-Varianten in Phase 01** (User-Direktive „baller alles durch"). Keine Top-5-Reduktion. ProdAuftr / BestAuftr / Betr / Pers / Schicht / Kalkulation / WSchlange / NBearbeit / Kauf / Eigen / Gesamt — alle als Substream-Kinds im `kpi_auswertung`-Stream über `kind`-Diskriminator.
- **D-3.4:** **Period-only Aggregation** — keine Sliding-Windows in Phase 01. Sliding-Window-Aggregate (rolling 7-day avg etc.) kommen mit Phase 6 Replay-Mode.

### osim-ui Integration

- **D-4.1:** **Neue Top-Level-Route `/live`** mit Tab-Auswahl pro Stream-Kategorie. Eigene Hauptseite, eigener Mental-Mode „jetzt schau ich der Sim zu". Wird in der bestehenden Routing-Struktur als neue Route registriert (osim-ui nutzt TanStack-Router laut routeTree.gen.ts).
- **D-4.2:** **Eigener Zustand-Store** in `portal/src/features/live-stream/store.ts`. NICHT in den bestehenden `useNavigatorStore` quetschen — Live-Stream-State hat anderen Lebenszyklus (Tail-Reader, Frame-Buffer, Stream-Filter).
- **D-4.3:** **Reuse `GObject` / `cpoint` / `GObjLink`-Pipeline** für Gantt-Geometrie (Time-Axis-Rendering existiert via osim-ui-Bibliothek). Neu zu bauen: `KpiTile.tsx` (Card mit Zahl + Trend) und `RecordTable.tsx` (virtualisiert, evtl. via `@tanstack/react-table`).
- **D-4.4:** **Tail-Polling alle 200ms** (File-System-Events sind in Electron-Sandbox unzuverlässig). UI-Rendering **gethrottled auf max 30 Hz** mit Frame-Coalescing bei Backpressure-Spitzen. Render-Skipping wenn Throughput übersteigt.

### Operative Defaults (aus SPEC §11 Q-3 bis Q-8)

- **D-OP-1 (Q-3 run-id):** ISO-Timestamp + 4-stelliger seq. Format: `2026-05-28T14-33-12-0001`.
- **D-OP-2 (Q-4 run-dir):** Default `./runs/`. Override per `OSIM_RUN_DIR` env-var oder `--run-dir` CLI-Flag.
- **D-OP-3 (Q-5 backpressure):** Bounded buffer 10.000 Frames, **drop ältester** mit Warn-Log + Drop-Counter in `meta.json`. Sim wird nie blockiert (SPEC §5 hartes Nicht-Ziel).
- **D-OP-4 (Q-6 schema-mismatch):** **Best-Effort + Warning** — UI rendert was sie versteht, zeigt gelbes Banner „einige Daten möglicherweise unvollständig" bei Major-Mismatch. **(Abweichung vom SPEC-Default „Hard-Block" — User-Override 2026-05-28 für Demo-Flow-Kontinuität).**
- **D-OP-5 (Q-7 recorder.py):** `engine/recorder.py` läuft parallel zum neuen Stream, **wird nicht ersetzt**. recorder.jsonl = Low-Level-Debug, stream.jsonl = Viewer-Vertrag.
- **D-OP-6 (Q-8 C++/Python parity):** **Manueller Spot-Check** für M1 (AC-9). Automatisierung ist M3-Forschungsphase.

### Claude's Discretion

Folgende Bereiche entscheidet der Plan-Phase- bzw. Execute-Agent:
- Konkrete Frame-Field-Namen für noch nicht durch SPEC §6.3 vorgegebene Felder
- Pydantic vs Dataclass für Frame-Struktur (Pydantic erlaubt Schema-Export, Dataclass leichter)
- Exakte Buffer-Größe N für D-1.3 (zwischen 50-200, abhängig von Throughput-Benchmark)
- File-Watcher-Library auf UI-Seite (Polling-only-Strategie steht durch D-4.4)
- Anordnung der Tabs in `/live`-Route

</decisions>

<canonical_refs>
## Canonical References

**Downstream-Agents MÜSSEN diese vor Planung oder Implementierung lesen.**

### Phase-eigene Verträge
- `.planning/phases/01-live-viewer-bridge/01-SPEC.md` — Gelockte Requirements, 6 Stream-Vereinbarungen, Frame-Schema, ACs. **Pflicht-Lektüre vor allem anderen.**

### Codebase-Quelle (Python — osim-engine)
- `engine/src/osim_engine/core/listener.py` — `OListenerSimulator`-Basis für D-1.2-Subklassen
- `engine/src/osim_engine/core/simulator.py` — `on_*(deep=True)`-Fanout-Mechanik (insb. Z. 82-225)
- `engine/src/osim_engine/recorder.py` — Existierender Low-Level-Trace-Writer, bleibt für D-OP-5 parallel
- `engine/src/osim_engine/observability/bus.py` — EventBus (nicht für D-1.2 verwendet, aber existiert)
- `engine/src/osim_engine/insights/classes.py` — P5-N Marker-Klassen, werden in D-3.2 zu KPI-Counter-Hostern

### Codebase-Quelle (TypeScript — osim-ui)
- `osim-ui/portal/src/routeTree.gen.ts` — Routing-Generierung für D-4.1 neue `/live`-Route
- `osim-ui/portal/src/` (Suchbasis für `useNavigatorStore`, `apiFetch`-Pattern, GObject-Familie)

### C++-Referenz (OSim2004, read-only für Algorithmik)
- `OSim2004/OSimV01(Fj)/OSimBase/OSimulator.cpp` L48-160 (Start), L374-470 (EvtDoNext), L1113-1156 (Send*) — Listener-Fanout-Pattern als Referenz für D-1.2
- `OSim2004/OSimV01(Fj)/OSimPro/PDlplViewerStd.cpp` (10.425 LoC) — Datenstruktur-Spec für `gantt_durchlauf`-Stream
- `OSim2004/OSimV01(Fj)/OSimPro/PEinsatzzeitViewer.cpp`, `PEinsatzViewer.cpp` — `gantt_einsatz`-Stream
- `OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewerAusw*.cpp` (11 Files) — KPI-Aggregations-Logik für D-3.3
- `OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewer{Schicht,Pers,Betr,ProdAuftr,BestAuftr,Relationen}.cpp` — Reporting-Record-Felder

### Begleit-Dokumente
- `docs/skeleton-inventory.md` — 95 Skelett-Marker, treibt D-2.1 / D-2.3 / D-2.4
- `engine/tests/unit/core/test_day_of_sim_parity.py` — Parity-Pattern (Algorithm-Pinning), Stil-Vorlage für `tests/integration/test_streaming.py`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Python)
- **`engine/recorder.py`** — Buffered JSONL-Writer mit `emit()` + Context-Manager (`__enter__`/`__exit__`). Nicht direkt erweitern (D-1.1), aber Pattern für Buffering-Code übernehmen (Recorder-Klasse Z. 31-51).
- **`core/listener.py:OListenerSimulator`** — D-1.2-Hook-Punkt. Hat `on_sim_begin`, `on_period_begin`/`end`/`break`/`reset`, `on_sim_ereig` als Default-Empty-Methoden. Subklassen überschreiben und werden via `sim.attach()` registriert.
- **`core/simulator.py:OSimulator.on_period_begin/end/break/reset`** — fanned out per `for listener in self._sim_listeners: listener.on_period_*(time)`. Ist deterministisch — Reihenfolge = Registration-Reihenfolge.
- **`insights/classes.py`** — 14 Marker-Klassen (IInfo / ISimulator / IArbeitszeit / IAuftrag / IBestellauftrag / IFertigungsauftrag / IBetriebsmittel / IBetrPers / IDurchlaufplan / ILager / IPerson / IProzess / IGonzo / ISimObj). D-3.2 macht sie zu Counter-Hostern.

### Reusable Assets (TypeScript / osim-ui)
- **`portal/src/` GObject/cpoint/GObjLink-Familie** — 2D-Geometrie-Primitives (Top-God-Nodes laut graphify). D-4.3 nutzt sie für Gantt-Zeilen.
- **`portal/src/` apiFetch-Helper** — bestehendes HTTP-Helper-Pattern. Für Live-Stream nicht direkt verwendet (File-basiert in M1), aber Pattern-Konvention.
- **`portal/src/` useNavigatorStore (Zustand)** — Existing State-Mgmt-Pattern. D-4.2 baut **parallel** dazu eigenen Store für Streaming-State.
- **TanStack-Router** (laut `routeTree.gen.ts`) — Routing-System. D-4.1 fügt neue `/live`-Route ein.

### Established Patterns
- **Listener-Fanout via `deep=True`**: `OSimulator.on_period_end(deep=True)` ruft sowohl `child.on_period_end(deep=True)` als auch `listener.on_period_end(time)` an. D-1.2 baut auf diesem Idiom auf.
- **Skelett-Slice-Marker**: Stubs sind via Docstring `Slice P5-X Skelett` markiert (siehe `docs/skeleton-inventory.md`). D-2.1 partial-Stream-Detection prüft im Insights-Klassen-Code, ob abhängige Slices noch Skelett sind, und setzt entsprechend `meta.json:streams.<n>.status`.
- **Day-of-Sim-Arithmetik**: `get_days_from_begin(szeit) = szeit // 86400`. Period-Boundary-Berechnungen folgen demselben Pattern (siehe `test_day_of_sim_parity.py`).

### Integration Points
- **Engine-Listener-Registry** (`OSimulator._sim_listeners`): D-1.2-Komponenten werden hier eingehängt. Bestehende `OListenerSimulator`-Implementierungen (z.B. in PSimulator-Subklassen) bleiben unberührt.
- **`insights/classes.py`-Module-Level**: D-3.2 erweitert die 14 Marker-Klassen um Counter-Attribute + Update-Methoden. Bestehende Code-Konsumenten brechen nicht (Klassen behalten ihre Identität).
- **`portal/src/features/`-Directory** (osim-ui-Konvention für Feature-Module): D-4.1 / D-4.2 / D-4.3 leben unter `features/live-stream/`.
- **`runs/`-Directory am Repo-Root**: D-OP-2-Default. Wird via D-OP-2 zu `.gitignore` ergänzt (Folge-Task).

</code_context>

<specifics>
## Specific Ideas

- **„Baller alles durch" (User-Direktive 2026-05-28):** Bei nicht-architektonischen Implementierungs-Detail-Fragen sollen Defaults gewählt und Plan/Execute fortgesetzt werden, statt Mikro-Verhandlung. Maßgeblich für D-3.3 (alle 11 KPI-Varianten) und für die operativen Defaults in D-OP-1 bis D-OP-6.
- **Best-Effort-Schema-Mismatch (D-OP-4):** Vom SPEC-Default „Hard-Block" zu „Warning" überschrieben. Begründet durch Demo-Flow-Kontinuität — bei UAT soll die UI nie hart abbrechen, lieber gelbes Banner zeigen.
- **Listener-only-Engine-Integration (SPEC §5 + D-1.2):** Heiliges Nicht-Ziel der gesamten Phase. Plan/Execute-Agent darf keine Änderung an `core/simulator.py:start()`, `evt_do_next()`, oder anderen Kernel-Methoden machen. Streaming ist add-on.

</specifics>

<deferred>
## Deferred Ideas

- **Sliding-Window-Aggregate** (7-day rolling avg, p95 over last hour, etc.) — kommt mit Phase 6 Replay-Mode oder eigene Phase, nicht hier.
- **HTTP/WebSocket-Transport** für den Stream — explizit SPEC §4 Out-of-Scope (Phase 7).
- **Bidirektionale Engine-Steuerung via UI** (User klickt → Engine pausiert/spuriert) — Phase 5.
- **Matrix-/Trace-/Connection-Viewer** — Phasen 2-4 (Reihenfolge frei).
- **C++/Python-Parity-Automatisierung** — M3-Forschungsphase, nicht Phase 01.
- **Hard-Block-Mode für Schema-Mismatch** — User-Override 2026-05-28 entschied für Best-Effort; Hard-Block könnte als zusätzlicher Config-Mode später nachgezogen werden (`OSIM_SCHEMA_STRICT=1`).
- **Konkrete Phasen-Nummern für P5-D/L/M-Slice-Closure** — D-2.3 priorisiert nur die Reihenfolge, nicht die Phasen-Nummern. Werden in eigenen `/gsd:phase`-Calls vergeben.

</deferred>

---

*Phase: 01-live-viewer-bridge*
*Context gathered: 2026-05-28*
