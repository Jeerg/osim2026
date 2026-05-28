/**
 * useInlineCellEdit — Foundation-Hook für Inline-Cell-Editing (Welle 1.2-B).
 *
 * Pendant zu den Hook-Patterns in `portal/src/hooks/useAutoSave.ts`. Liefert
 * eine kleine State-Machine für den Excel-Style-Edit-Modus (Doppelklick →
 * Input → Enter/ESC) plus ein vorbereitetes `EditorElement`, das vom
 * Konsumenten an der Stelle gerendert wird, wo sonst der Read-Only-Wert
 * stünde. Drei Editor-Typen werden bedient — `Variable`, `Enum`, `Bool` —
 * exakt wie im aktuellen `matrix-common.tsx::renderEditCell` Z.126-205, aus
 * dem die Logik gelift wird.
 *
 * Architektur (CONTEXT D-4):
 *   - Hook ist foundation-agnostisch: kennt keine Wire-Klasse, kein
 *     PropertySchema, keinen Lock-Status. Konsument liefert `octrlType` +
 *     `valueType` + `enumValues` als Props.
 *   - `parseRaw` ist eine PURE Function — direkt testbar ohne Mount.
 *   - `EditorElement` ist `null`, solange `editing=false`. Der Konsument
 *     entscheidet, ob er das Element rendert oder den Read-Only-Wert
 *     stehen lässt.
 *   - `readOnly=true` blockiert `startEdit` (no-op) — Disable-Disziplin im
 *     Konsumenten muss damit nur eine einzige Stelle steuern.
 *
 * Pattern-Lift aus `portal/src/viewers/PRess/matrix-common.tsx`:
 *   - Parser-Regeln Z.174-186 (1:1 in `parseRaw`).
 *   - Editor-Renderer Z.132-204 (1:1 in `buildEditor`).
 *
 * 3FLS-EAM-Token-Disziplin (siehe `docs/3FLS-EAM-STYLE-GUIDE.md`):
 *   - Keine Hex-Strings — nur Tailwind-Aliase (border-input, bg-card,
 *     ring-primary, …).
 *   - 4 px-Grid (h-8 = 32 px, h-9 = 36 px, px-2 = 8 px).
 *
 * NICHT in diesem Hook:
 *   - Globale Tastatur-Listener (z.B. Pfeiltasten zur Cell-Navigation) — das
 *     gehört in Welle 1.2-C (`useBlockSelection`).
 *   - Wire-Validierung (PropertySchema-Check) — Konsument validiert vor
 *     `patchObject`. Foundation macht nur Type-Parse (T-01.2-07).
 *   - Persistenz, Optimistic-UI, Undo. Das ist Konsumenten-Domain.
 */

import * as React from "react";

import { Input } from "@/components/ui/input";

// ----------------------------- Types ----------------------------------

export type OctrlType = "Variable" | "Enum" | "Bool";
export type ValueType = "string" | "int" | "float";

export interface EnumOption {
  value: number;
  label_de: string;
}

export interface UseInlineCellEditOptions<TVal> {
  /** Eindeutige Cell-ID — Edit-Mode pro Cell, nicht global. Konsument-Vorrat. */
  cellId: string;
  /** Initial-Wert. */
  value: TVal | null;
  /** Wird bei Enter/Blur/Enum-Change/Bool-Change gefeuert. */
  onCommit: (newValue: TVal) => void;
  /** Optional — sonst no-op. Wird auch im ESC-Pfad gerufen. */
  onCancel?: () => void;
  /** Read-only-Modus aus Lock oder ViewerProps.disabled. Blockiert `startEdit`. */
  readOnly?: boolean;
  /** Editor-Typ. Bestimmt Parser + Input-Type (analog `octrl_type` in matrix-common). */
  octrlType: OctrlType;
  /** Pflicht für `octrlType === "Variable"`. Default `"string"`. */
  valueType?: ValueType;
  /** Pflicht für `octrlType === "Enum"`. */
  enumValues?: EnumOption[];
}

export interface UseInlineCellEditResult {
  /** True, wenn der Hook im Edit-Mode ist. */
  editing: boolean;
  /** Schaltet in den Edit-Mode (no-op bei `readOnly=true`). */
  startEdit: () => void;
  /** Schließt den Edit-Mode und meldet den geparsten Wert via `onCommit`. */
  commit: (raw: string | number | boolean) => void;
  /** Schließt den Edit-Mode ohne Commit. */
  cancel: () => void;
  /** Editor-React-Element — null, wenn `editing=false`. */
  EditorElement: React.ReactElement | null;
}

// ------------------------ Pure Parser-Function ------------------------

/**
 * 1:1-Lift aus `matrix-common.tsx::renderEditCell` Z.174-186.
 *
 * Regeln:
 *   - `Enum` → `Number(raw)` (Select-Wert kommt als String, muss zu Zahl)
 *   - `Bool` → `Boolean(raw)` (Checkbox-Wert kommt als boolean, idempotent)
 *   - `Variable + int`: "" oder null → 0; sonst parseInt, NaN → 0
 *   - `Variable + float`: "" oder null → 0; sonst parseFloat, NaN → 0
 *   - `Variable + string` (default): raw unverändert
 *
 * Begründung der 0-Fallbacks: OSim-Numerikfelder (Bearbeitungszeit,
 * Wiederholungen, Wahrscheinlichkeiten) tolerieren keine null/NaN — der
 * Engine-Schritt würde abstürzen. Ein konservativer 0-Fallback ist immer
 * sicher (T-01.2-07).
 */
export function parseRaw(
  raw: unknown,
  octrlType: OctrlType,
  valueType?: ValueType,
): unknown {
  if (octrlType === "Enum") return Number(raw);
  if (octrlType === "Bool") return Boolean(raw);
  // Variable
  const vt = valueType ?? "string";
  if (vt === "int") {
    if (raw === "" || raw == null) return 0;
    const p = parseInt(String(raw), 10);
    return Number.isNaN(p) ? 0 : p;
  }
  if (vt === "float") {
    if (raw === "" || raw == null) return 0;
    const p = parseFloat(String(raw));
    return Number.isNaN(p) ? 0 : p;
  }
  return raw;
}

// ------------------------ Editor-Element-Builder ----------------------

/**
 * Baut das passende Editor-Element für den aktuellen `octrlType`. Wird nur
 * im Edit-Mode aufgerufen (sonst liefert der Hook `null`).
 *
 * Lift aus `matrix-common.tsx::renderEditCell` Z.132-204 — Stil-Klassen
 * minimal an die Token-Architektur angepasst (`bg-card` statt `bg-transparent`,
 * `focus:ring-2 focus:ring-primary` auf dem Variable-Input für sichtbares
 * Edit-Feedback im 3FLS-Cyan).
 */
function buildEditor<TVal>(
  opts: UseInlineCellEditOptions<TVal>,
  commit: (raw: string | number | boolean) => void,
  cancel: () => void,
): React.ReactElement {
  if (opts.octrlType === "Enum" && opts.enumValues) {
    return (
      <select
        autoFocus
        defaultValue={opts.value == null ? "" : String(opts.value)}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => cancel()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
      >
        {opts.enumValues.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label_de}
          </option>
        ))}
      </select>
    );
  }

  if (opts.octrlType === "Bool") {
    return (
      <input
        type="checkbox"
        autoFocus
        defaultChecked={Boolean(opts.value)}
        onChange={(e) => commit(e.target.checked)}
        onBlur={() => cancel()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        className="h-4 w-4"
      />
    );
  }

  // octrlType === "Variable" (default + explizit)
  const valueType = opts.valueType ?? "string";
  const inputType = valueType === "string" ? "text" : "number";
  const step =
    valueType === "float" ? "any" : valueType === "int" ? "1" : undefined;

  return (
    <Input
      autoFocus
      type={inputType}
      step={step}
      defaultValue={opts.value == null ? "" : String(opts.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit((e.currentTarget as HTMLInputElement).value);
        } else if (e.key === "Escape") {
          cancel();
        }
      }}
      className="h-8 bg-card focus:ring-2 focus:ring-primary"
    />
  );
}

// ----------------------------- Hook -----------------------------------

/**
 * `useInlineCellEdit<TVal>(opts)` — State-Machine + Editor-Element.
 *
 * Verwendung im Konsumenten (skizziert für Welle 1.2-E
 * `PRessBelegMatrixViewer`):
 *
 * ```tsx
 * const { editing, startEdit, EditorElement } = useInlineCellEdit({
 *   cellId: `${oidRow}:${oidCol}`,
 *   value: cellValue,
 *   onCommit: (v) => patchObject(oid, { status: v }),
 *   onCancel: () => bumpRevision(),
 *   readOnly: viewerDisabled,
 *   octrlType: "Enum",
 *   enumValues: STATUS_ENUM,
 * });
 *
 * return (
 *   <MatrixCell ... editing={editing} onClick={startEdit}>
 *     {editing ? EditorElement : formatCell(value)}
 *   </MatrixCell>
 * );
 * ```
 *
 * Hook-Cleanup: keine globalen Listener (alle Event-Handler hängen am
 * gerenderten Element). Daher kein `useEffect`-return nötig — Render-Tree-
 * Unmount räumt automatisch auf.
 */
export function useInlineCellEdit<TVal>(
  opts: UseInlineCellEditOptions<TVal>,
): UseInlineCellEditResult {
  const [editing, setEditing] = React.useState(false);

  // Direkte Callback-Memoization auf die relevanten opts-Felder. Wir
  // verzichten bewusst auf eine optsRef-Indirektion (wie in `useAutoSave`),
  // weil dieser Hook kein langlebiges Resource hält (kein Interval, kein
  // Subscriber, kein WS). Ein neuer Closure pro `opts`-Update ist billig
  // und vermeidet das eslint `react-hooks/refs`-Pattern (Ref-Read im Body
  // einer in `useMemo` aufgerufenen Funktion).
  const { readOnly, onCancel, onCommit, octrlType, valueType } = opts;

  const startEdit = React.useCallback(() => {
    if (readOnly) return;
    setEditing(true);
  }, [readOnly]);

  const cancel = React.useCallback(() => {
    setEditing(false);
    onCancel?.();
  }, [onCancel]);

  const commit = React.useCallback(
    (raw: string | number | boolean) => {
      setEditing(false);
      onCommit(parseRaw(raw, octrlType, valueType) as TVal);
    },
    [onCommit, octrlType, valueType],
  );

  // EditorElement bauen, wenn `editing=true`. Der Editor hält seinen
  // eigenen Input-State via `defaultValue`/`defaultChecked` — `commit`
  // liest beim Enter/Blur-Event aus dem DOM, daher führt ein opts-Rebuild
  // nicht zu Datenverlust am unkontrollierten Input.
  const EditorElement = React.useMemo<React.ReactElement | null>(() => {
    if (!editing) return null;
    return buildEditor(opts, commit, cancel);
  }, [editing, opts, commit, cancel]);

  return { editing, startEdit, commit, cancel, EditorElement };
}
