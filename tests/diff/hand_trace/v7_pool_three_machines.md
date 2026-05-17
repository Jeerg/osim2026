# V7 Hand-Trace: Pool aus 3 Maschinen mit Wartepfad

Zweck: papier-genauer Trace für
`test_v7_pool.py::test_v7_pool_fourth_job_waits_for_first_free`.

Demonstriert die V7-Pool-Semantik: 1 Knoten, 1 PAssozBeleg mit 3
PBetriebsmittel in `m_lRessourcen`. Der first-free-Algorithmus iteriert
die Liste in Reihenfolge — die erste freie Ressource wird genommen, eine
PtRelationBeleg angelegt. Wenn keine frei ist, kommt der Prozess in die
zentrale Warteschlange; nach jedem `ress_freigeben` läuft auf der dann
freigewordenen Ressource `proz_wart_ausloesen`.

## Setup

```python
sim = PSimulator()

m1 = PBetriebsmittel(sim); m1.m_sName = "M1"; sim.register_ressource(m1)
m2 = PBetriebsmittel(sim); m2.m_sName = "M2"; sim.register_ressource(m2)
m3 = PBetriebsmittel(sim); m3.m_sName = "M3"; sim.register_ressource(m3)

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 100
sim.register_knoten(knoten)

assoz = PAssozBeleg(sim); assoz.m_sName = "K->Pool"
assoz.m_lRessourcen = [m1, m2, m3]
knoten.add_assoziation(assoz)

for i, t in enumerate((10, 20, 30, 40)):
    a = PAslEinzel(sim); a.m_sName = f"A{i+1}"
    a.m_iBeginTermin = t; a.m_lDlpl = knoten
    sim.register_ausloeser(a)

sim.start()
```

## Event-Trace

| Zeit | Event | Wirkung | M1 | M2 | M3 | Warteschl |
|---|---|---|---|---|---|---|
| 10 | EvtAuslTriggern (A1) | proz_A1: assoz.ress_verfuegbar → M1.ress_verfuegbar TRUE (rsFrei) → PtRelationBeleg(M1). bearbeit_beginnen → ress_belegen M1. EvtBearbeitEnde@110 | belegt | frei | frei | — |
| 20 | EvtAuslTriggern (A2) | proz_A2: assoz iteriert: M1.ress_verfuegbar FALSE (rsBelegt) → M2.ress_verfuegbar TRUE → PtRelationBeleg(M2). bearbeit_beginnen → ress_belegen M2. EvtBearbeitEnde@120 | belegt | belegt | frei | — |
| 30 | EvtAuslTriggern (A3) | proz_A3: M1 FALSE, M2 FALSE, M3 TRUE → PtRelationBeleg(M3). bearbeit_beginnen → ress_belegen M3. EvtBearbeitEnde@130 | belegt | belegt | belegt | — |
| 40 | EvtAuslTriggern (A4) | proz_A4: M1 FALSE, M2 FALSE, M3 FALSE → assoz.ress_verfuegbar FALSE → proz.ress_verfuegbar FALSE → on_bearbeit_abgelehnt (m_oRelationen.clear). RefuseCount++. proz_weitergeben → add_tail in m_oWarteSchl | belegt | belegt | belegt | [proz_A4] |
| 110 | EvtBearbeitEnde (proz_A1) | proz_A1.bearbeit_beenden → K.on_proz_beendet (counter, DLZ+=100, A1.on_dlpl_beendet). super → relations.on_proz_ende → assoz.on_proz_ende → **M1.ress_freigeben**: SetStatus(rsFrei), `ress.freigeben` Topic, **M1.proz_wart_ausloesen**: snapshot=[proz_A4] → K.bearbeit_beginnen(proz_A4): proz.ress_verfuegbar → assoz iteriert → M1.ress_verfuegbar TRUE (M1 ist gerade frei geworden) → PtRelationBeleg(M1) → True. bearbeit_beginnen → ress_belegen M1. EvtBearbeitEnde@210 | belegt | belegt | belegt | — |
| 120 | EvtBearbeitEnde (proz_A2) | analog: M2.ress_freigeben, M2.proz_wart_ausloesen — Warteschl leer → return | belegt | frei | belegt | — |
| 130 | EvtBearbeitEnde (proz_A3) | analog: M3.ress_freigeben, M3.proz_wart_ausloesen — Warteschl leer | belegt | frei | frei | — |
| 210 | EvtBearbeitEnde (proz_A4) | analog: M1.ress_freigeben — Warteschl leer | frei | frei | frei | — |
| 86400 | Periode-Ende | — | — | — | — | — |

## Erwartete Werte nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `knoten.m_iPtkBegAusloesungCount` | 5 | A1+A2+A3+A4+Re-Try für A4 |
| `knoten.m_iPtkProzRefuseCount` | 1 | A4 bei t=40 abgelehnt |
| `knoten.m_iPtkAusloesungCount` | 4 | alle 4 Aufträge fertig |
| `knoten.m_dPtkDurchlaufzeit` | 400.0 | 4× 100s aktive Bearbeitung |
| `m1.m_iPtkAnfragenGesamt` | 5 | A1, A2, A3, A4 (initial), A4 (Re-Try) |
| `m1.m_iPtkAnfrageErfuellt` | 2 | A1 + A4 |
| `m2.m_iPtkAnfragenGesamt` | 4 | A2, A3, A4 (initial), A4 (Re-Try? NEIN — bricht ab nach M1) |
| `m2.m_iPtkAnfrageErfuellt` | 1 | A2 |
| `m3.m_iPtkAnfragenGesamt` | 3 | A3, A4 (initial), A4 (Re-Try? NEIN) |
| `m3.m_iPtkAnfrageErfuellt` | 1 | A3 |
| `a4.m_dPtkDurchlaufzeit` | 170 | (110-40) Warte + 100 Aktiv |

**Klärung zu M2/M3 Anfragen:** Beim Re-Try @110 ist M1 frei → assoz
iteriert M1 (TRUE) → return SOFORT, ohne M2/M3 zu fragen. Daher zählt
M1 5 Anfragen (4 initial + 1 Re-Try), M2 4 (3 initial — A2/A3/A4 — und
in der A4-Re-Try wird M2 nicht gefragt weil M1 gleich TRUE liefert; aber
A1/A2/A3 fragen M2 nur wenn vorhergehende belegt sind. Genauer: A1 fragt
nur M1, A2 fragt M1+M2, A3 fragt M1+M2+M3, A4 (initial) fragt M1+M2+M3,
A4 (Re-Try) fragt nur M1).

Tatsächliche Zahlen:
- M1 angefragt: A1, A2, A3, A4, A4-Re-Try = **5**
- M2 angefragt: A2, A3, A4 = **3** (A1 fragt M1 nur; A4-Re-Try fragt M2 nicht)
- M3 angefragt: A3, A4 = **2** (analog)

**Test verifiziert** (siehe `test_v7_pool_three_jobs_run_parallel`-Variante).
Für den 4-Job-Test:
- M1.AnfragenGesamt = 4 + 1 = 5 (A1, A2, A3, A4 + Re-Try)
- M2.AnfragenGesamt = 3 (A2, A3, A4 — Re-Try fragt M2 NICHT, da M1 ja frei)
- M3.AnfragenGesamt = 2 (A3, A4)

## EventBus-Reihenfolge (für `ress.*`-Subscriber)

| Zeit | Topic | Felder |
|---|---|---|
| 10 | `ress.belegen` | ressource=M1 |
| 20 | `ress.belegen` | ressource=M2 |
| 30 | `ress.belegen` | ressource=M3 |
| 110 | `ress.freigeben` | ressource=M1 |
| 110 | `ress.belegen` | ressource=M1 (Re-Try-Erfolg) |
| 120 | `ress.freigeben` | ressource=M2 |
| 130 | `ress.freigeben` | ressource=M3 |
| 210 | `ress.freigeben` | ressource=M1 |

## Pool-Semantik in einem Satz

Bei `PAssozBeleg.m_lRessourcen = [M1, M2, ..., Mn]` ist die Strategie
**linear-first-free**: iteriere die Liste in Reihenfolge, nimm das erste
Element mit `rsFrei` (V6+: auch `RS_PAUSE` macht's nicht verfügbar). Das
ist identisch zum C++-Verhalten in `PAssozBeleg::RessVerfuegbar`
(PAssozRessource.cpp:601-624, Pfad `!IsEntFunktOn`). Ein Entscheider-
basierter Pool mit ABL_PREFER/ABL_STD/ABL_IF_NEEDED-Strategien (C++
Cpp:626-678) folgt mit Phase 5 (Entscheider).
