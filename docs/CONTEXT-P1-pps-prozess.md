# CONTEXT-P1-pps-prozess

**Phase 1, Modul B3 — PtProzess + Phase-1-Subtypen + PProzessDLL + PtTrigger + PtVerknuepfung**

Kontrakt für die *transienten* Sim-Objekte: Prozesse, die zur Laufzeit der
Simulation entstehen und vergehen, deren DLL-Verwaltung und die Trigger/
Join-Counter-Mechanik.

| Klasse | Header (.odh) | Implementation (.cpp) |
|---|---|---|
| `PtProzess` (+ Subtypen) | `OSimPro/PtProzess.odh` | `OSimPro/PtProzess.cpp` |
| `PProzessList`, `PProzessDLL` | `OSimPro/PtProzess.odh` | `OSimPro/PtProzess.cpp` |
| `PtTrigger` (+ ACOTrigger) | `OSimPro/PtTrigger.odh` | `OSimPro/PtTrigger.cpp` |
| `PtVerknuepfung` | `OSimPro/PtVerknuepfung.odh` | `OSimPro/PtVerknuepfung.cpp` |

`PtProzess` und `PtTrigger` sind als `abstract` markiert.

## Überblick — Lebenszyklus eines Prozesses

```
       erzeugt von Auslöser
              │
              ▼
       PtTrigger.OnPrzCreated
              │
              ▼
       PDurchlaufplan.DlplAusloesen ──┐ wenn !BearbeitBeginnen:
              │                       │ Warteschlange (m_oWarteSchl)
              ▼                       ▼
       PDlplKnoten.BearbeitBeginnen   GetPSimulator()->m_oWarteSchl
              │
              ▼
       PtProzess.BearbeitBeginnen      ◄── Subtyp-Override
              │
              │   ◄── Sim-Zeit verstreicht (EvtBearbeitEnde)
              │
              ▼
       PtProzZeitvorgabe.BearbeitEnde
              │
              ▼
       PtProzess.BearbeitBeenden
              │
              ▼
       PDlplKnoten.OnProzBeendet
              │
              ▼
       Kante.ProzWeitergeben  ──► nächster Knoten ODER OnDlplBeendet
```

Status-Übergänge (`PtProzZeitStatus`):
```
ptWart (initial)
  │
  ├──► ptBearb  (BearbeitBeginnen)
  │       │
  │       ├──► ptEnde  (BearbeitBeenden → Delete)
  │       └──► ptUnt   (BearbeitUnterbrechen → Warteschlange)
  │
  └──► ptUnt   (wenn aus ptBearb unterbrochen)
              │
              └──► ptBearb (wieder eingelastet)
```

---

## PtProzess — abstrakte Basisklasse

**Quelle:** `OSimPro/PtProzess.odh` (386 Z.) + `OSimPro/PtProzess.cpp` (1010 Z.).
**Vererbung:** `PtProzess(PSimObj)`. **`$option … abstract;`** — kann nicht direkt
instanziiert werden.

### Konstanten + Enum

```cpp
#define PTPROZ_MAX_PRIORITAET 10000

$enum PtProzZeitStatus {
    ptBearb,  // Prozess in Bearbeitung
    ptEnde,   // Bearbeitung zu Ende
    ptWart,   // Prozess wartet (in Warteschlange)
    ptUnt     // Prozess unterbrochen
};

#define OANCHOR ((const ONullObj *)0x0eeddccbb)
// Magic-Pointer zur Kennzeichnung des Anker-Objektes in PProzessDLL
```

`OANCHOR` ist ein Markup-Pointer (nicht dereferenzierbar). Er wird als Wert
für `m_oKnoten` beim Anker-Prozess der `PProzessDLL` benutzt — Iteration über
die DLL bricht ab, wenn `m_oKnoten == OANCHOR`.

**Python-Mapping**: Statt Magic-Pointer eine Sentinel-Instanz oder ein
Boolean-Flag `_is_anchor: bool`. Sentinel-Instanz ist sauberer:
```python
class _ProzessAnchorSentinel: pass
ANCHOR = _ProzessAnchorSentinel()
```

### Datenmember

```
$opr  PtProzess          m_oNext;    // DLL-Nachfolger
$opr  PtProzess          m_oPrev;    // DLL-Vorgänger
$attr PtProzZeitStatus   m_eStatus = ptWart;
$attr(transient)
      POSITION           m_posKnoten = NULL;   // Position in Knoten.m_lProzesse
      CString            m_sName;    // Debug-Name (ProzOber-Name "|" Knoten-Name)

$opr  PRessBeleg         m_oAktor;        // bearbeitender Aktor (Phase 3)
$opr  PDlplKnoten        m_oKnoten;       // Erzeuger
$opr  PtTrigger          m_oTrigger;      // Trigger
$opr  PtProzess          m_oProzOber;     // Ober-Prozess (Sub-Plan-Hierarchie)
$opr  PEntitaet          m_oEntitaet;     // Phase 4
$attr int                m_iPrioritaet         = 0;
$attr int                m_iErzeugungzeitpunkt = 0;  // im Ctor: EvtCurrTime()
$opr  PRelationList      m_oRelationen;   // Phase 2 (Ressourcen-Relationen)
```

### Sim-Methoden (Default-Implementierungen)

| Methode | Default-Verhalten | Phase-1-Override? |
|---|---|---|
| `RessVerfuegbar() -> BOOL` | Phase-2-Check: alle `m_oKnoten->m_lAssozRess` durchgehen | **P1: hardcode return `TRUE`** (`m_lAssozRess` ist in P1 leer) |
| `RessAnwesend() -> BOOL` | wie oben | **P1: return `TRUE`** |
| `BearbeitBeginnen()` | Aktor.OnAktBeginn + Relationen.OnProzBeginn | P1: no-op (kein Aktor, keine Relationen) |
| `BearbeitBeenden()` | Aktor.OnAktEnde + Relationen.OnProzEnde | P1: no-op |
| `BearbeitUnterbrechen()` | m_eStatus=ptUnt, Relationen.OnProzUnterbr + zerstören, Aktor.OnAktUnterbr, ggf. in Warteschlange | siehe unten |
| `OnBearbeitAbgelehnt()` | Relationen abhängen + zerstören | P1: no-op |
| `PtkUpDateProcessQueue(proz, add)` | Phase-2: iteriere über AssozBeleg | **P1: no-op** |
| `OnUnterProzBeginn(proz)` | **abstract** (throw) | nur PtProzDurchlaufplan |
| `OnUnterProzEnde(proz)` | **abstract** (throw) | nur PtProzDurchlaufplan |

#### `RessVerfuegbar` / `RessAnwesend` (PtProzess.cpp:124-157)

```cpp
BOOL PtProzess::RessVerfuegbar() {
    BOOL bAvail = TRUE;
    POSITION pos = m_oKnoten->m_lAssozRess->GetHeadPosition();
    while (pos != NULL) {
        if (!m_oKnoten->m_lAssozRess->GetNext(pos)->RessVerfuegbar(oprThis())) {
            bAvail = FALSE;
            break;
        }
    }
    return bAvail;
}
```

**P1-Vereinfachung**: `m_lAssozRess` ist in P1 immer leer → die Schleife
läuft nie → return `TRUE`. **Python-Mapping** (P1):
```python
def ress_verfuegbar(self) -> bool:
    if not self.m_oKnoten.m_lAssozRess:    # P1: leer
        return True
    return all(a.ress_verfuegbar(self) for a in self.m_oKnoten.m_lAssozRess)
```

#### `BearbeitBeginnen` / `BearbeitBeenden` / `BearbeitUnterbrechen` (PtProzess.cpp:159-221)

```cpp
void PtProzess::BearbeitBeginnen() {
    if (m_oAktor != ONULL) m_oAktor->OnAktBeginn(oprThis());
    for (POSITION pos = m_oRelationen->GetHeadPosition(); pos != NULL;)
        m_oRelationen->GetNext(pos)->OnProzBeginn(oprThis());
}

void PtProzess::BearbeitBeenden() {
    if (m_oAktor != ONULL) m_oAktor->OnAktEnde(oprThis());
    for (POSITION pos = m_oRelationen->GetHeadPosition(); pos != NULL;)
        m_oRelationen->GetNext(pos)->OnProzEnde(oprThis());
}

void PtProzess::BearbeitUnterbrechen() {
    m_eStatus = ptUnt;

    // Relationen informieren
    for (POSITION pos = m_oRelationen->GetHeadPosition(); pos != NULL;)
        m_oRelationen->GetNext(pos)->OnProzUnterbr(oprThis());

    // Relationen zerstören (jede einzeln aus der Liste löschen)
    for (POSITION pos = m_oRelationen->GetHeadPosition(); pos != NULL;)
        m_oRelationen->GetNext(pos).Delete();
    m_oRelationen->RemoveAll();

    // Aktor informieren
    BOOL isInAktorSchlange = FALSE;
    if (m_oAktor != ONULL)
        isInAktorSchlange = m_oAktor->OnAktUnterbr(oprThis());
    m_oAktor = ONULL;

    // Wenn nicht in Aktor-Schlange → globale Warteschlange
    if (!isInAktorSchlange)
        GetPSimulator()->m_oWarteSchl->AddTail(oprThis());
}
```

### DLL-Verwaltung (für `PProzessDLL`-Container)

```cpp
oprPtProzess GetNext();                  // ONULL bei Listen-Ende (= Anchor)
oprPtProzess GetPrev();                  // ONULL bei Listen-Anfang
void         Remove();                   // Self aus DLL entfernen
void         InsertBefore(oprPtProzess); // Anderes vor Self einfügen
void         InsertAfter(oprPtProzess);  // Anderes nach Self einfügen
```

**Implementierungen** sind kanonische doppelt-verkettete-Listen-Pointer-
Manipulation (PtProzess.cpp:276-328). `_ASSERTE(m_oKnoten != OANCHOR)` —
nie auf den Anker dieser Operationen anwenden.

**Python-Mapping**: Wenn die DLL-Mechanik in Python einfacher als
`collections.deque` umgesetzt wird, sind diese Methoden überflüssig. Aber
für `PProzessDLL` (siehe unten) braucht es DLL-Semantik, weil Prozesse
auch ohne den Container in eine Position relativ zu anderen Prozessen
eingefügt werden. Empfehlung: `PtProzess.next: PtProzess | None` und
`.prev: PtProzess | None` als Attribute, Methoden als Slim-Wrapper.

### Verknüpfungs-Verwaltung (in PtProzess: abstract)

```cpp
virtual oprPtVerknuepfung FindVerknpf(oprPDlplKante);   // throw
virtual void              RemoveVerknpf(oprPtVerknuepfung); // throw
virtual void              AddVerknpf(oprPtVerknuepfung);    // throw
```

In `PtProzess` werfen sie `OException`. Nur `PtProzDurchlaufplan` implementiert
sie wirklich (siehe unten).

### Sonstige Methoden

```cpp
oprPAusloeser GetAusloeser() {            // PtProzess.cpp:356
    return (m_oTrigger == ONULL) ? ONULL : m_oTrigger->m_oAusl;
}

int GetZstArbeitsinhalt()    { return 0; }   // Default
int GetZstArbeitsinhaltAkt() { return 0; }
int GetZstArbeitsinhaltAbge(){ return 0; }
int GetZstPrioritaet()       { return m_iPrioritaet; }
int GetZstWartezeit()        { return EvtCurrTime() - m_iErzeugungzeitpunkt; }
int GetKnzEinlastzeitpunkt() { return m_iErzeugungzeitpunkt; }
int GetPrgVblSystemZeit();   // komplex, siehe PtProzess.cpp:366-400
```

### Lifecycle (inline in .odh)

```cpp
$implement PtProzess() {
    m_oAktor = m_oKnoten = m_oTrigger = m_oProzOber = m_oEntitaet = ONULL;
    m_iErzeugungzeitpunkt = EvtCurrTime();
}

$implement ~PtProzess() {
    if (m_posKnoten != NULL) {
        m_oKnoten->RemoveProzess(oprThis());
        m_posKnoten = NULL;
    }
}
```

**Wichtig**: Der Destruktor räumt selbständig aus dem Knoten auf. In Python
keinen `__del__` benutzen (GC-Reihenfolge problematisch); stattdessen explizit
`prozess.cleanup()` aufrufen beim `Delete`/Lifecycle-Ende, oder ein
Context-Manager-Pattern.

### Python-Mapping `PtProzess`

```python
class PtProzZeitStatus(IntEnum):
    BEARB = 0
    ENDE  = 1
    WART  = 2
    UNT   = 3

class PtProzess(PSimObject):
    MAX_PRIORITAET: ClassVar[int] = 10000

    def __init__(self, simulator: PSimulator,
                 knoten: PDlplKnoten | None = None,
                 trigger: "PtTrigger | None" = None,
                 proz_ober: "PtProzess | None" = None,
                 entitaet: Any = None) -> None:
        super().__init__(simulator)
        self.next: "PtProzess | None" = None
        self.prev: "PtProzess | None" = None
        self.status: PtProzZeitStatus = PtProzZeitStatus.WART

        # Backrefs zum Modell-Graph
        self.knoten = knoten
        self.trigger = trigger
        self.proz_ober = proz_ober
        self.entitaet = entitaet
        self.aktor: Any = None        # Phase 3

        self.prioritaet: int = 0
        self.erzeugungszeitpunkt: int = self.evt_curr_time
        self.relationen: list[Any] = []   # Phase 2
        self.sName: str = ""

    # Sim-Methoden
    def ress_verfuegbar(self) -> bool:
        return all(a.ress_verfuegbar(self) for a in (self.knoten.m_lAssozRess or []))

    def ress_anwesend(self) -> bool:
        return all(a.ress_anwesend(self) for a in (self.knoten.m_lAssozRess or []))

    def bearbeit_beginnen(self) -> None:
        if self.aktor is not None: self.aktor.on_akt_beginn(self)
        for r in self.relationen: r.on_proz_beginn(self)

    def bearbeit_beenden(self) -> None:
        if self.aktor is not None: self.aktor.on_akt_ende(self)
        for r in self.relationen: r.on_proz_ende(self)

    def bearbeit_unterbrechen(self) -> None:
        self.status = PtProzZeitStatus.UNT
        for r in self.relationen: r.on_proz_unterbr(self)
        self.relationen.clear()
        is_in_aktor_schlange = False
        if self.aktor is not None:
            is_in_aktor_schlange = self.aktor.on_akt_unterbr(self)
        self.aktor = None
        if not is_in_aktor_schlange:
            self.p_simulator.m_oWarteSchl.add_tail(self)

    def on_bearbeit_abgelehnt(self) -> None:
        self.relationen.clear()

    def ptk_update_process_queue(self, proz: "PtProzess", add: bool = True) -> None:
        for assress in self.knoten.m_lAssozRess:
            if not isinstance(assress, PAssozBeleg): continue
            assress.ptk_update_process_queue(self.knoten, proz, add)

    # abstract — nur in PtProzDurchlaufplan
    def on_unter_proz_beginn(self, proz: "PtProzess") -> None:
        raise NotImplementedError
    def on_unter_proz_ende(self, proz: "PtProzess") -> None:
        raise NotImplementedError

    # Verknüpfungs-API (PtProzess: throw; PtProzDurchlaufplan: real)
    def find_verknpf(self, kante: "PDlplKante") -> "PtVerknuepfung | None":
        raise NotImplementedError
    def remove_verknpf(self, v: "PtVerknuepfung") -> None:
        raise NotImplementedError
    def add_verknpf(self, v: "PtVerknuepfung") -> None:
        raise NotImplementedError

    def get_ausloeser(self) -> "PAusloeser | None":
        return self.trigger.ausl if self.trigger is not None else None
```

---

## PtProzZeitvorgabe — Prozess mit fester Bearbeitungszeit

**Quelle:** `OSimPro/PtProzess.odh:200-231` + `OSimPro/PtProzess.cpp:520-668`.
**Vererbung:** `PtProzZeitvorgabe(PtProzess)`. Phase-1-relevant.

### Datenmember

```
EHDL    m_evHandle;             // Event-Handle für EvtBearbeitEnde
$attr   int m_iZeitinhalt    = 0;  // gesamter Zeit-Inhalt
$attr   int m_iZeitinhaltAkt = 0;  // aktueller Rest-Zeit-Inhalt
$attr   int m_iBearbeitBeginn= -1; // letzter BearbeitBeginn-Zeitpunkt
```

### Methoden

#### Zustand

```cpp
int GetZstArbeitsinhalt()     { return m_iZeitinhalt; }     // Gesamt

int GetZstArbeitsinhaltAkt() {
    if (m_iBearbeitBeginn == -1) return m_iZeitinhaltAkt;  // noch nicht gestartet
    if (m_eStatus == ptUnt)      return m_iZeitinhaltAkt;  // unterbrochen
    return m_iZeitinhaltAkt - (EvtCurrTime() - m_iBearbeitBeginn);  // läuft
}

int GetZstArbeitsinhaltAbge() {
    if (m_iBearbeitBeginn == -1 || m_eStatus == ptUnt)
        return m_iZeitinhalt - m_iZeitinhaltAkt;
    return EvtCurrTime() - m_iBearbeitBeginn;
}
```

#### Sim-Methoden

```cpp
void PtProzZeitvorgabe::BearbeitBeginnen() {
    if (m_eStatus != ptUnt) {     // nur neu setzen, wenn nicht aus Unterbruch
        m_iZeitinhaltAkt = oprPDpKnZeitvorgabe(m_oKnoten)->GetDurchfuehrungszeit(oprThis());
        m_iZeitinhalt    = m_iZeitinhaltAkt;
    }
    m_iBearbeitBeginn = EvtCurrTime();
    m_eStatus         = ptBearb;

    PtProzess::BearbeitBeginnen();          // super()
    m_oProzOber->OnUnterProzBeginn(oprThis()); // Plan informieren

    // Event für BearbeitEnde platzieren
    m_evHandle = EvtInsert(EvtBearbeitEnde, oprThis(), EvtCurrTime() + m_iZeitinhaltAkt);

    SimTrace("PtProzZeitvorgabe::BearbeitBeginnen Knoten:(...) ...");
}

void PtProzZeitvorgabe::BearbeitBeenden() {
    m_eStatus = ptEnde;

    // Konsistenz-Check (in Python skippable für P1)
    if (m_oKnoten->m_lKnotenOber != ONULL)
        if (m_oKnoten->m_lKnotenOber->m_lProzesse->Find(m_oProzOber) == NULL
            && m_oKnoten->m_lProzesse->Find(m_oProzOber) == NULL)
            throw new OException();

    m_oProzOber->OnUnterProzEnde(oprThis());     // Plan informieren
    m_oKnoten->OnProzBeendet(oprThis(), m_oEntitaet);  // Knoten informieren
    PtProzess::BearbeitBeenden();                 // super()
    oprThis().Delete();                            // Prozess zerstören
}

void PtProzZeitvorgabe::BearbeitEnde() {           // Event-Handler
    BearbeitBeenden();
}

void PtProzZeitvorgabe::BearbeitUnterbrechen() {
    m_eStatus = ptUnt;
    if (m_evHandle != -1) EvtDelete(m_evHandle);   // Event abbrechen
    m_evHandle = -1;
    m_iZeitinhaltAkt -= EvtCurrTime() - m_iBearbeitBeginn;  // Rest-Zeit aktualisieren
    m_oKnoten->OnProzUnterbr(oprThis(), m_oEntitaet);
    PtProzess::BearbeitUnterbrechen();             // super()
}
```

**Event-Slot**: `$event(2) void BearbeitEnde();` — die `2` ist
vermutlich sub-time-priority (Events am gleichen Sim-Zeitpunkt werden nach
sub-time geordnet). Bei Implementierung in `core/event.py` verifizieren.

### Python-Mapping `PtProzZeitvorgabe`

```python
class PtProzZeitvorgabe(PtProzess):
    def __init__(self, simulator: PSimulator, **kwargs) -> None:
        super().__init__(simulator, **kwargs)
        self.ev_handle: EventHandle | None = None
        self.zeit_inhalt: int = 0
        self.zeit_inhalt_akt: int = 0
        self.bearbeit_beginn: int = -1

    def get_zst_arbeitsinhalt(self) -> int: return self.zeit_inhalt
    def get_zst_arbeitsinhalt_akt(self) -> int: ...
    def get_zst_arbeitsinhalt_abge(self) -> int: ...

    def bearbeit_beginnen(self) -> None:
        if self.status != PtProzZeitStatus.UNT:
            knoten: PDpKnZeitvorgabe = cast(PDpKnZeitvorgabe, self.knoten)
            self.zeit_inhalt_akt = knoten.get_durchfuehrungszeit(self)
            self.zeit_inhalt = self.zeit_inhalt_akt
        self.bearbeit_beginn = self.evt_curr_time
        self.status = PtProzZeitStatus.BEARB
        super().bearbeit_beginnen()
        self.proz_ober.on_unter_proz_beginn(self)
        self.ev_handle = self.evt_insert(
            EVENT_BEARBEIT_ENDE, self, self.evt_curr_time + self.zeit_inhalt_akt
        )

    def bearbeit_beenden(self) -> None:
        self.status = PtProzZeitStatus.ENDE
        self.proz_ober.on_unter_proz_ende(self)
        self.knoten.on_proz_beendet(self, self.entitaet)
        super().bearbeit_beenden()
        # delete self — in Python via explizites cleanup

    def bearbeit_ende(self) -> None:   # Event-Handler
        self.bearbeit_beenden()

    def bearbeit_unterbrechen(self) -> None:
        self.status = PtProzZeitStatus.UNT
        if self.ev_handle is not None:
            self.evt_delete(self.ev_handle)
            self.ev_handle = None
        self.zeit_inhalt_akt -= self.evt_curr_time - self.bearbeit_beginn
        self.knoten.on_proz_unterbr(self, self.entitaet)
        super().bearbeit_unterbrechen()
```

---

## PtProzDurchlaufplan — Plan-Prozess (Container)

**Quelle:** `OSimPro/PtProzess.odh:235-256` + `OSimPro/PtProzess.cpp:679-766`.
**Vererbung:** `PtProzDurchlaufplan(PtProzess)`. Phase-1-relevant.

Wird in `PDurchlaufplan.DlplAusloesen` erzeugt. Repräsentiert die Plan-
Ausführung als Ganzes — keine eigene Bearbeitungszeit, sondern Container für
die Unter-Prozesse, die durch den Plan-Graphen wandern.

### Datenmember

```
$opr PVerknuepfungList m_oVerknuepfungen;  // existierende Join-Counter
```

### Methoden

```cpp
void PtProzDurchlaufplan::BearbeitBeginnen() {
    PtProzess::BearbeitBeginnen();   // super() — nichts mehr Plan-spezifisches
}

void PtProzDurchlaufplan::BearbeitBeenden() {
    if (SucheUnterprozesseInPList() > 1) {
        TraceAllExistProzesses();
        throw new OException();      // Konsistenz-Check: alle Unter-Prozesse müssen weg sein
    }
    PtProzess::BearbeitBeenden();
    oprThis().Delete();
}

void PtProzDurchlaufplan::OnUnterProzBeginn(oprPtProzess oProz) { /* no-op */ }
void PtProzDurchlaufplan::OnUnterProzEnde(oprPtProzess oProz)   { /* no-op */ }
```

### Verknüpfungs-Verwaltung (echt implementiert)

```cpp
oprPtVerknuepfung PtProzDurchlaufplan::FindVerknpf(oprPDlplKante oKante) {
    POSITION pos = m_oVerknuepfungen->GetHeadPosition();
    while (pos != NULL) {
        oprPtVerknuepfung oVerknpf = m_oVerknuepfungen->GetNext(pos);
        if (oVerknpf->m_oKante == oKante) return oVerknpf;
    }
    return ONULL;
}

void PtProzDurchlaufplan::AddVerknpf(oprPtVerknuepfung oVerknpf) {
    m_oVerknuepfungen->AddTail(oVerknpf);
}

void PtProzDurchlaufplan::RemoveVerknpf(oprPtVerknuepfung oVerknpf) {
    // POSITION pos finden → m_oVerknuepfungen->RemoveAt(pos)
}
```

### Python-Mapping `PtProzDurchlaufplan`

```python
class PtProzDurchlaufplan(PtProzess):
    def __init__(self, simulator: PSimulator, **kwargs) -> None:
        super().__init__(simulator, **kwargs)
        self.verknuepfungen: list["PtVerknuepfung"] = []

    def bearbeit_beginnen(self) -> None: super().bearbeit_beginnen()
    def bearbeit_beenden(self) -> None:
        # Konsistenz-Check
        if self.suche_unterprozesse_in_p_list() > 1:
            self.trace_all_exist_prozesses()
            raise OSimException("Unter-Prozesse beim Plan-Ende noch vorhanden")
        super().bearbeit_beenden()

    def on_unter_proz_beginn(self, proz: PtProzess) -> None: pass
    def on_unter_proz_ende(self, proz: PtProzess) -> None: pass

    def find_verknpf(self, kante: PDlplKante) -> "PtVerknuepfung | None":
        for v in self.verknuepfungen:
            if v.kante is kante: return v
        return None

    def add_verknpf(self, v: "PtVerknuepfung") -> None: self.verknuepfungen.append(v)
    def remove_verknpf(self, v: "PtVerknuepfung") -> None: self.verknuepfungen.remove(v)
```

---

## PProzessList und PProzessDLL

### `PProzessList`

```cpp
class PProzessList : public PSimList {
    $option simclass,listclass(PtProzess,lifeline,event,stream);
};
```

Einfacher typisierter Container für `PtProzess`. **Python-Mapping**: `list[PtProzess]`.

### `PProzessDLL` — die zentrale Warteschlange

**Quelle:** `OSimPro/PtProzess.odh:147-198` + `OSimPro/PtProzess.cpp:441-509`.

Eine doppelt verkettete Liste auf Basis der `m_oNext`/`m_oPrev`-Felder der
`PtProzess`-Instanzen, mit einem **Anker-Prozess** als Sentinel.

```cpp
class PProzessDLL : public PSimObj {
    $opr PtProzess  m_oAnchor;   // Anker (m_oKnoten = OANCHOR)

    BOOL          IsEmpty();
    oprPtProzess  GetHead();    // Erstes Element (ohne Anker)
    oprPtProzess  GetTail();    // Letztes Element
    void          AddHead(oprPtProzess oProz);
    void          AddTail(oprPtProzess oProz);
    void          DeleteAll();
};

$implement PProzessDLL(...) {
    m_oAnchor->m_oKnoten = OANCHOR;
    m_oAnchor->m_oNext   = m_oAnchor;     // zirkular
    m_oAnchor->m_oPrev   = m_oAnchor;
}

$implement void OnSimBegin(...) {
    if (!IsEmpty()) {
        warn("PProzDll ist nicht leer!");
        m_oAnchor->m_oNext = m_oAnchor;   // hart resetten
        m_oAnchor->m_oPrev = m_oAnchor;
    }
}
```

#### Implementierungen (PtProzess.cpp:441-509)

```cpp
oprPtProzess PProzessDLL::GetHead() {
    if (m_oAnchor->m_oNext == m_oAnchor) return ONULL;
    return m_oAnchor->m_oNext;
}

BOOL PProzessDLL::IsEmpty() {
    if (m_oAnchor->m_oPrev == m_oAnchor && m_oAnchor->m_oNext == m_oAnchor)
        return TRUE;
    // Konsistenz-Test: nicht "nur einseitig leer"
    if (m_oAnchor->m_oPrev == m_oAnchor) throw new OException();
    if (m_oAnchor->m_oNext == m_oAnchor) throw new OException();
    return FALSE;
}

void PProzessDLL::AddTail(oprPtProzess oProz) {
    oProz->m_oNext           = m_oAnchor;
    oProz->m_oPrev           = m_oAnchor->m_oPrev;
    m_oAnchor->m_oPrev->m_oNext = oProz;
    m_oAnchor->m_oPrev       = oProz;
}

void PProzessDLL::DeleteAll() {
    oprPtProzess oProz = GetPSimulator()->m_oWarteSchl->GetHead();
    while (oProz != ONULL) {
        oprPtProzess oProzNext = oProz->GetNext();
        oProz->Remove();
        oProz.Delete();
        oProz = oProzNext;
    }
}
```

**Anmerkung zu `DeleteAll`** (PtProzess.cpp:489-509): die Implementierung geht
über `GetPSimulator()->m_oWarteSchl` statt über `this`. Das ist vermutlich ein
Bug oder eine implizite Annahme "die Instanz IST die globale Warteschlange".
In Python: über `self.head` iterieren.

### Python-Mapping `PProzessDLL`

```python
class ProzessDLL(PSimObject):
    def __init__(self, simulator: PSimulator) -> None:
        super().__init__(simulator)
        # Sentinel-basierte DLL ist in Python overkill — eine deque reicht
        self._items: deque[PtProzess] = deque()

    def is_empty(self) -> bool: return not self._items
    def get_head(self) -> PtProzess | None: return self._items[0] if self._items else None
    def get_tail(self) -> PtProzess | None: return self._items[-1] if self._items else None
    def add_head(self, p: PtProzess) -> None: self._items.appendleft(p)
    def add_tail(self, p: PtProzess) -> None: self._items.append(p)
    def delete_all(self) -> None: self._items.clear()

    def __iter__(self) -> Iterator[PtProzess]: return iter(self._items)

    def on_sim_begin(self, deep: bool = True) -> None:
        if not self.is_empty():
            warnings.warn("PProzDll ist nicht leer!", RuntimeWarning)
            self.delete_all()
```

**Verlust gegenüber C++**: Die DLL-Implementierung in C++ erlaubt, einen
Prozess **an beliebiger Stelle** per `m_oNext`/`m_oPrev` einzufügen oder
zu entfernen — ohne `O(n)`-Suche. Die `deque`-basierte Python-Variante
hat dafür `O(n)` über `remove`. Falls Performance kritisch wird, eine
explizite Doppel-verkettete Liste auf Basis von `next`/`prev`-Attributen
implementieren (wie die C++-Variante, nur ohne Sentinel — mit Python-`None`).

---

## PtTrigger — Trigger einer Plan-Auslösung

**Quelle:** `OSimPro/PtTrigger.odh` (81 Z.) + `OSimPro/PtTrigger.cpp` (89 Z.).
**Vererbung:** `PtTrigger(PSimObj)`. **`abstract`**.

Ein `PtTrigger` repräsentiert einen *einzelnen* Auslöse-Vorgang. Wird vom
`PAusloeser` erzeugt; verbindet `PDurchlaufplan` mit `PAusloeser` für die
spezifische Auslösung.

### Datenmember

```
$attr int             m_iTrigNum         = -1;  // laufende Nummer
$opr  PAusloeser      m_oAusl;                  // Erzeuger
$opr  PDurchlaufplan  m_oDlpl;                  // ausgelöster Plan
$opr  PRessBeleg      m_oResBel = ONULL;        // letzte bearbeitende Ressource (Phase 2)

// Protokolle
$attr int  m_iPtkAnzBearbRess  = 0;
$attr int  m_iPtkBeginTermin   = 0;
$attr int  m_iPtkSollEndTermin = 0;
```

### Methoden

```cpp
void SetBearbRessBeleg(oprPRessBeleg beleg) {
    m_iPtkAnzBearbRess++;
    m_oResBel = beleg;
}

void OnDlplBeendet(oprPtProzess oProzDlpl) {
    m_oAusl->OnDlplBeendet(oprThis(), oProzDlpl);   // Auslöser informieren
}

void OnPrzCreated(oprPtProzess oProz) { /* no-op default */ }

$observer int GetPrgEinlastzeitpunkt() { return m_iPtkBeginTermin; }
```

**Aufruf-Flow**:
- `PAusloeser.DlplAusloesen` → erzeugt einen `PtTrigger` mit dem Plan → ruft
  `PDurchlaufplan.DlplAusloesen(trigger, …)` auf
- `PDurchlaufplan.DlplAusloesen` → erzeugt `PtProzDurchlaufplan` → ruft
  `trigger.OnPrzCreated(proz)`
- Wenn der Plan fertig ist (`PDurchlaufplan.OnDlplBeendet` Top-Level-Pfad):
  → `trigger.OnDlplBeendet(proz)` → `auslöser.OnDlplBeendet(trigger, proz)`

### Subtyp `ACOTrigger` — out-of-scope für P1

`ACOTrigger` ist eine `PtTrigger`-Spezialisierung für Ant-Colony-Optimization.
Out-of-scope bis Phase 5.

### Python-Mapping `PtTrigger`

```python
class PtTrigger(PSimObject):
    def __init__(self, simulator: PSimulator,
                 ausl: "PAusloeser | None" = None,
                 dlpl: PDurchlaufplan | None = None) -> None:
        super().__init__(simulator)
        self.trig_num: int = -1
        self.ausl = ausl
        self.dlpl = dlpl
        self.res_bel: Any = None         # Phase 2
        self.ptk_anz_bearb_ress: int = 0
        self.ptk_begin_termin: int = 0
        self.ptk_soll_end_termin: int = 0

    def set_bearb_ress_beleg(self, beleg: Any) -> None:
        self.ptk_anz_bearb_ress += 1
        self.res_bel = beleg

    def on_dlpl_beendet(self, proz_dlpl: PtProzess) -> None:
        self.ausl.on_dlpl_beendet(self, proz_dlpl)

    def on_prz_created(self, proz: PtProzess) -> None: pass

    @property
    def prg_einlastzeitpunkt(self) -> int: return self.ptk_begin_termin
```

---

## PtVerknuepfung — Join-Counter für UND-Verknüpfung

**Quelle:** `OSimPro/PtVerknuepfung.odh` (43 Z.) + `OSimPro/PtVerknuepfung.cpp` (35 Z.).
**Vererbung:** `PtVerknuepfung(PSimObj)`. Phase-1-relevant.

Eine sehr kleine Klasse, die in der UND-Verknüpfungs-Logik von
`PDlplKante.ProzWeitergeben` benutzt wird (siehe B2).

### Datenmember + Methode

```
$opr  PDlplKante  m_oKante;             // erzeugende Kante (für FindVerknpf)
$attr int         m_iAnzProz = 0;       // Anzahl noch verbleibender Prozesse
                                         // (= count_of_vorgaenger - 1 beim Anlegen)

BOOL ProzWeitergeben(oprPtProzess oProz);  // dekrementiert m_iAnzProz
                                            // gibt TRUE zurück, wenn 0 erreicht
```

### Implementierung

```cpp
BOOL PtVerknuepfung::ProzWeitergeben(oprPtProzess oProz) {
    if (m_iAnzProz <= 0) throw new OException;
    m_iAnzProz--;
    return (m_iAnzProz == 0);
}
```

**Algorithmus** (zusammen mit `PDlplKante.ProzWeitergeben` aus B2):

1. Kante mit `count` Vorgängern, erster Prozess kommt an:
   `find_verknpf(kante) = None` → neue Verknüpfung mit `iAnzProz = count - 1` anlegen
2. Zweiter Prozess kommt an:
   `find_verknpf(kante) = vorhandene` → `proz_weitergeben` dekrementiert auf `count - 2`
3. …
4. Letzter Prozess kommt an: `iAnzProz` wird 0 → returns `TRUE` → Kante darf
   `ProzWeitergeben` an Nachfolger fortsetzen

**Wichtig**: die Verknüpfung sitzt nicht an der Kante, sondern am
`oProz->m_oProzOber` (= `PtProzDurchlaufplan`). Das heißt: pro Plan-Lauf eine
eigene Verknüpfungs-Instanz, mehrere parallele Plan-Läufe können dieselbe
Kante ohne Interferenz benutzen.

### Python-Mapping `PtVerknuepfung`

```python
class PtVerknuepfung(PSimObject):
    def __init__(self, simulator: PSimulator,
                 kante: PDlplKante | None = None,
                 anz_proz: int = 0) -> None:
        super().__init__(simulator)
        self.kante = kante
        self.anz_proz = anz_proz

    def proz_weitergeben(self, proz: PtProzess) -> bool:
        if self.anz_proz <= 0:
            raise OSimException("Verknüpfung schon entleert")
        self.anz_proz -= 1
        return self.anz_proz == 0
```

---

## Out-of-scope für P1

| Klasse | Phase | Grund |
|---|---|---|
| `PtProzRuesten` | P2/P4 | Rüstphase (braucht Ressourcen, Phase 2) |
| `PtProzExtern` | P4 | externe Steuerung (braucht Entitäten) |
| `PtProzRuecksprung` | P4 | Wiederholungs-Counter |
| `PtProzAlternativ` | P4 | Alternative-Refs |
| `PtProzEntAufgabeBase`, `PtProzEntAufgabeIntern` | P5 | Entscheider-Aufgaben |
| `PtProzACOSplit` | P5 | ACO-Split |
| `ACOTrigger` | P5 | Ant-Colony-Optimization |
| `PtRelation` | P2 | Ressourcen-Relationen |

---

## Modul-Layout für B3-Code

```
src/osim_engine/pps/
    prozess/
        __init__.py
        base.py              # PtProzess, PtProzZeitStatus
        zeitvorgabe.py       # PtProzZeitvorgabe
        durchlaufplan.py     # PtProzDurchlaufplan
    prozess_dll.py           # ProzessDLL (Container)
    trigger.py               # PtTrigger
    verknuepfung.py          # PtVerknuepfung
```

## Phase-1-Reichweite (B3)

**In-Scope**:
- `PtProzess` (Basis) mit DLL-Pointers, Status-Enum, Sim-Methoden-Defaults
- `PtProzZeitvorgabe` mit `BearbeitBeginnen`/`BearbeitEnde`/`BearbeitUnterbrechen`
  + `BearbeitEnde`-Event
- `PtProzDurchlaufplan` mit Verknüpfungs-Verwaltung
- `ProzessDLL` (vereinfacht als `deque`)
- `PtTrigger` (abstrakt; konkrete Subtypen kommen mit `PAusloeser` in B4)
- `PtVerknuepfung`

**Vereinfachungen für P1**:
- `RessVerfuegbar` / `RessAnwesend`: returns immer `TRUE` (in P1 keine
  Ressourcen-Assozs)
- `PtkUpDateProcessQueue`: no-op
- `BearbeitUnterbrechen`-Aktor-Pfad: vereinfacht, weil kein Aktor existiert
- `OnBearbeitAbgelehnt`: no-op (keine Relationen zu lösen)

## Offene Punkte für Implementierung

1. **`EvtBearbeitEnde`-Event**: in `core/event.py` muss es eine Möglichkeit
   geben, ein Event mit einer Methoden-Bindung an einer Instanz zu erzeugen
   (in C++ via `OMetaEvent`). Vorschlag: Event hält `(target_obj, method_name)`,
   `dispatch()` ruft `getattr(target, method_name)()`.
2. **`$event(2)`-Slot-Priorität**: die "2" in `$event(2)` bedeutet vermutlich
   sub-time-priority (gleiche Sim-Zeit, aber Reihenfolge). Beim Implementieren
   in B1's `EventPool` verifizieren.
3. **Anchor-Sentinel vs. deque**: für P1 die `deque`-Variante nehmen. Wenn
   spätere Phasen O(1)-`InsertBefore`/`InsertAfter` brauchen, später auf
   echte verkettete Liste migrieren.
4. **`SucheUnterprozesseInPList`**: Konsistenz-Check vor `PtProzDurchlaufplan.
   BearbeitBeenden`. In P1 als Helper implementieren, der über alle Knoten
   des Plans iteriert und Prozesse mit `m_oProzOber == self` zählt.
5. **Prozess-`Delete`**: in C++ ist es ein expliziter `Delete()` mit Cleanup.
   In Python: Prozess aus Knoten entfernen, Event-Handles canceln,
   Verknüpfungen aufräumen. Vorschlag: `PtProzess.cleanup()`-Methode, die
   beim `BearbeitBeenden`-Ende explizit aufgerufen wird.
