# P4-A Hand-Trace: PDpKnRueckKonstant (N=3)

Papier-genauer Trace für `test_p4_a_ruecksprung.py`. Ein Outer-Plan
enthält einen `PDpKnRueckKonstant` mit `m_iWiederholungenZiel=3`, der
einen Sub-Plan mit einem einzigen `PDpKnKonstant(50)` iterativ ausführt.

Bezugscode: `pps/knoten/ruecksprung.py` + `OSimPro/PDpKnRuecksprung.cpp`.

## Setup

```python
sim = PSimulator()

sub = PDurchlaufplan(sim); sub.m_sName = "Sub"
inner = PDpKnKonstant(sim); inner.m_sName = "Sub.K"
inner.m_iDurchfuehrungszeit = 50
sub.add_knoten(inner)
kS = PDpKaUebergang(sim); kS.m_sName = "Sub.S"; kS.m_iUebergangszeit = 0
kE = PDpKaUebergang(sim); kE.m_sName = "Sub.E"; kE.m_iUebergangszeit = 0
sub.add_kante(kS); sub.add_kante(kE)
sub.set_start_kante(kS); kS.m_lNachfolger.append(inner); inner.m_lKanteEin = kS
inner.m_lKanteAus = kE; kE.m_lVorgaenger.append(inner); sub.set_end_kante(kE)

outer = PDurchlaufplan(sim); outer.m_sName = "Outer"
rueck = PDpKnRueckKonstant(sim); rueck.m_sName = "R"
rueck.m_iWiederholungenZiel = 3
rueck.set_sub_plan(sub)                    # setzt sub.m_lKnotenOber = rueck
outer.add_knoten(rueck)
okS = PDpKaUebergang(sim); okS.m_sName = "Out.S"; okS.m_iUebergangszeit = 0
okE = PDpKaUebergang(sim); okE.m_sName = "Out.E"; okE.m_iUebergangszeit = 0
outer.add_kante(okS); outer.add_kante(okE)
outer.set_start_kante(okS); okS.m_lNachfolger.append(rueck); rueck.m_lKanteEin = okS
rueck.m_lKanteAus = okE; okE.m_lVorgaenger.append(rueck); outer.set_end_kante(okE)

sim.register_plan(outer)
ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
ausl.m_lDlpl = outer
sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace

| Zeit | Phase | Wirkung |
|---|---|---|
| **0** | Sim-Begin | `A` plant `EvtAuslTriggern` bei t=0 |
| 0 | Iter 1 Start | `A.dlpl_ausloesen` → `Outer.dlpl_ausloesen` → `proz_outer` erzeugt → `Outer.bearbeit_beginnen` → `Out.S.proz_weitergeben(proz_outer)` → IsStartKante → kein Spiegel → `EvtUebergangEnde` für Out.S bei t=0 |
| 0 | Iter 1 Start | `EvtUebergangEnde` Out.S → `kante.weitergeben` → an Nachfolger R → `R.proz_weitergeben(proz_outer, ent)` → `PtProzRuecksprung proz_R` erzeugt, `m_iWiederholungen=0` → `R.bearbeit_beginnen(proz_R)` → Basis-Logik (ProzessCount++, BegAusloesungCount++) → `R.m_lDlpl.proz_weitergeben(proz_R, ent)` → `Sub.dlpl_ausloesen` → `proz_sub` erzeugt → `Sub.bearbeit_beginnen` → `Sub.S.proz_weitergeben` → IsStartKante → `EvtUebergangEnde` für Sub.S bei t=0 |
| 0 | Iter 1 Start | `EvtUebergangEnde` Sub.S → an Sub.K → `Sub.K.proz_weitergeben` → `proz_K1` erzeugt, `bearbeit_beginnen` → `EvtBearbeitEnde` bei t=50 |
| **50** | Iter 1 Ende | `proz_K1.bearbeit_beenden` → `Sub.K.on_proz_beendet` → AusloesungCount++ → `Sub.E.proz_weitergeben` → IsEndKante → Spiegel-Prozess, `EvtUebergangEnde` für Sub.E bei t=50 |
| 50 | Iter 2 Start | `EvtUebergangEnde` Sub.E → `Sub.on_dlpl_beendet(proz_sub.m_oProzOber=proz_R, ent)` → `Sub.m_lKnotenOber=R` → `R.on_proz_sub_beendet(proz_R, ent)` → `proz_R.m_iWiederholungen=1` → `ruecksprung_entscheiden`: 1<3 → TRUE → `R.m_lDlpl.proz_weitergeben(proz_R, ent)` (neue Sub-Iteration startet → `Sub.S.proz_weitergeben` → emittiert `kante.uebergang.start` und schedult `EvtUebergangEnde`) → ZURÜCK in `on_proz_sub_beendet`: `m_iWied=1`, nicht >1 → kein `ruecksprung.ende` → `_on_ruecksprung_beginn` (m_iWied=1 > 0) emittiert `ruecksprung.beginn` |
| 50 | Iter 2 Start | `EvtUebergangEnde` Sub.S (frisch geschedult) → an Sub.K → `proz_K2` erzeugt → `EvtBearbeitEnde` bei t=100 |
| **100** | Iter 2 Ende | analog: `Sub.K.on_proz_beendet` → Sub.E.proz_weitergeben → `EvtUebergangEnde` Sub.E |
| 100 | Iter 3 Start | `Sub.on_dlpl_beendet` → `R.on_proz_sub_beendet` → `m_iWiederholungen=2` → 2<3 → TRUE → `R.m_lDlpl.proz_weitergeben` (emit `kante.uebergang.start` für Sub.S) → m_iWied=2 > 1 → `_on_ruecksprung_ende` emittiert `ruecksprung.ende` (counter=1) → `_on_ruecksprung_beginn` emittiert `ruecksprung.beginn` (wied=2) |
| 100 | Iter 3 Start | `EvtUebergangEnde` Sub.S → Sub.K → `proz_K3` → `EvtBearbeitEnde` bei t=150 |
| **150** | Iter 3 Ende | `Sub.K.on_proz_beendet` → Sub.E.proz_weitergeben → `EvtUebergangEnde` Sub.E |
| 150 | Rück → Aus | `Sub.on_dlpl_beendet` → `R.on_proz_sub_beendet` → `m_iWiederholungen=3` → 3<3 → **FALSE** → kein Rücksprung. `R.m_lKanteAus=Out.E` ist gesetzt → `Out.E.proz_weitergeben(proz_R, ent)` (emit `kante.uebergang.start` für Out.E) → m_iWied=3 > 1 → `_on_ruecksprung_ende` emittiert `ruecksprung.ende` (counter=2) → `R.is_ptk` → `AusloesungCount++` → Listener-Notify → `remove_prozess(proz_R)` → `proz_R.bearbeit_beenden` |
| 150 | Plan-Ende | `EvtUebergangEnde` Out.E → IsEndKante → `Outer.on_dlpl_beendet(proz_R.m_oProzOber=proz_outer)` → Top-Level → `proz_outer.m_oTrigger.on_dlpl_beendet(proz_outer)` → `A.on_dlpl_beendet` → `AusloesungCount++` → `proz_outer.bearbeit_beenden` |
| 86400 | Period-End | `sim.period.end` |

## Reihenfolge-Subtilitäten

1. **In `on_proz_sub_beendet` läuft `proz_weitergeben` VOR `_on_ruecksprung_*`.**
   Daher: bei aktivem Rücksprung sieht der Bus erst `kante.uebergang.start (Sub.S)`,
   dann `ruecksprung.ende`/`ruecksprung.beginn`. Bei FALSE-Branch erst
   `kante.uebergang.start (Out.E)`, dann `ruecksprung.ende`.
2. **`ruecksprung.beginn` wird auch für die erste Wiederholung emittiert**
   (`m_iWiederholungen=1 > 0`), aber `ruecksprung.ende` erst ab der zweiten
   (`m_iWiederholungen > 1` — die erste Iteration zählt als Original).
3. **`m_iPtkRuecksprungCount`** zählt abgeschlossene Wiederholungen ohne
   die erste Iteration. Bei N=3 → Counter=2.
4. **`Sub.proz_weitergeben`** wird genau N-mal aufgerufen (N=3); `Sub.S`
   und `Sub.E` zählen 3 Übergänge. Die Outer-Kanten zählen je 1.

## Erwartete Counter

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `ausl.m_iPtkBegAusloesungCount` | 1 | A löst 1× aus |
| `ausl.m_iPtkAusloesungCount` | 1 | A.on_dlpl_beendet 1× |
| `ausl.m_dPtkDurchlaufzeit` | 150.0 | 3×50 = 150 |
| `outer.m_iPtkProzessCount` | 1 | 1× proz_outer |
| `outer.m_iPtkBegAusloesungCount` | 1 | Outer.bearbeit_beginnen 1× |
| `outer.m_iPtkAusloesungCount` | 1 | Outer.on_dlpl_beendet 1× |
| `rueck.m_iPtkProzessCount` | 1 | 1× proz_R |
| `rueck.m_iPtkBegAusloesungCount` | 1 | R.bearbeit_beginnen 1× |
| `rueck.m_iPtkAusloesungCount` | 1 | R schließt 1× (FALSE-Branch) |
| `rueck.m_iPtkRuecksprungCount` | 2 | 2 abgeschlossene Wiederholungen |
| `sub.m_iPtkProzessCount` | 3 | 3× proz_sub erzeugt |
| `sub.m_iPtkBegAusloesungCount` | 3 | Sub.bearbeit_beginnen 3× |
| `sub.m_iPtkAusloesungCount` | 3 | Sub.on_dlpl_beendet 3× |
| `inner.m_iPtkProzessCount` | 3 | 3× proz_K |
| `inner.m_iPtkBegAusloesungCount` | 3 | Sub.K.bearbeit_beginnen 3× |
| `inner.m_iPtkAusloesungCount` | 3 | Sub.K.on_proz_beendet 3× |
| `okS.m_iPtkUebergangCount` | 1 | Out.S 1× |
| `okE.m_iPtkUebergangCount` | 1 | Out.E 1× |
| `kS.m_iPtkUebergangCount` | 3 | Sub.S 3× |
| `kE.m_iPtkUebergangCount` | 3 | Sub.E 3× |
| `sim.evt_get_sum()` | 12 | 1× EvtAuslTriggern + 8× EvtUebergangEnde (Out.S+Out.E+3×Sub.S+3×Sub.E) + 3× EvtBearbeitEnde |

## EventBus-Topic-Reihenfolge

| Zeit | sub | Topic | Anmerkung |
|---|---|---|---|
| 0 | 0 | `sim.begin` | |
| 0 | 0 | `sim.period.begin` | |
| 0 | 1 | `plan.ausloesen` | A → Outer |
| 0 | 1 | `kante.uebergang.start` | Out.S |
| 0 | 3 | `kante.uebergang.ende` | Out.S |
| 0 | 3 | `kante.weitergeben` | Out.S |
| 0 | 3 | `proz.create` | knoten=R |
| 0 | 3 | `kante.uebergang.start` | Sub.S (Iter 1) |
| 0 | 3 | `kante.uebergang.ende` | Sub.S |
| 0 | 3 | `kante.weitergeben` | Sub.S |
| 0 | 3 | `proz.create` | Sub.K (Iter 1) |
| 0 | 3 | `proz.bearbeit.start` | Sub.K, ende_zeit=50 |
| 50 | 2 | `proz.bearbeit.ende` | Sub.K (Iter 1) |
| 50 | 2 | `kante.uebergang.start` | Sub.E (Iter 1) |
| 50 | 3 | `kante.uebergang.ende` | Sub.E |
| 50 | 3 | `kante.weitergeben` | Sub.E |
| 50 | 3 | `plan.beendet_intern` | Sub |
| 50 | 3 | `kante.uebergang.start` | Sub.S (Iter 2) — VOR ruecksprung.beginn |
| 50 | 3 | `ruecksprung.beginn` | wiederholung=1 |
| 50 | 3 | `kante.uebergang.ende` | Sub.S |
| 50 | 3 | `kante.weitergeben` | Sub.S |
| 50 | 3 | `proz.create` | Sub.K (Iter 2) |
| 50 | 3 | `proz.bearbeit.start` | Sub.K, ende_zeit=100 |
| 100 | 2 | `proz.bearbeit.ende` | Sub.K (Iter 2) |
| 100 | 2 | `kante.uebergang.start` | Sub.E (Iter 2) |
| 100 | 3 | `kante.uebergang.ende` | Sub.E |
| 100 | 3 | `kante.weitergeben` | Sub.E |
| 100 | 3 | `plan.beendet_intern` | Sub |
| 100 | 3 | `kante.uebergang.start` | Sub.S (Iter 3) |
| 100 | 3 | `ruecksprung.ende` | wiederholung=2, counter=1 |
| 100 | 3 | `ruecksprung.beginn` | wiederholung=2 |
| 100 | 3 | `kante.uebergang.ende` | Sub.S |
| 100 | 3 | `kante.weitergeben` | Sub.S |
| 100 | 3 | `proz.create` | Sub.K (Iter 3) |
| 100 | 3 | `proz.bearbeit.start` | Sub.K, ende_zeit=150 |
| 150 | 2 | `proz.bearbeit.ende` | Sub.K (Iter 3) |
| 150 | 2 | `kante.uebergang.start` | Sub.E (Iter 3) |
| 150 | 3 | `kante.uebergang.ende` | Sub.E |
| 150 | 3 | `kante.weitergeben` | Sub.E |
| 150 | 3 | `plan.beendet_intern` | Sub |
| 150 | 3 | `kante.uebergang.start` | Out.E — VOR ruecksprung.ende |
| 150 | 3 | `ruecksprung.ende` | wiederholung=3, counter=2 |
| 150 | 3 | `kante.uebergang.ende` | Out.E |
| 150 | 3 | `kante.weitergeben` | Out.E |
| 150 | 3 | `plan.beendet_intern` | Outer |
| 150 | 3 | `plan.beendet` | A, dauer=150 |
| 86400 | 3 | `sim.period.end` | |
