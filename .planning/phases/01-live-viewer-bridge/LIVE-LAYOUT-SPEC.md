# LIVE-LAYOUT-SPEC — Struktur der /live-Sicht (PSim-treu)

Status: verbindlich. Quelle: `osim2004-ui-analysis.md §2.1` (PSim-Menü),
`GRAFIKFENSTER-SPEC.md` (Simulationsgrafik, 3 Modi), `AUSWERTUNG-CHART-SPEC.md`
(3D-Balken + ø). Entstanden aus Browser-UAT 2026-05-30.

---

## 0. Problem (was war falsch)

Die bisherige /live hatte eine **flache Tab-Leiste oben**, in der „Durchlaufplan"
der Default-/Primär-Tab war und die Lauf-Steuerung trug. Das vermengt drei im
PSim getrennte Dinge:

1. **Simulationsgrafik** = das animierte Grafikfenster mit 3 Modi
   (Belegung / Warteschlangen / Qualifikation) — `PSimulatorViewerGfx` → `OGfxCtrl`.
2. **Durchlaufplan** = Prozessnetz/Modellierung — `PDurchlaufplanViewerDesign`
   (`OGraphCtrl`). Gehört NICHT in die Simulationsgrafik.
3. **Auswertung** = eigenes PSim-Menü, primär **3D-Balkendiagramme** (`OChartCtrl`).

Konsequenz dieser SPEC: /live spiegelt das PSim-Menü, nicht eine flache Tableiste.

---

## 1. Leitstruktur (1:1 zum PSim-Menü)

| PSim-Menü | Inhalt | UI-Element |
|---|---|---|
| **SIMULATOR > Steuerung** | Start/Weiter/Abbruch/Reset, Periode, Sim-Zeit | Steuerleiste (oben, geteilt) |
| **SIMULATOR > Grafik** | Grafikfenster, 3 Modi | Gruppe „Simulation" im Menübaum |
| **AUSWERTUNG > …** | KPI-Auswertungen (Balken + Tabellen) | Gruppe „Auswertung" im Menübaum |

Der **Durchlaufplan-Gantt** wird aus /live ENTFERNT (Modellierung, nicht Sim-Grafik).
`Einsatzzeit`-Gantt ist redundant mit dem Grafikfenster-Modus „Belegung" → ebenfalls
aus dem Menü entfernt. `Schicht` bleibt als Tabelle unter „Auswertung".

---

## 2. Layout

```
┌─ Steuerleiste (oben, GETEILT über alle Sichten) ────────────────────┐
│  ▶ Start/Weiter   ⏸ Abbruch   ↺ Zurücksetzen                         │
│  Periode N · Simulationszeit <d h m>   [Zoom: Fit Woche Tag Std 15m] │
├──────────────────┬──────────────────────────────────────────────────┤
│ Menübaum (links) │  Aktiver Viewer (rechts)                          │
│                  │                                                    │
│ ▾ Simulation     │   kind=grafik → <Grafikfenster modus=…>           │
│    Belegung      │   kind=viewer → <StreamRouter tab=…>              │
│    Warteschlangen│                                                    │
│    Qualifikation │                                                    │
│ ▾ Auswertung     │                                                    │
│    Gesamt        │                                                    │
│    Produktionsa. │                                                    │
│    Betriebsmittel│                                                    │
│    …             │                                                    │
└──────────────────┴──────────────────────────────────────────────────┘
```

- **Steuerleiste** ist NICHT mehr Teil eines einzelnen Viewers — ein Lauf, viele
  Sichten. Zoom-Buttons sind nur bei `kind=grafik` aktiv (sonst ausgegraut/aus).
- **Default-Auswahl** beim Betreten: `Simulation → Belegung`.
- **Menübaum** ist zweistufig (Gruppe → Blatt). Aktives Blatt hervorgehoben.

---

## 3. Menübaum-Modell (viewer-config.ts)

```
LiveMenuLeaf  = { id, label, kind: "grafik"|"viewer", modus?, tabId? }
LiveMenuGroup = { id, label, children: LiveMenuLeaf[] }
LIVE_MENU: LiveMenuGroup[]
```

Gruppen + Blätter:

- **Simulation** (`kind=grafik`, treibt den Grafikfenster-`modus`):
  - Belegung → `modus=belegung`
  - Warteschlangen → `modus=warteschlangen`
  - Qualifikation → `modus=qualifikation`
- **Auswertung** (`kind=viewer`, → `viewerTabById(tabId)` → `StreamRouter`):
  - Gesamt, Produktionsaufträge, Bestellaufträge, Personal, Betriebsmittel,
    Kauf-/Eigenlager, Kalkulation, Warteschlange, Nicht bearbeitet, Schicht.

`VIEWER_TABS` (flach) bleibt als Registry für `StreamRouter`/`viewerTabById`
bestehen (keine Breaking Changes an bestehenden Tests). `LIVE_MENU` ist die neue
Navigations-Quelle; Durchlaufplan/Einsatzzeit erscheinen NICHT mehr im Menü.

---

## 4. Auswertungs-Balkendiagramme (Ziel, Phase 3)

Jede KPI-Auswertung ist im Original ein **3D-Balkendiagramm** (`OChartCtrl`,
Modus `bmStd`, AUSWERTUNG-CHART-SPEC):

- Kategorien = Listenelemente (je Auslöser / je Betriebsmittel), Balken **grün**
  `RGB(0,224,0)`.
- **+1 Summenbalken**: Mittelwert → Label **„ø"**, **rot** `RGB(224,0,0)`
  (bzw. Summe → „Sum", blau `RGB(0,0,224)`).
- Wert über jedem Balken (`%6.2f`), Achse 0…nice-rounded (5 Intervalle), Titel =
  KPI-Name.

Web-Umsetzung: wiederverwendbarer `AuswertungBarChart` (SVG, 2D-modern, Prinzip +
ø-Konvention 1:1). Keine erfundenen Zahlen: P5-D-gated → „(Slice offen)".

---

## 5. Umsetzungs-Reihenfolge (vom Nutzer bestätigt 2026-05-30)

1. **UI-Umbau** (diese SPEC, Phase 01-16): Menübaum links, Steuerleiste oben,
   Durchlaufplan/Einsatzzeit aus dem Menü. Jederzeit lauffähig.
2. **P5-D-Engine** (eigene Phase): Betriebsmittel-Auslastung real berechnen
   (Kapazitätsbestand/-bedarf, Auslastung %, Einsatzzeit, Zeitstressgrad) — 1:1
   zu `PRessBeleg`-Kennzahlen, Reproduzierbarkeitsvertrag gewahrt.
3. **Auswertungs-Charts** (eigene Phase): `AuswertungBarChart` mit Echtdaten;
   Durchlaufzeit-/Kapazitäts-Balken wie im PSim-Auswertungsmenü.

---

## 6. Abnahmekriterien Phase 1 (UI-Umbau)

- [ ] /live zeigt links den zweistufigen Menübaum (Simulation / Auswertung).
- [ ] Steuerleiste (Start/Periode/Sim-Zeit) sitzt oben, geteilt über alle Sichten.
- [ ] Default = Simulation → Belegung (Grafikfenster, NICHT Durchlaufplan-Gantt).
- [ ] Durchlaufplan- und Einsatzzeit-Gantt erscheinen nicht mehr im Menü.
- [ ] Modus-Wechsel (Belegung/Warteschlangen/Qualifikation) über den Baum.
- [ ] Auswertungen über den Baum erreichbar (bestehende Tabellen/Charts).
- [ ] tsc 0, vitest grün, eslint 0.
