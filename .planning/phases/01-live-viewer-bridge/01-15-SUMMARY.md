---
phase: 01-live-viewer-bridge
plan: 15
subsystem: osim-ui-frontend
tags: [grafikfenster, gantt_einsatz, gantt_wartequeue, auftrag_oid, auswertung-chart, 3d-balken, tdd, oid-color]

requires:
  - phase: 01-live-viewer-bridge
    plan: 14
    provides: "Echte gantt_einsatz + gantt_wartequeue Streams mit auftrag_oid"

provides:
  - "AuftragColor.ts: auftragColor(oid) RGB((oid%4)*64,...) 1:1 PGfxRowObj.cpp:368-378"
  - "grafikfenster-modes.ts: timeAxisScale (SPEC §2.4), time2client, GRAFIKFENSTER_MODES"
  - "Grafikfenster.tsx: faithful OSim-Layout (3 Modi, Ressourcen×Zeit, rote Zeit-Linie)"
  - "GrafikfensterControls.tsx: Steuerleiste 1:1 SPEC §1 (Start/Abbruch/Zurueck + Felder)"
  - "AuswertungChart.tsx: 3D-Balken (bmStd) mit gruen+rot-oe, Wert-Labels, 5-Intervall-Achse"
  - "live.tsx: Durchlaufplan-Tab auf Grafikfenster + GrafikfensterControls umgebaut"
  - "types.ts: StreamTag um gantt_wartequeue erweitert (7 Streams)"
  - "stream-router.tsx: gantt_wartequeue in switch-Case ergaenzt"

affects:
  - "01-16+ (Browser-UAT): Grafikfenster schliessen sichtbares Symptom (leeres Fenster)"

tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN fuer alle drei Tasks"
    - "OID→RGB-Quantisierung (oid%4)*64 ohne Status-Palette"
    - "Stable Selector via EMPTY_FRAMES Konstante (useMemo-Hygiene)"
    - "data-testid live-start-run als E2E+Unit-kompatibler Ankerpunkt"
    - "inline-style nur fuer datengetriebene OSim-Farben (1:1-Treue-Ausnahme)"

key-files:
  created:
    - "osim-ui/portal/src/features/live-stream/components/AuftragColor.ts"
    - "osim-ui/portal/src/features/live-stream/components/grafikfenster-modes.ts"
    - "osim-ui/portal/src/features/live-stream/components/Grafikfenster.tsx"
    - "osim-ui/portal/src/features/live-stream/components/GrafikfensterControls.tsx"
    - "osim-ui/portal/src/features/live-stream/components/AuswertungChart.tsx"
    - "osim-ui/portal/src/features/live-stream/__tests__/AuftragColor.spec.ts"
    - "osim-ui/portal/src/features/live-stream/__tests__/Grafikfenster.spec.tsx"
    - "osim-ui/portal/src/features/live-stream/__tests__/AuswertungChart.spec.tsx"
  modified:
    - "osim-ui/portal/src/features/live-stream/types.ts (gantt_wartequeue)"
    - "osim-ui/portal/src/features/live-stream/stream-router.tsx (gantt_wartequeue Case)"
    - "osim-ui/portal/src/routes/_authenticated/live.tsx (Grafikfenster-Tab)"

key-decisions:
  - "inline-style fuer OID-Farben und Chart-Farben: 1:1-Treue, kein Token-Branding"
  - "Qualifikation-Modus ehrlich gated '(Slice offen)' — kein erfundener Stream"
  - "data-testid=live-start-run als primaerer testid (E2E-Kompatibilitaet + Unit)"
  - "Stable EMPTY_FRAMES-Konstante fuer Zustand-Selektoren (react-hooks/exhaustive-deps)"

duration: ~75min
completed: 2026-05-29
---

# Phase 01-15: Faithful OSim-Grafikfenster + Auswertungs-Balken-Charts Summary

**Faithful Grafikfenster (3 Modi, OID-gefaerbte Belegungs-Segmente, rotes Warteschlangen-Gebirge, gated Qualifikation) + 3D-Balken-Auswertungs-Chart implementiert und in /live verdrahtet.**

## Performance

- **Duration:** ca. 75 min
- **Started:** 2026-05-29
- **Completed:** 2026-05-29
- **Tasks:** 3 (TDD RED/GREEN, jeweils separate Commits)
- **Files created:** 8
- **Files modified:** 3

## Accomplishments

### Task 1: AuftragColor + grafikfenster-modes (reine TS-Module, TDD)

- `AuftragColor.ts`: `auftragColor(oid: number): string` — 1:1-Port der OSim-Farbformel
  `RGB((oid%4)*64, ((oid/4)%4)*64, ((oid/16)%4)*64)` aus `PGfxRowObj.cpp:368-378`.
  `GAP_COLOR = "rgb(255,255,255)"` fuer `oid < 0`. Kein Status-Palette-Erfinden.
- `grafikfenster-modes.ts`: `timeAxisScale(span)` nach SPEC §2.4-Tabelle (86400→24h,
  604800→7d, 2592000→30d, 2678400→31d, else→10s); `time2client` (lineare Pixel-Abbildung);
  `GRAFIKFENSTER_MODES` mit drei echten OSim-Modi-Namen aus `OSimPro.rc:6664-6666`.
- 16/16 vitest Tests gruen.

### Task 2: Grafikfenster + GrafikfensterControls (TDD)

- `Grafikfenster.tsx`: Faithful OGfxModeRow-Layout (§2.1-§2.6):
  - Top-Bar: Modus-Titel (OGfxRowTopBar §2.3)
  - Left-Bar: "Ressourcen"-Header + per-Ressource-Labels rechtsbundig (§2.2)
  - Gepunktete vertikale Rasterlinien (§2.4), gepunktete Baselines (§2.5)
  - Rote aktuelle-Zeit-Linie bei max Frame-t in `rgb(255,0,0)` (§2.6)
  - Belegungs-Modus: OID-gefaerbte Segmente via `auftragColor` + GObject-Geometrie (D-4.3)
  - Warteschlangen-Modus: rotes Gebirge als SVG-Polygon (Treppenfunktion, §3.2)
  - Qualifikation-Modus: ehrlich `"(Slice offen)"` mit aria-Label (T-01-15-02, A11y)
  - Stabile `EMPTY_FRAMES`-Konstante fuer Selektoren (react-hooks-Hygiene)
- `GrafikfensterControls.tsx`: Steuerleiste 1:1 SPEC §1:
  - Start/Weiter/Abbruch/Zuruecksetzen (§1.2-Logik)
  - Felder: Periode N / Sim-Zeit / assoz. Datum / Modus-Dropdown
  - Abbruch + Zuruecksetzen faithful visible, headless-Port disabled
  - `data-testid="live-start-run"` fuer E2E-Kompatibilitaet (01-10-Tests)
- `types.ts`: `StreamTag` um `"gantt_wartequeue"` erweitert (7 Streams)
- 7/7 vitest Tests gruen.

### Task 3: AuswertungChart + Wiring (TDD)

- `AuswertungChart.tsx`: 3D-Balken-Chart (bmStd) nach AUSWERTUNG-CHART-SPEC §3:
  - Balken gruen `ccDEFAULT = RGB(0,224,0)`, oe-Balken rot `ccRED = RGB(224,0,0)`,
    Sum-Balken blau `ccBLUE = RGB(0,0,224)` (§4.2-Tabelle)
  - 3D-Effekt: top +64/Kanal, side -64/Kanal, depth 12 (§3.3)
  - Wert-Label `%6.2f` ueber jedem Balken (§3.2)
  - Achse 0..nice-gerundetes-Max, 5 Intervalle (`%6.0f`) (§3.1)
  - Titel = Kennzahl-Name; leere Daten → ehrlich leer
- `stream-router.tsx`: `gantt_wartequeue` im switch-Case ergaenzt (→ StatusList)
- `live.tsx`: Durchlaufplan-Tab zeigt `GrafikfensterControls + Grafikfenster`
  statt `DurchlaufplanGantt + GrafikViewerControls`; `handleStartRun` unveraendert
- 6/6 vitest Tests gruen.

## Task Commits

1. **Task 1 RED** — `7eba51a` (test)
2. **Task 1 GREEN** — `8fe8de4` (feat)
3. **Task 2 RED** — `8958a66` (test)
4. **Task 2 GREEN** — `0680ed1` (feat)
5. **Task 3 RED** — `69d5e32` (test)
6. **Task 3 GREEN** — `c932a47` (feat)
7. **Task 3 Wiring-Fix** — `45af119` (feat)

## Deviations from Plan

### Rule 1 — Bug: jsdom normalisiert rgb(r,g,b) mit Leerzeichen

**Found during:** Task 2 GREEN (Test 2a schlaegt fehl)
**Issue:** jsdom normalisiert `rgb(0,64,0)` → `"rgb(0, 64, 0)"` (Leerzeichen nach Komma).
Test verglich direkt auf `"rgb(0,64,0)"`.
**Fix:** Test verwendet `el.style.backgroundColor.replace(/\s/g, "")` vor dem Vergleich.
**Files modified:** `__tests__/Grafikfenster.spec.tsx`
**Commit:** 0680ed1

### Rule 2 — Missing: react-hooks/exhaustive-deps Warnung in Grafikfenster.tsx

**Found during:** Task 3 (Lint-Check)
**Issue:** `byStream["gantt_einsatz"] ?? []` erzeugt neue Array-Referenz bei `undefined`,
was useMemo-Deps destabilisiert → react-hooks ESLint-Warnung.
**Fix:** Stabile `EMPTY_FRAMES: Frame[] = []`-Konstante; separate Store-Selektoren
je Stream-Tag.
**Files modified:** `components/Grafikfenster.tsx`
**Commit:** c932a47

### Rule 2 — Missing: live-start-run E2E-Kompatibilitaet

**Found during:** Task 3 (E2E-Test-Analyse)
**Issue:** E2E-Test `live-stream.spec.ts` nutzt `data-testid="live-start-run"`.
Neuer `GrafikfensterControls`-Button hatte nur `grafik-btn-start`.
**Fix:** `data-testid="live-start-run"` als primaeren testid gesetzt (E2E + Unit kompatibel).
**Files modified:** `GrafikfensterControls.tsx`, `__tests__/Grafikfenster.spec.tsx`
**Commit:** 45af119

## Out-of-Scope (explizit verankert)

- Echter Kalender-Offset fuer `Simulationszeit2Date` (headless-Port: Tag-Zahl-Platzhalter)
- Qualifikations-Stream (P5-M abhaengig — gated)
- Scroll/Zoom im Grafikfenster (`faktZoom >= 1.0` aus C++) — statische Ansicht
- AuswertungChart fuer alle 11 kpi_auswertung-kinds — nur sections/snapshot (Tabelle)

## Known Stubs

- `GrafikfensterControls.periodBegin/periodEnd/simTime`: werden in Phase 01 als
  statische Defaults (`0, 86400, 0`) uebergeben. Echte Anbindung an laufende
  Sim-Zeitstempel ist eine spaetere Welle (Sim-Status-Events).
- `Grafikfenster.widthPx=800`: hardcoded, kein responsives Layout. Folge-Welle.

## Threat Surface Scan

Keine neuen Netzwerk-Endpoints, Auth-Pfade oder Schema-Aenderungen einfuehrt.
Alle Aenderungen betreffen UI-Rendering-Schicht.

T-01-15-01 (Tampering Frames): Defensive Lesung implementiert — fehlende `ressource_id`,
`auftrag_oid` oder `wartende` werden auf sinnvolle Defaults (leer/0) gefallen, kein Crash.

T-01-15-02 (Information Disclosure erfundene Werte): Qualifikation rendert
`"(Slice offen)"` mit aria-Label, nie erfundene Zahlen. AuswertungChart: leere
Kategorien → ehrlich leerer Chart.

T-01-15-03 (DoS unbegrenzte Frames): Grafikfenster konsumiert die bereits durch
`MAX_FRAMES_PER_STREAM` gecappten Store-Frames — kein zusaetzlicher Windowing-Code
noetig.

## Self-Check: PASSED

Alle Task-Commits vorhanden (7eba51a, 8fe8de4, 8958a66, 0680ed1, 69d5e32, c932a47, 45af119).
29 Plan-Verifikationstests gruen (16+7+6). tsc --noEmit clean. ESLint-Warnungen 0 Errors.
