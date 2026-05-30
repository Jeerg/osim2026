---
phase: 01-live-viewer-bridge
plan: 16
status: in_progress
kind: ui-rebuild-kennzahlen-handoff
updated: "2026-05-30"
---

# Resume-Handoff — Phase 01 / 01-16 (PSim-Menübaum + OSim-Kennzahlen)

Stand für `/clear` → `/gsd resume`. Diese Session hat (a) die finale 01-15-UAT
abgeschlossen (Warteschlangen-Fix + api-Image), (b) /live nach PSim umstrukturiert
und (c) OSim-treue Kennzahlen aus dem Sim-Stream eingebaut. **Offen: Browser-UAT
der Kennzahlen-Charts durch den Nutzer; danach P5-D (echte Auslastung).**

## Was diese Session gemacht hat (alles committet, alle Gates grün)

Commits (neueste zuerst):
- `01d34e6` docs(01-16): STATE + Recherche-SPECs (Grafikfenster, Auswertung-Chart, P5D-Scope)
- `bdc4bbc` feat(01-16): OSim-treue Kennzahlen aus dem Sim-Stream + Repo-Sync (skip-worktree)
- `ad86c80` feat(01-16): /live als PSim-Menübaum — Simulationsgrafik vs. Auswertung getrennt
- `7c44802` docs(01-15): STATE + Resume-Handoff (api-Image-Rebuild erledigt)
- `63ea1f2` fix(01-15): Warteschlangen-Gebirge springt nicht mehr (volle Historie + Decimation)
- `c76ddf4` fix(01-15): Dockerfile-Engine-COPY auf Monorepo-Pfad (engine/ statt osim-engine/engine)

### A) 01-15 abgeschlossen
- **api-Image-Rebuild**: Engine (inkl. WartequeueListener) ist dauerhaft im Image
  (kein `docker cp` mehr). Dockerfile-Bug gefixt: `COPY osim-engine/engine` →
  `COPY engine` (Monorepo-Pfad).
- **Warteschlangen-Sprung-Bug** behoben (Browser-UAT-Beschwerde „Grafik springt,
  alte Zeitscheibe gelöscht, Lücken-Fehler"). EMPIRISCH gemessen: 494.938
  gantt_wartequeue-Frames/Periode, seq lückenlos, drop_count=0 → Engine korrekt,
  Bug war rein im UI-Umgang mit dem Volumen:
  1. `store.ts`: 10k-Cap kürzte JEDEN Stream → nur ~2% Historie überlebte. Fix:
     stream-spezifische Caps (gantt_* = 1.000.000).
  2. `live.tsx`: `pending.push(...frames)` (Spread) sprengte bei ~600k Frames den
     Call-Stack → still verworfen, Byte-Offset schon weiter → ECHTE seq-Lücke →
     falsches Gap-Banner. Fix: element-weises Anhängen.
  3. `Grafikfenster.tsx`: O(n×Zeilen)-filter + 8k-Punkt-Polygon → Jank. Fix:
     Vorgruppierung (Map) + Decimation pro Pixelspalte (Spalten-Maximum).

### B) /live-Umbau nach PSim (LIVE-LAYOUT-SPEC.md)
Mein Denkfehler war: flache Tableiste mit „Durchlaufplan" als primärem Tab. Korrekt
(PSim, osim2004-ui-analysis §2.1): Simulationsgrafik (Grafikfenster) ≠ Durchlaufplan
(Modellierung) ≠ Auswertung (eigenes Menü).
- Linker **Menübaum** (`LiveMenuTree.tsx`, Quelle `LIVE_MENU` in viewer-config.ts).
- **Steuerleiste oben**, geteilt über alle Sichten (Modus steuert der Baum →
  `showModus=false`; Zoom nur bei Grafik → `showZoom=isGrafik`).
- Default = Simulation → Belegung. Durchlaufplan/Einsatzzeit-Gantt aus dem Menü raus.

### C) OSim-treue Kennzahlen aus dem Stream (KENNZAHLEN-SPEC.md)
Leitprinzip (Nutzer): Engine loggt ROHDATEN, UI berechnet Kennzahlen → beliebig
nachrüstbar. Tiefe OSim2004-C++-Analyse, alle Formeln mit `<datei>:<zeile>` belegt.
- **Engine** (read-only, kein Sim-Kern-Edit): `gantt_durchlauf`-start trägt jetzt
  `durchlaufplan_oid` + `durchlaufplan_id` (Bezugsobjekt Durchlaufplan) und
  `soll_end_termin` (= start + m_iSollDauer, PAusloeser.cpp:1457; -1-Sentinel
  erhalten). Quelle: `ausloeser.m_lDlpl.oid/.m_sName`.
- **UI** (`osim-ui/portal/src/features/live-stream/kennzahlen.ts`): jede Funktion
  zitiert die OSim-Quelle.
  - `mittlereDurchlaufzeit` (PAusloeser.cpp:149-155); über-alles = MITTEL DER
    OBJEKT-MITTEL, nicht Pool-Mittel (:650-712); NoZeroInEval (:675-692).
  - `anzahlAusloesungen` (:122-125), ø-Balken rot (:508-510).
  - `ressourcenAuslastungApprox` (Näherung belegt/Periode; exakt =
    abgearbBedarf/Kapazitätsbestand PRessBeleg.cpp:1617-1622 braucht P5-D).
  - ø/Sum-Aggregat rot/blau wie OChartCtrl.
- Menübaum: neue Gruppe **„Kennzahlen (Diagramme)"** mit 4 Blättern; rendert über
  `KennzahlChartPanel.tsx` → bestehender `AuswertungChart.tsx` (3D-Balken + ø).

## Verifikations-Stand (zuletzt grün)
- UI: `cd osim-ui/portal && npx tsc --noEmit` = 0; `npx vitest run src/features/live-stream`
  = 118 grün (14 Dateien); eslint = 0 (nur 1 vorbestehender fast-refresh-Warn in live.tsx).
- Engine: `engine/.venv/Scripts/python.exe -m pytest engine/tests/integration/test_streaming*.py engine/tests/unit/test_gantt_kennzahl_fields.py -q`
  = 53 + 4 grün (golden-bench/schema unverändert, weil additive Felder).
- Stack: api + portal healthy. Neue Engine-Felder verifiziert IM Image
  (`durchlaufplan_oid: True | soll_end_termin: True`).

## NÄCHSTER SCHRITT (Browser-UAT durch Nutzer)
http://localhost:3002/live — Login jwfischer69@gmail.com / 123456 — Strg+Shift+R —
NEUEN Lauf starten — links Gruppe **„Kennzahlen (Diagramme)"**:
1. „Mittlere Durchlaufzeit · Auslöser" + „· Durchlaufplan" → grüne 3D-Balken je
   Bezugsobjekt + roter ø-Balken. Plausibel?
2. „Anzahl fertiggestellter Auslösungen" → Balken je Auslöser.
3. „Ressourcenauslastung (Näherung)" → % je Ressource (ehrlich als Näherung
   etikettiert).
Nutzer gibt Rückmeldung, ob die Werte plausibel/OSim-konform aussehen.

## DANACH (geplante Reihenfolge, vom Nutzer bestätigt)
1. **P5-D-Engine**: Betriebsmittel-Auslastung real (abgearb. Bedarf /
   Kapazitätsbestand, Einsatzzeit, Zeitstress) → Auslastung von „Näherung" auf
   „exakt". 1:1 PRessBeleg-Kennzahlen, Reproduzierbarkeitsvertrag.
2. **Liefertermintreue als Chart** (Datengrundlage soll_end_termin liegt schon).
3. **Später, eigene Slices**: Kosten + Lager/Material (im Original nie/teilweise
   simuliert) — explizit out of scope jetzt.

## Wichtige Fakten / Gotchas
- **skip-worktree-Falle (WICHTIG):** Mehrere Portal-Quelldateien trugen ein git
  `assume-unchanged`/`skip-worktree`-Bit → `git add` verschluckte Änderungen still,
  HEAD wurde inkonsistent. Vor JEDEM Commit prüfen:
  `git ls-files -v | Select-String '^[a-z] '`. Falls geänderte Dateien dort:
  `git update-index --no-skip-worktree <f>` + `--no-assume-unchanged <f>`. Siehe
  Memory `skip-worktree-trap.md`.
- **CRLF**: `core.autocrlf=true` → viele Dateien zeigen Pseudo-Diffs. Echten Diff
  mit `git diff --ignore-all-space` prüfen (0 Zeilen = nur CRLF, harmlos).
- **api-Container** = gebautes Image. Nach Engine-Änderung NEU bauen:
  `docker compose -f osim-ui/docker-compose.yml build api` +
  `... up -d --no-deps api`. Portal = Bind-Mount + HMR (bei Bedarf
  `docker restart osim-ui-portal-1`).
- **Bash-Tool unzuverlässig in dieser Session** (Outputs verschluckt, Pfade mit ö/()
  scheitern bei Read/sed). PowerShell-Tool war robuster für git/pytest/Datei-Reads.
- **Headless-Engine-Lauf** (Debug): `engine/.venv/Scripts/python.exe -m
  osim_engine.streaming.run_otx --otx engine/experiments/.work/Bosch2_wechseln-azeitsim.otx
  --run-dir <dir> --periods 1`.
- **OSim2004-C++-Quelle**: `../OSim2004/OSimV01(Fj)/` (Pfad mit ö+Klammern quoten).
  graphify-Graph unter `../OSim2004/graphify-out/`. Für Kennzahl-Formeln IMMER dort
  nachschlagen, nicht erfinden.

## Referenz-SPECs (committet, .planning/phases/01-live-viewer-bridge/)
- `KENNZAHLEN-SPEC.md` — alle KPI-Formeln + Engine-Log-Schema + Recompute-Regeln
- `LIVE-LAYOUT-SPEC.md` — /live-Struktur (Menübaum, Steuerleiste)
- `GRAFIKFENSTER-SPEC.md`, `AUSWERTUNG-CHART-SPEC.md`, `P5D-SCOPE.md` — Recherche

## Offene Kleinigkeiten
- `.planning/.../01-09-PLAN.md` + `01-10-PLAN.md` zeigen uncommittete Diffs (NICHT
  aus dieser Session, vor Session schon da). Bei Bedarf separat prüfen/committen.
- 4 KPI-Charts sind verdrahtet; weitere (min DLZ, ZegDLZ, Liefertermintreue) sind
  per KennzahlSpec leicht ergänzbar, sobald Datengrundlage steht.
