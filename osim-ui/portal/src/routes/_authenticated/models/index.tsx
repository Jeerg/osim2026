/**
 * Route: /models — Modell-Bibliothek (Plan 1.1 Redesign).
 *
 * Two-Pane-Layout: links eine schmale Liste, rechts eine Vorschau mit
 * Metadaten und Aktionen. E2E-Test-Modelle (Prefix `E2E-`) werden
 * automatisch herausgefiltert.
 */

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CalendarIcon,
  FileBoxIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage } from "@/api/error-message";
import {
  useDeleteModel,
  useModels,
  type ModelMeta,
} from "@/api/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadOtxDialog } from "@/components/UploadOtxDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/models/")({
  component: ModelLibraryPage,
});

function ModelLibraryPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useModels();
  const deleteMutation = useDeleteModel();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data
      .filter((m) => !m.name.startsWith("E2E-"))
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [data, search]);

  const selected =
    filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  function handleDelete(model: ModelMeta) {
    const ok = window.confirm(`Modell "${model.name}" wirklich löschen?`);
    if (!ok) return;
    deleteMutation.mutate(model.id, {
      onSuccess: () => {
        toast.success(`Modell "${model.name}" gelöscht`);
        if (selectedId === model.id) setSelectedId(null);
      },
    });
  }

  function handleOpen(model: ModelMeta) {
    void navigate({ to: "/models/$id", params: { id: model.id } });
  }

  return (
    <div className="grid h-full grid-cols-[minmax(280px,380px)_1fr] overflow-hidden">
      {/* ============== Linke Liste ============== */}
      <aside className="flex flex-col overflow-hidden border-r border-border bg-card">
        {/* sr-only Heading für Accessibility + E2E-Tests */}
        <h1 className="sr-only">Modell-Bibliothek</h1>
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-500">
              Modelle
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => setUploadOpen(true)}
                  data-testid="btn-upload-otx"
                  className="h-8 gap-1.5"
                >
                  <PlusIcon className="h-4 w-4" />
                  Neu
                </Button>
              </TooltipTrigger>
              <TooltipContent>OTX-Datei hochladen</TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Modell suchen…"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2" data-testid="model-grid">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground">Lade…</div>
          )}
          {error && (
            <div className="m-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {apiErrorMessage(error, "Modelle konnten nicht geladen werden")}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="m-2 rounded-lg border border-dashed border-surface-300 p-4 text-center text-sm text-muted-foreground">
              {search
                ? "Keine Treffer."
                : 'Noch keine Modelle. Über „Neu" eine OTX-Datei hochladen.'}
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {filtered.map((model) => {
              const isActive = selected?.id === model.id;
              return (
                <li key={model.id} className="group/row relative">
                  <button
                    type="button"
                    data-testid={`model-card-${model.id}`}
                    onClick={() => setSelectedId(model.id)}
                    onDoubleClick={() => handleOpen(model)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 pr-10 text-left transition-colors",
                      "hover:border-surface-200 hover:bg-surface-100",
                      isActive &&
                        "border-brand-200 bg-brand-50 hover:bg-brand-50",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                        isActive
                          ? "bg-brand-100 text-brand-700"
                          : "bg-surface-100 text-surface-500 group-hover:bg-surface-200",
                      )}
                    >
                      <FileBoxIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-surface-900">
                        {model.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-surface-500">
                        <CalendarIcon className="h-3 w-3" />
                        <span>{formatDate(model.created_at)}</span>
                      </div>
                    </div>
                  </button>
                  {/* Welle G18-B: Inline-Delete pro Karte. Default unsichtbar,
                      bei Hover oder bei aktiver Selektion sichtbar. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(model);
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`btn-delete-${model.id}`}
                    title={`Modell "${model.name}" löschen`}
                    aria-label={`Modell ${model.name} löschen`}
                    className={cn(
                      "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md",
                      "text-surface-400 opacity-0 transition-opacity",
                      "hover:bg-destructive/10 hover:text-destructive",
                      "group-hover/row:opacity-100",
                      isActive && "opacity-100",
                      "disabled:cursor-not-allowed disabled:opacity-30",
                    )}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* ============== Rechte Vorschau ============== */}
      <section className="flex flex-col overflow-hidden bg-background">
        {selected ? (
          <ModelPreview
            model={selected}
            onOpen={() => handleOpen(selected)}
            onDelete={() => handleDelete(selected)}
            deleting={deleteMutation.isPending}
          />
        ) : (
          <EmptyPreview onUpload={() => setUploadOpen(true)} />
        )}
      </section>

      <UploadOtxDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

function ModelPreview({
  model,
  onOpen,
  onDelete,
  deleting,
}: {
  model: ModelMeta;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const status = model.current_version_key
    ? { label: "Versioniert gespeichert", tone: "success" as const }
    : { label: "Original-Upload", tone: "info" as const };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-border px-8 py-6">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-surface-500">
            <FileBoxIcon className="h-3.5 w-3.5" />
            OTX-Modell
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-surface-900">
            {model.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={deleting}
                className="text-surface-500 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Modell löschen</TooltipContent>
          </Tooltip>
          <Button onClick={onOpen} className="gap-1.5">
            Workspace öffnen
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
          <PreviewField label="Status">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </PreviewField>
          <PreviewField label="Erstellt">
            {formatDateLong(model.created_at)}
          </PreviewField>
          <PreviewField label="Erstellt von">
            {model.created_by_uid.slice(0, 12)}…
          </PreviewField>
          <PreviewField label="Modell-ID">
            <code className="rounded bg-surface-100 px-1.5 py-0.5 font-mono text-xs">
              {model.id.slice(0, 8)}…
            </code>
          </PreviewField>
        </dl>

        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <h3 className="mb-2 text-sm font-semibold text-surface-900">
            Was Sie im Workspace tun können
          </h3>
          <ul className="space-y-2 text-sm text-surface-600">
            <li className="flex gap-2">
              <span className="text-brand-500">›</span>
              Modell-Struktur im Tree-Navigator durchsuchen
            </li>
            <li className="flex gap-2">
              <span className="text-brand-500">›</span>
              Eigenschaften je Objekt im Property-Editor anpassen
            </li>
            <li className="flex gap-2">
              <span className="text-brand-500">›</span>
              Durchlaufpläne im{" "}
              <span className="font-medium text-brand-700">
                Graph-Editor
              </span>{" "}
              visuell bearbeiten
            </li>
            <li className="flex gap-2">
              <span className="text-brand-500">›</span>
              Änderungen werden automatisch in IndexedDB gesichert
              (Crash-Recovery)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EmptyPreview({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <UploadIcon className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-surface-900">
          Modell auswählen
        </h2>
        <p className="mt-1 max-w-sm text-sm text-surface-500">
          Wählen Sie links ein Modell aus oder laden Sie eine neue OTX-Datei
          hoch.
        </p>
      </div>
      <Button onClick={onUpload} className="gap-1.5">
        <PlusIcon className="h-4 w-4" />
        OTX-Datei hochladen
      </Button>
    </div>
  );
}

function PreviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-surface-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-surface-900">{children}</dd>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "info" | "warning";
  children: React.ReactNode;
}) {
  const toneClasses = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    info: "bg-brand-50 text-brand-700 ring-brand-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
