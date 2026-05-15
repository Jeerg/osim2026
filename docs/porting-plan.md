# Portierungs-Plan: OSim2004 (C++/MFC) → osim-engine (Python, headless)

**Stand:** 2026-05-15. Ersetzt den bisherigen Diss-basierten Spike.

## Leitlinie

> Den existierenden Code 1:1 nach Python portieren — headless, ohne UI.
> Nichts neu erfinden. Keine Theorie-Vorlage als Implementierung nehmen.

Die Dissertation (Jonsson 2003) ist nur **Begleitmaterial zum Verstehen**.
Die **Wahrheit ist der C++-Code** in `OSim2004/OSimV01(Fj)/`.

## Was übernommen wird (Quelle)

| C++-Modul | Beschreibung | Status für Python |
|---|---|---|
| `OSimBase/OSimObj` | Basisklasse aller Sim-Objekte, Listener-Mechanik | übernehmen |
| `OSimBase/OSimulator` | Event-Loop, Period-Vorschub, Ereignisliste | übernehmen |
| `OSimBase/OVerteilung` | Stochastik (Konstant/Gleich/Normal/NormalGrenz/Exp/LogNormal/ExpVersch) | übernehmen, 7 Subtypen |
| `OSimPro/PSimObj` | Sim-Objekt-Basis im PPS-Layer mit Zeit-Helpern, Tracing, SimInfo | übernehmen |
| `OSimPro/PSimulator` | Top-Level-Simulator mit allen Listen + Entscheider + PGenerator | übernehmen (PGenerator schrittweise) |
| `OSimPro/PDurchlaufplan` | Plan = spezialisierter PDlplKnoten, mit Designer + Knoten-/Kanten-Listen | übernehmen (ohne Designer-UI) |
| `OSimPro/PDlplKnoten` | Basis-Knoten + 4 Spezialisierungen (siehe unten) | übernehmen vollständig |
| `OSimPro/PDlplKante` | Kante mit Vorgänger/Nachfolger | übernehmen |
| `OSimPro/PDpKn*` | Knotentypen: Zeitvorgabe, Alternativ, AELogik, AlternativELogik, Ruecksprung, Extern | übernehmen |
| `OSimPro/PtProzess` | Transienter Prozess + 9 Subtypen | übernehmen |
| `OSimPro/PtTrigger` | Transienter Trigger | übernehmen |
| `OSimPro/PtVerknuepfung` | Join-Counter | übernehmen |
| `OSimPro/PtRelation` | Ressourcen-Relation (transient) | übernehmen |
| `OSimPro/PAusloeser` | Basis + Subtypen (Einzel, MehrfachZaz, ACOAnt, EPAslEntAufExtern) | übernehmen |
| `OSimPro/PRessource`, `PRessBeleg`, `PRessMenge`, `PRessKollektion` | Ressourcen-Familie | übernehmen |
| `OSimPro/PAssoziation`, `PAszRess*`, `PAszSpeich*` | Assoziations-Objekte | übernehmen |
| `OSimPro/PAktor`, `PSpeicherProz` | Aktoren + Prozessspeicher | übernehmen |
| `OSimPro/PEinsatzzeit` | Verfügbarkeitszeiten | übernehmen |
| `OSimPro/PEntitaet` | Prozess-Entität (passiv + extern) | übernehmen |
| `OSimPro/PKlasse`, `PKlasseZeit`, `PKlasseKosten` | Klassen-System für KPIs | übernehmen |
| `OSimPro/PParameter` | Parameter am Auslöser | übernehmen |
| `OSimPro/PVerteilung` | Bridge zu OVerteilung | übernehmen |
| `OSimPro/PEntscheider`, `EPStrategie`, `EPEntscheidung` | Entscheider-System | übernehmen, **eigene Phase** |
| `OSimAZeit/` | Auftragszeit-Modul (Arbeitszeit-orientierte Subklassen) | übernehmen, **eigene Phase** |
| `OSimINSIGHTS/` | Reporting-Module | später, eigener Layer |
| `OSimFemos/` | FEMOS-Anbindung | **nicht** übernehmen (legacy Vorgänger-System) |
| `OSimSam/`, `CSimOPC/`, `CSimOST/` | OPC + SAM | **nicht** übernehmen (Hardware-IO) |

## Was raus muss (UI, Reflektion, Persistenz)

| C++-Modul | Grund |
|---|---|
| `ObjectBase/` (alle 90+ Files) | Reflektion/MOP/Persistenz — durch Pydantic + JSON ersetzt |
| `OFC/` (alle Files) | UI-Framework — komplett raus |
| `odhc/`, `otool/`, `inc/` | Code-Generator + Tools | raus, nicht mehr nötig |
| `OSimBase/OGfx*` | UI-Rendering | raus |
| `OSimPro/PGfxMode`, `PGfxRowObj`, `PGObjViewerInfo` | UI-Animation | raus |
| Alle `*::Register()`-Implementierungen | Viewer-Registrierung beim Meta-System | raus |
| Alle `*DesignView`, `*DesignItem`, `*GObj` | UI-Design-Items | raus |
| Alle `OMetaViewer*`-Klassen | Views | raus |
| Alle `OMetaGfx*`-Klassen | Grafik-Item-Meta | raus |
| `PListener*`-Klassen mit UI-Anbindung | Listener im neuen Code nur als Subscriber-API |

## Klassen-Inventar (Phase 1 — Sim-Kern ohne Ressourcen)

### Aus `OSimBase/`

```
OSimObj                  → osim_engine.core.SimObject
  - OnSimBegin, OnSimReset, OnPeriodBegin, OnPeriodEnd, OnPeriodBreak
  - OnRecInit, OnRecStart, OnRecStop
  - EvtInsert, EvtCurrTime, EvtDoNext
  - GetOSimulator, oprThis

OSimulator               → osim_engine.core.Simulator
  Attribute:
    m_periodNum, m_periodBegin, m_periodLen=86400
    m_keim=1776496601, m_aktKeim
    m_ptkBegin, m_ptkEnd, m_isPtk
    m_simStatus  (ssBegin/ssPeriod/ssRunning/ssSuspended)
    m_evtPool                          → heapq + dataclass Entry
    m_listSimHead                      → list[Listener]
  Methoden:
    Start(), Suspend(), Reset()
    EvtInsert(event, obj, ezeit[, para])
    EvtDelete(hdl), EvtCurrTime, EvtDoNext, EvtDeleteCurr
    DoKonsitenzCheck, OSimEreig, OSimValidate
    PeriodNum, PeriodBegin, PeriodEnd
    DateStr2CTime / Date2Simtime / Simtime2Date  (für 2003er Datum-Strings)

OVerteilung              → osim_engine.distribution.Distribution (abstract)
  m_wertBasis : float
  HoleZufallswert() -> float
  
Subtypen (jeweils HoleZufallswert überschrieben):
  OVerteilungKonstant         (gibt m_wertBasis zurück)
  OVerteilungGleich           (gleichverteilt [0, m_wertBasis])
  OVerteilungNormal           (mit m_stdAbweich)
  OVerteilungNormalGrenz      (mit m_minGrenze, m_maxGrenze)
  OVerteilungExponential
  OVerteilungLogNormal        (mit m_stdAbweich)
  OVerteilungExponentialVersch (mit m_rechtsVersch)
```

### Aus `OSimPro/`

```
PSimObj                  → osim_engine.pps.PSimObject (extends SimObject)
  Helpers für Zeit (Stunde2SZeit, Tag2SZeit, etc.)
  Tracing (SimTrace, SimFileTrace, SimViewTrace)
  SimInfo-Liste für temp. Sim-Daten

PSimulator               → osim_engine.pps.PSimulator (extends Simulator)
  Listen:
    m_lAusl         : list[PAusloeser]
    m_lDlpl         : list[PDurchlaufplan]
    m_lRessBeleg    : list[PRessBeleg]
    m_lRessMenge    : list[PRessMenge]
    m_lSpeichProz   : list[PSpeicherProz]
    m_lEinsatz      : list[PEinsatzzeit]
    m_lExtVert      : list[PVertExtern]
    m_lKlassen      : list[PKlasse]
    m_lZelSystem    : list[EPZelSystem]
    m_lEntInfo      : list[EPEntInformationssystem]
    m_lEntStrategie : list[EPEntStrategie]
    m_lEntFeld      : list[EPEntFeld]
  Spezial:
    m_oWarteSchl    : PProzessDLL   (zentrale DLL aller Prozesse im System)
    m_oGenerator    : PGenerator    (Modell-Manipulation, später)
  Konfig:
    m_bIsEntAktiv         (Entscheider an/aus)
    m_bPtkWartschl, m_bPtkBelegungList, m_bPtkAnfragenList,
    m_bTmpConKnotenList, m_bTmpUmlFaktorList
    m_iProduktionBezugsPeriode=86400, m_iProduktionEnde=-1
  Events:
    ProduktionEnde, EvtProduktionEnde
  Hooks:
    OnSimBegin, OnSimReset, OnRecInit

PDlplKnoten              → osim_engine.pps.DlplKnoten
  Felder:
    m_lProzesse        : PProzessList
    m_sName, m_lKanteEin, m_lKanteAus, m_lKnotenOber
    m_lAssozRess       : PAssozRessourceLList (geht in Phase 2)
    m_lAssozSpeich     : PAssozSpeicher       (geht in Phase 3)
    m_iPtkAusloesungCount, m_iPtkBegAusloesungCount,
    m_iPtkProzessCount, m_iPtkProzRefuseCount
    m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit
    m_dEinKostenVorgaenger, m_dEinMinKostenVorgaenger
  Sim-Methoden (virtual, polymorph):
    ProzWeitergeben(oProzOber, oEnt)
    BearbeitBeginnen(oProzThis) -> BOOL
    OnProzBeendet(oProzThis, oEnt)
    OnProzUnterbr(oProzThis, oEnt)
    OnProzSubBeendet(oProzThis, oEnt)
  KPI-Methoden (virtual, polymorph):
    GetKnzAnzAusloesungen, GetKnzAnzBegAusloesungen,
    GetKnzMittlDlfz, GetKnzMinDlfz(oZKlass),
    GetKnzZegDlfz, GetKnzSumZeit,
    PrzKostenBerechnen, GetKnzPeriodenkosten,
    GetKnzPrzKosten, MinPrzKostenBerechnen,
    GetKnzMinPeriodenkosten, GetKnzMinPrzKosten,
    GetKnzArbeitsinhalt, GetKnzAuslastung, GetKnzFlexibilitaet
  Zustands-Methoden:
    GetZstAnzWartProz, GetZstArbInWartProz
  Prognose-Methoden:
    GetPrgProzesse, GetPrgArbInhalt,
    GetPrgEglProzesse, GetPrgEglArbInhalt,
    GetPrgWartezeit, GetPrgKapAngebot
  Listener-Mechanik:
    PListenerDlplKnoten (Attach/Detach, SendProzBearbeitBeginn/Ende/Unterbr)
  Notifikation:
    OnProzBearbeitBeginn, OnProzBearbeitEnde, OnProzBearbeitUnterbr

PDlplKnoten-Subtypen:
  PDpKnZeitvorgabe   - Knoten mit Zeitvorgabe (Verteilung)
  PDpKnAlternativ    - Alternativknoten (Logik wählt Alternative)
  PDpKnAELogik       - Alternativ-Entscheider-Logik
  PDpKnAlternativELogik - kombiniert
  PDpKnRuecksprung   - Rücksprungknoten
  PDpKnExtern        - extern gesteuert

PDurchlaufplan (extends PDlplKnoten)
  Felder:
    m_lKnoten          : PDlplKnotenLList
    m_lKanten          : PDlplKanteLList
    m_lStartKante      : PDlplKante
    m_lEndKante        : PDlplKante
    m_BeginnList       : list[PDlpl_PtkAktDlz]  (intern, Protokoll)
    m_EndList          : list[PDlpl_PtkAktDlz]
  Sim-Methoden:
    DlplAusloesen(oTrigger, oProzOber, oEnt)
    OnDlplBeendet(oProzThis, oEnt)
  KPI-Methoden:
    GetKnzMinDlfz(oZKlass) -> CalcKritWegRek (kritischer Weg, rekursiv!)
    GetKnzMinDlfzAbKante(oKante)
    PrzKostenBerechnen(dEinKosten) -> CalcProzKostenRek
    MinPrzKostenBerechnen / CalcMinProzKostenRek
  Validierung:
    ValidateDlp(pDump, iIndent)
    ValidateDlpRek(...)
  Lifecycle:
    OnSimBegin: BeginnList + EndList leeren
    OnRecStop: PrzKostenBerechnen(0.0), MinPrzKostenBerechnen(0.0)

PDlplKante               → osim_engine.pps.DlplKante
  m_lVorgaenger : PDlplKnotenLList
  m_lNachfolger : PDlplKnotenLList
  m_lVerknpfng  : ? (Verknüpfungs-Ref?)
  m_lProzesse   : PProzessList
  m_lKnotenOber : Knoten
  m_iPtkUebergangCount
  m_iUebergangszeit (bei PDlplKanUebergang)

PtProzess                → osim_engine.pps.PtProzess
  Felder:
    m_oNext, m_oPrev    (DLL-Pointer)
    m_eStatus           (ptBearb/ptEnde/ptWart/ptUnt)
    m_posKnoten         (Position in Knoten-Liste)
    m_sName             (Debug-Name)
    m_oAktor, m_oKnoten, m_oTrigger
    m_oProzOber, m_oEntitaet
    m_iPrioritaet, m_iErzeugungzeitpunkt
    m_oRelationen : PRelationList
  Sim-Methoden:
    RessVerfuegbar, RessAnwesend
    BearbeitBeginnen, BearbeitBeenden, BearbeitUnterbrechen
    OnBearbeitAbgelehnt
    OnUnterProzBeginn, OnUnterProzEnde
  DLL-Verwaltung:
    GetNext, GetPrev, Remove, InsertBefore, InsertAfter
  Verknüpfungs-Verwaltung:
    FindVerknpf, RemoveVerknpf, AddVerknpf
  Zustands-Kennzahlen:
    GetZstArbeitsinhaltAkt/Abge/, GetZstArbeitsinhalt,
    GetZstPrioritaet, GetZstWartezeit, GetKnzEinlastzeitpunkt

PtProzess-Subtypen:
  PtProzZeitvorgabe       - mit Zeitinhalt + EvtBearbeitEnde
  PtProzDurchlaufplan     - für ganzen Plan, mit Verknüpfungs-Liste
  PtProzRuesten           - mit Rüstphase
  PtProzExtern            - extern gesteuert
  PtProzRuecksprung       - mit Wiederholungs-Counter
  PtProzAlternativ        - mit Alternative-Ref
  PtProzEntAufgabeBase    - Entscheidungs-Aufgabe-Basis
  PtProzEntAufgabeIntern  - Entscheidungs-Aufgabe mit Sub-Plan
  PtProzACOSplit          - ACO-Split-Prozess (Ant Colony Optimization)

PProzessList             → list[PtProzess]
PProzessDLL              → osim_engine.pps.ProzessDLL (mit Anker)

PAusloeser               → osim_engine.pps.PAusloeser (abstract)
  Felder:
    m_lTrigger : PTriggerList (existierende Trigger)
    m_sName, m_lDlpl (Plan-Ref)
    m_lParameter : PParameterLList
    m_lEntitaet  : PEntitaet
    m_iMaxWarteZeit, m_iSollDauer
    m_iPtkBegAusloesungCount, m_iPtkAusloesungCount,
    m_iPtkNichtVerspaetetCount, m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit
    m_iPtkAnzBearbRessBeleg, m_iTrigCounter, m_iAbgeCounter
  Sim-Methoden:
    DlplAusloesen(oTrigger)
    OnDlplBeendet(oTrigger, oProzDlpl)
  KPI:
    GetKnzAnzAusloesung, GetKnzAnzAusloesungZeitInt,
    GetKnzMittlDlfz, GetKnzMittlAnzBearbRessBeleg,
    GetKnzZegLiefertermintreue, GetKnzPlanzeitgrad,
    GetKnzGuetegrad, GetKnzPrioritaet, GetKnzTerminabweichung
  Prognose:
    GetKnzPrgAuftragsanzahl, GetPrgKapazitaetsbedarf,
    GetPrgEinlastzeitpunkt, GetPrgDurchlaufzeit
  Zustand:
    GetZstFertigungsfortschritt, GetZstZeitDesAuftragsImSystem,
    GetZstVblDurchfuehrungszeit

PAusloeser-Subtypen:
  PAslEinzel              - m_iBeginTermin + m_iPlanZeit + m_iRealeAuftragsdauer
                            EvtAuslTriggern
  PAslMehrfachZaz         - m_lZazVerteil (Verteilung der ZAZ)
  ACOAnt                  - mit ACO-Logik (m_lACODlpl), OnACOWegWhl*
  EPAslEntAufExtern       - mit m_bTaeglichWiederholen

PtTrigger                → osim_engine.pps.PtTrigger (transient)
```

## Modul-Struktur in `osim-engine/src/osim_engine/`

```
osim_engine/
├── __init__.py                  Public API
│
├── core/                        OSimBase
│   ├── __init__.py
│   ├── sim_object.py            OSimObj (Listener-Mechanik, On*-Hooks)
│   ├── simulator.py             OSimulator (Event-Pool, Period-Mechanik)
│   ├── event.py                 OMetaEvent (Event-Descriptor) + heap entry
│   ├── distribution.py          OVerteilung + 7 Subtypen
│   └── listener.py              Generischer Listener-Base
│
├── pps/                         OSimPro
│   ├── __init__.py
│   ├── sim_object.py            PSimObj (Zeit-Helper, Tracing)
│   ├── simulator.py             PSimulator
│   ├── prozess_dll.py           PProzessDLL (doppelt verkettete Liste)
│   ├── knoten/
│   │   ├── __init__.py
│   │   ├── base.py              PDlplKnoten + PListenerDlplKnoten
│   │   ├── zeitvorgabe.py       PDpKnZeitvorgabe
│   │   ├── alternativ.py        PDpKnAlternativ, PDpKnAELogik, PDpKnAlternativELogik
│   │   ├── ruecksprung.py       PDpKnRuecksprung
│   │   └── extern.py            PDpKnExtern
│   ├── durchlaufplan.py         PDurchlaufplan (Spezialisierung von PDlplKnoten)
│   ├── kante/
│   │   ├── __init__.py
│   │   ├── base.py              PDlplKante
│   │   └── uebergang.py         PDlplKanUebergang
│   ├── prozess/
│   │   ├── __init__.py
│   │   ├── base.py              PtProzess + DLL-Mechanik
│   │   ├── zeitvorgabe.py       PtProzZeitvorgabe
│   │   ├── durchlaufplan.py     PtProzDurchlaufplan
│   │   ├── ruesten.py           PtProzRuesten
│   │   ├── extern.py            PtProzExtern
│   │   ├── ruecksprung.py       PtProzRuecksprung
│   │   ├── alternativ.py        PtProzAlternativ
│   │   └── ent_aufgabe.py       PtProzEntAufgabeBase/Intern
│   ├── verknuepfung.py          PtVerknuepfung (Join-Counter)
│   ├── relation.py              PtRelation
│   ├── ausloeser/
│   │   ├── __init__.py
│   │   ├── base.py              PAusloeser
│   │   ├── einzel.py            PAslEinzel
│   │   ├── mehrfach_zaz.py      PAslMehrfachZaz
│   │   ├── aco.py               ACOAnt (Ant Colony — eigene Phase!)
│   │   └── ent_extern.py        EPAslEntAufExtern
│   ├── trigger.py               PtTrigger
│   ├── parameter.py             PParameter + Subtypen
│   ├── entitaet.py              PEntitaet + PEntExtern
│   └── klasse.py                PKlasse, PKlasseZeit, PKlasseKosten
│
├── resources/                   OSimPro/PRess* (Phase 2)
│   ├── ressource.py             PRessource
│   ├── belegung.py              PRessBeleg
│   ├── menge.py                 PRessMenge
│   ├── kollektion.py            PRessKollektion
│   ├── einsatzzeit.py           PEinsatzzeit
│   ├── assoziation/
│   │   ├── base.py              PAssoziation, PAszRessource, PAszSpeicher
│   │   ├── belegung.py          PAszBeleg (+ Subtypen)
│   │   ├── menge.py             PAszMenge (+ Subtypen)
│   │   └── tupel.py             PAszBtmPer (Betriebsmittel/Person)
│   ├── aktor.py                 PAktor
│   └── speicher_proz.py         PSpeicherProz
│
├── decisions/                   OSimPro/EP*, PEntscheider (Phase 3)
│   ├── entscheider.py           PEntscheider
│   ├── strategie.py             EPStrategie + Subtypen
│   ├── entscheidung.py          EPEntscheidung
│   ├── feld.py                  EPEntFeld
│   ├── info_system.py           EPEntInformationssystem
│   └── ziel_system.py           EPZelSystem
│
├── distributions/               OSimPro/PVerteilung (Phase 1)
│   └── pps_verteilung.py        PVerteilung, PVertExtern
│
├── kpi/                         Kennzahlen
│   ├── time.py                  MittlDlfz, MinDlfz, ZegDlfz, SumZeit
│   ├── cost.py                  Periodenkosten, PrzKosten, MinPrzKosten
│   ├── resource.py              Belegung-KPIs (Phase 2)
│   ├── auslastung.py            GetKnzAuslastung, GetKnzFlexibilitaet
│   ├── prognose.py              GetPrgProzesse, GetPrgArbInhalt, etc.
│   └── zustand.py               GetZstAnzWartProz, etc.
│
├── azeit/                       OSimAZeit (Phase 4 — Auftragszeit-Modul)
│   ├── ausloeser.py             AAusloeser
│   ├── simulator.py             ASimulator (oben in test.otx gesehen!)
│   ├── person.py                APerson
│   ├── gruppe.py                AGruppe
│   ├── einsatzzeit_wunsch.py    AEinsatzzeitWunsch
│   └── kap_bed_viewer_info.py   AKapBedViewerInfo
│
├── generator/                   OSimPro/PGenerator (Phase 5 — Modell-Manipulation)
│   ├── generator.py             PGenerator (Multi-Lauf-Engine)
│   ├── psg_reader.py            .psg-File-Parser
│   ├── engpass.py               Engpass-Erkennung
│   └── azmodel.py               Tmp-Arbeitszeit-Modell
│
└── io/
    ├── __init__.py
    ├── json_loader.py           JSON → Pydantic-Modell
    ├── otx_reader.py            .otx-Parser (vom bisherigen Spike behalten)
    └── otx_mapper.py            .otx → SimModel (anpassen an neues Modell)
```

## Migrations-Reihenfolge — 5 Phasen

### Phase 1: OSimBase + minimaler OSimPro (Sim-Kern)

Ziel: Eine vollständige Phase-1-Engine, die strukturell mit OSim2004 *identisch* arbeitet.

- `OSimObj`, `OSimulator` mit kompletter Event-Pool-Mechanik, Period-Vorschub, Listener-Hooks
- `OVerteilung` + 7 Subtypen (echte Implementierungen aus `OVerteilung.cpp` / `OFC/OVerteil.cpp`)
- `PSimObj`, `PSimulator` (mit allen 12 Listen, ohne PGenerator-Befüllung)
- `PDlplKnoten` + `PDurchlaufplan` + `PDlplKante` + `PDlplKanUebergang`
- `PtProzess` + `PtProzZeitvorgabe` + `PtProzDurchlaufplan` + `PProzessDLL`
- `PtTrigger`, `PtVerknuepfung`
- `PAusloeser` + `PAslEinzel` + `PAslMehrfachZaz`
- `PVerteilung` (Bridge zu OVerteilung)
- `PKlasse` (minimal, ohne Strategien)
- Test gegen `test.otx` und `dc1.otx`

### Phase 2: Ressourcen (passive)

- `PRessource`, `PRessBeleg`, `PRessMenge`, `PRessKollektion`
- `PAssoziation`, `PAszRessource`, `PAszBeleg`, `PAszMenge` + Subtypen
- `PEinsatzzeit`
- `PtRelation`
- Erweiterung `PDlplKnoten`: `m_lAssozRess`-Behandlung
- Erweiterung `PSimulator`: Listen-Pflege für Ressourcen, Einsatzzeit-Trigger
- KPIs: Auslastung, Kapazität, Belegung
- Test gegen größere `.otx` mit Ressourcen (Fertigungsstruktur, AZ-Tool)

### Phase 3: Aktoren + Prozessspeicher

- `PAktor` (Mehrfachvererbung in C++ → in Python: `PRessBeleg` + Mixin oder Strategy-Pattern)
- `PSpeicherProz`, `PAszSpeicher`
- Erweiterung `PtProzess`: m_oAktor-Anbindung
- Erweiterung `PDlplKnoten`: m_lAssozSpeich-Behandlung

### Phase 4: Entitäten + Erweiterte Knoten

- `PEntitaet`, `PEntExtern`
- `PtProzExtern`, `PDpKnExtern`, `PDlplKanExtern` (in OSimPro)
- `PDpKnRuecksprung` + `PtProzRuecksprung`
- `PDpKnAlternativ` + `PtProzAlternativ`
- `PParameter` + Subtypen (PPrmFloat, PPrmInt, PPrmString, PPrmMenge, PPrmPrioritaet, PPrmIdn)
- `PDpKnMenge`, `PDpKnMengeRuesten` (für mengenabhängige Durchführungszeit + Rüstzeit)
- `PtProzRuesten`

### Phase 5: Entscheider + Generator

- `EPStrategie`, `EPEntscheidung`, `EPEntFeld`, `EPZelSystem`, `EPEntInformationssystem`
- `PEntscheider` (alle Entscheidungs-Logiken)
- `PDpKnAELogik`, `PDpKnAlternativELogik`
- `PtProzEntAufgabeBase`, `PtProzEntAufgabeIntern`
- `PtProzACOSplit`, `ACOAnt`
- `PGenerator` (Multi-Lauf-Modell-Manipulation, `.psg`-Files, Engpass-Erkennung)
- `OSimAZeit` (`ASimulator`, `APerson`, `AGruppe`, `AAusloeser`, `AEinsatzzeitWunsch`)
- `OSimINSIGHTS` (Reporting-Klassen)

## Was passiert mit dem bisherigen Spike?

| Datei | Aktion |
|---|---|
| `src/osim_engine/__init__.py` | überarbeiten — neue API |
| `src/osim_engine/model/*` (Pydantic) | **löschen** — falsche Diss-Abstraktion |
| `src/osim_engine/engine/event_heap.py` | behalten, in `core/event.py` umziehen |
| `src/osim_engine/engine/recorder.py` | behalten, generisch genug |
| `src/osim_engine/engine/transient.py` | **löschen** — falsche Struktur |
| `src/osim_engine/engine/runner.py` | **löschen** — wird durch echtes `OSimulator` ersetzt |
| `src/osim_engine/kpi/core.py` | überarbeiten — echte Formeln aus `.cpp` einsetzen |
| `src/osim_engine/io/json_loader.py` | behalten |
| `src/osim_engine/io/otx_reader.py` | **behalten** — funktioniert |
| `src/osim_engine/io/otx_mapper.py` | überarbeiten — auf neues Modell mappen |
| `examples/jonsson_4node.json` | behalten als Diss-Referenz-Beispiel |
| `tests/*` | überarbeiten — Tests gegen das *echte* OSim-Verhalten |
| `docs/concept-mapping.md` | **löschen** — durch diesen Plan ersetzt |

## Datenmodell-Strategie

Hier ist eine wichtige Designentscheidung zu treffen. Optionen:

**Option A: Pydantic für alles** (wie im ersten Spike)
- Pro: JSON-Serialisierung umsonst
- Contra: Pydantic erzwingt Discriminated Unions per `type`-Feld — kann mit OSim-Klassenhierarchie kollidieren (Mehrfachvererbung bei PAktor)
- Contra: virtuelle Methoden + Polymorphismus mit Pydantic etwas umständlich

**Option B: Plain Python-Klassen, Pydantic nur am IO-Rand** *(meine Empfehlung)*
- Pro: 1:1-Übertragung der C++-Klassenhierarchie via normale Vererbung
- Pro: virtuelle Methoden + polymorphe Aufrufe natürlich
- Pro: Mehrfachvererbung problemlos (PRessBeleg + PAktor)
- Pro: Listener-Pattern + Notifikation natürlich
- IO: Pydantic-Modelle (`schemas/`) als reine Datenklassen für JSON-Load/Dump,
       die in die echten Engine-Objekte umgewandelt werden

**Option C: Hybrid — Pydantic dataclasses (`@dataclass(config=...)`)**
- ? — könnte ein guter Mittelweg sein, aber unklar bei Polymorphismus

**Empfehlung:** **Option B**. Plain Python-Klassen mit Vererbung wie in C++,
Pydantic-Schemas nur am IO-Rand. Das gibt 1:1-Portierung statt Daten-Modell-Verbiegung.

## Konkreter erster Schritt (nach Plan-Bestätigung)

1. Bisherigen Spike-Code, der nicht behaltbar ist, löschen
2. Neue Modulstruktur anlegen (`core/`, `pps/`, ...)
3. `OSimObj` + `OSimulator` 1:1 aus `OSimulator.cpp` + `OSimObj.cpp` portieren
4. `OVerteilung` aus `OVerteilung.cpp` + `OFC/OVerteil.cpp` (Implementierungs-Datei!)
5. `PSimObj` + `PSimulator` (minimal, ohne PGenerator-Inhalt)
6. `PDlplKnoten` + `PDurchlaufplan` + `PDlplKante`
7. `PtProzess` + `PtProzZeitvorgabe` + `PtProzDurchlaufplan` + `PProzessDLL`
8. `PtTrigger`, `PtVerknuepfung`
9. `PAusloeser` + `PAslEinzel`
10. Tests gegen `test.otx` (1-Knoten) + `dc1.otx` (3 Pläne mit Verzweigung)

## Offene Fragen für Sie

1. **Datenmodell-Strategie:** Option B (Plain Python + Pydantic am IO-Rand) okay?
2. **Bisheriger Spike-Code:** Löschen okay, oder lieber in einem `legacy-spike/`-Branch parken?
3. **`OFC/OVerteil.cpp`:** das ist eigentlich UI-Modul — aber `OVerteilung.cpp` ist eher Schnittstelle, die echte Implementierung der Zufallszahlen liegt vermutlich in `OFC/OVerteil.cpp`. Soll ich das parallel zum Sim-Kern lesen?
4. **Reihenfolge OSimAZeit:** früher oder später? `test.otx` zeigt `ASimulator` als Top-Level — heißt das, das echte File hat schon OSimAZeit-Klassen? Wenn ja, müssen wir das wahrscheinlich früher haben.
5. **`PGenerator`:** soll der in der ersten Iteration nur als Stub existieren oder ganz weggelassen werden?
