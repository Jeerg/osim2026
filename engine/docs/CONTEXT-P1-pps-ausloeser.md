# CONTEXT-P1-pps-ausloeser

**Phase 1, Modul B4 — PAusloeser + Subtypen + PVerteilung + PKlasse**

Kontrakt für die Auslöse-Mechanik (wer startet Pläne wann?) + die
PPS-Verteilungs-Bridge zu `OVerteil` + das `PKlasse`-Klassifikations-System
für KPIs.

| Klasse | Header (.odh) | Implementation (.cpp) |
|---|---|---|
| `PAusloeser` (+ Subtypen) | `OSimPro/PAusloeser.odh` | `OSimPro/PAusloeser.cpp` |
| `PVerteilung` (+ 7 Subtypen) | `OSimPro/PVerteilung.odh` | `OSimPro/PVerteilung.cpp` |
| `PVertExtern` | `OSimPro/PVerteilung.odh` | (inline in .odh) |
| `PKlasse` (+ Hierarchie) | `OSimPro/PKlasse.odh` | `OSimPro/PKlasse.cpp` (47 Z., fast leer) |

`PAusloeser` und `PVerteilung` sind `abstract`. `PKlasse` und Sub-Hierarchien
sind reine Tag-Klassen (Marker-Pattern) — die enthalten kein Verhalten außer
`m_sName`.

---

## PAusloeser — Plan-Auslöser (abstrakte Basis)

**Quelle:** `OSimPro/PAusloeser.odh` (372 Z.) + `OSimPro/PAusloeser.cpp` (1906 Z.).
**Vererbung:** `PAusloeser(PSimObj)`. `abstract`.

Verantwortlich für das *Wann* einer Plan-Auslösung. Erzeugt pro Auslösung
einen `PtTrigger`, der dann den Plan startet.

### Statische Member

```cpp
static int s_nNameCounter;   // Counter für Default-Naming
```

### Datenmember

```
$link PTriggerList   m_lTrigger;       // list[PtTrigger] — existierende Trigger
$attr(name) CString  m_sName;
$link PDurchlaufplan m_lDlpl;          // auszulösender Plan
$link PParameterLList m_lParameter;    // Parameter-Liste
$link PEntitaet      m_lEntitaet;      // Phase 4 (Entitäten)
$attr int            m_iMaxWarteZeit = 0;  // max Wartezeit (Phase 5)
$attr int            m_iSollDauer    = 0;  // Soll-Bearbeitungsdauer

// Protokolle
$attr int     m_iPtkBegAusloesungCount     = 0;
$attr int     m_iPtkAusloesungCount        = 0;
$attr int     m_iPtkNichtVerspaetetCount   = 0;
$attr double  m_dPtkDurchlaufzeit          = 0.0;
$attr double  m_dTmpDurchlaufzeit          = 0.0;
$attr int     m_iPtkAnzBearbRessBelegCount = 0;
$attr int     m_iPtkAnzBearbRessBeleg      = 0;
$attr int     m_iTrigCounter               = 0;
$attr int     m_iAbgeCounter               = 0;

      CList<int,int> m_lFertTerminList;   // Fertigstellungs-Termine (für KPI im Zeitintervall)
```

### Sim-Methoden

#### `DlplAusloesen(oTrigger)` (PAusloeser.cpp:51-76)

```cpp
void PAusloeser::DlplAusloesen(oprPtTrigger oTrigger) {
    int szeitbeg, szeitend;

    if (oTrigger->m_iPtkBeginTermin != EvtCurrTime())
        oTrigger->m_iPtkBeginTermin = EvtCurrTime();
    if (oTrigger->m_iPtkSollEndTermin == 0)
        oTrigger->m_iPtkSollEndTermin = oTrigger->m_iPtkBeginTermin + m_iSollDauer;

    // ZstInt-Parameter aus m_lParameter holen
    szeitbeg = m_lParameter->HoleParameterInt("ZstIntBegin", -1);
    szeitend = m_lParameter->HoleParameterInt("ZstIntEnd", -1);
    SetZeitInt(szeitbeg, szeitend);

    // Plan auslösen
    m_lDlpl->DlplAusloesen(oTrigger, ONULL, m_lEntitaet);

    // Protokoll
    if (IsPtk())
        PtkIntervallBegin(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, 1.0, EvtCurrTime());
    if (IsPtk())
        m_iPtkBegAusloesungCount++;
}
```

#### `OnDlplBeendet(oTrigger, oProzDlpl)` (PAusloeser.cpp:82-117)

```cpp
void PAusloeser::OnDlplBeendet(oprPtTrigger oTrigger, oprPtProzess oProzDlpl) {
    POSITION pos = m_lTrigger->Find(oTrigger);
    if (pos == NULL) throw new OException;

    if (IsPtk()) {
        m_iPtkAnzBearbRessBelegCount++;
        m_iPtkAnzBearbRessBeleg += oTrigger->m_iPtkAnzBearbRess;
    }
    int iEvtCurrTime   = EvtCurrTime();
    int iSollEndTermin = oTrigger->m_iPtkSollEndTermin;
    if (IsPtk() && iEvtCurrTime < iSollEndTermin)
        m_iPtkNichtVerspaetetCount++;

    m_lTrigger->RemoveAt(pos);
    oTrigger.Delete();

    if (IsPtk()) m_lFertTerminList.AddTail(EvtCurrTime());
    if (IsPtk()) PtkIntervallEnd(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, 1.0, EvtCurrTime());
    if (IsPtk()) m_iPtkAusloesungCount++;
}
```

**Wichtig**: `OnDlplBeendet` *zerstört* den Trigger. Der Trigger ist also nur
für die Dauer eines Plan-Laufs am Auslöser angehängt.

### KPI-Methoden (P1-Defaults)

Alle deklariert als `virtual`, basisklasse-Default ist im wesentlichen
Aggregat über `m_iPtkAusloesungCount` und `m_dPtkDurchlaufzeit`. Subtypen
können überschreiben.

| Methode | Default (P1) |
|---|---|
| `GetKnzAnzAusloesung()` | `return m_iPtkAusloesungCount` |
| `GetKnzAnzAusloesungZeitInt()` | Schleife über `m_lFertTerminList`, Filter auf `[s_iIntBeginn, s_iIntEnd)` |
| `GetKnzMittlDlfz()` | `m_dPtkDurchlaufzeit / m_iPtkAusloesungCount` (mit /0-Schutz) |
| `GetKnzMittlAnzBearbRessBeleg()` | `m_iPtkAnzBearbRessBeleg / m_iPtkAnzBearbRessBelegCount` |
| `GetKnzZegLiefertermintreue()` | `m_iPtkNichtVerspaetetCount / m_iPtkAusloesungCount * 100` |
| `GetKnzPrioritaet()` | 0 (Default) |
| `GetKnzTerminabweichung()` | (komplex; aus `m_lFertTerminList`) |

### Lifecycle (inline in .odh)

```cpp
$implement PAusloeser(...) {
    m_sName.Format("Ausloeser %d", s_nNameCounter++);
}

$implement void OnSimBegin(...) {
    // alle Trigger löschen (start-clean)
    for (POSITION pos = m_lTrigger->GetHeadPosition(); pos != NULL;)
        m_lTrigger->GetNext(pos).Delete();
    m_lTrigger->RemoveAll();
}

$implement void OnRecInit(...) {
    m_iPtkAusloesungCount    = 0;
    m_iPtkBegAusloesungCount = 0;
    m_dPtkDurchlaufzeit      = 0.0;
    m_dTmpDurchlaufzeit      = 0.0;
    m_iPtkNichtVerspaetetCount = 0;
    m_iTrigCounter           = 0;
    m_iAbgeCounter           = 0;
    m_lFertTerminList.RemoveAll();
}

$implement void OnRecStart(int timeStart, ...) {
    PtkIntervallStart(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, timeStart);
}

$implement void OnRecStop(int timeStop, ...) {
    PtkIntervallStop(m_dPtkDurchlaufzeit, m_dTmpDurchlaufzeit, timeStop);
}
```

### Python-Mapping `PAusloeser`

```python
class PAusloeser(PSimObject):
    _name_counter: ClassVar[int] = 0

    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        cls = type(self)
        cls._name_counter += 1
        self.sName: str = f"Ausloeser {cls._name_counter - 1}"
        self.m_lTrigger: list[PtTrigger] = []
        self.dlpl: PDurchlaufplan | None = None
        self.parameter: dict[str, Any] = {}     # vereinfacht statt PParameterLList
        self.entitaet: Any = None               # Phase 4
        self.max_warte_zeit: int = 0
        self.soll_dauer: int = 0

        # KPI-Akku
        self.m_iPtkBegAusloesungCount = 0
        self.m_iPtkAusloesungCount = 0
        self.m_iPtkNichtVerspaetetCount = 0
        self.m_dPtkDurchlaufzeit = 0.0
        self.m_dTmpDurchlaufzeit = 0.0
        self.m_iPtkAnzBearbRessBelegCount = 0
        self.m_iPtkAnzBearbRessBeleg = 0
        self.m_iTrigCounter = 0
        self.m_iAbgeCounter = 0
        self.fert_termin_list: list[int] = []

    def dlpl_ausloesen(self, trigger: PtTrigger) -> None: ...
    def on_dlpl_beendet(self, trigger: PtTrigger, proz_dlpl: PtProzess) -> None: ...

    # KPIs
    def get_knz_anz_ausloesung(self) -> int: ...
    def get_knz_mittl_dlfz(self) -> float: ...
    # ...
```

---

## PAslEinzel — Einzelner Auslöser zu festem Termin

**Quelle:** `OSimPro/PAusloeser.odh:212-249` + `OSimPro/PAusloeser.cpp:1443-1495`.
**Vererbung:** `PAslEinzel(PAusloeser)`. Phase-1-relevant.

Löst den Plan **genau einmal** zu einem festen Termin aus.

### Datenmember

```
$attr int m_iBeginTermin          = 0;   // Beginntermin (Simzeit)
$attr int m_iPlanZeit             = 0;   // Plan-Zeit des Auftrags
$attr int m_iRealeAuftragsdauer   = 0;   // reale Auftragsdauer

$event(1) void AuslTriggern();
```

### Methoden

#### `AuslTriggern()` — Event-Handler (PAusloeser.cpp:1443-1463)

```cpp
void PAslEinzel::AuslTriggern() {
    if (GetPSimulator()->m_bIsProduktionEnde) return;  // Produktions-Ende → kein Trigger

    oprPtTrigger oTrig = new PtTrigger(GetObjectBase(), m_simulator);
    oTrig->m_iTrigNum = 0;
    oTrig->m_oAusl    = oprThis();
    oTrig->m_oDlpl    = m_lDlpl;
    oTrig->m_iPtkBeginTermin   = EvtCurrTime();
    oTrig->m_iPtkSollEndTermin = EvtCurrTime() + m_iSollDauer;

    m_lTrigger->AddTail(oTrig);
    DlplAusloesen(oTrig);
}
```

#### Lifecycle (inline in .odh)

```cpp
$implement void OnPeriodBegin(BOOL bDeep) {
    // Event für die Einlastung erzeugen, falls Beginntermin in dieser Periode liegt
    if (m_iBeginTermin >= PeriodBegin() && m_iBeginTermin < PeriodEnd())
        EvtInsert(EvtAuslTriggern, oprThis(), m_iBeginTermin);
}
```

#### KPIs

```cpp
double PAslEinzel::GetKnzPlanzeitgrad() {
    if (m_iPlanZeit == 0) return 1;
    return m_iPlanZeit / GetKnzMittlDlfz();
}

double PAslEinzel::GetKnzGuetegrad() {
    if (m_iRealeAuftragsdauer == 0) return 1;
    return m_iRealeAuftragsdauer / GetKnzMittlDlfz();
}

int PAslEinzel::GetKnzPrgAuftragsanzahl() {
    if (s_iIntBeginn == -1 || s_iIntEnd == -1
        || s_iIntBeginn == -86400 || s_iIntEnd == -86400)
        return 1;
    if (!(m_iBeginTermin >= s_iIntBeginn && m_iBeginTermin < s_iIntEnd))
        return 0;
    return 1;
}
```

### Python-Mapping `PAslEinzel`

```python
class PAslEinzel(PAusloeser):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.begin_termin: int = 0
        self.plan_zeit: int = 0
        self.reale_auftragsdauer: int = 0

    def on_period_begin(self, deep: bool = True) -> None:
        super().on_period_begin(deep)
        if self.period_begin <= self.begin_termin < self.period_end:
            self.evt_insert(EVENT_AUSL_TRIGGERN, self, self.begin_termin)

    def ausl_triggern(self) -> None:    # Event-Handler
        if self.p_simulator.is_produktion_ende:
            return
        trigger = PtTrigger(self.simulator, ausl=self, dlpl=self.dlpl)
        trigger.trig_num = 0
        trigger.ptk_begin_termin = self.evt_curr_time
        trigger.ptk_soll_end_termin = self.evt_curr_time + self.soll_dauer
        self.m_lTrigger.append(trigger)
        self.dlpl_ausloesen(trigger)
```

---

## PAslMehrfachZaz — Mehrfach-Auslöser mit ZAZ-Verteilung

**Quelle:** `OSimPro/PAusloeser.odh:339-369` + `OSimPro/PAusloeser.cpp:1858-1900`.
**Vererbung:** `PAslMehrfachZaz(PAusloeser)`. Phase-1-relevant.

Löst den Plan **mehrfach** aus, mit per Verteilung gesamplerter Zwischenankunftszeit (ZAZ).

### Datenmember

```
$link PVerteilung m_lZazVerteil;   // Verteilung der Zwischenankunftszeit
$attr int         m_iTrigCounter = 0;

$event(2) void AuslTriggern();
```

### Methoden

#### `AuslTriggern()` — Event-Handler (PAusloeser.cpp:1858-1885)

```cpp
void PAslMehrfachZaz::AuslTriggern() {
    int iEvtTime;
    if (!GetPSimulator()->m_bIsProduktionEnde) {
        iEvtTime = EvtCurrTime();
        oprPtTrigger oTrig = new PtTrigger(GetObjectBase(), m_simulator);
        oTrig->m_iTrigNum            = m_iTrigCounter++;
        oTrig->m_oAusl               = oprThis();
        oTrig->m_oDlpl               = m_lDlpl;
        oTrig->m_iPtkBeginTermin     = EvtCurrTime();
        oTrig->m_iPtkSollEndTermin   = EvtCurrTime() + m_iSollDauer;
        m_lTrigger->AddTail(oTrig);
        DlplAusloesen(oTrig);
    }

    // Nächste Auslösung einplanen (ZAZ-Sample)
    iEvtTime = EvtCurrTime() + m_lZazVerteil->GetZufallswert();
    if (iEvtTime < EvtCurrTime()) iEvtTime = EvtCurrTime();
    EvtInsert(EvtAuslTriggern, oprThis(), iEvtTime);
}
```

**Wichtig**: Auch bei `m_bIsProduktionEnde` wird der **nächste** Trigger
eingeplant — die Schleife läuft also weiter, nur die Trigger werden nicht
erzeugt. Das ist intentional (sonst würde die Sim-Sequenz divergieren).

#### Lifecycle (inline in .odh)

```cpp
$implement void OnSimBegin(...) {
    m_iTrigCounter = 0;
    // Ersten Trigger sofort einplanen
    EvtInsert(EvtAuslTriggern, oprThis(), EvtCurrTime() + m_lZazVerteil->GetZufallswert());
}
```

### Python-Mapping `PAslMehrfachZaz`

```python
class PAslMehrfachZaz(PAusloeser):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.zaz_verteil: "PVerteilung | None" = None
        self.m_iTrigCounter: int = 0

    def on_sim_begin(self, deep: bool = True) -> None:
        super().on_sim_begin(deep)
        self.m_iTrigCounter = 0
        self.evt_insert(EVENT_AUSL_TRIGGERN, self,
                        self.evt_curr_time + self.zaz_verteil.get_zufallswert())

    def ausl_triggern(self) -> None:
        if not self.p_simulator.is_produktion_ende:
            trigger = PtTrigger(self.simulator, ausl=self, dlpl=self.dlpl)
            trigger.trig_num = self.m_iTrigCounter
            self.m_iTrigCounter += 1
            trigger.ptk_begin_termin = self.evt_curr_time
            trigger.ptk_soll_end_termin = self.evt_curr_time + self.soll_dauer
            self.m_lTrigger.append(trigger)
            self.dlpl_ausloesen(trigger)

        # Nächste Auslösung
        next_time = self.evt_curr_time + self.zaz_verteil.get_zufallswert()
        if next_time < self.evt_curr_time:
            next_time = self.evt_curr_time
        self.evt_insert(EVENT_AUSL_TRIGGERN, self, next_time)
```

---

## Out-of-scope für P1 (PAusloeser-Subtypen)

| Klasse | Phase | Grund |
|---|---|---|
| `ACOAnt` | P5 | Ant-Colony-Optimization |
| `EPAslEntAufExtern` | P5 | Entscheider-Aufgabe extern |

---

## PVerteilung — PPS-Verteilungs-Bridge

**Quelle:** `OSimPro/PVerteilung.odh` (204 Z.) + `OSimPro/PVerteilung.cpp` (275 Z.).
**Vererbung:** `PVerteilung(OSimObj)`. `abstract`.

Bridge zwischen den PPS-Klassen (die `PVerteilung`-Referenzen halten) und der
LCG-basierten `OVerteil` aus B1. Jede `PVerteilung`-Instanz hat einen
*optionalen* `m_lPVertExt`-Pointer auf eine externe Verteilung (eigener LCG-
Keim für Reproducibility).

### Datenmember (Basisklasse)

```
$link PVertExtern m_lPVertExt;   // optional: eigene externe Verteilung
```

### Methoden

```cpp
virtual void   ReduziereVorgabezeit(double prozent);   // default: throw OException
virtual double GetZufallswert() = 0;                    // pure virtual
$observer
virtual double GetMittelwert() = 0;                     // pure virtual
```

### Subtyp-Hierarchie + Implementierungen

#### `PVertKonstant`

```cpp
$attr double m_fKonstante = 0.0;

double PVertKonstant::GetZufallswert()  { return m_fKonstante; }
double PVertKonstant::GetMittelwert()   { return m_fKonstante; }
void   PVertKonstant::ReduziereVorgabezeit(double prozent) {
    m_fKonstante -= (m_fKonstante * prozent) / 100;
}
```

#### `PVertGleich` — Gleichverteilung [min, max]

```cpp
$attr double m_fMinimum = 0.0;
$attr double m_fMaximum = 1.0;

double PVertGleich::GetZufallswert() {
    if (m_lPVertExt != ONULL)
        return m_fMinimum + m_lPVertExt->m_verteil.VertGleich() * (m_fMaximum - m_fMinimum);
    return m_fMinimum + OSimulator::s_verteil.VertGleich() * (m_fMaximum - m_fMinimum);
}

double PVertGleich::GetMittelwert() { return (m_fMaximum + m_fMinimum) / 2; }
```

**Wichtig**: Das Pattern ist *bei allen Subtypen identisch*:
```python
gen = self.ext_vert.lcg if self.ext_vert is not None else self.simulator._distribution_gen
```

#### `PVertNormal`

```cpp
$attr double m_fErwartungsw = 0.0;
$attr double m_fStandardabw = 1.0;

double PVertNormal::GetZufallswert() {
    OVerteil &gen = (m_lPVertExt != ONULL) ? m_lPVertExt->m_verteil : OSimulator::s_verteil;
    return gen.VertNorm(m_fErwartungsw, m_fStandardabw);
}
double PVertNormal::GetMittelwert() { return m_fErwartungsw; }
```

#### `PVertLogNorm`

```cpp
$attr double m_fErwartungsw = 0.0;
$attr double m_fStandardabw = 1.0;
// GetZufallswert: gen.VertLogNorm(ew, sa)
// GetMittelwert : m_fErwartungsw
```

#### `PVertExponential`

```cpp
$attr double m_fErwartungsw           = 0.0;
$attr int    m_iRechtsVerschiebung    = 0;     // hint: type ist int trotz "0.0"-Default
// GetZufallswert: gen.VertExpo(ew, rv)
// GetMittelwert : throw OException (NICHT implementiert!)
```

**Quirk**: `m_iRechtsVerschiebung` ist `int`, aber Default-Wert ist `0.0`
(Compiler convertiert). Das wird beim Sampling als `int` an `VertExpo`
übergeben.

#### `PVertBeta` — out-of-scope für P1 (braucht VertBeta in LCG, kommt erst P5)

```cpp
$attr double m_fUntereGrenze = 0.0;
$attr double m_fObereGrenze  = 0.0;
$attr double m_fAlpha        = 0.0;
$attr double m_fBeta         = 0.0;
// GetZufallswert: gen.VertBeta(ug, og, a, b)
// GetMittelwert : throw
```

#### `PVertBetaPERT` — out-of-scope für P1

Drei Parameter (optimistisch, häufigster, pessimistisch) + drei Compile-Time-
Schalter (`INC_IFIP_VERT_KONSTANT_ZEIT`, `INC_IFIP_VERT_BETA_VERBREITERN`,
`INC_IFIP_VERT_NORM_STD_BETA`, `INC_IFIP_VERT_EXP_STD_BETA`) für IFIP-
Experimente. In P1 nicht relevant. Default-Pfad ruft `VertBetaPERT(häufigster,
optimistisch, pessimistisch)`.

### Lifecycle (inline in .odh)

```cpp
$implement PVerteilung() {}
$implement void OnSimReset() {}    // no-op
```

### Python-Mapping `PVerteilung`-Hierarchie

```python
class PVerteilung(SimObject):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.ext_vert: "PVertExtern | None" = None    # m_lPVertExt

    @property
    def _lcg(self) -> LCG:
        return self.ext_vert.lcg if self.ext_vert is not None else self.p_simulator._distribution_gen

    def reduziere_vorgabezeit(self, prozent: float) -> None:
        raise NotImplementedError

    def get_zufallswert(self) -> float: raise NotImplementedError
    def get_mittelwert(self) -> float:  raise NotImplementedError

class PVertKonstant(PVerteilung):
    konstante: float = 0.0
    def get_zufallswert(self) -> float: return self.konstante
    def get_mittelwert(self) -> float:  return self.konstante
    def reduziere_vorgabezeit(self, prozent: float) -> None:
        self.konstante -= (self.konstante * prozent) / 100

class PVertGleich(PVerteilung):
    minimum: float = 0.0
    maximum: float = 1.0
    def get_zufallswert(self) -> float:
        return self.minimum + self._lcg.vert_gleich() * (self.maximum - self.minimum)
    def get_mittelwert(self) -> float:
        return (self.maximum + self.minimum) / 2

class PVertNormal(PVerteilung):
    erwartungsw: float = 0.0
    standardabw: float = 1.0
    def get_zufallswert(self) -> float:
        return self._lcg.vert_norm(self.erwartungsw, self.standardabw)
    def get_mittelwert(self) -> float: return self.erwartungsw

class PVertLogNorm(PVerteilung):
    erwartungsw: float = 0.0
    standardabw: float = 1.0
    def get_zufallswert(self) -> float:
        return self._lcg.vert_log_norm(self.erwartungsw, self.standardabw)
    def get_mittelwert(self) -> float: return self.erwartungsw

class PVertExponential(PVerteilung):
    erwartungsw: float = 0.0
    rechts_verschiebung: int = 0
    def get_zufallswert(self) -> float:
        return self._lcg.vert_expo(self.erwartungsw, self.rechts_verschiebung)
    def get_mittelwert(self) -> float:
        raise NotImplementedError("PVertExponential.get_mittelwert in C++ throws")
```

---

## PVertExtern — Externe Verteilung mit eigenem LCG

**Quelle:** `OSimPro/PVerteilung.odh:170-194` (inline).
**Vererbung:** `PVertExtern(OSimObj)`. Phase-1-relevant.

Eine `PVertExtern`-Instanz hält einen *eigenen* `OVerteil`-LCG und kann von
mehreren `PVerteilung`-Instanzen referenziert werden. Erlaubt unabhängige
Reproducibility pro Verteilungs-Block.

### Datenmember

```
$attr(name) CString m_sName;
        OVerteil   m_verteil;            // eigener LCG
$attr   double     m_keim         = 1776496601.0;
$attr   double     m_Internerkeim = 1776496601.0;
```

### Lifecycle

```cpp
$implement PVertExtern() {
    m_verteil.ExternerKeim(&m_Internerkeim);   // LCG zeigt auf m_Internerkeim
}

$implement void OnSimReset() {
    m_Internerkeim = m_keim;   // beim Reset auf Initial-Keim zurücksetzen
}
```

### Python-Mapping `PVertExtern`

```python
class PVertExtern(SimObject):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        self.sName: str = ""
        self.keim: float = LCG.STD_KEIM         # Initial-Seed
        self.interner_keim: float = LCG.STD_KEIM
        self.lcg: LCG = LCG()
        # LCG benutzt interner_keim als externen Keim
        self.lcg.use_external_seed(
            get=lambda: self.interner_keim,
            set=lambda v: setattr(self, "interner_keim", v),
        )

    def on_sim_reset(self, deep: bool = True) -> None:
        super().on_sim_reset(deep)
        self.interner_keim = self.keim
```

**Hinweis**: Das löst auch den Punkt aus B1 zu `LCG.use_external_seed` —
hier ist die einzige Aufrufstelle. Closure-Pattern (get/set-Callbacks) ist
sauberer als Backref, weil `PVertExtern` selbst Owner des Seed-Feldes ist.

---

## PKlasse — Klassifikations-System für KPIs

**Quelle:** `OSimPro/PKlasse.odh` (324 Z.) + `OSimPro/PKlasse.cpp` (47 Z., faktisch leer).
**Vererbung:** `PKlasse(OBaseObj)`. Marker-Pattern.

`PKlasse`-Instanzen werden als *Tags* an KPI-Methoden übergeben, um sie auf
bestimmte Zeit-/Kosten-Kategorien zu beschränken (z. B. *nur Rüstzeit*,
*nur Personalkosten*).

### Klassen-Hierarchie

```
PKlasse                       (Basis, m_sName)
├── PKlasseZeit               m_sName = "zeit"
│   ├── PKlZtDurchfuehrung    m_sName = "zeit_durchfuehrung"
│   │   ├── PKlZtRuesten      m_sName = "zeit_ruesten"
│   │   └── PKlZtBearbeiten   m_sName = "zeit_bearbeiten"
│   ├── PKlZtZwischen         m_sName = "zeit_zwischen"
│   │   ├── PKlZtWeitergeben  m_sName = "zeit_weitergeben"
│   │   └── PKlZtLiegen       m_sName = "zeit_liegen"
│   └── PKlZtZusatz           m_sName = "zeit_zusatz"
│       ├── PKlZtStoerung     m_sName = "zeit_stoerung"
│       └── PKlZtNacharbeit   m_sName = "zeit_nacharbeit"
└── PKlasseKosten             m_sName = "kosten"
    ├── PKlKtPersonal         m_sName = "kosten_personal"
    ├── PKlKtBetriebsmittel   m_sName = "kosten_betriebsmittel"
    │   ├── PKlKtBetrFix      m_sName = "kosten_betr_fix"
    │   └── PKlKtBetrVariabel m_sName = "kosten_betr_variabel"
    └── PKlKtMaterial         m_sName = "kosten_material"
        ├── PKlKtTeilewert    m_sName = "kosten_teilewert"
        ├── PKlKtZinssatz     m_sName = "kosten_zinssatz"
        ├── PKlKtBestellung   m_sName = "kosten_bestellung"
        └── PKlKtKaufpreis    m_sName = "kosten_kaufpreis"
```

### Datenmember + Methode

```
$attr(name) CString m_sName;

virtual bool IstInKlasse(oprPKlasse oKlas);    // Hierarchie-Check
```

### `IstInKlasse(otherKlas)` — Hierarchie-Check

`IstInKlasse` prüft, ob `this` *Subklasse oder identisch* zu `otherKlas` ist.
Wird in KPI-Aggregation benutzt: "alle Zeiten, die in die Klasse
`PKlasseZeit` fallen" → iteriere über alle Zeit-KPIs, filter
`zeit.IstInKlasse(PKlasseZeit::ID)`.

**C++-Implementierung** (in `PKlasse.cpp`): nutzt ObjectBase-Reflektion zur
Klassen-Identifizierung. **Python-Mapping**: einfach `isinstance(other_klas)`.

### Phase-1-Reichweite

Für die Sim-Loop-Validierung in P1 reicht `PKlasse` als reine Marker-Klasse.
KPI-Methoden in P1 akzeptieren `klass=None` (= alle Klassen aggregieren).
Die echten Klassifikations-Aggregationen kommen in späteren Phasen, wenn
es mehr Zeit-Komponenten als nur die `Durchfuehrungszeit` gibt.

### Python-Mapping `PKlasse`

```python
class PKlasse:
    sName: ClassVar[str] = ""    # wird in Subklassen überschrieben

    def ist_in_klasse(self, other: type["PKlasse"]) -> bool:
        return isinstance(self, other)

class PKlasseZeit(PKlasse):
    sName = "zeit"
class PKlZtDurchfuehrung(PKlasseZeit):
    sName = "zeit_durchfuehrung"
class PKlZtRuesten(PKlZtDurchfuehrung):
    sName = "zeit_ruesten"
class PKlZtBearbeiten(PKlZtDurchfuehrung):
    sName = "zeit_bearbeiten"
class PKlZtZwischen(PKlasseZeit):
    sName = "zeit_zwischen"
class PKlZtWeitergeben(PKlZtZwischen):
    sName = "zeit_weitergeben"
class PKlZtLiegen(PKlZtZwischen):
    sName = "zeit_liegen"
class PKlZtZusatz(PKlasseZeit):
    sName = "zeit_zusatz"
class PKlZtStoerung(PKlZtZusatz):
    sName = "zeit_stoerung"
class PKlZtNacharbeit(PKlZtZusatz):
    sName = "zeit_nacharbeit"

class PKlasseKosten(PKlasse):
    sName = "kosten"
class PKlKtPersonal(PKlasseKosten):
    sName = "kosten_personal"
class PKlKtBetriebsmittel(PKlasseKosten):
    sName = "kosten_betriebsmittel"
class PKlKtBetrFix(PKlKtBetriebsmittel):
    sName = "kosten_betr_fix"
class PKlKtBetrVariabel(PKlKtBetriebsmittel):
    sName = "kosten_betr_variabel"
class PKlKtMaterial(PKlasseKosten):
    sName = "kosten_material"
class PKlKtTeilewert(PKlKtMaterial):
    sName = "kosten_teilewert"
class PKlKtZinssatz(PKlKtMaterial):
    sName = "kosten_zinssatz"
class PKlKtBestellung(PKlKtMaterial):
    sName = "kosten_bestellung"
class PKlKtKaufpreis(PKlKtMaterial):
    sName = "kosten_kaufpreis"
```

---

## Modul-Layout für B4-Code

```
src/osim_engine/pps/
    ausloeser/
        __init__.py
        base.py              # PAusloeser
        einzel.py            # PAslEinzel
        mehrfach_zaz.py      # PAslMehrfachZaz

src/osim_engine/distributions/
    __init__.py
    pps_verteilung.py        # PVerteilung + 5 P1-Subtypen
    extern.py                # PVertExtern

src/osim_engine/kpi/
    klassen.py               # PKlasse-Hierarchie (alle Subtypen)
```

## Phase-1-Reichweite (B4)

**In-Scope**:
- `PAusloeser` (Basis), `PAslEinzel`, `PAslMehrfachZaz`
- `PVerteilung` (Basis), `PVertKonstant`, `PVertGleich`, `PVertNormal`,
  `PVertLogNorm`, `PVertExponential` (5 von 7)
- `PVertExtern` (eigener LCG mit Reset-Semantik)
- `PKlasse`-Hierarchie als Marker-Klassen-System

**Out-of-scope (spätere Phasen)**:
- `ACOAnt`, `EPAslEntAufExtern` (P5)
- `PVertBeta`, `PVertBetaPERT` (P5, weil VertBeta/VertGamma in LCG erst P5)

## Offene Punkte für Implementierung

1. **`SetZeitInt`-Mechanik** in `PAusloeser.DlplAusloesen`: das setzt die
   statischen `s_iIntBeginn`/`s_iIntEnd` auf `PSimObj`. Aus Sicht der KPIs
   ist das "die aktuelle Zeit-Intervall-Filter". Mehrere Auslöser können sich
   damit gegenseitig überschreiben. **Empfehlung für Python**: nicht als
   statisches Klassenattribut, sondern als Instance-Attribut am `PSimulator`
   modellieren (oder kontext-spezifisch in den KPI-Methoden mitgeben).
2. **`m_lParameter.HoleParameterInt`-API**: in `DlplAusloesen` werden
   `"ZstIntBegin"` und `"ZstIntEnd"` aus `m_lParameter` gelesen. Für P1
   reicht `parameter: dict[str, Any]` am `PAusloeser` mit `get(key, default)`.
3. **Trigger-Lifecycle**: `OnDlplBeendet` zerstört den Trigger
   (`oTrigger.Delete()`). In Python: aus `m_lTrigger` entfernen, das war's.
4. **`EvtAuslTriggern`-Event** in `PAslEinzel`/`PAslMehrfachZaz`: Sub-Time-
   Priority `1` bzw. `2`. Bei Implementierung in `core/event.py` verifizieren,
   dass die `$event(N)`-Annotation einer Event-Priorität entspricht.
5. **`PSimulator.m_bIsProduktionEnde`**: Flag, das in `OnRecInit` auf `FALSE`
   gesetzt wird (aus B2) und durch das `EvtProduktionEnde`-Event hochgeschaltet
   wird. P1-Sim mit `produktion_ende = -1` (Default) → Flag bleibt immer `False`,
   alle Trigger feuern.
6. **`m_iRechtsVerschiebung` in `PVertExponential`**: Type-Mismatch (deklariert
   `int`, Default `0.0`). In Python sauber als `int` halten.
