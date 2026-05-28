/**
 * OViewer-Foundation: Type-Definitionen
 *
 * TypeScript-Port der C++-`OViewer.h`-Konzeptschicht (siehe
 * `OSim2004/inc/OViewer.h` als Konzeptquelle, NICHT 1:1-Vorlage). Das
 * Wire-Format ist symmetrisch zur Engine-Repräsentation in
 * `osim_engine.io.otx_reader.OtxObject` (siehe Plan 04-SUMMARY): jedes Modell-
 * Objekt hat eine numerische `oid`, eine `klass` (z.B. "PDurchlaufplan"),
 * einen `attrs`-Bag und eine `sub_refs`-Liste-von-Listen mit OID-Verweisen.
 *
 * Diese Datei ist die TypeScript-Quelle der Wahrheit für das Wire-Modell auf
 * der Frontend-Seite. Plan 07 baut darauf die PropertySchema-Backend-Anbindung
 * + ModelStore (Zustand).
 */

/**
 * Klassen-Name einer Modell-Komponente, wie er aus der Engine kommt.
 * Beispiele: `"PSimulator"`, `"PDurchlaufplan"`, `"PDpKnKonstant"`,
 * `"PRessBeleg"`, `"AEinsatzWunsch"`.
 */
export type ObjectKlass = string;

/**
 * Routing-Hinweis für die ViewerRegistry. Erlaubt es, für dieselbe `klass`
 * mehrere Viewer-Varianten zu registrieren (z.B. `"std"` vs. `"design"` für
 * den Durchlaufplan). `null`/`undefined` heißt "Default".
 */
export type ViewerHint = string;

/**
 * Primitive Attribut-Werte, wie sie über die Leitung kommen. Komplexere
 * Strukturen werden über `sub_refs` als OID-Listen-Verweis modelliert (das
 * OTX-Format kennt keine verschachtelten Werte).
 *
 * `number[]` ist erlaubt für Inline-Arrays (z.B. Koordinaten-Tupel, Farb-
 * Components). Verweise auf Objekte gehen IMMER über `sub_refs`, nicht über
 * `attrs`.
 */
export type AttrValue = number | string | boolean | null | number[];

/**
 * Wire-Format eines einzelnen Modell-Objekts. Symmetrisch zu
 * `OtxObject` im Backend (Engine-Side).
 */
export interface OBaseObj {
  oid: number;
  klass: ObjectKlass;
  attrs: Record<string, AttrValue>;
  sub_refs: number[][];
}

/**
 * Command-Bus zwischen Viewer-Components und Frame/Store. ViewerFrame
 * dispatcht alle Varianten an den `onCommand`-Handler des Workspace-Layouts
 * (kommt in Plan 07).
 *
 * `method` und `sub_refs_update` sind Phase-1-Pflicht:
 *  - `method` wird vom OCtrlMethod dispatched (Buttons im Editor).
 *  - `sub_refs_update` ist die Schnittstelle, über die der Design-Viewer
 *    in Plan 10 Kanten neu zeichnet (Knoten-Vorgänger/Nachfolger).
 */
export type ViewerCommand =
  | { type: "navigate"; direction: "first" | "prev" | "next" | "last" }
  | { type: "create"; objKlass: ObjectKlass }
  | { type: "delete"; oid: number }
  | { type: "reset"; oid: number }
  | { type: "open-sub-viewer"; oid: number }
  | { type: "method"; name: string; oid?: number }
  | {
      type: "sub_refs_update";
      oid: number;
      slot: number;
      newList: number[];
    };

/**
 * Metadaten für ein einzelnes Property — Display-Label, Editor-Typ,
 * Wertetyp, Enum-Auswahllisten, Link-Ziel-Klasse usw.
 *
 * Wird in Plan 07 vom Backend per PropertySchema-Endpoint geliefert. Hier
 * dient sie als Type-Contract zwischen ClassSchema und OCtrl-Components.
 */
export interface PropertyMeta {
  name: string;
  label_de: string;
  octrl_type:
    | "Variable"
    | "Bool"
    | "Enum"
    | "Link"
    | "List"
    | "Method"
    | "TabViewer"
    | "COLORREF"
    | "LOGFONT";
  value_type?: "string" | "int" | "float" | "boolean";
  enum_values?: { value: number; label_de: string }[];
  link_target_klass?: string;
  list_item_klass?: string;
  readonly?: boolean;
  nullable?: boolean;
  description_de?: string;
}

/**
 * Schema einer Modell-Klasse — Display-Label und Liste der Properties.
 * `viewer_hints` listet die in der Registry verfügbaren Hint-Varianten
 * (z.B. `["std", "design"]` für PDurchlaufplan).
 */
export interface ClassSchema {
  klass: string;
  label_de: string;
  properties: PropertyMeta[];
  viewer_hints: ViewerHint[];
}

/**
 * Generische Props eines Viewer-Components (PSimulatorViewer,
 * PDurchlaufplanViewerStd, ...). `allObjects` ist notwendig damit OCtrlLink
 * Lookup-Listen auf dem gesamten Modell rendern kann (z.B. alle PRessBeleg
 * eines Modells).
 *
 * `disabled` wird durchgereicht, wenn das Modell durch einen fremden Lock
 * (siehe Plan 04-LockService) read-only ist (Plan 11 verdrahtet das).
 */
export interface ViewerProps<T extends OBaseObj = OBaseObj> {
  obj: T;
  schema: ClassSchema;
  allObjects: Record<number, OBaseObj>;
  onChange: (patch: Partial<T["attrs"]>) => void;
  onCommand: (cmd: ViewerCommand) => void;
  disabled?: boolean;
}

/**
 * Gemeinsame Props-Signatur aller 9 OCtrl-Components. `T` ist der primitive
 * Werte-Typ des Property — `number`, `string`, `boolean`, `number[]` (für
 * Lists) oder `LogFontValue` (für OCtrlLogFont).
 *
 * `data-octrl-id` wird auf das Root-Element des OCtrls gerendert; E2E-Tests
 * können den OCtrl per `[data-octrl-id="m_iDurchfuehrungszeit"]` lokalisieren.
 */
export interface OCtrlBaseProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  schema: PropertyMeta;
  disabled?: boolean;
  "data-octrl-id"?: string;
}
