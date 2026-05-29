/**
 * Frame-Typen des Live-Stream-Feature-Moduls (Plan 01-02 Task 1).
 *
 * Quelle des Vertrags: 01-01-SUMMARY.md + 01-SPEC.md §6.2. Jede Zeile von
 * `runs/<run-id>/stream.jsonl` ist ein {@link Frame}. Der UI-Typ MUSS exakt
 * zur Engine-Seite (engine/src/osim_engine/streaming/frame.py) passen.
 */

/** Die 6 Sub-Stream-Tags (SPEC §6.2 / engine STREAM_TAGS). */
export type StreamTag =
  | "lifecycle"
  | "gantt_durchlauf"
  | "gantt_einsatz"
  | "gantt_schicht"
  | "kpi_auswertung"
  | "reporting_record";

/** Geordnete Tag-Liste — Quelle für Tab-Reihenfolge + Buffer-Init. */
export const STREAM_TAGS: readonly StreamTag[] = [
  "lifecycle",
  "gantt_durchlauf",
  "gantt_einsatz",
  "gantt_schicht",
  "kpi_auswertung",
  "reporting_record",
] as const;

/** Type-Guard: ist `tag` ein bekannter StreamTag? */
export function isStreamTag(tag: unknown): tag is StreamTag {
  return (
    typeof tag === "string" &&
    (STREAM_TAGS as readonly string[]).includes(tag)
  );
}

/**
 * Eine einzelne Stream-Zeile.
 *
 * Pflichtfelder: `t` (Sim-Zeit in Sekunden), `stream` (Sub-Stream-Tag),
 * `seq` (global monoton steigend über ALLE Streams), `v` (Payload).
 * Optional: `wall_t` (ISO-8601 Wall-Clock), `meta_event` (OMetaEvent-Name).
 */
export interface Frame {
  t: number;
  stream: StreamTag;
  seq: number;
  v: Record<string, unknown>;
  wall_t?: string;
  meta_event?: string;
}

/** Pro-Stream-Status-Block aus meta.json (D-2.2). */
export interface StreamStatus {
  status: "partial" | "full";
  missing_slices?: string[];
  reason?: string;
}

/**
 * meta.json-Vertrag (SPEC §6.4 + D-2.2). `schema_version` wird beim Start
 * geprüft (D-OP-4: Best-Effort + Warning, kein Hard-Block). `streams` trägt
 * den partial/full-Status pro Tag für das Wave-3-Banner.
 */
export interface MetaJson {
  run_id: string;
  schema_version: string;
  engine_version?: string;
  started_at?: string;
  drop_count?: number;
  streams: Partial<Record<StreamTag, StreamStatus>>;
}
