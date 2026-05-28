import * as React from "react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { OCtrlBaseProps } from "@/viewers/core/types";

/**
 * OCtrlColorRef — Color-Picker für Farb-Properties.
 *
 * C++-Pendant: `OCtrlCOLORREF`. Im Original ist COLORREF ein 32-Bit-DWORD im
 * `0x00BBGGRR`-Layout (BGR + ignoriertes Alpha-Byte). Phase 1 nutzt
 * vereinfacht RGB ohne Endian-Swap — die Modell-Farben sind reine
 * UI-Hinweise (Knoten-Färbung im Design-View), nicht Vorgaben für die
 * Engine. Bei Live-Visualisierung in Phase 4 müssen wir den BGR-Swap
 * nachziehen.
 *
 * TODO Phase 4: COLORREF-Endian-Konsistenz mit Engine prüfen, ggf.
 * `bgrToHex` / `hexToBgr` einschieben. Aktuell: 0xRRGGBB.
 *
 * Lib: `react-colorful` (4 KB, MIT) — shadcn hat kein dediziertes Color-
 * Picker-Primitive.
 */
function numToHex(n: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(n)));
  return "#" + clamped.toString(16).padStart(6, "0");
}

function hexToNum(hex: string): number {
  const cleaned = hex.startsWith("#") ? hex.slice(1) : hex;
  const parsed = parseInt(cleaned, 16);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface OCtrlColorRefProps extends OCtrlBaseProps<number> {
  className?: string;
}

export const OCtrlColorRef: React.FC<OCtrlColorRefProps> = ({
  value,
  onChange,
  schema,
  disabled,
  className,
  ...rest
}) => {
  const [open, setOpen] = React.useState(false);
  const isReadonly = disabled || schema.readonly === true;
  const hex = numToHex(value ?? 0);

  return (
    <label
      className={cn("grid gap-1 text-sm", className)}
      data-slot="octrl-colorref"
    >
      <span className="text-muted-foreground">{schema.label_de}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={schema.label_de}
            data-octrl-id={rest["data-octrl-id"] ?? schema.name}
            disabled={isReadonly}
            className="gap-2"
          >
            <span
              aria-hidden
              className="inline-block h-4 w-4 rounded border"
              style={{ backgroundColor: hex }}
            />
            <span className="font-mono">{hex.toUpperCase()}</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{schema.label_de} wählen</DialogTitle>
            <DialogDescription>
              Wähle eine Farbe aus dem Picker. Änderungen werden sofort
              übernommen — schließe den Dialog, wenn du fertig bist.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <HexColorPicker
              color={hex}
              onChange={(newHex) => onChange(hexToNum(newHex))}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </label>
  );
};
