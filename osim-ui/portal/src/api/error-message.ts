// Plan 01-04 Task 1: API-Error -> deutsche Anzeige-Nachricht.
//
// Phase 1 hat noch keine stabilen Backend-Error-Codes (kein E_*-Katalog);
// wir fallen direkt auf den RFC-7807 detail-String zurueck. Plan 09+ kann
// einen TOAST_DE-Mapping einfuehren, sobald die Engine-Saves stable Codes
// liefern.
import { ApiError } from "./fetch";

interface ProblemDetailLike {
  code?: unknown;
  detail?: unknown;
  message?: unknown;
}

export function apiErrorMessage(err: unknown, fallback = "Fehler"): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }

  const body = err.body as ProblemDetailLike | null;
  if (body) {
    if (typeof body.detail === "string" && body.detail.length > 0) {
      return body.detail;
    }
    if (typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }
  }

  return `${fallback} (HTTP ${err.status}).`;
}
