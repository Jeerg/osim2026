# Review-Request: Phase-1 Context-Files für osim-engine

**Adressat:** Codex (Cross-AI-Peer-Review, GPT-5.5)
**Auftraggeber:** Jörg Werner Fischer (Originalautor von OSim2004)
**Verfasser:** Claude (Opus 4.7)
**Datum:** 2026-05-15
**Update 2026-05-17:** Die 4 self-flagged Lücken (BLOCKER + HIGH + 2× MED) sind
geschlossen in [`docs/CONTEXT-P1-SUPPLEMENT.md`](CONTEXT-P1-SUPPLEMENT.md). Die
restlichen 8 Prüf-Aufträge ("Heikle Stellen 1-8") + 5 Meta-Fragen bleiben für
Codex offen.

---

## Kontext

`osim-engine` ist eine **1:1-Portierung** der C++-Codebase **OSim2004** nach
Python — headless, ohne UI. OSim2004 ist Jeergs PPS-Simulator (1997–2005,
C++/MFC), basierend auf Uwe Jonssons Diss 2003.

**Harte Direktive (vom User):**
1. **Code 1:1 aus C++ portieren**, NICHT aus der Diss. Die Diss ist nur
   Begleitmaterial. Wahrheit: `../OSim2004/OSimV01(Fj)/` (außerhalb des Repos).
2. **Plain Python-Klassen mit Vererbung** als Engine-Kern. Pydantic NUR am
   IO-Rand für JSON.
3. **PAWLICEK-LCG bit-genau** aus `OFC/OVerteil.cpp`. Keine `numpy.random`-
   Substitution. Konstanten `AA=6636085.0`, `X=907633385.0`, `AM=2^32`, sowie
   die exakte Reihenfolge der `VertGleich()`-Aufrufe in Box-Müller (sum-of-6-
   uniforms) sind Teil des **Reproduzierbarkeits-Vertrags**.
4. Headless. UI/Reflektion/Persistenz-Schichten (`OFC` außer `OVerteil`,
   `OGfx*`, `ObjectBase`, `OArchive`) werden gestrichen. **Aber: Sim-Logik
   vollständig.**

**Ein vorheriger, Diss-basierter Spike wurde am 2026-05-15 verworfen**, weil
er die Theorie statt den Code als Implementierungs-Vorlage nahm. Der jetzt
vorliegende Plan ist ein C++-zentrischer Neustart.

## Was geprüft werden soll

Vor der Implementierung von ~25 Python-Klassen für Phase 1 will ich Cross-AI-
Review der **5 Context-Files** im Repo unter `docs/`. Diese Files sind als
**Implementierungs-Vertrag** gedacht: Der Python-Implementer soll aus ihnen
allein (plus den darin zitierten C++-Snippets) den Code mechanisch ableiten
können.

| File | Zeilen | Bereich |
|---|---|---|
| `docs/porting-plan.md` | 546 | Übergeordneter Phasen-Plan (5 Phasen) + 5 Architektur-Entscheidungen |
| `docs/CONTEXT-P1-osimbase.md` | 954 | `OVerteil` (LCG), `OSimObj`, `OSimulator`, `OVerteilung` + 7 Subtypen |
| `docs/CONTEXT-P1-pps-knoten.md` | 1359 | `PSimObj`, `PSimulator`, `PDlplKnoten`, `PDurchlaufplan`, `PDlplKante` (+ Subtypen) |
| `docs/CONTEXT-P1-pps-prozess.md` | 909 | `PtProzess` (+ Phase-1-Subtypen), `PProzessDLL`, `PtTrigger`, `PtVerknuepfung` |
| `docs/CONTEXT-P1-pps-ausloeser.md` | 808 | `PAusloeser` (+ Subtypen), `PVerteilung` (+ 7 Subtypen), `PKlasse`-Hierarchie |
| `docs/CONTEXT-P1-azeit-skelett.md` | 551 | `ASimulator`, `APerson`, `AGruppe`, `AAslMehrfachZaz`, ... (Skelett-Tiefe) |

**Zugang zu den C++-Quellen:** Die Originale liegen unter
`C:/Users/JörgWFischer/PycharmProjects/OSim2004/OSimV01(Fj)/`. Falls deine
Sandbox dorthin nicht reicht, verlass dich auf die in den Context-Files
zitierten Snippets (jede kritische Methode ist verbatim zitiert mit
File:Zeilen-Referenz).

---

## Heikle Stellen — gezielte Prüf-Aufträge

Bitte prüfe **mit Priorität**:

### 1. PAWLICEK-LCG (CONTEXT-P1-osimbase.md)

Sektionen *Zufall() — der LCG-Step*, *VertNormCalc — Sum-of-6-Uniforms*,
*VertNorm — Jeerg-Rejection*.

- Stimmen die Konstanten (`AA=6636085.0`, `X=907633385.0`, `AM=4294967296.0`,
  `STD_KEIM=1776496601.0`) mit `inc/OVerteil.h` + `OFC/OVerteil.cpp` überein?
- Ist die Operations-Reihenfolge `fmod(AA * keim + X, AM)` korrekt? (vs. z.B.
  `fmod(AA * keim, AM) + X` oder andere Reihenfolge — das macht bit-genaue
  Unterschiede)
- `VertNormCalc`: 6 Aufrufe von `VertGleich()` in der Schleife, danach
  `* sqrt(2.0) * ((wert*wert/120.0 + 0.975) * sa)`. Stimmt die Operatoren-
  Reihenfolge? Stimmt die Klammerung? (Konkret: ist es `wert * sqrt(2.0)`
  *zuerst*, dann `*=` mit dem Polynom?)
- `VertNorm`-Jeerg-Rejection: ist die Bedingung `if (ew * -1 < wert) break`
  äquivalent zu `if (wert > -ew)`, und gibt sie das gewollte Verhalten
  („verwirf wenn `ew + wert < 0`")?
- `VertExpo`-Edge-Case: `while (wert <= 0.0) wert = Zufall();` — kann das
  bei bestimmten Keim-Werten zu Endlos-Schleife führen? (Mathematisch:
  Zufall() liefert `[0, 1)`, also kann es 0.0 geben. Worst Case?)
- **Python-Mapping**: Closure-Pattern für externen Keim — saubere Lösung?

### 2. Sim-Loop und Ereignis-Pool (CONTEXT-P1-osimbase.md)

Sektionen *Start() — der Main-Loop*, *EvtDoNext — Pop + Execute*, *Ptk-
Switching-Vertrag*.

- Status-Maschine: `ssBegin → OnSimBegin → ssPeriod → OnPeriodBegin →
  ssRunning → (Suspended-Pfad | EvtDoNext-Loop) → ssPeriod → OnPeriodEnd`.
  Vollständig? Übergänge korrekt?
- Ptk-Switching in `EvtDoNext`: stimmen die Bedingungen `nextEvent->m_time
  >= m_ptkBegin` (ein), `nextEvent->m_time >= m_ptkEnd && m_ptkEnd != 0`
  (aus)? Edge-Case `m_ptkBegin == 0`?
- `OnPeriodBreak` setzt `m_periodBegin += EvtCurrTime() - m_periodBegin`
  (= "auf Eventzeit springen"). Ist das korrekt für Mid-Period-Suspend?
- **MAX_EVENT_TIME-Konstante**: ich habe sie als TBD gelassen. Findest du
  sie in `EventPoolDll.h`? (Vermutung `0x3FFFFFFF`)
- **`$event(N)`-Sub-Time-Priorität**: ich habe sie als TBD gelassen. Wie
  setzt der C++-EventPool die `(N)`-Annotation in eine Sekundär-Sortierung
  um? Ist das wichtig für die Python-Engine?

### 3. Prozess-Logik (CONTEXT-P1-pps-knoten.md + -prozess.md)

- `PDlplKnoten::BearbeitBeginnen`: Reihenfolge `++m_iPtkBegAusloesungCount
  → RessVerfuegbar → OnProzBearbeitBeginn → BearbeitBeginnen → return TRUE`
  korrekt? Oder umgekehrt: Counter erst nach `RessVerfuegbar`?
- `OnProzBearbeitEnde`: `m_iPtkAusloesungCount` wird **nur unter `IsPtk()`**
  inkrementiert, `m_iPtkBegAusloesungCount` immer. Stimmt das? Ist das
  intentional oder ein Bug?
- `PDlplKnoten::OnProzBeendet`: `OnProzBearbeitEnde → m_lKanteAus.
  ProzWeitergeben`. Kann `m_lKanteAus == NULL` sein? (z.B. bei End-Knoten
  eines Plans?)
- **`PDpKnZeitvorgabe` fehlt in B2** (selbst-flagged). Die Klasse ist konkrete
  Subklasse von `PDlplKnoten` und liefert `GetDurchfuehrungszeit(proz)`, das
  von `PtProzZeitvorgabe::BearbeitBeginnen` aufgerufen wird. Wie schlimm ist
  das Loch? Welche anderen Subtypen fehlen für ein lauffähiges 1-Knoten-Plan?
- `PtProzZeitvorgabe::BearbeitBeenden`: Konsistenz-Check (Zeile in C++:
  `if (m_oKnoten->m_lKnotenOber != ONULL) if (... Find(m_oProzOber) == NULL
  && ... Find(m_oProzOber) == NULL) throw`). Was prüft das? Notwendig in
  P1?

### 4. Plan-Ende und Pfade (CONTEXT-P1-pps-knoten.md)

`PDurchlaufplan::OnDlplBeendet` hat **3 Ausgangs-Pfade**:
1. Sub-Plan mit `m_lKanteAus != NULL` → `m_lKanteAus->ProzWeitergeben`
2. Sub-Plan ohne `m_lKanteAus`, mit `m_lKnotenOber != NULL` →
   `m_lKnotenOber->OnProzSubBeendet`
3. Top-Level → `oProzThis->m_oTrigger->OnDlplBeendet`

- Vollständig? Was ist mit dem Fall „Top-Level-Plan ohne Trigger" (kann das
  passieren)?
- `oprPtProzDurchlaufplan(oProzThis)->BearbeitBeenden();` am Ende: korrekter
  Down-Cast?
- `PtProzDurchlaufplan::BearbeitBeenden` ruft `SucheUnterprozesseInPList()`-
  Check: wirft Exception wenn `>1`. Reicht das für Konsistenz, oder ist
  `== 1` (= nur Self) das richtige Kriterium?

### 5. Join-Counter (CONTEXT-P1-pps-knoten.md + -prozess.md)

`PDlplKante::ProzWeitergeben` mit `m_lVorgaenger.GetCount() > 1`:

- Es wird **am `m_oProzOber`** (Plan-Prozess) eine `PtVerknuepfung` angelegt,
  nicht an der Kante. Ist das robust gegen parallele Plan-Läufe?
- Initial-Count: `m_iAnzProz = count - 1`. Der erste Prozess kommt an → keine
  Verknüpfung gefunden → neue mit `count - 1` angelegt → return (kein
  Weitergeben). Zweiter kommt → `ProzWeitergeben` dekrementiert auf `count -
  2`. ... Letzter → 0 → return TRUE → Verknüpfung entfernen + Weitergeben.
  Stimmt die Off-by-one?

### 6. Kritischer Weg und Kosten-Verteilung

`PDurchlaufplan::CalcKritWegRek` (CONTEXT-P1-pps-knoten.md):

- Memoization über `oKante->m_dHelp`: bricht ab, wenn `m_dHelp >= dDlz`.
  Korrekt für "längster Weg" (= kritischer Weg)?
- Hauptweg iterativ über *ersten* Nachfolger; parallele Wege rekursiv.
  Warum dieser Split? (Vermutung: Performance; aber semantisch äquivalent
  zu komplett rekursiv?)
- Terminiert auf `IsEndKante()`. Was, wenn der Graph zyklisch ist? (kein
  Schutz im Code; Anforderung: Plan ist DAG?)

`PDurchlaufplan::CalcProzKostenRek`:

- Vorgänger-Join via `oKante->m_iHelp` (initial `m_lVorgaenger.GetCount()`,
  dekrementiert bei jedem `dEinKosten`-Eingang). Bei `> 0` Abbruch der Rekursion
  (wartet auf restliche Vorgänger). Bei `== 0` weiter.
- Verteilung `dEinKosten / kantanzahl` pro Nachfolger-Knoten. Ist das *gleich*-
  Verteilung okay, oder gibt es eine Gewichtung in OSim?

### 7. Listener-Pattern (alle Files)

C++ verwendet **eine intrusive linked-list** (`m_listSimHead → m_next → m_next
→ NULL`). Python-Mapping schlage ich als `list[Listener]` vor.

- Saubere Übersetzung? Reihenfolge der Benachrichtigung (vorn-nach-hinten
  beim `Send*`-Aufruf)?
- `Attach` in C++ macht `AddListener(head)` und gibt den neuen Head zurück
  (= insert-at-head). Sollte in Python entsprechend `insert(0, ...)` sein?

### 8. Listen-Mapping und LList-Companions

C++ hat für jede Sim-Klasse eine zugehörige `*LList`-Klasse (z.B.
`PDlplKnotenLList`), die als typisierter Container mit Eigentums-Semantik
fungiert. Python-Mapping: `list[T]`.

- Verluste? Was leistet `*LList` an Funktionalität, das `list` nicht bietet?
- `PSimList`/`PSimLList` haben `META` mit `AddProperty(...)` für KPI-
  Aggregation. Wird das in P1 gebraucht?

---

## Bekannte Lücken — Vollständigkeits-Check

Diese Lücken hat Claude beim Schreiben selbst markiert. Bitte prüfe, ob sie
**vollständig** sind oder ob es weitere Lücken gibt:

| Lücke | Wo | Schwere |
|---|---|---|
| **`PDpKnZeitvorgabe`** komplett fehlt | B2 | BLOCKER für End-to-End |
| **`MAX_EVENT_TIME`-Konstante** nicht verifiziert | B1 *EvtInsert* | HIGH |
| **`$event(N)`-Sub-Time-Priorität** nicht verifiziert | B1 *EvtDoNext* | MED |
| `GetPrgVblSystemZeit`, `FillKnzList`, `ValidateDlpRek` | B2 | LOW (KPI, nicht Sim-Pfad) |
| `PSimulator.cpp` nur selektiv gelesen | B2 | LOW |
| `PDpKaUebergang.cpp` Sim-Methoden nicht im Detail | B2 | MED (für P1-End-to-End relevant!) |
| `EventPoolDll`-Details nicht eingesehen | B1 | MED |
| `PListenerDlplKnoten`/`KanteListener` Listener-Reihenfolge | B2 | LOW |

**Frage an Codex:** Welche Klassen fehlen noch für einen lauffähigen 1-Knoten-
Plan (`test.otx`) bzw. 3-Pläne-Plan (`dc1.otx`)? Falls möglich, prüfe die
Test-Daten unter `../OSim2004/Vorstellung04/test.otx` und `dc1.otx`.

---

## Meta-Fragen

1. **Phase-Schnitt-Linie**: Phase 1 = OSimBase + minimaler OSimPro
   (siehe `porting-plan.md` Sektion *Migrations-Reihenfolge*). Ist diese
   Schnitt-Linie sinnvoll, oder gehört etwas, das ich in P2+ verschoben habe,
   eigentlich in P1?
2. **Architektur-Entscheidung Option B (Plain Python + Pydantic am IO-Rand)**:
   ist die für eine 1:1-C++-Portierung mit Polymorphismus + Listener +
   Mehrfachvererbung (`PRessBeleg + PAktor` in P3) zukunftssicher? Oder
   blockt das später?
3. **Python-Mappings allgemein**: Sind die typischen `class X(Y): ...`-
   Definitionen am Ende jeder Sektion korrekt + vollständig? Fehlen Typ-
   Annotationen? Wäre `dataclasses` für reine Daten-Container besser?
4. **AZeit-Skelett-Granularität (B5)**: Reicht das Skelett für
   `ASimulator`-Loadability, oder fehlt etwas Wichtiges? Speziell:
   `AAslMehrfachZaz.on_sim_begin` als no-op — kann das in P1 wirklich
   ohne Crash bleiben, oder löst es indirekt Probleme aus?
5. **Test-Daten**: Welche `.otx`-Files unter `../OSim2004/Vorstellung04/`
   sind realistisch für P1 spielbar? `test.otx` (1-Knoten) und `dc1.otx`
   (3 Pläne mit Verzweigung) sind primäre Validierung. Welche weiteren
   wären sinnvoll als Regressions-Tests?

---

## Erwartetes Output-Format

Bitte schreibe deine Findings nach `docs/REVIEW-FINDINGS.md` (überschreib,
falls existiert). Struktur:

```markdown
# Review-Findings — Phase-1 Context-Files

Reviewer: Codex
Datum: <YYYY-MM-DD>

## Zusammenfassung
<2-3 Sätze: Gesamteinschätzung, Anzahl Findings pro Schwere>

## BLOCKER (X)
### B1: <kurz-titel>
**Wo:** docs/<file>.md, Sektion <name>
**Befund:** <was ist falsch / fehlt>
**Empfehlung:** <konkret was tun>
**C++-Referenz:** <file>:<zeile> (falls relevant)

## HIGH (X)
<gleiches Format>

## MED (X)
<gleiches Format>

## LOW (X)
<gleiches Format>

## Antworten auf Meta-Fragen
<Frage-für-Frage>

## Empfehlung zur Implementierungs-Reihenfolge
<eigene Einschätzung, ob C0-C11 sinnvoll oder anders>
```

**Schwere-Definitionen**:
- **BLOCKER**: Wenn nicht adressiert, blockiert es C0–C11 oder macht den Test
  von `test.otx` unmöglich.
- **HIGH**: Sim-Korrektheit oder bit-genau-Verträge betroffen. Sollte vor
  Implementierung gefixt sein.
- **MED**: Nicht-blockierend, aber sinnvoll vor Implementierung anzugehen.
- **LOW**: Kosmetisch, dokumentarisch, später adressierbar.

**Bitte sparsam mit Findings, aber konsequent.** Lieber 3 echte BLOCKER als
30 vermeintliche Stilfragen.

Danke.
