# V6.5 Hand-Trace: PEinsatzzeitTag — Doppel-Schicht-Tag mit Proz-Resume

Zweck: papier-genauer Trace für
`test_v6_5_einsatzzeit_tag.py::test_v6_5_proz_unterbrochen_bei_mittagspause_resume_nachmittag`.

Demonstriert die V6.5-Kombi: PEinsatzzeitTag mit 2 Schichten (8-12 und
13-17), 1 Knoten dauer=10000s, Auslöser bei 42000s (11.67h, inmitten der
Vormittagsschicht). Der lfd. Prozess wird durch die Mittagspause
unterbrochen und nach der Pause mit Restzeit fortgesetzt.

## Setup

```python
sim = PSimulator()

ress = PBetriebsmittel(sim); ress.m_sName = "M"
sim.register_ressource(ress)

ez = PEinsatzzeitTag(sim); ez.m_sName = "EZ-Tag"
ez.m_lTagesEinsatzzeit.append(PTagesEinsatzzeit(8.0, 12.0))   # Vormittag
ez.m_lTagesEinsatzzeit.append(PTagesEinsatzzeit(13.0, 17.0))  # Nachmittag
sim.register_einsatzzeit(ez)
ez.attach_tag_ress(tag=0, beleg=ress)

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 10_000
sim.register_knoten(knoten)
assoz = PAssozBeleg(sim); assoz.m_lRessourcen.append(ress)
knoten.add_assoziation(assoz)

ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 42_000
ausl.m_lDlpl = knoten; sim.register_ausloeser(ausl)

sim.start()
```

Zeit-Konvention: Sim-Sekunden. Stunden-zu-Sekunden: int(h * 3600).
- 8h = 28800
- 12h = 43200
- 13h = 46800
- 17h = 61200

## Event-Trace

| Zeit | Event | Wirkung | M.rsStatus | proz.zeitinhalt |
|---|---|---|---|---|
| **0** | (Sim-Begin) | EZ.on_period_begin → insert_events: PEM_INIT@0, PEM_BEGIN@28800, PEM_END@43200 (Vormittag-Ende, NICHT max), PEM_BEGIN@46800, PEM_END_FOR_DAY@61200 (Nachmittag-Ende = max). Auslöser plant EvtAuslTriggern@42000. | RS_FREI | — |
| 0 | PEM_INIT (EZ) | ez.on_pause_event(PEM_INIT): m_isEinsatz=False. tagress[Tag=0].is_einsatz_tag(0) → True → M.on_einsatz_ende(EET_INIT): m_TryedPause=True, EventBus `ress.einsatz.ende`, set_status(RS_PAUSE), kein lfd. Proz. | RS_PAUSE | — |
| 28800 | PEM_BEGIN (EZ, Vormittag) | ez.on_pause_event(PEM_BEGIN): m_isEinsatz=False → wird True. tagress.is_einsatz_tag(28800) → True → M.on_einsatz_beginn(EET_STD): m_TryedPause=False, set_status(RS_FREI), m_oProzCurrent=None (war es schon), proz_wart_ausloesen (Warteschl leer). | RS_FREI | — |
| 42000 | EvtAuslTriggern (A) | proz_K1: K.bearbeit_beginnen: BegCount++=1, ress_verfuegbar → M frei → True, PtRelationBeleg. proz_K1.bearbeit_beginnen: zeitinhalt=10000, m_iBearbeitBeginn=42000. super → PT_BEARB, relations.on_proz_beginn → M.ress_belegen: rsBelegt, `ress.belegen`. EvtBearbeitEnde@52000 (=42000+10000). | RS_BELEGT | 10000 |
| 43200 | PEM_END (EZ, Vormittag-Ende) | ez.on_pause_event(PEM_END): m_isEinsatz=True → wird False. tagress.is_einsatz_tag(43200) → True → M.on_einsatz_ende(EET_STD): m_TryedPause=True, set_status(RS_PAUSE), m_oProzCurrent=proz_K1 → proz_K1.bearbeit_unterbrechen: status=PT_UNT, cancel EvtBearbeitEnde@52000, zeitinhalt -= 43200-42000 = 1200 → **8800**. EventBus `proz.bearbeit.unterbr`. knoten.on_proz_unterbr: DLZ += 1200 (Intervall 1). super → relations.on_proz_unterbr → assoz.on_proz_unterbr → M.ress_unterbrechen: status==RS_PAUSE (nicht BELEGT) → skip, m_oProzCurrent=None. add_tail proz_K1 in m_oWarteSchl. | RS_PAUSE | 8800 |
| 46800 | PEM_BEGIN (EZ, Nachmittag) | ez.on_pause_event(PEM_BEGIN): m_isEinsatz=False → True. M.on_einsatz_beginn(EET_STD): set_status(RS_FREI), m_oProzCurrent=None, **proz_wart_ausloesen**: snapshot=[proz_K1] → K.bearbeit_beginnen(proz_K1): BegCount++=2, ress_verfuegbar → M frei → True, neue PtRelationBeleg. proz_K1.bearbeit_beginnen: status==PT_UNT → KEEP zeitinhalt=8800, m_iBearbeitBeginn=46800. super → PT_BEARB, relations.on_proz_beginn → M.ress_belegen, `ress.belegen`. EvtBearbeitEnde@55600 (=46800+8800). | RS_BELEGT | 8800 |
| 55600 | EvtBearbeitEnde (proz_K1) | proz_K1.bearbeit_beenden: PT_ENDE, `proz.bearbeit.ende`, K.on_proz_beendet: AusloesungCount++=1, DLZ += 8800 (Intervall 2, **gesamt 10000**), kein KanteAus → A.on_dlpl_beendet (Counter, Dauer=55600-42000=13600). super → M.ress_freigeben: rsFrei, `ress.freigeben`, proz_wart_ausloesen (Warteschl leer). | RS_FREI | 0 |
| 61200 | PEM_END_FOR_DAY (EZ, Nachmittag-Ende) | ez.on_pause_event(PEM_END_FOR_DAY): m_isEinsatz=True → False. M.on_einsatz_ende(EET_END_FOR_DAY): m_TryedPause=True, set_status(RS_PAUSE), m_oProzCurrent=None. | RS_PAUSE | — |
| 86400 | (Periode-Ende) | m_periodNum=1, m_periodBegin=86400. | RS_PAUSE | — |

## Erwartete Werte

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `sim.m_oWarteSchl.is_empty()` | True | proz_K1 nach Resume entfernt |
| `ress.m_rsStatus` | RS_PAUSE | nach END_FOR_DAY-Event |
| `knoten.m_iPtkBegAusloesungCount` | 2 | initial + Resume |
| `knoten.m_iPtkProzRefuseCount` | 0 | Pause läuft NICHT über ress_verfuegbar |
| `knoten.m_iPtkProzessCount` | 1 | 1× PtProzZeitvorgabe erzeugt |
| `knoten.m_iPtkAusloesungCount` | 1 | 1× fertig |
| `knoten.m_dPtkDurchlaufzeit` | 10000.0 | aktive Bearbeitungszeit (1200+8800), **ohne** Mittagspause |
| `a.m_iPtkAusloesungCount` | 1 | 1× abgeschlossen |
| `a.m_dPtkDurchlaufzeit` | 13600 | Trigger→Ende inkl. Mittagspause (1200+3600+8800) |

## EventBus-Reihenfolge (für `ress.*` + `proz.bearbeit.*`)

| Zeit | Topic |
|---|---|
| 0 | `ress.einsatz.ende` (INIT) |
| 28800 | `ress.einsatz.beginn` (Vormittag-Start) |
| 42000 | `ress.belegen` |
| 42000 | `proz.bearbeit.start` |
| 43200 | `ress.einsatz.ende` (Vormittag-Ende = Pause-Beginn) |
| 43200 | `proz.bearbeit.unterbr` |
| 46800 | `ress.einsatz.beginn` (Nachmittag-Start = Pause-Ende) |
| 46800 | `ress.belegen` |
| 46800 | `proz.bearbeit.start` |
| 55600 | `proz.bearbeit.ende` |
| 55600 | `ress.freigeben` |
| 61200 | `ress.einsatz.ende` (END_FOR_DAY) |

## Wichtige Beobachtungen

1. **Asymmetrie BEGIN/END zwischen Pause und Tag**: Bei `PEinsatzzeitPause`
   bedeutet `PEM_BEGIN` "Pause beginnt → Einsatz endet" → ruft
   `on_einsatz_ende`. Bei `PEinsatzzeitTag` ist es umgekehrt: `PEM_BEGIN`
   bedeutet "Einsatz/Schicht beginnt" → ruft `on_einsatz_beginn`. Das ist
   1:1 zu C++ (siehe `PEinsatzzeitTag.cpp:630-692`) und Folge der
   semantischen Umkehrung.

2. **PEM_INIT-Sicherheitspolster**: Am Tagesbeginn setzt `PEM_INIT` die
   Ressource explizit auf Pause. Damit ist klar, dass die Ressource VOR
   dem Schicht-Beginn nicht verfügbar ist — wichtig wenn der Sim-Start
   irgendwo vor der ersten Schicht liegt.

3. **PEM_END_FOR_DAY vs PEM_END**: Beide setzen die Ressource auf
   Pause (in V6.5 ohne Entscheider). Funktional gleich, semantisch
   unterscheidbar — der Aufruf liefert `EET_END_FOR_DAY` vs `EET_STD`.
   Künftige Slices (Phase 5 mit Entscheider) können hier
   differenzieren (z. B. `rsvRestBearbProdEnd`-Strategie).

4. **Resume mit Restzeit-Akkumulation**: Identisch zu V6
   (`bearbeit_unterbrechen` aktualisiert `m_iZeitinhaltAkt -= delta`,
   `bearbeit_beginnen` mit `status==PT_UNT` behält den Restwert). DLZ-
   Akkumulation in zwei Intervallen (1200 + 8800 = 10000), Pausen-Zeit
   zählt nur in die Auslöser-DLZ.

5. **IsPTagesEinsatzzeitEndMax**: bestimmt welche Schicht das
   `PEM_END_FOR_DAY` bekommt. Bei `(8-12)` + `(13-17)` → Nachmittag
   (m_iEinsatzEnde=17) ist Max. Eine `(15-20)` + `(8-12)`-Anordnung
   würde die erste Schicht (Anfang 15, Ende 20) als Max markieren —
   `IsPTagesEinsatzzeitEndMax` schaut nur auf Ende-Werte.
