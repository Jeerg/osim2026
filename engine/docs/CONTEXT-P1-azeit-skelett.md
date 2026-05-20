# CONTEXT-P1-azeit-skelett

**Phase 1, Modul B5 — OSimAZeit-Skelett für `.otx`-Loadability**

Kontrakt für die **Surface-Level**-Portierung der `OSimAZeit/`-Klassen. Ziel
ist **nicht** die Implementierung der AZ-Domain-Logik (Personalplanung,
Einsatzzeit-Wünsche, Kap-Bed-Berechnung) — diese kommt erst in Phase 5.
Ziel ist **nur**, dass `.otx`-Files mit `ASimulator` als Top-Level-Objekt
in den Sim-Loader geladen werden können, ohne dass die P1-Engine
crasht.

Hintergrund: `test.otx`, `dc1.otx`, `AZ-Tool.otx` (alle in
`OSim2004/Vorstellung04/`) haben **`ASimulator` als Wurzel**. Ohne ASimulator-
Skelett kann der Loader die Datei nicht parsen und das Top-Level-Objekt nicht
instanziieren.

| Klasse | Header (.odh) | P1-Implementierungs-Tiefe |
|---|---|---|
| `ASimulator` | `OSimAZeit/ASimulator.odh` | **Skelett** (Subklasse von `PSimulator` mit 3 Listen, sonst leer) |
| `APerson` | `OSimAZeit/APerson.odh` | **Skelett** (Tag-Klasse, alle Methoden no-op) |
| `AGruppe` | `OSimAZeit/AGruppe.odh` | **Skelett** (Datenmember, keine Methoden) |
| `AAslMehrfachZaz` | `OSimAZeit/AAusloeser.odh` | **Skelett** (Subklasse von `PAusloeser`, ohne AZeit-Logik) |
| `AEinsatzzeitWunsch` | `OSimAZeit/AEinsatzzeitWunsch.odh` | **Skelett** (Datenmember only) |
| `AAufgabe`, `AAszAufgabe` | `OSimAZeit/AGruppe.odh` (inline) | **Skelett** |
| `GAlgZeitscheibe`, `GAlgPeriode`, `GAlgTag` | `OSimAZeit/AGruppe.odh` (inline) | **Out-of-scope** (Workforce-Algorithmus, P5) |

**Skelett heißt:**
- Konstruktor + Datenmember mit Defaults
- Lifecycle-Hooks (`on_sim_begin`, `on_rec_init`) als no-op oder einfache
  Listen-Reinigung
- Sim-Methoden (`ProzWeitergeben`, `OnEinsatzBeginn`, …) als `raise NotImplementedError`
- Keine KPI-Methoden (werden in P5 nachgereicht)
- Listen-Attribute mit `[]` initialisiert (damit der Loader nichts crasht)

---

## ASimulator — Top-Level für Workforce-Sims

**Quelle:** `OSimAZeit/ASimulator.odh` (130 Z.) + `OSimAZeit/ASimulator.cpp` (292 Z.).
**Vererbung:** `ASimulator(PSimulator)`. Concrete.

Strukturell wenig: erweitert `PSimulator` um 3 Listen für Workforce-spezifische
Objekte.

### Datenmember (zusätzlich zu PSimulator)

```
$link AEinsatzzeitWunschLList m_lEinWunsch;   // Einsatzzeit-Wünsche
$link AGruppeLList            m_lGruppe;      // Gruppen
$link AAufgabeLList           m_lAufgabe;     // Aufgaben
```

### Methoden

```cpp
virtual void  OnPropertySheetOpen(OPropertySheet *pps);   // UI — raus

$command void CreateStdGfxModes();   // UI — raus
$command void CreateStdModel();      // Demo-Modell-Erzeugung — optional, raus
```

### Lifecycle

```cpp
$implement ASimulator() {
    m_strIDStdViewer = "SID_ASIM_BMP";    // UI — raus
    CreateStdGfxModes();                   // raus
}

$implement void PostDeSerialize(OArchive &ar, BOOL bDeep) {
    CreateStdGfxModes();                   // raus
}
```

In der Praxis: kein Sim-relevanter Code in `ASimulator.cpp` (alles UI/Init).
Das `OnSimBegin`-Verhalten erbt direkt von `PSimulator`.

### Python-Mapping `ASimulator`

```python
class ASimulator(PSimulator):
    def __init__(self) -> None:
        super().__init__()
        self.m_lEinWunsch: list["AEinsatzzeitWunsch"] = []
        self.m_lGruppe: list["AGruppe"] = []
        self.m_lAufgabe: list["AAufgabe"] = []

    # OnSimBegin/OnSimReset/OnRecInit erben von PSimulator
    # AZeit-spezifische Lifecycle-Logik kommt in P5
```

---

## APerson — Person als Spezial-Ressource

**Quelle:** `OSimAZeit/APerson.odh` (111 Z.).
**Vererbung:** `APerson(PPerson)`. `PPerson` selbst ist in `OSimPro` (Phase-2-
Ressourcen-Klasse, `PPerson(PRessBeleg)`).

**P1-Hinweis**: Da `PPerson` zur Phase-2-Ressourcen-Klasse gehört, hat
`APerson` in P1 keine korrekte Basis. **Empfehlung**: In P1 `APerson` als
`PSimObject`-Skelett implementieren mit Markierung "stubbing PPerson — Phase 2
upgrade needed".

### Enum

```cpp
$enum APersBearVer {
    rbvStandard     = 1200,   // nimmt nächstbesten Prozess
    rbvGlAusloeser            // bevorzugt gleichen Trigger
};
```

### Datenmember

```
$link AGruppe         m_lGruppe;                              // zugeordnete Gruppe
$attr APersBearVer    m_eAPBearbVerhalten = rbvStandard;

// AZeitAlgg.-Eingabe
$attr float           m_fWochenarbeitszeit       = 0.0;       // [h]
$attr float           m_fMaximalArbeitsdauer     = 0.0;
$attr float           m_fMiniimalArbeitsdauer    = 0.0;

// AZeitAlgg.-Zwischenergebnisse
$attr double          m_fBestand_PPZ_Person      = 0.0;
$attr double          m_dtempBestandProTag       = 0.0;
$attr BOOL            m_btempPersMoved           = FALSE;

// Sonstiges
$attr int             m_iPTK_AnzNhtErfWuensche   = 0;          // KPI
$attr int             m_iAnzUebrstunden          = 0;          // Überstunden
$attr CString         m_sBemerkung;
```

### Methoden (alle in P1 als `raise NotImplementedError`)

```cpp
virtual void ProzWartAusloesen();        // Wartende Prozesse triggern
virtual void OnEinsatzBeginn();          // Schicht-Beginn
virtual void OnEinsatzEnde();            // Schicht-Ende
virtual void OnProzBeginn(oprPtProzess oProz);
virtual void OnProzEnde(oprPtProzess oProz);
int  IsRessBelegCon2Knoten(oprPRessBeleg rBeleg, oprPDlplKnoten knoten);
```

### Lifecycle

```cpp
$implement void OnSimBegin(...) {}      // no-op

$implement void OnRecInit(...) {
    if (AfxGetApp()->GetProfileInt("AZeitSim","APerson_AuftrKomp",0) == 1)
        m_eAPBearbVerhalten = rbvGlAusloeser;
}
```

Profile-Setting wird in Python als Konfig-Feld am `ASimulator` modelliert
(siehe Pattern aus B2 für `PDpKaVerteilung`-Setting).

### Python-Mapping `APerson`

```python
class APersBearVer(IntEnum):
    STANDARD     = 1200
    GL_AUSLOESER = 1201

class APerson(PSimObject):    # P1: PSimObject statt PPerson (Phase-2-Klasse)
    def __init__(self, simulator: ASimulator) -> None:
        super().__init__(simulator)
        self.m_lGruppe: AGruppe | None = None
        self.bearb_verhalten: APersBearVer = APersBearVer.STANDARD
        self.wochenarbeitszeit: float = 0.0
        self.maximal_arbeitsdauer: float = 0.0
        self.minimal_arbeitsdauer: float = 0.0
        self.bestand_ppz_person: float = 0.0
        self.tmp_bestand_pro_tag: float = 0.0
        self.tmp_pers_moved: bool = False
        self.ptk_anz_nht_erf_wuensche: int = 0
        self.anz_uebr_stunden: int = 0
        self.bemerkung: str = ""

    # P1: alle Methoden raise NotImplementedError mit klarer P5-Markierung
    def proz_wart_ausloesen(self) -> None:
        raise NotImplementedError("APerson.proz_wart_ausloesen — Phase 5")
    def on_einsatz_beginn(self) -> None:
        raise NotImplementedError("APerson.on_einsatz_beginn — Phase 5")
    def on_einsatz_ende(self) -> None:
        raise NotImplementedError("APerson.on_einsatz_ende — Phase 5")
    def on_proz_beginn(self, proz: PtProzess) -> None:
        raise NotImplementedError("APerson.on_proz_beginn — Phase 5")
    def on_proz_ende(self, proz: PtProzess) -> None:
        raise NotImplementedError("APerson.on_proz_ende — Phase 5")
```

---

## AGruppe — Gruppe als Aggregat

**Quelle:** `OSimAZeit/AGruppe.odh` (359 Z., enthält 6 Klassen inline).
**Vererbung:** `AGruppe(PSimObj)`. Concrete.

Container für eine Gruppe von Personen mit Aufgaben und Kapazitäts-Info.

### Datenmember

```
$link AGruppeCellInfoLList m_lKapInfoList;     // Liste der Kapazitäts-Info-Zellen
$link AGruppeCellInfoLList m_lKundenInfoList;  // Liste der Kunden-Info-Zellen
$link GAlgTagLList         m_lGAlgTagLList;    // Liste mit Tagen (Workforce-Algorithmus)

$attr CString    m_sName;
$attr int        m_iLaenge_PPZ            = 0;      // Personalplanungszeitraum (Tage)
$attr int        m_iLaenge_PAZ            = 0;      // ?
$attr int        m_iBedarf_PAZ            = 0;
$attr int        m_iKernzeitBeginn        = 7;      // Std
$attr int        m_iKernzeitEnd           = 17;     // Std
$attr double     m_dIntLaenge             = 1.0;
$attr float      m_dAbwesenheitsfaktor    = 0.0;
$attr BOOL       m_bUseKundenanzahl       = TRUE;
$attr CString    m_sBemerkung;

$link AAszAufgabeLList m_lAszAufgabeLList;   // Assoziationen zu Aufgaben
```

### Methoden (P1: alle `NotImplementedError`)

```cpp
void ClearList();
void ClearKapList();
void ClearKundenList();
void SetKapString(int x, int y, CString str);
CString GetKapString(int x, int y);
void SetKundenString(int x, int y, CString str);
CString GetKundenString(int x, int y);
void SetCellString(int x, int y, CString str);
CString GetCellString(int x, int y);
void Kap2Kunden();
void Kunden2Kap();
oprGAlgTag GetTag(CTime t);
oprGAlgTag GetTag(int INX);
int GetMaxKapLevelAnTag(oprGAlgTag tag);
int GetBedAusZeitraum();
int GetMaxStundeProWoche(oprAPerson person);
int GetStundeProWoche(oprAPerson person, oprGAlgTag tag);
```

### Lifecycle

```cpp
$implement AGruppe() {
    if (m_simulator != ONULL && !(opr & OID_SERIALIZE))
        m_iLaenge_PPZ = m_simulator->GetSimInDays();
    else
        m_iLaenge_PPZ = 0;
}
```

Beim Konstruktor wird `m_iLaenge_PPZ` aus dem Simulator (`GetSimInDays`)
gefüllt — *außer* beim Deserialisieren (`OID_SERIALIZE`-Flag), dann bleibt
`m_iLaenge_PPZ = 0` und wird vom Persistenz-Stream gesetzt.

### Python-Mapping `AGruppe`

```python
class AGruppe(PSimObject):
    def __init__(self, simulator: ASimulator,
                 is_deserializing: bool = False) -> None:
        super().__init__(simulator)
        self.sName: str = ""
        self.kap_info_list: list[AGruppeCellInfo] = []
        self.kunden_info_list: list[AGruppeCellInfo] = []
        self.galg_tag_list: list[GAlgTag] = []     # P1: leer

        self.laenge_ppz: int = simulator.get_sim_in_days() if not is_deserializing else 0
        self.laenge_paz: int = 0
        self.bedarf_paz: int = 0
        self.kernzeit_beginn: int = 7
        self.kernzeit_end: int = 17
        self.int_laenge: float = 1.0
        self.abwesenheitsfaktor: float = 0.0
        self.use_kundenanzahl: bool = True
        self.bemerkung: str = ""
        self.asz_aufgabe_list: list[AAszAufgabe] = []
```

### Inner Class `AGruppeCellInfo`

Einfache Daten-Klasse (3 Felder):

```cpp
class AGruppeCellInfo : public OBaseObj {
    $attr int     m_iXCord;
    $attr int     m_iYCord;
    $attr CString m_sCellStr;
};
```

```python
@dataclass
class AGruppeCellInfo:
    x_cord: int = 0
    y_cord: int = 0
    cell_str: str = ""
```

---

## AAufgabe + AAszAufgabe

**Quelle:** `OSimAZeit/AGruppe.odh` (inline, Z. 290-356).

Aufgaben + ihre Assoziationen zu Gruppen.

### `AAufgabe`

```
$attr(name) CString m_sName;
$attr int           m_iDurchDauer = 0;       // Durchführungs-Dauer
$attr BOOL          m_bISDirekt   = TRUE;
$attr CString       m_sBemerkung;
```

### `AAszAufgabe` (Assoziation zwischen Gruppe und Aufgabe)

```
$link AAufgabe  m_lAufgabe;
$attr float     m_fProzAnteil = 100.0;   // prozentualer Anteil
```

### Python-Mapping

```python
class AAufgabe(PSimObject):
    def __init__(self, simulator: ASimulator) -> None:
        super().__init__(simulator)
        self.sName: str = ""
        self.durch_dauer: int = 0
        self.is_direkt: bool = True
        self.bemerkung: str = ""

class AAszAufgabe(PSimObject):
    def __init__(self, simulator: ASimulator) -> None:
        super().__init__(simulator)
        self.aufgabe: AAufgabe | None = None
        self.proz_anteil: float = 100.0
```

---

## AAslMehrfachZaz — Workforce-orientierter Auslöser

**Quelle:** `OSimAZeit/AAusloeser.odh` (68 Z.).
**Vererbung:** `AAslMehrfachZaz(PAusloeser)`. Concrete.

Ein Mehrfach-Auslöser mit Workforce-spezifischen Zeitfenstern (Bezugszeitraum,
Gültigkeitstag innerhalb des Bezugszeitraums).

### Datenmember

```
$link PVerteilung   m_lZazVerteil;            // ZAZ-Verteilung
$attr float         m_fZeitraumBegin        = 0.0;   // Beginn innerhalb Bezugszeitraum
$attr float         m_fZeitraumEnd          = 0.0;
$attr float         m_fBezugszeitraum       = 1;     // [Tag]
$attr int           m_iGueltigInBezZeitraum = 0;     // Tag-Offset im Bezugszeitraum

$event(3) void AZeitAuslTriggern(BOOL b);
$event(3) void AWarteschlangePruefen(oprPtTrigger trigger);
```

### Methoden

```cpp
protected:
    int GetBezZeitBegin();
    int GetNextBezZeitBegin();
    int IsTimeOkay(int z);
```

P1: alle als `raise NotImplementedError`.

### Lifecycle

```cpp
$implement void OnSimBegin(...) {
    if (m_iGueltigInBezZeitraum >= 0) {
        int iEventTime = Tag2SZeit(m_fBezugszeitraum) * m_iGueltigInBezZeitraum;
        EvtInsert(EvtAZeitAuslTriggern, oprThis(), iEventTime, FALSE);
    } else {
        EvtInsert(EvtAZeitAuslTriggern, oprThis(), EvtCurrTime(), FALSE);
    }
}
```

**P1-Hinweis**: `OnSimBegin` ist *aktiv* — placed ein Event ein. Das heißt
für P1: wenn ein `AAslMehrfachZaz` in der `.otx` vorkommt, wird ein
`AZeitAuslTriggern`-Event eingeplant, das niemand handhabt → der Event-Loop
crasht. **Lösung für P1**: `AAslMehrfachZaz.OnSimBegin` als no-op
implementieren *oder* ein Stub-Event-Handler bauen, der das Event silent
verbraucht.

### Python-Mapping `AAslMehrfachZaz`

```python
class AAslMehrfachZaz(PAusloeser):
    def __init__(self, simulator: ASimulator) -> None:
        super().__init__(simulator)
        self.zaz_verteil: PVerteilung | None = None
        self.zeitraum_begin: float = 0.0
        self.zeitraum_end: float = 0.0
        self.bezugszeitraum: float = 1.0
        self.gueltig_in_bezzeitraum: int = 0

    def on_sim_begin(self, deep: bool = True) -> None:
        super().on_sim_begin(deep)
        # P1: Skelett — Event-Einplanung deaktiviert
        # Phase 5: echte AZeitAuslTriggern-Mechanik
        pass

    def azeit_ausl_triggern(self, b: bool) -> None:
        raise NotImplementedError("AAslMehrfachZaz.azeit_ausl_triggern — Phase 5")

    def awarteschlange_pruefen(self, trigger: PtTrigger) -> None:
        raise NotImplementedError("AAslMehrfachZaz.awarteschlange_pruefen — Phase 5")
```

---

## AEinsatzzeitWunsch — Skelett

**Quelle:** `OSimAZeit/AEinsatzzeitWunsch.odh` (nicht detailliert gelesen).
**Vererbung:** vermutlich `AEinsatzzeitWunsch(PSimObj)`. Concrete.

Repräsentiert einen Wunsch einer Person zu bestimmten Einsatzzeiten.

### Python-Mapping (Surface-Skelett für P1)

```python
class AEinsatzzeitWunsch(PSimObject):
    """P1-Skelett. Volle Implementierung in Phase 5."""
    def __init__(self, simulator: ASimulator) -> None:
        super().__init__(simulator)
        # Datenmember werden in P5 nach Bedarf ergänzt
```

---

## GAlgZeitscheibe / GAlgPeriode / GAlgTag — Workforce-Algorithmus

**Quelle:** `OSimAZeit/AGruppe.odh` (inline, Z. 28-143).

Klassen für die Kap-Bed-Berechnung am `AGruppe`. Verwendet vom
Workforce-Algorithmus in `AGruppe.m_lGAlgTagLList`.

**P1: Out-of-scope.** Diese Klassen werden in der `.otx` nicht direkt
referenziert (sind Laufzeit-Strukturen, die der Workforce-Algorithmus
selbst aufbaut). Für P1 ignorierbar.

Wenn ein `.otx` doch eines dieser Objekte enthält, kann es in Python als
opaker Dict geladen werden (loader-Skip-Pattern).

---

## Modul-Layout für B5-Code

```
src/osim_engine/azeit/
    __init__.py
    simulator.py         # ASimulator
    person.py            # APerson + APersBearVer-Enum
    gruppe.py            # AGruppe + AGruppeCellInfo
    aufgabe.py           # AAufgabe + AAszAufgabe
    ausloeser.py         # AAslMehrfachZaz
    einsatz_wunsch.py    # AEinsatzzeitWunsch
    galg/                # Out-of-scope für P1
        __init__.py      # (leer in P1)
```

## Phase-1-Reichweite (B5)

**In-Scope (Skelett-Tiefe)**:
- `ASimulator` (3 Listen, sonst leer)
- `APerson` (alle Datenmember, alle Methoden `NotImplementedError`)
- `AGruppe` (alle Datenmember + Konstruktor-Logik mit `GetSimInDays`)
- `AAufgabe` + `AAszAufgabe` (einfache Daten-Klassen)
- `AAslMehrfachZaz` (Datenmember + no-op `on_sim_begin`)
- `AEinsatzzeitWunsch` (leeres Skelett)

**Out-of-scope für P1**:
- `GAlgZeitscheibe`, `GAlgPeriode`, `GAlgTag` und ihre Listen
- Alle AZeit-spezifischen KPI-Methoden
- AZeit-Algorithmus (Personal-Einplanung, Engpass-Erkennung)
- `OnEinsatzBeginn`/`OnEinsatzEnde`-Logik
- Workforce-Trigger-Pipeline (`AZeitAuslTriggern` etc.)

**Validierungs-Ziel von B5**: Eine `.otx`-Datei mit `ASimulator` als Top-Level
+ `AGruppe`/`APerson`-Listen kann in P1 geladen werden, der Sim-Loop läuft
durch die unteren PSimulator-Pläne *ohne* AZeit-Logik zu invoken.

## Offene Punkte für Implementierung

1. **`APerson` erbt von `PPerson`** (in Phase 2). In P1 stub `PPerson` als
   alias für `PSimObject` oder direkt `APerson(PSimObject)` mit Marker-Kommentar:
   ```python
   class APerson(PSimObject):    # FIXME(P2): should be PPerson(PRessBeleg)
       ...
   ```
2. **`.otx`-Parser** muss `ASimulator` als Top-Level-Klassennamen erkennen
   (zusätzlich zu `PSimulator`). Der Spike-Parser (`io/otx_reader.py`)
   nimmt vermutlich beliebige Top-Level-Klassennamen, aber der Mapper
   (`io/otx_mapper.py`) muss die richtige Python-Klasse instanziieren.
3. **Profile-Settings**: 2 Settings tauchen auf (P1 ignorierbar):
   - `"AZeitSim/APerson_AuftrKomp"` → wechselt `APerson.bearb_verhalten`
   - In ASimulator: keine direkten Settings
   → Diese können als Konfig-Felder am `ASimulator` modelliert werden, mit
     Defaults wie in den C++-Profile-Defaults.
4. **AAslMehrfachZaz-Event-Einplanung deaktivieren**: in P1 darf das nicht
   feuern. Methode `on_sim_begin` als no-op überschreiben. Alternativ:
   einen Stub-Event-Handler `azeit_ausl_triggern(b)` einbauen, der das
   Event silent verbraucht. **Empfehlung**: no-op `on_sim_begin`, weil
   sauberer.
5. **`m_strIDStdViewer` und alle UI-Felder**: in Python ersatzlos weg.
6. **`OBaseDocument`-Vererbung von `ASimulatorDoc`**: in Python ohne
   Entsprechung — `ASimulatorDoc` ganz weg.

---

## Übergeordneter Status nach allen 5 Context-Files

Alle 5 Context-Files (B1–B5) decken die **Phase-1-Implementierungs-Oberfläche**
vollständig ab:

| Modul | Klassen-Count | Implementations-Tiefe |
|---|---|---|
| B1 (OSimBase + OFC) | 4 Basis-Klassen + 7 Verteilungs-Subtypen | **Voll** (bit-genaue LCG-Snippets, alle Lifecycle-Methoden) |
| B2 (PPS-Knoten + Plan-Graph) | 5 Hauptklassen + Subtypen | **Voll** (Sim-Loop, kritischer Weg, Kosten-Verteilung) |
| B3 (Transiente Prozesse) | 7 Hauptklassen | **Voll** (DLL-Mechanik, Lifecycle, Join-Counter) |
| B4 (Auslöser + Verteilung + Klassen) | 12 Klassen (Auslöser + Verteilung + Marker) | **Voll** (für 5 von 7 Verteilungen) |
| B5 (AZeit-Skelett) | 9 Klassen | **Surface** (Datenmember + leere Methoden) |

**Was als nächstes kommt (nach B5):**

- Cleanup + Modul-Skelett anlegen (Spike-Reste löschen, neue Modul-Struktur
  laut Plan)
- Implementierung Phase 1 modular nach den Context-Files
- Validierung gegen `test.otx` (1-Knoten) + `dc1.otx` (3 Pläne mit Verzweigung)

Die Context-Files sind die *Wahrheit* für die Phase-1-Implementierung —
bei Unklarheiten während des Codings → erst Context-File konsultieren, dann
ggf. zur C++-Source (Zeilen-Referenzen sind in den Context-Files dokumentiert).
