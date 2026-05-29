---
phase: 01-live-viewer-bridge
plan: 02
subsystem: osim-ui/live-stream
tags: [ui, live-stream, tail-reader, zustand, gantt, tanstack-router, graphobject]
requires:
  - "01-01: stream.jsonl Frame-Vertrag {t, stream, seq, v, wall_t?, meta_event?} + 6 STREAM_TAGS"
provides:
  - "features/live-stream/types.ts: StreamTag-Union + Frame + MetaJson + isStreamTag-Guard (UI-Spiegel des Engine-Vertrags)"
  - "features/live-stream/tail-reader.ts: parseLines + detectGaps + createTailReader (Offset-Seek, Carry-Puffer, Restart-fest)"
  - "features/live-stream/store.ts: useLiveStreamStore (byStream/activeStream/hasGap/lastSeq/dropCount/streamStatus + ingest/setActiveStream/selectActiveFrames/setMeta/reset)"
  - "features/live-stream/components/GanttRow.tsx: Zeit-Balken-Spur eines Auftrags ueber GObject-Geometrie"
  - "routes/_authenticated/live.tsx: /live-Route mit Stream-Tabs + 200ms-Tick + 30Hz-Coalescing"
affects:
  - "01-03/Wave-3 (KpiTile/RecordTable/stream-router): setzen auf useLiveStreamStore + Tab-Geruest der /live-Route auf"
tech-stack:
  added: []
  patterns:
    - "Eigener Zustand-create-Store (D-4.2), bewusst getrennt vom Modellierungs-State"
    - "Injizierbare ReadFn fuer den Tail-Reader (testbar, backend-agnostisch)"
    - "GObject SetPosition/SetSize -> GetRect/crectWidth als Geometrie-Pipeline (D-4.3)"
    - "setInterval(200ms)-Tick + Render-Coalescing-Fenster (1000/30 ms) in useEffect (D-4.4)"
key-files:
  created:
    - osim-ui/portal/src/features/live-stream/types.ts
    - osim-ui/portal/src/features/live-stream/tail-reader.ts
    - osim-ui/portal/src/features/live-stream/store.ts
    - osim-ui/portal/src/features/live-stream/components/GanttRow.tsx
    - osim-ui/portal/src/routes/_authenticated/live.tsx
    - osim-ui/portal/src/features/live-stream/__tests__/tail-reader.spec.ts
    - osim-ui/portal/src/features/live-stream/__tests__/store.spec.ts
    - osim-ui/portal/src/features/live-stream/__tests__/GanttRow.spec.tsx
  modified:
    - osim-ui/portal/src/routeTree.gen.ts
decisions:
  - "Frame-Buffer-Cap MAX_FRAMES_PER_STREAM=10000 (analog Engine-Bounded-Buffer D-OP-3) gegen unbegrenztes Wachstum (T-01-05)"
  - "Tail-Reader haelt halbe letzte Zeile (kein \\n) im Carry-Puffer zurueck (T-01-04 DoS-Mitigation)"
  - "Route nimmt injizierbare ReadFn; Default no-op solange kein Run gewired (Walking-Skeleton, M1)"
metrics:
  duration: ~30min
  completed: 2026-05-29
  tasks: 3
  files: 9
---

# Phase 01 Plan 02: UI-Live-Foundation Summary

Walking-Skeleton der UI-Seite: das neue `features/live-stream/`-Modul in
`osim-ui/portal` spiegelt den in Plan 01-01 gepinnten JSONL-Frame-Vertrag,
tail-liest neue Zeilen inkrementell ab dem Byte-Offset, hält die Frames in
einem eigenständigen Zustand-Store getrennt pro Stream-Tag und rendert die
erste GanttRow-Spur unter der neuen `/live`-Route über die
`@osim/graphobject`-Geometrie. Der Engine↔UI-Vertrag ist damit als O-4-Slice
end-to-end verankert, bevor Wave 3 KPI-/Record-Komponenten aufsetzt.

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| 1 | Frame-Typen + Tail-Reader (Offset-Seek, Skip-on-error, Gap-Detection, Restart-fest) | 5d746fc |
| 2 | Eigenständiger Live-Stream Zustand-Store (Frames pro Tag, Filter, Gap-Marker, Buffer-Cap) | f0a23f0 |
| 3 | /live-Route + GanttRow über GObject-Pipeline (Tabs, 200ms-Tick, 30Hz-Coalescing) | 5456d78 |

## Store-API (für Wave 3 — KpiTile / RecordTable / stream-router)

`useLiveStreamStore` (Zustand, eigener Store — D-4.2, kein Import aus
Navigator-/Viewer-State):

**State**
- `byStream: Record<StreamTag, Frame[]>` — Frames getrennt pro Tag (alle 6 Tags
  vorinitialisiert auf `[]`).
- `activeStream: StreamTag | null` — aktuell gefilterter Stream (Tab-Auswahl).
- `hasGap: boolean` — mindestens eine seq-Lücke seit `reset()` erkannt.
- `lastSeq: number` — höchste bisher gesehene globale seq (für Gap-Detection).
- `dropCount: number` — verworfene Frames laut meta.json (Backpressure, D-OP-3).
- `streamStatus: Partial<Record<StreamTag, StreamStatus>>` — partial/full pro
  Stream aus meta.json (D-2.2) — **Datenquelle für das Wave-3-Banner**.

**Actions / Selector**
- `ingest(frames: Frame[])` — verteilt nach `frame.stream`, ruft `detectGaps`
  gegen `lastSeq`, setzt `hasGap`, cappt jeden Buffer auf
  `MAX_FRAMES_PER_STREAM` (10000, Ring/slice von hinten).
- `setActiveStream(tag: StreamTag | null)`.
- `selectActiveFrames(): Frame[]` — Selector, gibt `byStream[activeStream]` oder
  `[]`.
- `setMeta(meta: MetaJson)` — setzt `dropCount` + `streamStatus`.
- `reset()` — leert alle Buffer + setzt Gap/Seq/Drop/Status zurück.

## GanttRow-Props (für Wave 3 + Folge-Wiring)

```ts
interface GanttRowProps {
  auftragId: string;       // Label + Test-ID-Basis
  frames: Frame[];         // gantt_durchlauf-Frames EINES Auftrags (start+ende)
  pxPerSecond: number;     // Zeit-Achsen-Skalierung
  nowSeconds?: number;     // aktuelle Sim-Zeit für laufende (offene) Balken
}
```
Geometrie wird über `GObject` (SetPosition/SetSize → GetRect/crectWidth)
berechnet (D-4.3). `kind:"start"` öffnet, `kind:"ende"` schließt einen Balken
pro Prozess; ohne ende läuft der Balken bis `nowSeconds`. Read-only (M1).
Test-ID je Balken: `gantt-bar-{auftragId}-{prozessId}`.

## Tail-Reader-API

- `parseLines(chunk: string): { frames: Frame[]; skipped: number }` — Skip+Warn
  auf Parse-Fehler/Struktur-Mängel, wirft NIE (T-01-04).
- `detectGaps(prevSeq: number, frames: Frame[]): number[]` — fehlende seq-Nummern.
- `createTailReader(read: ReadFn, opts?): { step, getOffset, setOffset }` —
  Byte-Offset-Seek, Carry-Puffer für halbe letzte Zeile, restart-fest (AC-5-Basis).
  `ReadFn = (offset) => Promise<{ text, nextOffset }>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom in node_modules wiederhergestellt**
- **Found during:** Task 1 (erster `npm run test:run`).
- **Issue:** `jsdom` (deklarierte devDependency `^29.0.0`, Lockfile-Pin 29.1.1)
  fehlte im installierten `node_modules` → die GESAMTE Vitest-Suite konnte nicht
  starten (`Cannot find package 'jsdom'`), nicht nur die neuen Specs.
- **Fix:** `npm install jsdom@29.1.1 --no-save` aus dem committeten Lockfile-Pin
  wiederhergestellt (deklarierte + gepinnte Dependency, kein neues/unbekanntes
  Paket → fällt nicht unter die Package-Install-Ausnahme von Rule 3). Danach
  Baseline-Spec + alle live-stream-Specs grün. Versions-Check: installierte
  eslint/typescript-eslint == Lockfile-Pin (keine Tooling-Regression eingeführt).
- **Files modified:** keine (nur node_modules, gitignored).
- **Commit:** — (Working-Tree-Repair, nicht committet).

### Out-of-Scope (nicht gefixt, siehe deferred-items.md)

**Pre-existing repo-weite Lint-Fehler:** `npm run lint` meldet 77 Fehler (75×
`no-unused-vars`, 2× `static-components`) — ALLE in Dateien, die 01-02 nicht
berührt hat (graphobject-Package, bestehende Routes/Viewers, e2e). Lint war
bereits auf `main` rot. Eigene Dateien sind lint-clean (0 errors, 2 erwartete
react-refresh-Warnungen wie alle anderen Route-Dateien). Dokumentiert in
`.planning/phases/01-live-viewer-bridge/deferred-items.md`.

## Threat-Mitigationen umgesetzt

- **T-01-04 (DoS / korrupte JSONL-Zeilen):** `parseLines` fängt JSON.parse-Fehler
  + Struktur-Mängel pro Zeile, `console.warn` + Skip, kein Throw; `createTailReader`
  hält eine unvollständige letzte Zeile (kein `\n`) im Carry-Puffer bis zum
  nächsten Tick zurück. Spec-getestet.
- **T-01-05 (unbegrenztes Frame-Wachstum):** `MAX_FRAMES_PER_STREAM=10000`
  Per-Stream-Cap (slice von hinten) + 30Hz-Render-Coalescing in der Route.
  Spec-getestet (12000 Frames → ≤10000, jüngste behalten).
- **T-01-06 (/live ohne Auth):** Route liegt unter `_authenticated/` — bestehender
  Auth-Guard greift (accept, keine Zusatz-Mitigation).

## Verification

- `cd osim-ui/portal && npm run test:run -- src/features/live-stream` →
  **17 passed** (tail-reader 8, store 6, GanttRow 3).
- AC-4 (Stream-Filter): `setActiveStream` + `selectActiveFrames` isoliert einen
  Stream (store.spec).
- AC-5-Basis (Offset-Restart): `setOffset()`/`getOffset()` restart-fest
  (tail-reader.spec).
- AC-3-Basis (Tail-Tick): 200ms-`setInterval` in der Route.
- O-3: `features/live-stream/` mit tail-reader, store, GanttRow vorhanden.
- `/live` ist im generierten `routeTree.gen.ts` registriert (Zeilen 15/34/68/116).
- Eigene Dateien lint-clean (`npx eslint src/features/live-stream
  src/routes/_authenticated/live.tsx` → 0 errors).

## Known Stubs

| Stub | Datei | Grund / Auflösung |
|------|-------|-------------------|
| Tabs außer `gantt_durchlauf` zeigen Platzhaltertext „Renderer folgt in Wave 3" | routes/_authenticated/live.tsx | Intentional — KpiTile/RecordTable/einsatz/schicht-Renderer sind Wave-3-Scope. Tab-Gerüst + Store-Filter stehen. |
| `read = noopRead` Default (kein aktiver Run) | routes/_authenticated/live.tsx | Intentional M1-Grenze — die stream.jsonl-Byte-Range-ReadFn wird in einer Folge-Welle ans Backend gewired. Route ist read-quellen-agnostisch (injizierbare ReadFn). |

## Self-Check: PASSED
