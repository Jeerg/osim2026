// Plan 01-04 Task 1: Minimaler API-Client mit Firebase-JWT-Injection.
//
// Anders als 3fls verwenden wir KEIN openapi-fetch in Phase 1 (Backend
// hat noch keinen stabilen openapi.json-Snapshot; Plan 05+ kann das
// nachruesten wenn die Endpoint-Vertraege stehen). Hier nur ein duenner
// Wrapper um apiFetch mit Typed-Convenience-Methoden.
import { apiFetch } from "./fetch";

export const apiClient = {
  get<T>(path: string, init?: RequestInit) {
    return apiFetch<T>(path, { ...init, method: "GET" });
  },
  post<T>(path: string, body?: unknown, init?: RequestInit) {
    return apiFetch<T>(path, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : init?.body,
    });
  },
  put<T>(path: string, body?: unknown, init?: RequestInit) {
    return apiFetch<T>(path, {
      ...init,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : init?.body,
    });
  },
  patch<T>(path: string, body?: unknown, init?: RequestInit) {
    return apiFetch<T>(path, {
      ...init,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : init?.body,
    });
  },
  delete<T>(path: string, init?: RequestInit) {
    return apiFetch<T>(path, { ...init, method: "DELETE" });
  },
};
