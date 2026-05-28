import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Base-Layout für Property-Editor-Dialoge ("ChildDialog" im C++-OViewer-
 * Vokabular). Wrapped Header / Body / Footer; konkrete Viewer komponieren
 * darin ihre OCtrls.
 *
 * Modal vs. embedded ist Wahl des Parents — `ChildDialog` selbst ist nur
 * Layout, kein `<Dialog>`-Wrapper. Plan 08 nutzt das für die konkreten
 * Viewer (PSimulatorViewer etc.).
 */
export interface ChildDialogProps {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ChildDialog({
  title,
  description,
  footer,
  children,
  className,
}: ChildDialogProps) {
  return (
    <div
      data-slot="child-dialog"
      className={cn("flex h-full flex-col gap-4 p-4", className)}
    >
      <header className="space-y-1">
        <h3 className="text-lg font-semibold leading-none tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="flex-1 overflow-auto">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t pt-3">{footer}</div>
      )}
    </div>
  );
}
