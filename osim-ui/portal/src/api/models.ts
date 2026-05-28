/**
 * TanStack-Query-Hooks für die `/api/v1/models`-Endpoints (aus Plan 01-04).
 *
 * Wire-Type-Mirrors zur Backend-Pydantic-Definition in
 * `app/api/schemas/model.py`. Symmetrie ist Pflicht — der Wire-Type ist der
 * Vertrag zwischen Backend und Frontend; ein Drift hier bricht Save-Back
 * silent.
 *
 * Cache-Strategie:
 *  - `["models"]`: invalidiert von Upload + Save + Delete
 *  - `["model", modelId]`: invalidiert von Save (eigene Model-ID) + Delete
 *
 * Error-Handling: Hooks werfen ApiError; UI-Layer fängt mit `apiErrorMessage`
 * + `toast.error`. Diese Datei spiegelt KEINE Toasts selbst — Caller entscheidet
 * Kontext.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/api/error-message";
import { ApiError, apiFetch } from "@/api/fetch";
import type { OBaseObj } from "@/viewers/core/types";

// -------------------------- Wire-Type-Mirrors --------------------------------

/**
 * Modell-Metadaten ohne Wire-Daten. Symmetrisch zu
 * `app/api/schemas/model.py::ModelMeta`.
 */
export interface ModelMeta {
  id: string;
  name: string;
  /** ISO-8601 UTC timestamp. */
  created_at: string;
  original_storage_key: string;
  current_version_key: string | null;
  created_by_uid: string;
}

/** Coverage-Info zum Lade-Vorgang (siehe `ModelCoverage` im Backend). */
export interface ModelCoverage {
  loaded: number;
  skipped: number;
  unsupported: string[];
}

/**
 * Wire-Form des kompletten Modells. Symmetrisch zu
 * `app/api/schemas/model.py::ModelTreeWire`.
 *
 * `objects` ist ein OID-Index — beim JSON-Transport sind die Keys Strings
 * (JSON erlaubt keine numerischen Keys), Werte sind `OBaseObj` (siehe
 * `portal/src/viewers/core/types.ts`).
 */
export interface ModelTreeWire {
  version: 1;
  simulator_oid: number;
  objects: Record<number, OBaseObj>;
  coverage: ModelCoverage;
  schemas_url: string;
}

/** Antwort von `POST /api/v1/models/upload-otx`. */
export interface UploadOtxResponse {
  model: ModelMeta;
  wire: ModelTreeWire;
}

/** Antwort von `GET /api/v1/models/{id}`. */
export interface GetModelResponse {
  model: ModelMeta;
  wire: ModelTreeWire;
}

/** Body von `PUT /api/v1/models/{id}`. */
export interface SaveModelRequest {
  wire: ModelTreeWire;
  lock_token: string;
}

/** Antwort von `PUT /api/v1/models/{id}`. */
export interface SaveModelResponse {
  model: ModelMeta;
  saved_version_key: string;
}

// -------------------------- Hooks --------------------------------------------

/**
 * Lädt die Liste aller Modelle des Tenants.
 *
 * Cache-Key: `["models"]`. Wird invalidiert von Upload/Save/Delete.
 */
export function useModels(): UseQueryResult<ModelMeta[], ApiError> {
  return useQuery<ModelMeta[], ApiError>({
    queryKey: ["models"],
    queryFn: () => apiFetch<ModelMeta[]>("/api/v1/models"),
  });
}

/**
 * Lädt ein einzelnes Modell inkl. Wire-Tree.
 *
 * `enabled: !!modelId` verhindert ungewollte Aufrufe wenn die ID noch nicht
 * aus dem Route-Param resolved ist.
 */
export function useModel(
  modelId: string | null,
): UseQueryResult<GetModelResponse, ApiError> {
  return useQuery<GetModelResponse, ApiError>({
    queryKey: ["model", modelId],
    queryFn: () =>
      apiFetch<GetModelResponse>(`/api/v1/models/${modelId}`),
    enabled: !!modelId,
  });
}

/**
 * Lädt ein OTX-File hoch (multipart/form-data). Bei Erfolg invalidiert die
 * Models-Liste. Toast-Errors werden vom Hook selbst gefeuert (UX-Convenience).
 *
 * Hinweis: Kein `Content-Type` setzen — der Browser fügt den
 * multipart-boundary automatisch hinzu. apiFetch setzt nur dann `application/
 * json` als Default, wenn der body kein FormData ist; FormData hat aber bereits
 * einen automatischen Content-Type, den der Browser ergänzt.
 */
export function useUploadOtx(): UseMutationResult<
  UploadOtxResponse,
  ApiError,
  { file: File; name: string }
> {
  const queryClient = useQueryClient();
  return useMutation<UploadOtxResponse, ApiError, { file: File; name: string }>(
    {
      mutationFn: async ({ file, name }) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name);
        // apiFetch fügt Auth-Header automatisch hinzu. Content-Type für
        // multipart darf NICHT manuell gesetzt werden — sonst fehlt der
        // boundary-Parameter und das Backend rejected mit 400.
        return await apiFetch<UploadOtxResponse>(
          "/api/v1/models/upload-otx",
          {
            method: "POST",
            body: formData,
          },
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["models"] });
      },
      onError: (err) => {
        toast.error(apiErrorMessage(err, "OTX-Upload fehlgeschlagen"));
      },
    },
  );
}

/**
 * Speichert den aktuellen Wire-Stand zurück (Save-Back).
 *
 * Benötigt einen aktiven Lock-Token (aus `/api/v1/models/{id}/lock`).
 * Bei Erfolg: invalidiere Detail + Liste.
 */
export function useSaveModel(
  modelId: string,
): UseMutationResult<SaveModelResponse, ApiError, SaveModelRequest> {
  const queryClient = useQueryClient();
  return useMutation<SaveModelResponse, ApiError, SaveModelRequest>({
    mutationFn: async (body) => {
      return await apiFetch<SaveModelResponse>(`/api/v1/models/${modelId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["model", modelId] });
      void queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Speichern fehlgeschlagen"));
    },
  });
}

/**
 * Löscht ein Modell. Bei Erfolg: invalidiere Liste.
 */
export function useDeleteModel(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (modelId) => {
      await apiFetch<void>(`/api/v1/models/${modelId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Löschen fehlgeschlagen"));
    },
  });
}
