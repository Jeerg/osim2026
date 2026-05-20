# CONTEXT-P1-osimbase

**Phase 1, Modul B1 — OSimBase + OFC/OVerteil**

Kontrakt für die Portierung von vier C++-Klassen nach Python. Quellen:

| Klasse | Header (.odh) | Implementation (.cpp) |
|---|---|---|
| `OVerteil` (LCG) | `OSim2004/OSimV01(Fj)/inc/OVerteil.h` | `OSim2004/OSimV01(Fj)/OFC/OVerteil.cpp` |
| `OSimObj` | `OSim2004/OSimV01(Fj)/OSimBase/OSimObj.odh` | `OSim2004/OSimV01(Fj)/OSimBase/OSimObj.cpp` |
| `OSimulator` | `OSim2004/OSimV01(Fj)/OSimBase/OSimulator.odh` | `OSim2004/OSimV01(Fj)/OSimBase/OSimulator.cpp` |
| `OVerteilung` + 7 Subtypen | `OSim2004/OSimV01(Fj)/OSimBase/OVerteilung.odh` | `OSim2004/OSimV01(Fj)/OSimBase/OVerteilung.cpp` |

Aus dem Diss-basierten Spike (Commit `5a62d73`) bereits vorhanden und für diese
Phase wiederverwendet: `engine/event_heap.py` (heapq-Wrapper). Wird in
Implementierung in `core/event.py` umgezogen.

## .odh-Syntax — gelesene Tags

Das `.odh`-Format ist die Eingabe des mentor-eigenen Compilers `odhc`. Für die
Portierung relevante Tags:

| Tag | Bedeutung | Mapping nach Python |
|---|---|---|
| `$class X : $public Y` | Klassen-Vererbung | `class X(Y):` |
| `$attr T name=default` | persistentes Attribut mit Default | Python-Field, ggf. Pydantic-Schema am IO-Rand |
| `$opr T m_simulator` | "Operator-Pointer" (Smart-Pointer auf Sim-Objekt) | normale Referenz / `Optional[T]` |
| `$link(stream,delete,create,owner) T m_x` | Owned-Reference mit Lebenszyklus-Bindung | normale Referenz; Lebenszyklus folgt Python-GC |
| `$option llistclass(T,...)` | typisierte Liste auf T | `list[T]` |
| `$observer T meth()` | Read-Only-Methode (kein Side-Effect) | reguläre Methode (Marker ignoriert) |
| `$command T meth()` | UI-Command-fähige Methode | reguläre Methode (UI-Bindung weg) |
| `$dumper`, `$forward`, `$option` | UI- oder Reflektions-Hinweis | meistens ignorierbar |
| `$implement` | Inline-Implementierung in der .odh | direkt in Python-Klasse |
| `$event(N)` | Event-Slot (Listener-fähig) | siehe Listener-Pattern unten |

`OBaseObj`/`OBaseLList` (von `ObjectBase`) erscheinen als Basisklassen. Sie
liefern in C++ Reflektion, Serialisierung und MOP. In Python sind sie ersatzlos
weg — Persistenz nur am IO-Rand via Pydantic + JSON.

---

## OVerteil — PAWLICEK-LCG

**Quelle:** `inc/OVerteil.h` (160 Z.) + `OFC/OVerteil.cpp` (657 Z.).
**Zweck:** Pseudo-Zufallszahlen mit Pawlicek-LCG, daraus alle Verteilungs-
funktionen. Wird in `OSimulator` als statisches Element `s_verteil` gehalten.

### Konstanten

```cpp
#define STD_KEIM (1776496601.0)            // Default-Seed (auch m_keim default)

// in Zufall():
const double AM = 4294967296.0;            // 2^32
const double AA = 6636085.0;
const double X  = 907633385.0;
```

### Datenmember

```cpp
private:
    double  keim_intern;   // interner Keim (Wert)
    double *keim;          // referenziert intern ODER extern (Pointer-Ind.)
    long    anti;          // 0 = regulär, !=0 = antithetisch (Reflection)
protected:
    double Zufall();       // Pawlicek-Step (siehe unten)
```

### Konstruktor

```cpp
OVerteil() {
    keim_intern = STD_KEIM;
    keim = &keim_intern;   // auf internen Keim schalten
    anti = 0;
}
```

### `Zufall()` — der LCG-Step

```cpp
double OVerteil::Zufall() {
    const double AM = 4294967296.0;
    const double AA = 6636085.0;
    const double X  = 907633385.0;
    double wert;

    *keim = fmod(AA * (*keim) + X, AM);  // Pawlicek
    wert  = *keim / AM;                  // → [0,1)
    if (anti) return 1.0 - wert;
    return wert;
}
```

**Bit-genau-Vertrag:** `fmod` mit double-Arithmetik, exakt diese Konstanten,
exakt diese Operationsreihenfolge. Keine `numpy.random`-Substitution.

### Keim-Verwaltung

```cpp
double InternerKeim(double keim_neu = -1.0);
    // schaltet auf internen Keim, gibt alten Wert zurück.
    // keim_neu >= 0.0: setzt neuen Wert. Default -1.0: nur umschalten.

void ExternerKeim(double *keim_extern = NULL);
    // NULL: interner Keim. Sonst: keim zeigt auf übergebene Variable.
    // !! Aufrufer haftet für Gültigkeit des externen Pointers. !!

void NaechsterKeim(long n = 1);
    // Ruft Zufall() n-mal auf (verbrauche Werte).
```

**Python-Mapping**: Pointer-Indirektion über externen Keim ist hier ein
Python-Sonderfall: die einzige Aufrufstelle ist
`OSimulator::OnSimBegin` mit `s_verteil.ExternerKeim(&m_aktKeim)`.
Das heißt: der Simulator pflegt `m_aktKeim` als Instanz-Attribut und der LCG
liest/schreibt es. In Python ersetzbar durch eine Backref: `LCG.seed_owner`
(Referenz auf Simulator), `current_seed` lebt im Simulator. Alternativ:
beim `on_sim_begin` setzt der Simulator `lcg.seed = self.akt_keim`, und nach
jedem Aufruf liest er es zurück.
**Entscheidung folgt in der Implementierung von Phase 1** — Default: separate
Methoden `lcg.use_internal_seed()`, `lcg.use_external_seed(getter, setter)` mit
Closure-Pattern.

### Antithetisch-Schalter

```cpp
long Antithetisch();           // Getter
long Antithetisch(long neu);   // Setter, gibt alten Wert zurück
```

### Verteilungs-Funktionen

```cpp
double VertGleich();              // [0,1] (= Zufall())
double VertGleich(min, max);      // [min,max], min/max ggf. getauscht,
                                  // clamp auf [min,max]

double VertNorm(ew=0.0, sa=1.0);  // Normalverteilung mit Jeerg-Rejection
double VertNormCalc(ew, sa);      // Sum-of-6-Uniforms-Approximation
double VertNorm(ew, sa, min, max);// Abgeschnittene Normal, max 10000 retries

double VertExpo(ew, rv=0.0);      // Exp.-Verteilung, rechtsverschoben

double VertLogNorm(ew, sa);       // sigma=sqrt(ln(sa^2+1));
                                  // lambda=ln(ew)-sigma^2/2;
                                  // return exp(lambda + sigma*VertNorm())

double VertDreieck(da, db, dc);   // Triangle (Liebl 1995, S. 41)
double VertBeta(a, b);            // Beta (via VertGamma)
double VertBeta(ug, og, a, b);    // Beta in [ug, og]
double VertBetaPERT(m, a, b);     // Beta-PERT
double VertGamma(m, k);           // Gamma (Best's algorithm XG, Devroye)

void Shuffle(n, int v[],    init=0);  // Fisher-Yates für int
void Shuffle(n, long v[],   init=0);
void Shuffle(n, double v[], init=0);
```

#### `VertNorm` — Jeerg-Rejection (zwingend bit-genau)

In `OVerteil.cpp` Z. 234–252 hat Jeerg die ursprüngliche Uwe-Implementierung
ersetzt. Original ("nach Uwe", auskommentiert) gibt direkt `VertNormCalc(ew, sa)`
zurück. Jeerg-Variante:

```cpp
double OVerteil::VertNorm(double ew, double sa) {
    double wert;
    int    n = 0;
    while (n < 10000) {
        wert = VertNormCalc(0, sa);  // ew=0 — wichtig!
        n++;
        if (ew * -1 < wert) break;   // d.h. wert > -ew, → wert+ew >= 0
    }
    if (n >= 10000) wert = ew;
    return ew + wert;
}
```

**Effekt:** Rejection-Loop, der Werte mit `ew + wert < 0` verwirft. Bei `ew==0`
wird sofort beim ersten Sample akzeptiert (oder nicht, falls `wert<0`).
**Reproduzierbarkeits-Vertrag**: 1:1 übernehmen, `n=10000`-Grenze nicht ändern.

#### `VertNormCalc` — Sum-of-6-Uniforms (bit-genau)

```cpp
double OVerteil::VertNormCalc(double ew, double sa) {
    double wert = -3.0;
    for (int k = 0; k < 6; k++) wert += VertGleich();  // 6 Calls
    wert *= sqrt(2.0);
    wert *= (wert * wert / 120.0 + 0.975) * sa;
    return (ew == 0.0) ? wert : (ew + ew * wert);      // multiplikativ bei ew!=0
}
```

**Aufruf-Reihenfolge**: pro Sample exakt 6 `VertGleich()`-Calls. Reihenfolge
ist Teil des Reproduzierbarkeits-Vertrags.

#### `VertExpo`

```cpp
double OVerteil::VertExpo(double ew, double rv = 0.0) {
    double wert = 0.0;
    while (wert <= 0.0) wert = Zufall();   // Nullwerte überspringen
    return rv - log(wert) * (ew - rv);
}
```

#### `VertLogNorm`

```cpp
double OVerteil::VertLogNorm(double ew, double sa) {
    if (ew <= 0.0) return 0.0;             // Edge-Case-Schutz
    double sigma  = sqrt(log(sa * sa + 1.0));
    double lambda = log(ew) - sigma * sigma / 2;
    return exp(lambda + sigma * VertNorm());  // re-entrant!
}
```

#### `VertDreieck` (Liebl 1995, S. 41)

```cpp
wert   = VertGleich();
grenze = (db - da) / (dc - da);
if (wert <= grenze)
    return da + sqrt((db - da) * (dc - da) * wert);
else
    return dc - sqrt((dc - db) * (dc - da) * (1 - wert));
```

#### `VertBeta`, `VertBetaPERT`, `VertGamma`

Komplexer (Beta via Gamma, Gamma via Best's Algorithmus). Vollständige
Implementierungen in `OFC/OVerteil.cpp` Z. 420–579. Für Phase 1 *nicht*
benötigt — die `OVerteilung`-Subtypen (siehe unten) nutzen nur Konstant,
Gleich, Norm, NormalGrenz, Expo, LogNorm, ExpVersch.
**Implementierung dieser Methoden auf Phase 5 verschieben** (passt zu
`PEntscheider`-Bedarf in Phase 5).

#### `Shuffle` (Fisher-Yates)

```cpp
for (i = 0; i < n; i++) {
    inx = int(VertGleich(i, n));   // [i, n)
    if (i < inx && inx < n) swap(v[i], v[inx]);
}
```

Drei Overloads für `int[]`, `long[]`, `double[]`. In Python eine Methode mit
generischer Liste.

### Python-Mapping `OVerteil` → `osim_engine.core.distribution.LCG`

```python
class LCG:
    STD_KEIM: ClassVar[float] = 1776496601.0
    AM: ClassVar[float] = 4294967296.0   # 2**32
    AA: ClassVar[float] = 6636085.0
    X:  ClassVar[float] = 907633385.0

    def __init__(self) -> None:
        self._internal_seed: float = self.STD_KEIM
        self._seed_get: Callable[[], float] = lambda: self._internal_seed
        self._seed_set: Callable[[float], None] = self._set_internal
        self._anti: int = 0

    def _set_internal(self, v: float) -> None:
        self._internal_seed = v

    def use_internal_seed(self, new: float | None = None) -> float: ...
    def use_external_seed(
        self,
        get: Callable[[], float],
        set: Callable[[float], None],
    ) -> None: ...
    def naechster_keim(self, n: int = 1) -> None: ...
    def antithetisch(self, neu: int | None = None) -> int: ...

    def zufall(self) -> float:
        s = self._seed_get()
        s = math.fmod(self.AA * s + self.X, self.AM)
        self._seed_set(s)
        wert = s / self.AM
        return 1.0 - wert if self._anti else wert

    def vert_gleich(self, min: float | None = None, max: float | None = None) -> float: ...
    def vert_norm(self, ew: float = 0.0, sa: float = 1.0,
                  min: float | None = None, max: float | None = None) -> float: ...
    def vert_norm_calc(self, ew: float, sa: float) -> float: ...
    def vert_expo(self, ew: float, rv: float = 0.0) -> float: ...
    def vert_log_norm(self, ew: float, sa: float) -> float: ...
    def vert_dreieck(self, da: float, db: float, dc: float) -> float: ...
    # vert_beta*, vert_gamma: erst Phase 5
    def shuffle(self, v: list, init: bool = False) -> None: ...
```

**Test-Fixture** (auf Implementations-Zeit): bekannte Seed-Folge
`STD_KEIM → Zufall() → Zufall() → …` aus C++-Referenz aufzeichnen
(z. B. via kurzes Debugger-Snapshot oder ein Stück Test-Code in der
C++-Codebase compilieren) und in `tests/data/lcg_reference.txt` ablegen.

---

## OSimObj — Basis-Klasse aller Sim-Objekte

**Quelle:** `OSimBase/OSimObj.odh` (420 Z.) + `OSimBase/OSimObj.cpp` (298 Z.).
**Zweck:** Gemeinsame Basis aller Sim-Objekte; hält die Simulator-Referenz und
bietet Delegate-Methoden zu Event-Pool und Periode.

### Datenmember (.odh)

```
$opr   OSimulator       m_simulator;   // Backref zum Simulator
$link  OViewerInfoLList m_lViewInf;    // UI-Viewer-Info — RAUS
```

### Methoden (kategorisiert)

| Kategorie | Methoden | Phase-1-Aktion |
|---|---|---|
| Debug/Dump | `Dump(ODumpContext*)`, `OSimValidate()` | weg (oder optional, kein-op) |
| UI/Persistenz | `Save`, `SaveCpp`, `SaveTxt`, `LoadTxt`, `CreateGfxDesignItem` | **weg** |
| Event-Verwaltung (delegate) | `EvtInsert(event, obj, ezeit [, para])` × 3 Overloads, `EvtDelete(hdl)`, `EvtCurrTime()`, `EvtTime(evt)` | übernehmen als Delegate-Methoden |
| Period-Verwaltung (delegate) | `PeriodNum`, `PeriodBegin`, `PeriodEnd` | übernehmen als Properties |
| Protokoll | `IsPtk`, `PtkPeriod`, `IsSimulating` | übernehmen als Properties |
| Ptk-Helper | `xPtkIntervallBegin/End/Start/Stop` (+ `dbgPtk…`-Varianten in `_DEBUG`) | übernehmen — sind KPI-Sample-Helpers, siehe unten |

### Konstruktor + SetOwner

```cpp
OSimObj(ObjectBase *base, oprOSimulator sim, idType id) { m_simulator = sim; }
void SetOwner(OBaseObj *pOwner, BOOL bDeep) { m_simulator = (OSimulator *)pOwner; }
```

ObjectBase-/`SetOwner`-Mechanik fällt in Python weg. Der Parent (Simulator)
wird per Konstruktor-Argument oder über die Tree-Hierarchie gesetzt.

### Companion-Klassen — alle raus (durch `list` ersetzt)

- `OSimList`, `OSimLList` — typisierte Container mit Simulator-Backref
- `OViewerInfo`, `OViewerInfoLList` — reine UI-Infos
- `OSimObjVirtual` — virtuelle Form (Reflektions-Construct)

### Python-Mapping `OSimObj` → `osim_engine.core.sim_object.SimObject`

```python
class SimObject:
    def __init__(self, simulator: "Simulator") -> None:
        self.simulator = simulator

    # Event-Delegates
    def evt_insert(self, event: MetaEvent, obj: "SimObject",
                   ezeit: int, para: Any = None) -> EventHandle: ...
    def evt_delete(self, hdl: EventHandle) -> None: ...

    @property
    def evt_curr_time(self) -> int:
        return self.simulator.evt_curr_time

    def evt_time(self, hdl: EventHandle) -> int:
        return self.simulator.evt_time(hdl)

    # Period-Delegates
    @property
    def period_num(self) -> int: return self.simulator.period_num
    @property
    def period_begin(self) -> int: return self.simulator.period_begin
    @property
    def period_end(self) -> int: return self.simulator.period_end

    # Protokoll
    @property
    def is_ptk(self) -> bool: return self.simulator.is_ptk
    @property
    def ptk_period(self) -> int: return self.simulator.ptk_period
    @property
    def is_simulating(self) -> bool: return self.simulator.is_simulating

    # KPI-Sample-Helpers (siehe Ptk-Intervall-Verträge unten)
    def ptk_intervall_begin(self, ptk: list[float], tmp: list[float],
                            gfakt: float, ptime: int) -> None: ...
    def ptk_intervall_end(self, ptk: list[float], tmp: list[float],
                          gfakt: float, ptime: int) -> None: ...
    def ptk_intervall_start(self, ptk: list[float], tmp: list[float],
                            ptime: int) -> None: ...
    def ptk_intervall_stop(self, ptk: list[float], tmp: list[float],
                           ptime: int) -> None: ...
```

**Hinweis zu Ptk-Helpern**: C++ nutzt `double&`-Referenzen, was in Python
nicht direkt geht. Optionen: (a) Pass-by-list (length 1), (b) Methode auf
ein State-Objekt das `ptk` und `tmp` als Felder hält (cleaner), (c) Tupel
zurückgeben und der Aufrufer überschreibt. **Empfehlung (b)**: kleine
Dataclass `PtkInterval { ptk: float, tmp: float }`, Methoden mutieren sie.

---

## OSimulator — Event-Loop + Period-Management

**Quelle:** `OSimBase/OSimulator.odh` (310 Z.) + `OSimBase/OSimulator.cpp` (1263 Z.).
**Zweck:** Top-Level-Simulator: Event-Pool, Periode-Vorschub, Lifecycle-Hooks,
Listener-Chain, Zeit-/Datums-Helpers.

### Enum `OSimStatus`

```cpp
enum OSimStatus {
    ssBegin    = 1,   // vor Simulationsbeginn (Initial)
    ssPeriod,         // vor Periodenbeginn
    ssRunning,        // während Periode, Simulation läuft
    ssSuspended,      // während Periode, suspendiert
};
```

### Datenmember (alle Defaults aus .odh übernehmen)

```
$attr CString    m_name        = "Simulationsmodell";
$attr CString    m_sStartDate  = "01.12.2003";   // "DD.MM.YYYY"
$attr CString    m_sEndDate    = "31.12.2003";
$attr int        m_periodNum   = 0;
$attr int        m_periodBegin = 0;              // Sekunden seit Start
$attr int        m_periodLen   = 86400;          // 1 Tag default
$attr int        m_ptkBegin    = 0;              // Protokoll-Start (Simtime)
$attr int        m_ptkEnd      = 0;              // Protokoll-Ende (0 = unbegrenzt)
$attr int        m_ereigBlkSize= 1000;           // Event-Pool-Block
$attr int        m_refreshRate = 1000;           // UI-Refresh (raus)
$attr OSimStatus m_simStatus   = ssBegin;
$attr BOOL       m_isPtk       = FALSE;
$attr int        m_refreshCount= 0;              // UI (raus)
$attr double     m_aktKeim     = 0.0;            // aktueller LCG-Keim
$attr double     m_keim        = 1776496601.0;   // Initial-Seed (= STD_KEIM)

private  time_t                m_timeSum;        // Wall-Clock-Akku
private  EventPoolDll          m_evtPool;        // → heapq in Python
protected OListenerSimulator   *m_listSimHead;   // → list[SimListener]
static   OVerteil              s_verteil;        // → instance attr in Python
```

### Lifecycle (override-points)

```cpp
$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    m_periodNum = 0;
    m_periodBegin = 0;
    s_verteil.ExternerKeim(&m_aktKeim);  // LCG zeigt auf m_aktKeim
    m_aktKeim = m_keim;                   // initiale Belegung
    m_evtPool.Init(m_ereigBlkSize);
    if (m_listSimHead != NULL)
        m_listSimHead->SendSimBegin(m_periodBegin);
}

$implement void OnPeriodBegin(BOOL bDeep) {
    if (IsPtk()) OnRecStart(m_periodBegin, bDeep);
    if (m_listSimHead != NULL)
        m_listSimHead->SendPeriodBegin(m_periodBegin,
                                       m_periodBegin + m_periodLen);
}

$implement void OnPeriodEnd(BOOL bDeep) {
    m_periodNum++;
    m_periodBegin += m_periodLen;
    if (IsPtk()) OnRecStop(m_periodBegin, bDeep);
    if (m_listSimHead != NULL)
        m_listSimHead->SendPeriodEnd(m_periodBegin);
}

$implement void OnPeriodBreak(BOOL bDeep) {
    m_periodNum++;
    m_periodBegin += EvtCurrTime() - m_periodBegin;  // PARTIAL period!
    if (IsPtk()) OnRecStop(m_periodBegin, bDeep);
    if (m_listSimHead != NULL)
        m_listSimHead->SendPeriodBreak(m_periodBegin);
}

$implement void OnSimReset(BOOL bDeep) {
    m_periodNum = 0;
    m_periodBegin = 0;
    if (m_listSimHead != NULL)
        m_listSimHead->SendPeriodReset();
}
```

**Hooks `OnRecInit`/`OnRecStart`/`OnRecStop`** sind in der Basisklasse Stubs
und werden von `PSimulator`/`PDlplKnoten` etc. überschrieben (Phase 1 Modul B2).
Für `OSimulator` selbst genügen leere Default-Implementierungen.

### Commands

#### `Start()` — der Main-Loop

```cpp
void OSimulator::Start() {
    if (m_simStatus == ssBegin) {
        OnSimBegin(this, TRUE);
        m_timeSum = 0;
        m_isPtk = FALSE;
        m_refreshCount = 0;
        m_simStatus = ssPeriod;
    }
    if (m_simStatus == ssPeriod) {
        OnPeriodBegin(TRUE);
        m_refreshCount = 0;
    }
    time(&m_timeSum);
    m_simStatus = ssRunning;

    OSimEreig();
    while (EvtDoNext()) {
        if (m_simStatus == ssSuspended) {
            // Suspended: cleanup + return
            m_timeSum = time(NULL) - m_timeSum;
            EvtDeleteCurr();
            return;
        }
        OSimEreig();
        if (_ODebugIsEreig()) OSimDebug();
        EvtDeleteCurr();
    }

    m_simStatus = ssPeriod;
    OnPeriodEnd(TRUE);
    m_timeSum = time(NULL) - m_timeSum;
}
```

**Wichtige Eigenheiten**:

- `Start()` ist re-entrant über `m_simStatus`. Wird sie auf `ssBegin` aufgerufen,
  läuft Init-Code. Wird sie auf `ssPeriod` aufgerufen (nach `Suspend()`), kein
  Init, sondern PeriodBegin-Hook.
- `Suspend()` setzt `ssSuspended` und ruft `OnPeriodBreak`. Der Loop merkt das
  *erst* beim nächsten Iterations-Anfang, daher kann der aktuelle Event bereits
  ausgeführt sein. Der Suspended-Pfad ruft `EvtDeleteCurr()` für den noch
  unverarbeiteten Event.
- `EvtDoNext()` gibt `FALSE` zurück, wenn der Pool für diese Periode leer ist
  (siehe `EvtDoNext`-Listing unten) — dann fällt der Loop durch zu `OnPeriodEnd`.

#### `Suspend()` / `Reset()`

```cpp
void Suspend() { m_simStatus = ssSuspended; OnPeriodBreak(EvtCurrTime()); }
void Reset()   { m_simStatus = ssBegin;     OnSimReset(TRUE); }
```

### Event-Verwaltung

#### `EvtInsert` (3 Overloads)

```cpp
EHDL EvtInsert(event, obj, ezeit)             { return EvtInsert(event, obj, ezeit, 0); }
EHDL EvtInsert(event, obj, ezeit, oprPara)    { return EvtInsert(event, obj, ezeit, DWORD(para.OPR())); }
EHDL EvtInsert(event, obj, ezeit, DWORD para) {
    if (ezeit < m_periodBegin || ezeit > MAX_EVENT_TIME) throw OException;
    return m_evtPool.Insert(event, obj.OPR(), ezeit, para);
}
```

**Vertrag**: `ezeit` muss `>= periodBegin` sein (sonst Vergangenheits-Event,
Exception). `MAX_EVENT_TIME` ist eine Compile-Konstante (siehe
`EventPoolDll.h` — vermutlich `INT_MAX>>2` oder `0x3FFFFFFF`; **bei
Implementierung verifizieren**).

#### `EvtDoNext` — Pop + Execute

```cpp
BOOL EvtDoNext() {
    if (m_evtPool.IsEmpty(PeriodEnd())) return FALSE;  // Pool leer/nur künftig
    Event *nextEvent = m_evtPool.RemoveFirst();

    // Ptk-Switching basierend auf Event-Zeit:
    if (m_isPtk) {
        if (m_ptkEnd != 0 && nextEvent->m_time >= m_ptkEnd) {
            OnRecStop(m_ptkEnd, TRUE);
            m_isPtk = FALSE;
        }
    } else {
        if (nextEvent->m_time >= m_ptkBegin) {
            if (nextEvent->m_time < m_ptkEnd || m_ptkEnd == 0) {
                m_isPtk = TRUE;
                OnRecInit(TRUE);
                OnRecStart(m_ptkBegin, TRUE);
            }
        }
    }

    nextEvent->Execute();  // dispatch zum Event-Handler
    return TRUE;
}
```

**Ptk-Switching-Vertrag** (kritisch — KPI-Aggregation hängt davon ab):

- Wenn das nächste Event zu `>= m_ptkBegin` liegt und Protokoll noch aus ist,
  wird `m_isPtk = TRUE` gesetzt und `OnRecInit + OnRecStart` ausgelöst.
- Wenn das nächste Event zu `>= m_ptkEnd` liegt (und `m_ptkEnd != 0`), wird
  `OnRecStop` mit `m_ptkEnd` (nicht der Event-Zeit!) ausgelöst und `m_isPtk = FALSE`.
- `m_ptkEnd == 0` → Protokoll läuft ab `m_ptkBegin` unbegrenzt.
- `m_ptkBegin == 0` (Default) → Protokoll startet beim ersten Event (alles).

#### Sonstige Event-Methoden

```cpp
void EvtDelete(EHDL hdl)        { m_evtPool.Delete(hdl); }
void EvtDeleteCurr()            { m_evtPool.DeleteCurr(); }
int  EvtCurrTime() {
    if (!m_evtPool.CurrExists()) return PeriodBegin();   // Edge: vor erstem Event
    return m_evtPool.GetCurr()->m_time;
}
int  EvtTime(EHDL hdl)          { return m_evtPool.Hdl2Ptr(hdl)->m_time; }
int  EvtGetSum/Max/Cur()        // Statistiken aus EventPoolDll
```

### Period-Helpers

```cpp
int  PeriodNum()   { return m_periodNum; }
int  PeriodBegin() { return m_periodBegin; }
int  PeriodEnd()   { return m_periodBegin + m_periodLen - 1; }  // -1!
```

`PeriodEnd` ist `Begin + Len - 1` (inklusive obere Grenze). In Python sauberer
als `period_end = period_begin + period_len` (exklusive) und `is_empty(t) =
heap[0].time >= period_end` — aber **dieser Vertrag muss exakt erhalten
bleiben**, weil Event-Time-Vergleiche darauf basieren.

### Ptk-Verwaltung

```cpp
BOOL IsPtk()       { return m_isPtk; }
int  PtkPeriod() {
    if (m_periodBegin <= m_ptkBegin) return 0;            // noch nicht gestartet
    if (m_ptkEnd != 0 && m_periodBegin >= m_ptkEnd)
        return m_ptkEnd - m_ptkBegin;                     // Protokoll vorbei
    return m_periodBegin - m_ptkBegin;                    // läuft
}
BOOL IsSimulating() { return m_simStatus==ssRunning || m_simStatus==ssSuspended; }
```

### Ptk-Intervall-Helpers (KPI-Aggregation)

```cpp
void xPtkIntervallBegin(double &ptk, double &tmp, double gfakt, int ptime) {
    tmp += gfakt;
    if (IsPtk()) ptk -= gfakt * ptime;
}
void xPtkIntervallEnd(double &ptk, double &tmp, double gfakt, int ptime) {
    if (m_ptkBegin > 0 && tmp <= 0.0 && gfakt > 0) return;  // Jeerg-Edge-Case
    if (IsPtk()) ptk += gfakt * ptime;
    tmp -= gfakt;
}
void xPtkIntervallStart(double &ptk, double &tmp, int ptime) {
    if (tmp != 0.0 && IsPtk()) ptk -= tmp * ptime;
}
void xPtkIntervallStop(double &ptk, double &tmp, int ptime) {
    if (tmp != 0.0 && IsPtk()) ptk += tmp * ptime;
}
```

**Algorithmus-Hinweis** (Jeerg-Kommentar in OSimulator.cpp Z. 842-853):
`tmp` zählt die Anzahl der "negativ aufaddierten Werte, die noch nicht ausgeglichen
sind". Begin und End klammern Zeiträume. Start/Stop sind für Period-Übergänge
(Periode-Begin/-End müssen temp. ausgleichen).

Der Jeerg-Special-Case in `IntervallEnd` (`m_ptkBegin > 0 && tmp <= 0.0 && gfakt > 0`)
fängt einen Bug-Edge in Uwes Implementierung ab, der auftrat wenn die
Protokollierung **nach** Simulationsbeginn startet. Bit-genau übernehmen.

### Zeit-Helpers

```cpp
CTime  *DateStr2CTime(CString date);     // "DD.MM.YYYY" → CTime
CString CTime2DateStr(CTime *date);
int     Date2Simtime(CTime *date);       // Sekunden seit m_sStartDate
CTime  *Simtime2Date(int stime);

int     GetEndOfDay(CTime *date);        // 86400 + GetBeginOfDay
int     GetEndOfDay(int szeit);
int     GetBeginOfDay(CTime *date);
int     GetBeginOfDay(int szeit);
int     GetDaysFromBegin(int szeit);

void    SetSimRange(CTime beg, CTime end);
int     GetSimInDays();
```

**Python-Mapping**: `datetime`/`date` statt `CTime`, kein dynamisches `new`/`delete`.
`DateStr2CTime`-Format: `"DD.MM.YYYY"` (deutsch, mit Punkten).

### Listener — `OListenerSimulator`

```cpp
class OListenerSimulator : public OListener {
    oprOSimulator    m_sim;
    void   Attach(oprOSimulator sim);     // Hängt in Sim's m_listSimHead-Kette
    void   Detach();
    // Sender (iteriert über m_next-Kette):
    void   SendSimBegin(int timeBegin);
    void   SendPeriodBegin(int timeBegin, int timeEnd);
    void   SendPeriodEnd(int timeEnd);
    void   SendPeriodBreak(int timeEnd);
    void   SendPeriodReset();
    void   SendSimEreig();
    // Override-Points (default leer):
    virtual void   OnSimBegin(int timeBegin);
    virtual void   OnPeriodBegin(int timeBegin, int timeEnd);
    virtual void   OnPeriodEnd(int timeEnd);
    virtual void   OnPeriodBreak(int timeEnd);
    virtual void   OnPeriodReset();
    virtual void   OnGfxEvent(int timeCurrent);    // UI — raus
    virtual void   OnSimEreig();
};
```

**Python-Mapping**: einfache Listener-Liste am Simulator (`list[SimListener]`).
Linked-List-Pattern fällt weg. `OnGfxEvent` raus. `OnSimEreig`-Hook (nach jedem
Event) bleibt — wird in Phase 2+ z. B. von Aufzeichnungs-Listenern genutzt.

### Out-of-scope für die Python-Portierung

| C++ | Grund |
|---|---|
| `Save`, `SaveCpp`, `SaveTxt`, `LoadTxt`, `GFX`, `CreateGfxEvent` | UI/Persistenz — durch JSON + Pydantic am IO-Rand ersetzt |
| `DoKonsitenzCheck`, `OSimDebug`, `OSimValidate` | MFC-Debug-Helper; ggf. später als `validate()`-Methode |
| `OBaseObjDoc`-Vererbung | MFC-Doc-Framework — Python hat keine Entsprechung |
| `m_dump`, `m_FileDump`, `m_bFileDump`, `m_stdFileName` | OFC-Dump-Console; ersatz durch normales Logging |
| `m_refreshRate`, `m_refreshCount` | UI-Refresh — raus |
| `m_gfxModes`, `m_currGfxMode` | UI-Grafikmodi — raus |

### Python-Mapping `OSimulator` → `osim_engine.core.simulator.Simulator`

```python
class SimStatus(IntEnum):
    BEGIN     = 1
    PERIOD    = 2
    RUNNING   = 3
    SUSPENDED = 4

class Simulator(SimObject):
    name: str = "Simulationsmodell"
    start_date: str = "01.12.2003"        # "DD.MM.YYYY"
    end_date:   str = "31.12.2003"
    period_num: int = 0
    period_begin: int = 0
    period_len: int = 86400
    ptk_begin: int = 0
    ptk_end:   int = 0
    event_block_size: int = 1000

    sim_status: SimStatus = SimStatus.BEGIN
    is_ptk: bool = False
    seed: float = 1776496601.0            # m_keim
    akt_keim: float = 0.0                 # m_aktKeim

    def __init__(self) -> None:
        super().__init__(simulator=self)   # self-ref
        self._event_pool: EventPool = EventPool()      # → core/event.py
        self._listeners: list[SimListener] = []
        self._distribution_gen: LCG = LCG()
        self._wall_clock_sum: float = 0.0

    # Lifecycle Hooks
    def on_sim_begin(self, deep: bool = True) -> None: ...
    def on_period_begin(self, deep: bool = True) -> None: ...
    def on_period_end(self, deep: bool = True) -> None: ...
    def on_period_break(self, deep: bool = True) -> None: ...
    def on_sim_reset(self, deep: bool = True) -> None: ...
    def on_rec_init(self, deep: bool = True) -> None: ...
    def on_rec_start(self, time: int, deep: bool = True) -> None: ...
    def on_rec_stop(self, time: int, deep: bool = True) -> None: ...

    # Commands
    def start(self) -> None: ...
    def suspend(self) -> None: ...
    def reset(self) -> None: ...

    # Event API
    def evt_insert(self, event: MetaEvent, obj: SimObject,
                   ezeit: int, para: Any = None) -> EventHandle: ...
    def evt_delete(self, hdl: EventHandle) -> None: ...
    def evt_delete_curr(self) -> None: ...
    def evt_do_next(self) -> bool: ...
    @property
    def evt_curr_time(self) -> int: ...
    def evt_time(self, hdl: EventHandle) -> int: ...
    def evt_get_sum(self) -> int: ...
    def evt_get_max(self) -> int: ...
    def evt_get_cur(self) -> int: ...

    # Period
    @property
    def period_end(self) -> int: return self.period_begin + self.period_len - 1

    # Ptk
    @property
    def is_simulating(self) -> bool: return self.sim_status in (SimStatus.RUNNING, SimStatus.SUSPENDED)
    @property
    def ptk_period(self) -> int: ...

    # Zeit
    def date_str_to_seconds(self, date: str) -> int: ...
    def seconds_to_date_str(self, sec: int) -> str: ...
    def end_of_day(self, sec: int) -> int: ...
    def begin_of_day(self, sec: int) -> int: ...
    def days_from_begin(self, sec: int) -> int: ...

    # Listener-Pattern
    def attach_listener(self, l: SimListener) -> None: ...
    def detach_listener(self, l: SimListener) -> None: ...
```

---

## OVerteilung — Verteilungs-Klassen-Hierarchie

**Quelle:** `OSimBase/OVerteilung.odh` (171 Z.) + `OSimBase/OVerteilung.cpp` (105 Z.).
**Zweck:** Polymorphe Verteilungs-Klassen, jede `HoleZufallswert()` delegiert
an `OSimulator::s_verteil` (= `OVerteil`-Instanz).

Vererbung von `OSimObj` — d. h. jede Verteilung hat eine Simulator-Backref
(nutzbar für `s_verteil`-Zugriff).

### Klassen-Hierarchie

```
OVerteilung                              (abstract; wirft OException)
├── OVerteilungKonstant                  (return m_wertBasis)
├── OVerteilungGleich                    (m_wertBasis * VertGleich())
├── OVerteilungNormal                    (VertNorm(m_wertBasis, m_stdAbweich))
│   └── OVerteilungNormalGrenz           (VertNorm(ew, sa, min, max))
├── OVerteilungExponential               (VertExpo(m_wertBasis))
├── OVerteilungLogNormal                 (VertLogNorm(m_wertBasis, m_stdAbweich))
└── OVerteilungExponentialVersch         (VertExpo(m_wertBasis, m_rechtsVersch))
```

### Datenmember pro Subtyp

| Klasse | Attribute (außer ererbtes `m_wertBasis`) |
|---|---|
| `OVerteilung` (Basis) | `double m_wertBasis = 0.0` |
| `OVerteilungKonstant` | — |
| `OVerteilungGleich` | — |
| `OVerteilungNormal` | `double m_stdAbweich = 1.0` |
| `OVerteilungNormalGrenz` | `double m_minGrenze = 0.0; double m_maxGrenze = 100.0` |
| `OVerteilungExponential` | — |
| `OVerteilungLogNormal` | `double m_stdAbweich = 1.0` |
| `OVerteilungExponentialVersch` | `double m_rechtsVersch = 0.0` |

### Implementierungen

```cpp
double OVerteilung::HoleZufallswert()           { throw new OException; return 0.0; }
double OVerteilungKonstant::HoleZufallswert()   { return m_wertBasis; }
double OVerteilungGleich::HoleZufallswert()     { return m_wertBasis * OSimulator::s_verteil.VertGleich(); }
double OVerteilungNormal::HoleZufallswert()     { return OSimulator::s_verteil.VertNorm(m_wertBasis, m_stdAbweich); }
double OVerteilungNormalGrenz::HoleZufallswert(){ return OSimulator::s_verteil.VertNorm(m_wertBasis, m_stdAbweich, m_minGrenze, m_maxGrenze); }
double OVerteilungExponential::HoleZufallswert(){ return OSimulator::s_verteil.VertExpo(m_wertBasis); }
double OVerteilungLogNormal::HoleZufallswert()  { return OSimulator::s_verteil.VertLogNorm(m_wertBasis, m_stdAbweich); }
double OVerteilungExponentialVersch::HoleZufallswert() { return OSimulator::s_verteil.VertExpo(m_wertBasis, m_rechtsVersch); }
```

### Python-Mapping `OVerteilung` → `osim_engine.core.distribution.Distribution`

```python
class Distribution(SimObject):
    wert_basis: float = 0.0

    def hole_zufallswert(self) -> float:
        raise NotImplementedError

class DistributionKonstant(Distribution):
    def hole_zufallswert(self) -> float:
        return self.wert_basis

class DistributionGleich(Distribution):
    def hole_zufallswert(self) -> float:
        return self.wert_basis * self.simulator._distribution_gen.vert_gleich()

class DistributionNormal(Distribution):
    std_abweich: float = 1.0
    def hole_zufallswert(self) -> float:
        return self.simulator._distribution_gen.vert_norm(self.wert_basis, self.std_abweich)

class DistributionNormalGrenz(DistributionNormal):
    min_grenze: float = 0.0
    max_grenze: float = 100.0
    def hole_zufallswert(self) -> float:
        g = self.simulator._distribution_gen
        return g.vert_norm(self.wert_basis, self.std_abweich, self.min_grenze, self.max_grenze)

class DistributionExponential(Distribution):
    def hole_zufallswert(self) -> float:
        return self.simulator._distribution_gen.vert_expo(self.wert_basis)

class DistributionLogNormal(Distribution):
    std_abweich: float = 1.0
    def hole_zufallswert(self) -> float:
        return self.simulator._distribution_gen.vert_log_norm(self.wert_basis, self.std_abweich)

class DistributionExponentialVersch(Distribution):
    rechts_versch: float = 0.0
    def hole_zufallswert(self) -> float:
        return self.simulator._distribution_gen.vert_expo(self.wert_basis, self.rechts_versch)
```

---

## Implementierungs-Hinweise für B1-Code (kommt nach allen Context-Files)

### Modul-Layout

```
src/osim_engine/core/
    __init__.py               # exportiert: SimObject, Simulator, SimStatus,
                              #            EventHandle, MetaEvent, EventPool,
                              #            LCG, Distribution + 7 Subtypen,
                              #            SimListener
    sim_object.py             # SimObject (mit Delegate-Properties)
    simulator.py              # Simulator (= OSimulator) + SimStatus enum
    event.py                  # MetaEvent, Event, EventPool (heapq-basiert)
                              #   → Import aus engine/event_heap.py (vom Spike)
    listener.py               # SimListener (Base) + Mixin
    distribution.py           # Distribution + 7 Subtypen
    lcg.py                    # LCG (= OVerteil)
```

### Test-Strategie

- **LCG-Bit-Genauigkeit**: Referenz-Sequenz aus C++ generieren
  (`OVerteil v; for(i<100) v.VertGleich();`) und in
  `tests/data/lcg_reference_uniform.txt` ablegen. Python-`LCG.vert_gleich()`
  muss exakt diese Werte produzieren.
- **`VertNormCalc`-Bit-Genauigkeit**: ebenfalls als Referenz-Sequenz.
- **`VertNorm`-Rejection**: Test mit `ew = 5.0, sa = 10.0` und festem Seed —
  einige Werte werden verworfen, der angenommene muss identisch sein.
- **Simulator-Smoke-Test**: `start()` mit leerem Event-Pool soll ohne Crash
  durchlaufen und `OnSimBegin → OnPeriodBegin → OnPeriodEnd` aufrufen
  (verifiziert durch Test-Listener).

### Offene Punkte für Implementierung (nicht für jetzt)

1. **`MAX_EVENT_TIME`-Konstante**: in `EventPoolDll.h` nachschauen vor
   Implementierung von `evt_insert` (B1 oder spätestens B2). Wahrscheinlich
   `0x3FFFFFFF`.
2. **Listener-Reihenfolge**: C++-Linked-List hängt neue Listener vorn an
   (`AddListener` returnt neuen Head). Bei `Send*` werden sie *in dieser
   Reihenfolge* benachrichtigt (vorn-nach-hinten). Bei Python-`list[T]`
   nachpflegen: `attach()` macht `insert(0, ...)`.
3. **`m_aktKeim`-Closure-Pattern für LCG**: bei Implementierung entscheiden,
   ob `LCG.use_external_seed(sim)` als Closure oder als Backref umgesetzt wird.
4. **`OnRecInit/Start/Stop`**: in `OSimulator` als no-op definieren, in
   `PSimulator` (B2) wird's überschrieben. Phase 1 kann erst nach B2 vollständig
   getestet werden.
