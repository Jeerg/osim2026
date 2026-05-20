# V4 Hand-Trace: 1 Knoten + 1 passive Ressource + 2 Aufträge mit Konflikt

Zweck: papier-genauer Trace des Konflikt-Szenarios aus
`test_v4_passive_ressource.py::test_v4_konflikt_zweiter_auftrag_wartet_und_laeuft_nach_freigabe`.

## Setup

```python
sim = PSimulator()

knoten = PDpKnKonstant(sim); knoten.m_sName = "K1"
knoten.m_iDurchfuehrungszeit = 100
sim.register_knoten(knoten)

ress = PBetriebsmittel(sim); ress.m_sName = "M"
sim.register_ressource(ress)

assoz = PAssozBeleg(sim); assoz.m_sName = "K1->M"
assoz.m_lRessourcen.append(ress)
knoten.add_assoziation(assoz)

a1 = PAslEinzel(sim); a1.m_sName = "A1"; a1.m_iBeginTermin = 10; a1.m_lDlpl = knoten
a2 = PAslEinzel(sim); a2.m_sName = "A2"; a2.m_iBeginTermin = 20; a2.m_lDlpl = knoten
sim.register_ausloeser(a1); sim.register_ausloeser(a2)

sim.start()
```

## Event-Trace

| Zeit | sub | Event | Wirkung |
|---|---|---|---|
| **0** | — | (Sim-Begin) | A1 plant `EvtAuslTriggern@10`, A2 plant `EvtAuslTriggern@20`. Pool: `[(10, sub=1), (20, sub=1)]`. Ressource M: rsFrei. |
| 10 | 1 | `EvtAuslTriggern` (A1) | A1.dlpl_ausloesen → K1.proz_weitergeben → proz1 erzeugt → K1.bearbeit_beginnen(proz1): Counter++ (1), proz1.ress_verfuegbar() iteriert m_lAssozRess → assoz.ress_verfuegbar(proz1) → ress.ress_verfuegbar(proz1) sieht rsFrei → True, PtRelationBeleg an proz1 gehängt, AnfragenGesamt++=1, AnwAnwesend++=1, AnfrageErfuellt++=1 → return True → proz1.bearbeit_beginnen: Status PT_BEARB, relations.on_proz_beginn → ress.ress_belegen(proz1) → rsBelegt, m_oProzCurrent=proz1, `ress.belegen` Topic. Knoten plant `EvtBearbeitEnde@110`. |
| 20 | 1 | `EvtAuslTriggern` (A2) | A2.dlpl_ausloesen → K1.proz_weitergeben → proz2 erzeugt → K1.bearbeit_beginnen(proz2): Counter++ (2), proz2.ress_verfuegbar() → assoz.ress_verfuegbar(proz2) → ress.ress_verfuegbar(proz2): rsBelegt → False, AnfragenGesamt++=2, AnwAnwesend++=2, AnfrageErfuellt nicht erhöht. assoz.ress_verfuegbar returnt False → ress_verfuegbar False → on_bearbeit_abgelehnt() (Relations leer, hier no-op), m_iPtkProzRefuseCount++=1 → return False. PDpKnZeitvorgabe.proz_weitergeben hängt proz2 in m_oWarteSchl an. |
| 110 | 2 | `EvtBearbeitEnde` (proz1) | proz1.bearbeit_beenden: Status PT_ENDE, EventBus `proz.bearbeit.ende`, K1.on_proz_beendet(proz1): is_ptk → AusloesungCount++=1, DLZ+=100, Listener-Notify (keine), remove_prozess(proz1), kein KanteAus → proz1.m_oTrigger.on_dlpl_beendet → A1.on_dlpl_beendet (Counter++=1, dauer=100, `plan.beendet`). Dann super().bearbeit_beenden (PtProzess): relations.on_proz_ende → assoz.on_proz_ende(rel) → ress.ress_freigeben(proz1): on_proz_ende (Listener, keine), m_oProzCurrent=None, SetStatus(rsFrei), `ress.freigeben` Topic, **proz_wart_ausloesen**: snapshot der Warteschl `[proz2]`, prio=0 → K1.bearbeit_beginnen(proz2): Counter++ (3), proz2.ress_verfuegbar → assoz.ress_verfuegbar → ress.ress_verfuegbar sieht rsFrei → True, AnfragenGesamt++=3, AnfrageErfuellt++=2, neue PtRelationBeleg → return True → proz2.bearbeit_beginnen: Status PT_BEARB, relations.on_proz_beginn → ress.ress_belegen(proz2) → rsBelegt → `EvtBearbeitEnde@210`. Snapshot weiter → ws.find(proz2)==-1 (gerade entfernt) → skip. |
| 210 | 2 | `EvtBearbeitEnde` (proz2) | analog 110, aber für A2: Counter, DLZ+=100, KanteAus=None → A2.on_dlpl_beendet (Counter++=1, dauer=190), super → ress.ress_freigeben → rsFrei, proz_wart_ausloesen: Warteschl leer → return. |
| ... | — | Pool leer | `is_empty(86399)` True. |
| 86400 | — | (Periode-Ende) | m_periodNum=1, m_periodBegin=86400. |

## Erwartete Counter nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `sim.m_oWarteSchl.is_empty()` | True | Warteschlange am Ende leer |
| `knoten.m_iPtkBegAusloesungCount` | 3 | 2 Auslösungen + 1 Re-Try aus ProzWartAusloesen |
| `knoten.m_iPtkProzRefuseCount` | 1 | A2 wurde einmal abgelehnt |
| `knoten.m_iPtkProzessCount` | 2 | 2× PtProzZeitvorgabe erzeugt |
| `knoten.m_iPtkAusloesungCount` | 2 | 2× on_proz_beendet (während is_ptk) |
| `knoten.m_dPtkDurchlaufzeit` | 200.0 | 100 + 100 |
| `a1.m_iPtkBegAusloesungCount` | 1 | 1× dlpl_ausloesen |
| `a1.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `a2.m_iPtkBegAusloesungCount` | 1 | 1× dlpl_ausloesen |
| `a2.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `ress.m_rsStatus` | RS_FREI | wieder frei nach proz2-Ende |
| `ress.m_iPtkAnfragenGesamt` | 3 | A1 + A2 + Re-Try |
| `ress.m_iPtkBeiAnfrageAnwesend` | 3 | Anw-Wahrsch=100 → bei jeder Anfrage anwesend |
| `ress.m_iPtkAnfrageErfuellt` | 2 | A1@10 + A2@110 |
| `sim.evt_get_sum()` | 4 | 2× EvtAuslTriggern + 2× EvtBearbeitEnde |

## EventBus-Topic-Reihenfolge (für `ress.*`-Subscriber)

| Zeit | Topic | Felder |
|---|---|---|
| 10 | `ress.belegen` | ressource=M, proz_id=A1.trig0\|K1 |
| 110 | `ress.freigeben` | ressource=M, proz_id=A1.trig0\|K1, neuer_status=rsFrei |
| 110 | `ress.belegen` | ressource=M, proz_id=A2.trig0\|K1 |
| 210 | `ress.freigeben` | ressource=M, proz_id=A2.trig0\|K1, neuer_status=rsFrei |

## Wichtige Beobachtungen

1. **Re-Try-Counter**: `m_iPtkBegAusloesungCount` zählt JEDE
   `bearbeit_beginnen`-Aufruf, auch erfolglose und Re-Tries — exakt C++
   `PDlplKnoten::BearbeitBeginnen` Verhalten.
2. **Reihenfolge bei `bearbeit_beenden`**: zuerst Knoten-Routing (was bei
   gleichem Ressourcen-Knoten dazu führen würde, dass der Folge-Prozess
   die Ressource noch belegt sieht und in die Warteschlange wandert),
   DANN `super()` (Relations → ress_freigeben → proz_wart_ausloesen). Damit
   verhält sich der Code 1:1 wie C++ `PtProzZeitvorgabe::BearbeitBeenden`
   (PtProzess.cpp:603-638).
3. **Snapshot vor Iteration**: `proz_wart_ausloesen` arbeitet auf
   `list(ws)` und prüft `ws.find(proz)` vor jedem Versuch — sicher gegen
   die Mutation der Liste während `bearbeit_beginnen`.
