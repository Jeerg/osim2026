// Plan 01-04 Task 3: OCtrlCOLORREF — Color-Picker.
//
// Portierung von OCtrlCOLORREF.h (C++). Das C++-COLORREF-Format ist
// 0x00BBGGRR (kleines Endian, RGB-vertauscht); im Web speichern wir
// hex-Strings "#RRGGBB". Konvertierungs-Helper unten — bei Phase-1-
// Use-Case (intra-osim-ui-Edit) ist der hex-String die Quelle der
// Wahrheit; nur bei OTX-Roundtrip wird die Engine-Seite die Konvertierung
// machen muessen (Plan 09 / Engine-Writer).

import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export function OCtrlCOLORREF({ property, label, readonly }: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<string | null>(property);

  // Default: #000000 wenn null/leer/ungueltig.
  const hex =
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : "#000000";

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label ?? metadata.label ?? property}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => setValue(e.target.value)}
          disabled={readonly}
          data-testid={`octrl-colorref-${property}`}
          className="h-8 w-12 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed"
        />
        <code className="text-xs text-gray-600">{hex}</code>
      </div>
    </label>
  );
}

/** Helper: C++-COLORREF (0x00BBGGRR) -> hex-String "#RRGGBB". */
export function colorrefToHex(colorref: number): string {
  const r = colorref & 0xff;
  const g = (colorref >> 8) & 0xff;
  const b = (colorref >> 16) & 0xff;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Helper: hex-String "#RRGGBB" -> C++-COLORREF (0x00BBGGRR). */
export function hexToColorref(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (b << 16) | (g << 8) | r;
}
