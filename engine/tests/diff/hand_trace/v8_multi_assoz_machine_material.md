# V8 Hand-Trace: Knoten mit Maschine + Material gleichzeitig

Zweck: papier-genauer Trace für
`test_v8_relation.py::test_v8_multi_assoz_machine_and_material_both_available`.

Demonstriert wie `PtProzess.ress_verfuegbar()` mehrere Assoziationen
sequenziell prüft, für jede eine eigene `PtRelation` an `m_oRelationen`
hängt, und bei Bearbeit-Beginn/Ende alle Relationen einzeln notifiziert.

## Setup

```python
sim = PSimulator()

maschine = PBetriebsmittel(sim); maschine.m_sName = "M"
sim.register_ressource(maschine)

lager = PRessMenge(sim); lager.m_sName = "L"
lager.m_iBestandAnfang = 3
sim.register_ress_menge(lager)

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 100
sim.register_knoten(knoten)

# Reihenfolge in m_lAssozRess: erst Maschine, dann Material
a_m = PAssozBeleg(sim); a_m.m_lRessourcen.append(maschine)
knoten.add_assoziation(a_m)

a_l = PAssozMengeVerbr(sim); a_l.m_lMengRess = lager; a_l.m_iMengeEin = 1
knoten.add_assoziation(a_l)

ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 10; ausl.m_lDlpl = knoten
sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace

| Zeit | Event | Wirkung | M-Status | L-Bestand | proz.m_oRelationen |
|---|---|---|---|---|---|
| 0 | (Sim-Begin) | Lager auf BestandAnfang=3. Auslöser plant EvtAuslTriggern@10. | RS_FREI | 3 | — |
| 10 | EvtAuslTriggern (A) | proz_1 erzeugt. **K.bearbeit_beginnen**: BegCounter++=1. **proz.ress_verfuegbar**: iteriert m_lAssozRess. **(1) a_m.ress_verfuegbar** → M.ress_verfuegbar (rsFrei, AnfragenGesamt++=1, ErfuelltCount++=1) → True. **PtRelationBeleg(M)** an m_oRelationen. **(2) a_l.ress_verfuegbar** → L.ress_verfuegbar(1, abbuchen=True): AnfragenAb++=1, Bestand=3 ≥ 1 → True. **PtRelationMenge(L)** an m_oRelationen. → True (alles verfügbar). knoten._knoten_begin_zeit=10. listener.on_proz_bearbeit_beginn. **proz.bearbeit_beginnen** (PtProzZeitvorgabe): zeitinhalt=100, m_iBearbeitBeginn=10. super → status PT_BEARB, **relations.on_proz_beginn**: PtRelationBeleg → a_m.on_proz_beginn → M.ress_belegen (RS_BELEGT, EventBus `ress.belegen`). PtRelationMenge → a_l.on_proz_beginn → L.ress_abbuchen(1) (Bestand→2, KummVerb++=1, EventBus `ress.abbuchen`). EvtBearbeitEnde@110, EventBus `proz.bearbeit.start`. | RS_BELEGT | 2 | [PtRelBeleg(M), PtRelMenge(L)] |
| 110 | EvtBearbeitEnde (proz_1) | **proz.bearbeit_beenden** (PtProzZeitvorgabe): status=PT_ENDE, EventBus `proz.bearbeit.ende`, **K.on_proz_beendet**: AusloesungCount++=1, DLZ+=100, remove_prozess, kein KanteAus → A.on_dlpl_beendet (Dauer=100). super → **relations.on_proz_ende**: PtRelationBeleg → a_m.on_proz_ende → M.ress_freigeben (RS_FREI, EventBus `ress.freigeben`, proz_wart_ausloesen: leer). PtRelationMenge → a_l.on_proz_ende (no-op, Verbr-Variante: Verbrauch passierte schon bei Beginn). | RS_FREI | 2 | — |

## Erwartete Werte nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `knoten.m_iPtkBegAusloesungCount` | 1 | 1× bearbeit_beginnen |
| `knoten.m_iPtkProzRefuseCount` | 0 | keine Ablehnung |
| `knoten.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `maschine.m_rsStatus` | RS_FREI | nach Freigabe |
| `maschine.m_iPtkAnfragenGesamt` | 1 | 1 Check |
| `maschine.m_iPtkAnfrageErfuellt` | 1 | Check war erfolgreich |
| `lager.m_iBestandAktuell` | 2 | 3 - 1 verbraucht |
| `lager.m_iPtkKummVerbMengeGesamt` | 1 | 1× abgebucht |
| `lager.m_iPtkAnfragenAb` | 1 | 1 Check |

## EventBus-Reihenfolge

| Zeit | Topic |
|---|---|
| 10 | `ress.belegen` (M) |
| 10 | `ress.abbuchen` (L, bestand=2) |
| 10 | `proz.bearbeit.start` |
| 110 | `proz.bearbeit.ende` |
| 110 | `ress.freigeben` (M) |

## Multi-Assoz-Verhalten

1. **Reihenfolge im m_lAssozRess** bestimmt die Check-Reihenfolge in
   `proz.ress_verfuegbar` und damit auch die Notify-Reihenfolge in
   `bearbeit_beginnen`/`bearbeit_beenden`.

2. **Kurzschluss bei Fail**: sobald eine Assoz False liefert, wird die
   Iteration abgebrochen und `proz.ress_verfuegbar` returnt False.
   Nachfolgende Assoziationen werden NICHT mehr gefragt. Daher zählen
   Lager-Counter nur dann, wenn auch alle vorangehenden Assoz-Checks
   True ergeben hatten.

3. **Rollback bei Fail**: `PDlplKnoten.bearbeit_beginnen` ruft bei
   Fail `proz.on_bearbeit_abgelehnt`, das `m_oRelationen.clear()`
   macht. Die bereits angelegten Relationen werden weggeworfen, ohne
   die zugrundeliegenden Ressourcen zu „rollback"-en — was bei
   `PRessBeleg` unproblematisch ist (es wurde nur ein Counter erhöht,
   keine `ress_belegen`-Aktion ausgelöst), aber bei
   `PAssozMengeErzgt` auf bounded Lagern eine stale Reservierung in
   `m_lErlZubuchung` hinterlässt — dokumentierter C++-Bug, siehe
   `test_v8_bounded_erzgt_leak_known_limitation`.

4. **Lifecycle-Methoden pro Subtyp**:
   - `PAssozBeleg.on_proz_beginn` → ress_belegen (Maschine wird belegt)
   - `PAssozBeleg.on_proz_ende` → ress_freigeben (Maschine wird freigegeben)
   - `PAssozMengeVerbr.on_proz_beginn` → ress_abbuchen (Material entnehmen)
   - `PAssozMengeVerbr.on_proz_ende` → no-op (Verbrauch passierte schon)
   - `PAssozMengeErzgt.on_proz_beginn` → no-op (Produktion erst am Ende)
   - `PAssozMengeErzgt.on_proz_ende` → ress_zubuchen (Output ins Lager)
