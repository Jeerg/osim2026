import { auth } from "@/auth/firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Error-Klasse, die `apiFetch` bei non-2xx-Responses wirft.
 *
 * Eigene Klasse statt `new Error("API error 401")`, weil Caller den HTTP-Status
 * status-spezifisch behandeln müssen (409 Lock-Konflikt vs. 423 Locked vs. 404
 * Modell-nicht-gefunden) und auf den geparsten Body (RFC-7807 `code`-Feld via
 * `error-message.ts`) zugreifen.
 */
export class ApiError extends Error {
  /** HTTP-Statuscode (z.B. 401, 409, 422, 500). */
  readonly status: number;
  /** Parsed Response-Body wenn JSON, sonst Raw-Text, sonst null. */
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API error ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Leichtgewichtiger Fetch-Wrapper für die osim-ui-Backend-API.
 *
 * Eigenschaften:
 *  - hängt automatisch einen frischen Firebase-ID-Token als `Authorization`-
 *    Header an, wenn ein User authentisiert ist (`getIdToken(false)` nutzt den
 *    Firebase-internen Cache + Auto-Refresh).
 *  - setzt `Accept: application/json` und (bei body und ohne explizites
 *    Content-Type) `Content-Type: application/json` per Default.
 *  - wirft `ApiError` mit geparstem Body bei non-2xx.
 *  - returnt `undefined as T` bei 204.
 *
 * Phase 1: kein `apiFetchBlob` — kommt in Plan 04 (OTX-Download). Phase 3
 * tauscht Caller potenziell gegen `openapi-fetch` für typsichere Schema-Pfade.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  // FormData ausnehmen: der Browser setzt selbst `Content-Type:
  // multipart/form-data; boundary=...` und Vorab-Setzen würde den
  // boundary-Parameter killen → FastAPI rejected mit 422.
  if (
    init?.body &&
    !headers.has("Content-Type") &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(false);
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      const text = await response.text();
      body = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return text;
            }
          })()
        : null;
    } catch {
      // Body konnte nicht gelesen werden — Status reicht für die meisten Caller.
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  // 204 No Content — return undefined als T (Caller-Type definiert die Form).
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
