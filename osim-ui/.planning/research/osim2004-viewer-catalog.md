# OSim2004 Viewer-Katalog — GraphObject-Foundation-basierte Viewer

> **Erstellt:** 2026-05-24 — nach Welle G26 (PDurchlaufplan-Editor stabil).
> **Zweck:** Vollständige Inventur aller OSim2004-C++-Viewer die auf
> `OGraphView` / `GraphObjCtrl` / `OGraphGrid` / `GObject` aufbauen.
> Basis für die TS-Foundation-Erweiterung und die nächsten Viewer-
> Implementierungen (Phase 2+).
>
> **Quelle:** Audit-Agent (Explore subagent), Lesung über
> `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\` +
> `OSimPro\` + `OSimAZeit\` + `OSimFemos\` + `OSimINSIGHTS\` + `OSimSam\`.
> Ergebnisse maschinell extrahiert — vor Implementierung Stichprobe
> verifizieren (Klassen-Hierarchien können sich seit der Auditierung
> ändern oder vom Audit falsch klassifiziert worden sein).

---

## A) Übersicht — Größenordnung

- **~60 Viewer-Klassen** insgesamt (alle GraphObj-affinen)
- **~20 GObject-Subklassen** (Zellen, Grid-Items, Links)
- **~12 OGraphGrid-Subklassen** (Grid-Varianten)
- **~10 GraphObjCtrl-Subklassen** (Custom-Controls)

Verteilung nach Modul:
| Modul | Viewer-Count |
|---|---|
| `OSimPro` (Durchlaufplan + Ressourcen) | ~35 |
| `OSimAZeit` (Arbeitszeit/Kapazität) | ~8 |
| `OSimFemos` (FEMOS-Simulator) | ~8 |
| `OSimINSIGHTS` (INSIGHTS-Auswertungen) | ~20 |
| `OSimSam` (SAM-Auswertungen) | ~12 |
| `ObjectBase` (Foundation) | ~3 |
| `OSimPro` Enterprise | ~2 |

---

## B) Layout-Patterns (5 Typen)

### Pattern 1: Property-Dialog (kein Graph)

Basis: `OViewerChildDialog`. UI: PropertySheets / OTableCtrl. Nicht Graph-relevant — der Vollständigkeit halber gelistet.

**Beispiele:** `PDlplPersonalViewer`, `PDlplBetriebsmittelViewer`, `AKapBedViewer`, `AGruppeViewer`, `PEntscheiderViewer`, `PDpKnAELogikSteuerungsViewer`.

### Pattern 2: Graph-Viewer (Single Canvas)

Basis: `OViewerChildDialog` + eingebetteter `GraphObjCtrl`. **Das ist unser aktueller Stand** mit `PDurchlaufplanViewerDesign`.

**Beispiele:** `PDlplViewerStd` (✅ wir haben Std-Variante), `PDlplConnKnotenViewer` (Knoten-Verbindungs-Detail), `PDlplConnMaterialViewer`, `PRessVerknuepfungViewer`.

**Funktionen:** Knoten/Link CRUD, Zoom, Kennzahl-Overlay, Drag-Repositionierung.

### Pattern 3: Matrix-Viewer (Grid mit Zeilen × Spalten)

Basis: `OViewerChildDialog` + `PMatrixBaseViewerOGCtrl : GraphObjCtrl`. Zellen sind `GObject`s, gerendert via `OGraphGrid.DrawCells()`.

**Beispiele:**
- `PRessBelegMatrixViewer` — Ressourcen-Belegungen × Knoten
- `PRessMengeMatrixViewer` — Mengen × Knoten
- `PSpeicherProzMatrixViewer` — Speicher × Prozesse
- `PSpeicherAktorMatrixViewer` — Speicher × Aktoren
- `PDpKnBetrPersMatrixViewer` — Knoten-intern Betriebsmittel × Personal
- `PDpKnSpeicherRessBelegMatrixViewer` — Knoten-intern Speicher × Ress
- `AEinsatzWunschViewer` (Matrix-Teil) — Personal × Zeit
- `EPEntFeldMatrixViewer` — Enterprise-Felder (Multi-Feld pro Zelle)

**Spezifische Features:** TreeCtrl-Filterung, Combobox-View-Modi (ALL/PERS/RESS, AND/OR), Block-Copy/Paste, Cell-Drag-Drop.

### Pattern 4: Hybrid-Viewer (Graph + ListBox)

Basis: `OViewerChildDialog`. UI: Graph-Canvas oben/links + ListBox unten/rechts, via Listener (`OListenerObj`) synchronisiert.

**Beispiele:**
- `AEinsatzWunschViewer` (vollständig: Graph + ListBox)
- `PEinsatzViewer`

**Spezifische Features:** Drag zwischen Graph und ListBox, Property-Sync via Listener.

### Pattern 5: Spezial-Controls (GraphObjCtrl direkt)

Basis: `GraphObjCtrl` ohne ChildDialog-Wrapper. Wenn man nur das Canvas braucht.

**Beispiele:** `PDpKnBetrPersMatrixOGCtrl`, `PDpKnSpeicherRessBelegMatrixOGCtrl` (wenn standalone genutzt).

### Plus: Simulator-Viewer-Familie

`PSimulatorViewer*`, `FSimulatorViewer*`, `ISimulatorViewer*`, `FSAMSimulatorViewer*` — eigene Welt, Ausgabe via TTY oder Bitmap oder Grafik, **live während Sim-Lauf**. Phase 4+ (Live-Viz).

---

## C) Klassen-Hierarchie (auf Foundation-Ebene)

```
OViewerChildDialog (Base)
├── PGObjBaseViewer (Graph-Viewer-Base)
│   ├── PDlplViewerStd          ← PDurchlaufplan Std
│   ├── PDlplConnKnotenViewer    (Knoten-Verbindung)
│   └── PDlplConnMaterialViewer  (Material-Fluss)
├── PMatrixBaseViewer (Matrix-Base)
│   ├── PRessBelegMatrixViewer
│   ├── PRessMengeMatrixViewer
│   ├── PSpeicherProzMatrixViewer
│   ├── PSpeicherAktorMatrixViewer
│   └── ...
├── OViewerDesign (Design-Base)
│   └── PDurchlaufplanViewerDesign  ← PDurchlaufplan Design (haben wir)
└── ... (weitere Property-Dialoge ohne Graph)

GraphObjCtrl (Control-Base)
├── PMatrixBaseViewerOGCtrl
│   ├── PRessBelegMatrixOGCtrl
│   ├── AEinsatzWunschViewerOGCtrl
│   └── ...
├── PGObjViewerCtrl (mit Kennzahl-Support)
├── PEinsatzzeitViewerOGCtrl
├── AKApFieldViewerOGCtrl
└── PDpKnBetrPersMatrixOGCtrl

OGraphGrid (Grid-Base)
├── PRessBelegMatrixGrid
├── PRessMengeMatrixGrid
├── PSpeicherProzMatrixGrid
├── PSpeicherAktorMatrixGrid
├── PDpKnBetrPersMatrixGrid
├── PEinsatzzeitGrid
├── AKApFieldViewerGrid
├── PDpKnAlternativGGrid (Multi-Grid in einem Knoten!)
└── PDpKnRuecksprungGGrid (analog)

GObjSub (Sub-Node Base, vergleichbar mit unserem TS GObjSub)
└── PRessKollektionGObj

GObject (Item-Base)
├── (Matrix-Cells: PRessBelegMatrixGObj, ...)
├── PDpKnAlternativGObj   (Multi-Grid-Knoten!)
├── PDpKnRuecksprungGObj  (Multi-Grid-Knoten!)
├── AGruppenAusgabeGFXGObj  (Gantt-Bar!)
└── EPEntFeldMatrixGObj    (Multi-Feld-Zelle!)

GLinkSquare → PAssozGLink (Assoziations-Link mit Status)
```

---

## D) Domänen-Gruppierung

| Domäne | Viewer | Status osim-ui |
|---|---|---|
| **Prozess-Modellierung (Durchlaufplan)** | PDlplViewerStd, PDurchlaufplanViewerDesign, PDlplConnKnotenViewer, PDlplConnMaterialViewer, PDlplProzTraceViewer | ✅ Design + Std (Welle G1-G26) |
| **Ressourcen-Planung** | PRessBelegMatrixViewer, PRessVerknuepfungViewer, PRessMengeMatrixViewer, PDlplBetriebsmittelViewer, PDlplPersonalViewer | Phase 1 hatte Property-Viewer (PDlplPersonal/Betriebsmittel) — Matrix-Varianten fehlen |
| **Speicher & Materialfluss** | PSpeicherProzMatrixViewer, PSpeicherAktorMatrixViewer, PDpKnSpeicherRessBelegMatrixViewer | fehlt komplett |
| **Arbeitszeit & Kapazität (AZeit)** | AEinsatzWunschViewer, AKapBedViewer, AKApFieldViewer, AGruppeViewer, AGruppenAusgabeGFXViewer | AGruppeViewer als Stub-Pattern (Phase 1) — Matrix + Gantt fehlen |
| **Knoten-interne Struktur** | PDpKnBetrPersMatrixViewer, PDpKnAELogikSteuerungsViewer, PDlplAWWMBViewer | fehlt |
| **Simulationen & Auswertungen** | ~40 Simulator-Viewer (P/F/I/SAM) | Phase 4+ (Live-Viz) |
| **Enterprise-Management** | EPEntAufgabeExViewer, EPEntFeldMatrixViewer | Phase 6+ optional |

---

## E) Foundation-Gap-Analyse — was fehlt in unserer TS-Foundation

Stand `portal/src/graph/foundation/` nach Welle G26:

| Feature | C++-Beleg | TS-Status | Priorität |
|---|---|---|---|
| **GObject Basis-Klasse + GObjLink + GObjSub** | `GraphObj.h` | ✅ Welle A-G7 | — |
| **OGraphGrid mit Col/Row-Listen + GOIns/GORemove** | `OGGrid.cpp` | ✅ Welle E-G7 | — |
| **InsertColBefore / InsertRowBefore** | `OGGrid.cpp:1602` | ✅ Welle F + G24/G26 | — |
| **Drag-Position-Persistenz (m_pntRaster-Sync)** | `OGOCtrl.cpp:1834` | ✅ Welle G8 | — |
| **fitView-Stable nach Edit** | (eigene UX-Anforderung) | ✅ Welle G22 | — |
| **Ctrl+Drag-Edge-Insert** | `OGOCtrl.cpp:1656+1834 INSERT_LINK` | ✅ Welle G25 | — |
| **Pan via Mittelmaustaste, kein Default-Drag-Pan** | (1:1 zum Original) | ✅ Welle G24 | — |
| **Grid-3D-Render (Shadow+Highlight pro Cell)** | `OGGrid.cpp:1037 _DrawGrid` | ✅ Welle G21 | — |
| **Matrix-Cell-Rendering (DrawCells pro Cell)** | `PMatrixBaseViewerOGCtrl::DrawCells()` | ❌ FEHLT | **HOCH** für Phase 2 |
| **Spalten-/Zeilen-Header (Datum, Ress-Name)** | `PRessBelegMatrixViewer` Headers | ❌ FEHLT | **HOCH** für Phase 2 |
| **Inline-Cell-Editing** | Matrix-Viewer (Property-Werte in Zellen) | ❌ FEHLT | **HOCH** für Phase 2 |
| **Block-Copy/Paste (Cell-Ranges)** | `PMatrixBaseViewerOGCtrl` `CopyCell2Buffer`/`PasteCellFromBuffer` | ❌ FEHLT | **MITTEL** |
| **TreeCtrl-Filter neben Canvas (Hybrid)** | `PRessBelegMatrixTreeCtrl` | ❌ FEHLT | **MITTEL** |
| **Hybrid Graph + ListBox mit Listener-Sync** | `AEinsatzWunschViewer` | ❌ FEHLT | **MITTEL** |
| **Kennzahl-Bar-Overlay (live während Sim)** | `DrawKennzahl()`, `m_drawKennzahl` Flag | ❌ FEHLT | Phase 4 |
| **Multi-Grid-Knoten (GObjAlt nested grids)** | `PDpKnAlternativGObj`, mehrere Sub-Grids | ⚠️ Welle G6 hat Sub-Plan-Hierarchie via m_lKnotenOber — **prüfen ob Multi-Grid-pro-Knoten funktioniert** | **MITTEL** |
| **Gantt-Bar-Rendering** | `AGruppenAusgabeGFXGObj`, horizontale Bars mit Zeit-Bounds | ❌ FEHLT | **MITTEL** für AZeit-Phase |
| **Assoziations-Link mit Status** | `PAssozGLink`, `PAssozBelegLinkStatus` | ⚠️ GLink Basis da — Status-Property fehlt | **MITTEL** |
| **Listener-Framework (OListenerObj/Sim)** | Überall — DB-Synchronisierung | ❌ FEHLT — wir nutzen Zustand-Store-Subscriptions, nicht 1:1-äquivalent | Phase 4 |
| **Print-Support (Mehrseiten + WMF-Export)** | `OnPrePrint`, `PageSpaceRefill`, `OnButtonCopyWMF` | ❌ FEHLT — Browser-Drucken via window.print() ist Notfall-Plan | Phase 6 |
| **OnDropText (Text-Drop von außen)** | Matrix-Viewer | ❌ FEHLT | NIEDRIG |
| **Konsistenz-Check (m_CheckKonsistenz, OnCheck)** | PDlplViewerStd, OViewerDesign | ❌ FEHLT | **MITTEL** für Phase 2 |

---

## F) Implementierungs-Prioritäten

### Phase 1.2 (direkter Nachfolger, Foundation-Erweiterung)

Bevor andere Viewer kommen, müssen die zentralen Foundation-Lücken geschlossen werden:

1. **Matrix-Cell-Rendering** — `OGraphGrid.DrawCells()` Pattern für Matrix-Viewer
2. **Spalten-/Zeilen-Header** — separate Header-Reihe/Spalte mit Custom-Content
3. **Inline-Cell-Editing** — Click-to-edit für Property-Werte in Zellen
4. **Multi-Grid-Knoten verifizieren** — `GObjAlt`-Pattern, ein Knoten mit N Kind-Grids

### Phase 1.3 (erste neue Viewer-Familie)

Mit der erweiterten Foundation drei prototypische Viewer:

5. **PRessBelegMatrixViewer** — kanonisches Matrix-Viewer-Beispiel
6. **PDlplConnKnotenViewer** — Graph-Viewer-Beispiel (Knoten-Detail)
7. **PRessVerknuepfungViewer** — Graph-Viewer mit Kennzahl-Overlay

### Spätere Phasen (parallel zu Sim-Lauf-Phasen)

8. **Hybrid Graph + ListBox** (Phase 2+)
9. **Kennzahl-Bar-Overlay** (Phase 4, parallel zu Live-Viz)
10. **Gantt-Bar-Rendering** (Phase 4-5)
11. **Listener-Framework** (Phase 4)
12. **Simulator-Viewer-Familie** (Phase 4+)

---

## G) Implementierungs-Patterns die wir aus G1-G26 mitnehmen

Was wir in der bisherigen Welle G1-G26 entwickelt haben, ist großteils übertragbar:

- **Wire ↔ Grid Bridge** (`wire-to-grid.ts`) — generalisiert auf Matrix-Klassen
- **GOIns/GORemoveObj + Auto-Grow** (Welle E, G7) — Foundation für Matrix-Cell-Insertion
- **`m_pntRaster` als kanonische Quelle** (Welle G2) — Wire-Daten als Single Source of Truth
- **`findEdgeCell` mit Cascade-Mutation** (Welle G24, G26) — auch für Matrix-Cell-Insertion nutzbar
- **GObjSub mit D_OPEN/D_CLOSED-Toggle** (Welle G6) — Basis für Multi-Grid-Knoten
- **Ctrl+Drag für komplexe Interaktionen** (Welle G25) — auch für Block-Selection in Matrix
- **3FLS-EAM-Tokens + 3D-Cell-Rendering** (Welle G17, G21) — generalisierbar auf Matrix-Cells

---

## H) Nicht in der Foundation — sondern in Viewer-Code

Für jeden Viewer separat zu implementieren (nicht Foundation):

- **Spezifische Wire-Klass-Listen** (welche Klassen in welcher Combobox)
- **Default-Klasse pro ContextMenu** (Vorauswahl)
- **Tree-Filter-Kategorien** (Welcher Tree-Branch zeigt was)
- **Cell-Content-Renderer** (was steht in einer Matrix-Zelle?)
- **Konsistenz-Regeln** (welche Links sind erlaubt?)
- **Sim-Event-Listener** (welche Events triggern welche UI-Updates?)

---

## I) Datei-Inventar (Audit-Source)

Audit hat folgende C++-Header gelesen (Auszug):

- `PDlplViewerStd.h` + `.cpp` — Durchlaufplan Std (Referenz)
- `PDurchlaufplanViewer.h` (`PDurchlaufplanViewerDesign.cpp`)
- `PGObjBaseViewer.h` + `.cpp` — Graph-Viewer-Base
- `PDlplConnKnotenViewer.h` + `.cpp`
- `PDlplConnMaterialViewer.h` + `.cpp`
- `PRessBelegMatrixViewer.h` + `.cpp` — Matrix-Referenz
- `PRessMengeMatrixViewer.h` + `.cpp`
- `PRessVerknuepfungViewer.h` + `.cpp`
- `PSpeicherProzMatrixViewer.h` + `.cpp`
- `PSpeicherAktorMatrixViewer.h` + `.cpp`
- `PDpKnBetrPersMatrixViewer.h` + `.cpp`
- `PDpKnSpeicherRessBelegMatrixViewer.h` + `.cpp`
- `PDpKnAELogikSteuerungsViewer.h` + `.cpp`
- `AEinsatzWunschViewer.h` + `.cpp` — Hybrid-Referenz
- `AKApFieldViewer.h` + `.cpp`
- `AKapBedViewer.h` + `.cpp`
- `AGruppeViewer.h` + `.cpp`
- `AGruppenAusgabeGFXViewer.h` (vermutet)
- `PSimulatorViewer*.h` + `.cpp` (Pro-Modul)
- `FSimulatorViewer*.h` + `.cpp` (FEMOS)
- `ISimulatorViewer*.h` + `.cpp` (INSIGHTS, ~15 Varianten)
- `FSAMSimulatorViewer*.h` + `.cpp` (SAM)
- `EPEntAufgabeExViewer.h` + `.cpp`
- `EPEntFeldMatrixViewer.h` + `.cpp`
- `PEntscheiderViewer.h` + `.cpp`
- `PDlplPersonalViewer.h`, `PDlplBetriebsmittelViewer.h`, `PDlplAWWMBViewer.h`, `PDlplProzTraceViewer.h`
- `OViewerDesign.h` + `.cpp`
- `OSimListTableViewer.h` + `.cpp`

Foundation-Headers (separat gelesen für GraphObj-Pipeline):
- `GraphObj.h`, `OGGrid.cpp`, `OGOCtrl.cpp`, `OGOSub.cpp`, `OGObjODlp.cpp`, `OGObjLink.cpp`

---

**Status:** Audit-Output, **vor Implementierung Stichprobe verifizieren**. Einzelne Klassen-Namen oder Hierarchien können vom Audit falsch erfasst worden sein.
