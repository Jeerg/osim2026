// Plan 01-04 Task 3: OCtrlLOGFONT — Font-Picker.
//
// Portierung von OCtrlLOGFONT.h (C++): LOGFONT-Struct mit
// family/size/bold/italic. Phase 1: compound input (Select + Number +
// 2 Checkboxes). Andere LOGFONT-Felder (charset, weight numerisch,
// underline, strikeout) erstmal weggelassen — Plan 09 kann erweitern.

import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export interface LogFontValue {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
}

const SYSTEM_FONTS = [
  "Arial",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Calibri",
];

const DEFAULT_FONT: LogFontValue = {
  family: "Arial",
  size: 10,
  bold: false,
  italic: false,
};

function normalizeFont(value: unknown): LogFontValue {
  if (!value || typeof value !== "object") return DEFAULT_FONT;
  const v = value as Record<string, unknown>;
  return {
    family: typeof v.family === "string" ? v.family : DEFAULT_FONT.family,
    size: typeof v.size === "number" ? v.size : DEFAULT_FONT.size,
    bold: typeof v.bold === "boolean" ? v.bold : DEFAULT_FONT.bold,
    italic: typeof v.italic === "boolean" ? v.italic : DEFAULT_FONT.italic,
  };
}

export function OCtrlLOGFONT({ property, label, readonly }: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<LogFontValue | null>(
    property,
  );
  const font = normalizeFont(value);

  const patch = (delta: Partial<LogFontValue>) => {
    setValue({ ...font, ...delta });
  };

  return (
    <fieldset
      className="space-y-2 text-sm"
      data-testid={`octrl-logfont-${property}`}
    >
      {(label ?? metadata.label) && (
        <legend className="font-medium text-gray-700">
          {label ?? metadata.label}
        </legend>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Schrift</span>
          <select
            value={font.family}
            disabled={readonly}
            onChange={(e) => patch({ family: e.target.value })}
            className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
          >
            {SYSTEM_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Groesse</span>
          <input
            type="number"
            min={4}
            max={72}
            value={font.size}
            disabled={readonly}
            onChange={(e) => patch({ size: Number(e.target.value) })}
            className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </label>
      </div>
      <div className="flex gap-4">
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={font.bold}
            disabled={readonly}
            onChange={(e) => patch({ bold: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500"
          />
          <span>Fett</span>
        </label>
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={font.italic}
            disabled={readonly}
            onChange={(e) => patch({ italic: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500"
          />
          <span>Kursiv</span>
        </label>
      </div>
      <div
        className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600"
        style={{
          fontFamily: font.family,
          fontSize: font.size,
          fontWeight: font.bold ? "bold" : "normal",
          fontStyle: font.italic ? "italic" : "normal",
        }}
      >
        Beispieltext
      </div>
    </fieldset>
  );
}
