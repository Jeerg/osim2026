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

### V4 — "Passive Maschine"

**Modell:** 1 Knoten, 1 Auslöser, 1 PRessBeleg (Maschine M). Knoten ist
verbunden mit M via `PAssoziation`. Wenn M frei → Knoten startet
Bearbeitung. Wenn M belegt → Prozess wartet im m_oWarteSchl.

**Klassen:**
- `PRessource` (Basis)
- `PAktor` (Stub, da V4 nur passive Pfad nutzt)
- `PRessBeleg` (m_rsStatus, RessBelegen/Freigeben, RessVerfuegbar)
- `PAssoziation` (Basis)
- `PAssozRessource` (Knoten→Liste)
- `PAssozBeleg` (konkrete Belegung)
- Erweiterung `PDlplKnoten`:
  - `m_lAssozRess` als Liste aktiv
  - `ress_verfuegbar(proz)` prüft alle m_lAssozRess
  - `on_proz_beendet` ruft `RessFreigeben` an allen belegten Ressourcen
- Erweiterung `PSimulator`:
  - `m_lRessBeleg` mit Lifecycle-Forwarding
  - `register_ressource()`-Helper
- Erweiterung `PtProzZeitvorgabe.bearbeit_beginnen`:
  - `RessBelegen(proz)` vor dem EvtBearbeitEnde plant
- Erweiterung `PtProzZeitvorgabe.bearbeit_beenden`:
  - `RessFreigeben(proz)` nach `on_proz_beendet`

**Test:**
- Smoke: 1 Knoten + 1 PRessBeleg + 2 Auslöser zu unterschiedlichen Zeiten
  → erster Auftrag belegt M, zweiter wartet, dann läuft zweiter
- Counter: m_iPtkBeiAnfrageAnwesend, m_iPtkAnfragenGesamt
- Hand-Trace gegen Papier

**Aufwand:** geschätzt 1-2 Tage.

### V5 — "Material/Speicher"

**Modell:** + PRessMenge (Bestand), PSpeicherProz (Material-Container).

**Klassen:** PRessMenge, PAszMenge, PAszSpeicher, PSpeicherProz, PEntitaet.

**Erweiterungen:** Knoten kann Material verbrauchen/produzieren.

**Aufwand:** 1-2 Tage.

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
- Codex-Findings stehen aus.
- C-Compiler-Setup steht aus (Option D in SELF-REVIEW-CODE.md).

**Nächster Schritt:** V4 anfangen — `PRessource`, `PAktor` (Stub),
`PAssoziation`, `PAssozRessource`, `PAssozBeleg`, `PRessBeleg` (minimaler
Path, ohne Einsatzzeit/Pause).
