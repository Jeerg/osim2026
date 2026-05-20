// Plan 01-04 Task 1: apiFetch — leichtgewichtiger Fetch-Wrapper, der
// den Firebase-JWT als Authorization-Header anhaengt.
//
// Aus tbx_stzrim/portal/src/api/fetch.ts uebernommen, abgespeckt:
// - Kein apiFetchBlob (Phase 1 hat keinen Binary-Export-Use-Case;
//   Plan 09 fuer OTX-Download wird das nachziehen).
// - Kein parseContentDispositionFilename-Import (gehoert zu apiFetchBlob).
import { auth } from "@/auth/firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Error class thrown by apiFetch on non-2xx responses.
 *
 * Carries status + parsed body so callers koennen je nach Status
 * differenziert reagieren (404 = "Modell weg", 422 = Validierungsfehler,
 * 5xx = generischer Fehler-Toast).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API error ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Fetch-Wrapper, der den Firebase-JWT automatisch anhaengt.
 *
 * @param path - relativer oder absoluter Pfad. Wenn relativ (mit "/" beginnend),
 *               wird BASE_URL davorgehaengt.
 * @param init - Standard-fetch-RequestInit. Bei body wird Content-Type auf
 *               application/json default-gesetzt, falls nicht ueberschrieben.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(false);
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    let body: unknown = null;
    try {
      const text = await response.text();
      body = text
        ? ((): unknown => {
            try {
              return JSON.parse(text);
            } catch {
              return text;
            }
          })()
        : null;
    } catch {
      // Body-Read fehlgeschlagen — Status reicht fuer Caller.
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  // 204 No Content — undefined als T zurueckgeben (Caller typisiert das).
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
