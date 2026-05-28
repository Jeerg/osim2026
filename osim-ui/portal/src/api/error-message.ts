/**
 * Zentrale ApiError → deutsche Toast-Message-Mapping-Funktion.
 *
 * Pattern aus tbx_stzrim/portal/src/api/error-message.ts übernommen
 * (Plan-24-04.2-Lesson "Single Source of Truth für Code → User-Text"),
 * Codes sind osim-ui-spezifisch (definiert in PROJECT.md / Plan 04).
 *
 * Backend liefert ProblemDetail (RFC 7807 §3.2) mit `code`-Top-Level-Extension:
 *
 *     {
 *       "type": "about:blank",
 *       "title": "E_MODEL_LOCKED",
 *       "status": 409,
 *       "detail": "Modell wird gerade von ... bearbeitet.",
 *       "code": "E_MODEL_LOCKED"
 *     }
 *
 * Caller-Pattern:
 *
 *     try { await apiFetch(...); }
 *     catch (err) { toast.error(apiErrorMessage(err, "Modell laden fehlgeschlagen")); }
 */
import { ApiError } from "./fetch";

/**
 * Deutsche User-facing Labels für stable osim-ui-Backend-Error-Codes.
 *
 * Diese Liste deckt die in Plan 01-03 PATTERNS.md geforderten 5+ Codes ab.
 * Erweiterungen kommen in Plan 04 (Lock-Service), Plan 05 (Storage), Plan 11
 * (Snapshot/Auto-Save) — bei jeder Erweiterung den Code-String mit dem Backend
 * synchronisieren.
 */
const TOAST_DE: Record<string, string> = {
  E_MODEL_LOCKED:
    "Modell wird gerade von einem anderen Nutzer bearbeitet.",
  E_LOCK_EXPIRED:
    "Ihre Bearbeitungs-Sperre ist abgelaufen. Bitte Seite neu laden.",
  E_OTX_PARSE_FAILED:
    "Die OTX-Datei konnte nicht gelesen werden. Encoding muss Latin-1 sein.",
  E_OTX_COVERAGE_INCOMPLETE:
    "Modell enthält Objekte, die nicht zurück nach OTX gespeichert werden können.",
  E_VERSION_CONFLICT:
    "Modell wurde inzwischen geändert. Bitte neu laden und Änderungen wiederholen.",
  E_UPLOAD_TOO_LARGE:
    "Datei ist zu groß (max. 30 MB).",
  E_INVALID_OTX_MIMETYPE:
    "Datei muss eine OTX-Datei sein.",
};

interface ProblemDetailLike {
  code?: unknown;
  detail?: unknown;
  message?: unknown;
}

/**
 * Extrahiert einen stable Backend-Error-Code aus dem ApiError-Body.
 *
 * Resolutions-Reihenfolge:
 *  1. `body.code`          (Top-Level RFC-7807-Extension — kanonisch).
 *  2. `body.detail.code`   (Fallback: detail als Objekt mit code-Feld).
 *  3. Regex auf `body.detail`-String (Python-`str(dict)`-Legacy-Format).
 *  4. "" — kein Code extrahierbar.
 */
export function extractErrorCode(err: unknown): string {
  if (!(err instanceof ApiError) || err.body == null) return "";
  const body = err.body as ProblemDetailLike;

  // 1. Top-Level-Code.
  if (typeof body.code === "string" && body.code.length > 0) {
    return body.code;
  }

  // 2. detail als Objekt.
  const detail = body.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const code = (detail as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }

  // 3. Legacy `str(dict)`-Regex (sollte in Phase 1 nicht vorkommen, aber für
  //    Backwards-Compat falls ein Endpoint die _service_error_to_http-Map
  //    noch nicht durchläuft).
  if (typeof detail === "string") {
    const m = detail.match(/'code':\s*'([A-Z_]+)'/);
    if (m) return m[1];
  }

  return "";
}

/**
 * Liefert eine deutsche User-facing Message für einen Fehler.
 *
 * Resolutions-Reihenfolge:
 *  1. Gemappte Label für den extrahierten Code (TOAST_DE).
 *  2. `body.detail`-String wenn vorhanden (Backend liefert idR DE-Text).
 *  3. `body.detail.message`-Field (Legacy-Envelope).
 *  4. Fallback `"<fallback> (HTTP <status>)."` — zumindest sieht der User
 *     noch eine Statusnummer.
 *  5. Bei nicht-ApiError: `err.message` wenn `Error`, sonst `fallback`.
 */
export function apiErrorMessage(err: unknown, fallback = "Fehler"): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }
  const code = extractErrorCode(err);
  if (code && TOAST_DE[code]) {
    return TOAST_DE[code];
  }

  const body = err.body as ProblemDetailLike | null;
  if (body) {
    if (typeof body.detail === "string" && body.detail.length > 0) {
      return body.detail;
    }
    if (
      body.detail &&
      typeof body.detail === "object" &&
      "message" in body.detail
    ) {
      const msg = (body.detail as { message?: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    }
  }
  return `${fallback} (HTTP ${err.status}).`;
}

/** Export für Tests + Konsumenten, die das DE-Set inspizieren. */
export { TOAST_DE };
