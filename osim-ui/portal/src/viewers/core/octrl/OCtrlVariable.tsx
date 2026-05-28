import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlVariable — Editor für skalare Property-Werte (int, float, string).
 *
 * C++-Pendants: `OCtrlVariableEdit`, `OCtrlVariableInt`,
 * `OCtrlVariableDouble`. Der Wertetyp wird über `schema.value_type`
 * unterschieden:
 *
 *   - `"int"`   → `<input type="number" step="1">`, onChange parst als parseInt
 *   - `"float"` → `<input type="number" step="any">`, onChange parst als parseFloat
 *   - `"string"` / undefined → `<input type="text">`
 *
 * Bei leerer Eingabe + `schema.nullable === true` wird `onChange(null)`
 * gefeuert. Bei nicht-nullable + numerischem Schema wird `0` gefeuert (das
 * vermeidet NaN-Zustände in Engine-Property-Slots).
 */
export interface OCtrlVariableProps
  extends OCtrlBaseProps<string | number> {
  className?: string;
}

export const OCtrlVariable: React.FC<OCtrlVariableProps> = ({
  value,
  onChange,
  schema,
  disabled,
  className,
  ...rest
}) => {
  const id = `octrl-${schema.name}`;
  const isReadonly = disabled || schema.readonly === true;
  const valueType = schema.value_type ?? "string";

  const inputType = valueType === "string" ? "text" : "number";
  const step = valueType === "float" ? "any" : valueType === "int" ? "1" : undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (valueType === "int") {
      if (raw === "") {
        onChange(schema.nullable ? null : 0);
        return;
      }
      const parsed = parseInt(raw, 10);
      onChange(Number.isNaN(parsed) ? (schema.nullable ? null : 0) : parsed);
      return;
    }
    if (valueType === "float") {
      if (raw === "") {
        onChange(schema.nullable ? null : 0);
        return;
      }
      const parsed = parseFloat(raw);
      onChange(Number.isNaN(parsed) ? (schema.nullable ? null : 0) : parsed);
      return;
    }
    // string-default
    if (raw === "" && schema.nullable) {
      onChange(null);
      return;
    }
    onChange(raw);
  };

  return (
    <label
      htmlFor={id}
      className={cn("grid gap-1 text-sm", className)}
      data-slot="octrl-variable"
      data-octrl-id={rest["data-octrl-id"] ?? schema.name}
    >
      <span className="text-muted-foreground">{schema.label_de}</span>
      <Input
        id={id}
        type={inputType}
        step={step}
        value={value ?? ""}
        onChange={handleChange}
        disabled={isReadonly}
        data-octrl-id={rest["data-octrl-id"] ?? schema.name}
      />
    </label>
  );
};
