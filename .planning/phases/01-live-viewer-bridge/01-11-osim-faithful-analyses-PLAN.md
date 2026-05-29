---
phase: 01-live-viewer-bridge
plan: 11
type: execute
wave: 1
depends_on: []
gap_closure: true
autonomous: true
requirements: [O-2, O-3]
files_modified:
  - engine/src/osim_engine/insights/classes.py
  - engine/src/osim_engine/streaming/listeners/auswertung.py
  - engine/src/osim_engine/streaming/listeners/schicht.py
  - engine/src/osim_engine/streaming/schemas/kpi_auswertung.json
  - engine/src/osim_engine/streaming/schemas/gantt_schicht.json
  - engine/tests/integration/test_streaming_kpi.py
  - engine/tests/integration/test_streaming_schema.py
user_setup: []

must_haves:
  truths:
    - "Jede der 11 kpi_auswertung-kinds trägt die EXAKTEN OSim2004-Feldnamen aus dem zugehörigen ISimulatorViewerAusw*.cpp (keine erfundenen Generik-Felder)"
    - "Die now-buildable Analysen (prod_auftrag/best_auftrag/nbearbeit/wschlange) liefern echte Werte aus dem aktuellen Engine-State (Auftrags-/Warteschlangen-Listen), keine Null-Defaults"
    - "Die slice-gated Analysen (pers/betr/kauf/eigen/kalkulation/gesamt/schicht) tragen die echten OSim-Feldnamen, aber mit gated/null Werten + einem missing_slice-Marker je Feld-Gruppe"
    - "Der gantt_schicht-Stream trägt die echten Schicht-Viewer-Spalten (person/schichten/ueberstunden/einheiten) statt soll-/iststunden"
    - "Engine-pytest (test_streaming_kpi + test_streaming_schema) ist grün auf dem Host"
  artifacts:
    - path: "engine/src/osim_engine/insights/classes.py"
      provides: "Insights-Aggregatoren mit den exakten OSim-Feldsätzen je Analyse"
      contains: "soll_beginn_tag"
    - path: "engine/src/osim_engine/streaming/listeners/auswertung.py"
      provides: "AuswertungListener füllt now-buildable real, slice-gated mit missing_slice-Marker"
      contains: "missing_slice"
    - path: "engine/src/osim_engine/streaming/schemas/kpi_auswertung.json"
      provides: "JSON-Schema mit den echten OSim-Feldern je kind"
      contains: "best_termin_tag"
  key_links:
    - from: "engine/src/osim_engine/streaming/listeners/auswertung.py"
      to: "engine/src/osim_engine/insights/classes.py"
      via: "Aggregator-snapshot() pro kind"
      pattern: "snapshot\\(period_num\\)"
    - from: "engine/src/osim_engine/streaming/listeners/auswertung.py"
      to: "engine/src/osim_engine/streaming/schemas/kpi_auswertung.json"
      via: "Frame v erfüllt das per-kind-Schema"
      pattern: "kpi_auswertung"
---

<objective>
Die 11 OSimINSIGHTS-Auswertungen und den Schicht-Stream auf die **exakten
OSim2004-Feldsätze** umstellen — gepinnt 1:1 gegen die `ISimulatorViewerAusw*.cpp`
und `ISimulatorViewerSchicht.cpp`. Die vorherige Implementierung (01-03) hat
generische Felder erfunden (count_gesamt, durchlaufzeit_avg, auslastung_pct für
alle), statt die echten OSim-Spalten zu führen. Dieser Plan ersetzt die Generik
durch die wahren Feldnamen je Analyse.

Now-buildable Analysen (Daten existieren im headless-Port) werden mit echten
Werten gefüllt: prod_auftrag, best_auftrag, nbearbeit (Auftrags-Listen),
wschlange (Warteschlangen je Betriebsmittel). Slice-gated Analysen (pers, betr,
kauf, eigen, kalkulation, gesamt, schicht — abhängig von Kosten-/Bestands-/
Arbeitszeit-Slices, SPEC R-1) tragen die echten Feldnamen, aber mit
null/gated-Werten plus einem `missing_slice`-Marker pro Feld-Gruppe. NIEMALS
erfundene Platzhalter-Zahlen.

Purpose: O-2 (faithful sub-streams) + O-3 (faithful analyses) ehrlich erfüllen —
die UI (01-12) bekommt die wahre OSim-Struktur, nicht eine Erfindung.
Output: erweiterte insights/classes.py + auswertung.py + schicht.py + zwei
JSON-Schemas + aktualisierte Golden-/Schema-Tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-03-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-04-SUMMARY.md
@.planning/STATE.md

<interfaces>
<!-- Aktueller Engine-Zustand, der erweitert wird (read-only zum Verständnis) -->

Aktuelle Insights-Aggregator-Basis (insights/classes.py):
- `ISimObj.snapshot(period_num) -> dict` / `ISimObj.reset_period()` — Aggregator-Protokoll
- `IAuftrag` hostet count_gesamt/count_abgeschlossen/durchlaufzeit_* (GENERIK — wird ersetzt)
- `IBetriebsmittel`/`IPerson` hosten auslastung_pct (GENERIK — wird ersetzt)
- `IGonzo` hostet kosten_sum (GENERIK — wird ersetzt)
- `IArbeitszeit` hostet sollstunden/iststunden (GENERIK — wird durch Schicht-Felder ersetzt)

Aktueller AuswertungListener (streaming/listeners/auswertung.py):
- `_kinds: tuple[(str, aggregator)]` — feste kind→Aggregator-Map
- `on_sim_ereig()` — O(1)-Counter-Updates pro Event (best-effort read-only)
- `on_period_end(time_end)` — flusht je kind einen Frame v={kind, period_num, **snapshot}
- partial-Marker via `streaming/partial.py:is_slice_skeleton("P5-D"|"P5-L"|"P5-M")`

Engine-Listener-Vertrag (SPEC §5, HEILIG): NUR OListenerSimulator-Subklassen,
KEIN Eingriff in core/simulator.py oder den Event-Loop. Read-Side only.
</interfaces>

<osim_field_reference>
<!-- 1:1 gepinnt gegen die .cpp — diese Feldsätze sind der Vertrag. -->

NOW-BUILDABLE (echte Werte aus aktuellem Engine-State):
- prod_auftrag (ISimulatorViewerAuswProdAuftr.cpp): Zeilen-Records mit Spalten
  Teil(beschreibung) · Menge · Soll-Beginntermin(Tag). Feldnamen:
  teil, menge, soll_beginn_tag, beschreibung. Quelle: m_fauftr je IInfo,
  m_durch->m_name (teil), m_auftr_meng (menge), m_beg_termin (soll_beginn_tag),
  Tochter-Lager m_beschr (beschreibung). Leere (m_durch==NULL) überspringen.
- best_auftrag (ISimulatorViewerAuswBestAuftr.cpp): Teil · Menge · Bestelltermin(Tag)
  · Auftragstyp · Beschreibung. Feldnamen: teil, menge, best_termin_tag,
  auftrags_typ ("normal"|"eil"), beschreibung. Quelle: m_bestell je IInfo,
  m_lager->m_name, m_best_menge, m_best_termin, m_best_typ (btNormal->"normal"),
  m_lager->m_beschr. Leere (m_lager==NULL) überspringen.
- nbearbeit (ISimulatorViewerAuswNBearbeit.cpp): "NICHT ABGEARBEITETE
  PRODUKTIONSAUFTRÄGE". Zeilen: zu_produz_teil · menge · beginntermin. Feldnamen:
  teil, menge, beginntermin. Filter: nur Aufträge mit Status fsEinlast.
- wschlange (ISimulatorViewerAuswWSchlange.cpp): pro Betriebsmittel mit
  nicht-leerer Warteschlange je Prozess eine Zeile. Spalten: Betriebsmittel ·
  zu_produz_teil · Restmenge · aktueller Status. Feldnamen: bm_name, teil,
  restmenge, wartestatus, op (optional). wartestatus ∈ {"wartet_vor_bm",
  "unterbrochen", "wartet_material", "wartet_personal"}; bei Material zusätzlich
  material-Name. Quelle: m_betr->m_wart_schl, m_rest_meng, m_wstatus/m_pattr.

SLICE-GATED (echte Feldnamen, gated/null + missing_slice-Marker):
- pers (ISimulatorViewerAuswPers.cpp, 8 Spalten): name, schichten,
  ueberstunden_pct, kann_kap_pct, auslastung_pct, kosten_pro_arbeitsstd (m_fpk),
  kalk_stundensatz (m_kalk_stusatz), gesamtkosten_periode (m_gesamt_kost).
  missing_slice: "P5-M" (+ Kosten-Slice).
- betr (ISimulatorViewerAuswBetr.cpp, 5 Spalten): name, fixkosten_pro_stunde
  (m_fbk), kosten_pro_arbeitsstd (m_vbk), kalk_stundensatz (m_kalk_stusatz),
  gesamtkosten_periode (m_gesamt_kost). missing_slice: Kosten-Slice.
- kauf (ISimulatorViewerAuswKauf.cpp, 10 Spalten, "LAGERINHALT (KAUFTEILE)"):
  teil(name), aktueller_bestand (m_bestand_meng), verbrauchte_teile (m_num_abbuch),
  gelieferte_teile (m_num_zubuch), vergebliche_anforderung (m_num_vergeb),
  teilewert_gesamt (m_fmk), teilewert_neuteile (m_wert_teil), bestellkosten
  (m_kost_besch), lagerhaltungskosten (m_kost_lager), kapitalkosten (m_kost_zins).
  missing_slice: Bestands-/Kosten-Slice. Filter ltKauf.
- eigen (ISimulatorViewerAuswEigen.cpp, 11 Spalten, "LAGERINHALT
  (EIGENFERTIGUNGSTEILE)"): teil(name), aktueller_bestand, prod_menge
  (m_num_zubuch), verbr_menge (m_num_abbuch), teilewert_gesamt (m_fmk),
  teilewert_neuteile (m_wert_teil), eingehend_teile (m_kost_eingteil),
  betrm_kosten (m_kost_bm), personalkosten (m_kost_pers), lagerhaltungskosten
  (m_kost_lager), kapitalkosten (m_kost_zins). Filter ltEigen|ltProdukt.
- kalkulation (ISimulatorViewerAuswKalkulation.cpp): Kostenkalkulation-Block:
  last_lgw, betr_kost, pers_kost, lager_kost, kapit_kost, besch_kost, teile_kost,
  lagerwertabgang_p1/p2/p3, berechneter_lagerwert (lgw_calc). Lagerkalkulation-
  Block (K/E/P-Teile): last_lgw_k/e/p, lga_k/e/p_teile, lgz_k/e/p_teile,
  lgw_k/e/p_teile, lgw_fertig, lgw_aktuell. missing_slice: Kosten-/Bestands-Slice.
- gesamt (ISimulatorViewerAuswGesamt.cpp): Gesamtergebnis: verkaufserloes
  (m_verk_erloes). Verkaufsergebnisse je Produkt 1-3: vertriebswunsch
  (m_vwunsch), absatz (m_vsale), herstellkosten (m_hst_kosten), verkaufspreis
  (m_vpreis), erloes (abgeleitet). Kennzahlen: verf_kapazitaet_pct (m_kann_kap),
  auslastung_pct (m_auslastung), lieferfaehigkeit_pct (m_lieferfgk),
  mittl_herstellkosten, mittlerer_lagerwert (m_lgw_mittel). missing_slice:
  Sales-/Kosten-Slice.
- schicht (ISimulatorViewerSchicht.cpp, gantt_schicht-Stream, 4 Spalten):
  person, schichten (m_schichten), ueberstunden (m_ueberst), einheiten
  (m_einheiten). missing_slice: "P5-M". ERSETZT die alten soll-/iststunden-Felder.
</osim_field_reference>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Insights-Aggregatoren auf die echten OSim-Feldsätze umstellen</name>
  <files>engine/src/osim_engine/insights/classes.py, engine/tests/integration/test_streaming_kpi.py</files>
  <read_first>
    - engine/src/osim_engine/insights/classes.py (gesamter aktueller Stand — Generik-Felder werden ersetzt)
    - ../OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewerAuswProdAuftr.cpp + ISimulatorViewerAuswBestAuftr.cpp + ISimulatorViewerAuswNBearbeit.cpp + ISimulatorViewerAuswWSchlange.cpp (now-buildable: exakte Zeilen-Felder)
    - ../OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewerAuswPers.cpp + ISimulatorViewerAuswBetr.cpp + ISimulatorViewerAuswKauf.cpp + ISimulatorViewerAuswEigen.cpp + ISimulatorViewerAuswKalkulation.cpp + ISimulatorViewerAuswGesamt.cpp (slice-gated: exakte Feldnamen)
    - ../OSim2004/OSimV01(Fj)/OSimINSIGHTS/ISimulatorViewerSchicht.cpp (Schicht: person/schichten/ueberstunden/einheiten)
    - das <osim_field_reference>-Block oben (verbindlicher Feld-Vertrag)
    - engine/tests/integration/test_streaming_kpi.py (aktuelle gepinnten KPI-Tests, werden auf die echten Felder umgestellt)
  </read_first>
  <behavior>
    - prod_auftrag-Aggregator: snapshot() liefert {kind-Felder, records: [{teil, menge, soll_beginn_tag, beschreibung}]} aus den in der Periode gesehenen Fertigungsaufträgen; leere Einträge ausgelassen.
    - best_auftrag-Aggregator: snapshot() liefert records [{teil, menge, best_termin_tag, auftrags_typ, beschreibung}]; auftrags_typ ∈ {"normal","eil"}.
    - nbearbeit-Aggregator: snapshot() liefert records [{teil, menge, beginntermin}] nur für Aufträge mit Einlast-Status.
    - wschlange-Aggregator: snapshot() liefert records [{bm_name, teil, restmenge, wartestatus, op?}] je wartendem Prozess; wartestatus aus dem dokumentierten Set.
    - pers/betr/kauf/eigen/kalkulation/gesamt: snapshot() liefert die echten OSim-Feldnamen, aber mit Wert null und je Record/Block ein missing_slice (z.B. "P5-M" oder "Kosten-Slice").
    - Test: für jede der 11 kinds ein gepinnter snapshot()-Aufruf gegen einen Mini-Fixture-State, der die exakten Feldnamen + (now-buildable) echten Werte bzw. (slice-gated) null+missing_slice prüft.
    - Test: reset_period() nullt die now-buildable Record-Sammler; period_num bleibt im snapshot.
  </behavior>
  <action>
    Ersetze in insights/classes.py die generischen Counter-Felder durch die
    OSim-treuen Feldsätze aus dem <osim_field_reference>-Block. Behalte die
    Klassen-Identität und das snapshot()/reset_period()-Protokoll bei (D-3.2 —
    Klassen bleiben Aggregator-Hoster, keine neuen Marker-Stubs), damit
    bestehende OTX-Loader-Konsumenten und test_p5n_insights.py nicht brechen.

    Für die now-buildable Klassen (IFertigungsauftrag/prod_auftrag,
    IBestellauftrag/best_auftrag, IProzess für wschlange/nbearbeit): sammle pro
    Periode Zeilen-Records mit den EXAKTEN OSim-Feldnamen (per
    <osim_field_reference>). Die Aggregatoren bekommen Methoden zum Anhängen
    eines Records (z.B. add_prod_auftrag(teil, menge, soll_beginn_tag,
    beschreibung)); snapshot() gibt {period_num, records: [...]} zurück.

    Für die slice-gated Klassen (IPerson/pers, IBetriebsmittel/betr, ILager-
    abgeleitet für kauf/eigen, IGonzo/kalkulation, ISimulator/gesamt,
    IArbeitszeit/schicht): snapshot() trägt die echten Feldnamen mit Wert null
    und ein `missing_slice`-Feld (Slice-ID bzw. "Kosten-Slice"/"Bestands-Slice"
    je <osim_field_reference>). KEINE erfundenen Zahlen — gated bedeutet null +
    Marker, nicht 0.0 als Schein-Wert (Unterschied zu 01-03 dokumentieren).

    Setze die GENERIK-Felder count_gesamt/durchlaufzeit_*/auslastung_pct/
    kosten_sum/sollstunden/iststunden außer Kraft (entferne oder ersetze sie
    durch die OSim-Felder). Notiere im Docstring jeder Klasse den C++-Quell-File
    und (für slice-gated) die fehlende Slice. Für gesamt: die now-buildable
    count_auftraege_* dürfen als Zusatz-Kennzahl bleiben, aber die OSim-Gesamt-
    Felder (verkaufserloes, kennzahlen, verkaufsergebnisse) müssen als
    gated-Felder + missing_slice präsent sein.

    Schreibe die Tests in test_streaming_kpi.py auf die echten Felder um (RED →
    GREEN): pro kind ein deterministischer snapshot()-Check.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_kpi.py -x -q</automated>
  </verify>
  <done>insights/classes.py trägt für alle 11 Analysen + schicht die exakten OSim-Feldnamen; now-buildable mit echten Record-Werten, slice-gated mit null+missing_slice; test_streaming_kpi.py grün.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: AuswertungListener + SchichtListener real befüllen, Schemas an OSim-Felder anpassen</name>
  <files>engine/src/osim_engine/streaming/listeners/auswertung.py, engine/src/osim_engine/streaming/listeners/schicht.py, engine/src/osim_engine/streaming/schemas/kpi_auswertung.json, engine/src/osim_engine/streaming/schemas/gantt_schicht.json, engine/tests/integration/test_streaming_schema.py</files>
  <read_first>
    - engine/src/osim_engine/streaming/listeners/auswertung.py (aktueller Listener — _kinds-Map + on_sim_ereig + on_period_end)
    - engine/src/osim_engine/streaming/listeners/schicht.py (aktueller Schicht-Listener — wird auf person/schichten/ueberstunden/einheiten umgestellt)
    - engine/src/osim_engine/streaming/schemas/kpi_auswertung.json + gantt_schicht.json (aktuelle Schemas mit Generik-Feldern)
    - engine/src/osim_engine/streaming/partial.py (is_slice_skeleton + build_streams_status — missing_slice-Quelle)
    - engine/tests/integration/test_streaming_schema.py (Schema-Validierungs-Tests)
    - die now-buildable .cpp aus Task-1 read_first (für die echten Quell-Attribute am sim-State: m_fauftr/m_bestell/m_betr->m_wart_schl)
  </read_first>
  <behavior>
    - on_period_end emittiert für prod_auftrag/best_auftrag/nbearbeit/wschlange Frames mit echten records aus dem aktuellen sim-State (m_fauftr/m_bestell je m_info, m_betr->m_wart_schl).
    - on_period_end emittiert für pers/betr/kauf/eigen/kalkulation/gesamt Frames mit den echten Feldnamen + null + missing_slice.
    - SchichtListener emittiert gantt_schicht-Frames mit person/schichten/ueberstunden/einheiten (gated null + missing_slice "P5-M" solange azeit-Slice Skelett ist).
    - Schema-Test: jeder emittierte kpi_auswertung- und gantt_schicht-Frame validiert gegen das angepasste JSON-Schema (alle 11 kinds + schicht).
    - Schema-Test: das kpi_auswertung-Schema fordert pro kind die echten OSim-Feldnamen (z.B. best_termin_tag für best_auftrag, soll_beginn_tag für prod_auftrag, kann_kap_pct für pers).
  </behavior>
  <action>
    Verdrahte im AuswertungListener das Sammeln der now-buildable Records read-only
    aus dem sim-State (best-effort, SPEC §5 — KEIN Kernel-Eingriff): in
    on_sim_ereig bzw. einem read-only on_period_end-Scan die Fertigungs-/
    Bestellaufträge aus den IInfo-Containern (m_fauftr/m_bestell) und die
    Warteschlangen je Betriebsmittel (m_betr->m_wart_schl) lesen und über die
    neuen add_*-Methoden der Aggregatoren (Task 1) sammeln. Verwende die
    tatsächlichen Python-Attributnamen des Ports (über getattr defensiv, analog
    zum bestehenden Listener); wo das Port-Attribut fehlt, behandle die Analyse
    als gated (missing_slice), statt zu erfinden.

    Für die slice-gated kinds ruft on_period_end weiterhin agg.snapshot() —
    dessen null+missing_slice-Felder (Task 1) gehen unverändert in den Frame.

    Stelle den SchichtListener (gantt_schicht-Stream) auf die echten Schicht-
    Viewer-Spalten um: person, schichten, ueberstunden, einheiten — gated null +
    missing_slice "P5-M" solange is_slice_skeleton("P5-M") True ist. Entferne die
    alten soll-/iststunden-Felder.

    Passe die JSON-Schemas an: kpi_auswertung.json bekommt pro kind die echten
    OSim-Feldnamen aus <osim_field_reference> (now-buildable: required records-
    Array mit den Zeilen-Feldern; slice-gated: die echten Felder als nullable +
    optionales missing_slice-Feld). gantt_schicht.json bekommt person/schichten/
    ueberstunden/einheiten (nullable) + partial/missing_slice. Behalte die
    Frame-Pflichtfelder t/stream/seq/v.

    Schreibe test_streaming_schema.py auf die neuen Felder um (RED → GREEN):
    Validiere je kind einen Beispiel-Frame; prüfe explizit, dass die echten
    OSim-Feldnamen required bzw. present sind und kein generisches count_gesamt/
    durchlaufzeit_* mehr im Schema steht.

    Self-Registrierung via register_listener bleibt unverändert (Registry-Pattern
    aus 01-01, KEIN attach.py-/listeners/__init__.py-Edit).
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming_schema.py tests/integration/test_streaming_kpi.py -q</automated>
  </verify>
  <done>auswertung.py füllt now-buildable real + slice-gated mit missing_slice; schicht.py trägt person/schichten/ueberstunden/einheiten; beide Schemas spiegeln die echten OSim-Felder; test_streaming_schema + test_streaming_kpi grün; Listener-only (kein Kernel-Eingriff).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sim-State → Listener (read-side) | Der Listener liest read-only aus dem laufenden PSimulator-State; jeder Schreib-/Mutationszugriff würde den Reproduzierbarkeitsvertrag (PAWLICEK-LCG) und SPEC §5 verletzen. |
| Listener → stream.jsonl | Emittierte Frames werden von der UI (01-12) ungeprüft als Anzeige-Wahrheit gerendert; falsche/erfundene Werte propagieren als Fehlinformation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-11A | Tampering | on_sim_ereig/on_period_end sim-State-Zugriff | mitigate | Ausschließlich lesende getattr-Zugriffe; kein set/mutate auf sim-Objekten; kein Eingriff in core/simulator.py (SPEC §5). Test prüft, dass keine Engine-Kern-Datei in files_modified steht. |
| T-01-11B | Information Disclosure | slice-gated Felder | mitigate | Gated-Felder tragen null + missing_slice statt erfundener Zahlen — verhindert Fehlinterpretation nicht-berechneter Werte als echte KPIs (User-Direktive "nicht erfinden"). |
| T-01-11C | Denial of Service | period-end Record-Sammlung | accept | Record-Listen sind period-begrenzt (period-only-Aggregation, D-3.4); Größe = Anzahl Aufträge/Warteschlangen je Periode, für M1-Demo-Läufe unkritisch. |
| T-01-11-SC | Tampering | npm/pip/cargo installs | mitigate | Keine neuen Package-Installs in diesem Plan (rein additive Engine-Logik + JSON-Schemas). |
</threat_model>

<verification>
- `cd engine && uv run pytest tests/integration/test_streaming_kpi.py tests/integration/test_streaming_schema.py -q` grün.
- Kein Eingriff in core/simulator.py oder andere Kernel-Dateien (files_modified prüfen).
- Jede der 11 kinds + schicht trägt im Schema die echten OSim-Feldnamen (kein count_gesamt/durchlaufzeit_*/sollstunden mehr).
</verification>

<success_criteria>
- Alle 11 kpi_auswertung-kinds + gantt_schicht tragen die exakten OSim2004-Feldnamen (1:1 gegen die .cpp).
- prod_auftrag/best_auftrag/nbearbeit/wschlange liefern echte Werte aus dem Engine-State.
- pers/betr/kauf/eigen/kalkulation/gesamt/schicht tragen echte Feldnamen + null + missing_slice (keine erfundenen Zahlen).
- Engine-pytest grün auf dem Host; Listener-only (SPEC §5 gewahrt).
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-11-SUMMARY.md` when done
</output>
