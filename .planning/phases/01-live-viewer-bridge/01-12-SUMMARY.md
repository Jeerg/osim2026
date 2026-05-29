---
phase: 01-live-viewer-bridge
plan: 12
subsystem: frontend
tags: [gap_closure, osim-fidelity, ui-viewers, grafik-viewer, live-stream, tables, a11y, 3fls]
requires:
  - "01-11: OSim2004-treue Feldsätze je kpi_auswertung-kind + gantt_schicht (records[] now-buildable, null+missing_slice slice-gated)"
  - "01-09: /live-Wiring (Modell-Picker, Lauf-Start, run_id, HTTP-ReadFn, 200ms-Tick/30Hz-Coalescing)"
  - "01-05: StreamRouter + GanttRow/GObject-Pipeline + RecordTable-Tabellen-Pattern + PartialBanner"
provides:
  - "viewer-config.ts: geordnete OSim-Viewer-Tab-Registry + exakte deutsche Spalten je Auswertung (1:1 .cpp, gebunden an 01-11-Feldnamen)"
  - "AuswertungTable + SchichtTable: faithful OSim-Auswertungs-Tabellen mit '(Slice offen)' für slice-gated Felder"
  - "DurchlaufplanGantt: Durchlaufplan als primärer Grafik-Viewer über die GanttRow/GObject-(Design)-Pipeline"
  - "/live mit Run-Start IM Durchlaufplan-Grafik-Viewer (FSimulatorViewerGfx-treu) statt generischer Standard-Fläche"
affects:
  - "künftige Browser-/E2E-UAT (Grafik-Viewer ist nun Default-/Primär-Surface)"
tech-stack:
  added: []
  patterns:
    - "Viewer-Registry als single source of truth für Tab-Reihenfolge + Spalten-Header + kind-Mapping"
    - "drei Render-Modi (records/snapshot/sections) je Auswertung, kind-gesteuert aus der Registry"
    - "gated-Render-Regel: null + missing_slice → '(Slice offen)' (muted-Token + aria-Label), NIE 0/erfundene Zahl"
    - "Run-Controls (Start/Pause/Reset) IM Grafik-Viewer-Panel über dem Live-Render-Canvas (FSimulatorViewerGfx)"
key-files:
  created:
    - "osim-ui/portal/src/features/live-stream/viewer-config.ts"
    - "osim-ui/portal/src/features/live-stream/components/AuswertungTable.tsx"
    - "osim-ui/portal/src/features/live-stream/components/SchichtTable.tsx"
    - "osim-ui/portal/src/features/live-stream/components/DurchlaufplanGantt.tsx"
    - "osim-ui/portal/src/features/live-stream/__tests__/AuswertungTable.spec.tsx"
  modified:
    - "osim-ui/portal/src/routes/_authenticated/live.tsx"
    - "osim-ui/portal/src/features/live-stream/stream-router.tsx"
    - "osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx"
decisions:
  - "01-12: /live-Tabs aus VIEWER_TABS (echte OSim-Labels: Durchlaufplan/Einsatzzeit/Schicht/Gesamt/Produktionsaufträge/…) statt roher Stream-Tags; Reihenfolge OSim (Gfx-Viewer zuerst)"
  - "01-12: Durchlaufplan = Default-/Primär-Grafik-Viewer; Lauf-START verschoben aus generischer Button-Leiste IN den Grafik-Viewer (FSimulatorViewerGfx-treu, Start/Pause/Reset über dem Canvas)"
  - "01-12: Pause/Reset faithful sichtbar aber disabled — headless-Port (01-08) exponiert serverseitig nur Start (subprocess.Popen), keine erfundene Funktionalität"
  - "01-12: Spalten-keys gebunden an die 01-11-Schema-Feldnamen (z.B. pers.name, kann_kap_pct), Header 1:1 aus den .cpp ('Personal', 'verfügbare Kapazität', …)"
  - "01-12: slice-gated → '(Slice offen)' (Threat T-01-12A), Spec pinnt: keine 0/erfundene Zahl in gated-Zellen"
metrics:
  duration: "~12 min"
  completed: "2026-05-29"
  tasks: 2
  files: 8
---

# Phase 01 Plan 12: UI — echte OSim2004-Viewer Summary

**Die `/live`-Sicht trägt jetzt die ECHTEN OSim2004-Viewer-Namen statt roher Stream-Tags, jede Auswertung rendert als Tabelle mit den exakten deutschen OSim-Spalten (1:1 aus den `ISimulatorViewerAusw*.cpp`, gebunden an die 01-11-Feldnamen), und der Durchlaufplan ist der primäre Grafik-Viewer — der Lauf wird von IHM aus gestartet (FSimulatorViewerGfx-treu) und live über die GanttRow/GObject-Design-Pipeline gerendert, NICHT über eine generische „Standard"-Fläche.**

## Was gebaut wurde

### Task 1 — Viewer-Registry + AuswertungTable + SchichtTable (commit 58f2a9a)

- **`viewer-config.ts`** als single source of truth: `VIEWER_TABS` (geordnete
  OSim-Tab-Liste mit deutschem Label + source-Tag + optional kind), `AUSWERTUNG_DEFS`
  je kind (Render-Modus + Spalten/Sektionen mit den EXAKTEN deutschen Headern),
  `SCHICHT_COLUMNS`, `VERKAUFSERGEBNIS_COLUMNS`, `SLICE_OPEN_LABEL`. Spalten-keys
  binden 1:1 an die von 01-11 emittierten Engine-Feldnamen (verifiziert gegen
  `engine/.../schemas/kpi_auswertung.json` + `gantt_schicht.json`), die
  Header-Strings sind 1:1 aus den `ISimulatorViewerAusw*.cpp`.
- **`AuswertungTable.tsx`** generisch über drei Render-Modi:
  - `records` (prod_auftrag/nbearbeit/wschlange + gated best_auftrag): eine Zeile
    je `v.records[]`-Eintrag, echte Werte; leere records + missing_slice →
    `(Slice offen)`-Hinweiszeile.
  - `snapshot` (pers/betr/kauf/eigen): die echten Feldnamen direkt aus `v`,
    null + missing_slice → `(Slice offen)`.
  - `sections` (kalkulation/gesamt): sektionierte Label-Wert-Tabelle, gesamt
    zusätzlich die Verkaufsergebnisse-Untertabelle je Produkt.
- **`SchichtTable.tsx`**: Person/Schichten/Überstunden/Einheiten
  (ISimulatorViewerSchicht FillList), gated → `(Slice offen)`.
- Gated-Render-Regel (Threat T-01-12A): null + `missing_slice` → `(Slice offen)`
  mit muted-Token + aria-Label (A11y, Information nicht nur über Farbe). NIE 0
  oder erfundene Zahlen. Record-Windowing-Cap (T-01-12B).
- Spec (`AuswertungTable.spec.tsx`, 7 Tests): prod_auftrag (echte Werte, 4
  Header), pers (8 Header, alle gated, KEINE 0), best_auftrag (gated leer),
  kalkulation (Sektionen), gesamt (echter Verkaufserlös + gated Kennzahlen),
  SchichtTable (4 Header + gated).

### Task 2 — /live-Tabs auf OSim-Viewer + DurchlaufplanGantt + Router (commit 541f91b)

- **`live.tsx`**: TabsList iteriert über `VIEWER_TABS` → echte deutsche
  OSim-Labels in OSim-Reihenfolge. Default-Tab = `durchlaufplan` (primärer
  Grafik-Viewer). Der bisherige 200ms-Tail-/30Hz-Coalescing-Tick + Modell-Picker
  + run_id-Exposition (01-09) bleiben funktional erhalten.
- **GRAFIK-VIEWER-Fix (Hard-User-Rule):** Der „Lauf starten"-Button lag bisher
  als generische Aktion ÜBER rohen Stream-Tag-Tabs — die verbotene
  „Standard"-Fläche. Er ist jetzt INS Durchlaufplan-Grafik-Viewer-Panel verschoben
  (`GrafikViewerControls`, `role=toolbar`, über dem Live-Render-Canvas) — Start/
  Pause/Reset wie in `FSimulatorViewerGfx.cpp` (IDC_BTN_FGFX_START/BREAK/RESET).
  Start startet den Lauf und springt auf den Durchlaufplan; der laufende Sim wird
  dort über die GanttRow/GObject-(Design)-Pipeline gerendert. Pause/Reset sind
  faithful sichtbar, aber disabled (headless-Port exponiert nur Start) — keine
  erfundene Funktionalität.
- **`stream-router.tsx`**: nimmt jetzt einen `ViewerTab` statt eines rohen Tags.
  Auswertungs-Tab (source kpi_auswertung + kind) filtert `byStream.kpi_auswertung`
  auf sein kind und rendert `<AuswertungTable>`; gantt_durchlauf →
  `<DurchlaufplanGantt>`; gantt_schicht → `<SchichtTable>`; übrige (gantt_einsatz/
  lifecycle/reporting_record) → StatusList. Stream-Isolation (AC-4): genau ein
  Panel je Tab. PartialBanner je source-Tag bleibt.
- **`DurchlaufplanGantt.tsx`**: gruppiert die gantt_durchlauf-Frames nach Auftrag
  und rendert je Auftrag eine `GanttRow` (bestehende GObject-Pipeline) — faithful
  PDlplViewerStd (Zeilen = Aufträge, X = Zeit). Optik 3FLS-modern, Prinzip OSim.
- Der generische `KpiTile`-Grid-Pfad für die Auswertungen entfällt (durch die
  echten OSim-Tabellen ersetzt). `KpiTile.tsx` bleibt als Datei (eigener Spec),
  wird vom Router nicht mehr referenziert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Grafik-Viewer als Run-Start-Surface (Hard-User-Rule)**
- **Found during:** Task 2
- **Issue:** Der Plan beschrieb die Tab-Umstellung, ließ aber den 01-09-Run-Start
  als generischen Button über den Tabs unangetastet — genau die vom User
  wiederholt gerügte „Standard"-Fläche. Die mandatory Grafik-Viewer-Direktive
  verlangt, dass der Lauf AUS dem Grafik-Viewer gestartet/dargestellt wird.
- **Fix:** Run-Controls (`GrafikViewerControls`) ins Durchlaufplan-Panel verschoben
  (FSimulatorViewerGfx-treu, Start/Pause/Reset über dem Canvas); Durchlaufplan ist
  Default-Tab; Start springt auf den Grafik-Viewer. `live-start-run`-testid
  erhalten (01-10-E2E-kompatibel), Pause/Reset honestly disabled.
- **Files modified:** live.tsx
- **Commit:** 541f91b

**2. [Rule 1 — Fidelity-Korrektur] Spalten-keys an die echten 01-11-Schema-Feldnamen gebunden**
- **Found during:** Task 1
- **Issue:** Der Plan-`<osim_tab_and_column_reference>` nennt die Header-Labels
  (z.B. „Personal", „verfügbare Kapazität"), die echten Engine-Feld-keys stehen
  aber im 01-11-Schema (`name`, `kann_kap_pct`, …). Direktes Header-→-key-Mapping
  hätte keine Werte gefunden.
- **Fix:** Jede Spalte trägt `{key (= 01-11-Feldname), header (= OSim-Label)}`;
  verifiziert gegen `kpi_auswertung.json`/`gantt_schicht.json`. Keine erfundenen
  Felder.
- **Files modified:** viewer-config.ts
- **Commit:** 58f2a9a

**3. [Rule 1] coverage-/Banner-Tokens statt ad-hoc amber-Hex**
- **Found during:** Task 2
- **Issue:** Der 01-09-coverage-Hinweis nutzte `bg-amber-50/text-amber-700`
  (ad-hoc-Farben, ESLint-Token-Regel-nah).
- **Fix:** auf die `warning-bg`/`warning-border`-Tokens umgestellt (konsistent
  mit PartialBanner).
- **Files modified:** live.tsx
- **Commit:** 541f91b

## Known Stubs

Keine neuen funktionalen Stubs. Pause/Reset im Grafik-Viewer sind bewusst
disabled (kein erfundenes Verhalten) — das Backend (01-08) exponiert in Phase 01
nur den Start-Endpoint; eine Pause/Reset-Steuerung ist eine spätere
Backend-Phase. `gantt_einsatz` (Einsatzzeit) rendert weiterhin als StatusList,
da der Stream im aktuellen Slice partial ist (01-04 missing_slice) — der
PartialBanner surfaced das ehrlich.

## Threat Surface

Keine neuen Trust-Boundaries gegenüber dem Plan-`<threat_model>`:
- T-01-12A (Information Disclosure): gated-Zellen rendern `(Slice offen)`, Spec
  pinnt „keine 0/erfundene Zahl" — mitigiert.
- T-01-12B (DoS): Record-Windowing-Cap (MAX_VISIBLE_ROWS=200) in AuswertungTable
  — mitigiert.
- T-01-12C/SC: React escapt v-Werte by default (read-only Anzeige, kein
  dangerouslySetInnerHTML); keine neuen npm-Installs (Wiederverwendung shadcn-Table
  + bestehende GanttRow/GObject).

## Verification

- `npm run test:run -- src/features/live-stream` → **42 Tests grün** (8 Test-Files;
  34 bestehende + 7 neue AuswertungTable + erneuerte stream-router-Suite 4).
- `npx eslint` der sechs berührten Code-Dateien → **0 errors**. `live.tsx` hat 2
  `react-refresh/only-export-components`-WARNINGS (Route + Component im selben
  File — das pre-existing TanStack-File-Route-Pattern in JEDER Route-Datei, nicht
  durch 01-12 eingeführt, nicht gating; vgl. 01-09-SUMMARY).
- `npx tsc --noEmit` → **0 Fehler** (gesamtes portal).
- Repo-weiter Lint-Stand (~77 Fremd-Fehler) bewusst NICHT angefasst.

## Fidelity-Nachweis (OSim2004)

- Run-Controls Start/Pause/Reset im Grafik-Viewer: `FSimulatorViewerGfx.cpp`
  (IDC_BTN_FGFX_START/BREAK/RESET, OnButtonStart/Break/Reset) — Controls liegen IM
  Grafik-Viewer, nicht in einer Standard-Fläche.
- Durchlaufplan-Render-Prinzip: `PDlplViewerStd.cpp` (Zeilen = Prozessknoten/
  Aufträge, X = Zeit) über die GObject/GanttRow-(Design)-Pipeline.
- Auswertungs-Spalten + Schicht-Spalten: 1:1 die deutschen Header aus den
  `ISimulatorViewerAusw*.cpp` / `ISimulatorViewerSchicht.cpp`, gebunden an die in
  01-11 gepinnten Engine-Feldnamen.

## Self-Check: PASSED

- Dateien vorhanden: viewer-config.ts, AuswertungTable.tsx, SchichtTable.tsx,
  DurchlaufplanGantt.tsx, AuswertungTable.spec.tsx (created); live.tsx,
  stream-router.tsx, stream-router.spec.tsx (modified) — alle committed.
- Commits vorhanden: 58f2a9a (Task 1), 541f91b (Task 2).
- 42/42 live-stream-Tests grün; 6 touched code files lint- (0 errors) + tsc-clean.

---
*Phase: 01-live-viewer-bridge*
*Completed: 2026-05-29*
