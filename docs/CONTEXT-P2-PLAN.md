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

### V5.5 — "Speicher" (Entity-Slice, OFFEN)

PSpeicherProz (Material-Container mit individuellen Entitäten),
PEntitaet (Material-Identität), PAszSpeicher. Erlaubt FIFO/LIFO-Logik
über konkreten Material-Instanzen, individuelle Tracking. Vom Mengen-
Slice (V5) klar abgegrenzt — V5 reicht bereits für stückzahlbasierte
Bestandsführung, Engpass-Analyse, Wartepfade.

### V6 — "Einsatzzeit"

**Modell:** PRessBeleg mit Tagesarbeitszeit. Außerhalb → rsPause. Pausen-
Strategien (rsvStandard, rsvRestBearb, rsvRestBearbProdEnd).

**Klassen:** PEinsatzzeit + Event-Mechanik in PRessBeleg.

**Aufwand:** 1-2 Tage.

### V7 — "Pool/Kollektion"

**Modell:** N austauschbare Ressourcen, Knoten greift auf irgendeine freie zu.

**Klassen:** PRessKollektion + ressourcen-Auswahl-Logik.

**Aufwand:** 1 Tag.

### V8 — "PtRelation"

**Modell:** Transiente Ressourcen-Belegung für Multi-Knoten-Plan (gleiche
Ressource für mehrere Knoten innerhalb eines Plan-Laufs).

**Klassen:** PtRelation.

**Aufwand:** 1 Tag.

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
- Codex-Findings stehen aus.
- C-Compiler-Setup steht aus (Option D in SELF-REVIEW-CODE.md).

**Nächste Schritte (Auswahl):**
- V5.5 — PSpeicherProz / PEntitaet / PAszSpeicher (Entity-Identität)
- V6 — PEinsatzzeit (Einsatzzeiten/Pausen für PRessBeleg)
- V7 — PRessKollektion (Pool austauschbarer Ressourcen)
- V8 — PtRelation für Multi-Knoten-Ressourcenbindung in Plänen
