---
phase: 01-live-viewer-bridge
plan: 15
status: in_progress
kind: gap-closure-uat-handoff
updated: "2026-05-30"
---

# Resume-Handoff — Phase 01 / Plan 01-15 (Live-Grafikfenster)

Stand für `/clear` → `/gsd resume`. Phase 01 hatte 12 abgeschlossene Pläne; die
Gap-Closure-Pläne 01-13..01-15 wurden in dieser Session ausgeführt.

## Status der Gap-Closure-Pläne

- **01-13 (Engine, Belegungs-Diagnose)** — COMPLETE, committet (`63859e1`..`ee54cb5`).
- **01-14 (Engine, Streaming-Listener: echte Belegung + `gantt_wartequeue`)** — COMPLETE,
  committet (`a93f789`..`34a770b`). Empirisch verifiziert: ein `run_otx`-Lauf auf
  `Bosch2_wechseln` erzeugt ~93k `gantt_einsatz` + ~495k `gantt_wartequeue`-Frames.
- **01-15 (UI Grafikfenster, `autonomous: false`)** — IMPLEMENTIERT + viele Browser-UAT-
  Iterationen committet. **Checkpoint (Task 4, Browser-UAT) ist noch OFFEN** — wartet auf
  finale „approved" des Nutzers. Erst danach: Code-Review-Gate + Phasen-Verifikation +
  `phase.complete`.

## Was zuletzt offen/zu prüfen ist (NÄCHSTER SCHRITT)

Finale Browser-UAT der letzten Fixes durch den Nutzer auf **http://localhost:3002/live**
(Login `jwfischer69@gmail.com` / `123456`, Strg+Shift+R, NEUEN Lauf starten):
1. Zoom-Stufen **Fit / Woche / Tag / Std / 15m** — „Woche" vorhanden, Zoom reagiert
   auch während des Laufs, Grafik verschwindet nicht.
2. **Warteschlangen**: Berge bauen sich als scharfe Spitzen auf, werden NICHT mehr
   zeitlich gestreckt (Treppe hält jetzt vorwärts).
3. Zeitachse oben (sticky), feste Perioden-Skala — reskaliert nur bei User-Zoom.

## Browser-UAT-Fix-Historie 01-15 (chronologisch, alle committet, alle Tests grün)

- `8013a30` /live lädt Modell-Wire selbst (useModel) + persistente modelId (localStorage).
- `7a46a52` Zeitfenster dynamisch aus Frames (später ersetzt).
- `0621ac7` volle Breite (ResizeObserver) + lesbarere Achse + breitere Ressourcen-Spalte.
- `9111f55` solide Belegungsbalken (row=20) + echte Sim-Zeit/Periode in Steuerleiste.
- `47b79d5`/`4f4d2d8` Sim-Zeit-Zoom (3fls-analog, `grafikfenster-coords.ts`).
- `aff3eee` sticky Top-Zeitachse + vertikaler Scroll (2D-sticky).
- `23321f7` festes Zeitfenster = Perioden-Grenzen (kein dynamisches Reskalieren während Lauf).
- `c706c63` **Wurzel-Fix**: live.tsx übergab dem Grafikfenster hart `0/86400` statt der
  echten `periodInfo` → „Grafik nach Zoomen weg". Jetzt echte Perioden-Grenzen.
- `7352400` Zoom-Stufe **„Woche"** + intuitive Skala (Dauer füllt Viewport) + Content-Deckel
  (`MAX_CONTENT_PX=24000`, verhindert Mega-Leinwand bei feiner Stufe auf langer Periode).
- `025a486` Warteschlangen-Treppe **vorwärts halten** (kein zeitliches Strecken).

## Wichtige Fakten / Gotchas für den Resume

- **Dev-Stack läuft** (docker). Portal = Bind-Mount + Vite-HMR, aber bei Code-Änderung
  sicherheitshalber `docker restart osim-ui-portal-1`. Stack-Start sonst: `bash scripts/dev-up.sh`.
- **api-Container = gebautes Image (Engine ist jetzt eingebacken).** ERLEDIGT 2026-05-30:
  api-Image neu gebaut, Engine (01-14, inkl. `WartequeueListener`) ist dauerhaft im Image
  unter `/workspace/osim-engine/engine` — KEIN `docker cp` mehr nötig, überlebt Container-Neubau.
  Verifiziert: `import osim_engine.streaming.listeners.wartequeue` → `WartequeueListener` OK,
  `/health` ok. **Dabei Bug gefixt:** Dockerfile `COPY osim-engine/engine` zeigte auf den
  Pre-Migration-Pfad; im Monorepo liegt die Engine unter Repo-Root `engine/` → auf
  `COPY engine /workspace/osim-engine/engine` korrigiert (Ziel/venv-Pfade unverändert).
  Der Dockerfile-Fix ist NOCH NICHT committet.
- **Modell-Horizont**: `Bosch2_wechseln`-OTX setzt `m_szeitEnde = 31.01.1900` (kein Start →
  0) → 31-Tage-Periode (`period_len = 2.678.400 s`). Laut Nutzer ist der **Monat korrekt**
  (Engine baut keinen Mist). Es gibt KEIN Kalender-Datum in der Pipeline (nur Sim-Sekunden);
  „assoz. Datum dd.mm.yyyy" wäre ein eigenes Slice (OFFENER, OPTIONALER Folgepunkt).
- **Referenz-Screenshots** des OSim-Originals:
  `C:\Users\JörgWFischer\Dropbox\02_3fls_GmbH\Enterprise Acceleration Machine\Claude spec\osim\grafikfenster.png` (Warteschlangen),
  `grafikfenster2.png`/`grafikfenster3.png` (Belegung, 0-24h bzw. 24-48h gezoomt),
  `auswertung.png`. Feste Periode-Achse oben, OID-Farben, rote Spitzen.
- **Engine headless laufen lassen** (zum Debuggen):
  `engine/.venv/Scripts/python.exe -m osim_engine.streaming.run_otx --otx experiments/.work/Bosch2_wechseln-azeitsim.otx --run-dir <dir> --periods 1`
  → erzeugt `<dir>/.../stream.jsonl` + `meta.json`.
- **3fls-Zoom-Pattern-Quelle** (übernommen): `../tbx_stzrim/portal/src/components/scheduler-widget/coords.ts` (PX_PER_DAY_BY_ZOOM, makeDateToX, zoomFactor).
- Verifikation FE: `cd osim-ui/portal && npx tsc --noEmit && npx vitest run src/features/live-stream && npx eslint <files>`. Aktuell: tsc 0, 99 Tests grün, lint 0.

## Offene Folgepunkte (nach UAT-Approval)

1. ~~**api-Image-Rebuild** (Engine dauerhaft im Container statt `docker cp`).~~ ERLEDIGT
   2026-05-30 (inkl. Dockerfile-Monorepo-Pfadfix — noch zu committen).
2. Optional: **echtes Kalender-Datum** (Sim-Startdatum streamen → api → UI).
3. Plan 01-15 abschließen: Code-Review-Gate (`/gsd:code-review 01`) + Phasen-Verifikation
   (gsd-verifier) + `phase.complete`. Danach Phase 01 als COMPLETE markieren.

## Aufräum-Hinweis

In `engine/experiments/` können temporäre Debug-Probe-Dateien dieser Session liegen
(`probe_*`, `analyze_*`, `gf_*`). Unkritisch; bei Bedarf entfernen.
