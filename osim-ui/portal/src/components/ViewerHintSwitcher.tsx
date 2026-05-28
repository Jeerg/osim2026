/**
 * ViewerHintSwitcher — Segment-Control für Viewer-Varianten (Std/Design/Matrix).
 *
 * Modernes Pillen-Design (background = surface, aktiver Pill = white + shadow).
 */

import * as React from "react";
import { ClockIcon, GridIcon, NetworkIcon, PencilLineIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ViewerHintSwitcherProps {
  availableHints: string[];
  currentHint: string | null;
  onHintChange: (hint: string) => void;
  className?: string;
}

const HINT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  std: { label: "Eigenschaften", icon: PencilLineIcon },
  design: { label: "Graph-Editor", icon: NetworkIcon },
  matrix: { label: "Matrix", icon: GridIcon },
  einsatzzeit: { label: "Arbeitszeiten", icon: ClockIcon },
};

export const ViewerHintSwitcher: React.FC<ViewerHintSwitcherProps> = ({
  availableHints,
  currentHint,
  onHintChange,
  className,
}) => {
  if (availableHints.length <= 1) return null;

  const activeHint = currentHint ?? availableHints[0];

  return (
    <div
      data-testid="viewer-hint-switcher"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-surface-100 p-0.5",
        className,
      )}
    >
      {availableHints.map((hint) => {
        const meta = HINT_META[hint] ?? {
          label: hint,
          icon: PencilLineIcon,
        };
        const Icon = meta.icon;
        const isActive = hint === activeHint;
        return (
          <button
            key={hint}
            type="button"
            onClick={() => onHintChange(hint)}
            data-testid={`viewer-hint-${hint}`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all",
              isActive
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                : "text-surface-600 hover:text-surface-900",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
};
