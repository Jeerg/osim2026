import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OBaseObj, OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlList — Editor für Sub-Objekt-Listen (z.B. `PDurchlaufplan.m_lstKnoten`).
 * C++-Pendant: `OCtrlLListListBox` + `OCtrlLListTable`.
 *
 * Rendert eine Tabelle mit Spalten {OID, Klasse, Name} pro referenzierter
 * `oid` in `value`. Toolbar mit "Hinzufügen" + "Entfernen":
 *
 *   - "Hinzufügen" ruft `onCreate(list_item_klass)`. Der Parent (Plan 07)
 *     erstellt das Objekt im ModelStore und feuert anschließend
 *     `onChange([...value, newOid])` für die Liste.
 *   - "Entfernen" entfernt die ausgewählte Row und ruft `onChange(filtered)`.
 *
 * Phase 1: keine Virtualisierung (siehe threat T-06-04 — Modell-realistische
 * Listen sind <500 Items). Virtualisierung via @tanstack/react-virtual ist
 * Phase-4-Backlog.
 */
export interface OCtrlListProps extends OCtrlBaseProps<number[]> {
  allObjects: Record<number, OBaseObj>;
  onCreate?: (klass: string) => void;
  onOpenSubViewer?: (oid: number) => void;
  className?: string;
}

function nameOf(obj: OBaseObj | undefined): string {
  if (!obj) return "—";
  const n = obj.attrs["m_sName"];
  return typeof n === "string" && n.length > 0 ? n : `#${obj.oid}`;
}

export const OCtrlList: React.FC<OCtrlListProps> = ({
  value,
  onChange,
  schema,
  allObjects,
  onCreate,
  onOpenSubViewer,
  disabled,
  className,
  ...rest
}) => {
  // Defensiv: Engine speichert m_l*-Attribute als OID-Pointer auf den LList-
  // Head (Integer), nicht als oid-Array. Bis das Backend in Phase 2 die
  // LList-Auflösung übernimmt, fallen Nicht-Array-Werte hier auf [] zurück
  // statt einen .map-Crash zu werfen. Tracked als Phase-2-Backlog "LList-zu-
  // Array-Konvertierung im Wire-Format".
  const list: number[] = Array.isArray(value) ? value : [];
  const isReadonly = disabled || schema.readonly === true;
  const [selectedOid, setSelectedOid] = React.useState<number | null>(null);
  const targetKlass = schema.list_item_klass ?? "";

  const handleAdd = () => {
    if (!onCreate) {
      console.warn(
        `[OCtrlList] Schema "${schema.name}" hat keinen onCreate-Handler. ` +
          `Der Parent muss das Objekt erstellen und die neue oid an onChange anhaengen.`,
      );
      return;
    }
    onCreate(targetKlass);
  };

  const handleRemove = () => {
    if (selectedOid === null) return;
    onChange(list.filter((o) => o !== selectedOid));
    setSelectedOid(null);
  };

  return (
    <div
      data-slot="octrl-list"
      data-octrl-id={rest["data-octrl-id"] ?? schema.name}
      className={cn("space-y-2", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{schema.label_de}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={handleAdd}
            disabled={isReadonly}
          >
            Hinzufügen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRemove}
            disabled={isReadonly || selectedOid === null}
          >
            Entfernen
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>OID</TableHead>
            <TableHead>Klasse</TableHead>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((oid) => {
            const obj = allObjects[oid];
            const isSelected = selectedOid === oid;
            return (
              <TableRow
                key={oid}
                data-state={isSelected ? "selected" : undefined}
                onClick={() => {
                  setSelectedOid(oid);
                  if (onOpenSubViewer) onOpenSubViewer(oid);
                }}
                className="cursor-pointer"
              >
                <TableCell>{oid}</TableCell>
                <TableCell>{obj?.klass ?? "—"}</TableCell>
                <TableCell>{nameOf(obj)}</TableCell>
              </TableRow>
            );
          })}
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                Liste ist leer.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
