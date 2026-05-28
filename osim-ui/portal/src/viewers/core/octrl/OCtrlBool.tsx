import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlBool — Editor für Boolean-Properties. Wrap um Radix-Checkbox.
 *
 * Phase 1: zwei-Zustand (true/false). Tri-State (true/false/null) für
 * nullable-Schemas in einer späteren Phase — Radix-Checkbox kennt den
 * `"indeterminate"`-State, die Wire-Format-Frage (`null` als Default-Hint
 * statt aktiver Tri-State?) ist aber für OSim-Modelle noch nicht
 * abschließend geklärt.
 *
 * Verbindet das `<label>` per Wrapping mit der Checkbox — Radix bindet den
 * `<label>`-Klick automatisch an die richtige Trigger-Aktion.
 */
export interface OCtrlBoolProps extends OCtrlBaseProps<boolean> {
  className?: string;
}

export const OCtrlBool: React.FC<OCtrlBoolProps> = ({
  value,
  onChange,
  schema,
  disabled,
  className,
  ...rest
}) => {
  const id = `octrl-${schema.name}`;
  const isReadonly = disabled || schema.readonly === true;

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2 text-sm",
        isReadonly && "opacity-60",
        className,
      )}
      data-slot="octrl-bool"
    >
      <Checkbox
        id={id}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked === true)}
        disabled={isReadonly}
        data-octrl-id={rest["data-octrl-id"] ?? schema.name}
      />
      <span>{schema.label_de}</span>
    </label>
  );
};
