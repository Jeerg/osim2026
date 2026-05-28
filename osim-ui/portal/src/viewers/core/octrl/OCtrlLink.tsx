import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import type { OBaseObj, OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlLink — Editor für Objekt-Referenzen (z.B. Durchlaufplan → Knoten →
 * Betriebsmittel-Verknüpfung). C++-Pendant: `OCtrlOprChoice` +
 * `OCtrlOprChild`.
 *
 * Filtert `allObjects` nach `schema.link_target_klass` und stellt die
 * Treffer als Combobox-Optionen bereit. Labels werden aus `attrs.m_sName`
 * gelesen, mit Fallback auf `"<klass> (#oid)"`.
 *
 * Optionaler "Öffnen"-Button neben der Combobox: dispatcht den `oid` an
 * `onOpenSubViewer` (vom Parent verdrahtet, typischerweise → ClientCtrl.
 * setObject in Plan 07/08).
 */
export interface OCtrlLinkProps extends OCtrlBaseProps<number> {
  allObjects: Record<number, OBaseObj>;
  onOpenSubViewer?: (oid: number) => void;
  className?: string;
}

function labelOf(obj: OBaseObj): string {
  const name = obj.attrs["m_sName"];
  if (typeof name === "string" && name.length > 0) return name;
  return `${obj.klass} (#${obj.oid})`;
}

export const OCtrlLink: React.FC<OCtrlLinkProps> = ({
  value,
  onChange,
  schema,
  allObjects,
  onOpenSubViewer,
  disabled,
  className,
  ...rest
}) => {
  const id = `octrl-${schema.name}`;
  const isReadonly = disabled || schema.readonly === true;

  const options = React.useMemo(() => {
    const target = schema.link_target_klass;
    if (!target) return [];
    return Object.values(allObjects)
      .filter((o) => o.klass === target)
      .map((o) => ({ value: o.oid.toString(), label: labelOf(o) }));
  }, [allObjects, schema.link_target_klass]);

  return (
    <label
      htmlFor={id}
      className={cn("grid gap-1 text-sm", className)}
      data-slot="octrl-link"
    >
      <span className="text-muted-foreground">{schema.label_de}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Combobox
            id={id}
            value={value !== null && value !== undefined ? value.toString() : ""}
            onChange={(s) => onChange(s === "" ? null : parseInt(s, 10))}
            options={options}
            placeholder="Objekt wählen"
            emptyText="Keine passenden Objekte."
            disabled={isReadonly}
            data-octrl-id={rest["data-octrl-id"] ?? schema.name}
          />
        </div>
        {value !== null && value !== undefined && onOpenSubViewer && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenSubViewer(value)}
            disabled={disabled}
          >
            Öffnen
          </Button>
        )}
      </div>
    </label>
  );
};
