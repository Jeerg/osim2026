# Phase 2 — Ressourcen-System (Plan)

**Stand:** 2026-05-17, nach Phase-1-Abschluss (88 Tests grün).
**Zweck:** Slice-Plan für Phase 2 analog zu SUPPLEMENT § 6.4.

---

## Warum Phase 2 das Allerwichtigste ist

Ein PPS-Simulator ohne Ressourcen ist akademisch — er kann keine
realistischen Engpässe modellieren, keine Auslastung berechnen, keine
"Wer arbeitet wann woran"-Fragen beantworten. Phase 1 hat den Plan-Graph
+ Stochastik, aber die zentrale Frage "wann wartet ein Prozess weil seine
Ressource belegt ist" ist offen (`PDlplKnoten.ress_verfuegbar` returnt
immer `True`).

Phase 2 macht den Simulator **lauffähig für reale PPS-Modelle**.

---

## Klassen-Inventar Phase 2

### Kern (V4)

| Klasse | Quelle | Rolle |
|---|---|---|
| `PRessource` | `OSimPro/PRessource.{odh,cpp}` | Basis aller Ressourcen — Name + Knoten-Konnektion |
| `PAktor` | `OSimPro/PAktor.{odh,cpp}` | "aktive Ressource"-Komponente (Mehrfachvererbung mit PRessBeleg) |
| `PRessBeleg` | `OSimPro/PRessBeleg.{odh,cpp}` (700+ Z.) | passive Ressource (Maschine/Person), `m_rsStatus`, `RessBelegen/Freigeben`, Listener |
| `PBetriebsmittel`, `PPerson` | dito, im selben File | Subtypen mit unterschiedlicher Einsatzzeit-Logik |
| `PAssoziation` | `OSimPro/PAssoziation.{odh,cpp}` | Basis Knoten↔Ressource-Verbindung |
| `PAssozRessource` | `OSimPro/PAssozRessource.{odh,cpp}` | Knoten → Liste konkreter `PAssozBeleg` |
| `PAssozBeleg` (+ Subtypen) | dito | konkrete Belegungs-Variante mit Ressource-Ref |

### Speicher/Material (V5)

| Klasse | Quelle |
|---|---|
| `PRessMenge` | `OSimPro/PRessMenge.{odh,cpp}` |
| `PSpeicherProz` | `OSimPro/PSpeicherProz.{odh,cpp}` |
| `PAszSpeicher` | `OSimPro/PAssozSpeicher.{odh,cpp}` |
| `PAszMenge` | `OSimPro/PAssozRessource.{odh,cpp}` Sektion |
| `PEntitaet` (Material-Identität) | `OSimPro/PEntitaet.{odh,cpp}` |

### Verfügbarkeit (V6)

| Klasse | Quelle |
|---|---|
| `PEinsatzzeit` | `OSimPro/PEinsatzzeit.{odh,cpp}` |
| `PtRelation` | `OSimPro/PtRelation.{odh,cpp}` (transiente Belegung) |

### Pool/Kollektion (V7)

| Klasse | Quelle |
|---|---|
| `PRessKollektion` | `OSimPro/PRessKollektion.{odh,cpp}` |

---

## Vertikale Slice-Aufteilung

### V4 — "Passive Maschine" ✅ ABGESCHLOSSEN

**Modell:** 1 Knoten, 1 Auslöser, 1 PRessBeleg (Maschine M). Knoten ist
verbunden mit M via `PAssoziation`. Wenn M frei → Knoten startet
Bearbeitung. Wenn M belegt → Prozess wartet im m_oWarteSchl.

**Implementiert:**
- `PRessource` (Basis) — `src/osim_engine/resources/ressource.py`
- `PAktor` (Stub) — `src/osim_engine/resources/aktor.py`
- `PRessBeleg` + Subtypen `PBetriebsmittel`, `PPerson` — `resources/beleg.py`
- `PAssoziation` + `PAssozRessource` (abstract) — `resources/assoziation/base.py`
- `PAssozBeleg` (passive Belegung) — `resources/assoziation/beleg.py`
- `PtRelation`, `PtRelationBeleg` — `resources/relation.py`
- Mehrfachvererbung `PRessBeleg(PRessource, PAktor)` 1:1 via Python-MRO
- Erweiterung `PDlplKnoten`: `m_lAssozRess` aktive Liste,
  `add_assoziation()`-Helper, `bearbeit_beginnen` restrukturiert nach
  C++ (Counter immer, dann ress_verfuegbar, dann notify+begin ODER
  on_bearbeit_abgelehnt)
- Erweiterung `PtProzess`: `ress_verfuegbar()`, `ress_anwesend()`,
  `on_bearbeit_abgelehnt()`, Relations-Notifikation in
  `bearbeit_beginnen`/`bearbeit_beenden`
- Erweiterung `PSimulator`: `m_lRessBeleg` aktive Liste,
  `register_ressource()` mit Lifecycle-Forwarding
- `proz_wart_ausloesen` auf PRessBeleg — Snapshot-Iteration

**Tests:** 8 neue (6 Integration + 2 Hand-Trace), alle grün.
- `tests/integration/test_v4_passive_ressource.py`
- `tests/diff/hand_trace/test_v4_one_node_one_ress.py`
- `tests/diff/hand_trace/v4_one_node_one_ress.md` (Erwartungs-Tabelle)

### V5 — "Material" (Mengen-Slice) ✅ ABGESCHLOSSEN

**Modell:** PRessMenge (Bestand). Knoten kann Material verbrauchen/erzeugen/abfragen.

**Implementiert:**
- `PRessMenge` + `PRessLager` — `src/osim_engine/resources/menge.py`
- `PAssozMenge` (abstract) + `PAssozMengeErzgt` / `PAssozMengeVerbr` /
  `PAssozMengeVerbrZwischen` / `PAssozMengeAbfr` —
  `resources/assoziation/menge.py`
- `PtRelationMenge` — `resources/relation.py`
- Bounded-Storage-Logik mit `m_lErlZubuchung`-Reservierung (1:1 C++)
- `PSimulator.m_lRessMenge` aktive Liste + `register_ress_menge()`

**Tests:** 10 neu (8 Integration + 2 Hand-Trace).
- `tests/integration/test_v5_material.py`
- `tests/diff/hand_trace/test_v5_erzeuger_verbraucher.py` + `.md`

**Semantik:**
| Subtyp | RessVerfuegbar | OnProzBeginn | OnProzEnde |
|---|---|---|---|
| Erzgt | Zubuchung möglich? | — | RessZubuchen |
| Verbr | Bestand ≥ menge? | RessAbbuchen | — |
| Abfr | Bestand ≥ menge? | — | — |

### V5.5 — "Entity + Speicher-Infrastruktur" ✅ ABGESCHLOSSEN

**Modell:** PEntitaet-Familie als typisierte Marker durch die Pipeline.
PSpeicherProz als Wartelisten-Container zwischen Knoten und Aktor.
PAssozSpeicher mit Load-Balanced-HoleSpeicher. `PDpKnZeitvorgabe.
proz_weitergeben` mit Speicher-Branch.

**Implementiert:**
- `PEntitaet` (abstract) + `PEntEinzel` (m_iEinheiten=1 default) +
  `PEntWeitergabe` + `PEntExtern` mit Klonen/Abspalten/Zusammenfuehren
  als NotImplementedError-Stubs (1:1 zu C++ Stub-Methoden).
- `PSpeicherProz` (m_lProzesse, m_lRessourcen, proz_einfuegen,
  is_waiting, delete_proz, on_proz_entnommen, get_proz_anzahl,
  get_bestand-Stub) + `SpeicherProzListener`.
- `PAssozSpeicher` (m_lKnoten, m_lSpeicher, platziere_proz,
  hole_speicher mit Load-Balancing `<=`-Strategie, is_waiting,
  delete_proz, is_empty) + `PAssozSpeichBestand` als Stub.
- `PDlplKnoten.m_lAssozSpeich` typisiert als `PAssozSpeicher | None`
  + `set_assoziation_speicher()`-Helper.
- `PDpKnZeitvorgabe.proz_weitergeben` mit Speicher-Branch: wenn
  `m_lAssozSpeich` gesetzt → `platziere_proz` und return (kein
  bearbeit_beginnen).
- `PSimulator.m_lSpeichProz` aktive Liste + `register_speicher_proz()`.

**Tests:** 15 neu (13 Integration + 2 Hand-Trace).
- `tests/integration/test_v5_5_speicher.py`
- `tests/diff/hand_trace/test_v5_5_speicher_load_balanced.py` + `.md`

**Bewusst vertagt:** Aktor-Pipeline (`PRessBeleg.m_bAktAsActor=True`
mit `proz_waehlen`/`bearbeit_beginnen`/`on_akt_*` aktiv). Phase 3 macht
das scharf — V5.5 stellt nur die Container-Infrastruktur bereit.
EventBus-Topics: `speicher.einfuegen`, `speicher.entnommen`.

### V6 — "Einsatzzeit" (Pause-Slice) ✅ ABGESCHLOSSEN

**Modell:** PRessBeleg mit wiederkehrenden Pausen via PEinsatzzeitPause.
Pause → rsPause, lfd. Prozess wird unterbrochen, Resume mit Restzeit
nach Pause-Ende. Tagesarbeitszeiten (`PEinsatzzeitTag`) und andere
Pausen-Strategien (`rsvRestBearb`, `rsvRestBearbProdEnd`) sind separate
spätere Slices.

**Implementiert:**
- `PEinsatzzeit` (abstract) + `PEinsatzzeitPause` + `PPauseZyklus`,
  `PEinsatzzeitEvtMode`/`EinsatzEvtTyp`-Enums, `EvtPause` (sub_time=3)
  — `src/osim_engine/resources/einsatzzeit.py`
- `PRessBeleg.on_einsatz_beginn/ende` mit rsvStandard-Pfad
  (PRessBeleg.cpp:754-933 vereinfacht: keine Entscheider-Pfade)
- `RessBelegListener.on_einsatz_beginn/ende`
- `PtProzess.bearbeit_unterbrechen` hängt Prozess in m_oWarteSchl
- `PtProzZeitvorgabe.bearbeit_unterbrechen` storniert EvtBearbeitEnde,
  rechnet Restzeitinhalt aus
- `PtProzZeitvorgabe.bearbeit_beginnen` mit conditional zeitinhalt
  (`status != PT_UNT` → neu holen; sonst Restwert behalten)
- `PtProzZeitvorgabe.m_iBearbeitBeginn`-Feld
- `PDlplKnoten.on_proz_unterbr` (DLZ-Intervall schließen + Listener)
- `PDlplKnoten.on_proz_beendet`/`on_proz_unterbr` DLZ-Akkumulation
  jetzt analog C++ `PtkIntervallBegin/End` — Pausen-Zeit zählt NICHT
  zur Knoten-DLZ, aber zur Auslöser-DLZ (via m_iAuslZeitpunkt → curr)
- `PSimulator.m_lEinsatz` aktive Liste + `register_einsatzzeit()`,
  Lifecycle-Forwarding via `on_period_begin` → `insert_events`

**Tests:** 7 neu (5 Integration + 2 Hand-Trace).
- `tests/integration/test_v6_einsatzzeit.py`
- `tests/diff/hand_trace/test_v6_pause_unterbricht_proz.py` + `.md`

**Bewusst vertagt:**
- ~~`PEinsatzzeitTag`~~ — abgeschlossen in V6.5
- Pausen-Strategien `rsvRestBearb`, `rsvRestBearbProdEnd`, `rsvSelf`
- Anwesenheits-Wahrscheinlichkeit `m_iAnwWahrsch < 100` (in V4 schon
  implementiert, in V6 nicht zusätzlich getestet)

### V6.5 — "Tagesarbeitszeit / Wochenplan" ✅ ABGESCHLOSSEN

**Modell:** PEinsatzzeitTag mit Schichten pro Tag (`PTagesEinsatzzeit`,
z. B. Mittagspause 8-12 + 13-17) und Tag↔Ressource-Zuordnung
(`PTagRess`). InsertEvents legt pro gültigem Tag: PEM_INIT am
Tagesbeginn, PEM_BEGIN/PEM_END pro Schicht, PEM_END_FOR_DAY für die
letzte Schicht des Tages.

**Implementiert:**
- `PTagesEinsatzzeit` (Schicht-Anfang/Ende in Stunden) +
  `PTagRess` (Tag-Nr + Ressource, `is_einsatz_tag`-Helper) —
  `src/osim_engine/resources/einsatzzeit.py`
- `PEinsatzzeitTag(PEinsatzzeitPause)` mit `insert_events` (Tag-Filter,
  Schicht-Iteration, EndMax-Helper) und `on_pause_event` (4 Branches:
  PEM_BEGIN/PEM_END/PEM_END_FOR_DAY/PEM_INIT mit
  `is_einsatz_tag`-Filter pro tagress)
- `attach_tag_ress(tag, beleg)`-Helper als API-Front

**Tests:** 11 neu (9 Integration + 2 Hand-Trace).
- `tests/integration/test_v6_5_einsatzzeit_tag.py`: Data-Klassen,
  IsPTagesEinsatzzeitEndMax, Single-/Doppel-Schicht, Status-Capture,
  Multi-Ressource-Tag-Filter über 2 Tage, lfd. Proz unterbrochen
  durch Mittagspause + Resume mit Restzeit.
- `tests/diff/hand_trace/test_v6_5_einsatzzeit_tag_mittagspause.py` +
  `.md`: 12 EventBus-Topics, vollständige Counter-Matrix mit
  DLZ-Aufteilung Knoten vs. Auslöser.

**Bewusst vertagt:**
- `eetExt` / `eetExtEndForDay`-Pfade in `OnEinsatzEnde` (Entscheider-
  spezifisch, Phase 5)
- Pausen-Strategien `rsvRestBearb` etc. (Phase 5)

### V7 — "Pool/Kollektion" ✅ ABGESCHLOSSEN

**Modell:** N austauschbare Ressourcen pro Assoz, Knoten greift auf die
erste freie zu (linear-first-free).

**Wichtige Erkenntnis:** Die Pool-Semantik sitzt seit V4 **schon
vollständig** in `PAssozBeleg.ress_verfuegbar` — der iteriert
`m_lRessourcen` und nimmt die erste freie. `PRessKollektion` ist im
C++-Original ein **reiner Stub** (alle Sim-Methoden werfen). V7
implementiert daher (a) die Stub-Klasse 1:1 für Klassenhierarchie-Treue
und (b) verifiziert die bereits vorhandene Pool-Semantik durch dedizierte
Tests + Hand-Trace.

**Implementiert:**
- `PRessKollektion` + `PRessKollEinheiten` — `src/osim_engine/resources/kollektion.py`,
  1:1 zu C++ inkl. `NotImplementedError`-Stubs für `ress_belegen`/
  `ress_freigeben`. `get_ress_anzahl` liefert Listenlänge bzw.
  `m_iEinheiten`.
- Keine Änderung an `PAssozBeleg` nötig — die Pool-Semantik war bereits
  in V4 vorhanden.

**Tests:** 9 neu (7 Integration + 2 Hand-Trace).
- `tests/integration/test_v7_pool.py` — 3-Maschinen-parallel,
  4-Job-mit-Warte, first-free-Bevorzugung, Pool-mit-1-Resource entspricht
  V4-Einzel, PRessKollektion-Stub-Verifikation.
- `tests/diff/hand_trace/test_v7_pool_three_machines.py` + `.md` —
  papier-genaues Trace-Matrix-Beispiel.

**Pool-Strategie:** `linear-first-free` (1:1 zu C++ `PAssozBeleg::
RessVerfuegbar` Pfad `!IsEntFunktOn`, PAssozRessource.cpp:601-624).
Entscheider-basierte Pool-Strategien (`ABL_PREFER`/`ABL_STD`/
`ABL_IF_NEEDED`) folgen mit Phase 5 (Entscheider).

### V8 — "PtRelation" (Verifikations-Slice) ✅ ABGESCHLOSSEN

**Modell:** Transiente Ressourcen-Belegung für Multi-Assoz an einem
Knoten + Multi-Knoten-Plan mit derselben Ressource.

**Wichtige Erkenntnis:** `PtRelation` / `PtRelationBeleg` /
`PtRelationMenge` sind seit V4+V5 implementiert. V8 ist primär ein
**Verifikations-Slice**: die übergreifenden Szenarien (mehrere
Assoziationen am selben Knoten, gleiche Ressource bei mehreren Knoten
im Plan) werden hier systematisch getestet und durch Hand-Trace
abgedeckt.

**Implementiert:** keine Source-Änderungen.

**Tests:** 8 neu (6 Integration + 2 Hand-Trace).
- `tests/integration/test_v8_relation.py`:
  - happy-path Multi-Assoz (Maschine + Material beide verfügbar)
  - Rollback-Verhalten bei Material-Mangel (Counter aber Status korrekt)
  - Kurzschluss bei erster Assoz-Fail
  - Multi-Knoten-Plan sequenziell mit derselben Maschine
  - Multi-Knoten-Plan mit externer Maschinen-Belegung dazwischen
  - dokumentierter C++-Bug (xfail): `m_lErlZubuchung`-Reservierungs-Leak
    bei bounded Erzgt mit nachfolgendem Refuse
- `tests/diff/hand_trace/test_v8_multi_assoz_machine_material.py` +
  `.md`: papier-genaue Counter-Matrix für Maschine+Material-Knoten

**Bekannte 1:1-Limitierung (C++-Bug):** wenn `PAssozMengeErzgt` auf einem
bounded Lager TRUE meldet (mit Reservierung in `m_lErlZubuchung`) und
eine NACHFOLGENDE Assoz dann FALSE liefert, räumt `on_bearbeit_abgelehnt`
die Relationen auf — aber die Reservierung bleibt stale. Der C++-Code hat
denselben Bug (siehe PRessMenge.cpp:27-75). Wir markieren das in V8 mit
`pytest.mark.xfail` und dokumentieren es; ein Fix wäre eine bewusste
Abweichung von der 1:1-Treue.

**Gesamt-Aufwand Phase 2:** 5-8 Tage (vergleichbar Phase 1 mit 4 Slices in
ca. 8 Tagen geschafft).

---

## Architektur-Vorentscheidungen

### Mehrfachvererbung `PRessBeleg(PRessource, PAktor)`

C++ nutzt das. Python kann das (MRO-Linearisierung). Wir verwenden es
**1:1** — kein Mixin-Refactor, keine Strategy-Pattern-Verbiegung. Risiken:
- MRO-Konflikte bei gemeinsamen Method-Namen → werden wir bei Implementation
  prüfen, ggf. explizite Super-Aufrufe
- Diamond-Problem bei `PSimObj` als gemeinsame Basis → klassisches
  Python-Pattern, kein Problem

### Ressourcen-Vergabe-Mechanismus

C++: Knoten ruft `RessVerfuegbar` über `m_lAssozRess`. Jede Assoziation
prüft ihre Ressource (`PAssozBeleg.RessVerfuegbar`). Wenn alle True →
Bearbeitung startet → `RessBelegen` für alle. Bei `OnProzBeendet`:
`RessFreigeben`.

**Python-Mapping:** 1:1, keine Vereinfachung.

### Warteschlange bei Ressourcen-Konflikt

V1-Pfad: `bearbeit_beginnen` returns False → Prozess in `m_oWarteSchl`.
V4 muss den Mechanismus aktivieren: bei `RessFreigeben` wird
`PSimulator.ProzWartAusloesen` aufgerufen → durchsucht `m_oWarteSchl`,
versucht jedes Element neu zu starten.

C++-Vorlage: `OSimPro/PSimulator.cpp::ProzWartAusloesen` (Suche im Code).

### Listener-Erweiterung

`PListenerRessBeleg` analog zu `PListenerDlplKnoten` (V2). EventBus-Topics:
- `ress.belegen` / `ress.freigeben`
- `ress.anfrage.erfuellt` / `ress.anfrage.vergeblich`
- `ress.einsatz.beginn` / `ress.einsatz.ende` (V6)
- `ress.pause.beginn` / `ress.pause.ende` (V6)

---

## Was vorab zu klären ist

1. **PRessBeleg ist 700+ Zeilen.** Lohnt sich ein Refactor in V4 zu
   kleineren Klassen? Empfehlung: **nein** — 1:1-Treue priorisieren.
2. **PAktor-Mehrfachvererbung** — Python-MRO sollte funktionieren, aber
   bei Implementation auf konflikt-freie Method-Namen achten.
3. **`m_lTmpUmlFaktorList`** und ähnliche KPI-Caches in PRessBeleg —
   sind die für V4 nötig oder erst V6+? **Antwort:** erst V6+ (Pausen-
   Verhalten triggert sie).

---

## Aktueller Stand (Stand 2026-05-17)

- Phase 1 abgeschlossen (88 Tests).
- M1 (PtProzDurchlaufplan Konsistenz-Check) gefixt vor Phase 2.
- **V4 abgeschlossen (96 Tests, +8 V4-Tests).** Passive Ressourcen-Pfad
  funktioniert: `PRessource`, `PAktor` (Stub), `PAssoziation`,
  `PAssozRessource`, `PAssozBeleg`, `PRessBeleg`, `PBetriebsmittel`,
  `PPerson`, `PtRelation`, `PtRelationBeleg`. Wartepfad mit
  `ProzWartAusloesen` läuft Hand-Trace-validiert. Mehrfachvererbung
  `PRessBeleg(PRessource, PAktor)` 1:1 via Python-MRO.
- **V5 (Mengen-Slice) abgeschlossen (106 Tests, +10 V5-Tests).**
  PRessMenge + Erzgt/Verbr/Abfr + PtRelationMenge. Bounded-Storage mit
  Reservierungs-Liste 1:1. Wartepfad in beide Richtungen (Verbr wartet
  bei leerem Lager, Erzgt wartet bei vollem Lager).
- **V6 (Pause-Slice) abgeschlossen (113 Tests, +7 V6-Tests).**
  PEinsatzzeitPause + PPauseZyklus + rsvStandard-Pfad in PRessBeleg.
  PtProzZeitvorgabe.bearbeit_unterbrechen mit Restzeit-Berechnung;
  Resume via proz_wart_ausloesen aus on_einsatz_beginn. DLZ
  jetzt 1:1 zu C++ PtkIntervallBegin/End (Pause zählt nicht).
- **V7 (Pool-Slice) abgeschlossen (122 Tests, +9 V7-Tests).**
  PRessKollektion + PRessKollEinheiten als 1:1-Stub-Klassen. Pool-
  Semantik selbst war seit V4 implementiert (in PAssozBeleg);
  V7 verifiziert sie durch dedizierte Tests + Hand-Trace.
- **V8 (Relation-Verifikations-Slice) abgeschlossen (129 Tests + 1 xfailed,
  +8 V8-Tests).** Multi-Assoz an einem Knoten und Multi-Knoten-Plan
  mit derselben Ressource. Keine Source-Änderungen — PtRelation-Familie
  war seit V4/V5 vollständig. C++-Bug `m_lErlZubuchung`-Reservierungs-
  Leak als xfail dokumentiert.
- **V5.5 (Entity + Speicher-Infrastruktur) abgeschlossen (144 Tests +
  1 xfailed, +15 V5.5-Tests).** PEntitaet-Familie + PSpeicherProz +
  PAssozSpeicher inkl. Load-Balanced-HoleSpeicher.
  PDpKnZeitvorgabe.proz_weitergeben mit Speicher-Branch. Aktor-Pipeline
  selbst bleibt für Phase 3 offen — V5.5 liefert die passive
  Container-Infrastruktur.
- **V6.5 (Tagesarbeitszeit) abgeschlossen (155 Tests + 1 xfailed,
  +11 V6.5-Tests).** PEinsatzzeitTag mit PTagesEinsatzzeit /
  PTagRess. InsertEvents legt PEM_INIT + Schicht-BEGIN/END pro Tag,
  letzte Schicht bekommt PEM_END_FOR_DAY. Mittagspause-Szenario
  (lfd. Proz unterbrochen + nach Pause resumed) durch Hand-Trace
  abgedeckt.
- **Phase 3 (Aktor-Pipeline) gestartet (161 Tests + 1 xfailed,
  +6 P3-Tests).** PRessBeleg-Aktor-Methoden scharf:
  on_proz_eingefuegt, proz_waehlen, bearbeit_beginnen_aktiv,
  on_akt_beginn/ende/unterbr + attach_speicher (bidirektional).
  PtProzess.bearbeit_unterbrechen mit Aktor-Pfad (on_akt_unterbr).
  PRessBeleg.on_einsatz_beginn mit m_bAktAsActor-Branch.
- **Phase 4-A (Rücksprung) gestartet (165 Tests + 1 xfailed,
  +4 P4-Tests).** PDpKnRuecksprung (abstract) + PDpKnRueckKonstant
  (m_iWiederholungenZiel) + PDpKnRueckVerteilung
  (m_fSprungWahrschlkt) + PtProzRuecksprung (m_iWiederholungen).
  Sub-Plan-Iteration via OnProzSubBeendet mit
  ruecksprung_entscheiden-Hook. EventBus-Topics
  `ruecksprung.beginn` / `ruecksprung.ende`. Hand-Trace und
  weitere P4-Slices (Alternativ, Menge, Rüsten, Extern) in
  separater Session.
- **Phase 4-B (Alternativ) gestartet (175 Tests + 1 xfailed,
  +10 P4-B-Tests).** PDpKnAlternativ (abstract) +
  PDpKnAlternativTypID (Auslöser-Parameter `"id"`-Lookup) +
  PDpKnAlternativVerteilung (kumulative Wahrscheinlichkeits-
  Intervalle, LCG) + PtProzAlternativ (m_oAlternative-Ref).
  PAlternative-Familie (Basis + TypID + Verteilung) mit
  m_iPtkAuswahlCount-Counter pro Alternative. Fallback "letzte
  Alternative" 1:1 zu C++ bei kein Match. Sub-Plan-Routing via
  OnProzSubBeendet → m_lKanteAus (statt erneutem Sub-Plan-Start
  wie bei Rücksprung). Minimal-Subset der **PParameter-Familie**
  (PParameter / PParameterInt / PParameterID / PParameterLList
  mit `hole_parameter_int`) für TypID-Lookup ko-portiert; volle
  Familie folgt in P4-F. P4-B Hand-Trace + ELogik-Subtyp
  (Entscheider, gehört zu Phase 5) ausgelagert.
- **Phase 4-C (Menge-Knoten) gestartet (186 Tests + 1 xfailed,
  +11 P4-C-Tests).** PDpKnMenge (Dauer = Menge × Dfz/Einheit)
  + PDpKnMengeRuesten (zusätzliche, mengenunabhängige Rüstzeit)
  als Subtypen von PDpKnZeitvorgabe. Menge wird aus dem
  Auslöser-Parameter `"menge"` (PARAM_MENGE) gelesen — Default 0
  bei nicht gesetztem Parameter. PParameterMenge ergänzt.
  ProduktionEnde-Branch (m_iZeitRedBeiProzEnde) reduziert NUR
  den Mengen-Anteil — Rüstzeit bleibt voll (1:1 zu C++
  PDpKnZeitvorgabe.cpp:828-832, ggf. Bug im Original).
  PtProzess.get_ausloeser-Helper neu, 1:1 zu C++ via
  `m_oTrigger.m_oAusloeser`.
- **Phase 4-D (PtProzRuesten) und Phase 4-E (PDpKnExtern +
  PtProzExtern) — C++-Stub-Slices (190 + 197 Tests + 1 xfailed,
  +4 P4-D + +7 P4-E Tests).** Wichtiger Recherche-Befund: Im
  C++-Original sind beide Klassen-Familien NUR DEKLARIERT und
  im DLL registriert, aber alle Methoden werfen OException —
  also unimplementiert. Konkret betrifft das PtProzRuesten
  (3 Methoden), PDpKnExtern (proz_weitergeben), PtProzExtern
  (6 Methoden) und PEntExtern (2 Methoden, bereits in V5.5
  als Stub portiert). 1:1-Treue-Konvention: Stub-Methoden
  werfen NotImplementedError mit Hinweis. Eine echte
  Rüst-Phase oder externe Steuerung wäre eine Diss-basierte
  Erweiterung (Jonsson 2003) und ist NICHT Gegenstand der
  1:1-Portierung.
- **Phase 4-F (PParameter-Familie vollständig) abgeschlossen
  (217 Tests + 1 xfailed, +20 P4-F-Unit-Tests).** PParameter-
  Refactor mit internem `_hole_int/_hole_float/_hole_string`-
  Hook (1:1-Mapping des C++-Patterns BOOL + out-Parameter).
  Alle sechs Int-Subtypen ergänzt mit korrekter (ID, Name)-
  Lookup-Logik: PParameterMenge / PParameterID / PParameter-
  Prioritaet / PParameterKrzRscEinsatz / PParameterZstInt-
  Begin / PParameterZstIntEnd. Plus generische PParameterInt
  / PParameterFloat / PParameterString (Name-Lookup only).
  PParameterLList mit sechs Lookup-Methoden (name- + id-based
  je Typ). PARAM_*-Konstanten 1:1 aus C++ PParameter.odh:23-29.
- **Phase 2 + V5.5 + V6.5 + Phase 3 + Phase 4 vollständig.**
- Codex-Findings stehen aus.
- C-Compiler-Setup steht aus (Option D in SELF-REVIEW-CODE.md).

**Nächste Schritte (Auswahl):**
- **Phase 3** — Aktoren aktiv (PAktor.bearbeit_beginnen, ProzWaehlen,
  Aktor-Pipeline via PSpeicherProz)
- **Phase 4** — Entitäten + Erweiterte Knoten (Rücksprung, Alternativ,
  Menge, Rüsten)
- **Phase 5** — Entscheider + Generator + OSimAZeit + OSimINSIGHTS
