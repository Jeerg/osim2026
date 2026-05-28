import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
 * OCtrlLogFont — Font-Picker (Eigenbau, kein dediziertes Primitive).
 *
 * C++-Pendant: `OCtrlLOGFONT`. Das Win32-LOGFONT-Struct hat ~14 Felder
 * (Höhe, Breite, Escapement, Orientation, Weight, Italic, Underline,
 * Strikeout, CharSet, OutPrecision, ClipPrecision, Quality, PitchAndFamily,
 * FaceName). Phase-1-Subset: Family + Size + Bold + Italic — das deckt die
 * Display-relevanten Felder ab; die Win-spezifischen Charset/Quality-Fields
 * machen im Browser keinen Sinn.
 */
const FONT_FAMILIES = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
];

const DEFAULT_FONT: LogFontValue = {
  family: "Arial",
  size: 10,
  bold: false,
  italic: false,
};

export interface LogFontValue {
  family: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
}

export interface OCtrlLogFontProps extends OCtrlBaseProps<LogFontValue> {
  className?: string;
}

export const OCtrlLogFont: React.FC<OCtrlLogFontProps> = ({
  value,
  onChange,
  schema,
  disabled,
  className,
  ...rest
}) => {
  const isReadonly = disabled || schema.readonly === true;
  const current = value ?? DEFAULT_FONT;
  const sizeId = `octrl-${schema.name}-size`;
  const familyId = `octrl-${schema.name}-family`;
  const boldId = `octrl-${schema.name}-bold`;
  const italicId = `octrl-${schema.name}-italic`;

  const patch = (delta: Partial<LogFontValue>) => {
    onChange({ ...current, ...delta });
  };

  return (
    <div
      data-slot="octrl-logfont"
      data-octrl-id={rest["data-octrl-id"] ?? schema.name}
      className={cn("grid gap-3", className)}
    >
      <div className="text-sm font-medium">{schema.label_de}</div>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={familyId} className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Schriftart</span>
          <Select
            value={current.family}
            onValueChange={(f) => patch({ family: f })}
            disabled={isReadonly}
          >
            <SelectTrigger id={familyId}>
              <SelectValue placeholder="Schriftart wählen" />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label htmlFor={sizeId} className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Größe</span>
          <Input
            id={sizeId}
            type="number"
            min={6}
            max={72}
            step="1"
            value={current.size}
            disabled={isReadonly}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                patch({ size: DEFAULT_FONT.size });
                return;
              }
              const parsed = parseInt(raw, 10);
              patch({ size: Number.isNaN(parsed) ? DEFAULT_FONT.size : parsed });
            }}
          />
        </label>
      </div>
      <div className="flex gap-4">
        <label htmlFor={boldId} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={boldId}
            checked={current.bold === true}
            onCheckedChange={(c) => patch({ bold: c === true })}
            disabled={isReadonly}
          />
          <span>Fett</span>
        </label>
        <label htmlFor={italicId} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={italicId}
            checked={current.italic === true}
            onCheckedChange={(c) => patch({ italic: c === true })}
            disabled={isReadonly}
          />
          <span>Kursiv</span>
        </label>
      </div>
    </div>
  );
};
