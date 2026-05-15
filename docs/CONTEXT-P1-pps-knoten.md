# CONTEXT-P1-pps-knoten

**Phase 1, Modul B2 — PSimObj + PSimulator + PDlplKnoten + PDurchlaufplan + PDlplKante**

Kontrakt für die PPS-Schicht: alles um den Plan-Graphen herum. Aufbauend auf
`OSimObj`/`OSimulator` aus [B1](CONTEXT-P1-osimbase.md).

| Klasse | Header (.odh) | Implementation (.cpp) |
|---|---|---|
| `PSimObj` | `OSimPro/PSimObj.odh` | `OSimPro/PSimObj.cpp` |
| `PSimulator` | `OSimPro/PSimulator.odh` | `OSimPro/PSimulator.cpp` |
| `PDlplKnoten` | `OSimPro/PDlplKnoten.odh` | `OSimPro/PDlplKnoten.cpp` |
| `PDurchlaufplan` | `OSimPro/PDurchlaufplan.odh` | `OSimPro/PDurchlaufplan.cpp` |
| `PDlplKante` (+ Subtypen) | `OSimPro/PDlplKante.odh` | `OSimPro/PDlplKante.cpp` |

Aus dem Plan: nicht-inline-`.cpp`-Methoden werden zeilengenau referenziert
(z. B. `PDlplKnoten.cpp:35-58`), damit der Python-Implementer sie zur Code-Zeit
exakt nachlesen kann.

## Überblick — Verantwortlichkeiten

```
PSimulator        Top-Level: hält alle Pläne, Auslöser, Ressourcen, Klassen.
  │               Erbt von OSimulator. Pro Sim-Lauf eine Instanz.
  │
  ├─ m_lDlpl       list[PDurchlaufplan]      Pläne auf Top-Ebene
  ├─ m_lAusl       list[PAusloeser]          Auslöser
  ├─ m_oWarteSchl  PProzessDLL               zentrale Warteschlange
  └─ m_oGenerator  PGenerator (Stub in P1)   Multi-Lauf-Manipulator
                                                                       
PDurchlaufplan    Plan = Container für Knoten/Kanten, ist selbst Knoten.
  │ (extends PDlplKnoten)
  ├─ m_lKnoten     list[PDlplKnoten]         Untergeordnete Knoten
  ├─ m_lKanten     list[PDlplKante]          Kanten zwischen Knoten
  ├─ m_lStartKante PDlplKante                Plan-Eingang
  └─ m_lEndKante   PDlplKante                Plan-Ausgang

PDlplKnoten       Basisknoten = wartender Container für Prozesse.
  │ (extends PSimObj)
  ├─ m_lProzesse   list[PtProzess]           aktuell laufende/wartende Prozesse
  ├─ m_lKanteEin   PDlplKante                eingehende Kante
  ├─ m_lKanteAus   PDlplKante                ausgehende Kante
  └─ m_lKnotenOber PDlplKnoten               Plan, in dem dieser Knoten liegt

PDlplKante        Kante = Verbindung zwischen Knoten, ProzWeitergeben-Pfad.
  │ (extends PSimObj)
  ├─ m_lVorgaenger list[PDlplKnoten]
  ├─ m_lNachfolger list[PDlplKnoten]
  └─ m_lKnotenOber PDlplKnoten

PSimObj           PPS-Sim-Object-Basis: Zeit-Helpers, Tracing, SimInfo-Liste.
  (extends OSimObj)
```

**Konvention (Jeerg)**: `PDurchlaufplan` ist selbst ein `PDlplKnoten`. Die
**Plan-OID erscheint** deshalb in:
- `m_lStartKante.m_lVorgaenger.head` (Start-Kante hat den Plan als virtuellen Vorgänger)
- `m_lEndKante.m_lNachfolger.head` (End-Kante hat den Plan als virtuellen Nachfolger)

Der `.otx`-Mapper muss diese self-references erkennen (sind bereits im
[Spike-Parser](../src/osim_engine/io/otx_reader.py) berücksichtigt — Memory-
Punkt im Onboarding).

---

## PSimObj — PPS-Sim-Object-Basis

**Quelle:** `OSimPro/PSimObj.odh` (195 Z.) + `OSimPro/PSimObj.cpp` (412 Z.).
**Vererbung:** `PSimObj(OSimObj)`.

### Statische Member

```cpp
static int s_iIntBeginn;  // Zeitintervall-Beginn für zeitbezogene Kennzahlen
static int s_iIntEnd;     // Zeitintervall-Ende
```

**Python-Mapping**: Klassen-Attribute auf `PSimObject` (oder besser:
auf `PSimulator` als Konfig, weil das semantisch dorthin gehört).

### Datenmember

```
$attr CPoint    m_pntRaster;           // UI-Raster — raus
$attr CString   m_sUserString;         // User-Daten (frei)
$attr int       m_iUserInt   = 0;
$attr double    m_dUserDouble= 0.0;
$attr int       m_iMaxInfo   = 10;     // Max-SimInfos
$attr int       m_iMinInfo   = 2;
      CTypedPtrList<_SimInfo*> m_lSInfoList;  // temp. Sim-Daten
```

Plus eine eingebettete Helper-Klasse:

```cpp
class _SimInfo : public CObject {
public:
    int m_iInitTime;
    _SimInfo() { m_iInitTime = -1; }
};
```

### Enum `SimTimeStrMode`

```cpp
enum SimTimeStrMode {
    STS_STD, STS_EVTTIME, STS_NORMALTIME, STS_DATE, STS_ONLYTIME
};
```

Für `GetSimTimeStr(mode, szeit)`-Formatierung.

### Methoden

#### Zeit-Helpers

```cpp
int   Stunde2SZeit(double s);      // Stunden → Sekunden:  s * 3600
float SZeit2Stunde(int szeit);     // Sekunden → Stunden:  szeit / 3600.0
int   Tag2SZeit(double t);         // Tage → Sekunden:     t * 86400
float SZeit2Tag(int szeit);        // Sekunden → Tage:     szeit / 86400.0
```

#### SimInfo-Verwaltung

```cpp
virtual _SimInfo *CreateSInfo();                   // Factory (override-able)
virtual void      OnInfoList(int iStatus);         // -1 unter min, 0 ok, +1 über max
void              AddSInfo(_SimInfo *info);
void              RemoveSInfo(_SimInfo *info);
POSITION          GetSInfoHeadPosition();
_SimInfo         *GetSInfoNext(POSITION &pos);
_SimInfo         *GetSInfoPrev(POSITION &pos);
_SimInfo         *GetSInfoAt(POSITION &pos);
BOOL              IsSInfoEmpty();
void              ClearSInfoList();
```

**Python-Mapping**: einfache `list[SimInfo]` mit `add`, `remove`, `clear`,
`iter`. `OnInfoList`-Hook bleibt als override-Point.

#### Logging / Tracing

```cpp
CString GetSimTimeStr(SimTimeStrMode mode=STS_STD, int szeit=-1);
CString GetTimeStr(CTime tm, SimTimeStrMode mode=STS_DATE);

int     SimTrace(CString str);             // Trace überall hin
int     SimIndent(const int iIndent);

int     SimFileTrace(CString str);         // nur Dumperfile
int     SimFileIndent(const int iIndent);

int     SimViewTrace(CString str);         // nur Viewdump
int     SimViewIndent(const int iIndent);
```

**Python-Mapping**: ein Logger pro Simulator (`simulator.logger`), 3 Targets
(stdout/file/view) als Handler. Sim-Trace ruft den Logger mit aktueller Sim-Zeit
als prefix. `SimTimeStrMode` bestimmt das Zeit-Format.

#### Zeitintervall

```cpp
void SetZeitInt(int &szeitbeg, int &szeitend, BOOL tage=FALSE);
// Setzt s_iIntBeginn/s_iIntEnd statisch.
// Falls tage=TRUE: szeitbeg/szeitend sind Tage, sonst Sekunden.
```

#### Simulator-Cast

```cpp
oprPSimulator GetPSimulator() { return m_simulator; }
```

In Python entweder über `super().simulator` mit isinstance-Check oder
`@property` mit Type-Cast.

### Lifecycle (inline in .odh)

```cpp
$implement PSimObj(...)        { m_pntRaster.x = -1; m_pntRaster.y = -1; }
$implement void OnSimBegin()   { /* no-op */ }
$implement void OnRecInit()    { /* no-op */ }
$implement void OnSimReset()   { ClearSInfoList(); }
```

### Companion-Klassen — alle raus

- `PSimList`, `PSimLList`, `PSimObjVirtual` — durch `list[T]` ersetzt

### Python-Mapping `PSimObj` → `osim_engine.pps.sim_object.PSimObject`

```python
class SimTimeStrMode(IntEnum):
    STD = 0; EVTTIME = 1; NORMALTIME = 2; DATE = 3; ONLYTIME = 4

class SimInfo:
    init_time: int = -1

class PSimObject(SimObject):
    _int_beginn: ClassVar[int] = 0
    _int_end: ClassVar[int] = 0

    user_string: str = ""
    user_int: int = 0
    user_double: float = 0.0
    max_info: int = 10
    min_info: int = 2

    def __init__(self, simulator: "PSimulator") -> None:
        super().__init__(simulator)
        self._sim_infos: list[SimInfo] = []

    @property
    def p_simulator(self) -> "PSimulator":
        return cast("PSimulator", self.simulator)

    @staticmethod
    def stunde_to_szeit(s: float) -> int: return int(s * 3600)
    @staticmethod
    def szeit_to_stunde(szeit: int) -> float: return szeit / 3600.0
    @staticmethod
    def tag_to_szeit(t: float) -> int: return int(t * 86400)
    @staticmethod
    def szeit_to_tag(szeit: int) -> float: return szeit / 86400.0

    # SimInfo
    def create_sinfo(self) -> SimInfo: return SimInfo()
    def on_info_list(self, status: int) -> None: pass
    def add_sinfo(self, info: SimInfo) -> None: ...
    def remove_sinfo(self, info: SimInfo) -> None: ...
    def clear_sinfo_list(self) -> None: ...

    # Logging
    def sim_time_str(self, mode: SimTimeStrMode = SimTimeStrMode.STD,
                     szeit: int = -1) -> str: ...
    def sim_trace(self, msg: str) -> None: ...
    def sim_file_trace(self, msg: str) -> None: ...
    def sim_view_trace(self, msg: str) -> None: ...

    # Lifecycle
    def on_sim_begin(self, deep: bool = True) -> None: pass
    def on_rec_init(self, deep: bool = True) -> None: pass
    def on_sim_reset(self, deep: bool = True) -> None:
        self.clear_sinfo_list()
```

---

## PSimulator — Top-Level-Simulator der PPS-Schicht

**Quelle:** `OSimPro/PSimulator.odh` (675 Z.) + `OSimPro/PSimulator.cpp` (3861 Z.).
**Vererbung:** `PSimulator(OSimulator)`.

### Datenmember — die 12 Listen + Spezial-Attribute

| Attribut | Typ | Phase | Bemerkung |
|---|---|---|---|
| `m_lAusl` | `list[PAusloeser]` | **P1** | Auslöser-Liste |
| `m_lDlpl` | `list[PDurchlaufplan]` | **P1** | Pläne auf Top-Ebene |
| `m_lRessBeleg` | `list[PRessBeleg]` | P2 | Belegungsressourcen |
| `m_lRessMenge` | `list[PRessMenge]` | P2 | Mengenressourcen |
| `m_lSpeichProz` | `list[PSpeicherProz]` | P3 | Prozessspeicher |
| `m_lEinsatz` | `list[PEinsatzzeit]` | P2 | Einsatzzeiten |
| `m_lExtVert` | `list[PVertExtern]` | **P1** | Externe Verteilungen |
| `m_lKlassen` | `list[PKlasse]` | **P1** (minimal) | Klassen-System für KPIs |
| `m_lZelSystem` | `list[EPZelSystem]` | P5 | Zielsysteme (Entscheider) |
| `m_lEntInfo` | `list[EPEntInformationssystem]` | P5 | Info-Systeme |
| `m_lEntStrategie` | `list[EPEntStrategie]` | P5 | Strategien |
| `m_lEntFeld` | `list[EPEntFeld]` | P5 | Entscheidungsfelder |
| `m_oWarteSchl` | `PProzessDLL` | **P1** | zentrale Warteschlange |
| `m_oGenerator` | `PGenerator` | **P1** (Stub) | Multi-Lauf-Engine |

**In P1 anlegen**: `m_lAusl`, `m_lDlpl`, `m_lExtVert`, `m_lKlassen`, `m_oWarteSchl`,
`m_oGenerator` (Stub).
**Andere Listen** als `list[T] = []` zwar initialisieren, aber leer lassen — die
Klassen werden erst in späteren Phasen portiert.

### Konfig-Flags + Schichtende

```
$attr BOOL m_bIsEntAktiv         = FALSE;     // Entscheider-Funktionalität an/aus
$attr BOOL m_bPtkWartschl        = TRUE;      // 5 Ptk-Switches (Speicher-Steuerung)
$attr BOOL m_bPtkBelegungList    = TRUE;
$attr BOOL m_bPtkAnfragenList    = FALSE;
$attr BOOL m_bTmpConKnotenList   = FALSE;
$attr BOOL m_bTmpUmlFaktorList   = FALSE;

$attr int  m_iProduktionBezugsPeriode = 86400;
$attr int  m_iProduktionEnde          = -1;
$attr int  m_iProduktionEvtZaehler    = 0;
$attr int  m_bIsProduktionEnde        = FALSE;
$event(3)  void ProduktionEnde(BOOL prodEnde);
```

### Methoden

```cpp
BOOL IsEntFunktOn();
void SetEntFunkt(BOOL ent);
void TracePProzessDLL();        // Debug
BOOL IsProzInSystem();           // gibt es noch Prozesse im System?

virtual void OnPropertySheetOpen(OPropertySheet *pps);  // UI — raus
$command void CreateStdGfxModes();  // UI — raus
$command void CreateStdModel();     // optional
```

### Lifecycle (inline in .odh)

```cpp
$implement PSimulator(...) {
    m_strIDStdViewer = "SID_PSIM_BMP";  // UI — wegfallen lassen
    CreateStdGfxModes();                  // UI — wegfallen lassen
}

$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    if (!m_oWarteSchl->IsEmpty())
        TRACE("OSimulator::Start: Warteschlange ist nicht leer");
    // Schichtende-Events einplanen
    if (m_iProduktionEnde > 0) {
        EvtInsert(EvtProduktionEnde, oprThis(), m_iProduktionEnde, TRUE);
        EvtInsert(EvtProduktionEnde, oprThis(), m_iProduktionBezugsPeriode, FALSE);
    }
}

$implement void OnSimReset(BOOL bDeep) { m_oWarteSchl->DeleteAll(); }

$implement void OnRecInit(BOOL bDeep) {
    m_bIsProduktionEnde     = FALSE;
    m_iProduktionEvtZaehler = 0;
}
```

**Wichtige Beobachtungen**:

1. `OnSimBegin` ruft NICHT `super().OnSimBegin()` (= `OSimulator::OnSimBegin`).
   Das ist intentional: die Parent-Implementierung wird durch die ObjectBase-
   Reflektion automatisch davor aufgerufen. In Python **muss** `super().on_sim_begin()`
   explizit aufgerufen werden.
2. `EvtInsert(EvtProduktionEnde, this, m_iProduktionEnde, TRUE)` mit `BOOL`-Para
   → in Python: `evt_insert(EVENT_PRODUKTION_ENDE, self, m_produktion_ende, True)`.
   Die `EvtProduktionEnde` ist ein `$event(3)`-Slot — bei Implementierung
   prüfen, was die "3" bedeutet (vermutlich Event-Priorität / sub-time-tier).
3. `m_oWarteSchl->DeleteAll()` in `OnSimReset` — leert die zentrale Warteschlange.

### Helper-Klassen für PGenerator — out-of-scope P1

Die `.odh` definiert ~9 Helper-Klassen für den Generator (`PGenLauf`, `PGenObj`,
`PGenAZTag`, `PGenTmpAZModell`, `PGenEngpassInfo`, …). Alle **out-of-scope für P1**.

### Python-Mapping `PSimulator` → `osim_engine.pps.simulator.PSimulator`

```python
class PSimulator(Simulator):
    # P1-Listen (aktiv)
    m_lAusl: list["PAusloeser"]
    m_lDlpl: list["PDurchlaufplan"]
    m_lExtVert: list["PVertExtern"]
    m_lKlassen: list["PKlasse"]

    # P2+ Listen (initialisiert leer, nicht befüllt)
    m_lRessBeleg: list[Any] = []
    m_lRessMenge: list[Any] = []
    m_lSpeichProz: list[Any] = []
    m_lEinsatz: list[Any] = []
    m_lZelSystem: list[Any] = []
    m_lEntInfo: list[Any] = []
    m_lEntStrategie: list[Any] = []
    m_lEntFeld: list[Any] = []

    # zentrale Strukturen
    m_oWarteSchl: "ProzessDLL"
    m_oGenerator: "PGeneratorStub"   # P1 = leere Stub-Klasse

    # Konfig
    is_ent_aktiv: bool = False
    ptk_wartschl: bool = True
    ptk_belegung_list: bool = True
    ptk_anfragen_list: bool = False
    tmp_con_knoten_list: bool = False
    tmp_uml_faktor_list: bool = False

    # Schichtende
    produktion_bezugs_periode: int = 86400
    produktion_ende: int = -1
    produktion_evt_zaehler: int = 0
    is_produktion_ende: bool = False

    def __init__(self) -> None:
        super().__init__()
        self.m_lAusl = []
        self.m_lDlpl = []
        # …
        self.m_oWarteSchl = ProzessDLL()
        self.m_oGenerator = PGeneratorStub()

    def is_ent_funkt_on(self) -> bool: return self.is_ent_aktiv
    def set_ent_funkt(self, ent: bool) -> None: self.is_ent_aktiv = ent

    def trace_p_prozess_dll(self) -> None: ...
    def is_proz_in_system(self) -> bool: ...

    # Lifecycle
    def on_sim_begin(self, deep: bool = True) -> None:
        super().on_sim_begin(deep)
        if not self.m_oWarteSchl.is_empty():
            self.sim_trace("PSimulator.on_sim_begin: Warteschlange nicht leer")
        if self.produktion_ende > 0:
            self.evt_insert(EVENT_PRODUKTION_ENDE, self, self.produktion_ende, True)
            self.evt_insert(EVENT_PRODUKTION_ENDE, self, self.produktion_bezugs_periode, False)

    def on_sim_reset(self, deep: bool = True) -> None:
        super().on_sim_reset(deep)
        self.m_oWarteSchl.delete_all()

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep)
        self.is_produktion_ende = False
        self.produktion_evt_zaehler = 0

    # Event-Handler
    def evt_produktion_ende(self, prod_ende: bool) -> None: ...
```

---

## PDlplKnoten — Plan-Knoten (Basisklasse)

**Quelle:** `OSimPro/PDlplKnoten.odh` (496 Z.) + `OSimPro/PDlplKnoten.cpp` (2767 Z.).
**Vererbung:** `PDlplKnoten(PSimObj)`. Hat einen eigenen Listener-Typ
`PListenerDlplKnoten`. Hat einen friend-class-Zugriff von dort.

### Statische Member

```cpp
static int s_nNameCounter = 0;
```

Wird bei Ctor genutzt: `m_sName.Format("Knoten %d", s_nNameCounter++);`

### Datenmember

```
PListenerDlplKnoten *m_lstDpKnHead;          // Listener-Kette → Python: list

$link PProzessList            m_lProzesse;   // existierende Prozesse → list[PtProzess]
$attr(name) CString           m_sName;       // Knoten-Name
$link  PDlplKante             m_lKanteEin;   // eingehende Kante
$link  PDlplKante             m_lKanteAus;   // ausgehende Kante
$link  PDlplKnoten            m_lKnotenOber; // umgebender Plan
$link  PAssozRessourceLList   m_lAssozRess;  // Phase 2
$link  PAssozSpeicher         m_lAssozSpeich;// Phase 3

// Protokolle (KPI-Aggregation)
$attr  int     m_iPtkAusloesungCount    = 0;
$attr  int     m_iPtkBegAusloesungCount = 0;
$attr  int     m_iPtkProzessCount       = 0;
$attr  int     m_iPtkProzRefuseCount    = 0;
$attr  double  m_dPtkDurchlaufzeit      = 0.0;
$attr  double  m_dTmpDurchlaufzeit      = 0.0;
$attr  double  m_dEinKostenVorgaenger      = 0.0;
$attr  double  m_dEinMinKostenVorgaenger   = 0.0;
```

### Sim-Methoden (polymorph)

| Methode | Verhalten (PDlplKnoten-Default) | Override |
|---|---|---|
| `ProzWeitergeben(oProzOber, oEnt)` | **abstract** (`throw OException`) | jede Subklasse muss implementieren |
| `BearbeitBeginnen(oProzThis) -> BOOL` | siehe Snippet unten | wird typisch genutzt wie-ist + super() in Subklassen |
| `OnProzBeendet(oProz, oEnt)` | `OnProzBearbeitEnde + m_lKanteAus.ProzWeitergeben` | |
| `OnProzUnterbr(oProz, oEnt)` | `OnProzBearbeitUnterbr` (Notifikation) | |
| `OnProzSubBeendet(oProz, oEnt)` | **abstract** (`throw OException`) | |

#### `BearbeitBeginnen` (PDlplKnoten.cpp:35-58)

```cpp
BOOL PDlplKnoten::BearbeitBeginnen(oprPtProzess oProzThis)
{
    // Zähle begonnene Auslösungen
    m_iPtkBegAusloesungCount++;

    // Sind alle Ressourcen verfügbar?
    if (oProzThis->RessVerfuegbar()) {
        OnProzBearbeitBeginn(oProzThis);   // Notifikation + KPI
        oProzThis->BearbeitBeginnen();      // Bearbeitung initiieren
        return TRUE;
    }

    // Prozess informieren (er wandert in die Warteschlange)
    oProzThis->OnBearbeitAbgelehnt();
    return FALSE;
}
```

**P1-Vereinfachung**: `RessVerfuegbar()` ist Phase-2-Code (Ressourcen). In P1
muss `PtProzess.RessVerfuegbar` als Default-`return TRUE` stehen, damit
`BearbeitBeginnen` immer erfolgreich ist und die Sim-Schleife komplett
durchläuft. In B3 (CONTEXT-P1-pps-prozess.md) wird das festgelegt.

#### `OnProzBeendet` (PDlplKnoten.cpp:60-67)

```cpp
void PDlplKnoten::OnProzBeendet(oprPtProzess oProz, oprPEntitaet oEnt) {
    OnProzBearbeitEnde(oProz);                    // KPI + Notify
    m_lKanteAus->ProzWeitergeben(oProz, oEnt);    // an ausgehende Kante
}
```

#### `OnProzBearbeitBeginn` / `OnProzBearbeitEnde` / `OnProzBearbeitUnterbr` (PDlplKnoten.cpp:785-821)

KPI-Aggregation + Listener-Notifikation:

```cpp
void PDlplKnoten::OnProzBearbeitBeginn(oprPtProzess oProz) {
    if (IsPtk())
        PtkIntervallBegin(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, 1.0, EvtCurrTime());
    if (m_lstDpKnHead != NULL)
        m_lstDpKnHead->SendProzBearbeitBeginn(oProz);
}

void PDlplKnoten::OnProzBearbeitEnde(oprPtProzess oProz) {
    if (IsPtk())
        PtkIntervallEnd(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, 1.0, EvtCurrTime());
    if (IsPtk())
        m_iPtkAusloesungCount++;
    if (m_lstDpKnHead != NULL)
        m_lstDpKnHead->SendProzBearbeitEnde(oProz);
}

void PDlplKnoten::OnProzBearbeitUnterbr(oprPtProzess oProz) {
    if (IsPtk())
        PtkIntervallEnd(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, 1.0, EvtCurrTime());
    if (m_lstDpKnHead != NULL)
        m_lstDpKnHead->SendProzUnterbr(oProz);
}
```

**Wichtig**: `m_iPtkAusloesungCount` wird **nur** unter `IsPtk()` inkrementiert,
während `m_iPtkBegAusloesungCount` immer inkrementiert wird (siehe
`BearbeitBeginnen`). Das ist die Begriffs-Differenz: "Bg" = begonnene, "Ausl" =
fertig durchgelaufene (= Auslösungen).

### Prozess-Verwaltung (PDlplKnoten.cpp:828-849)

```cpp
void PDlplKnoten::AddProzess(oprPtProzess oProz) {
    _ASSERTE(oProz->m_posKnoten == NULL);
    oProz->m_posKnoten = m_lProzesse->AddTail(oProz);
    oProz->PtkUpDateProcessQueue(oProz, TRUE);    // Queue-KPI updaten
}

void PDlplKnoten::RemoveProzess(oprPtProzess oProz) {
    oProz->PtkUpDateProcessQueue(oProz, FALSE);
    if (oProz->m_posKnoten == NULL)
        oProz->m_posKnoten = m_lProzesse->Find(oProz);
    m_lProzesse->RemoveAt(oProz->m_posKnoten);
    oProz->m_posKnoten = NULL;
}
```

**Python-Mapping**: in Python wird `m_posKnoten` als Index/Iter-Cache irrelevant
(Listen-Operationen sind O(1) für tail-insert, O(n) für find). Stattdessen:
```python
def add_prozess(self, proz: PtProzess) -> None:
    assert proz.knoten is None
    self._prozesse.append(proz)
    proz.knoten = self
    proz.ptk_update_process_queue(proz, True)

def remove_prozess(self, proz: PtProzess) -> None:
    proz.ptk_update_process_queue(proz, False)
    self._prozesse.remove(proz)
    proz.knoten = None
```

### KPI-Methoden (Übersicht)

Alle Methoden delegieren auf die Ptk-Felder oder rufen Listen-Berechnungen.
P1-relevante Implementierungen:

| Methode | Quelle | Beschreibung |
|---|---|---|
| `GetKnzAnzAusloesungen()` | `cpp:94` | `return m_iPtkAusloesungCount` |
| `GetKnzAnzBegAusloesungen()` | `cpp:99` | `return m_iPtkBegAusloesungCount` |
| `GetKnzAnzRefusedAusloesungen()` | `cpp:104` | `return m_iPtkProzRefuseCount` |
| `GetKnzZegBediengrad()` | `cpp:108` | `count/(count+refused) * 100` |
| `GetKnzMittlDlfz()` | `cpp:119` | `m_dPtkDurchlaufzeit / m_iPtkAusloesungCount` (mit /0-Schutz) |
| `GetKnzMinDlfz(oZKlass)` | `cpp:145` | Default: `m_dPtkDurchlaufzeit` (in `PDurchlaufplan` überschrieben mit kritischem Weg) |
| `GetKnzZegDlfz(oZKlass)` | `cpp:152` | mittl-Dlfz / min-Dlfz |
| `PrzKostenBerechnen(dEinKosten)` | `cpp:169` | `m_dEinKostenVorgaenger += dEinKosten` |
| `GetKnzPeriodenkosten()` | `cpp:176` | Aggregation aus AssozRess + Vorgängerkosten |
| `GetKnzArbeitsinhalt(oZKlass)` | `cpp:276` | Default: 0 |
| `GetZstAnzWartProz()` | inline | `m_lProzesse.size()` |
| `GetZstArbInWartProz()` | `cpp:379` | Σ über Prozesse |

**Phase-1-Reichweite**: Die KPI-Methoden, die `oZKlass` (PKlasseZeit) und
`oKKlass` (PKlasseKosten) als Parameter nehmen, brauchen das `PKlasse`-System
(Phase 1 minimal). Für P1 reicht es, wenn alle KPI-Methoden mit `klass=None`
funktionieren (Default-Implementierung über alle Auslösungen).

### Lifecycle (inline in .odh)

```cpp
$implement PDlplKnoten(...)
{
    m_lAssozSpeich = ONULL;
    m_lstDpKnHead  = NULL;
    m_sName.Format("Knoten %d", s_nNameCounter++);
}

$implement ~PDlplKnoten() {
    while (m_lstDpKnHead != NULL)
        m_lstDpKnHead->Detach();   // alle Listener aushängen
}

$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    // alle existierenden Prozesse löschen
    POSITION pos = m_lProzesse->GetHeadPosition();
    while (pos != NULL)
        m_lProzesse->GetNext(pos).Delete();
    m_lProzesse->RemoveAll();
}

$implement void OnRecInit(BOOL bDeep) {
    m_iPtkAusloesungCount    = 0;
    m_iPtkBegAusloesungCount = 0;
    m_iPtkProzessCount       = 0;
    m_iPtkProzRefuseCount    = 0;
    m_dPtkDurchlaufzeit      = 0.0;
    m_dTmpDurchlaufzeit      = 0.0;
}

$implement void OnRecStart(int timeStart, BOOL bDeep) {
    PtkIntervallStart(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, timeStart);
}

$implement void OnRecStop(int timeStop, BOOL bDeep) {
    PtkIntervallStop(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, timeStop);
}
```

### Listener — `PListenerDlplKnoten`

```cpp
class PListenerDlplKnoten : public OListener {
    oprPDlplKnoten    m_oKnoten;
    void  Attach(oprPDlplKnoten oKnoten);
    void  Detach();
    // Sender (iterativ):
    void  SendProzBearbeitBeginn(oprPtProzess oProz);
    void  SendProzBearbeitEnde(oprPtProzess oProz);
    void  SendProzUnterbr(oprPtProzess oProz);
    // Override-Points (default no-op):
    virtual void  OnProzBearbeitBeginn(oprPtProzess oProz);
    virtual void  OnProzBearbeitEnde(oprPtProzess oProz);
    virtual void  OnProzUnterbr(oprPtProzess oProz);
};
```

**Python-Mapping**: `KnotenListener`-Base-Class mit 3 `on_*`-Hooks (default
no-op). Knoten hält `list[KnotenListener]`, `attach`/`detach` macht
add/remove. Iteration: `for l in self._listeners: l.on_*()`.

### Sonstige Methoden

```cpp
virtual BOOL ValidateDlp(ODumpContext *pDump, int iIndent);  // P1: skippable
virtual BOOL IsWaiting(oprPtTrigger oTrigger);
virtual BOOL DeleteProz(oprPtTrigger oTrigger);
virtual int  GetKnotenAnzahl(BOOL nurBasisKnoten=TRUE) { return 1; }

int     GetAssozCountMenge();      // Phase 2
int     GetAssozCountBeleg();      // Phase 2
oprPAssozRessource GetAssozMit(oprPSimObj pobj);  // Phase 2
BOOL    RemovePSimObj(oprPSimObj pobj);
void    RemoveUnusedAssoz();
virtual void FillKnzList(...);     // optional UI-Helper
```

### Out-of-scope für Python-Port

- `PDlplKnotenDesignItem`, `PDlplKnotenGObj`, `PDlplKnotenDesignView` — UI
- `OMetaGfxPDlplKnoten` — UI-Reflektions-Bridge

### Subtyp: `PDpKnExtern`

```cpp
class PDpKnExtern : public PDlplKnoten {
    virtual void ProzWeitergeben(PDlplKante oKante, PEntitaet oEnt);
};
```

In `PDlplKnoten.odh` deklariert, aber Phase-4 (Entitäten + erweiterte Knoten).
P1 sollte die Klasse **noch nicht** implementieren.

### Python-Mapping `PDlplKnoten` → `osim_engine.pps.dlpl_knoten.PDlplKnoten`

```python
class PDlplKnoten(PSimObject):
    _name_counter: ClassVar[int] = 0

    sName: str

    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.m_lProzesse: list["PtProzess"] = []
        self.m_lKanteEin: PDlplKante | None = None
        self.m_lKanteAus: PDlplKante | None = None
        self.m_lKnotenOber: "PDlplKnoten" | None = None
        # Phase 2/3:
        self.m_lAssozRess: list[Any] = []
        self.m_lAssozSpeich: Any = None

        # KPI-Akku
        self.m_iPtkAusloesungCount = 0
        self.m_iPtkBegAusloesungCount = 0
        self.m_iPtkProzessCount = 0
        self.m_iPtkProzRefuseCount = 0
        self.m_dPtkDurchlaufzeit = 0.0
        self.m_dTmpDurchlaufzeit = 0.0
        self.m_dEinKostenVorgaenger = 0.0
        self.m_dEinMinKostenVorgaenger = 0.0

        self._listeners: list[KnotenListener] = []
        cls = type(self)
        cls._name_counter += 1
        self.sName = f"Knoten {cls._name_counter - 1}"

    # Sim-Loop
    def proz_weitergeben(self, ober_proz: "PtProzess",
                         entitaet: "PEntitaet" = None) -> None:
        raise NotImplementedError

    def bearbeit_beginnen(self, proz_this: "PtProzess") -> bool: ...
    def on_proz_beendet(self, proz: "PtProzess", entitaet: "PEntitaet") -> None: ...
    def on_proz_unterbr(self, proz: "PtProzess", entitaet: "PEntitaet") -> None: ...
    def on_proz_sub_beendet(self, proz: "PtProzess", entitaet: "PEntitaet") -> None:
        raise NotImplementedError

    # KPI-Helpers + Notifikation
    def on_proz_bearbeit_beginn(self, proz: "PtProzess") -> None: ...
    def on_proz_bearbeit_ende(self, proz: "PtProzess") -> None: ...
    def on_proz_bearbeit_unterbr(self, proz: "PtProzess") -> None: ...

    # KPIs
    def get_knz_anz_ausloesungen(self) -> int: ...
    def get_knz_mittl_dlfz(self) -> float: ...
    def get_knz_min_dlfz(self, klass: "PKlasseZeit | None" = None) -> float: ...
    # ... weitere
```

---

## PDurchlaufplan — Plan (Spezialisierung von PDlplKnoten)

**Quelle:** `OSimPro/PDurchlaufplan.odh` (467 Z.) + `OSimPro/PDurchlaufplan.cpp` (3733 Z.).
**Vererbung:** `PDurchlaufplan(PDlplKnoten)`.

### Konstanten + Helper-Struktur

```cpp
#define PDURCHLAUFPLAN_MAX_DLZ_BEOBACHTUNGSBREITE 20

struct PDlpl_PtkAktDlz {
    oprPtProzess m_oProz;
    int          m_iBeginn;
    int          m_iEnd;
};
```

Das Sliding-Window für Durchlaufzeit-Beobachtungen — die letzten 20 fertigen
Durchläufe.

### Datenmember

```
$link OGfxDesignPDurchlaufplan m_lDesigner;   // UI — raus
$link PDlplKnotenLList         m_lKnoten;     // → list[PDlplKnoten]
$link PDlplKanteLList          m_lKanten;     // → list[PDlplKante]
$link PDlplKante               m_lStartKante;
$link PDlplKante               m_lEndKante;

protected:
    CTypedPtrList<PDlpl_PtkAktDlz*>  m_BeginnList;  // gestartete Durchläufe
    CTypedPtrList<PDlpl_PtkAktDlz*>  m_EndList;     // fertige (max 20)
```

### Sim-Methoden

#### `ProzWeitergeben` (PDurchlaufplan.cpp:40-43)

```cpp
void PDurchlaufplan::ProzWeitergeben(oprPtProzess oProzOber, oprPEntitaet oEnt) {
    DlplAusloesen(oProzOber->m_oTrigger, oProzOber, oEnt);
}
```

Plan-Eingang: delegiert an `DlplAusloesen`.

#### `DlplAusloesen` (PDurchlaufplan.cpp:52-81) — **Plan-Start**

```cpp
void PDurchlaufplan::DlplAusloesen(oprPtTrigger oTrigger,
                                   oprPtProzess oProzOber,
                                   oprPEntitaet oEnt)
{
    oprPtProzDurchlaufplan oProz;

    oProz = new PtProzDurchlaufplan(GetObjectBase(), m_simulator);
    oProz->m_oKnoten   = oprThis();
    oProz->m_oTrigger  = oTrigger;
    oProz->m_oProzOber = oProzOber;
    oProz->m_oEntitaet = oEnt;
    oProz->m_sName     = (oProzOber != ONULL)
                       ? oProzOber->m_sName + "|" + oProz->m_oKnoten->m_sName
                       : oProz->m_oKnoten->m_sName;

    AddProzess(oProz);
    m_iPtkProzessCount++;
    oProz->m_oTrigger->OnPrzCreated(oProz);   // Trigger informieren

    if (!BearbeitBeginnen(oProz)) {
        // → in zentrale Prozesswarteschlange
        GetPSimulator()->m_oWarteSchl->AddTail(oProz);
    }
}
```

**Critical path**: `BearbeitBeginnen` ist hier `PDurchlaufplan::BearbeitBeginnen`,
das wiederum `PDlplKnoten::BearbeitBeginnen` aufruft. Wenn das `FALSE` zurück­
gibt (Ressourcen nicht verfügbar), wandert der `PtProzDurchlaufplan` in
`PSimulator::m_oWarteSchl`.

#### `BearbeitBeginnen` (PDurchlaufplan.cpp:84-96)

```cpp
BOOL PDurchlaufplan::BearbeitBeginnen(oprPtProzess oProzThis) {
    if (!PDlplKnoten::BearbeitBeginnen(oProzThis))   // super()
        return FALSE;
    m_lStartKante->ProzWeitergeben(oProzThis, oProzThis->m_oEntitaet);
    return TRUE;
}
```

#### `OnDlplBeendet` (PDurchlaufplan.cpp:99-125) — **Plan-Ende**

```cpp
void PDurchlaufplan::OnDlplBeendet(oprPtProzess oProzThis, oprPEntitaet oEnt) {
    OnProzBearbeitEnde(oProzThis);     // KPI + Notify

    if (m_lKanteAus != ONULL) {
        // Plan ist Sub-Plan → an Nachfolger-Kante weitergeben
        m_lKanteAus->ProzWeitergeben(oProzThis, oEnt);
    }
    else if (m_lKnotenOber != ONULL) {
        // Plan ist Sub-Plan ohne Nachfolger-Kante → Oberknoten informieren
        m_lKnotenOber->OnProzSubBeendet(oProzThis->m_oProzOber, oEnt);
    }
    else {
        // Plan ist Top-Level → Trigger informieren
        oProzThis->m_oTrigger->OnDlplBeendet(oProzThis);
    }

    // Prozess-Objekt beenden
    oprPtProzDurchlaufplan(oProzThis)->BearbeitBeenden();
}
```

**Drei Ausgangs-Pfade**:
1. **Sub-Plan mit Nachfolger-Kante** → an Kante weitergeben
2. **Sub-Plan ohne Nachfolger** → Oberknoten `OnProzSubBeendet`
3. **Top-Level-Plan** → Trigger `OnDlplBeendet`

### KPIs — kritischer Weg + Kosten-Verteilung

#### `GetKnzMinDlfz` + `CalcKritWegRek` (PDurchlaufplan.cpp:204-305)

```cpp
double PDurchlaufplan::GetKnzMinDlfz(oprPKlasseZeit oZKlass) {
    // alle Kanten zurücksetzen
    POSITION pos = m_lKanten->GetHeadPosition();
    while (pos != NULL)
        m_lKanten->GetNext(pos)->m_dHelp = -1;

    // kritischen Weg rekursiv berechnen
    CalcKritWegRek(m_lStartKante, 0.0, oZKlass);
    _ASSERTE(m_lEndKante->m_dHelp >= 0);

    // End-Kante: eigene min-Dlfz draufaddieren
    m_lEndKante->m_dHelp += m_lEndKante->GetKnzMinDlfz(ONULL);
    return m_lEndKante->m_dHelp;
}

void PDurchlaufplan::CalcKritWegRek(oprPDlplKante oKante, double dDlz,
                                    oprPKlasseZeit oZKlass)
{
    if (oKante->m_dHelp >= dDlz) return;  // bereits höherer Wert
    oKante->m_dHelp = dDlz;

    while (oKante != ONULL) {
        if (oKante->IsEndKante()) break;

        // Übergangskante: eigene Zeit dazu
        oKante->m_dHelp += oKante->GetKnzMinDlfz(ONULL);

        // Schleife arbeitet die Nachfolger-Knoten ab
        oprPDlplKante  oKanteNext = ONULL;
        POSITION pos = oKante->m_lNachfolger->GetHeadPosition();
        while (pos != NULL) {
            oprPDlplKnoten oKnoten = oKante->m_lNachfolger->GetNext(pos);
            double dDlzNext = oKante->m_dHelp + oKnoten->GetKnzMinDlfz(ONULL);

            if (oKnoten == oKante->m_lNachfolger->GetHead()) {
                // erster Nachfolger → Hauptweg (iterativ)
                oKanteNext = oKnoten->m_lKanteAus;
                if (oKanteNext->m_dHelp < dDlzNext)
                    oKanteNext->m_dHelp = dDlzNext;
            } else {
                // parallele Wege → rekursiv
                CalcKritWegRek(oKnoten->m_lKanteAus, dDlzNext, oZKlass);
            }
        }
        oKante = oKanteNext;
    }
}
```

**Algorithmus-Insight**: Klassischer kritischer Weg im DAG. Optimierung:
Hauptweg iterativ über die *erste* Nachfolger-Kante; parallele Wege rekursiv.
Konvergiert weil jeder Knoten nur dann weiterverfolgt wird, wenn `m_dHelp <
neue_dDlz` (Memoization über das `m_dHelp`-Feld der Kante).

#### `PrzKostenBerechnen` + `CalcProzKostenRek` (PDurchlaufplan.cpp:315-408)

```cpp
void PDurchlaufplan::PrzKostenBerechnen(double dEinKosten) {
    PDlplKnoten::PrzKostenBerechnen(dEinKosten);  // Plan selbst

    // Init: jede Kante mit Vorgänger-Count + dHelp=0
    POSITION pos = m_lKanten->GetHeadPosition();
    while (pos != NULL) {
        oprPDlplKante oKante = m_lKanten->GetNext(pos);
        oKante->m_iHelp = oKante->m_lVorgaenger->GetCount();
        oKante->m_dHelp = 0.0;
    }

    // Init: alle Knoten m_dEinKostenVorgaenger=0
    pos = m_lKnoten->GetHeadPosition();
    while (pos != NULL)
        m_lKnoten->GetNext(pos)->m_dEinKostenVorgaenger = 0.0;

    CalcProzKostenRek(m_lStartKante, dEinKosten);
}

void PDurchlaufplan::CalcProzKostenRek(oprPDlplKante oKante, double dEinKosten) {
    while (oKante != ONULL) {
        if (oKante->IsEndKante()) break;
        oKante->m_dHelp += dEinKosten;       // Kosten summieren

        // Warten, bis alle Vorgänger eingetroffen sind
        oKante->m_iHelp--;
        if (oKante->m_iHelp > 0) break;

        oprPDlplKante oKanteNext = ONULL;
        double dEinKostenNext = -1.0;
        POSITION pos = oKante->m_lNachfolger->GetHeadPosition();
        while (pos != NULL) {
            oprPDlplKnoten oKnoten = oKante->m_lNachfolger->GetNext(pos);
            int kantanzahl = oKante->m_lNachfolger->GetCount();
            oKnoten->PrzKostenBerechnen(dEinKosten / kantanzahl);

            if (oKnoten == oKante->m_lNachfolger->GetHead()) {
                oKanteNext = oKnoten->m_lKanteAus;
                dEinKostenNext = oKnoten->GetKnzPeriodenkosten();
            } else {
                CalcProzKostenRek(oKnoten->m_lKanteAus, oKnoten->GetKnzPeriodenkosten());
            }
        }
        oKante = oKanteNext;
        dEinKosten = dEinKostenNext;
    }
}
```

**Wichtig**: Bei mehreren Nachfolgern wird `dEinKosten / kantanzahl` aufgeteilt
(gleichmäßige Verteilung). Bei Verknüpfungs-Kanten (`m_iHelp > 0`) wartet die
Rekursion, bis alle Vorgänger angekommen sind — Join-Logik via Counter.

### `PtkAktDlzBeginZeit` / `PtkAktDlzEndZeit` (PDurchlaufplan.cpp:147-194)

```cpp
void PDurchlaufplan::PtkAktDlzBeginZeit(oprPtProzess proz) {
    PDlpl_PtkAktDlz *aktdlz = new PDlpl_PtkAktDlz();
    aktdlz->m_iBeginn = EvtCurrTime();
    aktdlz->m_iEnd    = -1;
    aktdlz->m_oProz   = proz;
    m_BeginnList.AddTail(aktdlz);
}

void PDurchlaufplan::PtkAktDlzEndZeit(oprPtProzess proz) {
    // Prozess in BeginnList finden + entfernen
    POSITION pos = m_BeginnList.GetHeadPosition();
    PDlpl_PtkAktDlz *aktdlz = NULL;
    while (pos != NULL) {
        if (m_BeginnList.GetAt(pos)->m_oProz == proz) {
            aktdlz = m_BeginnList.GetAt(pos);
            m_BeginnList.RemoveAt(pos);
            break;
        }
        m_BeginnList.GetNext(pos);
    }
    if (aktdlz == NULL) throw new OException();

    aktdlz->m_iEnd = EvtCurrTime();
    m_EndList.AddTail(aktdlz);

    // Sliding-Window: max 20 Einträge
    if (m_EndList.GetCount() > PDURCHLAUFPLAN_MAX_DLZ_BEOBACHTUNGSBREITE) {
        aktdlz = m_EndList.GetHead();
        m_EndList.RemoveHead();
        delete aktdlz;
    }
}
```

**Python-Mapping**: `collections.deque(maxlen=20)` für `_end_list`.

### Lifecycle (inline in .odh)

```cpp
$implement PDurchlaufplan(...) {
    m_sName.Format("Durchlaufplan %d", s_nNameCounter-1);
    m_lDesigner->m_lObj = oprThis();  // UI — raus
}

$implement ~PDurchlaufplan() {
    // BeginnList und EndList aufräumen
    ...
}

$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    // BeginnList und EndList leeren
}

$implement void OnRecStop(int timeStop, BOOL bDeep) {
    // Kosten-Berechnung am Periodenende, NUR wenn Top-Level-Plan
    if (m_lKnotenOber == ONULL) {
        PrzKostenBerechnen(0.0);
        MinPrzKostenBerechnen(0.0);
    }
}
```

### Python-Mapping `PDurchlaufplan` → `osim_engine.pps.durchlaufplan.PDurchlaufplan`

```python
@dataclass
class PtkAktDlz:
    proz: "PtProzess"
    beginn: int
    end: int = -1

class PDurchlaufplan(PDlplKnoten):
    MAX_DLZ_BEOBACHTUNGSBREITE: ClassVar[int] = 20

    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.m_lKnoten: list[PDlplKnoten] = []
        self.m_lKanten: list[PDlplKante] = []
        self.m_lStartKante: PDlplKante | None = None
        self.m_lEndKante:   PDlplKante | None = None
        self._beginn_list: list[PtkAktDlz] = []
        self._end_list: deque[PtkAktDlz] = deque(maxlen=self.MAX_DLZ_BEOBACHTUNGSBREITE)

    def proz_weitergeben(self, proz_ober: "PtProzess", entitaet: "PEntitaet") -> None:
        self.dlpl_ausloesen(proz_ober.trigger, proz_ober, entitaet)

    def dlpl_ausloesen(self, trigger: "PtTrigger",
                       proz_ober: "PtProzess | None",
                       entitaet: "PEntitaet | None") -> None: ...

    def bearbeit_beginnen(self, proz_this: "PtProzess") -> bool:
        if not super().bearbeit_beginnen(proz_this):
            return False
        self.m_lStartKante.proz_weitergeben(proz_this, proz_this.entitaet)
        return True

    def on_dlpl_beendet(self, proz_this: "PtProzess", entitaet: "PEntitaet") -> None: ...

    def get_knz_min_dlfz(self, klass=None) -> float: ...
    def calc_krit_weg_rek(self, kante: "PDlplKante", dlz: float, klass=None) -> None: ...

    def prz_kosten_berechnen(self, ein_kosten: float) -> None: ...
    def calc_proz_kosten_rek(self, kante: "PDlplKante", ein_kosten: float) -> None: ...

    def ptk_akt_dlz_begin_zeit(self, proz: "PtProzess") -> None: ...
    def ptk_akt_dlz_end_zeit(self, proz: "PtProzess") -> None: ...
```

---

## PDlplKante — Verbindung zwischen Knoten

**Quelle:** `OSimPro/PDlplKante.odh` (637 Z.) + `OSimPro/PDlplKante.cpp` (1285 Z.).
**Vererbung:** `PDlplKante(PSimObj)`. Hat eigenen Listener-Typ
`PListenerDlplKante`.

### Datenmember

```
PListenerDlplKante *m_lstDpKaHead;  // Listener-Kette

$link PVerknuepfungList    m_lVerknpfng;   // existierende Join-Counter
$attr(transient) int       m_iHelp;        // Hilfsfelder (KPI-Berechnung)
$attr(transient) double    m_dHelp;
$attr(transient) int       m_iMinHelp;
$attr(transient) double    m_dMinHelp;

$link PDlplKnotenLList     m_lNachfolger;
$link PDlplKnotenLList     m_lVorgaenger;
$link PDlplKnoten          m_lKnotenOber;  // umgebender Plan

$link PProzessList         m_lProzesse;
$attr int                  m_iPtkUebergangCount = 0;
```

Die `m_iHelp`/`m_dHelp` sind **transient**: nicht persistiert, nur zur Laufzeit
für Algorithmen wie `CalcKritWegRek` benutzt.

### Methoden

#### `IsStartKante` / `IsEndKante` (PDlplKante.cpp:93-108)

```cpp
BOOL PDlplKante::IsStartKante() {
    if (m_lVorgaenger->IsEmpty()) return FALSE;
    return (m_lVorgaenger->GetHead() == m_lKnotenOber);   // Plan-OID first
}

BOOL PDlplKante::IsEndKante() {
    if (m_lNachfolger->IsEmpty()) return FALSE;
    return (m_lNachfolger->GetHead() == m_lKnotenOber);
}
```

**Konvention (Jeerg)**: Plan ist selbst Knoten → Plan-OID erscheint in
Start-Kante als ersten Vorgänger, in End-Kante als ersten Nachfolger.

#### `ProzWeitergeben` (PDlplKante.cpp:115-185) — **Kern der Sim-Loop**

```cpp
void PDlplKante::ProzWeitergeben(oprPtProzess oProz, oprPEntitaet oEnt) {
    m_iPtkUebergangCount++;
    if (m_lstDpKaHead != NULL)
        m_lstDpKaHead->SendProzWeitergeben(oProz);

    if (IsStartKante()) {
        if (IsEndKante()) {
            // Kurzschluss: Start = End → Plan direkt beenden
            oprPDurchlaufplan(m_lNachfolger->GetHead())->OnDlplBeendet(oProz, oEnt);
        } else {
            // an alle nachfolgenden Knoten weitergeben
            for (POSITION pos = m_lNachfolger->GetHeadPosition(); pos != NULL;)
                m_lNachfolger->GetNext(pos)->ProzWeitergeben(oProz, oEnt);
        }
    }
    else {
        // Verknüpfung (mehrere Vorgänger) → Join-Counter
        if (m_lVorgaenger->GetCount() > 1) {
            oprPtVerknuepfung oVerknpf = oProz->m_oProzOber->FindVerknpf(oprThis());
            if (oVerknpf != ONULL) {
                // existiert bereits → Counter dekrementieren
                if (!oVerknpf->ProzWeitergeben(oProz))
                    return;   // noch nicht erfüllt
                // erfüllt → Verknüpfung entfernen
                oProz->m_oProzOber->RemoveVerknpf(oVerknpf);
                oVerknpf.Delete();
            } else {
                // erstes Mal → Verknüpfung anlegen
                oVerknpf = new PtVerknuepfung(GetObjectBase(), m_simulator);
                oVerknpf->m_oKante = oprThis();
                oVerknpf->m_iAnzProz = m_lVorgaenger->GetCount() - 1;
                oProz->m_oProzOber->AddVerknpf(oVerknpf);
                return;
            }
        }

        if (IsEndKante()) {
            // Plan-Ende für übergeordneten Plan
            oprPDurchlaufplan(m_lNachfolger->GetHead())->OnDlplBeendet(oProz->m_oProzOber, oEnt);
        } else {
            // an alle nachfolgenden Knoten weitergeben (mit ProzOber!)
            for (POSITION pos = m_lNachfolger->GetHeadPosition(); pos != NULL;)
                m_lNachfolger->GetNext(pos)->ProzWeitergeben(oProz->m_oProzOber, oEnt);
        }
    }
}
```

**Drei Fälle**:
1. **Start-Kante**: weitergeben an direkten Knoten, mit `oProz` selbst
2. **Mittlere Kante**: ggf. Join-Counter (Verknüpfung) auflösen, dann mit
   `oProz->m_oProzOber` (Ober-Prozess) an Nachfolger
3. **End-Kante**: `OnDlplBeendet` am Plan-Knoten

**Wichtig zum Join-Pattern (`PtVerknuepfung`)**:
- Eine Kante mit >1 Vorgänger braucht für jeden Plan-Lauf einen Join-Counter
- Counter sitzt am `oProz->m_oProzOber` (= Plan-Prozess), nicht an der Kante!
- Beim ersten Eintreffen: Counter = (count-1) erzeugen
- Bei jedem weiteren: Counter dekrementieren; wenn er 0 erreicht → durchlassen
- Wird in B3 (`PtVerknuepfung`) detailliert dokumentiert

### Lifecycle

```cpp
$implement PDlplKante(...) { m_lstDpKaHead = NULL; }

$implement ~PDlplKante() {
    while (m_lstDpKaHead != NULL) m_lstDpKaHead->Detach();
}

$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    // alle Prozesse löschen
}

$implement void OnRecInit(BOOL bDeep) { m_iPtkUebergangCount = 0; }
```

### Subtypen

| Klasse | Extra-Felder | Methoden | Phase |
|---|---|---|---|
| `PDpKaUebergang` | `m_iUebergangszeit`, `m_iKummUebergangszeit` | `EvtUebergangEnde`-Event | **P1** |
| `PDpKaVerteilung` | `m_lVerteil` (PVerteilung), `m_iAktVerteilungszeit`, `m_iKummVerteilungszeit`, `m_iAnzUebergaenge` | `EvtUebergangEnde`-Event, `OnSimBegin` (Verteil-Init je nach Profile-Setting) | **P1** |
| `PDpKaEntitaet` | `m_oLager` (PLagerEntitaet), `m_iWeitergabemenge` | | P4 |
| `PDpKaEntitaetAblage` (extends PDpKaEntitaet) | — | | P4 |
| `PDpKaExtern` | — | `ExternWeitergeben` | P4 |

**P1-Scope**: `PDpKaUebergang` (Übergang mit fester Zeit) und `PDpKaVerteilung`
(Übergang mit Verteilungs-Zeit) reichen aus, um `test.otx` und `dc1.otx` zu
validieren.

#### `PDpKaVerteilung::OnSimBegin` — Verteilungs-Init

```cpp
$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    if (AfxGetApp()->GetProfileInt("OSim","m_PDpKnVerteil_BerVerteilZuBegin",0) != 1) {
        m_iAktVerteilungszeit = 0;       // wird später berechnet
    } else {
        m_iAktVerteilungszeit = -1;
        while (m_iAktVerteilungszeit <= 0)
            m_iAktVerteilungszeit = m_lVerteil->GetZufallswert();
    }
}
```

**Profile-Setting** in C++ via Windows Registry. **In Python**: ein Bool-Konfig-
Feld am `PSimulator` (z. B. `pre_compute_kante_verteilung: bool = False`). Bei
`True` → bereits zum Sim-Begin samplen, sonst lazy.

### Python-Mapping

```python
class PDlplKante(PSimObject):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.m_lVerknpfng: list["PtVerknuepfung"] = []
        self.m_lNachfolger: list[PDlplKnoten] = []
        self.m_lVorgaenger: list[PDlplKnoten] = []
        self.m_lKnotenOber: PDlplKnoten | None = None
        self.m_lProzesse: list["PtProzess"] = []
        self.m_iPtkUebergangCount = 0

        # transient KPI-Helpers
        self.m_iHelp = 0
        self.m_dHelp = 0.0
        self.m_iMinHelp = 0
        self.m_dMinHelp = 0.0

        self._listeners: list[KanteListener] = []

    def is_start_kante(self) -> bool:
        return (bool(self.m_lVorgaenger)
                and self.m_lVorgaenger[0] is self.m_lKnotenOber)

    def is_end_kante(self) -> bool:
        return (bool(self.m_lNachfolger)
                and self.m_lNachfolger[0] is self.m_lKnotenOber)

    def proz_weitergeben(self, proz: "PtProzess", entitaet: "PEntitaet") -> None: ...

class PDpKaUebergang(PDlplKante):
    uebergangszeit: int = 0
    kumm_uebergangszeit: int = 0

class PDpKaVerteilung(PDlplKante):
    akt_verteilungszeit: int = 0
    kumm_verteilungszeit: int = 0
    anz_uebergaenge: int = 0
    verteilung: Distribution | None = None
```

---

## Modul-Layout für B2-Code

```
src/osim_engine/pps/
    __init__.py
    sim_object.py            # PSimObject (PSimObj)
    simulator.py             # PSimulator (mit 12 Listen, P1 nutzt 4)
    prozess_dll.py           # ProzessDLL (zentrale Warteschlange — siehe B3)
    knoten/
        __init__.py
        base.py              # PDlplKnoten + KnotenListener
    kante/
        __init__.py
        base.py              # PDlplKante + KanteListener
        uebergang.py         # PDpKaUebergang
        verteilung.py        # PDpKaVerteilung
    durchlaufplan.py         # PDurchlaufplan (extends PDlplKnoten)

src/osim_engine/generator/
    __init__.py
    stub.py                  # PGeneratorStub
```

## Phase-1-Reichweite (B2)

**In-Scope** (für test.otx + dc1.otx-Validierung):
- `PSimObject`, `PSimulator` mit 4 P1-Listen + `m_oWarteSchl` + `PGeneratorStub`
- `PDlplKnoten` (Basisklasse, vollständig) + `KnotenListener`
- `PDurchlaufplan` mit Sim-Loop (DlplAusloesen, BearbeitBeginnen, OnDlplBeendet)
  + Sliding-Window-KPI (BeginnList/EndList) + kritischer Weg + Kosten-Verteilung
- `PDlplKante` (Basisklasse) + `KanteListener` + `PDpKaUebergang` + `PDpKaVerteilung`

**Out-of-scope (spätere Phasen)**:
- `PDpKnExtern`, `PDpKaEntitaet*`, `PDpKaExtern` (P4)
- `PRess*`, `PAssoz*`, `PEinsatzzeit`, `PAktor`, `PSpeicherProz` (P2/P3)
- `EP*`, `PEntscheider`, `PGenerator` (P5)
- `PListenerDlplKnotenDesignItem`, `PDlplKnotenGObj`, alle `OGfx*`/`OMetaGfx*`/`*DesignView`

## Offene Punkte (für Implementierung)

1. **`m_posKnoten`-Mechanik in `PtProzess`** — wird in B3 detailliert, hängt eng mit
   `AddProzess`/`RemoveProzess` zusammen.
2. **`PtkUpDateProcessQueue`** auf `PtProzess` — KPI-Mechanik für Queue-Updates,
   wird in B3 spezifiziert. Hier in `PDlplKnoten.AddProzess` aufgerufen.
3. **`OnPrzCreated` auf `PtTrigger`** — Trigger-Hook bei Plan-Auslösung,
   wird in B3 spezifiziert.
4. **`FindVerknpf` / `AddVerknpf` / `RemoveVerknpf` auf `PtProzess`** — Join-Counter-
   Verwaltung, wird in B3 spezifiziert (`PtVerknuepfung`).
5. **`PKlasseZeit` / `PKlasseKosten` für KPI-Klassifizierung** — wird in B4
   spezifiziert. Für P1-Sim-Loop reicht `klass=None`.
6. **`ValidateDlp`-Methoden** — können in P1 als no-op-Stub bleiben (Validierung
   ist Audit-Funktion, kein Sim-Path).
