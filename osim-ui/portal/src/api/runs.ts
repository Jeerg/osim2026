/**
 * HTTP-Client für die Run-Endpoints (aus Plan 01-08).
 *
 * Wire-Type-Mirrors zur Backend-Pydantic-Definition in
 * `app/api/schemas/run.py`. Endpoint-Pfad-Satz (01-08-SUMMARY ist maßgeblich):
 *
 *   POST /api/v1/models/{model_id}/runs  -> StartRunResponse{run_id, model_id, coverage_ratio, status}
 *   GET  /api/v1/runs/{run_id}/stream?offset=<n> -> StreamChunk{text, next_offset}
 *   GET  /api/v1/runs/{run_id}/meta      -> meta.json (MetaJson)
 *
 * `buildStreamReadFn` adaptiert den Backend-StreamChunk (`{text, next_offset}`,
 * snake_case) auf die tail-reader-`ReadFn`-Signatur (`{text, nextOffset}`,
 * camelCase). Der Tail-Reader pollt mit `offset=next_offset` des vorigen Reads
 * und erhält nur die nachgewachsenen Bytes (AC-3/AC-5-Basis).
 *
 * Auth: apiFetch hängt automatisch den Firebase-Bearer-Token an; AuthZ liegt
 * serverseitig (run_id tenant-confined, T-LIVE-FE-01). Der Stream-Endpoint
 * liefert JSON (`{text, next_offset}`), kein Raw-Body — apiFetch<StreamChunk>
 * ist also korrekt (kein Raw-Read nötig).
 */

import { apiFetch } from "@/api/fetch";
import type { ReadFn } from "@/features/live-stream/tail-reader";
import type { MetaJson } from "@/features/live-stream/types";

// -------------------------- Wire-Type-Mirrors --------------------------------

/**
 * Antwort von `POST /api/v1/models/{model_id}/runs`. Symmetrisch zu
 * `app/api/schemas/run.py::StartRunResponse`.
 *
 * `coverage_ratio` < 1.0 zeigt ein partielles Modell an (nicht alle Objekte
 * geladen) — die UI surfaced den Wert, statt ihn zu verstecken (D-2.2).
 */
export interface StartRunResponse {
  run_id: string;
  model_id: string;
  coverage_ratio: number;
  status: string;
}

/**
 * Antwort von `GET /api/v1/runs/{run_id}/stream`. Symmetrisch zu
 * `app/api/schemas/run.py::StreamChunk`. `next_offset` ist der Byte-Offset für
 * den nächsten inkrementellen Poll.
 */
export interface StreamChunk {
  text: string;
  next_offset: number;
}

// -------------------------- Client-Funktionen --------------------------------

/**
 * Startet einen Lauf für das gegebene Modell.
 *
 * Wirft `ApiError` bei non-2xx; der Caller fängt mit `apiErrorMessage` +
 * `toast.error`.
 */
export async function startRun(modelId: string): Promise<StartRunResponse> {
  return await apiFetch<StartRunResponse>(
    `/api/v1/models/${modelId}/runs`,
    { method: "POST" },
  );
}

/**
 * Baut eine {@link ReadFn} über den Stream-Endpoint des gegebenen Runs.
 *
 * Die zurückgegebene Funktion pollt `GET /api/v1/runs/{run_id}/stream?offset=`
 * und mapped die Backend-`next_offset`-Antwort (snake_case) auf die
 * tail-reader-`nextOffset`-Signatur (camelCase). Der Tail-Reader hält den
 * Offset intern und ruft die ReadFn pro Tick mit dem zuletzt erreichten Offset.
 */
export function buildStreamReadFn(runId: string): ReadFn {
  return (offset: number) =>
    apiFetch<StreamChunk>(
      `/api/v1/runs/${runId}/stream?offset=${offset}`,
    ).then((chunk) => ({
      text: chunk.text,
      nextOffset: chunk.next_offset,
    }));
}

/**
 * Lädt die meta.json des Runs (Schema-Mismatch-/partial-Status-Banner-Pfad,
 * D-2.2 / D-OP-4 / AC-7).
 */
export async function fetchRunMeta(runId: string): Promise<MetaJson> {
  return await apiFetch<MetaJson>(`/api/v1/runs/${runId}/meta`);
}
