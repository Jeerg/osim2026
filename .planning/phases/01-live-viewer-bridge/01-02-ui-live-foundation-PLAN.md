---
phase: 01-live-viewer-bridge
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - osim-ui/portal/src/features/live-stream/types.ts
  - osim-ui/portal/src/features/live-stream/tail-reader.ts
  - osim-ui/portal/src/features/live-stream/store.ts
  - osim-ui/portal/src/features/live-stream/components/GanttRow.tsx
  - osim-ui/portal/src/routes/_authenticated/live.tsx
  - osim-ui/portal/src/features/live-stream/__tests__/tail-reader.spec.ts
  - osim-ui/portal/src/features/live-stream/__tests__/store.spec.ts
  - osim-ui/portal/src/features/live-stream/__tests__/GanttRow.spec.tsx
autonomous: true
requirements: [O-3, O-4, AC-3, AC-4, AC-5]
must_haves:
  truths:
    - "osim-ui hat ein neues live-stream/-Feature-Modul mit Tail-Reader und Zustand-Store"
    - "Der Tail-Reader liest neu angehängte JSONL-Zeilen inkrementell ab dem zuletzt gelesenen Byte-Offset"
    - "Parse-Fehler einer Zeile führen zu Skip+Log, nicht zum Abbruch des Readers"
    - "Der Store hält Frames pro Stream-Tag getrennt und erlaubt Filterung auf einen einzelnen Stream"
    - "Eine neue Top-Level-Route /live rendert das Feature mit einer GanttRow-Spur aus dem gantt_durchlauf-Stream"
    - "seq-Lücken werden erkannt und im Store als gap-Indikator markiert"
  artifacts:
    - path: "osim-ui/portal/src/features/live-stream/tail-reader.ts"
      provides: "Inkrementeller JSONL-Tail-Reader mit Byte-Offset-Seek + Skip-on-parse-error"
      contains: "tail-reader|TailReader|parseLines"
    - path: "osim-ui/portal/src/features/live-stream/store.ts"
      provides: "Zustand-Store für Stream-State pro Stream-Tag (eigenständig, NICHT useNavigatorStore)"
      contains: "create"
    - path: "osim-ui/portal/src/features/live-stream/components/GanttRow.tsx"
      provides: "Gantt-Zeile, gerendert aus gantt_durchlauf-Frames über GObject-Pipeline"
      contains: "GanttRow"
    - path: "osim-ui/portal/src/routes/_authenticated/live.tsx"
      provides: "TanStack-Router /live-Route"
      contains: "createFileRoute"
  key_links:
    - from: "features/live-stream/store.ts"
      to: "features/live-stream/tail-reader.ts"
      via: "Reader liefert geparste Frames an store.ingest()"
      pattern: "ingest|addFrames|tail"
    - from: "routes/_authenticated/live.tsx"
      to: "features/live-stream/components/GanttRow.tsx"
      via: "Route rendert GanttRow"
      pattern: "GanttRow"
    - from: "features/live-stream/components/GanttRow.tsx"
      to: "@osim/graphobject"
      via: "Reuse GObject/cpoint-Geometrie (D-4.3)"
      pattern: "@osim/graphobject|GObject"
---

<objective>
Walking-Skeleton der UI-Seite: das neue `features/live-stream/`-Modul in `osim-ui/portal` tail-liest `stream.jsonl` (Vertrag aus Plan 01-01), hält die Frames in einem eigenen Zustand-Store und rendert die erste GanttRow-Spur unter der neuen `/live`-Route. Damit ist der Engine↔UI-JSONL-Vertrag end-to-end (O-4-Slice) bewiesen, bevor KPI-/Record-Komponenten (Wave 3) gebaut werden.

Purpose: O-3 (live-stream-Feature-Modul + GanttRow), O-4-Slice (UI zeigt Gantt aus echtem Stream). AC-4 (Stream-Filter), AC-5-Vorbereitung (Offset-Restart), AC-3-Vorbereitung (Tail < 1s) werden hier verankert.
Output: lauffähige `/live`-Route, Tail-Reader, Store, GanttRow — getestet via Vitest.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md
@./osim-ui/CLAUDE.md

<interfaces>
<!-- Frame-Vertrag (aus 01-01-SUMMARY.md / SPEC §6.2) — UI-Typ muss exakt matchen: -->
// { t: number, stream: StreamTag, seq: number, v: Record<string, unknown>, wall_t?: string, meta_event?: string }
// StreamTag = "lifecycle" | "gantt_durchlauf" | "gantt_einsatz" | "gantt_schicht" | "kpi_auswertung" | "reporting_record"

<!-- Zustand-Store-Pattern (aus portal/src/stores/viewer-store.ts) — als Vorlage, NICHT erweitern (D-4.2 eigener Store): -->
import { create } from "zustand";
export const useViewerStore = create<State & Actions>((set) => ({ ... }));

<!-- Routen-Pattern (aus portal/src/routes/_authenticated/index.tsx): -->
import { createFileRoute, Link } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

<!-- Gantt-Geometrie (aus @osim/graphobject, D-4.3) — wiederverwenden: -->
import { GObject, GObjLink, OGraphGrid } from "@osim/graphobject";
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Frame-Typen, Tail-Reader (Offset-Seek + Skip-on-error + Gap-Detection)</name>
  <files>osim-ui/portal/src/features/live-stream/types.ts, osim-ui/portal/src/features/live-stream/tail-reader.ts, osim-ui/portal/src/features/live-stream/__tests__/tail-reader.spec.ts</files>
  <read_first>
    - .planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md (finaler Frame-Vertrag — Pflichtfelder + Stream-Tags)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.2 (Frame-Format), §8.2 (Tail-Reader-Strategie: Polling 200ms, Byte-Offset-Seek/Restart-fest, Parse-Fehler→Skip+Log, Gap-Detection via seq-Lücken)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.4 (Tail-Polling 200ms, File-Watcher-Lib Discretion: Polling-only)
    - osim-ui/portal/src/api/fetch.ts (apiFetch-Konventions-Pattern, nur Stil)
  </read_first>
  <behavior>
    - parseLines("{...}\n{...}\n") liefert 2 Frame-Objekte; parseLines bei einer kaputten Mittelzeile überspringt sie und liefert die intakten, ohne zu werfen.
    - Ein Tail-Step über einen Reader, der zunächst 2 Zeilen, dann 2 weitere Zeilen sieht, liefert beim 2. Step nur die 2 neuen Frames (Offset-Seek, keine Doppel-Emission).
    - Gap-Detection: bei Frames mit seq 1,2,5 meldet der Reader/Detector eine Lücke zwischen 2 und 5.
    - Ein neu erzeugter Reader, der mit einem zuvor gespeicherten Offset initialisiert wird, liest ab diesem Offset weiter (Restart-fest, AC-5-Basis).
  </behavior>
  <action>
    In `types.ts`: exportiere `type StreamTag` (Union der 6 Tags), `interface Frame { t: number; stream: StreamTag; seq: number; v: Record<string, unknown>; wall_t?: string; meta_event?: string }`, und `interface MetaJson` (run_id, schema_version, drop_count, streams: Record<string, { status: "partial"|"full"; missing_slices?: string[]; reason?: string }>).

    In `tail-reader.ts`: eine reine Parse-Funktion `parseLines(chunk: string): { frames: Frame[]; skipped: number }`, die per `JSON.parse` Zeile für Zeile parst, fehlerhafte Zeilen `console.warn`-loggt + überspringt (SPEC §8.2). Eine Klasse/Factory `createTailReader(read: (offset: number) => Promise<{ text: string; nextOffset: number }>, opts?)` mit Methode `step(): Promise<Frame[]>`, die ab dem gemerkten Byte-Offset liest, neue Zeilen parst, den Offset fortschreibt und nur neue Frames liefert. `getOffset()`/`setOffset()` für Restart-Festigkeit. Eine `detectGaps(prevSeq, frames): number[]` Hilfsfunktion für seq-Lücken. Das eigentliche 200ms-Polling-Intervall wird NICHT hier hartcodiert getestet — die Funktion ist intervall-agnostisch, der Store/die Route treibt den Tick (D-4.4).
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/tail-reader.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - `parseLines` mit 2 validen + 1 kaputter Zeile liefert `frames.length===2` und `skipped===1`, ohne zu werfen.
    - Tail-Reader-Test: 1. step über 2 Zeilen → 2 Frames; nach Anhängen 2 weiterer Zeilen liefert 2. step genau die 2 neuen Frames (keine der ersten 2 erneut).
    - `detectGaps`-Test: Eingabe-seq [1,2,5] meldet eine Lücke zwischen 2 und 5.
    - Reader mit via `setOffset()` gesetztem Offset liest ab diesem Offset (Restart-Test grün).
  </acceptance_criteria>
  <done>types.ts + tail-reader.ts existieren, Tail-Reader-Spec grün.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Live-Stream Zustand-Store (Frames pro Stream-Tag, Filter, Gap-Marker)</name>
  <files>osim-ui/portal/src/features/live-stream/store.ts, osim-ui/portal/src/features/live-stream/__tests__/store.spec.ts</files>
  <read_first>
    - osim-ui/portal/src/stores/viewer-store.ts (Zustand-create-Pattern — Vorlage, NICHT erweitern; D-4.2 verlangt EIGENEN Store)
    - osim-ui/portal/src/features/live-stream/tail-reader.ts (Frame-Typ + detectGaps aus Task 1)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.2 (eigener Store, anderer Lebenszyklus), D-4.4 (Render-Throttle max 30Hz, Frame-Coalescing)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §8.1 (store.ts Rolle)
  </read_first>
  <behavior>
    - ingest([frame_lifecycle, frame_gantt]) legt die Frames getrennt nach store.byStream["lifecycle"] und ["gantt_durchlauf"] ab.
    - setActiveStream("gantt_durchlauf") + selectActiveFrames() liefert nur gantt_durchlauf-Frames (AC-4 Filter).
    - ingest von Frames mit seq-Lücke setzt store.hasGap===true.
    - reset() leert alle Stream-Buffer und setzt hasGap zurück.
  </behavior>
  <action>
    In `store.ts` ein EIGENSTÄNDIGER Zustand-Store `useLiveStreamStore` (D-4.2 — NICHT in useNavigatorStore/viewer-store integrieren). State: `byStream: Record<StreamTag, Frame[]>`, `activeStream: StreamTag | null`, `hasGap: boolean`, `lastSeq: number`, `dropCount: number` (aus meta.json). Actions: `ingest(frames: Frame[])` (verteilt nach `frame.stream`, ruft `detectGaps` gegen `lastSeq`, setzt `hasGap`), `setActiveStream(tag)`, `selectActiveFrames()` (Selector — gibt `byStream[activeStream]` oder `[]`), `setMeta(meta: MetaJson)` (setzt dropCount + speichert streams-Status für Banner in Wave 3), `reset()`. Frame-Buffer pro Stream auf eine sinnvolle Obergrenze cappen (Ring/slice), damit lange Läufe den Speicher nicht sprengen (Coalescing-Vorbereitung D-4.4).
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/store.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - Nach `ingest` von je 1 lifecycle- + 1 gantt_durchlauf-Frame: `byStream.lifecycle.length===1` und `byStream.gantt_durchlauf.length===1`.
    - `setActiveStream("gantt_durchlauf")` + Selector liefert nur gantt_durchlauf-Frames (AC-4).
    - `ingest` von Frames mit seq-Lücke setzt `hasGap===true`; `reset()` setzt es auf `false` und leert die Buffer.
    - Der Store wird via `create` aus `zustand` gebaut und importiert NICHT aus `stores/viewer-store` oder `useNavigatorStore` (`grep -c "useNavigatorStore\|viewer-store" store.ts` === 0).
  </acceptance_criteria>
  <done>store.ts existiert als eigener Store, Store-Spec grün.</done>
</task>

<task type="auto">
  <name>Task 3: /live-Route + GanttRow-Komponente (GObject-Pipeline)</name>
  <files>osim-ui/portal/src/features/live-stream/components/GanttRow.tsx, osim-ui/portal/src/routes/_authenticated/live.tsx, osim-ui/portal/src/features/live-stream/__tests__/GanttRow.spec.tsx</files>
  <read_first>
    - osim-ui/portal/src/routes/_authenticated/index.tsx (createFileRoute-Pattern + Link)
    - osim-ui/portal/src/routes/_authenticated.tsx (Layout/Auth-Guard-Kontext)
    - osim-ui/portal/packages/graphobject/src/index.ts (verfügbare Exports: GObject, GObjLink, OGraphGrid — D-4.3 Gantt-Geometrie wiederverwenden)
    - osim-ui/portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx (Viewer-Aufbau-Konvention)
    - osim-ui/CLAUDE.md "Brand & UI Style" + docs/3FLS-EAM-STYLE-GUIDE.md (verbindlich: Blau-Primary #1E4F9C, shadcn, Tokens via tokens.css, KEINE ad-hoc Hex — Segoe UI, 4px-Grid)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-4.1 (Top-Level /live Route mit Tabs pro Stream-Kategorie), D-4.3 (GObject/cpoint-Reuse, GanttRow)
  </read_first>
  <action>
    Lege `routes/_authenticated/live.tsx` an: `createFileRoute("/_authenticated/live")` mit einer Komponente, die das live-stream-Feature mountet. Tab-Leiste pro Stream-Kategorie (shadcn `tabs`, Reihenfolge Discretion D-4.1: lifecycle / gantt_durchlauf / gantt_einsatz / gantt_schicht / kpi_auswertung / reporting_record). Der aktive Tab ruft `setActiveStream` im Store. Treibe den Tail-Reader-Tick per `setInterval(…, 200)` (D-4.4) in einem `useEffect`, throttle Re-Renders auf max 30Hz (Coalescing — z.B. `requestAnimationFrame`/Zeitfenster). Beim gantt_durchlauf-Tab rendere für jeden Auftrag eine `GanttRow`. Styling strikt über Tokens (3FLS-Guide), KEINE ad-hoc Hex-Werte.

    `components/GanttRow.tsx`: nimmt die gantt_durchlauf-Frames eines Auftrags und rendert eine Zeit-Balken-Spur über die `@osim/graphobject`-Geometrie (D-4.3, `GObject`/`OGraphGrid`). start-Frame öffnet einen Balken, ende-Frame schließt ihn (start_time→end_time). Read-only/Anzeige (keine Drag-Interaktion in M1).

    Registriere die Route so, dass `routeTree.gen.ts` sie erfasst (TanStack-Router-Filebasiert generiert das Tree automatisch beim Dev-/Build-Run; falls ein manueller Generierungsschritt nötig ist, ihn ausführen, aber `routeTree.gen.ts` NICHT von Hand editieren).
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/GanttRow.spec.tsx && npm run lint</automated>
  </verify>
  <acceptance_criteria>
    - `GanttRow.spec.tsx`: gerendert mit einem start- + einem ende-Frame (start_time=3600, end_time=10800) zeigt die Komponente einen Balken/ein Element mit der dem Intervall entsprechenden Geometrie (assert auf gerenderte Breite/Element-Existenz).
    - `live.tsx` exportiert eine `Route` via `createFileRoute("/_authenticated/live")` (`grep -c "createFileRoute(\"/_authenticated/live\")" live.tsx` === 1).
    - `GanttRow.tsx` importiert aus `@osim/graphobject` (`grep -c "@osim/graphobject" GanttRow.tsx` ≥ 1) — D-4.3 erfüllt.
    - `npm run lint` ist grün (keine ad-hoc-Hex/Token-Verstöße).
  </acceptance_criteria>
  <done>/live-Route gemountet, GanttRow rendert Stream-Balken über GObject, Tests + Lint grün.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stream.jsonl (von Engine geschrieben) → UI Tail-Reader | UI parst potenziell unvollständige/korrupte Zeilen während die Engine noch schreibt |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04 | Denial of Service | Tail-Reader parst korrupte/halbe JSONL-Zeilen | mitigate | `parseLines` fängt JSON.parse-Fehler pro Zeile, `console.warn` + Skip, nie throw (SPEC §8.2); halbe letzte Zeile (kein \n) wird bis zum nächsten Tick zurückgehalten |
| T-01-05 | Denial of Service | Unbegrenztes Frame-Wachstum im Store bei langen Läufen | mitigate | Per-Stream-Buffer-Cap (Ring/slice) + Render-Throttle 30Hz + Coalescing (D-4.4) |
| T-01-06 | Information Disclosure | /live-Route ohne Auth erreichbar | accept | Route liegt unter `_authenticated/` — bestehender Auth-Guard greift; keine zusätzliche Mitigation nötig |
</threat_model>

<verification>
- O-3: `features/live-stream/` existiert mit tail-reader, store, GanttRow.
- AC-4: Store-Filter isoliert einen Stream (Store-Spec).
- AC-5-Basis: Reader ist Offset-Restart-fähig (Tail-Reader-Spec).
- AC-3-Basis: 200ms-Polling-Tick in der Route.
</verification>

<success_criteria>
- `cd osim-ui/portal && npm run test:run -- src/features/live-stream` grün.
- `npm run lint` grün.
- `/live`-Route ist im generierten routeTree vorhanden.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-02-SUMMARY.md` when done. Dokumentiere Store-API (Actions/Selector-Namen) + GanttRow-Props, damit Wave 3 (KpiTile/RecordTable/stream-router) darauf aufsetzt.
</output>
