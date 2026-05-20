// Plan 01-05 Task 1: TanStack-Query-Hook fuer das Tree-Backend-API.
//
// Liefert das JsonTreeDocument der aktuellen Version eines Modells aus
// GET /api/v1/models/{id}/tree. Server liefert
//   { model_id, version, tree: { schema_version, root } }.

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import type { OtxJsonNode } from "@/viewers/core/types";

/**
 * Vom Backend geliefertes Tree-Document. Das Property `tree` enthaelt
 * { schema_version, root: OtxJsonNode }.
 */
export interface TreeResponseBody {
  model_id: number;
  version: number;
  tree: {
    schema_version: string;
    root: OtxJsonNode;
  };
}

export function modelTreeQueryKey(modelId: number) {
  return ["model-tree", modelId] as const;
}

export function useModelTreeQuery(modelId: number) {
  return useQuery<TreeResponseBody>({
    queryKey: modelTreeQueryKey(modelId),
    queryFn: () => apiClient.get(`/api/v1/models/${modelId}/tree`),
    // Modell-Tree ist nicht hochfrequent; Plan 09 invalidiert manuell
    // nach Save-back.
    staleTime: 60 * 1000,
  });
}
