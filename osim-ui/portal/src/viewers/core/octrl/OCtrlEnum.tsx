import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlEnum — Editor für Enum-Properties. Phase 1: nur Dropdown.
 *
 * C++-Pendant: `OCtrlEnumGroup` (RadioGroup) + `OCtrlEnumChoice` (Dropdown).
 * In OSim2004 wurde nach Anzahl der Enum-Werte unterschieden — Phase 1
 * vereinfacht auf Dropdown immer. Eine Radio-Variante kann später über ein
 * Display-Hint im Schema aktiviert werden.
 *
 * Der Wert ist Engine-seitig immer int (siehe `osim_engine.io.otx_reader`-
 * Konventionen). Der Select-Primitive arbeitet auf strings, daher Konversion
 * an den Schnittstellen.
 */
export interface OCtrlEnumProps extends OCtrlBaseProps<number> {
  className?: string;
}

export const OCtrlEnum: React.FC<OCtrlEnumProps> = ({
  value,
  onChange,
  schema,
  disabled,
  className,
  ...rest
}) => {
  const id = `octrl-${schema.name}`;
  const isReadonly = disabled || schema.readonly === true;
  const enumValues = schema.enum_values;

  if (!enumValues || enumValues.length === 0) {
    // Defensive: Schema-Fehler im Backend. Wir warnen statt zu crashen, damit
    // der Rest des Property-Editors weiterhin rendert. KEIN SelectTrigger ohne
    // <Select>-Root (Radix wirft sonst Invariant-Errors), sondern ein
    // disabled-Button-Fallback.
    console.warn(
      `[OCtrlEnum] Schema "${schema.name}" hat keine enum_values gesetzt.`,
    );
    return (
      <label
        htmlFor={id}
        className={cn("grid gap-1 text-sm", className)}
        data-slot="octrl-enum"
      >
        <span className="text-muted-foreground">{schema.label_de}</span>
        <button
          id={id}
          type="button"
          disabled
          data-octrl-id={rest["data-octrl-id"] ?? schema.name}
          className="flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground"
        >
          Schema-Fehler: enum_values fehlen
        </button>
      </label>
    );
  }

  return (
    <label
      htmlFor={id}
      className={cn("grid gap-1 text-sm", className)}
      data-slot="octrl-enum"
    >
      <span className="text-muted-foreground">{schema.label_de}</span>
      <Select
        value={value !== null && value !== undefined ? value.toString() : ""}
        onValueChange={(s) => onChange(s === "" ? null : parseInt(s, 10))}
        disabled={isReadonly}
      >
        <SelectTrigger
          id={id}
          data-octrl-id={rest["data-octrl-id"] ?? schema.name}
        >
          <SelectValue placeholder="Bitte wählen" />
        </SelectTrigger>
        <SelectContent>
          {enumValues.map((ev) => (
            <SelectItem key={ev.value} value={ev.value.toString()}>
              {ev.label_de}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
};
