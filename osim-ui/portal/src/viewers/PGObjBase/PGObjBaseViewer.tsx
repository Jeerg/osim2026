/**
 * PGObjBaseViewer — Generischer Property-Editor.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/PGObjBaseViewer.h` — der "Catch-All"-Viewer
 * der jedes Modell-Objekt rendern kann, solange ein PropertySchema vorhanden
 * ist. Wird in der ViewerRegistry als `setFallback` registriert, damit unbe-
 * kannte Klassen NICHT in den EmptyState fallen, sondern wenigstens ihre
 * Properties zeigen.
 *
 * Gleichzeitig ist diese Komponente die **Basis-Komponente** für alle
 * spezialisierten Viewer (PSimulatorViewer, PDurchlaufplanViewerStd, …): diese
 * wrappen PGObjBaseViewer mit zusätzlichen Sektionen (Sub-Listen, Footer-
 * Buttons, Tabs).
 *
 * Mapping property.octrl_type → OCtrl-Component (alle 9 OCtrls aus Plan 06):
 *   "Variable" → OCtrlVariable
 *   "Bool"     → OCtrlBool
 *   "Enum"     → OCtrlEnum
 *   "Link"     → OCtrlLink   (mit allObjects-Prop)
 *   "List"     → OCtrlList   (mit allObjects-Prop)
 *   "Method"   → OCtrlMethod (Click feuert onCommand({type:"method",…}))
 *   "COLORREF" → OCtrlColorRef
 *   "LOGFONT"  → OCtrlLogFont
 *   "TabViewer" → übersprungen (Tab-Container ist Layout-Element, nicht
 *                Property — wird von spezialisierten Viewern selbst gerendert)
 */

import { ChildDialog } from "@/viewers/core/ChildDialog";
import {
  OCtrlBool,
  OCtrlColorRef,
  OCtrlEnum,
  OCtrlLink,
  OCtrlList,
  OCtrlLogFont,
  OCtrlMethod,
  OCtrlVariable,
  type LogFontValue,
} from "@/viewers/core/octrl";
import type {
  AttrValue,
  OBaseObj,
  PropertyMeta,
  ViewerCommand,
  ViewerProps,
} from "@/viewers/core/types";

/**
 * Internes Helper-Interface für renderOCtrl.
 */
interface RenderCtx {
  obj: OBaseObj;
  allObjects: Record<number, OBaseObj>;
  onChange: (patch: Record<string, AttrValue>) => void;
  onCommand: (cmd: ViewerCommand) => void;
  disabled?: boolean;
}

/**
 * Rendert das passende OCtrl für eine einzelne Property-Definition.
 * Returnt null für unbekannte/übersprungene octrl_types.
 */
function renderOCtrl(prop: PropertyMeta, ctx: RenderCtx) {
  const { obj, allObjects, onChange, onCommand, disabled } = ctx;
  const value = obj.attrs[prop.name];
  const setValue = (v: AttrValue) => onChange({ [prop.name]: v });

  switch (prop.octrl_type) {
    case "Variable":
      return (
        <OCtrlVariable
          value={value as string | number | null}
          onChange={(v) => setValue(v as AttrValue)}
          schema={prop}
          disabled={disabled}
        />
      );

    case "Bool":
      return (
        <OCtrlBool
          value={value as boolean | null}
          onChange={(v) => setValue(v as AttrValue)}
          schema={prop}
          disabled={disabled}
        />
      );

    case "Enum":
      return (
        <OCtrlEnum
          value={value as number | null}
          onChange={(v) => setValue(v as AttrValue)}
          schema={prop}
          disabled={disabled}
        />
      );

    case "Link":
      return (
        <OCtrlLink
          value={value as number | null}
          onChange={(v) => setValue(v as AttrValue)}
          schema={prop}
          allObjects={allObjects}
          onOpenSubViewer={(oid) =>
            onCommand({ type: "open-sub-viewer", oid })
          }
          disabled={disabled}
        />
      );

    case "List":
      return (
        <OCtrlList
          // value kann aus der Engine als Integer (LList-Head-OID) kommen, nicht
          // als Array. OCtrlList ist defensiv gegen non-arrays — siehe dort.
          value={Array.isArray(value) ? (value as number[]) : []}
          onChange={(v) => setValue((v ?? []) as AttrValue)}
          schema={prop}
          allObjects={allObjects}
          onCreate={(klass) =>
            onCommand({ type: "create", objKlass: klass })
          }
          onOpenSubViewer={(oid) =>
            onCommand({ type: "open-sub-viewer", oid })
          }
          disabled={disabled}
        />
      );

    case "Method":
      return (
        <OCtrlMethod
          schema={prop}
          onClick={() =>
            onCommand({ type: "method", name: prop.name, oid: obj.oid })
          }
          disabled={disabled}
        />
      );

    case "COLORREF":
      return (
        <OCtrlColorRef
          value={value as number | null}
          onChange={(v) => setValue(v as AttrValue)}
          schema={prop}
          disabled={disabled}
        />
      );

    case "LOGFONT":
      return (
        <OCtrlLogFont
          value={value as LogFontValue | null}
          onChange={(v) =>
            // LogFontValue wird im Wire-Format als JSON-String oder als
            // strukturiertes Dict abgelegt. Phase 1 speichert es als Stringi-
            // fied-JSON, damit AttrValue (primitiv) eingehalten wird.
            setValue(v === null ? null : (JSON.stringify(v) as AttrValue))
          }
          schema={prop}
          disabled={disabled}
        />
      );

    case "TabViewer":
      // TabViewer ist ein Layout-Element, kein Property-Editor. Wird von
      // spezialisierten Viewern selbst gerendert.
      return null;

    default:
      return null;
  }
}

/**
 * Resolved den Anzeige-Namen eines Objekts. Bevorzugt `m_sName`, fällt
 * sonst auf `m_name`, zuletzt auf `oid {N}`.
 */
function objectDisplayName(obj: OBaseObj): string {
  const n1 = obj.attrs["m_sName"];
  if (typeof n1 === "string" && n1.length > 0) return n1;
  const n2 = obj.attrs["m_name"];
  if (typeof n2 === "string" && n2.length > 0) return n2;
  return `oid ${obj.oid}`;
}

export function PGObjBaseViewer({
  obj,
  schema,
  allObjects,
  onChange,
  onCommand,
  disabled,
}: ViewerProps) {
  // Defensiv: Schema kann null sein (Klasse ohne Schema-Eintrag) oder leere
  // Properties haben. Beides → Fallback-Message statt Crash.
  if (!schema || !schema.properties || schema.properties.length === 0) {
    return (
      <ChildDialog
        title={`${obj.klass} (oid ${obj.oid})`}
        description="Kein PropertySchema verfügbar"
      >
        <p className="text-sm text-muted-foreground">
          Keine Properties verfügbar für Klasse <code>{obj.klass}</code>.
        </p>
      </ChildDialog>
    );
  }

  const ctx: RenderCtx = {
    obj,
    allObjects,
    onChange: onChange as (patch: Record<string, AttrValue>) => void,
    onCommand,
    disabled,
  };

  // Gruppiere Properties heuristisch: alles mit `m_l*` (LList-Referenz) →
  // "Beziehungen", alles mit `m_b*` (Boolean) → "Optionen", alles andere →
  // "Allgemein". Schemata können später eine explizite `group`-Annotation
  // bekommen; bis dahin gibt diese Heuristik eine saubere Default-Gruppierung.
  const groups: Record<string, typeof schema.properties> = {
    Allgemein: [],
    Optionen: [],
    Beziehungen: [],
  };
  for (const prop of schema.properties) {
    if (prop.octrl_type === "List" || prop.octrl_type === "Link") {
      groups.Beziehungen.push(prop);
    } else if (prop.octrl_type === "Bool") {
      groups.Optionen.push(prop);
    } else {
      groups.Allgemein.push(prop);
    }
  }

  return (
    <div
      className="h-full overflow-auto bg-background"
      data-viewer="PGObjBaseViewer"
      data-viewer-klass={schema.klass}
    >
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {Object.entries(groups).map(([groupName, props]) => {
          if (props.length === 0) return null;
          return (
            <section
              key={groupName}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <header className="border-b border-border bg-surface-50 px-5 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-600">
                  {groupName}
                </h3>
              </header>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {props.map((prop) => (
                  <div
                    key={prop.name}
                    className={
                      prop.octrl_type === "List" ||
                      prop.octrl_type === "TabViewer"
                        ? "sm:col-span-2"
                        : ""
                    }
                  >
                    {renderOCtrl(prop, ctx)}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="pb-6 text-[10px] uppercase tracking-wider text-surface-400">
          {schema.klass} · {objectDisplayName(obj)} · OID {obj.oid}
        </div>
      </div>
    </div>
  );
}
