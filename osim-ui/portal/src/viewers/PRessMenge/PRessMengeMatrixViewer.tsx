/**
 * PRessMengeMatrixViewer — 2D-Mengen-Matrix Ressource × Knoten × PAssozMenge*.
 *
 * Phase 01.3 Welle 4 / Plan 06. Migrierte den vorherigen 1D-Tabellen-
 * Viewer (`@/viewers/PRess/PRessMengeMatrixViewer` über `matrix-common.tsx`)
 * auf die `@osim/graphobject`-Matrix-Foundation. Layout 1:1 analog
 * `PRessBelegMatrixViewer` (Welle 1.2-E / Plan 06).
 *
 *   Zeilen  = alle PRessMenge-Objekte des Modells (Lager/Bestände)
 *   Spalten = PDlplKnoten des aktuellen PDurchlaufplan (obj.attrs.m_lKnoten)
 *   Cells   = PAssozMenge<Subklasse>-Instanz (Erzgt/Verbr/VerbrZwischen/Abfr)
 *             mit Mengen-Wert; oder leer.
 *
 * C++-Konzeptvorlage: `OSim2004/OSimV01(Fj)/OSimPro/PRessMengeMatrixViewer.cpp`.
 * Konkrete Methoden-Map:
 *   - Cell-Create (Linksklick leere Cell): `GetAssozMenge` Z.787-833
 *     → pMeta = m_cbTyp; oobj = pMeta->New(...); m_lMengRess = menge;
 *     m_iMengeAus / m_iMengeEin via Subklass-Dispatch; knoten->m_lAssozRess->AddTail.
 *   - Cell-Delete (Rechtsklick belegte Cell): `OnRButtonDown` Z.945-997
 *     → assmenge.Delete().
 *
 * Wire-Schema (Plan 05 schemas.json + AUDIT.md Sektion 2/4.4):
 *   - PAssozMenge*.attrs.m_lMengRess = Scalar-Pointer (NICHT Container!) auf
 *     die einzelne PRessMenge-Instanz, trotz `m_l`-Präfix. Audit-Sektion 4.4.
 *   - PDlplKnoten.attrs.m_lAssozRess = Scalar-Pointer auf einen
 *     PAssozRessourceLList-Wrapper, dessen `sub_refs[0]` die OIDs der am
 *     Knoten hängenden PAssozBeleg- ODER PAssozMenge*-Instanzen trägt.
 *
 * Cell-Create-Pfad braucht daher EINEN Lazy-Create-Schritt für den Knoten-
 * Wrapper (PAssozRessourceLList), KEINEN für die PRessMenge-Seite, da
 * m_lMengRess Scalar-Pointer ist.
 *
 * KEINE Generalisierung Richtung "ResourceMatrix"-HOC. Das ist Phase-4-
 * Backlog laut Plan-06 `<objective>`.
 *
 * 3FLS-EAM-Token-Disziplin: shadcn-Tokens (bg-card, border-border,
 * text-foreground, ring-primary), 4 px-Grid, Segoe UI als Body-Font.
 * KEINE ad-hoc Hex-Strings.
 */

import * as React from "react";

import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/stores/model-store";
import type { OBaseObj, ViewerProps } from "@/viewers/core/types";

import {
  MatrixGrid,
  useBlockSelection,
  readFromDataTransfer,
  writeToDataTransfer,
  type MatrixClipboardPayload,
} from "@osim/graphobject";

import {
  PRessMengeMatrixToolbar,
  PRESSMENGE_TYPES,
  type PRessMengeTypeValue,
} from "./PRessMengeMatrixToolbar";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Set der konkreten PAssozMenge-Subklassen, die als Cells in der Matrix
 * akzeptiert werden. Quelle: schemas.json (Plan 05) + AUDIT.md Sektion 2.
 * Die abstrakte Basis `PAssozMenge` wird NICHT akzeptiert (Plan-Vorgabe).
 */
const PASSOZMENGE_KLASSEN = new Set<string>([
  "PAssozMengeErzgt",
  "PAssozMengeVerbr",
  "PAssozMengeVerbrZwischen",
  "PAssozMengeAbfr",
]);

/**
 * Filter: Alle PRessMenge-Objekte des Modells, sortiert nach OID
 * (deterministische Zeilen-Reihenfolge, analog filterRows() in
 * PRessBelegMatrixViewer für die "RESS"-Ansicht).
 */
function filterMengenRess(allObjects: Record<number, OBaseObj>): OBaseObj[] {
  return Object.values(allObjects)
    .filter((o) => o.klass === "PRessMenge")
    .sort((a, b) => a.oid - b.oid);
}

/**
 * Liest die `sub_refs[0]`-Liste eines Wrapper-Objekts via Scalar-Pointer
 * in `parent.attrs[attrName]`. Defensiv — gibt leeres Array zurueck, wenn
 * der Pointer null/missing ist ODER der Wrapper-OID nicht existiert.
 *
 * Kopie aus PRessBelegMatrixViewer (Plan-Pragma: KOPIEREN statt teilen,
 * weil Generalisierung Phase-4-Backlog).
 */
function readWrapperList(
  parent: OBaseObj,
  attrName: string,
  allObjects: Record<number, OBaseObj>,
): number[] {
  const wrapperOidRaw = parent.attrs[attrName];
  if (typeof wrapperOidRaw !== "number") return [];
  const wrapper = allObjects[wrapperOidRaw];
  if (!wrapper) return [];
  return wrapper.sub_refs[0] ?? [];
}

/**
 * Liest den Mengen-Wert aus einer PAssozMenge-Instanz nach Subklasse:
 *   Erzgt          → m_iMengeAus
 *   Verbr          → m_iMengeEin
 *   VerbrZwischen  → m_iMengeEin (geerbt)
 *   Abfr           → m_iMengeAbfr
 * Quelle: PRESSMENGE_TYPES (Plan 05 + AUDIT.md Sektion 2.7).
 */
function extractMenge(assoz: OBaseObj): number {
  const def = PRESSMENGE_TYPES.find((t) => t.value === assoz.klass);
  if (!def) return 0;
  const raw = assoz.attrs[def.mengen_attr];
  return typeof raw === "number" ? raw : 0;
}

interface MatrixCellValue {
  /** Die PAssozMenge-Subklassen-Instanz, die (Ressource, Knoten) verbindet. */
  assoc: OBaseObj;
  /** Mengen-Wert dieser Belegung (subklassen-spezifisches Attribut). */
  menge: number;
}

interface MatrixState {
  rows: OBaseObj[];
  cols: OBaseObj[];
  cellMap: Map<string, MatrixCellValue>;
}

// ---------------------------------------------------------------------
// MatrixMengeCell — 1:1 zum C++-Original (PRessMengeMatrixOGCtrl::
// OnLButtonDown/OnRButtonDown). KEIN In-Cell-Editor — die Cell zeigt nur
// Mengen-Pill + Subklass-Code. Toolbar setzt Typ + Menge für den
// nächsten Cell-Create.
//
// Interaktion (1:1 C++):
//   - Linksklick auf LEERE Cell → Cell-Create mit Toolbar-Typ + Toolbar-Menge
//     (OnLButtonDown Z.867-882).
//   - Linksklick auf BELEGTE Cell → No-Op (1:1 OnLButtonDown: gobj != NULL
//     fällt durch ohne Else-Zweig).
//   - Rechtsklick auf BELEGTE Cell → Cell-Delete (OnRButtonDown Z.971-994).
//   - Ctrl/Shift+Klick → Block-Selektion (kein Paint).
// ---------------------------------------------------------------------

/**
 * Farb-Pill pro Subklassen-Typ — Status-Pill-Pattern (Style-Guide §6.3)
 * auf Basis der Status-Badge-Tokens (§3.2 Sektion 6, bewährte bg+text-
 * Kontrast-Paare). Semantik:
 *   - Erzeuger          → grün (positiv, baut Bestand auf)
 *   - Verbraucher       → rot (Verbrauch, baut Bestand ab)
 *   - Zwischen-Verbrauch → amber (Zwischen-Verbrauch, kostentechnisch separat)
 *   - Abfrage           → brand-blau (neutral, nur Read)
 * Cell-Inhalt zeigt zusätzlich Mengen-Wert als Text (§8.3: nicht nur Farbe).
 */
const TYP_PILL: Record<string, string> = {
  PAssozMengeErzgt:
    "bg-[var(--status-finished-bg)] text-[var(--status-finished-text)] border-[var(--color-success-border)]",
  PAssozMengeVerbr:
    "bg-[var(--status-failed-bg)] text-[var(--status-failed-text)] border-[var(--color-danger-border)]",
  PAssozMengeVerbrZwischen:
    "bg-[var(--status-aborted-bg)] text-[var(--status-aborted-text)] border-[var(--color-warning-border)]",
  PAssozMengeAbfr:
    "bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] border-[var(--color-primary)]",
};

/**
 * Kurzcode-Mapping für die Cell-Anzeige (1:1 C++-DrawSymbol-Geist):
 *   Erzgt → "E", Verbr → "V", VerbrZwischen → "Z", Abfr → "A".
 * Vollständiges Label kommt im Tooltip.
 */
const TYP_KURZ: Record<string, string> = {
  PAssozMengeErzgt: "E",
  PAssozMengeVerbr: "V",
  PAssozMengeVerbrZwischen: "Z",
  PAssozMengeAbfr: "A",
};

interface MatrixMengeCellProps {
  cellId: string;
  rowOid: number;
  colOid: number;
  rowIdx: number;
  colIdx: number;
  /** Effektive Cell-Belegung — `null` wenn leer. */
  cell: MatrixCellValue | null;
  disabled: boolean;
  selected: boolean;
  /** Toolbar-Subklassen-Typ — wird beim Paint auf eine leere Cell verwendet. */
  defaultTyp: PRessMengeTypeValue;
  /** Toolbar-Menge — wird beim Paint auf eine leere Cell verwendet. */
  defaultMenge: number;
  onCellEdit: (rowOid: number, colOid: number, action: "create" | "delete") => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClearSelection: () => void;
}

const MatrixMengeCellImpl: React.FC<MatrixMengeCellProps> = ({
  cellId,
  rowOid,
  colOid,
  rowIdx,
  colIdx,
  cell,
  disabled,
  selected,
  defaultTyp,
  defaultMenge,
  onCellEdit,
  onPointerDown,
  onClearSelection,
}) => {
  const occupied = cell !== null;

  const typLabel = React.useMemo(() => {
    if (!cell) return "";
    const found = PRESSMENGE_TYPES.find((t) => t.value === cell.assoc.klass);
    return found?.label ?? cell.assoc.klass;
  }, [cell]);

  const typKurz = cell ? TYP_KURZ[cell.assoc.klass] ?? "?" : "";

  // Linksklick (1:1 OnLButtonDown):
  //   Ctrl/Shift = Selektion → kein Paint.
  //   Leere Cell → Cell-Create mit Toolbar-Typ + Toolbar-Menge.
  //   Belegte Cell → No-Op (C++: gobj != NULL fällt durch).
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;
      if (occupied) return;
      onClearSelection();
      onCellEdit(rowOid, colOid, "create");
    },
    [disabled, occupied, onClearSelection, onCellEdit, rowOid, colOid],
  );

  // Rechtsklick (1:1 OnRButtonDown): belegte Cell → löschen.
  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled || !occupied) return;
      onClearSelection();
      onCellEdit(rowOid, colOid, "delete");
    },
    [disabled, occupied, onClearSelection, onCellEdit, rowOid, colOid],
  );

  const paintTypLabel =
    PRESSMENGE_TYPES.find((t) => t.value === defaultTyp)?.label ?? defaultTyp;

  return (
    <div
      data-testid="matrix-cell"
      data-cell-id={cellId}
      data-matrix-row={rowIdx}
      data-matrix-col={colIdx}
      data-oid={cell?.assoc.oid}
      data-klass={cell?.assoc.klass}
      data-matrix-cell-selected={selected ? "true" : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={onPointerDown}
      title={
        occupied
          ? `${typLabel}: ${cell?.menge ?? 0} — Rechtsklick zum Löschen`
          : `Linksklick: »${paintTypLabel}« mit Menge ${defaultMenge} anlegen`
      }
      className={[
        "flex h-7 w-full select-none items-center justify-center px-1.5 text-xs",
        "border border-transparent transition-colors",
        !disabled && "cursor-pointer hover:bg-accent",
        selected && "border-primary bg-surface-soft-cyan",
        disabled && "cursor-not-allowed opacity-60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {occupied && cell && (
        <span
          className={
            "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-medium leading-none " +
            (TYP_PILL[cell.assoc.klass] ?? TYP_PILL.PAssozMengeAbfr)
          }
        >
          <span className="font-mono">{typKurz}</span>
          <span>{cell.menge}</span>
        </span>
      )}
    </div>
  );
};

const MatrixMengeCell = React.memo(MatrixMengeCellImpl);

// ---------------------------------------------------------------------
// Clipboard-Payload-Typ (eigenes Schema, NICHT kompatibel zum
// PRessBelegMatrixViewer): trägt Subklasse + Menge, nicht Status.
// ---------------------------------------------------------------------

interface ClipboardCellPayload {
  /** Subklassen-Name, z.B. "PAssozMengeErzgt". */
  klass: string;
  /** Mengen-Wert dieser Belegung. */
  menge: number;
}

// ---------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------

export function PRessMengeMatrixViewer(props: ViewerProps) {
  const { obj, allObjects, disabled = false } = props;

  // Lokaler UI-State.
  //   - revision: Re-Build-Trigger nach Mutation (createObject/deleteObject
  //     mutiert den Store, aber allObjects ist eine Closure-Referenz —
  //     Re-Build über bumpRevision sicherstellen).
  //   - typ: m_cbTyp aus C++ Z.1430-1438. Default: PRESSMENGE_TYPES[0] = Erzgt.
  //   - menge: m_cbMenge aus C++ Z.1422. Default: 1.
  const [revision, setRevision] = React.useState(0);
  const [typ, setTyp] = React.useState<PRessMengeTypeValue>("PAssozMengeErzgt");
  const [menge, setMenge] = React.useState<number>(1);

  const bumpRevision = React.useCallback(() => setRevision((r) => r + 1), []);

  // Block-Select (Foundation-Hook). Aktuell Visual-Highlight + Block-Copy.
  const blockSelection = useBlockSelection();

  // ----- Wire-Daten-Lookup (memoized) -----
  const matrix: MatrixState = React.useMemo(() => {
    const rows = filterMengenRess(allObjects);

    // Spalten-Resolution analog PRessBelegMatrixViewer (Z.366-372): erst
    // attrs.m_lKnoten (inline-Array, V1-Pragma), dann sub_refs[0] (Plan-1.2).
    // Keine Subklassen-Filterung — im C++ werden alle PDlplKnoten erlaubt
    // (PRessMengeMatrixViewer.cpp Z.452-470 walked m_lKnoten ohne Klass-Filter).
    const knotenOidsRaw = obj.attrs.m_lKnoten;
    const knotenOids = Array.isArray(knotenOidsRaw)
      ? (knotenOidsRaw as number[])
      : (obj.sub_refs[0] ?? []);
    const cols = knotenOids
      .map((oid) => allObjects[oid])
      .filter((k): k is OBaseObj => Boolean(k));

    // cellMap: rowOid:colOid → { assoc, menge }. Im PAssozMenge-Pfad ist
    // m_lMengRess ein SCALAR-POINTER (kein LList), siehe AUDIT.md 4.4 —
    // ein PAssozMenge zeigt auf GENAU EINE PRessMenge. Keine Wrapper-
    // Indirektion auf der Ressource-Seite nötig.
    const cellMap = new Map<string, MatrixCellValue>();
    for (const col of cols) {
      const assozOids = readWrapperList(col, "m_lAssozRess", allObjects);
      for (const assozOid of assozOids) {
        const assoz = allObjects[assozOid];
        if (!assoz || !PASSOZMENGE_KLASSEN.has(assoz.klass)) continue;
        const mengRessOidRaw = assoz.attrs.m_lMengRess;
        if (typeof mengRessOidRaw !== "number") continue;
        cellMap.set(`${mengRessOidRaw}:${col.oid}`, {
          assoc: assoz,
          menge: extractMenge(assoz),
        });
      }
    }
    return { rows, cols, cellMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.oid, allObjects, revision]);

  // ----- Cell-Edit-Dispatcher -----
  // action="create" → Cell-Create (Linksklick auf leere Cell).
  // action="delete" → Cell-Delete (Rechtsklick auf belegte Cell).
  const onCellEdit = React.useCallback(
    (rowOid: number, colOid: number, action: "create" | "delete") => {
      const store = useModelStore.getState();
      const rowRess = allObjects[rowOid];
      const colKnoten = allObjects[colOid];
      if (!rowRess || !colKnoten) return;

      const existing = matrix.cellMap.get(`${rowOid}:${colOid}`) ?? null;

      if (action === "delete") {
        // Cell-Delete (1:1 OnRButtonDown Z.985 → assmenge.Delete() +
        // knoten->RemovePSimObj). Pflicht: Pointer im Knoten-Wrapper
        // m_lAssozRess.sub_refs[0] entfernen, dann das Assoz-Objekt löschen.
        if (!existing) return;
        const assoc = existing.assoc;
        const knotenWrapperOidRaw = colKnoten.attrs.m_lAssozRess;
        if (typeof knotenWrapperOidRaw === "number") {
          store.removeSubRef(knotenWrapperOidRaw, 0, assoc.oid);
        }
        store.deleteObject(assoc.oid);
        bumpRevision();
        return;
      }

      if (action === "create") {
        // Cell-Create (1:1 GetAssozMenge Z.787-833):
        //   pMeta = m_cbTyp; oobj = pMeta->New(GetObjectBase());
        //   _ASSERT(oobj->ClassIs(PAssozMenge::ID));
        //   m_iMengeAus / m_iMengeEin / m_iMengeAbfr via Subklass-Dispatch;
        //   m_lMengRess = menge; knoten->m_lAssozRess->AddTail(assmenge).
        if (existing) return; // No-Op auf belegte Cell (1:1 C++ Z.867 `if (gobj == NULL)`).

        const typeDef = PRESSMENGE_TYPES.find((t) => t.value === typ);
        if (!typeDef) return;

        // Schritt 1 — Knoten-Wrapper (PAssozRessourceLList) sicherstellen.
        const knotenWrapperOidRaw = colKnoten.attrs.m_lAssozRess;
        let knotenWrapperOid: number;
        if (typeof knotenWrapperOidRaw === "number") {
          knotenWrapperOid = knotenWrapperOidRaw;
        } else {
          knotenWrapperOid = store.createObject("PAssozRessourceLList", {});
          store.patchObject(colKnoten.oid, { m_lAssozRess: knotenWrapperOid });
        }

        // Schritt 2 — Neue PAssozMenge<Typ>-Instanz mit:
        //   - m_sName: aufgebaut aus Subklassen-Label + Knoten- + Ressource-Name
        //     (C++ benennt das Objekt nicht explizit, übernimmt aber den Default
        //     des Object-Stores; im Wire-Modell ist m_sName Pflicht-String,
        //     daher hier ein sprechender Default).
        //   - m_lMengRess: Scalar-Pointer auf die Zeilen-Ressource.
        //   - typeDef.mengen_attr: Toolbar-Menge.
        const knotenName =
          typeof colKnoten.attrs.m_sName === "string" ? colKnoten.attrs.m_sName : "";
        const ressName =
          typeof rowRess.attrs.m_sName === "string" ? rowRess.attrs.m_sName : "";
        const newAssozOid = store.createObject(typ, {
          m_sName: `${typeDef.label} ${knotenName}→${ressName}`,
          m_lMengRess: rowOid,
          [typeDef.mengen_attr]: menge,
        });

        // Schritt 3 — In den Knoten-Wrapper einhängen (knoten->m_lAssozRess->AddTail).
        store.appendSubRef(knotenWrapperOid, 0, newAssozOid);

        bumpRevision();
        return;
      }
    },
    [allObjects, matrix.cellMap, typ, menge, bumpRevision],
  );

  // ----- Document-Level-Clipboard-Listener (Block-Copy/Paste) -----
  // Analog PRessBelegMatrixViewer, aber Payload-Typ ist ClipboardCellPayload
  // ({ klass, menge }) statt nur Status-Number. Beim Paste:
  //   - Skip Cells mit unbekannter Subklasse (Robustheit gegen Cross-Viewer-Paste).
  //   - Skip Cells, deren Ziel-Position bereits belegt ist (Cell-Create-Pfad
  //     ist sonst No-Op laut C++; keine Auto-Replace-Semantik wie bei
  //     PAssozBeleg, wo Status-Update auf belegter Cell legal ist).
  React.useEffect(() => {
    if (disabled) return undefined;

    const onCopy = (e: ClipboardEvent) => {
      const sel = blockSelection.selection;
      if (!sel || !sel.range) return; // Pass-through
      const dt = e.clipboardData;
      if (!dt) return;
      const { startRow, endRow, startCol, endCol } = sel.range;
      const cells: MatrixClipboardPayload<ClipboardCellPayload | null>["cells"] = [];
      for (let r = startRow; r <= endRow; r += 1) {
        for (let c = startCol; c <= endCol; c += 1) {
          const row = matrix.rows[r];
          const col = matrix.cols[c];
          if (!row || !col) continue;
          const cellValue = matrix.cellMap.get(`${row.oid}:${col.oid}`) ?? null;
          cells.push({
            row: r - startRow,
            col: c - startCol,
            value: cellValue
              ? { klass: cellValue.assoc.klass, menge: cellValue.menge }
              : null,
          });
        }
      }
      e.preventDefault();
      writeToDataTransfer<ClipboardCellPayload | null>(dt, {
        origin: "PRessMengeMatrixViewer",
        cells,
      });
    };

    const onPaste = (e: ClipboardEvent) => {
      const sel = blockSelection.selection;
      if (!sel || !sel.range) return; // Pass-through ohne Ziel-Cell
      const dt = e.clipboardData;
      if (!dt) return;
      const payload = readFromDataTransfer<ClipboardCellPayload | null>(dt);
      if (!payload) return;
      e.preventDefault();

      const store = useModelStore.getState();

      // Ziel-Ursprung = Anchor der Selection.
      const baseRow = sel.range.startRow;
      const baseCol = sel.range.startCol;
      for (const cell of payload.cells) {
        const targetRow = matrix.rows[baseRow + cell.row];
        const targetCol = matrix.cols[baseCol + cell.col];
        if (!targetRow || !targetCol) continue;
        if (!cell.value) continue;

        // Robustheit: nur akzeptierte Subklassen.
        const typeDef = PRESSMENGE_TYPES.find((t) => t.value === cell.value!.klass);
        if (!typeDef) continue;

        const existing = matrix.cellMap.get(`${targetRow.oid}:${targetCol.oid}`) ?? null;
        if (existing) continue; // Bestehende Cells werden nicht überschrieben.

        // Inline-Create mit Payload-Werten (NICHT mit Toolbar-Modi):
        //   - Knoten-Wrapper sicherstellen
        //   - PAssozMenge<Typ> + m_lMengRess setzen
        //   - In Wrapper einhängen
        const knotenWrapperOidRaw = targetCol.attrs.m_lAssozRess;
        let knotenWrapperOid: number;
        if (typeof knotenWrapperOidRaw === "number") {
          knotenWrapperOid = knotenWrapperOidRaw;
        } else {
          knotenWrapperOid = store.createObject("PAssozRessourceLList", {});
          store.patchObject(targetCol.oid, { m_lAssozRess: knotenWrapperOid });
        }

        const knotenName =
          typeof targetCol.attrs.m_sName === "string" ? targetCol.attrs.m_sName : "";
        const ressName =
          typeof targetRow.attrs.m_sName === "string" ? targetRow.attrs.m_sName : "";
        const newAssozOid = store.createObject(
          typeDef.value as "PAssozMengeErzgt" | "PAssozMengeVerbr" | "PAssozMengeVerbrZwischen" | "PAssozMengeAbfr",
          {
            m_sName: `${typeDef.label} ${knotenName}→${ressName}`,
            m_lMengRess: targetRow.oid,
            [typeDef.mengen_attr]: cell.value.menge,
          },
        );
        store.appendSubRef(knotenWrapperOid, 0, newAssozOid);
      }
      bumpRevision();
    };

    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [disabled, blockSelection, matrix, bumpRevision]);

  // ----- Dialog-Header-Strings -----
  const planName =
    typeof obj.attrs.m_sName === "string" ? obj.attrs.m_sName : `oid ${obj.oid}`;
  const paintLabel =
    PRESSMENGE_TYPES.find((t) => t.value === typ)?.label ?? typ;
  const dialogDescription = `Plan: ${planName} · Linksklick legt »${paintLabel}« (Menge ${menge}) an · Rechtsklick löscht`;

  // ----- Empty-State -----
  if (matrix.cols.length === 0 || matrix.rows.length === 0) {
    return (
      <ChildDialog
        title={`Mengen-Assoziationen — ${matrix.rows.length} Ressourcen × ${matrix.cols.length} Knoten`}
        description={`Plan: ${planName}`}
        footer={
          <PRessMengeMatrixToolbar
            typ={typ}
            onTypChange={setTyp}
            menge={menge}
            onMengeChange={setMenge}
            disabled={disabled}
          />
        }
      >
        <div
          data-viewer="PRessMengeMatrixViewer"
          data-matrix-grid="PRessMenge"
          className="p-8 text-center text-sm text-muted-foreground"
        >
          {matrix.cols.length === 0
            ? "Keine Knoten im Durchlaufplan"
            : "Keine Mengen-Ressourcen im Modell"}
        </div>
      </ChildDialog>
    );
  }

  // ----- Render -----
  return (
    <ChildDialog
      title={`Mengen-Assoziationen — ${matrix.rows.length} Ressourcen × ${matrix.cols.length} Knoten`}
      description={dialogDescription}
      footer={
        <PRessMengeMatrixToolbar
          typ={typ}
          onTypChange={setTyp}
          menge={menge}
          onMengeChange={setMenge}
          disabled={disabled}
        />
      }
    >
      <div
        data-viewer="PRessMengeMatrixViewer"
        data-matrix-grid="PRessMenge"
      >
        <MatrixGrid<OBaseObj, OBaseObj, MatrixCellValue>
          rows={matrix.rows}
          cols={matrix.cols}
          rowKey={(r) => `oid:${r.oid}`}
          colKey={(c) => `oid:${c.oid}`}
          cellLookup={(r, c) => matrix.cellMap.get(`${r.oid}:${c.oid}`) ?? null}
          renderCell={(r, c, val) => {
            const rowIdx = matrix.rows.findIndex((row) => row.oid === r.oid);
            const colIdx = matrix.cols.findIndex((col) => col.oid === c.oid);
            const cellId = `oid:${r.oid}:oid:${c.oid}`;
            const selected = blockSelection.isSelected({ row: rowIdx, col: colIdx });
            return (
              <MatrixMengeCell
                cellId={cellId}
                rowOid={r.oid}
                colOid={c.oid}
                rowIdx={rowIdx}
                colIdx={colIdx}
                cell={val ?? null}
                disabled={disabled}
                selected={selected}
                defaultTyp={typ}
                defaultMenge={menge}
                onCellEdit={onCellEdit}
                onClearSelection={blockSelection.clear}
                onPointerDown={(e) =>
                  blockSelection.handleCellPointerDown(e, { row: rowIdx, col: colIdx })
                }
              />
            );
          }}
          revision={revision}
          disabled={disabled}
          cornerLabel="Knoten / Ressource"
        />
      </div>
    </ChildDialog>
  );
}
