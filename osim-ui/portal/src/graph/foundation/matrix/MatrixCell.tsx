/**
 * MatrixCell — memoized Wrapper-Component pro Zelle in der Matrix-Foundation.
 *
 * Welle 1.2-A. Pendant zu `OsimNode` für die Graph-Foundation: ein dünner
 * Renderer-Wrapper mit Selection/Editing/Disabled-State-Markern und 3FLS-EAM-
 * Token-konformer Optik. Konsumenten reichen `children` rein (z.B. Status-
 * Symbol, Text, oder Edit-Input via `useInlineCellEdit` in Welle 1.2-B).
 *
 * Architektur-Entscheidungen:
 *   - `React.memo` ist Pflicht (1:1 `OsimNode.tsx` Z.135): in großen Matrizen
 *     re-rendert React den ganzen Body-Loop, ohne memo wäre das ein
 *     Performance-Tod bei den 30k-Knoten von Bosch.
 *   - KEIN Wire-Knowledge — MatrixCell ist generisch, kennt weder PAssozBeleg
 *     noch PDpKn (CONTEXT D-1). Nur `cellId` (= `${rowKey}:${colKey}`) und
 *     optional `oid` als data-Attribut für E2E.
 *   - KEIN onChange-Hook — Inline-Edit kommt erst in Welle 1.2-B via
 *     `useInlineCellEdit`. Diese Welle liefert nur den Visual-State.
 *
 * 3FLS-EAM-Token-Disziplin (siehe `docs/3FLS-EAM-STYLE-GUIDE.md`):
 *   - Selected: `border-primary` + `bg-[var(--color-surface-soft-cyan)]`.
 *   - Editing: `ring-2 ring-primary ring-offset-0`.
 *   - Hover (nur wenn klickbar): `hover:bg-accent`.
 *   - Keine ad-hoc Hex-Strings.
 *
 * data-Attribute für E2E + Diagnostik:
 *   - `data-testid="matrix-cell"`
 *   - `data-oid={oid}` (nur wenn gesetzt — Wire-OID des Cell-Wertes)
 *   - `data-matrix-cell-selected="true"` (nur wenn selected)
 *   - `data-matrix-cell-editing="true"` (nur wenn editing)
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface MatrixCellProps {
  /** Eindeutige Cell-ID — typischerweise `${rowKey}:${colKey}`. */
  cellId: string;
  /** Wire-OID des Cell-Werts (optional, nur wenn vorhanden). */
  oid?: number;
  /** Selected-State (von Block-Selection in Welle 1.2-C kontrolliert). */
  selected?: boolean;
  /** Edit-Mode aktiv (von useInlineCellEdit in Welle 1.2-B kontrolliert). */
  editing?: boolean;
  /** Read-only — Click-Handler werden nicht aufgerufen, Cursor nicht-pointer. */
  disabled?: boolean;
  /** Click-Handler. Wird bei `disabled=true` ignoriert. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Pointer-Down-Handler (für Block-Select Drag-Start in Welle 1.2-C). */
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Zusätzliches className (vom Konsument durchgereicht). */
  className?: string;
  /** Cell-Content (Status-Symbol, Edit-Input, etc.). */
  children?: React.ReactNode;
}

const MatrixCellImpl: React.FC<MatrixCellProps> = ({
  cellId,
  oid,
  selected,
  editing,
  disabled,
  onClick,
  onPointerDown,
  className,
  children,
}) => {
  const clickable = !disabled && Boolean(onClick);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      onClick?.(e);
    },
    [disabled, onClick],
  );

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      onPointerDown?.(e);
    },
    [disabled, onPointerDown],
  );

  return (
    <div
      data-testid="matrix-cell"
      data-cell-id={cellId}
      data-oid={oid}
      data-matrix-cell-selected={selected ? "true" : undefined}
      data-matrix-cell-editing={editing ? "true" : undefined}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      className={cn(
        "flex h-full w-full items-center justify-center px-2 py-1 text-xs",
        "border border-transparent transition-colors",
        clickable && "cursor-pointer hover:bg-accent",
        selected && "border-primary bg-[var(--color-surface-soft-cyan)]",
        editing && "ring-2 ring-primary ring-offset-0",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {children}
    </div>
  );
};

MatrixCellImpl.displayName = "MatrixCell";

/**
 * `React.memo`-Wrap (1:1 OsimNode Z.135) — Pflicht für große Matrizen. Der
 * Konsument muss stabile Referenzen für `onClick`/`onPointerDown` liefern
 * (typischerweise via `useCallback`), sonst rendert jeder Parent-Render
 * trotzdem alle Cells neu.
 */
export const MatrixCell = React.memo(MatrixCellImpl);
