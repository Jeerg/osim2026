---
phase: 01-live-viewer-bridge
plan: 03
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - engine/src/osim_engine/insights/classes.py
  - engine/src/osim_engine/streaming/listeners/auswertung.py
  - engine/tests/integration/test_streaming_kpi.py
autonomous: true
requirements: [O-2, O-5, AC-1, AC-9]
must_haves:
  truths:
    - "Der kpi_auswertung-Stream enthält period-end-Aggregate für alle 11 ISimulatorViewerAusw*-Varianten als kind-diskriminierte Frames"
    - "KPI-Counter werden inkrementell pro Event aktualisiert und nur bei on_period_end geflusht (kein O(events)-Pass am Period-Ende)"
    - "Die Insights-Marker-Klassen in classes.py sind echte Counter-Hoster mit Update-Methoden (P5-N Skelett geschlossen)"
    - "Jeder der 11 kind-Werte erscheint mindestens einmal pro Periode als Frame im Stream"
  artifacts:
    - path: "engine/src/osim_engine/insights/classes.py"
      provides: "Counter-Attribute + Update-Methoden auf den Insights-Klassen (P5-N geschlossen)"
      contains: "def update"
    - path: "engine/src/osim_engine/streaming/listeners/auswertung.py"
      provides: "AuswertungListener: incremental Counter + period-end-Flush aller 11 KPI-Kinds"
      contains: "class AuswertungListener"
  key_links:
    - from: "streaming/listeners/auswertung.py"
      to: "insights/classes.py"
      via: "liest Counter-Snapshots der Insights-Aggregatoren"
      pattern: "insights"
    - from: "streaming/listeners/auswertung.py"
      to: "streaming/registry.py:register_listener"
      via: "Selbst-Registrierung beim Import (kein attach.py-Edit)"
      pattern: "register_listener"
---

<objective>
KPI-Aggregation: alle 11 `ISimulatorViewerAusw*`-Varianten als kind-diskriminierte Frames im `kpi_auswertung`-Stream. Die Insights-Marker-Klassen (P5-N) werden zu echten Counter-Hostern; ein `AuswertungListener` aktualisiert Counter inkrementell pro Event und flusht period-end-Snapshots. Der Listener registriert sich über `register_listener` (aus 01-01) selbst — ohne `attach.py` zu editieren (parallel zu 01-04).

Purpose: O-2 (kpi_auswertung als voller Sub-Stream), O-5 (versioniert/schema-fähig), AC-1 (Schema-Tests), AC-9-Basis (KPI-Werte für den C++/Python-Parity-Spot-Check). Schließt zugleich das P5-N-Skelett (D-3.2).
Output: erweitertes `insights/classes.py`, `streaming/listeners/auswertung.py`, `test_streaming_kpi.py`.
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
<!-- Aus insights/classes.py (P5-N Skelett, HEUTE leere Marker — D-3.2 macht sie zu Aggregatoren): -->
class ISimObj(PSimObj): ...
class IInfo / ISimulator / IArbeitszeit / IAuftrag / IBestellauftrag / IFertigungsauftrag
class IBetriebsmittel / IBetrPers / IDurchlaufplan / ILager / IPerson / IProzess / IGonzo

<!-- Hook + Registry (aus 01-01-SUMMARY.md): -->
<!-- AuswertungListener erbt OListenerSimulator, Flush in on_period_end (D-3.1). -->
<!-- register_listener(factory) mit factory: (seq_counter, writer) -> OListenerSimulator. -->
<!-- Writer-Vertrag + Frame + seq_counter: aus 01-01-SUMMARY.md. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Insights-Klassen zu Counter-Hostern erweitern (P5-N schließen)</name>
  <files>engine/src/osim_engine/insights/classes.py, engine/tests/integration/test_streaming_kpi.py</files>
  <read_first>
    - engine/src/osim_engine/insights/classes.py (14 Marker-Klassen — Identität bewahren, nur erweitern; Integration-Point CONTEXT)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-3.1 (incremental Counter, Flush bei on_period_end), D-3.2 (Counter wohnen in insights/classes.py, P5-N-Closure), D-3.4 (period-only, keine Sliding-Windows)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.3 (KPI-Frame-Beispiele: prod_auftrag mit count_gesamt/count_abgeschlossen/count_laufend/count_verspaetet/durchlaufzeit_avg/max/min; betriebsmittel mit auslastung_pct/haupt_nutzungsart/stillstand_pct/ruest_pct), §7.3
    - OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewerAusw*.cpp (11 Files — Aggregations-Logik je Variante, Feldableitung für D-3.3)
    - engine/tests/unit/core/test_day_of_sim_parity.py (Parity/Algorithm-Pinning-Stil als Vorlage)
  </read_first>
  <behavior>
    - Ein IFertigungsauftrag-Aggregator nach 3 abgeschlossenen + 1 verspäteten Auftrag liefert snapshot() mit count_abgeschlossen==3, count_verspaetet==1 und korrektem durchlaufzeit_avg/max/min.
    - Ein IBetriebsmittel-Aggregator berechnet auslastung_pct aus bearbeitungs- vs. period-Zeit.
    - reset()/period-Reset setzt die Counter für die neue Periode zurück (period-only, D-3.4).
    - Counter-Updates sind O(1) pro Event (kein Re-Scan).
  </behavior>
  <action>
    Erweitere die 14 Insights-Klassen in `classes.py` um Counter-Attribute + O(1)-Update-Methoden, ohne ihre Klassen-Identität/Vererbung zu brechen (bestehende OTX-Loader-Konsumenten dürfen nicht brechen). Mappe die 11 KPI-Varianten auf die passenden Aggregator-Klassen:
    `prod_auftrag`→IFertigungsauftrag, `best_auftrag`→IBestellauftrag, `pers`→IPerson, `betr`→IBetriebsmittel, `schicht`→IArbeitszeit/IBetrPers, `kalkulation`→IGonzo, `wschlange`→(Warteschlangen-Aggregat), `nbearbeit`→(Nicht-Bearbeitungs-Aggregat), `kauf`/`eigen`→IAuftrag-Subkinds, `gesamt`→ISimulator (Gesamt-Roll-up). Jede Klasse bekommt:
    - relevante Counter (z.B. `count_gesamt`, `count_abgeschlossen`, `count_laufend`, `count_verspaetet`, `durchlaufzeit_sum`/`_max`/`_min` für Auftrags-Aggregatoren; `bearbeitungs_zeit`, `ruest_zeit`, `stillstand_zeit`, `period_len` für Betriebsmittel),
    - `update_*`-Methoden für die jeweiligen Event-Typen,
    - `snapshot(period_num) -> dict` das die SPEC-§6.3-Felder rechnet (z.B. `durchlaufzeit_avg = sum/count`, `auslastung_pct = bearbeitung/period*100`),
    - `reset_period()` für period-only-Aggregation (D-3.4).
    Für Varianten, deren Quell-Slice heute Skelett ist, liefert `snapshot()` minimale Felder mit Null-/Default-Werten (partial — wird in meta.json markiert via 01-04). Lege `test_streaming_kpi.py` an und pinne die Snapshot-Arithmetik je Aggregator gegen handgerechnete Werte (Stil: test_day_of_sim_parity.py).
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_kpi.py -k "aggregator or snapshot or counter" -x -q</automated>
  </verify>
  <acceptance_criteria>
    - IFertigungsauftrag-Aggregator-Test: nach handgerechneter Event-Folge stimmen count_abgeschlossen, count_verspaetet, durchlaufzeit_avg/max/min exakt (assert auf Zahlenwerte).
    - IBetriebsmittel-Aggregator-Test: auslastung_pct = bearbeitung/period*100 wird korrekt gerechnet (assert auf konkreten Prozentwert).
    - `reset_period()`-Test: nach Reset sind die Counter 0 / leer.
    - Bestehende Insights-Tests laufen weiter: `cd engine && uv run pytest tests/integration/test_p5n_insights.py -q` grün.
    - Jede der 14 Klassen behält ihre Basisklasse (kein `git`-Diff der Vererbungssignaturen außer Erweiterung).
  </acceptance_criteria>
  <done>Insights-Klassen sind Counter-Hoster mit gepinnter Snapshot-Arithmetik, P5-N-Tests grün.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: AuswertungListener — incremental Counter + period-end-Flush aller 11 KPI-Kinds</name>
  <files>engine/src/osim_engine/streaming/listeners/auswertung.py, engine/tests/integration/test_streaming_kpi.py</files>
  <read_first>
    - engine/src/osim_engine/streaming/listeners/lifecycle.py (Listener-Vorlage aus 01-01 — Frame-Bau, seq-Counter, Writer-Nutzung, register_listener-Aufruf am Modul-Ende)
    - engine/src/osim_engine/streaming/registry.py (register_listener + LISTENER_FACTORIES aus 01-01)
    - engine/src/osim_engine/core/simulator.py Z. 123-145 (on_period_end-Fanout — NUR Hook nutzen, kein Eingriff)
    - engine/src/osim_engine/insights/classes.py (Aggregatoren aus Task 1)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-3.3 (ALLE 11 Varianten, kein Top-5; kind-Diskriminatoren: prod_auftrag/best_auftrag/betr/pers/schicht/kalkulation/wschlange/nbearbeit/kauf/eigen/gesamt), D-3.1
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.3 (kpi_auswertung-Frame-Form), §9 AC-1/AC-9
  </read_first>
  <behavior>
    - AuswertungListener.on_sim_ereig aktualisiert inkrementell die Insights-Counter (kein Re-Scan).
    - on_period_end emittiert für JEDE der 11 kinds genau einen Frame stream="kpi_auswertung" mit dem jeweiligen kind + period_num.
    - Über 2 Perioden hinweg erscheinen 2×11 kpi_auswertung-Frames mit korrekten period_num 0 und 1.
    - Das Modul registriert seine Factory via register_listener beim Import (kein attach.py-Edit).
  </behavior>
  <action>
    `AuswertungListener(OListenerSimulator)` in `auswertung.py`: hält Referenzen auf die Insights-Aggregatoren (oder eine Registry davon) + den geteilten seq-Counter + Writer (gleiches Konstruktor-Muster wie LifecycleListener aus 01-01). `on_sim_ereig` ruft die O(1)-`update_*`-Methoden der betroffenen Aggregatoren (incremental, D-3.1). `on_period_end(time)` iteriert die 11 kind-Diskriminatoren, ruft je `snapshot(period_num)`, baut je einen `Frame(stream="kpi_auswertung", v={"kind": <kind>, "period_num": ..., **snapshot})` und schreibt ihn; danach `reset_period()` auf allen Aggregatoren (period-only, D-3.4) und `writer.flush()`. Am Modul-Ende `register_listener(lambda seq, w: AuswertungListener(seq, w))` (aus streaming/registry.py — KEINE Änderung an attach.py/__init__.py; das listeners-Package importiert dieses Modul bereits via die feste Namensliste aus 01-01). Ergänze in `test_streaming_kpi.py` einen Lauf-Test, der die 11 Kinds × Perioden im Stream prüft.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_kpi.py -k "auswertung or eleven or period_end" -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `auswertung.py` enthält `class AuswertungListener(OListenerSimulator)` (`grep -c "AuswertungListener(OListenerSimulator)" auswertung.py` === 1) und ruft `register_listener` (`grep -c "register_listener" auswertung.py` ≥ 1).
    - Lauf-Test über 1 Periode (via attach_streaming_listeners): die kpi_auswertung-Frames im Stream decken ALLE 11 kind-Werte ab — Assertion vergleicht die Menge der gefundenen kinds gegen `{prod_auftrag,best_auftrag,betr,pers,schicht,kalkulation,wschlange,nbearbeit,kauf,eigen,gesamt}` (Gleichheit).
    - Lauf-Test über 2 Perioden: kpi_auswertung-Frames mit `v.period_num` in {0,1}, je 11 Frames pro Periode.
    - `engine/src/osim_engine/streaming/attach.py` ist gegenüber 01-01-Stand unverändert (`git diff --stat` der Datei seit 01-01 leer) — der Listener hängt sich rein über das Registry an.
    - `core/simulator.py` unverändert (`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` leer).
  </acceptance_criteria>
  <done>AuswertungListener emittiert alle 11 KPI-Kinds period-end, self-registriert über register_listener, Tests grün.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sim-Events → Insights-Counter | Read-Side-Aggregation; darf den Kern nicht verlangsamen (SPEC §5, AC-8) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-07 | Denial of Service | KPI-Aggregation am Period-Ende | mitigate | Incremental O(1)-Counter pro Event + period-end-Snapshot statt O(events)-Re-Scan (D-3.1/§7.3) — hält AC-8 (<5% Overhead) |
| T-01-08 | Tampering | Falsche KPI-Werte durch Counter-Drift gegen C++ | mitigate | Snapshot-Arithmetik in test_streaming_kpi.py gegen handgerechnete Werte gepinnt (Parity-Stil); AC-9 Spot-Check manuell (D-OP-6) |
</threat_model>

<verification>
- O-2: kpi_auswertung als voller Sub-Stream mit 11 Kinds.
- AC-1: Snapshot-Arithmetik + Frame-Form getestet.
- AC-9-Basis: KPI-Werte deterministisch und prüfbar für den manuellen C++-Spot-Check.
</verification>

<success_criteria>
- `cd engine && uv run pytest tests/integration/test_streaming_kpi.py -q` grün.
- `test_p5n_insights.py` weiterhin grün.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-03-SUMMARY.md` when done. Dokumentiere die 11 kind-Diskriminatoren + ihre v-Felder, damit die UI (KpiTile/stream-router, 01-05) sie mappen kann, und welche Kinds heute partial sind (für 01-04 meta.json).
</output>
