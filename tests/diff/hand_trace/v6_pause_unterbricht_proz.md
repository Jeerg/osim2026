# V6 Hand-Trace: Pause unterbricht laufenden Prozess

Zweck: papier-genauer Trace für
`test_v6_einsatzzeit.py::test_v6_pause_unterbricht_und_proz_resumed_mit_restzeit`.

## Setup

```python
sim = PSimulator()

ress = PBetriebsmittel(sim); ress.m_sName = "M"
sim.register_ressource(ress)

ez = PEinsatzzeitPause(sim); ez.m_sName = "EZ"
ez.m_lPausen.append(PPauseZyklus(
    m_iPausAnfang=10.0, m_iPausEnde=11.0, m_iPeriode=24.0  # Stunden
))
sim.register_einsatzzeit(ez)
ez.attach_ressource(ress)

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 5000  # Sekunden
sim.register_knoten(knoten)

assoz = PAssozBeleg(sim); assoz.m_lRessourcen.append(ress)
knoten.add_assoziation(assoz)

a = PAslEinzel(sim); a.m_sName = "A"; a.m_iBeginTermin = 35000; a.m_lDlpl = knoten
sim.register_ausloeser(a)

sim.start()
```

Zeit-Konvention: `m_iPausAnfang/Ende/Periode` in **Stunden** (float),
sim-time in **Sekunden**. Konvertierung: `int(h * 3600)`.
- Pause-Beginn = 10h = 36000s
- Pause-Ende   = 11h = 39600s

## Event-Trace

| Zeit | sub | Event | Wirkung | rsStatus | proz.status | zeitinhalt_akt |
|---|---|---|---|---|---|---|
| **0** | — | (Sim-Begin) | PEinsatzzeitPause.on_period_begin → insert_events: EvtPause(PEM_BEGIN)@36000, EvtPause(PEM_END)@39600. Auslöser plant EvtAuslTriggern@35000. | RS_FREI | — | — |
| 35000 | 1 | `EvtAuslTriggern` (A) | A.dlpl_ausloesen → K.proz_weitergeben → proz1. K.bearbeit_beginnen: BegCounter++=1, proz1.ress_verfuegbar → True, PtRelationBeleg. _knoten_begin_zeit=35000. proz1.bearbeit_beginnen (PtProzZeitvorgabe): status==PT_WART → zeitinhalt_akt=5000, m_iBearbeitBeginn=35000. super → PT_BEARB, relations.on_proz_beginn → ress.ress_belegen: rsBelegt, m_oProzCurrent=proz1, EventBus `ress.belegen`. EvtBearbeitEnde@40000 (=35000+5000), EventBus `proz.bearbeit.start`. | RS_BELEGT | PT_BEARB | 5000 |
| 36000 | 3 | `EvtPause(PEM_BEGIN)` (EZ) | ez.on_pause_event(PEM_BEGIN): m_isPause=True. Für jeden m_lRessBeleg: ress.on_einsatz_ende(EET_STD): m_TryedPause=True, EventBus `ress.einsatz.ende`, set_status(RS_PAUSE). m_oProzCurrent ≠ None → proz1.bearbeit_unterbrechen: PtProzZeitvorgabe.bearbeit_unterbrechen: status=PT_UNT, cancel EvtBearbeitEnde@40000, zeitinhalt_akt -= 36000-35000 = 1000 → **4000**. EventBus `proz.bearbeit.unterbr`. knoten.on_proz_unterbr: DLZ += 36000-35000 = 1000 (Intervall 1 geschlossen). super (PtProzess.bearbeit_unterbrechen): relations.on_proz_unterbr → assoz.on_proz_unterbr → ress.ress_unterbrechen: status==RS_PAUSE (nicht RS_BELEGT) → skip status, on_proz_unterbr listener, m_oProzCurrent=None. m_oRelationen.clear(). add_tail proz1 in m_oWarteSchl. | RS_PAUSE | PT_UNT | 4000 |
| 39600 | 3 | `EvtPause(PEM_END)` (EZ) | ez.on_pause_event(PEM_END): m_isPause=False. Für jeden m_lRessBeleg: ress.on_einsatz_beginn(EET_STD): m_TryedPause=False, EventBus `ress.einsatz.beginn`, set_status(RS_FREI), m_oProzCurrent=None. **proz_wart_ausloesen**: snapshot [proz1], prio 0. K.bearbeit_beginnen(proz1): BegCounter++=2, proz1.ress_verfuegbar → assoz.ress_verfuegbar → ress.ress_verfuegbar: rsFrei → True, neue PtRelationBeleg. _knoten_begin_zeit=39600. proz1.bearbeit_beginnen: status==PT_UNT → KEEP zeitinhalt_akt=4000, m_iBearbeitBeginn=39600. super → PT_BEARB, relations.on_proz_beginn → ress.ress_belegen: rsBelegt, EventBus `ress.belegen`. EvtBearbeitEnde@43600 (=39600+4000), EventBus `proz.bearbeit.start`. ws.find(proz1)==-1 → skip rest. | RS_BELEGT | PT_BEARB | 4000 |
| 43600 | 2 | `EvtBearbeitEnde` (proz1) | proz1.bearbeit_beenden: status=PT_ENDE, EventBus `proz.bearbeit.ende`, K.on_proz_beendet: AusloesungCount++=1, DLZ += 43600-39600 = 4000 (Intervall 2 geschlossen, **gesamt 5000**). remove_prozess. kein KanteAus → A.on_dlpl_beendet (AbgeCounter=1, dauer=43600-35000=8600). super → relations.on_proz_ende → assoz.on_proz_ende → ress.ress_freigeben: on_proz_ende listener, m_oProzCurrent=None, set_status(RS_FREI), EventBus `ress.freigeben`. proz_wart_ausloesen: Warteschl leer. | RS_FREI | PT_ENDE | 0 |
| 86400 | — | (Periode-Ende) | m_periodNum=1, m_periodBegin=86400. | RS_FREI | — | — |

## Erwartete Werte nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `sim.m_oWarteSchl.is_empty()` | True | proz1 nach Resume entfernt |
| `ress.m_rsStatus` | RS_FREI | nach freigeben |
| `ress.m_oProzCurrent` | None | proz1 fertig |
| `ress.m_iPtkAnfragenGesamt` | 2 | initial @35000 + Resume @39600 |
| `ress.m_iPtkBeiAnfrageAnwesend` | 2 | Anw-Wahrsch=100 |
| `ress.m_iPtkAnfrageErfuellt` | 2 | beide bei rsFrei (initial + nach Pause-Ende) |
| `knoten.m_iPtkBegAusloesungCount` | 2 | initial + Resume |
| `knoten.m_iPtkProzRefuseCount` | 0 | Unterbrechung läuft NICHT über ress_verfuegbar |
| `knoten.m_iPtkProzessCount` | 1 | nur 1 PtProzZeitvorgabe erzeugt (gleiches Objekt bleibt) |
| `knoten.m_iPtkAusloesungCount` | 1 | 1× erfolgreich beendet |
| `knoten.m_dPtkDurchlaufzeit` | 5000.0 | aktive Bearbeitungszeit (1000 + 4000), **ohne** Pause |
| `a.m_iPtkBegAusloesungCount` | 1 | 1× dlpl_ausloesen |
| `a.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `a.m_dPtkDurchlaufzeit` | 8600.0 | Trigger→Ende inkl. Pause |
| `sim.evt_get_sum()` | 4 | EvtAuslTriggern + EvtBearbeitEnde@40000 (storniert!) + EvtPause×2 + EvtBearbeitEnde@43600 — m_sumEvent zählt nur erfolgreich gepoppte: 4 |

## EventBus-Reihenfolge (für `ress.*`+`proz.bearbeit.*`-Subscriber)

| Zeit | Topic |
|---|---|
| 35000 | `ress.belegen` |
| 35000 | `proz.bearbeit.start` |
| 36000 | `ress.einsatz.ende` |
| 36000 | `proz.bearbeit.unterbr` |
| 39600 | `ress.einsatz.beginn` |
| 39600 | `ress.belegen` |
| 39600 | `proz.bearbeit.start` |
| 43600 | `proz.bearbeit.ende` |
| 43600 | `ress.freigeben` |

## Wichtige Beobachtungen

1. **Status-Reihenfolge bei Pause-Beginn:** Zuerst `set_status(RS_PAUSE)` in
   `on_einsatz_ende`, DANN `proz.bearbeit_unterbrechen`. Damit greift der
   `if RS_BELEGT`-Branch in `ress_unterbrechen` NICHT, und der Status bleibt
   `RS_PAUSE` — exakt C++-Pfad (PRessBeleg.cpp:898 `SetStatus(rsPause)` vor
   `BearbeitUnterbrechen`).

2. **Restzeit-Berechnung:** `m_iZeitinhaltAkt -= curr - m_iBearbeitBeginn` in
   `PtProzZeitvorgabe.bearbeit_unterbrechen`. `m_iBearbeitBeginn` wird in
   `bearbeit_beginnen` jedes Mal (auch beim Resume) auf den aktuellen
   Zeitpunkt gesetzt — wichtig, weil ohne Reset das Delta nach Resume falsch
   wäre.

3. **Resume-Pfad:** `PtProzZeitvorgabe.bearbeit_beginnen` prüft `status !=
   PT_UNT` BEVOR es `m_iZeitinhaltAkt` neu setzt. Bei einem Resume bleibt der
   Restwert erhalten, weil status zu diesem Zeitpunkt noch PT_UNT ist
   (super() setzt PT_BEARB erst danach).

4. **DLZ-Akkumulation:** In `on_proz_unterbr` wird das laufende DLZ-Intervall
   abgeschlossen, in `bearbeit_beginnen` wird ein neuer Anchor gesetzt. So
   wird die Pause-Zeit NICHT zur Knoten-DLZ gezählt — analog C++
   `PtkIntervallEnd`/`PtkIntervallBegin`. Die Auslöser-DLZ (über
   `m_iAuslZeitpunkt → curr`) zählt dagegen die Pause mit.

5. **Re-Add zur Warteschlange:** `PtProzess.bearbeit_unterbrechen` ruft
   `m_oWarteSchl.add_tail(self)` (kein Aktor in V4-V7). Der Resume passiert
   über `proz_wart_ausloesen`, das beim nächsten `ress.belegen` indirekt
   nicht aufgerufen wird — sondern direkt nach `set_status(RS_FREI)` in
   `on_einsatz_beginn`.
