/**
 * TanStack-Query-Hook für das hand-curated PropertySchema-Backend
 * (`GET /api/v1/schemas/v1`, implementiert in Plan 01-07 Backend-Seite).
 *
 * Cache-Strategie: `staleTime: Infinity` — das Schema ändert sich nur bei
 * einem Server-Deployment (neue Engine-Version oder neue Property-Coverage).
 * Während einer Browser-Session bleibt das Schema konstant, kein erneutes
 * Refetching nötig. Backend setzt zusätzlich `Cache-Control: public,
 * max-age=86400` als HTTP-Cache-Layer.
 *
 * Format:
 *
 *     { "version": 1, "note": "...",
 *       "schemas": [
 *         { "klass": "ASimulator", "label_de": "Simulator",
 *           "viewer_hints": ["std"],
 *           "properties": [{ "name": "m_name", ... }] },
 *         ...
 *       ]
 *     }
 */

import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/api/fetch";
import type { ClassSchema } from "@/viewers/core/types";

/** Response-Envelope von `GET /api/v1/schemas/v1`. */
export interface SchemasResponse {
  version: 1;
  note?: string;
  schemas: ClassSchema[];
}

/**
 * Lädt die PropertySchema-Liste vom Backend. Wird in Plan 07 vom
 * Workspace-Route (`/_authenticated/models/$id`) konsumiert; in Plan 08+09
 * dann von den konkreten Viewer-Komponenten (über `useSchemaFor`).
 */
export function useSchemas(): UseQueryResult<SchemasResponse, ApiError> {
  return useQuery<SchemasResponse, ApiError>({
    queryKey: ["schemas-v1"],
    queryFn: () => apiFetch<SchemasResponse>("/api/v1/schemas/v1"),
    staleTime: Infinity,
    // Schema-Datei ist statisch — kein automatisches Refetch beim Window-
    // Refocus oder Reconnect.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Liefert das ClassSchema einer einzelnen Klasse aus dem Cache der Liste.
 * Returnt `null`, wenn `klass` null oder das Schema (noch) nicht geladen ist
 * oder die Klasse nicht im Schema-Set enthalten ist.
 *
 * Caller-Pattern in ViewerFrame:
 *
 *     const getSchemaFor = useCallback(
 *       (klass: string) => useSchemaFor(klass),
 *       [schemas],
 *     )
 *
 * Hinweis: useSchemaFor ist KEIN Hook im strikten Sinn (nutzt selbst useSchemas
 * intern); die Suffix `-For` deutet auf eine reine Lookup-Funktion.
 */
export function useSchemaFor(klass: string | null): ClassSchema | null {
  const { data } = useSchemas();
  if (!klass || !data) return null;
  return data.schemas.find((s) => s.klass === klass) ?? null;
}
