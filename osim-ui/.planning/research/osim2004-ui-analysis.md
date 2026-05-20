# OSim 2004 UI Analyse — Referenzdokumentation für Web-UI Neuimplementierung

**Erstellt:** 2026-05-20
**Quelle:** Vollständige Durchsuchung der Originalcode-Architektur (C++ MFC, Windows 2004)
**Fokus:** User-sichtbare UI, Workflows, Menüstrukturen, Datenobjekte, Visualisierungen

---

## 1. Verzeichnisstruktur & UI-Module

### 1.1 DLL-Architektur (Windows/MFC-basiert)

Die OSim 2004 Anwendung bestand aus mehreren DLLs mit klaren Verantwortlichkeiten:

| DLL | Rolle | UI-Relevanz |
|-----|-------|-------------|
| **OFC.dll** | Framework Controls | Basis-UI Komponenten, graphische Viewer |
| **OSimBase.dll** | Objektbank/Repository | Basis Datenmodell, generische Viewer |
| **OSimPro.dll** | Hauptprozess-Editor | Durchlaufplan-Editor, Simulator, Ressourcen-Editor |
| **OSimAZeit.dll** | Arbeitszeitmodule | Zeitmanagement, Gruppenplaner, Kapazitätsbetrachtung |
| **ObjectBase.dll** | Objekt-Framework | Meta-Viewer-System, generische UI-Steuerung |

Die OSimPro.dll ist mit 3,4 MB die größte und komplexeste Komponente.

### 1.2 Hauptverzeichnisstruktur

`
OSimV01(Fj)/
├── OSim/                      # Mini-Test App für Objektbank
├── OSimPro/                   # Hauptanwendung
├── OSimBase/                  # Basis Objekt-Repository
├── OSimAZeit/                 # Arbeitszeitmodellierung
├── ObjectBase/                # Framework (UI-Grundlagen)
├── ofc/                       # Framework Controls (Graphik, Charts, Design)
├── inc/                       # Header-Dateien (48+ Viewer-Klassen!)
├── bmp/, ico/, cur/           # Ressourcen (Bilder, Icons, Cursor)
└── oic/                       # Ressourcen-Icons (.ido-Format)
`

### 1.3 Viewer-Architektur: 48+ spezialisierte Viewer-Klassen

Aus der inc/-Analyse erkannt:

**Prozess-Viewer:**
- PDurchlaufplanViewer, FDurchlaufplanViewer, IDurchlaufplanViewer
- PDurchlaufplanViewerDesign (graphischer Editor)

**Simulator-Viewer:**
- FSimulatorViewer (full simulator)
- PSimulatorViewer (process-oriented)
- ASimulatorViewer (arbeitszeit)
- FSAMSimulatorViewer (SAM variant)

**Arbeitszeitviewer:**
- AEinsatzWunschViewer, AEinsatzWunschViewerOGCtrl
- AGruppeViewer
- AKapBedViewer
- PEinsatzViewer, PEinsatzzeitViewerOGCtrl

**Matrix/Tabellen-Viewer:**
- PRessBelegMatrixViewer, PRessMengeMatrixViewer
- PDpKnBetrPersMatrixViewer, PSpeicherProzMatrixViewer
- PRessVerknuepfungViewer

**Spezialisierte Viewer:**
- OViewerDesign (Design-Framework)
- OViewerGeneric (generischer Fallback)
- OViewerCluster (UI-Management)

---

## 2. Menüstruktur & Hauptansichten

### 2.1 Top-Level Menü (aus OSimPro.rc analysiert)

**DATEI**
- Neu...
- Öffnen...
- Speichern
- Speichern unter...
- [MRU Files]
- Drucken
- Druckansicht
- Beenden

**MODELLIERUNG** (3 Perspektiven + Arbeitszeitmodellierung)
- Prozessorientierte Sicht
  - Durchlaufpläne (List Editor)
  - Durchlaufplaneditor (graphisch)
  - Auslöser
  - Externe Verteilungen
- Ressourcenorientierte Sicht
  - Belegungsressourcen
  - Prozessspeicher
  - Ressourcenverknüpfung
  - Ressourcenverknüpfungsmatrix
- Materialorientierte Sicht
  - Mengenressourcen
  - Mengenressourcenverknüpfung
- Arbeitszeitmodellierung
  - Einsatzzeiten
  - Einsatzzeitviewer

**SIMULATOR** (5 Views + Management)
- Neuer Dokumenten-Viewer
- Fenster-Management: Kaskadieren / Horizontal aufteilen / Vertikal aufteilen
- Steuerung (Standard Control Panel)
- Grafik (Graphische Animation)
- Hintergrundbild
- Konfiguration (Simulation Parameter)
- Gesamtmaske (Full Dashboard)
- Modell Generator

**AUSWERTUNG** (KPI Reports)
- Durchlaufplanauslöser
  - Anzahl fertiggestellter Auslösungen
  - Mittlere Durchlaufzeit
- Durchlaufpläne
  - Anzahl fertiggestellter Auslösungen
  - Mittlere Durchlaufzeit
  - Minimale Durchlaufzeit
  - Zielerreichungsgrad Durchlaufzeit
  - Prozesskosten
- Belegungsressource
  - Theoretischer Kapazitätsbestand
  - Abgearbeiteter Kapazitätsbedarf
  - Auslastung
  - Einsatzzeit
  - Simulierte Periodenkosten
  - Kostensatz
  - Zeitstressgrad
  - Zielerreichungsgrad Ermüdungsgrad

**SPEZIAL**
- Objektbank Viewer
- C++-Export
- Txt-Export
- Einstellungen

**HILFE**
- Über OSim

### 2.2 Kontextmenüs (Rechtsklick-Popups im Graphik-Editor)

**SubNode/AltNode Menus:**
- Knotenobjekt einfügen
- Kantenobjekt einfügen / Verbindung einfügen
- Alternativknoten einfügen
- Spalte/Zeile einfügen/löschen
- Knoten öffnen/schließen (Hierarchie navigieren)
- Nachfolger/Vorgänger zeigen
- Alternative einfügen/löschen

**OGraphCtrl Popup:**
- Zoom In/Out
- Gitter anzeigen/zurücksetzen
- ToolTips toggen

---

## 3. User Workflows / Use Cases

### 3.1 Haupt-Workflow: "Modell erstellen und simulieren"

"MODELL → EDITOR → SIMULATOR → REPORT" ist der klassische Ablauf:

1. **MODELL LADEN** — Datei > Neu/Öffnen
2. **MODELL AUFBAUEN** (Modellierung)
   - Durchlaufpläne: Knoten + Kanten graphisch zeichnen
   - Ressourcen: Maschinen/Personal/Speicher definieren
   - Verknüpfungen: Knoten ↔ Ressourcen
   - [Optional] Arbeitszeitmodell: Schichten, Kapazität
3. **SPEICHERN** — Datei > Speichern → .otx-Datei
4. **SIMULATOR KONFIGURIEREN** — Simulator > Konfiguration
5. **SIMULATOR STARTEN** — Simulator > Grafik/Steuerung, Play-Button
6. **LIVE-MONITORING** — Farben ändern, Statistiken updaten
7. **ERGEBNISSE ANSCHAUEN** — Auswertung > [KPI-Reports]

### 3.2 Nested Edit Workflow: "Hierarchische Durchlaufpläne"

`
Durchlaufplan A (top-level)
  └─ Knoten 1
      └─ Rechtsklick > "Knoten öffnen"
          → Unterdurchlaufplan B wird in neuem Tab/Fenster geöffnet
          → Knoten 2, Knoten 3, ... editieren
          → Zurück zu A
`

### 3.3 Multi-View Workflow: "Verschiedene Perspektiven gleichzeitig"

`
Simulator > Fenster Management
  ├─ Neuer Dokumenten-Viewer
  ├─ Kaskadieren / Horizontal aufteilen / Vertikal aufteilen

Typisch: Steuerung-View (links) + Grafik-View (rechts) + Report (unten)
→ Alle gleichzeitig sichtbar und synchronisiert
`

---

## 4. Zentrale Datenobjekte (User-Terminologie)

### 4.1 Kern-Konzepte

| Begriff | Bedeutung |
|---------|-----------|
| **Durchlaufplan** | Netzwerk von Prozessschritten mit Abhängigkeiten; kann hierarchisch verschachtelt sein |
| **Knoten** | Ein Prozessschritt; kann auf Unterdurchlaufplan verlinken |
| **Kante** | Abhängigkeit zwischen zwei Knoten (sequenziell, parallel, alternativ) |
| **Auslöser** | Ereignis, das einen Durchlaufplan startet (Ankunftszeitpunkte definieren) |
| **Auftrag** | Eine Instanz eines Durchlaufplans während der Simulation |
| **Belegungsressource** | Maschine/Kapazität mit Verfügbarkeitszeitraum |
| **Mengenressource** | Material mit Mengenbeschränkung |
| **Prozessspeicher** | Puffer zwischen Schritten (Entkopplung) |
| **Verteilung** | Statistisches Modell (Exponential, Normal, Konstant, Custom) |
| **Aktor** | Aktives Element (z.B. Person), das Schritte ausführt |
| **Einsatzzeit** | Verfügbarkeitszeitraum für Personal/Aktor |
| **Szenario** | Variante von Konfiguration/Schichten |
| **Lauf** | Eine Simulationsausführung mit Statistiken |
| **Report** | Auswertung mit KPIs und Grafiken |

### 4.2 Objektmodell-Hierarchie

`
OSimBase (Repository)
├── PDurchlaufplan
│   ├── PDurchlaufplanKnoten (ordered list)
│   │   └── [kann auf PDurchlaufplan verweisen → Hierarchie]
│   ├── PDurchlaufplanKante
│   ├── Auslöser
│   └── [weitere Assoziationen]
│
├── Ressourcen
│   ├── BelegungsRessource
│   ├── MengenRessource
│   ├── ProzessSpeicher
│   └── [Verknüpfungen]
│
├── OSimAZeit Module
│   ├── Agruppe (Personalgruppe)
│   ├── AEinsatzWunsch (Schicht)
│   ├── AKapBedarf (Kapazität)
│   └── Verteilungen
│
└── SimulationConfig
    ├── Lauf-Parameter
    ├── Ankunfts-Verteilungen
    └── [Solver-Optionen]
`

---

## 5. Reports & Visualisierungen

### 5.1 Report-Typen (Auswertung-Menü)

**Durchlaufplan-Level KPIs:**
- Anzahl fertiggestellter Auslösungen (Durchsatz)
- Mittlere Durchlaufzeit
- Minimale Durchlaufzeit
- Zielerreichungsgrad Durchlaufzeit (vs. Zielzeit)
- Prozesskosten (gesamt & pro Stück)

**Knoten-Level KPIs** (Submenü im Graphik-Editor):
- Obige KPIs für einzelne Knoten (als Overlay auf Graphik angezeigt)

**Ressourcen-Level KPIs:**
- Theoretischer Kapazitätsbestand (Verfügbarkeit)
- Abgearbeiteter Kapazitätsbedarf (tatsächlicher Bedarf)
- Auslastung (%)
- Einsatzzeit (Stunden)
- Perioden-Kosten (simuliert)
- Kostensatz (€/Stunde)
- Zeitstressgrad (Belastungsindex)
- Zielerreichungsgrad Ermüdungsgrad

### 5.2 Visualisierungsformen

**OChartCtrl (Chart Library):**
- Textdarstellung (Tabelle mit Zahlen)
- 3D-Balkendiagramm (Standard)
- Normierte 3D-Balken (Stacked/Normalized)
- 2D-Balken (dünn, einfach)
- Kombinierte 3D-Balken (Mixed)

**OGraphCtrl (Prozessnetz):**
- Graphisches Rendering des Durchlaufplans
- Knoten mit Status-Farben (frei/belegt/wartend)
- Kanten zeigen Abhängigkeiten
- **Live Animation:** Farben ändern während Simulation
- **Kennzahl-Overlay:** Zahlen optional auf Knoten/Kanten anzeigen

**Matrix-Viewer:**
- Beziehungen als 2D-Tabelle
- Zeilen = Knoten, Spalten = Ressourcen
- Zellen interaktiv für Details

**Einsatzzeit-Viewer:**
- Schichten zeitlich hintereinander (Gantt-ähnlich)
- Farben für Schicht-Typen
- Zoom In/Out für Zeitauflösung

---

## 6. Datei-Formate

### 6.1 Primärformat: .otx (OSim Textformat)

- **Textbasiert** (proprietär oder XML-ähnlich)
- **Vollständig:** Enthält Durchlaufpläne, Ressourcen, Konfiguration
- **Speichern:** Datei > Speichern
- **Laden:** Datei > Öffnen

### 6.2 Weitere erkannte Formate

| Format | Kontext |
|--------|---------|
| .osp | OSim Projekt/Konfiguration? |
| .asp | (unklar, evtl. ASP-Scripts im Export) |
| .ftx | Flat Text Format (Reports) |
| .pse | Projekt-Einstellungen? |
| .odh | ODesign Header (Graphik-Layouts)? |

### 6.3 Export-Optionen

- **C++-Export:** Menü > Spezial > C++-Export → .cpp/.h Dateien
- **Text-Export:** Menü > Spezial > Txt-Export → .ftx/.txt
- **Copy WMF:** Chart/Graphik > Copy to Clipboard → [Windows Metafile für Word/Powerpoint]
- **Print/Print Preview:** Datei > Drucken

---

## 7. Dokumentation & Beispiele

### 7.1 Dissertations-Material (docs/dissertations/jonsson-chapters/)

Detaillierte Unterlagen über Simulation & Objektmodell:

- ch00: Einführung & Kontext
- ch01: Konzepte zur Produktionssimulation
- ch02: Unified Modeling Language
- ch03: **Objektmodell für OSim** (Kern-Theorie)
  - Durchlaufpläne, Ressourcen (passiv & aktiv), Prozessentitäten, Hierarchisierung, Konfig
- ch04: Das Simulationsverfahren (Ablauf)
- ch05: Anwendungsbeispiel
- ch06-08: Zusammenfassung, Literatur, Anhang

→ **Essenziell für Verständnis der Engine-Logik und des Datenmodells**

### 7.2 Didaktisches Material: PPS-Theorie-Planspiel.ppt

- **Lehr-Präsentation** über Production Planning & Scheduling
- **Planspiel-Ansatz:** Studierende simulieren manuell, dann mit OSim
- **Fokus:** Engpässe, Durchlaufzeiten, Ressourcenauslastung verstehen
- **Implikation:** OSim ist Lehrsoftware → UI sollte intuitiv & erklärbar sein

### 7.3 Beispielmodelle (Vorstellung04/)

| Datei | Größe | Beschreibung |
|-------|-------|-------------|
| AZ-Tool.otx | 1,5 MB | Arbeitszeitmodell-Demo |
| Bosch2_wechseln.otx | 18 MB | **Großes Produktionsmodell** (realistisch) |
| Fertigungsstruktur1_mit_AslFj.otx | 272 KB | Komplexe Fertigungsstruktur |
| Dummy.otx | 228 KB | Einfaches Test-Modell |
| test.otx, test_2.otx | 11-50 KB | Mini-Modelle |

→ **Perfekt für Regression-Tests des neuen Web-UIs**

---

## 8. UI-Architektur-Patterns

### 8.1 Viewer-System (Core Design Pattern)

Aus OViewer.h dokumentiert:

`
┌─────────────────────────────────────┐
│   Viewer-Frame (OViewerFrameDlg)   │  ← Fenster mit Menu/Toolbar
├─────────────────────────────────────┤
│  Client-Ctrl (OCtrlViewClient)      │  ← Verwaltet "aktuelles Objekt"
│  └─ Child-Dialog (OViewerChildDialog)│  ← Die eigentliche UI
│     ├─ Standard Controls            │
│     ├─ OCtrl's (datengebunden)      │
│     └─ Custom Controls              │
│        └─ [nested: Child-Ctrl+Dialog]
└─────────────────────────────────────┘
`

**Prinzipien:**
- **Objektzentriert:** Ein Viewer = Ein Objekt
- **Metaklassen:** OMetaViewer definiert UI-Erscheinungsbild pro Objekttyp
- **Auto-Datenaustausch:** OCtrl's binden Attribute an Controls
- **Hierarchische Navigation:** Parent/Child Relationships

### 8.2 Standard OCtrl-Typen

- OCtrlBool (Checkbox)
- OCtrlEnum (Dropdown)
- OCtrlLink (Objekt-Referenz)
- OCtrlList (Liste)
- OCtrlVariableEdit (Text/Zahl-Input)
- OTableCtrl (Tabelle)
- OChartCtrl (Charts)
- OGraphCtrl (Prozessnetz)
- ODesignCtrl (Graphik-Editor)

### 8.3 Viewer-Klassifizierung

| Typ | Beispiel | UI |
|-----|----------|-----|
| Table List | PDurchlaufplanListViewer | OTableCtrl (sortierbar) |
| Design | PDurchlaufplanViewerDesign | ODesignCtrl (graphisch zeichnend) |
| Property | PDpKnWunschViewer | Tabs + OCtrl's |
| Grafik | PSimulatorViewerGfx | OGraphCtrl + Animationen |
| Matrix | PRessBelegMatrixViewer | 2D OTableCtrl (interaktiv) |

### 8.4 Standard UI-Elemente

**Toolbar-Buttons (Navigation):**
`
[◄◄] [◄] [►] [►►]  Previous/First/Next/Last Element
[+]  [-]  [x]      Add/Remove/Delete
[=]                Edit Properties
[↻]                Refresh
`

**Menü-Patterns:**
- Alt+N: Neu
- Alt+O: Öffnen
- Alt+S: Speichern
- Alt+H: Hilfe

---

## 9. Spezialmodule

### 9.1 OSimAZeit (Arbeitszeitmodellierung)

**Fokus:** Personal/Schichten/Kapazitätsplanung

**Hauptkomponenten:**
- **Agruppe:** Personalgruppen (Schichteinteilung)
- **AEinsatzWunsch:** Einsatzzeiträume (Schichten)
- **AKapBedViewer:** Kapazitätsbedarf pro Zeitraum
- **AEinsatzWunschViewer:** Graphische Schichtmuster

**Größe:** OSimAZeit.dll ≈ OSimPro.dll (1,9 MB) → sehr komplexes Modul

**Use Case:** "Was-wenn Szenarien" für Personalplanung

### 9.2 Weitere Module

- OSimFemos: (experimentell?)
- OSimINSIGHTS: Auswertungs-Modul?
- OSimSAM: (unklar, Schedule-optimization?)

---

## 10. Simulation Runtime

### 10.1 Simulator Control Panel

**Buttons:**
- [Start] — Simulation starten
- [Break/Pause] — Pausieren
- [Reset] — Zurücksetzen

**Slider:**
- Event Block Size (Batch-Größe pro Simulationsschritt)
- Refresh Rate (UI-Update-Häufigkeit)

**Info:**
- Progress Bar (Fortschritt)
- Status-Text

### 10.2 Live Animationen (während Lauf)

**OGraphCtrl:**
- Knoten färben sich (Status: frei/belegt/wartend)
- Durchlaufzahlen live aktualisieren
- Prozessfluss visualisieren

**Optional OChartCtrl:**
- Statistik-Balken live updaten
- Trade-off: CPU-Last vs. Reaktivität (Slider steuert)

### 10.3 Event Processing

**Diskrete-Event Simulation:**
- Alle Änderungen geschehen zu Simulation-Zeitpunkten
- Events werden gebatchelt (Event Block Size) für Performance
- Nach jedem Batch refreshed UI (abhängig von Refresh Rate)

---

## 11. Zusammenfassung: Typischer User-Workflow

`
[START OSim]

1. MODELL LADEN
   → Datei > Öffnen > .otx auswählen (z.B. Vorstellung04/Dummy.otx)

2. EDITOR ÖFFNEN
   → Modellierung > Prozess > Durchlaufplaneditor
   → Graphisches Fenster mit Netzwerk

3. MODELL BEARBEITEN
   → Rechtsklick > Knoten/Kante einfügen
   → Doppelklick > Properties editieren

4. RESSOURCEN ZUORDNEN
   → Modellierung > Ressource > [Ressourcenverknüpfung]
   → Matrix zeigt Knoten ↔ Ressource Beziehungen

5. SPEICHERN
   → Datei > Speichern

6. SIMULATOR STARTEN
   → Simulator > Grafik [oder Steuerung]
   → [Optional: Fenster teilen, mehrere Views]
   → [Start-Button]
   → Animation läuft, Statistiken updaten

7. ERGEBNISSE
   → Auswertung > Durchlaufpläne > [KPI]
   → Chart zeigt Bild
   → [Optional: Copy WMF für Weitergabe]
`

---

## 12. Key Design Insights für Web-UI

1. **Modell-Editor ist zentral:** Graphischer Durchlaufplan-Editor must-have
2. **Multi-View ist Standard:** Benutzer öffnen mehrere Fenster gleichzeitig (Tabs/Split-Panels)
3. **Live Simulation:** Animation + Statistik während Lauf → WebSocket/Real-time Updates
4. **Reports = Charts:** Fast alle Auswertungen sind Visualisierungen
5. **Viewer-Pattern ist elegant:** "Ein Objekt = Ein Viewer" → React Components
6. **Hierarchie:** Nested Durchlaufpläne → Tree Navigation
7. **3-Perspektiven-Denken:** Prozess (Knoten/Kanten) + Ressourcen (Wer) + Zeit (Wann)
8. **Lehr-Software:** UI muss intuitiv + erklärbar sein
9. **Beispielmodelle wichtig:** Regression-Tests & User Learning
10. **Export ist wichtig:** Report-Generierung, Download, Weitergabe

---

**Analyse abgeschlossen: 2026-05-20**
