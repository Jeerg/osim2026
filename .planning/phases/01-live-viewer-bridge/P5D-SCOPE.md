# P5-D-SCOPE — Aufgabe-Status-State-Machine (minimal) für das Grafikfenster

Status: CONCEPT, vor Implementierung zur Freigabe. Alle Aussagen 1:1 aus dem
OSim2004-C++ extrahiert; jede Behauptung zitiert `Datei:Zeile` auf beiden
Seiten. Ziel ist NICHT die volle P5-D/P5-E-Logik, sondern der kleinste treue
Teil, der einen Lauf dazu bringt, **Ressourcen-Belegung** (`m_oProzCurrent`) und
**Prozess-Status** (`m_eStatus`) so zu füllen und zu streamen, dass das
Grafikfenster (Belegungs-Segmente + Warteschlangen-Gebirge) echte Daten erhält.

Bezugsdokument (Ziel): `.planning/phases/01-live-viewer-bridge/GRAFIKFENSTER-SPEC.md`.

---

## 0. Befund (verifiziert 2026-05-29) und tatsächliche Ursache

Ein echter Lauf (`run_otx` auf `Bosch2_wechseln`) emittiert `gantt_durchlauf`
nur als `kind:"ende"` mit `status:"unbekannt"`, `start_time:null`, OHNE
`betriebsmittel`, und `gantt_einsatz` = 0 Frames, Warteschlange leer.

Die naheliegende Annahme („die Status-Maschine ist Skelett, Prozesse erreichen
nie `PT_BEARB`") ist beim Code-Studium nur **teilweise** korrekt. Die Wahrheit
ist differenzierter und entscheidend für den Aufwand:

1. **Der Status- und Belegungspfad existiert in Python bereits** — für
   `PtProzZeitvorgabe`. `bearbeit_beginnen` setzt `PT_BEARB`
   (`pps/prozess/base.py:110`) und plant `EvtBearbeitEnde`
   (`pps/prozess/zeitvorgabe.py:99-103`); die Relations-Notifikation
   (`base.py:115-116`) ruft `PAssozBeleg.on_proz_beginn`
   (`resources/assoziation/beleg.py:68-74`) → `PRessBeleg.ress_belegen`
   (`resources/beleg.py:229-240`), das `m_oProzCurrent=proz` UND
   `set_status(RS_BELEGT)` setzt. **`m_oProzCurrent` wird also zur Laufzeit
   befüllt** — exakt wie C++ `PRessBeleg::RessBelegen` (`PRessBeleg.cpp:605-616`).

2. **Die Streaming-Listener lesen diese Engine-Daten gar nicht.** `einsatz.py`
   und `gantt.py` leiten Belegung NICHT aus `PRessBeleg.m_oProzCurrent` ab,
   sondern raten sie aus dem gerade gepoppten Event-Prozess
   (`einsatz.py:94-118`, `gantt.py:99-117`). Das GRAFIKFENSTER-Kontrakt verlangt
   aber das Sampling von `PRessBeleg.m_oProzCurrent` pro Pixel (SPEC §4.1).
   → **Die Belegung ist im Engine-Kern vorhanden, wird aber falsch/gar nicht
   abgegriffen.**

3. **Der `partial`-Gate kappt die Felder.** `einsatz.py:44`
   (`is_slice_skeleton("P5-D") or is_slice_skeleton("P5-L")`) zwingt
   Minimal-Frames ohne `einsatz_typ`/`kontext`; die Farbe-pro-Auftrag ist damit
   nicht rekonstruierbar (`streaming/partial.py:25` listet `decisions.aufgabe`
   als Skelett). `gantt.py:133` schreibt `status:"unbekannt"` hart.

4. **Die per-Ressource-Warteschlange (`m_lPtkWartschl`) ist NICHT portiert.**
   C++ pflegt sie über `PtkUpDateProcessQueue` → `FillProzFromKnoten`
   (`PRessBeleg.cpp:1571-1578`, `:90-135`); `GetZstWartProzesse()` liest daraus
   (`:1807-1809`). In Python gibt es nur die **zentrale** `m_oWarteSchl`
   (`pps/simulator.py:54`); kein per-Ressource-Pendant, kein
   `GetZstWartProzesse`. → WaitQueue-Gebirge nicht streambar.

5. **Auftrag-OID für die Segmentfarbe fehlt.** C++ färbt das Segment über
   `oTrigger->m_oAusl->GetOID()` (SPEC §3.1, default `pmKAuftr`). Python-Trigger
   hat `m_oAusloeser` (`pps/trigger.py:32`), aber der `PAusloeser` trägt **keine
   stabile OID** als Frame-Feld; und `PRessBeleg::OnProzBeginn` setzt in C++ den
   bearbeitenden Beleg in den Trigger (`SetBearbRessBeleg`, `PRessBeleg.cpp:715`)
   — dieser Rück-Link fehlt in Python (`resources/beleg.py:333-336` ist nur
   Listener-Forward).

**Konsequenz für den Scope:** Der größere Teil der Arbeit liegt NICHT in der
Status-Maschine (die läuft), sondern (a) im **korrekten Abgreifen** von
`m_oProzCurrent`/`m_eStatus` durch die Listener, (b) im **Portieren der
per-Ressource-Warteschlange**, (c) im **Bereitstellen einer stabilen
Auftrag-OID**. Das ist deutlich kleiner als „ganz P5-D".

---

## 1. Die Status-State-Machine (C++ → Python)

### 1.1 Prozess-Status `m_eStatus`

C++-Enum `PtProzZeitStatus` (`OSimPro/PtProzess.odh:31-37`):

| C++ Wert | Bedeutung | Python `PtStatus` | Status in Python |
|----------|-----------|-------------------|------------------|
| `ptBearb` | Prozess in Bearbeitung | `PT_BEARB = 1` (`pps/prozess/base.py:28`) | **vorhanden, wird gesetzt** |
| `ptEnde`  | Bearbeitung zu Ende (Proz stirbt) | `PT_ENDE = 2` (`base.py:29`) | **vorhanden** |
| `ptWart`  | Prozess in Warteschlange | `PT_WART = 3` (`base.py:30`) | **vorhanden (Default)** |
| `ptUnt`   | Prozess unterbrochen | `PT_UNT = 4` (`base.py:31`) | **vorhanden** |

Hinweis Werte: C++ `ptBearb=0,ptEnde=1,ptWart=2,ptUnt=3` (impliziter enum-Start
bei 0, `PtProzess.odh:31-37`); Python startet bei 1. Die **Reihenfolge** ist 1:1,
die **Zahlen** weichen ab. Da Python-Status nur intern verglichen wird (nie aus
OTX geladen), ist das treu — ABER die Listener vergleichen heute hart gegen den
Literal `1` (`gantt.py:100`, `einsatz.py:33`). Das ist fragil und gehört in den
Scope (siehe §5).

### 1.2 Status-Übergänge (wer treibt sie)

Vollständig aus C++ `PtProzZeitvorgabe` (`PtProzess.cpp:572-668`) und
`PtProzess` (`:159-220`); Python-Pendant in Klammern:

| Übergang | Auslöser (C++) | Python-Ort | Vorhanden? |
|----------|----------------|------------|------------|
| `ptWart → ptBearb` | `PtProzZeitvorgabe::BearbeitBeginnen` setzt `m_eStatus=ptBearb` (`PtProzess.cpp:585`), plant `EvtBearbeitEnde` (`:594-595`) | `zeitvorgabe.py:64-103` (`PT_BEARB`, `EvtBearbeitEnde`) | **ja** |
| `ptBearb → ptEnde` | `EvtBearbeitEnde` → `BearbeitEnde` → `BearbeitBeenden` setzt `m_eStatus=ptEnde` (`:605`, `:641-645`) | `zeitvorgabe.py:110-138` + `EvtBearbeitEnde.execute` (`:28-29`) | **ja** |
| `ptBearb/ptWart → ptUnt` | `BearbeitUnterbrechen` setzt `ptUnt`, hängt Proz in zentrale WS (`:651`, `PtProzess.cpp:195/219`) | `zeitvorgabe.py:140-168`, `base.py:133-160` | **ja** |
| `ptUnt → ptBearb` (Resume) | erneutes `BearbeitBeginnen`, Zeitinhalt NICHT neu (`:578`) | `zeitvorgabe.py:87-89` | **ja** |

**Befund:** Die Prozess-Status-Maschine ist in Python funktional vollständig.
Es gibt KEINE fehlende Transition zu portieren. Der „skelett"-Charakter von
P5-D betrifft die **Entscheider-Strategien** (P5-E/F), nicht die Status-Maschine.

### 1.3 Ressourcen-Status `RessStatus` (Belegungs-Stati)

C++-Enum `RessStatus` (`PRessBeleg.odh:80-86`) ↔ Python `RessStatus`
(`resources/beleg.py:42-48`), 1:1 inkl. Zahlenwerten (1000-1003):

| C++ | Python | gesetzt durch (C++ → Python) | Scope-relevant? |
|-----|--------|------------------------------|-----------------|
| `rsFrei` | `RS_FREI` | `RessBelegen`-Ende/`RessFreigeben` (`:639`) → `ress_freigeben` (`beleg.py:269`) | ja (Segment-Gap) |
| `rsBelegt` | `RS_BELEGT` | `RessBelegen` (`:607`) → `ress_belegen` (`beleg.py:231`) | **ja (Segment-Füllung)** |
| `rsPause` | `RS_PAUSE` | `OnEinsatzEnde` (`:896`) → `on_einsatz_ende` (`beleg.py:424`) | nein (Einsatzzeit, V6) |
| `rsEndForDay` | `RS_END_FOR_DAY` | Entscheider-Pfad (`:863`) | **out of scope** |

Für die Grafik zählt nur `rsBelegt` vs. „nicht belegt" (`m_oProzCurrent`
non-null/null), nicht die feinen Pausen-Stati — SPEC §3.1 sampelt
`m_oProzCurrent`, nicht `m_rsStatus`.

---

## 2. Belegung (Occupancy-Population)

### 2.1 Wie/wann `m_oProzCurrent` gesetzt/gelöscht wird

C++ `PRessBeleg::RessBelegen` (`PRessBeleg.cpp:605-616`):
`SetStatus(rsBelegt); m_oProzCurrent=oProz; OnProzBeginn(oProz);`.
`RessFreigeben` (`:619-644`): `OnProzEnde; m_oProzCurrent=ONULL;
SetStatus(rsFrei); ProzWartAusloesen();`.

Python ist hierzu **1:1 vorhanden**: `ress_belegen` (`beleg.py:229-240`),
`ress_freigeben` (`beleg.py:242-280`). Aufrufkette identisch zu C++:

```
PtProzZeitvorgabe.bearbeit_beginnen      (zeitvorgabe.py:97 → super)
  └ PtProzess.bearbeit_beginnen          (base.py:115)  Relations
      └ PtRelation.on_proz_beginn        (relation.py:40)
          └ PAssozBeleg.on_proz_beginn   (assoziation/beleg.py:68)
              └ PRessBeleg.ress_belegen  (beleg.py:229)  → m_oProzCurrent gesetzt
```

C++-Pendant: `PtProzess::BearbeitBeginnen` (`PtProzess.cpp:159-171`) →
Relation `OnProzBeginn` → `PAssozBeleg::OnProzBeginn` → `RessBelegen`.

### 2.2 Welche Entscheidung die Ressource wählt

In C++ wählt im Entscheider-Fall `EPEntKrzRessourcenEinsatz`/die Strategie die
Ressource (Blocking-Stati). **Im Belegungs-Standardpfad** (`m_eRessUsage ==
eaBelegen`, der Default, `decisions/aufgabe.py:54/135`) wählt schlicht
`PAssozBeleg::RessVerfuegbar` die **erste freie** Ressource und legt eine
`PtRelationBeleg` an (`PAssozRessource.cpp:601-624` → `assoziation/beleg.py:41-55`).
Das ist bereits portiert.

**Scope-Entscheidung:** Wir bleiben im `eaBelegen`-Default-Pfad. Die
Entscheider-getriebene Ressourcen-Auswahl (`EPEntKrzRessourcenEinsatz` Blocking,
`reset_status_2_base`, `block_all`, `inc_ress`) bleibt **out of scope** — sie
ändert nur, WELCHE Ressource belegt wird, nicht DASS belegt wird. Für das
Grafikfenster genügt der Default.

### 2.3 Minimale Python-Änderung für nicht-leere Belegung

**Keine Engine-Änderung nötig**, um `m_oProzCurrent` zu füllen — das passiert
bereits. Die Belegung erscheint nur deshalb nicht im Stream, weil die Listener
sie nicht abgreifen (§5) und der `partial`-Gate sie kappt. Voraussetzung: der
Lauf erreicht überhaupt `eaBelegen`-Knoten mit angehängten `m_lAssozRess` —
das ist bei `Bosch2_wechseln` zu verifizieren (siehe Risiko §7).

---

## 3. Warteschlange (per-Ressource)

### 3.1 C++-Mechanik

Die per-Ressource-Warteschlange ist eine **Protokoll-Liste** `m_lPtkWartschl`
(`PRessBeleg.odh:227`, Typ `PRessBelegPtkWartschl`), NICHT die zentrale
Event-Warteschlange. Gepflegt durch:

- `PRessBeleg::PtkUpDateProcessQueue(knoten, assbeleg, proz, add)`
  (`PRessBeleg.cpp:1571-1578`) → `FillProzFromKnoten` (`:90-135`):
  `add=TRUE` → `AddProz` (`:25-49`); `add=FALSE` → `ClearProz` (`:53-67`).
- Aufrufer: `PtProzess::PtkUpDateProcessQueue` iteriert die Assoz des Knotens
  (`PtProzess.cpp:239-252`).
- Gelesen für die Grafik: `GetZstWartProzesse()` →
  `m_lPtkWartschl.GetKnzProzAnzahl(FALSE)` (`:1807-1809`), bzw.
  `GetZstWartArbInhalt()` → `GetKnzArbeitsinhalt(FALSE)` (`:1815-1817`).
  Beide nur aktiv, wenn `m_bPtkWartschl` gesetzt ist (`:30`, `:99`).

SPEC §3.2/§4.2: das WaitQueue-Gebirge sampelt `m_lRessBeleg[*].GetZstWartProzesse()`
pro Pixel.

### 3.2 Minimale Python-Änderung

In Python existiert `m_lPtkWartschl` NICHT. Minimal-treuer Port:

1. `PRessBeleg.m_lPtkWartschl: list[PtProzess]` als Feld (`resources/beleg.py`,
   neben `m_oProzCurrent`). Kein eigener Info-Record-Typ nötig für den
   Count-Modus (`qcCount`); der `qcContent`/Umlage-Modus bleibt out of scope.
2. `PRessBeleg.get_zst_wart_prozesse() -> int` = `len(m_lPtkWartschl)` (1:1 zu
   `GetKnzProzAnzahl(FALSE)` ohne Umlage, `:185-201`).
3. Befüllung an genau einer Stelle treu nachziehen: dort, wo C++
   `PtkUpDateProcessQueue(add=TRUE)` beim Einlasten und `(add=FALSE)` beim
   Bearbeit-Beginn ruft. **Vereinfachte, treue Variante für den Count-Modus:**
   ein Prozess „wartet vor Ressource R", solange er der zentralen `m_oWarteSchl`
   anhängt UND R eine seiner Knoten-Assoz-Ressourcen ist. Implementierung:
   beim `add_tail` in die zentrale WS (`zeitvorgabe.py`/`aufgabe.py:123`,
   `base.py:160`) den Proz zusätzlich in `m_lPtkWartschl` jeder seiner
   `PAssozBeleg.m_lRessourcen` eintragen; beim erfolgreichen `ress_belegen`
   wieder austragen. Das reproduziert `GetZstWartProzesse()` exakt im
   Count-Modus, ohne den vollen Protokoll-Apparat (`GetKnzArbeitsinhalt`,
   Umlagefaktoren) zu portieren.

`GetZstWartArbInhalt` (Arbeitsinhalt-Variante) und der Umlage-Pfad bleiben
**out of scope** (nur `qcCount`, nicht `qcContent`).

---

## 4. Auftrag-OID für die Segmentfarbe

### 4.1 C++-Quelle

SPEC §3.1: `oid = oTrigger->m_oAusl->GetOID()`, Farbe
`RGB((oid%4)*64, ((oid/4)%4)*64, ((oid/16)%4)*64)`
(`PGfxRowObj.cpp:368-378`, default `pmKAuftr`). Der besetzende Prozess kennt
seinen Trigger (`PtProzess::m_oTrigger`, `PtProzess.odh:57`); der Trigger den
Auslöser (`m_oAusl`); der Auslöser hat eine stabile OID (`GetOID`).
Zusätzlich trägt C++ `PRessBeleg::OnProzBeginn` den Beleg in den Trigger ein
(`SetBearbRessBeleg(oprThis())`, `PRessBeleg.cpp:715`).

### 4.2 Minimale Python-Änderung

Die UI braucht NICHT die RGB-Berechnung in der Engine — nur eine **stabile
per-Auftrag-Id** auf dem Frame; die Quantisierung macht die UI (SPEC §6.4).

1. Eine stabile Auftrag-OID bereitstellen: `PtProzess.get_ausloeser()`
   (`base.py:59-67`) liefert den `PAusloeser`. Auf dem Auslöser eine stabile
   ganzzahlige Id exponieren — die OTX-OID des Auslösers ist die natürliche
   Wahl (`io/otx_writer.py:348` `get_oid` zeigt, dass jedes geladene Objekt eine
   OID-Identität hat; beim Loader analog hinterlegbar als `m_iOID`/`oid`).
   **Empfehlung:** ein Feld `oid` (oder `m_iOID`) auf `PAusloeser` beim Laden
   setzen; falls keine OTX-OID verfügbar, stabiler Fallback = laufender Index
   in `sim.m_lAusloeser`. Annahme offengelegt: existiert kein OID-Loader-Hook,
   wird der Index verwendet (deterministisch über die Ladereihenfolge).
2. `gantt_einsatz`/`gantt_durchlauf`-Frame um `auftrag_oid: int` ergänzen
   (zusätzlich zum bestehenden `auftrag_id`-Namen). `auftrag_id` (Name) bleibt
   für Lesbarkeit; `auftrag_oid` ist der Farb-Schlüssel.

---

## 5. Streaming-Listener-Deltas (klein, nach Engine-Daten)

Die Engine-Daten (§2, §3, §4) liegen dann vor. Die Listener-Änderungen:

### 5.1 `gantt.py` (`gantt_durchlauf`)

- `start`-Frame bereits beim ersten `PT_BEARB`-Sichten — **vorhanden**
  (`gantt.py:103-117`), aber heute über Event-Pop geraten. Treuer:
  `start_time = proz.m_iBearbeitBeginn` ist schon verdrahtet (`gantt.py:105`,
  Feld `zeitvorgabe.py:49`).
- `betriebsmittel_id`: heute `proz.m_oKnoten.m_sName` (`gantt.py:67-68`). Treuer
  ist die **belegte Ressource**: `proz.m_oAktor` bzw. der Beleg aus der
  `PtRelationBeleg` (`relation.py:58`). Scope: `betriebsmittel_id` aus der
  Relation/`m_oProzCurrent`-Rückrichtung ableiten statt aus dem Knoten.
- `status`: `"unbekannt"` (`gantt.py:133`) ersetzen durch echten End-Status aus
  `m_eStatus` (`PT_ENDE`) + Verspätungsvergleich (`m_iBearbeitBeginn` +
  geplant vs. ist). Minimal: `status = "abgeschlossen"` bei `PT_ENDE`.
- `auftrag_oid` ergänzen (§4.2).

### 5.2 `einsatz.py` (`gantt_einsatz`)

- **Quelle umstellen**: statt aus dem Event-Prozess raten, pro relevantem Event
  die **Ressourcen** `sim.m_lRessBeleg` (`simulator.py:57`) abgreifen und je
  Ressource `m_oProzCurrent` lesen (SPEC §4.1). `on`-Frame, wenn `m_oProzCurrent`
  von None→Proz wechselt; `off`-Frame bei Proz→None.
- `partial`-Gate (`einsatz.py:44`) entfernen, sobald `decisions.aufgabe` nicht
  mehr als Skelett gilt (`partial.py:25`). Dann `einsatz_typ:"bearbeitung"` +
  `kontext` + `auftrag_oid` voll schreiben (`einsatz.py:120-127`).
- `ressource_id` = belegter `PRessBeleg.m_sName` (nicht Knoten-Name).

### 5.3 NEUER per-Ressource-Queue-Sampler-Listener

Neue Datei `streaming/listeners/wartequeue.py` (Registry-Pattern, kein
`attach.py`-Edit — analog `einsatz.py:141-147`):

- **Events**: hookt `on_sim_ereig` (wie bestehende Listener). Bei jedem
  Bearbeit-Beginn/-Ende (Belegungsänderung) und/oder periodisch sampelt es je
  `r in sim.m_lRessBeleg`: `r.get_zst_wart_prozesse()` (§3.2).
- **Periodic-Samples-Kontrakt**: SPEC §1.6 — KEIN Wall-Clock-Timer; eine Probe
  pro „nächster sichtbarer Pixel-Zeit". In der Engine kennen wir die Pixel nicht;
  daher Kontrakt: **ein Frame pro Belegungs-/Warteschlangen-Änderung** (Event-
  getrieben) plus optional ein periodisches Sample-Intervall (z. B. je
  `EvtBearbeitEnde`). Die UI interpoliert zwischen Frames (Treppenfunktion) —
  das reproduziert das Gebirge aus SPEC §3.2 treu, da die Queue-Länge zwischen
  Events konstant ist.
- **Stream-Name**: `gantt_wartequeue` (neuer Stream), Frame:
  `{ressource_id, wartende: int, t}`. In `meta.json` zunächst `full`
  (Count-Modus vollständig; `qcContent`/Quali bleiben `partial`/deferred).

### 5.4 Quali bleibt vertagt

`GetZstQualifikationselemente()` (`PRessBeleg.cpp:1758-1775`) hängt am
Blocking-/LinkStatus-Modell (P5-E). **Out of scope.** `partial.py:114` (P5-M)
bleibt unverändert.

---

## 6. Aufwand, Risiko, Out-of-Scope

### 6.1 In Scope (Task-Breakdown, grob)

| # | Task | Seite | Aufwand |
|---|------|-------|---------|
| T1 | `m_lPtkWartschl` + `get_zst_wart_prozesse()` auf `PRessBeleg` (Count-Modus) | Engine (`resources/beleg.py`) | S |
| T2 | Befüllung der per-Ressource-Queue beim zentralen `add_tail`/`ress_belegen` | Engine (`beleg.py`, `base.py:160`) | M |
| T3 | Stabile `auftrag_oid` auf `PAusloeser` (OTX-OID oder Lade-Index) | Engine (`pps/ausloeser`, Loader) | S–M |
| T4 | `einsatz.py`: Quelle auf `sim.m_lRessBeleg[*].m_oProzCurrent` umstellen, `partial` lösen, `auftrag_oid`+`kontext` schreiben | Listener | M |
| T5 | `gantt.py`: echten End-`status`, `betriebsmittel_id` aus Belegung, `auftrag_oid` | Listener | S |
| T6 | NEUER `wartequeue.py`-Sampler (Stream `gantt_wartequeue`) | Listener | M |
| T7 | `partial.py`: `decisions.aufgabe` aus Skelett-Liste nehmen, Stream-Verträge anheben | Streaming | S |
| T8 | Status-Literal-Vergleich `==1` durch `PtStatus`-Import ersetzen (`gantt.py:100`, `einsatz.py:33`) | Listener | S |
| T9 | Integrationstest: `Bosch2_wechseln`-Lauf → `gantt_einsatz` > 0 Frames mit `auftrag_oid`, `gantt_wartequeue` befüllt | Tests | M |

Kein Eingriff in die Status-Maschine selbst (sie funktioniert, §1.2).

### 6.2 Out of Scope (explizit)

- Volle P5-E/F-Entscheider-Strategien (Blocking, `block_all`, `inc_ress`,
  `reset_status_2_base`, Subset-Vergleiche) — `decisions/aufgabe.py:566-749`
  bleiben Stubs.
- `rsPause`/`rsEndForDay`/Einsatzzeit-Mechanik (V6), Anwesenheit < 100 %.
- Quali-Gebirge (`GetZstQualifikationselemente`, P5-M).
- WaitQueue `qcContent`/Umlagefaktoren (`GetKnzArbeitsinhalt`, Umlage).
- RGB-Quantisierung in der Engine (macht die UI).
- Zentrale-Warteschlange-Gebirge (`m_oWarteSchl`-Summe) — nicht für die
  per-Ressource-Zeile nötig.

### 6.3 Größtes Risiko / Unsicherheit

**Erreicht der `Bosch2_wechseln`-Lauf überhaupt den `eaBelegen`-Belegungspfad?**
Der ganze Belegungs-Mechanismus (`ress_belegen` → `m_oProzCurrent`) feuert nur,
wenn die ausgeführten Knoten (a) `m_eRessUsage == eaBelegen` haben und (b)
mindestens eine `PAssozBeleg` mit nicht-leerer `m_lRessourcen` besitzen. Bei
`Bosch2_wechseln` laufen aber primär **Entscheidungs-Aufgaben-Knoten**
(`EPEnt*`), und deren `bearbeit_beginnen` verzweigt nach `m_eRessUsage`
(`decisions/aufgabe.py:135-157`): bei `eaKeineBelegung` (1002) wird **gar keine
Ressource belegt** (`:149-155`), bei `eaAnwesenheitPruefen` (1001) nur
`ress_anwesend` geprüft, NICHT `ress_belegen` (`:138-146`). Wenn die
Bosch2-Knoten überwiegend `eaKeineBelegung`/`eaAnwesenheitPruefen` sind, bleibt
`m_oProzCurrent` korrekt leer — dann ist die leere Belegung KEIN Bug, sondern
modelltreu, und die Grafik braucht ein anderes Modell (oder die echten
Bearbeitungs-Knoten unterhalb der Entscheidungen).

→ **Vor der Implementierung zu verifizieren** (1 Lauf mit Trace auf
`m_eRessUsage` je ausgeführtem Knoten + `m_lAssozRess`-Belegung): Welche Knoten
sind `eaBelegen` mit echten Ressourcen? Falls die belegenden Knoten erst die
**Sub-Pläne** der internen Entscheidungen sind (`EPEntAufgabeAltIntern` →
`dlpl_ausloesen`, `decisions/aufgabe.py:416-441`), muss zusätzlich sichergestellt
sein, dass das Sub-Plan-Routing in Python tatsächlich Bearbeitungs-Knoten
auslöst. Diese Frage entscheidet, ob T1–T9 genügen oder ob zuerst ein
Sub-Plan-Routing-Fix nötig ist.

Zweitrisiko: stabile `auftrag_oid` ohne OTX-OID-Loader-Hook (T3) — Fallback
Lade-Index ist deterministisch, aber nicht identisch zur C++-OID; die FARBEN
weichen dann von OSim2004 ab (Form/Treue der Segmente bleibt korrekt).
