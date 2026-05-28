import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PencilLineIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { viewerRegistry } from "@/viewers/core/ViewerRegistry";
import type {
  AttrValue,
  ClassSchema,
  OBaseObj,
  ViewerCommand,
  ViewerHint,
} from "@/viewers/core/types";

export interface ViewerFrameProps {
  selection: number | null;
  objects: Record<number, OBaseObj>;
  getSchemaFor: (klass: string) => ClassSchema | null;
  onSelectionChange?: (oid: number | null) => void;
  onPatch: (oid: number, patch: Record<string, AttrValue>) => void;
  onCommand: (cmd: ViewerCommand) => void;
  viewerHint?: ViewerHint;
  disabled?: boolean;
  className?: string;
}

interface ToolbarBtnProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}

const ToolbarBtn: React.FC<ToolbarBtnProps> = ({
  label,
  icon,
  onClick,
  disabled,
  variant = "default",
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "h-8 w-8 text-surface-600 hover:bg-surface-100 hover:text-surface-900",
          variant === "danger" &&
            "hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

interface ViewerToolbarProps {
  onCommand: (cmd: ViewerCommand) => void;
  disabled: boolean;
  hasSelection: boolean;
  currentOid: number | null;
  objectLabel?: string;
  objectKlass?: string;
  /**
   * Rohe Wire-Klasse des aktuell angezeigten Objekts (NICHT das lokalisierte
   * Label). Quelle für das "+"-Kommando: ein neues Objekt wird in der Klasse
   * der gerade betrachteten LList angelegt — 1:1 zu OSim2004
   * `OViewerFrameDlgLList::OnLstAppendObj` (`m_pLList->GetClassID()` →
   * `pMeta->New`). Ist sie null, fehlt der Listen-Kontext und "+" ist inaktiv.
   */
  currentKlass: string | null;
}

const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  onCommand,
  disabled,
  hasSelection,
  currentOid,
  objectLabel,
  objectKlass,
  currentKlass,
}) => {
  const navDisabled = disabled || !hasSelection;
  const oid = currentOid ?? 0;
  return (
    <div
      data-slot="viewer-toolbar"
      className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PencilLineIcon className="h-4 w-4 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-surface-900">
            {objectLabel ?? "Kein Objekt ausgewählt"}
          </div>
          {objectKlass && (
            <div className="text-[11px] uppercase tracking-wider text-surface-500">
              {objectKlass}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <ToolbarBtn
          label="Erstes Objekt"
          icon={<ChevronsLeftIcon className="h-4 w-4" />}
          disabled={navDisabled}
          onClick={() => onCommand({ type: "navigate", direction: "first" })}
        />
        <ToolbarBtn
          label="Vorheriges Objekt"
          icon={<ChevronLeftIcon className="h-4 w-4" />}
          disabled={navDisabled}
          onClick={() => onCommand({ type: "navigate", direction: "prev" })}
        />
        <ToolbarBtn
          label="Nächstes Objekt"
          icon={<ChevronRightIcon className="h-4 w-4" />}
          disabled={navDisabled}
          onClick={() => onCommand({ type: "navigate", direction: "next" })}
        />
        <ToolbarBtn
          label="Letztes Objekt"
          icon={<ChevronsRightIcon className="h-4 w-4" />}
          disabled={navDisabled}
          onClick={() => onCommand({ type: "navigate", direction: "last" })}
        />

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarBtn
          label={
            currentKlass
              ? `Neues Objekt anlegen (${currentKlass})`
              : "Neues Objekt anlegen"
          }
          icon={<PlusIcon className="h-4 w-4" />}
          disabled={disabled || !currentKlass}
          onClick={() =>
            currentKlass &&
            onCommand({ type: "create", objKlass: currentKlass })
          }
        />
        <ToolbarBtn
          label="Werte zurücksetzen"
          icon={<RotateCcwIcon className="h-4 w-4" />}
          disabled={navDisabled}
          onClick={() => hasSelection && onCommand({ type: "reset", oid })}
        />
        <ToolbarBtn
          label="Objekt löschen"
          icon={<Trash2Icon className="h-4 w-4" />}
          disabled={navDisabled}
          variant="danger"
          onClick={() => hasSelection && onCommand({ type: "delete", oid })}
        />
      </div>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
      <PencilLineIcon className="h-6 w-6" />
    </div>
    <div>
      <h3 className="text-sm font-medium text-surface-900">
        Kein Objekt ausgewählt
      </h3>
      <p className="mt-1 max-w-sm text-sm text-surface-500">
        Wählen Sie links im Tree-Navigator ein Objekt aus, um seine
        Eigenschaften zu bearbeiten.
      </p>
    </div>
  </div>
);

export const ViewerFrame: React.FC<ViewerFrameProps> = ({
  selection,
  objects,
  getSchemaFor,
  onPatch,
  onCommand,
  viewerHint,
  disabled = false,
  className,
}) => {
  const obj = selection !== null ? (objects[selection] ?? null) : null;
  const Viewer = obj
    ? viewerRegistry.resolve(obj.klass, viewerHint)
    : undefined;
  const schema = obj ? getSchemaFor(obj.klass) : null;

  const objectLabel = obj
    ? (typeof obj.attrs.m_sName === "string" && obj.attrs.m_sName) ||
      (typeof obj.attrs.m_name === "string" && obj.attrs.m_name) ||
      `${obj.klass} #${obj.oid}`
    : undefined;

  return (
    <div
      data-slot="viewer-frame"
      className={cn("flex h-full flex-col bg-background", className)}
    >
      <ViewerToolbar
        onCommand={onCommand}
        disabled={disabled}
        hasSelection={obj !== null}
        currentOid={obj?.oid ?? null}
        objectLabel={objectLabel as string | undefined}
        objectKlass={schema?.label_de ?? obj?.klass}
        currentKlass={obj?.klass ?? null}
      />
      {obj && Viewer && schema ? (
        <div className="flex-1 overflow-auto">
          <Viewer
            obj={obj}
            schema={schema}
            allObjects={objects}
            onChange={(patch) =>
              onPatch(obj.oid, patch as Record<string, AttrValue>)
            }
            onCommand={onCommand}
            disabled={disabled}
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
};
