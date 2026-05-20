// Plan 01-05 Task 1: ModelsList — Liste der eigenen Modelle.
//
// Liest GET /api/v1/models, zeigt Tabelle mit Name, Coverage-Bar,
// Created-At und Lock-Status. Klick "Oeffnen" navigiert zu /models/{id}.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

export interface ModelListItem {
  id: number;
  name: string;
  original_filename: string;
  owner_uid: string;
  coverage_ratio_at_upload: number;
  current_version_id: number | null;
  created_at: string;
  updated_at: string;
}

export function ModelsList() {
  const { data, isLoading, error, refetch } = useQuery<ModelListItem[]>({
    queryKey: ["models"],
    queryFn: () => apiClient.get<ModelListItem[]>("/api/v1/models"),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-gray-500" data-testid="models-list-loading">
        Laedt Modelle…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6" data-testid="models-list-error">
        <p className="text-sm text-red-700">
          Fehler beim Laden der Modelle: {error.message}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const models = data ?? [];

  if (models.length === 0) {
    return (
      <div
        className="mx-auto max-w-xl space-y-4 p-8 text-center"
        data-testid="models-list-empty"
      >
        <p className="text-sm text-gray-600">
          Noch keine Modelle. Laden Sie Ihr erstes OTX-Modell hoch.
        </p>
        <Link
          to="/models/upload"
          className="inline-block rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Modell hochladen
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="models-list">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Modelle</h2>
        <Link
          to="/models/upload"
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Modell hochladen
        </Link>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Datei</th>
              <th className="px-3 py-2 text-left">Coverage</th>
              <th className="px-3 py-2 text-left">Erstellt</th>
              <th className="px-3 py-2 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr
                key={m.id}
                className="border-t border-gray-100"
                data-testid={`models-list-row-${m.id}`}
              >
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {m.original_filename}
                </td>
                <td className="px-3 py-2">
                  <CoverageBar value={m.coverage_ratio_at_upload} />
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {new Date(m.created_at).toLocaleString("de-DE")}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/models/$modelId"
                    params={{ modelId: m.id }}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Oeffnen
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageBar({ value }: { value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  const color =
    pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded bg-gray-200">
        <div
          className={`h-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600">{pct}%</span>
    </div>
  );
}
