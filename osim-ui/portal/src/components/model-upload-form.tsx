// Plan 01-05 Task 1: ModelUploadForm — File-Picker + Submit zu
// POST /api/v1/models/upload-otx.
//
// Phase 1: einfacher File-Picker (kein react-dropzone), Loading-Spinner
// ohne echten Progress. Bei Erfolg redirect zu /models/{id} + Coverage-
// Report unterhalb des Forms.

import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { auth } from "@/auth/firebase";
import { ApiError } from "@/api/fetch";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

interface UploadResponse {
  id: number;
  name: string;
  coverage_ratio: number;
  loaded_summary: Record<string, number>;
  unsupported_summary: Record<string, number>;
}

export function ModelUploadForm() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError("Bitte eine .otx-Datei auswaehlen.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Datei zu gross (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB).`);
      return;
    }

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const user = auth.currentUser;
      const headers = new Headers({ Accept: "application/json" });
      if (user) {
        const token = await user.getIdToken(false);
        headers.set("Authorization", `Bearer ${token}`);
      }
      const res = await fetch(`${API_BASE_URL}/api/v1/models/upload-otx`, {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        throw new ApiError(res.status, res.statusText, body);
      }
      const data = (await res.json()) as UploadResponse;
      setResult(data);
      // kurze Anzeige des Coverage-Reports, dann redirect
      setTimeout(() => {
        void navigate({
          to: "/models/$modelId",
          params: { modelId: data.id },
        });
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 413) {
          setError("Datei zu gross (max 50 MB).");
        } else if (err.status === 422) {
          const detail = (err.body as { detail?: unknown })?.detail;
          setError(
            typeof detail === "string"
              ? detail
              : "OTX-Datei konnte nicht geparst werden.",
          );
        } else {
          setError(`Upload fehlgeschlagen: ${err.message}`);
        }
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Upload fehlgeschlagen (unbekannter Fehler).",
        );
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-lg font-semibold">Modell hochladen</h2>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded border border-gray-200 bg-white p-6"
        data-testid="model-upload-form"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            OTX-Datei (.otx)
          </span>
          <input
            type="file"
            accept=".otx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={isUploading}
            data-testid="model-upload-file-input"
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:text-blue-700 hover:file:bg-blue-100"
          />
        </label>
        {file && (
          <p className="text-xs text-gray-600">
            Ausgewaehlt: <code>{file.name}</code> ({(file.size / 1024).toFixed(1)}{" "}
            KB)
          </p>
        )}
        {error && (
          <p
            className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
            data-testid="model-upload-error"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isUploading || !file}
          className="w-full rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          data-testid="model-upload-submit"
        >
          {isUploading ? "Lade hoch…" : "Hochladen"}
        </button>
      </form>

      {result && (
        <div
          className="mt-4 rounded border border-green-300 bg-green-50 p-4"
          data-testid="model-upload-result"
        >
          <h3 className="text-sm font-semibold text-green-800">
            Erfolgreich hochgeladen: {result.name}
          </h3>
          <p className="mt-1 text-xs text-green-700">
            Coverage: {Math.round(result.coverage_ratio * 100)}%
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <CoverageSummary
              title="Geladen"
              summary={result.loaded_summary}
            />
            <CoverageSummary
              title="Unsupported"
              summary={result.unsupported_summary}
              warn
            />
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Weiterleitung zum Workspace…
          </p>
        </div>
      )}
    </div>
  );
}

function CoverageSummary({
  title,
  summary,
  warn,
}: {
  title: string;
  summary: Record<string, number>;
  warn?: boolean;
}) {
  const entries = Object.entries(summary).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <div>
        <h4 className="font-medium text-gray-700">{title}</h4>
        <p className="text-gray-500">—</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className={`font-medium ${warn ? "text-amber-700" : "text-gray-700"}`}>
        {title}
      </h4>
      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
        {entries.map(([klass, count]) => (
          <li key={klass} className="flex justify-between gap-2">
            <code className="truncate text-gray-600">{klass}</code>
            <span className="font-mono">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
