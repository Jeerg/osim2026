# Review-Request: Python-Code-Implementation gegen OSim2004-Original

**Adressat:** Codex (Cross-AI-Peer-Review, GPT-5.5)
**Auftraggeber:** Jörg Werner Fischer (Originalautor von OSim2004)
**Verfasser:** Claude (Opus 4.7)
**Datum:** 2026-05-17
**Vorgänger-Review:** [`REVIEW-REQUEST.md`](REVIEW-REQUEST.md) (Phase-1-Context-Files,
2026-05-15)

---

## Kontext

`osim-engine` ist eine **1:1-Portierung** der C++-Codebase **OSim2004** nach
Python — headless, ohne UI. Nach dem ersten Codex-Review der Phase-1-
Context-Files am 2026-05-15 wurde die Implementation in drei vertikalen
Slices durchgezogen:

| Slice | Inhalt | Tests |
|---|---|---|
| **C0-S** | Stochastik-Fundament: PAWLICEK-LCG, 7 OVerteilung-Subtypen, EventPool mit (time<<2)\|subTime-Schema | 33 (bit-genau gegen Python-Reference-Generator als Substitut bis C-Compiler verfügbar) |
| **V1** | OSimObj + OSimulator (Event-Loop, Period-Mechanik, Status-FSM, Ptk-Switching) + Listener + EventBus + minimaler PPS-Layer (1-Knoten-Sim ohne Plan-Graph) | 28 |
| **V2** | Plan-Graph: PDurchlaufplan + PDlplKante + PtVerknuepfung + PDpKaUebergang/Verteilung mit Spiegelprozess-Pattern + PtProzDurchlaufplan | 18 |
| **V3** | Kritischer Weg + Kosten-Verteilung in PDurchlaufplan | 9 |

**Lauf-Status:** 88 Tests grün in 0.27s.

**Harte Direktive (vom User):** *Code 1:1 aus C++ portieren, NICHT aus der
Diss. Plain Python-Klassen mit Vererbung. PAWLICEK-LCG bit-genau.*

---

## Was geprüft werden soll

Bevor wir mit Phase 2 (Ressourcen) beginnen, wollen wir ein Cross-AI-Review
der bisherigen **Python-Implementation gegen die C++-Quellen**. Du sollst
prüfen, ob die Portierung wörtlich die OSim2004-Semantik trifft.

### Mapping-Hilfe

[`docs/REVIEW-MAPPING.md`](REVIEW-MAPPING.md) listet pro Python-Modul:

- Welche C++-Klassen es portiert
- Welche `.cpp`-/`.odh`-Files die Vorlage waren
- Zeilen-Referenzen zu den zentralen Methoden
- 5 bereits dokumentierte C++-Eigenheiten (1:1 portiert)
- Vorgeschlagene Review-Reihenfolge

**Quell-Repo OSim2004:**
`C:/Users/JörgWFischer/PycharmProjects/OSim2004/OSimV01(Fj)/`

---

## Heikle Stellen — gezielte Prüf-Aufträge

### 1. LCG (`core/distribution.py::OVerteil.zufall`)

C++-Vorlage: `OFC/OVerteil.cpp:60-71` (Provenienz-Tabelle:
[`osim2004-trace/README-EXTRAHIERT.md`](../osim2004-trace/README-EXTRAHIERT.md))

```python
def zufall(self) -> float:
    self.keim = math.fmod(_AA * self.keim + _X, _AM)
    wert = self.keim / _AM
    if self._anti:
        return 1.0 - wert
    return wert
```

- Konstanten `AA=6636085.0, X=907633385.0, AM=2^32` — Bit-für-Bit identisch zu C++?
- `math.fmod` (Python) ↔ `fmod` (C): in Python ist `math.fmod` IEEE-754-konform
  (anders als Python-`%`). Stimmt das für **alle** Eingabe-Werte des LCG?
- Verhalten bei Antithetisch: regulär `wert`, antithetisch `1.0 - wert`.
  Beim ersten Aufruf nach `init_lcg(seed)` haben beide Modi denselben `m_keim`.
  Korrekt?

### 2. Verteilungs-Funktionen (`core/distribution.py`)

#### `vert_norm_calc` (Box-Müller-Polynom)

```python
def vert_norm_calc(self, ew: float = 0.0, sa: float = 1.0) -> float:
    wert = -3.0
    for _ in range(6):
        wert += self.vert_gleich()
    wert *= math.sqrt(2.0)
    wert *= (wert * wert / 120.0 + 0.975) * sa
    return wert if ew == 0.0 else (ew + ew * wert)
```

C++-Vorlage: `OFC/OVerteil.cpp:254-262`.

- **Kritisch**: Operatoren-Reihenfolge. Erst `wert *= sqrt(2.0)`, dann
  `wert *= (wert*wert/120.0 + 0.975) * sa`. Im C++ ist das zwei separate
  Statements. Hier auch. Bitte verifizieren dass nicht versehentlich
  zusammengezogen.
- Polynom-Korrektur: `(wert * wert / 120.0 + 0.975) * sa`. Klammerung
  stimmt mit C++ überein?
- Edge-Case bei `ew == 0.0`: gibt `wert` zurück (nicht `0 + 0 * wert = 0`).
  Stimmt das mit C++ überein? (C++: `(ew == 0.0) ? wert : (ew + ew * wert)`)

#### `vert_norm` (Jeerg-Rejection)

```python
def vert_norm(self, ew: float = 0.0, sa: float = 1.0) -> float:
    wert = 0.0
    n = 0
    while n < 10000:
        wert = self.vert_norm_calc(0.0, sa)
        n += 1
        if ew * -1 < wert:
            break
    if n >= 10000:
        wert = ew
    return ew + wert
```

C++-Vorlage: `OFC/OVerteil.cpp:234-252`.

- Rejection-Kriterium `if ew * -1 < wert`: äquivalent zu `wert > -ew`. C++
  schreibt es genau so. Bitte prüfen dass die Semantik in Python identisch
  ist (Float-Vergleich).
- `VertNormCalc(0, sa)` mit ew=0: warum nicht direkt `(ew, sa)`? — weil die
  Polynom-Korrektur bei ew=0 nicht den `ew + ew * wert`-Pfad nimmt.
  Stimmt diese Begründung mit C++ überein?
- Bei 10000 Rejections wird `wert = ew` gesetzt (in Python). Aber dann wird
  `ew + wert = ew + ew = 2*ew` zurückgegeben. C++ macht das auch. Ist das
  ein **C++-Bug oder beabsichtigt**? Sollte 1:1 bleiben oder fixen?

#### `vert_expo`

```python
def vert_expo(self, ew: float, rv: float = 0.0) -> float:
    wert = 0.0
    while wert <= 0.0:
        wert = self.zufall()
    return rv - math.log(wert) * (ew - rv)
```

C++-Vorlage: `OFC/OVerteil.cpp:335-341`.

- **Kritisch**: nutzt `self.zufall()` direkt, nicht `vert_gleich()`. Bei
  Antithetisch ergibt das andere Werte als `vert_gleich()`. Bei `anti=1`:
  `Zufall()` liefert `1.0 - wert`, was über die `while wert <= 0`-Schleife
  garantiert immer `True` ist (außer bei exakt 0, was kaum vorkommt).
  Funktioniert das, oder hängt der Loop bei Antithetisch nie?
- Edge-Case `wert == 0.0`: theoretisch möglich (`m_keim == 0` mod AM). Endlos-
  Schleife möglich? (vermutlich nein wegen LCG-Mathematik, aber bitte prüfen)

### 3. EventPool-Sortierung (`core/event_pool.py`)

```python
def insert(self, meta, obj, ezeit, para=None) -> EHDL:
    if ezeit < 0 or ezeit > MAX_EVENT_TIME:
        raise ValueError(...)
    sub_time = meta.m_subTime & 0x3
    combined = (ezeit << 2) | sub_time
    ...
```

C++-Vorlage: `OSimBase/EventPoolDll.cpp:184-186`.

- Encoding `(ezeit << 2) | sub_time` 1:1 wie C++?
- Aber: **`MAX_EVENT_TIME` ist `int` (= 500_000_000), nicht `long`**. Beim
  `<<2` in Python ist das egal (Python-int hat keine 32-Bit-Grenze), aber
  in C++ würde `MAX_EVENT_TIME << 2 = 2_000_000_000`, knapp unter 2^31.
  Konsequenz: Pool-Tail wird in C++ bei `(MAX << 2)` initialisiert, in Python
  nicht. Funktioniert die `is_empty(period_end)`-Logik trotzdem korrekt?
- `delete(hdl)` als Tombstone: `_entries_by_id.pop(hdl, None)` + `entry.deleted
  = True`. Bei mehrfachem `delete` auf dasselbe Handle: idempotent (ja,
  pop-with-default). Aber was wenn das Handle nie existierte (z. B.
  Garbage-Eingabe)? Wird das stillschweigend ignoriert, was wir wollen?

### 4. Sim-Loop (`core/simulator.py::start + evt_do_next`)

```python
def start(self) -> None:
    if self.m_simStatus == OSimStatus.BEGIN:
        self.on_sim_begin(self, deep=True)
        self.m_isPtk = False
        self.m_simStatus = OSimStatus.PERIOD

    if self.m_simStatus == OSimStatus.PERIOD:
        self.on_period_begin(deep=True)

    self.m_simStatus = OSimStatus.RUNNING

    self._on_sim_ereig()
    while self.evt_do_next():
        if self.m_simStatus == OSimStatus.SUSPENDED:
            self.evt_delete_curr()
            return
        self._on_sim_ereig()
        self.evt_delete_curr()

    self.m_simStatus = OSimStatus.PERIOD
    self.on_period_end(deep=True)
```

C++-Vorlage: `OSimBase/OSimulator.cpp::Start()` (Z. 494-525).

- Re-Entry über `m_simStatus`: bei zweitem `start()`-Aufruf wird `on_sim_begin`
  übersprungen, aber `on_period_begin` läuft. Stimmt das mit C++ überein?
- Suspended-Pfad: `evt_delete_curr()` für den noch unverarbeiteten Event.
  In Python ist `_on_sim_ereig()` **vor** `evt_do_next` aufgerufen (also vor
  dem ersten Event-Pop), dann beim Suspended sofort raus. Stimmt die
  Reihenfolge mit C++? C++ macht `OSimEreig()` zuerst, dann
  `while (EvtDoNext()) { ... OSimEreig(); EvtDeleteCurr(); }`.

#### `evt_do_next` — Ptk-Switching

C++-Vorlage: `OSimBase/OSimulator.cpp:568-590`.

```python
if self.m_isPtk:
    if self.m_ptkEnd != 0 and next_event.m_time >= self.m_ptkEnd:
        self.on_rec_stop(self.m_ptkEnd, deep=True)
        self.m_isPtk = False
else:
    if next_event.m_time >= self.m_ptkBegin:
        if next_event.m_time < self.m_ptkEnd or self.m_ptkEnd == 0:
            self.m_isPtk = True
            self.on_rec_init(deep=True)
            self.on_rec_start(self.m_ptkBegin, deep=True)
```

- `on_rec_stop(self.m_ptkEnd, ...)` — nicht `next_event.m_time`. C++ macht
  das so (Z. 575). Stimmt der Vertrag: "Stop bei m_ptkEnd, nicht bei
  Event-Zeit"?
- Reihenfolge `on_rec_init` vor `on_rec_start`: korrekt nach C++ (Z. 582-583)?
- Edge-Case `m_ptkBegin == 0` UND `m_ptkEnd == 0`: Protokoll ab Sekunde 0
  bis zur Unendlichkeit. Stimmt das?

### 5. Period-Mechanik (`core/simulator.py::on_period_end + on_period_break`)

C++-Vorlage: `OSimBase/OSimulator.odh` (Z. 461-475, beide Methoden).

```python
def on_period_end(self, deep: bool = True) -> None:
    period_num_finished = self.m_periodNum
    end_time = self.m_periodBegin + self.m_periodLen
    self.m_periodNum += 1
    self.m_periodBegin += self.m_periodLen
    ...

def on_period_break(self, deep: bool = True) -> None:
    self.m_periodNum += 1
    self.m_periodBegin = self.evt_curr_time()
    ...
```

- `on_period_end`: snapshot vor Advance, dann periodNum++ und periodBegin +=
  periodLen. C++ macht das gleich, aber **OHNE den Snapshot** (der ist nur für
  unser EventBus-Topic). Bitte prüfen dass das Snapshot-Pattern keinen
  Bit-Unterschied zur C++-Semantik erzeugt.
- `on_period_break`: `m_periodBegin = self.evt_curr_time()` — das ist
  C++ `m_periodBegin += EvtCurrTime() - m_periodBegin`. Mathematisch äquivalent,
  aber falls `m_periodBegin` schon `evt_curr_time()` ist, ist Python-Variante
  ein No-Op und C++-Variante auch. Trotzdem prüfen dass C++-Verhalten getroffen.

### 6. Spiegelprozess-Pattern (`pps/kante/uebergang.py`)

C++-Vorlage: `OSimPro/PDlplKante.cpp:766-843`. Detail-Analyse in
[`docs/CONTEXT-P1-SUPPLEMENT.md`](CONTEXT-P1-SUPPLEMENT.md) § 4.

```python
def proz_weitergeben(self, proz, ent) -> None:
    if not self.is_start_kante():
        spiegel = self._make_spiegel(proz, ent, "PDpKaUebergang")
        target = spiegel
    else:
        target = proz
    sim.evt_insert(_EVT_UEBERGANG_ENDE, self, ..., para=target)
    self.m_lProzesse.append(target)
```

- Bei Startkante: **kein Spiegel**, aber **doch** EvtUebergangEnde. C++ macht
  das auch (PDlplKante.cpp:800-802 `else { EvtInsert(...) }`). Stimmt das?
- `_make_spiegel`: kopiert m_eStatus, m_oAktor, m_oKnoten, m_oTrigger,
  m_oProzOber, m_oEntitaet. C++ macht das gleich (PDlplKante.cpp:783-794).
  Fehlen Felder? (z. B. m_iPrioritaet, m_iErzeugungzeitpunkt — sollten die
  auch kopiert werden? C++ kopiert sie **nicht**)
- `evt_uebergang_ende`: ruft `PDlplKante.proz_weitergeben(self, proz, ent)`
  explizit über `PDlplKante.proz_weitergeben(...)` — NICHT `super()`. Grund:
  Vermeidung der Rekursion. Korrekt umgesetzt?

### 7. Join-Counter (`pps/kante/base.py + pps/verknuepfung.py`)

```python
# In PDlplKante.proz_weitergeben:
if len(self.m_lVorgaenger) > 1:
    proz_ober = proz.m_oProzOber
    verknpf = proz_ober.find_verknpf(self)
    if verknpf is not None:
        erfuellt = verknpf.proz_weitergeben(proz)
        if not erfuellt:
            return
        proz_ober.remove_verknpf(verknpf)
    else:
        verknpf = PtVerknuepfung(self.p_simulator)
        verknpf.m_oKante = self
        verknpf.m_iAnzProz = len(self.m_lVorgaenger) - 1
        proz_ober.add_verknpf(verknpf)
        return
```

C++-Vorlage: `OSimPro/PDlplKante.cpp:142-172`.

- Off-by-one: `m_iAnzProz = count - 1`. Bei 2 Vorgängern: erste Prozess
  → neue Verknüpfung mit `m_iAnzProz=1`. Zweiter Prozess → `proz_weitergeben`
  dekrementiert auf 0 → `erfuellt=True` → entfernen + weiter. Korrekt?
  Bei 3 Vorgängern analog: erster legt mit `m_iAnzProz=2` an, zweiter
  dekrementiert auf 1 → wartet, dritter dekrementiert auf 0 → fertig.
- **Wichtig**: Verknüpfung wird am `m_oProzOber` (Plan-Prozess) angelegt,
  nicht an der Kante. Bei parallelen Plan-Läufen (= zwei verschiedene
  m_oProzOber): zwei separate Verknüpfungen pro Kante möglich. C++ macht
  das auch. Sicherheit gegen Cross-Talk gewährleistet?
- Bei `verknpf.proz_weitergeben`-Aufruf: dekrementiert `m_iAnzProz`. Bei
  `m_iAnzProz <= 0` wirft Python-Code `RuntimeError`. C++ wirft
  `OException`. Bedeutet: doppelte Notifikation wäre ein Programmier-Fehler,
  nicht silent. Wollen wir das so?

### 8. PDurchlaufplan: kritischer Weg + Kosten-Verteilung

C++-Vorlage: `OSimPro/PDurchlaufplan.cpp:204-520`.

#### `_calc_krit_weg_rek`

```python
def _calc_krit_weg_rek(self, kante, d_dlz, z_klass):
    if kante.m_dHelp >= d_dlz:
        return
    kante.m_dHelp = d_dlz

    while kante is not None:
        if kante.is_end_kante():
            break
        kante.m_dHelp += kante.get_knz_min_dlfz(z_klass)

        kante_next = None
        for i, knoten in enumerate(kante.m_lNachfolger):
            d_dlz_new = kante.m_dHelp + knoten.get_knz_min_dlfz(z_klass)
            if i == 0:
                kante_next = knoten.m_lKanteAus
                if kante_next is None:
                    break
                if kante_next.m_dHelp < d_dlz_new:
                    kante_next.m_dHelp = d_dlz_new
            else:
                if knoten.m_lKanteAus is not None:
                    self._calc_krit_weg_rek(knoten.m_lKanteAus, d_dlz_new, z_klass)
        kante = kante_next
```

- Memoization über `m_dHelp >= d_dlz`: bricht ab, wenn schon ein längerer
  Pfad eingetragen. Korrekt für "längster Weg"?
- Hauptweg iterativ, parallele Wege rekursiv. C++ macht das gleich
  (PDurchlaufplan.cpp:264-303). Aber warum dieser Split? Performance?
  Semantisch identisch zu komplett rekursiv?
- Was wenn der Graph **zyklisch** ist? Kein Schutz im Code, weil
  Voraussetzung: Plan ist DAG. Sollte Python eine Assertion einbauen?

#### `_calc_proz_kosten_rek`

C++-Eigenheit (siehe REVIEW-MAPPING.md): `dEinKosten` wird nach Join-Iteration
nur aus dem Hauptweg-Nachfolger gesetzt, nicht aus `m_dHelp`-Akkumulation.
**Wir portieren 1:1** (Test `test_v3_kpi.py::test_kosten_verteilung_split_propagiert_hauptweg`
dokumentiert das).

- Ist das wirklich was C++ macht? Oder habe ich den C++-Code missverstanden?
- Falls C++-Bug: lassen wir es bewusst drin oder fixen wir?

### 9. Listener-Mechanik

```python
class OListenerSimulator(OListener):
    def attach(self, sim) -> None:
        sim._sim_listeners.insert(0, self)  # insert-at-head wie C++ AddListener
```

C++-Vorlage: `OSimBase/OSimulator.odh` Sektion OListenerSimulator.

- Insert-at-Head: korrekt portiert?
- Iteration mit Snapshot `for listener in list(self._sim_listeners)`: schützt
  vor Self-Detach. C++-Pointer-Chasing über `m_next` ist implizit safe.
  Aber: Snapshot heißt auch dass **währenddessen NEU angemeldete** Listener
  nicht benachrichtigt werden. Stimmt das mit C++ überein?

### 10. PtProzZeitvorgabe-Lifecycle

```python
def bearbeit_beginnen(self) -> None:
    super().bearbeit_beginnen()  # Status setzen
    self.m_iZeitinhaltAkt = self.m_oKnoten.get_durchfuehrungszeit(self)
    self.m_iZeitinhaltGesamt = self.m_iZeitinhaltAkt
    sim = self.p_simulator
    ende_zeit = sim.evt_curr_time() + self.m_iZeitinhaltAkt
    self._evt_bearbeit_ende_hdl = sim.evt_insert(_EVT_BEARBEIT_ENDE, self, ende_zeit)
```

C++-Vorlage: `OSimPro/PtProzess.cpp` Sektion `PtProzZeitvorgabe::BearbeitBeginnen`.

- C++ macht das in einer anderen Reihenfolge (Counter-Reihenfolge): in
  PDlplKnoten.cpp wird `m_iPtkBegAusloesungCount++` vor dem
  `proz->bearbeit_beginnen()`-Aufruf gemacht. In Python ist es genauso
  (siehe `pps/knoten/base.py::bearbeit_beginnen`). Reihenfolge:
  1. `ress_verfuegbar` prüfen
  2. `m_iPtkBegAusloesungCount++`
  3. `_knoten_begin_zeit` setzen
  4. Listener notifizieren
  5. `proz.bearbeit_beginnen()`
- Stimmt das mit C++? Insbesondere: ist der Counter-Inkrement vor oder nach
  `ress_verfuegbar`?

---

## Bekannte C++-Eigenheiten (1:1 portiert, dokumentiert)

Diese sind in [`REVIEW-MAPPING.md`](REVIEW-MAPPING.md) § Bekannte C++-Eigenheiten
gelistet. Du solltest sie **nicht** als Bugs markieren — wir wissen das
bereits:

1. `CalcProzKostenRek` Hauptweg-Propagation
2. `VertLogNorm` nutzt `VertNorm(0.0, 1.0)` (Halb-Normalverteilung-Effekt)
3. `VertExpo` nutzt `Zufall()` direkt (Antithetisch-Verhalten)
4. `OVerteilGleich.HoleZufallswert` ohne Clamping
5. `PDurchlaufplan.on_proz_beendet` wirft

Falls du **weitere** Eigenheiten findest, die wir noch nicht dokumentiert haben,
sind die hochinteressant.

---

## Meta-Fragen

1. **Welche Klassen, die für Phase 1 hätten implementiert sein müssen, fehlen
   noch?** (Vergleiche mit dem Klassen-Inventar in `docs/porting-plan.md`
   und der `Out-of-Scope`-Tabelle in REVIEW-MAPPING.md)
2. **Welche Tests fehlen für die V1/V2/V3-Reichweite?** (Aktuell: 88 Tests
   in tests/{unit,diff,diff/hand_trace,integration}/)
3. **Architektur-Entscheidung Option B (Plain Python + Pydantic am IO-Rand)**:
   wir haben sie 1:1 umgesetzt. Würdest du nach V3-Erfahrung was anders
   machen? Insbesondere bei der `bus.emit(...)`-Verteilung über PSimulator,
   PDlplKnoten, PDpKnZeitvorgabe, PDlplKante, PDurchlaufplan — ist das
   zerstreut, sollten wir das in einem zentralen Tracer-Layer bündeln?
4. **Reproduzierbarkeits-Tests**: die LCG-/Verteilungs-Fixtures sind aktuell
   aus dem Python-Reference-Generator (kein C-Compiler installiert).
   Sollte das Setup ergänzt werden um den C-Build-Schritt zu CI-fizieren?

---

## Erwartetes Output-Format

Bitte schreibe deine Findings nach `docs/REVIEW-FINDINGS-CODE.md`
(überschreib, falls existiert). Struktur:

```markdown
# Review-Findings — Python-Code-Implementation

Reviewer: Codex
Datum: <YYYY-MM-DD>

## Zusammenfassung
<2-3 Sätze: Gesamteinschätzung, Anzahl Findings pro Schwere>

## BLOCKER (X)
### B1: <kurz-titel>
**Wo:** src/osim_engine/<file>.py:<zeilen>
**C++-Referenz:** <file>:<zeilen>
**Befund:** <was ist falsch / fehlt>
**Empfehlung:** <konkret was tun>

## HIGH (X)
<gleiches Format>

## MED (X)
<gleiches Format>

## LOW (X)
<gleiches Format>

## Antworten auf Meta-Fragen
<Frage-für-Frage>

## Neu entdeckte C++-Eigenheiten
<falls vorhanden>

## Empfehlung für Phase-2-Start
<eigene Einschätzung — was sollte noch verbessert werden bevor wir mit Ressourcen anfangen?>
```

**Schwere-Definitionen**:
- **BLOCKER**: Code weicht semantisch von OSim2004 ab in einer Weise, die
  Simulations-Ergebnisse verfälscht. Muss vor Phase 2 gefixt werden.
- **HIGH**: Bit-Reproduzierbarkeit nicht gewährleistet, oder Verhalten weicht
  ab bei Edge-Cases.
- **MED**: Stilistisch oder strukturell sub-optimal, aber funktional korrekt.
- **LOW**: Kosmetisch, dokumentarisch, Test-Lücken.

**Bitte sparsam mit Findings, aber konsequent.** Lieber 3 echte BLOCKER als
30 vermeintliche Stilfragen.

Danke.
