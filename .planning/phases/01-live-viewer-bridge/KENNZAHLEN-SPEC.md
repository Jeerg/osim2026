# KENNZAHLEN-SPEC — OSim2004-treue Kennzahlen aus dem Sim-Stream

Status: verbindlich. Quelle: tiefe Analyse des OSim2004-C++-Originals
(`C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\`), alle Formeln mit
`<datei>:<zeile>` belegt (Recherche 2026-05-30, 4 Agenten). Entstanden aus
Browser-UAT: die bisherigen Auswertungs-Tabellen entsprechen nicht dem PSim.

**Leitprinzip (vom Nutzer vorgegeben):** Die Engine loggt ROHDATEN (append-only
Events, gekeyt nach Bezugsobjekt-OID + Zeitstempeln). Die Kennzahlen werden im
**UI aus dem Stream berechnet** — so lassen sich beliebige Kennzahlen nachrüsten,
solange die nötigen Rohdaten mitgeloggt sind. KEINE voraggregierten KPIs in der
Engine (außer den bestehenden Period-Snapshots in kpi_auswertung).

---

## 0. Architektur des OSim-Kennzahl-Systems (1:1)

OSim trennt sauber **Berechnung** (`Ptk*` füllt einen Werte-Cube) von **Darstellung**
(`OChartCtrl` dekoriert). Genau diese Trennung bilden wir ab: Engine = Rohdaten,
UI = Cube-Füllung + Chart.

- Bezugsobjekt einer Auswertung ist die **Listen-Klasse**, nicht das Einzelobjekt.
- Pro Einzelobjekt ein `GetKnz*()`-Accessor; die Liste hat `Ptk*(cube)`:
  `cube.Resize(N+1)`, je Element `cube(x)=obj->GetKnz*()`, +1 Aggregat-Balken.
- **Aggregat-Konvention:** Skalar-KPIs → letzter Balken = arithm. Mittel, **rot**,
  Label „ø"/Durchschnitt. Tages-Zeitreihen → letzter Balken = **Summe**, **blau**,
  Label „Sum". (`PAusloeser.cpp:508-510` rot, `:633-635` blau.)
- **`m_PSim_NoZeroInEval`** (Profil-Flag, `PAusloeser.cpp:675,688`): wenn 1, teilt
  der ø-Balken durch die Anzahl der Objekte mit Wert ≠ 0 statt durch `GetCount()`.
  Zähler summiert IMMER alle (inkl. Nullen). Gilt für Auslöser- + Durchlaufplan-
  Liste; die Knoten-Liste nutzt immer `GetCount()`.

**Akkumulator-Trick** (`OSimBase/OSimulator.cpp:830-875`): keine Start/Ende-Paare
pro Instanz, sondern ein vorzeichenbehafteter Flächen-Akkumulator
`m_dPtkDurchlaufzeit` (bei Begin `-= t`, bei Ende `+= t`) + Offen-Zähler
`m_dTmpDurchlaufzeit`. Ergebnis = Σ(end−start). Für unsere Rohdaten-Strategie
loggen wir stattdessen die **Zeitstempel** und reproduzieren die Summe im UI.

---

## 1. Bezugsobjekt × KPI-Matrix (Auswertung-Menü, `OSimPro.rc:6191-6240`)

Drei Bezugsobjekte im Menü: **Auslöser**, **Durchlaufplan**, **Belegungsressource**
(Knoten nur über den Editor). Menü-ID ⇄ `Knz*`-Methode ⇄ Chart-Titel = 1:1.

| KPI | Auslöser | Durchlaufplan | Belegungsressource |
|---|:--:|:--:|:--:|
| Anzahl fertiggestellter Auslösungen | ✔ | ✔ | — |
| mittlere Durchlaufzeit | ✔ | ✔ | — |
| minimale Durchlaufzeit (geplant) | — | ✔ | — |
| Zielerreichungsgrad Durchlaufzeit | — | ✔ | — |
| Prozesskosten | — | ✔* | — |
| theoret. Kapazitätsbestand | — | — | ✔ |
| abgearbeiteter Kapazitätsbedarf | — | — | ✔ |
| **Auslastung** | — | — | ✔ |
| Einsatzzeit | — | — | ✔ |
| Periodenkosten / Kostensatz | — | — | ✔* |
| Zeitstressgrad / Ermüdungsgrad | — | — | ✔** |

\* Kosten = eigene Slice (nie simuliert), später. \*\* Mensch-Faktor = P5-M/azeit.

---

## 2. Exakte Formeln (mit Zitaten)

### 2.1 Durchlaufzeit (Dlfz)
- Einzel-Auslöser: `GetKnzMittlDlfz = m_dPtkDurchlaufzeit / m_iPtkAusloesungCount`
  (0 wenn count=0). `PAusloeser.cpp:149-155`.
  - Durchlaufzeit einer Auslösung = `end − start`; start = `EvtCurrTime` bei
    `DlplAusloesen` (`PAusloeser.cpp:73`), end = bei `OnDlplBeendet` (`:114`).
  - count++ nur bei vollständigem Ende (`:115-116`); Unterbrechung zählt NICHT.
- Knoten: `PDlplKnoten::GetKnzMittlDlfz` identisch (`PDlplKnoten.cpp:119-142`);
  start/end = `OnProzBearbeitBeginn`/`-Ende` (`:785-803`).
- Durchlaufplan: erbt von PDlplKnoten (`PDurchlaufplan.odh:34`) → Plan-Ebenen-
  Prozess-Begin/Ende.
- **mittlere DLZ über alles** = ungewichtetes Mittel der **Objekt-Mittel** (NICHT
  Pool-Mittel): `PAusloeserLList::PtkMittlDlfz` (`PAusloeser.cpp:650-712`),
  Durchlaufplan-Liste (`PDurchlaufplan.cpp:2072-2117`). NoZeroInEval s. §0.
- min. DLZ (geplant, kritischer Pfad): `PDurchlaufplan.cpp:204-224`.
- Zielerreichungsgrad DLZ = `min_dlfz / mittl_dlfz` (`PDlplKnoten.cpp:152-159`).

### 2.2 Belegungsressource-Auslastung
- `GetKnzEinsatzzeit` = `m_dPtkEinsatzzeit` (Belegungs-Fläche), settle via
  Start/Stop read-only (`PRessBeleg.cpp:1647-1665`).
- `GetKnzKapazitaetsbestand` = `GetKnzEinsatzzeit` (`:1588-…`).
- `GetKnzAbgearbeitBedarf` = `m_dPtkAbgBedarf`.
- **`GetKnzAuslastung` = `GetKnzAbgearbeitBedarf() / GetKnzKapazitaetsbestand()`**
  (`PRessBeleg.cpp:1617-1622`).
- Einsatz-Intervalle: `OnEinsatzBeginn`/`-Ende` → `PtkIntervallStart/Stop`
  (`:497,524`). Zeitbasis = Aufnahme-Periode (`m_ptkBegin`).
- Hinweis: theoret. Kapazität hängt am Schicht-/Verfügbarkeitsmodell (azeit/P5-M,
  heute Skelett); reine Belegungs-Fläche ist aus Occupancy-Events berechenbar.

### 2.3 Durchsatz / Warteschlange / nicht erfüllbare Anfragen
- Anzahl (fertiggestellter) Auslösungen = `m_iPtkAusloesungCount` (count completed,
  `PAusloeser.cpp:122-125`); begonnene = `m_iPtkBegAusloesungCount`.
- Anzahl im Zeitintervall (Tag): aus `m_lFertTerminList` (Abschluss-Zeitstempel,
  `PAusloeser.cpp:127-147`), letzter Balken = Summe/blau.
- Liefertermintreue (Zeg) = `m_iPtkNichtVerspaetetCount / m_iPtkAusloesungCount`,
  −1 wenn `m_iSollDauer==-1` oder count=0 (`PAusloeser.cpp:163-177`).
  on-time++ wenn `EvtCurrTime < soll_end_termin` (`:100-103`);
  `soll_end_termin = created + m_iSollDauer` (`:1457`).
- Planzeitgrad / Gütegrad (nur PAslEinzel) = `m_iPlanZeit / mittlDlfz` bzw.
  `m_iRealeAuftragsdauer / mittlDlfz` (`:1464-1473`).
- Nicht erfüllbare Anfragen (Ressource): `PRessBeleg::GetKnzAnzVergAnfragen =
  m_iPtkAnfragenGesamt − m_iPtkAnfrageErfuellt` (`PRessBeleg.cpp:1740-1742`),
  inkrementiert in `RessVerfuegbar` (`:555-589`).
- „Nicht bearbeitet" = Aufträge mit Status `ksEinlast` am Sim-Ende (Snapshot,
  `FSAMSimulatorViewerAuswNBearbeit.cpp:37-69`). PRO-Analogon: Trigger ohne
  Abschluss am Sim-Ende.
- **Material-„vergebliche Anforderung" ist im Original INERT** (`m_num_vergeb` wird
  nie inkrementiert) → nicht reproduzieren, als 0/„n/a" zeigen.

---

## 3. Engine-Log-Schema (Rohdaten → UI-Recompute)

Append-only, gekeyt nach OID + Zeit. Reine Read-Side-Listener (kein Sim-Kern-Edit,
SPEC §5 bleibt heilig). Bereits vorhanden (Stand 01-15):

| Stream | trägt heute | reicht für |
|---|---|---|
| `gantt_durchlauf` | start: auftrag_id, prozess_id, start_time, betriebsmittel_id, dauer_geplant, **auftrag_oid**; ende: end_time, dauer_ist, status | Auslöser-DLZ (über auftrag_oid gruppieren) |
| `gantt_einsatz` | on/off: ressource_id, start/end_time, auftrag_oid | Belegungs-Fläche (Einsatzzeit-Approx) |
| `gantt_wartequeue` | ressource_id, wartende, t | Queue-Länge |
| `reporting_record` | auftrag, art, start (P5-D-gated) | — (Liefertermintreue erst mit soll/ist) |
| `lifecycle` | period_num, period_begin, period_len | Perioden-Grenzen |

**Lücken (zu ergänzen, read-only):**
1. `gantt_durchlauf` braucht **`durchlaufplan_oid`** (+ optional `durchlaufplan_name`)
   am start-Frame → ermöglicht Gruppierung pro Durchlaufplan UND pro Auslöser.
2. `soll_end_termin` am start-Frame (= created + SollDauer) → Liefertermintreue.
3. Geschlossene `occupancy_interval` je Ressource mit `ress_oid` + `period_num`
   → exakte Einsatzzeit/Auslastung.
4. `abgearb_bedarf`-Delta je Prozess-Ende → exakter Auslastungs-Zähler.

Slice-Reihenfolge: zuerst (1)+(2) (kleiner read-only-Zusatz, schaltet Durchlaufzeit
+ Liefertermintreue frei), dann P5-D-Engine für (3)+(4) (Auslastung echt).

---

## 4. UI-Recompute-Regeln (bit-genau zum Original)

Ein `kennzahlen`-Modul liest die Frames und füllt je KPI einen Cube
`{categories:[{name,value}], summary:{label,value,kind:"oe"|"sum"}}`:

- **Pro-Objekt-Mittel-DLZ** = Σ(end−start über abgeschlossene Instanzen) ÷
  count(abgeschlossen). count=0 → 0.0. Nur `kind=="ende"` mit gültiger start/end.
- **über-alles** = (Σ Objekt-Mittel) ÷ N; N = Objektanzahl (default) oder Anzahl
  Objekte mit Mittel≠0 wenn NoZeroInEval. (Auslöser/Durchlaufplan; Knoten immer N.)
- Gruppierung: Auslöser über `auftrag_oid`, Durchlaufplan über `durchlaufplan_oid`.
- ø-Balken anhängen: Label „ø", kind „oe" (rot); Zeitreihen „Sum"/blau.
- ZegDLZ = geplant_min ÷ mittel; Anzahl = count(ende); Liefertermintreue =
  count(on_time) ÷ count(ende), skip wenn soll_end_termin fehlt.
- Auslastung = abgearb_bedarf ÷ einsatzzeit (sobald (3)+(4) vorhanden; bis dahin
  Occupancy-Fläche ÷ Perioden-Länge als ehrliche Approximation, klar etikettiert).

---

## 5. Test: exakter Abgleich mit dem Original

**Strategie (Test-Conventions: Hand-Trace-Tabelle):** Ein kleines, vollständig von
Hand durchgerechnetes Szenario, dessen Erwartungswerte direkt aus den OSim-C++-
Formeln (§2, mit Zeilenzitaten) abgeleitet sind. Der Test prüft, dass das
UI-`kennzahlen`-Modul exakt diese Werte liefert.

Pflicht-Fälle:
- Mittlere DLZ je Auslöser (mehrere Auslösungen, inkl. einer offenen → zählt nicht).
- über-alles als Mittel-der-Mittel (NICHT Pool-Mittel) — Gegenprobe mit Werten, bei
  denen sich beide unterscheiden.
- NoZeroInEval an/aus (ein Objekt mit Mittel 0 → Divisor ändert sich).
- ø-Balken: Label/Position/Wert.
- count=0 → 0.0; offene Instanz ohne end → ignoriert.
- (mit (2)) Liefertermintreue inkl. −1-Sentinel + count=0-Fall.

Jeder Erwartungswert im Test kommentiert mit der OSim-Quelle (`<datei>:<zeile>`).

---

## 6. Scope-Stufen

1. **Jetzt (computable today):** Durchlaufzeit-Familie (Auslöser + Durchlaufplan +
   über-alles), Anzahl Auslösungen. Engine: `durchlaufplan_oid` + `soll_end_termin`
   am gantt_durchlauf-start (read-only). UI: `kennzahlen.ts` + `AuswertungChart`
   (existiert) + Hand-Trace-Test.
2. **P5-D-Engine:** echte Auslastung (occupancy_interval + abgearb_bedarf),
   Zeitstress; dann Belegungsressource-KPIs echt.
3. **Später (eigene Sim):** Kosten, Lager/Material, Mensch-Faktor.
