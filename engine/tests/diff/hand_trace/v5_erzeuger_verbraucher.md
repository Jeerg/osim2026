# V5 Hand-Trace: Erzeuger → Lager → Verbraucher

Zweck: papier-genauer Trace für
`test_v5_material.py::test_v5_erzeuger_verbraucher_b_wartet_bis_a_liefert`.

## Setup

```python
sim = PSimulator()

lager = PRessMenge(sim); lager.m_sName = "L"
lager.m_iBestandAnfang = 0; lager.m_iBestandMax = -1  # unbegrenzt
sim.register_ress_menge(lager)

erzeuger = PDpKnKonstant(sim); erzeuger.m_sName = "E"
erzeuger.m_iDurchfuehrungszeit = 50
sim.register_knoten(erzeuger)

assoz_e = PAssozMengeErzgt(sim); assoz_e.m_lMengRess = lager; assoz_e.m_iMengeAus = 1
erzeuger.add_assoziation(assoz_e)

verbraucher = PDpKnKonstant(sim); verbraucher.m_sName = "V"
verbraucher.m_iDurchfuehrungszeit = 30
sim.register_knoten(verbraucher)

assoz_v = PAssozMengeVerbr(sim); assoz_v.m_lMengRess = lager; assoz_v.m_iMengeEin = 1
verbraucher.add_assoziation(assoz_v)

a_e = PAslEinzel(sim); a_e.m_sName = "A"; a_e.m_iBeginTermin = 10; a_e.m_lDlpl = erzeuger
a_v = PAslEinzel(sim); a_v.m_sName = "B"; a_v.m_iBeginTermin = 20; a_v.m_lDlpl = verbraucher
sim.register_ausloeser(a_e); sim.register_ausloeser(a_v)

sim.start()
```

## Event-Trace

| Zeit | sub | Event | Wirkung | Bestand |
|---|---|---|---|---|
| **0** | — | (Sim-Begin) | Lager: BestandAktuell = AnfangsBestand = 0. A plant `EvtAuslTriggern@10`, B plant `EvtAuslTriggern@20`. | 0 |
| 10 | 1 | `EvtAuslTriggern` (A) | A.dlpl_ausloesen → E.proz_weitergeben → proz_E1 → E.bearbeit_beginnen: BegCounter++ (1) → proz_E1.ress_verfuegbar → assoz_e.ress_verfuegbar → lager.ress_verfuegbar(1, proz_E1, abbuchen=False): AnfragenZu++=1, BestandMax=-1 → True (Platz unbegrenzt). PtRelationMenge an proz_E1. proz_E1.bearbeit_beginnen: Status PT_BEARB, relations.on_proz_beginn → Erzgt-Assoz hat keine Beginn-Logik (no-op). EvtBearbeitEnde@60. | 0 |
| 20 | 1 | `EvtAuslTriggern` (B) | B.dlpl_ausloesen → V.proz_weitergeben → proz_V1 → V.bearbeit_beginnen: BegCounter++ (1) → proz_V1.ress_verfuegbar → assoz_v.ress_verfuegbar → lager.ress_verfuegbar(1, proz_V1, abbuchen=True): AnfragenAb++=1, Bestand=0 < 1 → False, AbgelehnteAnfrAb++=1 → assoz_v.ress_verfuegbar False → on_bearbeit_abgelehnt (Relations clear), RefuseCounter++ → return False. PDpKnZeitvorgabe.proz_weitergeben hängt proz_V1 in m_oWarteSchl. | 0 |
| 60 | 2 | `EvtBearbeitEnde` (proz_E1) | proz_E1.bearbeit_beenden: Status PT_ENDE, EventBus, E.on_proz_beendet (Counter, DLZ+=50, kein KanteAus → A.on_dlpl_beendet). Dann **super().bearbeit_beenden** → relations.on_proz_ende → assoz_e.on_proz_ende(rel) → **lager.ress_zubuchen(1, proz_E1)**: Bestand=1, KummErzgMenge++=1, EventBus `ress.zubuchen`@60, **proz_wart_ausloesen**: snapshot=`[proz_V1]` → V.bearbeit_beginnen(proz_V1): BegCounter++ (2) → proz_V1.ress_verfuegbar → assoz_v.ress_verfuegbar → lager.ress_verfuegbar(1, proz_V1, True): AnfragenAb++=2, Bestand=1 ≥ 1 → True. PtRelationMenge. proz_V1.bearbeit_beginnen: Status PT_BEARB, relations.on_proz_beginn → assoz_v.on_proz_beginn → **lager.ress_abbuchen(1, proz_V1)**: Bestand=0, KummVerbMenge++=1, EventBus `ress.abbuchen`@60. Da BestandMax=-1 KEIN weiteres proz_wart_ausloesen. EvtBearbeitEnde@90. Zurück in proz_wart_ausloesen-Snapshot: nur proz_V1 — find(proz_V1)==-1 → skip. | 1 → 0 |
| 90 | 2 | `EvtBearbeitEnde` (proz_V1) | analog: Status PT_ENDE, V.on_proz_beendet (Counter, DLZ+=30, B.on_dlpl_beendet (dauer=70)), super → assoz_v.on_proz_ende (no-op, Verbr hat Verbrauch bei Beginn). proz_wart_ausloesen: Warteschl leer → return. | 0 |
| ... | — | Pool leer | — | 0 |
| 86400 | — | (Periode-Ende) | — | 0 |

## Erwartete Werte nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `sim.m_oWarteSchl.is_empty()` | True | Warteschlange leer |
| `lager.m_iBestandAktuell` | 0 | 1 produziert + 1 verbraucht |
| `lager.m_iPtkKummErzgMengeGesamt` | 1 | E hat einmal zugebucht |
| `lager.m_iPtkKummVerbMengeGesamt` | 1 | V hat einmal abgebucht |
| `lager.m_iPtkAnfragenZu` | 1 | E.ress_verfuegbar @t=10 |
| `lager.m_iPtkAnfragenAb` | 2 | V.ress_verfuegbar @t=20 + Re-Try @t=60 |
| `lager.m_iPtkAbgelehnteAnfrAb` | 1 | V bei t=20 abgelehnt |
| `lager.m_iPtkAbgelehnteAnfrZu` | 0 | E unbegrenzt → nie abgelehnt |
| `erzeuger.m_iPtkBegAusloesungCount` | 1 | E.bearbeit_beginnen 1× |
| `erzeuger.m_iPtkAusloesungCount` | 1 | E.on_proz_beendet 1× |
| `verbraucher.m_iPtkBegAusloesungCount` | 2 | V startet + Re-Try |
| `verbraucher.m_iPtkProzRefuseCount` | 1 | 1× abgelehnt |
| `verbraucher.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `a_e.m_iPtkAusloesungCount` | 1 | A meldet 1× abgeschlossen |
| `a_v.m_iPtkAusloesungCount` | 1 | B meldet 1× abgeschlossen |

## EventBus-Reihenfolge (für `ress.*`-Subscriber)

| Zeit | Topic | Felder |
|---|---|---|
| 60 | `ress.zubuchen` | ressource=L, menge=1, bestand=1 |
| 60 | `ress.abbuchen` | ressource=L, menge=1, bestand=0 |

**Beachte**: `ress.zubuchen` kommt VOR `ress.abbuchen` bei gleicher Zeit,
weil `on_proz_beendet` von proz_E1 erst E.routing macht, dann `super()` →
`zubuchen` → `proz_wart_ausloesen` → in dieser Kaskade V.bearbeit_beginnen
synchron → `abbuchen`. Alles im selben Event-Slot `EvtBearbeitEnde@60`.

## Unterschiede zu V4 (Beleg-Pfad)

| Aspekt | V4 (PRessBeleg) | V5 (PRessMenge) |
|---|---|---|
| Zustand | Boolean (rsFrei/rsBelegt) | Integer (Bestand) |
| ress_verfuegbar | True wenn rsFrei | True wenn Bestand ≥ menge |
| Verbrauch beim... | bearbeit_beginnen (belegen) | bearbeit_beginnen (Verbr) ODER bearbeit_beenden (Erzgt) |
| Mehrere Konsumenten gleichzeitig | nein (1 Maschine = 1 Auftrag) | ja (Lager kann viele gleichzeitig) |
| ProzWartAusloesen-Trigger | Freigabe (rsFrei) | Abbuchen (Platz frei) ODER Zubuchen (mehr Material) |
| ProzWartAusloesen-Abbruch | bei erneutem Belegen (rsBelegt) | nie (alle Wartenden prüfen) |
