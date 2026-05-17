# CONTEXT-P1-SUPPLEMENT — Self-flagged Lücken geschlossen

**Stand:** 2026-05-17
**Status:** ergänzt B1 + B2; ersetzt 3 TBD-Marker durch verifizierte C++-Befunde.

Dieses Dokument schließt vier in `REVIEW-REQUEST.md` selbst markierte Lücken in
den Phase-1-Context-Files. Es ist als **Append-Layer** auf B1/B2 zu lesen und
sticht bei Konflikt — die ursprünglichen TBD/Vermutungs-Passagen sind hiermit
ungültig.

| # | Lücke | Schwere | Geschlossen in |
|---|---|---|---|
| 1 | `PDpKnZeitvorgabe`-Familie fehlt | **BLOCKER** | § 1 (ergänzt B2) |
| 2 | `MAX_EVENT_TIME`-Konstante nicht verifiziert | HIGH | § 2 (ersetzt B1 EvtInsert) |
| 3 | `$event(N)`-Sub-Time-Priorität nicht verifiziert | MED | § 3 (ersetzt B1 EvtDoNext + B3 BearbeitEnde) |
| 4 | `PDpKaUebergang.cpp` Sim-Methoden nicht im Detail | MED | § 4 (ergänzt B2) |

Außerdem: § 5 dokumentiert eine **Namens-Korrektur** im porting-plan
(`PDlplKanUebergang` → `PDpKaUebergang`).

---

## § 1 — `PDpKnZeitvorgabe`-Familie (BLOCKER für B2)

**Quelle:** `OSim2004/OSimV01(Fj)/OSimPro/PDpKnZeitvorgabe.cpp` + `.odh`.

`PDpKnZeitvorgabe` ist die abstrakte Basis für alle Zeitvorgabe-Knoten.
**Drei konkrete Subtypen** im selben File; P1-relevant sind `PDpKnKonstant` und
`PDpKnVerteilung`. `PDpKnMenge` + `PDpKnMengeRuesten` sind Phase 4.

### 1.1 Klassen-Hierarchie

```
PDpKnZeitvorgabe     (abstract, extends PDlplKnoten)
├── PDpKnKonstant         konstante Durchführungszeit (m_iDurchfuehrungszeit)
├── PDpKnVerteilung       verteilte Durchführungszeit (m_lVerteil)
├── PDpKnMenge            mengenabhängig (PARAM_MENGE × m_iDfzProEinheit)        [P4]
│   └── PDpKnMengeRuesten     + konstante Rüstzeit (m_iRuestzeit)                [P4]
```

### 1.2 `PDpKnZeitvorgabe` — abstract base

**Header (`PDpKnZeitvorgabe.odh:19-58`):**

```cpp
$class PDpKnZeitvorgabe : $public PDlplKnoten
{
public: // Attribute
$attr  int    m_iZeitRedBeiProzEnde=0;  // % Reduktion bei Produktionsende
$attr  float  m_fZeitstressparameter=0; // Zeitstress (in P1 ignoriert)
$attr  int    m_iErmuedungsparameter=0; // Ermüdung   (in P1 ignoriert)

public: // Protokolle
$attr  int    m_iPtkKumDurchfuehrungszeit=0;
$attr  int    m_iPtkDurchfuehrungszeitCount=0;

public:
$link  PKlasseZeit  m_lKlassZeit;       // Zeitklasse für KPI

public: // Simulation
virtual void  ProzWeitergeben(oprPtProzess oProzOber, oprPEntitaet oEnt);
virtual int   GetDurchfuehrungszeit(oprPtProzess oProz) = 0;  // PURE!

public: // Auswertung
virtual double GetKnzMinDlfz(oprPKlasseZeit oZKlass);

$option simclass, abstract, dllexport(DLL_OPRO);

$implement void OnRecInit(BOOL bDeep) {
    m_iPtkKumDurchfuehrungszeit   = 0;
    m_iPtkDurchfuehrungszeitCount = 0;
}
};
```

**`ProzWeitergeben` — Implementation (`PDpKnZeitvorgabe.cpp:31-69`):**

```cpp
void PDpKnZeitvorgabe::ProzWeitergeben(oprPtProzess oProzOber, oprPEntitaet oEnt)
{
    oprPtProzZeitvorgabe oProz;
    oprPtProzess         head, tail;

    // 1. Prozessobjekt instanziieren und parametrisieren
    oProz = new PtProzZeitvorgabe(GetObjectBase(), m_simulator);
    oProz->m_oKnoten   = oprThis();
    oProz->m_oTrigger  = oProzOber->m_oTrigger;
    oProz->m_oProzOber = oProzOber;
    oProz->m_oEntitaet = oEnt;

    // 2. Debug-Name
    oProz->m_sName = oProzOber->m_sName + "|" + oProz->m_oKnoten->m_sName;

    // 3. Protokoll-Zähler
    m_iPtkProzessCount++;

    // 4. Trigger notifizieren
    oProz->m_oTrigger->OnPrzCreated(oProz);

    // 5. Aktive Ressource? → Prozess in den Prozessspeicher einfügen [P3]
    if (m_lAssozSpeich != ONULL) {
        m_lAssozSpeich->PlatziereProz(oProz);
        return;
    }

    // 6. Phase-1-Pfad: in Knoten-Prozessliste einhängen
    AddProzess(oProz);

    // 7. Bearbeitung initiieren
    if (!BearbeitBeginnen(oProz)) {
        // Fehlschlag → zentrale Warteschlange (FIFO)
        head = GetPSimulator()->m_oWarteSchl->GetHead();
        tail = GetPSimulator()->m_oWarteSchl->GetTail();
        GetPSimulator()->m_oWarteSchl->AddTail(oProz);
    }
}
```

**Phase-1-relevant**: Schritt 5 entfällt (kein `m_lAssozSpeich` bis P3). Die
`head`/`tail`-Variablen in Schritt 7 sind ungenutzt — wirken wie Debug-
Überbleibsel im C++, in Python ersatzlos weg.

`OnPrzCreated` (Schritt 4) ist eine Trigger-Hook; spezifiziert in B3.

### 1.3 `PDpKnKonstant` — konstante Zeit

**Header (`PDpKnZeitvorgabe.odh:97-131`):**

```cpp
$class PDpKnKonstant : $public PDpKnZeitvorgabe
{
$attr  int  m_iDurchfuehrungszeit=0;   // konstante Durchführungszeit
virtual BOOL CheckKonsitenz(ODumpContext *pDump = NULL);
virtual int  GetDurchfuehrungszeit(oprPtProzess oProz);
virtual double GetKnzMinDlfz(oprPKlasseZeit oZKlass);
$option simclass, dllexport(DLL_OPRO);
};
```

**`GetDurchfuehrungszeit` (`PDpKnZeitvorgabe.cpp:172-187`):**

```cpp
int PDpKnKonstant::GetDurchfuehrungszeit(oprPtProzess oProz)
{
    double redWert, erg;

    if (GetPSimulator()->m_bIsProduktionEnde && m_iZeitRedBeiProzEnde > 0) {
        redWert = 1 - double(m_iZeitRedBeiProzEnde) / 100;
        erg = m_iDurchfuehrungszeit * redWert;
        return int(erg);
    }
    // Protokolle für minimale Durchlaufzeit führen
    m_iPtkKumDurchfuehrungszeit  += m_iDurchfuehrungszeit;
    m_iPtkDurchfuehrungszeitCount++;
    return m_iDurchfuehrungszeit;
}
```

**`CheckKonsitenz`** (P1: kann weggelassen werden — `m_iDurchfuehrungszeit > 0`
ist eine Daten-Validierung am IO-Rand, gehört in den `.otx`-Mapper).

### 1.4 `PDpKnVerteilung` — verteilte Zeit

**Header (`PDpKnZeitvorgabe.odh:176-228`):**

```cpp
$class PDpKnVerteilung : $public PDpKnZeitvorgabe
{
$attr  int  m_iVerteilZeit=0;          // aktuell genutzte Verteilzeit
$link(stream,delete)
       PVerteilung m_lVerteil;         // Verteilung für die Durchführungszeit
virtual BOOL CheckKonsitenz(ODumpContext *pDump = NULL);
virtual int  GetDurchfuehrungszeit(oprPtProzess oProz);
virtual double GetKnzMinDlfz(oprPKlasseZeit oZKlass);
$option simclass, dllexport(DLL_OPRO);

$implement void OnSimBegin(oprOSimulator sim, BOOL bDeep) {
    // Profile-Schalter "BerVerteilZuBegin":
    //   0 (Default) → lazy: m_iVerteilZeit = 0, wird in GetDurchfuehrungszeit gezogen
    //   1           → eager: jetzt schon einmal ziehen, > 0 garantiert
    if (AfxGetApp()->GetProfileInt("OSim","m_PDpKnVerteil_BerVerteilZuBegin",0) != 1) {
        m_iVerteilZeit = 0;
    } else {
        m_iVerteilZeit = -1;
        while (m_iVerteilZeit <= 0)
            m_iVerteilZeit = m_lVerteil->GetZufallswert();
    }
}
};
```

**`GetDurchfuehrungszeit` (`PDpKnZeitvorgabe.cpp:374-397`):**

```cpp
int PDpKnVerteilung::GetDurchfuehrungszeit(oprPtProzess oProz)
{
    int    zeit = -1;
    double redWert, erg;

    if (AfxGetApp()->GetProfileInt("OSim","m_PDpKnVerteil_BerVerteilZuBegin",0) != 1) {
        while (zeit <= 0)
            zeit = m_lVerteil->GetZufallswert();
        m_iVerteilZeit = zeit;
    }
    if (GetPSimulator()->m_bIsProduktionEnde && m_iZeitRedBeiProzEnde > 0) {
        redWert = 1 - double(m_iZeitRedBeiProzEnde) / 100;
        erg = m_iVerteilZeit * redWert;
        return int(erg);
    }
    m_iPtkKumDurchfuehrungszeit  += m_iVerteilZeit;
    m_iPtkDurchfuehrungszeitCount++;
    return m_iVerteilZeit;
}
```

**Wichtig**: Die `while (zeit <= 0)`-Schleife ist eine **Rejection**, weil
`OVerteilung::HoleZufallswert()` für manche Verteilungstypen (z. B. Normal mit
extremen Parametern) negative Werte liefern kann. In Python äquivalent —
**nicht** durch `max(0, ...)` ersetzen, das verändert die LCG-Sequenz und
bricht den Reproduzierbarkeits-Vertrag.

### 1.5 Python-Mapping

```python
# src/osim_engine/pps/knoten/zeitvorgabe.py

from abc import abstractmethod
from osim_engine.pps.knoten.base import PDlplKnoten
from osim_engine.distribution import Distribution

class PDpKnZeitvorgabe(PDlplKnoten):
    """Abstract: PDlplKnoten mit Durchführungszeit-Vorgabe."""

    def __init__(self, simulator) -> None:
        super().__init__(simulator)
        self.m_iZeitRedBeiProzEnde = 0
        self.m_iPtkKumDurchfuehrungszeit = 0
        self.m_iPtkDurchfuehrungszeitCount = 0
        self.m_lKlassZeit = None  # Optional[PKlasseZeit]

    @abstractmethod
    def get_durchfuehrungszeit(self, proz) -> int: ...

    def proz_weitergeben(self, proz_ober, ent) -> None:
        from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

        proz = PtProzZeitvorgabe(self.simulator)
        proz.m_oKnoten   = self
        proz.m_oTrigger  = proz_ober.m_oTrigger
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent
        proz.m_sName = f"{proz_ober.m_sName}|{self.m_sName}"

        self.m_iPtkProzessCount += 1
        proz.m_oTrigger.on_prz_created(proz)

        # P3: m_lAssozSpeich-Pfad fehlt hier — in P1 immer Direkt-Pfad
        self.add_prozess(proz)
        if not self.bearbeit_beginnen(proz):
            self.simulator.m_oWarteSchl.add_tail(proz)

    def on_rec_init(self, deep: bool) -> None:
        self.m_iPtkKumDurchfuehrungszeit = 0
        self.m_iPtkDurchfuehrungszeitCount = 0


class PDpKnKonstant(PDpKnZeitvorgabe):
    def __init__(self, simulator) -> None:
        super().__init__(simulator)
        self.m_iDurchfuehrungszeit = 0

    def get_durchfuehrungszeit(self, proz) -> int:
        if (self.simulator.m_bIsProduktionEnde
                and self.m_iZeitRedBeiProzEnde > 0):
            red = 1 - self.m_iZeitRedBeiProzEnde / 100
            return int(self.m_iDurchfuehrungszeit * red)
        self.m_iPtkKumDurchfuehrungszeit  += self.m_iDurchfuehrungszeit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return self.m_iDurchfuehrungszeit


class PDpKnVerteilung(PDpKnZeitvorgabe):
    def __init__(self, simulator) -> None:
        super().__init__(simulator)
        self.m_iVerteilZeit = 0
        self.m_lVerteil: Distribution | None = None

    def on_sim_begin(self, sim, deep: bool) -> None:
        if not self.simulator.pre_compute_kante_verteilung:
            self.m_iVerteilZeit = 0
        else:
            self.m_iVerteilZeit = -1
            while self.m_iVerteilZeit <= 0:
                self.m_iVerteilZeit = self.m_lVerteil.hole_zufallswert()

    def get_durchfuehrungszeit(self, proz) -> int:
        if not self.simulator.pre_compute_kante_verteilung:
            zeit = -1
            while zeit <= 0:
                zeit = self.m_lVerteil.hole_zufallswert()
            self.m_iVerteilZeit = zeit
        if (self.simulator.m_bIsProduktionEnde
                and self.m_iZeitRedBeiProzEnde > 0):
            red = 1 - self.m_iZeitRedBeiProzEnde / 100
            return int(self.m_iVerteilZeit * red)
        self.m_iPtkKumDurchfuehrungszeit  += self.m_iVerteilZeit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return self.m_iVerteilZeit
```

### 1.6 Aufrufer-Vertrag (Cross-Reference)

`GetDurchfuehrungszeit` wird ausschließlich aus
`PtProzZeitvorgabe::BearbeitBeginnen` aufgerufen (siehe B3,
`CONTEXT-P1-pps-prozess.md:393`):

```cpp
m_iZeitinhaltAkt = oprPDpKnZeitvorgabe(m_oKnoten)->GetDurchfuehrungszeit(oprThis());
```

In Python heißt das: der `Cast` auf `PDpKnZeitvorgabe` entfällt, wir rufen
direkt `proz.m_oKnoten.get_durchfuehrungszeit(proz)`. Polymorphismus erledigt
den Rest.

---

## § 2 — `MAX_EVENT_TIME` (HIGH, ersetzt B1 §EvtInsert)

**Quelle:** `OSim2004/OSimV01(Fj)/inc/Event.h:25`.

```cpp
// maximale Ereigniszeit
#define MAX_EVENT_TIME    500000000L
```

**Wert:** `500_000_000` (= 5×10⁸ Sekunden ≈ 16 Jahre Simulationszeit). Die
ursprüngliche Vermutung `0x3FFFFFFF` / `INT_MAX>>2` ist **falsch**.

**Begründung der Wahl** (durch das Sortier-Schema, siehe § 3): in
`EventPoolDll::Init` wird der Tail mit `(MAX_EVENT_TIME << 2)` =
2'000'000'000 initialisiert (`EventPoolDll.cpp:59`), was knapp unter dem
positiven 32-Bit-`int`-Max (`2^31 - 1` = 2'147'483'647) liegt. `500_000_000` ist
also der größte Wert, der zusammen mit dem 2-Bit-`subTime` noch ohne Überlauf
in einen `int` passt.

**B1-Patch**: in `CONTEXT-P1-osimbase.md:560-563` die TBD-Vermutung ersetzen
durch:

> `MAX_EVENT_TIME = 500_000_000L` (Quelle: `inc/Event.h:25`). Konstante in
> Python als Modul-Konstante in `osim_engine.core.event`.

### Python-Mapping

```python
# src/osim_engine/core/event.py
MAX_EVENT_TIME: int = 500_000_000
```

Bei `EvtInsert`:

```python
def evt_insert(self, event, obj, ezeit: int, para: int = 0) -> EHDL:
    if ezeit < self.m_periodBegin or ezeit > MAX_EVENT_TIME:
        raise OSimError(
            f"Event-Zeit {ezeit} außerhalb des Bereichs "
            f"[{self.m_periodBegin}, {MAX_EVENT_TIME}]"
        )
    return self.m_evtPool.insert(event, obj, ezeit, para)
```

---

## § 3 — `$event(N)`-Sub-Time-Priorität (MED, ersetzt B1 §EvtDoNext + B3)

**Quelle:** `inc/Event.h:51-52`, `OSimBase/EventPoolDll.cpp:184-186`,
`ObjectBase/OMetaEvent.cpp`.

### 3.1 Wo `m_subTime` lebt

Auf der `OMetaEvent`-Klasse (`inc/Event.h:51-52`):

```cpp
class DLL_OBASE OMetaEvent
{
public:
    int   m_subTime; // Zeitpunkt (0-3)
    char  *m_name;   // Name des Events
    virtual void  Execute(const OBaseObj *obj, DWORD para) = 0;
    ...
    OMetaEvent();  // Konstruktor setzt m_subTime = 0
};
```

Default in `OMetaEvent::OMetaEvent()` (`ObjectBase/OMetaEvent.cpp:30-34`):

```cpp
OMetaEvent::OMetaEvent() { m_subTime = 0; m_name = ""; }
```

`m_subTime` ist also pro **Event-Typ** (nicht pro Event-Instanz!) — der
`odhc`-Compiler setzt ihn aus der `$event(N)`-Annotation der `.odh`-Quelle.

### 3.2 Wie die Sortierung kodiert wird

In `EventPoolDll::Insert` (`OSimBase/EventPoolDll.cpp:184-186`):

```cpp
/* Zeitpunkt mit einrechnen */
eTime <<= 2;                    // shift left 2 bit  → Platz für subTime
eTime += eMeta->m_subTime;      // subTime (0-3) in untere 2 bit
```

Genial schlicht: Sortier-Zeit ist `(realTime << 2) | subTime`. Eine einzige
`int`-Vergleichs-Operation entscheidet sowohl primäre (Sim-Zeit) als auch
sekundäre Ordnung (Event-Slot). Bei `RemoveFirst` (`EventPoolDll.cpp:258`)
wird `>>= 2` wieder rausgerechnet.

### 3.3 Bei `(time, subTime)`-Gleichheit: FIFO

Die DLL-Such-Logik in `Insert` (`EventPoolDll.cpp:198-225`):

- **Vorwärts** (Pool-Zeit ≤ neue Zeit): `while (next->time <= eTime)` →
  einsortiert **vor dem ersten echt größeren** → FIFO
- **Rückwärts** (Pool-Zeit > neue Zeit): `while (prev->time > eTime)` →
  einsortiert **nach dem letzten ≤ Zeit** → FIFO

**Python-Mapping** (heapq-basiert): Tupel-Key `(combined_time, insert_counter)`
mit `insert_counter` als monoton steigender Tiebreaker:

```python
import heapq
import itertools

_counter = itertools.count()

def insert(self, meta: OMetaEvent, obj, ezeit: int, para: int) -> EHDL:
    combined = (ezeit << 2) | (meta.m_subTime & 0x3)
    entry = (combined, next(_counter), meta, obj, para)
    heapq.heappush(self._heap, entry)
    return id(entry)
```

`m_subTime` als Klassen-Attribut auf der Python-Event-Klasse (nicht pro Instanz):

```python
class EvtBearbeitEnde(OMetaEvent):
    m_subTime = 2   # aus $event(2)
    m_name = "EvtBearbeitEnde"
    def execute(self, obj, para): ...

class EvtUebergangEnde(OMetaEvent):
    m_subTime = 3   # aus $event(3)
    m_name = "EvtUebergangEnde"
    def execute(self, obj, para): ...
```

### 3.4 Bekannte Slot-Belegungen (Konvention)

Aus den gelesenen `.odh`-Files:

| `$event(N)` | Slot | Wer | Wann |
|---|---|---|---|
| `$event(1)` | 1 | `PAslEinzel::AuslTriggern` (B4) | Auslöser-Trigger |
| `$event(2)` | 2 | `PtProzZeitvorgabe::BearbeitEnde` (B3) | Bearbeitungs-Ende |
| `$event(2)` | 2 | `PAslMehrfachZaz::AuslTriggern` (B4) | wiederholter Auslöser |
| `$event(3)` | 3 | `PDpKaUebergang::EvtUebergangEnde` (B2, § 4) | Kanten-Übergang fertig |
| `$event(3)` | 3 | `PDpKaVerteilung::EvtUebergangEnde` (B2) | Verteil-Kanten-Übergang fertig |
| `$event(3)` | 3 | `PSimulator::ProduktionEnde` (B2) | globaler Produktions-Endezeitpunkt |
| `$event(3)` | 3 | `ASimulator::AZeitAuslTriggern` / `AWarteschlangePruefen` (B5) | AZeit |

**Lesart**: niedrigere Slot-Nummer = höhere Priorität. Bei zeitgleichen
Events feuern Auslöser (1) vor Bearbeitungs-Enden (2) vor Übergangs-Enden (3).
Slot 0 ist Default (z. B. für Ad-Hoc-Events ohne `$event(N)`-Annotation).

**B1-Patch**: in `CONTEXT-P1-osimbase.md` und B3 die TBD-Vermutungen zu
`$event(N)` durch obigen Mechanismus ersetzen.

---

## § 4 — `PDpKaUebergang` Sim-Methoden im Detail (MED, ergänzt B2)

**Quelle:** `OSimPro/PDlplKante.cpp:766-843` + `.odh:286-320`.

`PDpKaUebergang` (Kante mit fester Übergangszeit) ist neben `PDpKaVerteilung`
für P1 ausreichend. Die Sim-Methoden waren in B2 nur durch Felder + Methoden-
Signaturen umrissen; hier die vollständige Logik.

### 4.1 Spiegelprozess-Pattern (zentral)

**`PDpKaUebergang::ProzWeitergeben` (`PDlplKante.cpp:775-803`):**

```cpp
void PDpKaUebergang::ProzWeitergeben(oprPtProzess oProz, oprPEntitaet oEnt)
{
    oprPtProzess oSpiegelProz;

    if (!IsStartKante()) {
        // Spiegelprozess erzeugen, weil oProz gleich gelöscht wird
        oSpiegelProz = oprPtProzess(oProz->ClassMeta()->New(GetObjectBase()));
        oSpiegelProz->m_eStatus   = oProz->m_eStatus;
        oSpiegelProz->m_oAktor    = oProz->m_oAktor;
        oSpiegelProz->m_oKnoten   = oProz->m_oKnoten;
        oSpiegelProz->m_oTrigger  = oProz->m_oTrigger;
        oSpiegelProz->m_oProzOber = oProz->m_oProzOber;
        oSpiegelProz->m_oEntitaet = oProz->m_oEntitaet;

        oSpiegelProz->m_sName = oProz->m_sName + "(Gespiegelt|PDpKaUebergang)";

        if (oSpiegelProz->m_oEntitaet == ONULL)
            oSpiegelProz->m_oEntitaet = oEnt;
        if (oSpiegelProz->m_oEntitaet != oEnt)
            throw new OException;

        EvtInsert(EvtEvtUebergangEnde, oprThis(),
                  EvtCurrTime() + m_iUebergangszeit, oSpiegelProz);
        m_lProzesse->AddTail(oSpiegelProz);
    }
    else {
        // Startkante: Original-Prozess bleibt, kein Spiegel nötig
        EvtInsert(EvtEvtUebergangEnde, oprThis(),
                  EvtCurrTime() + m_iUebergangszeit, oProz);
        m_lProzesse->AddTail(oProz);
    }
}
```

**Warum Spiegel?** Im Nicht-Startkanten-Fall liegt `oProz` an einem Knoten
und wird gleich nach der Weitergabe gelöscht (durch
`PDlplKnoten::OnProzBeendet → PtProzess.Delete()`). Wir brauchen aber für die
Dauer der Übergangszeit eine eigene Prozess-Referenz — den Spiegel. Bei
Startkanten existiert der Original-Prozess noch nicht im Pool und wird nicht
gelöscht; dort reicht der Original.

**`PDpKaUebergang::EvtUebergangEnde` (`PDlplKante.cpp:806-827`):**

```cpp
void PDpKaUebergang::EvtUebergangEnde(oprPtProzess oProz)
{
    POSITION pos;

    // Prozess aus der Übergangs-Liste raus
    pos = m_lProzesse->Find(oProz);
    if (pos != NULL)
        m_lProzesse->RemoveAt(pos);
    else
        throw new OException();   // muss da sein!

    m_iKummUebergangszeit += m_iUebergangszeit;

    // an die Basisklasse (Routing-Logik mit PtVerknuepfung-Join-Counter)
    PDlplKante::ProzWeitergeben(oProz, oProz->m_oEntitaet);

    if (!IsStartKante())
        oProz.Delete();  // Spiegelprozess freigeben
}
```

### 4.2 Reihenfolge der Aufrufe (Sequenz)

```
PDlplKnoten X.OnProzBeendet(oProz)
└─ X.m_lKanteAus.ProzWeitergeben(oProz, oProz.m_oEntitaet)   ← Basis: PDlplKante
   └─ (wenn Kante == PDpKaUebergang:) overridden!
      ├─ erzeuge oSpiegel
      ├─ EvtInsert(EvtUebergangEnde, kante, currTime + ubg, oSpiegel)  [$event(3)]
      └─ m_lProzesse.AddTail(oSpiegel)
[ Sim-Loop pumpt Zeit weiter, andere Events ]
... bei currTime + ubg :
EvtUebergangEnde(oSpiegel)
├─ m_lProzesse.Remove(oSpiegel)
├─ m_iKummUebergangszeit += m_iUebergangszeit
├─ PDlplKante::ProzWeitergeben(oSpiegel, ent)                ← BASIS, nicht override!
│  └─ Join-Counter / Routing zum Nachfolger-Knoten
└─ oSpiegel.Delete()
```

**Wichtig**: Der zweite Aufruf nutzt explizit `PDlplKante::ProzWeitergeben`
(Basisklassen-Methode), **nicht** rekursiv `PDpKaUebergang::ProzWeitergeben`.
Sonst würde jede Übergangs-Beendigung eine neue Übergangs-Planung auslösen
(unendliche Rekursion). In Python: `super().proz_weitergeben(proz, ent)`.

### 4.3 Python-Mapping

```python
# src/osim_engine/pps/kante/uebergang.py

from osim_engine.pps.kante.base import PDlplKante
from osim_engine.core.event import OMetaEvent

class EvtUebergangEnde(OMetaEvent):
    m_subTime = 3       # $event(3)
    m_name = "EvtUebergangEnde"

    def execute(self, kante: "PDpKaUebergang", proz) -> None:
        kante.evt_uebergang_ende(proz)


class PDpKaUebergang(PDlplKante):
    def __init__(self, simulator) -> None:
        super().__init__(simulator)
        self.m_iUebergangszeit = 0
        self.m_iKummUebergangszeit = 0

    def on_rec_init(self, deep: bool) -> None:
        self.m_iKummUebergangszeit = 0

    def proz_weitergeben(self, proz, ent) -> None:
        if not self.is_start_kante():
            spiegel = self._make_spiegel(proz, ent, suffix="PDpKaUebergang")
            target_proz = spiegel
        else:
            target_proz = proz

        self.simulator.evt_insert(
            EvtUebergangEnde, self,
            self.simulator.evt_curr_time() + self.m_iUebergangszeit,
            target_proz,
        )
        self.m_lProzesse.append(target_proz)

    def evt_uebergang_ende(self, proz) -> None:
        if proz not in self.m_lProzesse:
            raise OSimError("EvtUebergangEnde: Prozess nicht in m_lProzesse")
        self.m_lProzesse.remove(proz)
        self.m_iKummUebergangszeit += self.m_iUebergangszeit

        # Basis-Routing (Join-Counter + Weitergabe an Nachfolger):
        super().proz_weitergeben(proz, proz.m_oEntitaet)

        if not self.is_start_kante():
            del proz   # Spiegelprozess freigeben

    def _make_spiegel(self, proz, ent, suffix: str):
        cls = type(proz)
        spiegel = cls(self.simulator)
        for attr in ("m_eStatus", "m_oAktor", "m_oKnoten",
                     "m_oTrigger", "m_oProzOber", "m_oEntitaet"):
            setattr(spiegel, attr, getattr(proz, attr))
        spiegel.m_sName = f"{proz.m_sName}(Gespiegelt|{suffix})"
        if spiegel.m_oEntitaet is None:
            spiegel.m_oEntitaet = ent
        if spiegel.m_oEntitaet is not ent:
            raise OSimError("Entitäts-Mismatch beim Spiegeln")
        return spiegel


class PDpKaVerteilung(PDlplKante):
    """Identische Struktur zu PDpKaUebergang, nur m_lVerteil statt fester
    m_iUebergangszeit. Siehe PDlplKante.cpp:929-992. Spiegel-Mechanik identisch.
    """
```

**KPIs** (`PDlplKante.cpp:834-843`):

```python
def get_knz_min_dlfz(self, z_klass) -> float:
    return float(self.m_iUebergangszeit)

def get_knz_sum_zeit(self, z_klass) -> float:
    return float(self.m_iKummUebergangszeit)
```

---

## § 5 — Namens-Korrektur: `PDlplKanUebergang` → `PDpKaUebergang`

**Befund**: Der `porting-plan.md` (Z. 209, 313, 401) und `REVIEW-REQUEST.md`
verwenden den Namen `PDlplKanUebergang`. Im C++-Code heißt die Klasse aber
**`PDpKaUebergang`** (Convention: `PDpKn*` = DurchlaufplanKnoten-Subtypen,
`PDpKa*` = DurchlaufplanKante-Subtypen).

| Falscher Name | Korrekter Name | Datei |
|---|---|---|
| `PDlplKanUebergang` | `PDpKaUebergang` | porting-plan.md (3 Vorkommen) |

In B2 (`CONTEXT-P1-pps-knoten.md`) ist der Name bereits korrekt.

**Folge-Aktion**: porting-plan.md wird in diesem Commit ebenfalls gepatcht.

---

## Was Codex prüfen sollte (Delta zum ursprünglichen REVIEW-REQUEST)

Diese 4 Lücken sind hiermit geschlossen. Übrig im REVIEW-REQUEST für Codex:

- **Heikle Stelle 1** (PAWLICEK-LCG): unverändert offen — Codex soll Konstanten,
  Operatoren-Reihenfolge in `Zufall()`, Box-Müller-Polynom verifizieren
- **Heikle Stelle 2** (Sim-Loop): Ptk-Switching-Bedingungen, `OnPeriodBreak`-
  Semantik — offen
- **Heikle Stelle 3** (Prozess-Logik): Counter-Reihenfolge in `BearbeitBeginnen`,
  `m_iPtkAusloesungCount` vs. `m_iPtkBegAusloesungCount`-Asymmetrie — offen
- **Heikle Stelle 4** (Plan-Ende-Pfade): vollständig? Top-Level-ohne-Trigger? —
  offen
- **Heikle Stelle 5** (Join-Counter): Off-by-one in `m_iAnzProz = count - 1` —
  offen
- **Heikle Stelle 6** (Kritischer Weg + Kosten): Memoization-Korrektheit, Zyklus-
  Schutz, gleiche Kostenverteilung — offen
- **Heikle Stelle 7** (Listener): intrusive list → `list[T]`-Mapping,
  Notifikations-Reihenfolge — offen
- **Heikle Stelle 8** (LList-Companion): was geht durch `list[T]` verloren — offen
- **Meta-Fragen 1-5** (Phase-Schnitt, Option B, dataclasses, AZeit-Skelett,
  Test-Daten) — offen

LOW-Lücken (`GetPrgVblSystemZeit`, `FillKnzList`, `ValidateDlpRek`,
`PSimulator.cpp` selektiv gelesen, Listener-Reihenfolge in
`PListenerDlplKnoten`/`KanteListener`) bleiben absichtlich offen — sind
Audit/Validierungs-Funktionen, kein Sim-Path.

---

## § 6 — Architektur-Entscheidungen (Stand 2026-05-17, post-Diskussion)

Nach der Diskussion am 2026-05-17 sind die folgenden Architektur-Punkte
entschieden. Sie ergänzen die fünf Entscheidungen aus `porting-plan.md`
(Sektion "Entscheidungen 2026-05-15") und gehen ihnen bei Konflikt vor.

### 6.1 Listener-Mechanik — `list[Listener]`

C++ nutzt intrusive linked list (`m_lstHead → m_next → ...`). Python-Mapping:
**ein `list[Listener]` pro beobachtbarem Objekt**, mit Insert-at-Head bei
`attach()` und Removal bei `detach()`.

```python
class SimObject:
    def __init__(self) -> None:
        self._listeners: list[Listener] = []

    def _attach_listener(self, listener: Listener) -> None:
        self._listeners.insert(0, listener)  # insert-at-head, wie C++ AddListener

    def _detach_listener(self, listener: Listener) -> None:
        self._listeners.remove(listener)

    def _notify(self, method_name: str, *args, **kwargs) -> None:
        # Kopie iterieren, damit Self-Detach während Notifikation nicht bricht
        for l in list(self._listeners):
            getattr(l, method_name)(*args, **kwargs)
```

**Verworfen**: `WeakSet[Listener]` (Auto-Cleanup), weil unordered → bricht
FIFO-Notifikations-Reihenfolge. `WeakValueDictionary` als geordnete WeakRef-
Alternative ist Komplexität ohne klaren Nutzen — Sim-Objekte haben in OSim
klare Lebenszyklen, kein Leak-Risiko.

### 6.2 Event-Pool — `heapq` + Lazy-Delete-Tombstones

C++ hat zwei Implementierungen (`EventPoolDll`, `EventPoolHeap`); Default
war `EventPoolDll`. Beide implementieren `Insert/RemoveFirst/Delete(hdl)`.

Python-Mapping: **`heapq` mit Tombstone-Pattern für `Delete(hdl)`**:

```python
import heapq, itertools

class EventPool:
    def __init__(self) -> None:
        self._heap: list = []                          # heap of (combined_time, counter, entry)
        self._counter = itertools.count()
        self._tombstones: set[int] = set()             # entry-IDs, die als gelöscht markiert sind

    def insert(self, meta, obj, ezeit: int, para=0) -> int:
        combined = (ezeit << 2) | (meta.m_subTime & 0x3)
        counter = next(self._counter)
        entry = _EventEntry(meta=meta, obj=obj, para=para, time=ezeit, deleted=False)
        heapq.heappush(self._heap, (combined, counter, entry))
        return id(entry)

    def remove_first(self):
        while self._heap:
            combined, _, entry = heapq.heappop(self._heap)
            if not entry.deleted:
                self._curr = entry
                return entry
        return None

    def delete(self, hdl: int) -> None:
        # Marker setzen; heap-Eintrag bleibt, wird bei remove_first übersprungen
        # (Lookup über schwache Referenz-Map id→entry, hier vereinfacht)
        ...
```

**Begründung**: O(log n) Push/Pop, O(1) Delete (Tombstone), kein Extra-
Dependency. Tombstone-Wachstum ist unkritisch, weil OSim nur sehr selten
`Delete(hdl)` aufruft (typisch: nur bei Suspend/Reset).

**Verworfen**: `sortedcontainers.SortedList` (Extra-Dep, kein Geschwindigkeits-
gewinn für unser Profil); eigene DLL-Implementierung (O(n) Insert wegen
Linear-Search, schlechter als heapq).

### 6.3 `s_verteil` — Modul-Singleton (User-Entscheidung)

C++: `static OVerteil OSimulator::s_verteil;` — eine Instanz pro Prozess.

**Entscheidung**: 1:1-Treue zum C++. Modul-Singleton in
`osim_engine.core.distribution`:

```python
# src/osim_engine/core/distribution.py

from osim_engine.core.overteil import OVerteil

STD_KEIM: int = 1776496601

# Modul-Singleton — entspricht C++ static OSimulator::s_verteil
s_verteil: OVerteil = OVerteil(STD_KEIM)


def reset_keim(neuer_keim: int = STD_KEIM) -> None:
    """Setzt den globalen LCG-Keim zurück. Aufgerufen aus Simulator.reset()."""
    s_verteil.set_keim(neuer_keim)
```

Alle Verteilungs-Subtypen rufen `from osim_engine.core import distribution;
distribution.s_verteil.vert_gleich()` o. ä. auf — exakt wie C++
`OSimulator::s_verteil.VertGleich()`.

**Konsequenz** (bewusst akzeptiert): Multi-Sim-Parallelität nur via
`multiprocessing` (jeder Subprozess hat eigenes Modul-Singleton).
`threading`/`asyncio`-Parallelität von mehreren Simulator-Instanzen im selben
Prozess würde den globalen LCG-State teilen → nicht reproduzierbar.

**Test-Isolation in pytest**: `conftest.py` mit Fixture, die nach jedem Test
`distribution.reset_keim(STD_KEIM)` aufruft. Damit bleibt jeder Test
deterministisch.

### 6.4 Implementierungs-Schnitt — vertikale Slices V1–V5 + C0-S vorab

**Verworfen**: der ursprünglich vorgeschlagene horizontale Schnitt
C0–C11 (siehe `porting-plan.md` Sektion "Konkreter erster Schritt"). Big-
Bang-Risiko: Schichten-Grenzen-Bugs werden erst bei C11 End-to-End-Test
sichtbar.

**Gewählt**: ein **Stochastik-Fundament vorab**, dann **fünf vertikale
Slices**, jeder lauffähig gegen ein progressiv komplexeres `.otx`. Bei
Divergenz weiß man sofort, welcher Slice sie verursachte.

```
C0-S    Stochastik-Fundament (1-3 Tage)
          OVerteil-LCG bit-genau (C++-Code 1:1, Modul-Singleton in
          osim_engine.core.distribution)
          + 7 OVerteilung-Subtypen (Konstant/Gleich/Normal/NormalGrenz/
            Expo/LogNormal/ExpVersch)
          Tests: bit-genau gegen Mini-C-Programm-Output (siehe DIFFTEST.md)

V1      "Triviale Sim" (3-5 Tage)
          OSimObj + Listener-Basis
          + OSimulator (Event-Loop, Period-Mechanik, Status-FSM)
          + minimaler PSimObj/PSimulator (4 von 12 Listen aktiv)
          + 1 fest gemockter PDpKnKonstant (kein Polymorphismus)
          + PtProzZeitvorgabe + PAslEinzel (1 Auslösung, 1 Knoten, kein Plan-Graph)
          Test: 1-Knoten-Smoke, Event-Loop läuft 1 Tag durch ohne Crash
          Diff: Hand-Trace gegen Papier-Rechnung
                + EventPool-Sortierung gegen Unit-Test

V2      "Plan-Graph" (3-5 Tage)
          + PDlplKnoten (Polymorphismus aktiv)
          + PDpKnZeitvorgabe-Familie (Konstant + Verteilung)
          + PDurchlaufplan + PDlplKante + PDpKaUebergang
          + PtProzDurchlaufplan + PProzessDLL
          + KnotenListener + KanteListener
          Test: test.otx (1 Knoten als richtiger Plan)
          Diff: Hand-Trace + Property-basierte KPI-Checks

V3      "Verzweigung + Join" (2-3 Tage)
          + PtVerknuepfung (Join-Counter)
          + PDpKaVerteilung
          + kritischer Weg + Kosten-Verteilung in PDurchlaufplan
          Test: dc1.otx (3 Pläne, Verzweigung)
          Diff: bis hierhin Option-D-Trigger evaluieren (siehe DIFFTEST.md § 6)

V4      "Auslöser-Variation" (1-2 Tage)
          + PAslMehrfachZaz
          + PtTrigger-Mehrfach-Behandlung
          + PKlasse-Basis (PKlasseZeit, PKlasseKosten — minimal, ohne Strategien)
          Test: Auslöser-Variation gegen größere .otx aus Vorstellung04/

V5      "AZeit-Skelett" (1 Tag)
          + ASimulator als Subklasse von PSimulator (Pass-Through-Klasse)
          + APerson, AGruppe als Pass-Through-Klassen
          + AAslMehrfachZaz mit no-op on_sim_begin
          Test: alle .otx-Files mit ASimulator-Top-Level laden ohne Crash
          Diff: nur Loadability, keine KPI-Vergleiche
```

**Parallel zu C0-S bis V5**: das `osim2004-trace/`-Subprojekt (Mini-C-Programme
für bit-genaue LCG-/Verteilungs-/EventPool-Outputs). Details siehe
`docs/CONTEXT-P1-DIFFTEST.md`.

**Observability**: der EventBus + Sinks (siehe `docs/CONTEXT-P1-EVENTBUS.md`)
wird bereits ab V1 mit-implementiert — Diff-Tests in V2/V3 brauchen ihn als
`TraceCaptureSink`.

### 6.5 Was als Nächstes geprüft werden muss (in V3/Phase 2)

**Option-D-Trigger**: nach Abschluss V2 wird entschieden, ob OSim2004 in einer
abgespeckten headless-Variante wiederbelebt werden soll (Aufwand 1-2 Wochen,
Ergebnis: lebenslange C++-Referenz). Trigger:

- V2 läuft glatt durch (Hand-Trace + Properties reichen) → Option D bleibt
  optional, Entscheidung erst Phase-2-Start
- V2 produziert ≥2 unerklärbare Divergenzen → Option D wird aktiv, vor V3

Siehe `docs/CONTEXT-P1-DIFFTEST.md` § 6 für die Entscheidungs-Kriterien.

---

## § 7 — Option-D-Evaluation nach V3 (2026-05-17)

**Ergebnis: Option D bleibt deaktiviert. Entscheidung erst zu Phase-2-Start
neu bewerten.**

### Beobachtungen V1/V2/V3

| Slice | Lief glatt? | Unerklärbare Divergenzen | Erklärbare C++-Eigenheiten (= dokumentiert + 1:1 portiert) |
|---|---|---|---|
| V1 | ja | 0 | — |
| V2 | ja | 0 | — |
| V3 | ja | 0 | 1× `CalcProzKostenRek` propagiert nur Hauptweg-Kosten an Nachfolger nach Join, nicht die akkumulierte Summe (kJ.m_dHelp). Möglicherweise ein C++-Logikfehler, aber 1:1 portiert. Dokumentiert in `tests/integration/test_v3_kpi.py::test_kosten_verteilung_split_propagiert_hauptweg`. |

**Schwellenwert: ≥ 2 unerklärbare Divergenzen** (CONTEXT-P1-DIFFTEST.md § 6).
Aktuell: 0. Damit nicht ausgelöst.

### Was die V3-Validierung leistet

- 88 Tests grün (33 Stochastik bit-genau + 28 V1-Sim-Lifecycle + 18 V2-Plan-
  Graph + 9 V3-KPI/Three-Plans)
- 3 Hand-Trace-Vergleiche (V1, V2, plus C0-S Event-Pool synthetisch)
- Kritischer Weg gegen analytisch berechnete Werte (linear, Diamond, Three-
  Plans)
- Kosten-Verteilung gegen analytisch berechnete Werte (linear, Diamond)
- 3 unabhängige Pläne mit je eigenem Auslöser laufen parallel im selben
  Event-Pool ohne Konflikte

### Was die V3-Validierung NICHT leistet

- **Kein direkter Bit-genauer Vergleich mit OSim2004**, weil das C++-Projekt
  nicht baubar ist (VC6/MFC) und keine Trace-Files produziert hat
- **Keine Diss-Tabellen-Validierung** (Diss-PDF + Tabellen-Pfade vom User
  noch nicht nachgereicht — siehe DIFFTEST.md § 5 Frage 1)
- **Kein Test gegen reale `.otx`-Datei** (`test.otx` als OArchive-Fragment
  nicht direkt parsbar — siehe DIFFTEST.md § 5 Frage 2)

Diese drei Lücken werden in Phase 2 (Ressourcen) relevant, nicht in Phase 1.

### Empfehlung für Phase-2-Start

Bei Phase-2-Beginn (Ressourcen, Aktoren, Speicher) neu evaluieren:

| Wenn... | Dann... |
|---|---|
| Diss-PDF + Tabellen-Pfade jetzt vorhanden | Diss-Tabellen-Vergleich als Plausibilitäts-Anker hinzu |
| OArchive-Parsing für `.otx` möglich (vielleicht Subset, das die `test.otx`-Datei abdeckt) | reale `.otx`-Files als Integration-Tests hinzu |
| Mehrere unerklärbare Divergenzen in Ressourcen-Implementation auftauchen | **Option D aktivieren** (Aufwand 1-2 Wochen, lebenslange Referenz für P2-P5) |
| Phase 2 läuft ähnlich glatt wie P1 | Option D bleibt verschoben bis P3 oder später |
