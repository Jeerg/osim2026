/**
 * PRessBelegMatrixViewer — Erster Konsument der Matrix-Foundation
 * (Welle 1.2-E / Plan 06).
 *
 * 2D-Belegungs-Matrix Ressource × Knoten × PAssozBeleg-Status:
 *   - Zeilen = alle PRessBeleg / PBetriebsmittel / PPerson aus dem Modell,
 *     gefiltert per View-Mode (ALL / PERS / RESS).
 *   - Spalten = die PDpKn*-Knoten des aktuellen PDurchlaufplan (obj.attrs.m_lKnoten).
 *   - Cells   = PAssozBeleg-Status (bevorzugt/standard/notfalls/geblockt)
 *     oder "—" wenn keine Belegung.
 *
 * C++-Original: `OSim2004/OSimV01(Fj)/OSimPro/PRessBelegMatrixViewer.cpp`.
 * Konkrete Methoden-Map siehe `.planning/phases/01.2-…/01.2-06-CPP-AUDIT.md`.
 *
 * Wire-Schema (Source-of-Truth: `01.2-SCHEMA-MAP.md`):
 *   - PAssozBeleg.attrs.m_lRessourcen = Scalar OID-Pointer auf einen
 *     `PRessBelegLList`-Wrapper, dessen `sub_refs[0]` die belegten
 *     Ressourcen-OIDs trägt.
 *   - PDpKn*.attrs.m_lAssozRess = Scalar OID-Pointer auf einen
 *     `PAssozRessourceLList`-Wrapper, dessen `sub_refs[0]` die
 *     `PAssozBeleg`-OIDs des Knotens trägt.
 *   - `sub_refs[0]` an PAssozBeleg/PDpKn* selbst ist IMMER leer — die
 *     Wrapper-Indirektion ist Pflicht.
 *
 * Cell-Create-Pfad braucht daher zwei Lazy-Create-Schritte:
 *   1. PAssozRessourceLList (Knoten-Wrapper) — wenn knoten.attrs.m_lAssozRess
 *      null ist, neu anlegen und Pointer setzen.
 *   2. PRessBelegLList (Beleg-Wrapper) — pro neuem PAssozBeleg ein eigener
 *      Wrapper für die enthaltenen Ressourcen-OIDs.
 *
 * 3FLS-EAM-Token-Disziplin: shadcn-Tokens (bg-card, border-border,
 * text-foreground, ring-primary), 4 px-Grid, Geist Variable als Body-Font.
 * KEINE ad-hoc Hex-Strings.
 *
 * KEIN Touch an `matrix-common.tsx` oder `PRessMengeMatrixViewer.tsx`
 * (CONTEXT deferred — Phase-1.3-Backlog).
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
} from "@/graph/foundation/matrix";

import {
  PRessBelegMatrixToolbar,
  VERK_STATUS,
} from "./PRessBelegMatrixToolbar";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const ROW_KLASSES = new Set<string>([
  "PRessBeleg",
  "PBetriebsmittel",
  "PPerson",
]);

function filterRows(
  allObjects: Record<number, OBaseObj>,
  viewMode: "ALL" | "PERS" | "RESS",
): OBaseObj[] {
  const all = Object.values(allObjects).filter((o) => ROW_KLASSES.has(o.klass));
  if (viewMode === "PERS") return all.filter((o) => o.klass === "PPerson")
    .sort((a, b) => a.oid - b.oid);
  if (viewMode === "RESS") return all.filter((o) => o.klass === "PBetriebsmittel")
    .sort((a, b) => a.oid - b.oid);
  // ALL: Personen zuerst, dann Betriebsmittel (1:1 C++ dFillRessList Z.1521-1538).
  const personen = all.filter((o) => o.klass === "PPerson").sort((a, b) => a.oid - b.oid);
  const bm = all.filter((o) => o.klass === "PBetriebsmittel").sort((a, b) => a.oid - b.oid);
  const sonst = all.filter((o) => o.klass === "PRessBeleg").sort((a, b) => a.oid - b.oid);
  return [...personen, ...bm, ...sonst];
}

/**
 * Liest die `sub_refs[0]`-Liste eines Wrapper-Objekts via Scalar-Pointer
 * in `parent.attrs[attrName]`. Defensiv — gibt leeres Array zurueck, wenn
 * der Pointer null/missing ist ODER der Wrapper-OID nicht existiert.
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
 * Default-Link-Status = ABL_STD (1 = "standard"). 1:1 zu C++
 * `PAssozBelegLinkStatusList::GetLinkStatus` (PAssozRessource.cpp Z.495):
 * fehlt ein PAssozBelegLinkInfo für die Ressource, gilt ABL_STD.
 */
const ABL_STD = 1;

/**
 * Findet das `PAssozBelegLinkInfo` für (Belegung, Ressource) oder null.
 *
 * Wire-Struktur (verifiziert am Real-Modell): `PAssozBeleg.m_LinkStatusList`
 * ist ein Scalar-Pointer auf eine `PAssozBelegLinkStatusList`; deren
 * `sub_refs[0]` listet `PAssozBelegLinkInfo`-OIDs. Jedes Info trägt
 * `m_oRessBeleg` (Ressourcen-OID) + `m_eStatus` + `m_eBaseStatus`.
 */
function findLinkInfo(
  assoc: OBaseObj,
  ressOid: number,
  allObjects: Record<number, OBaseObj>,
): OBaseObj | null {
  const lslOid = assoc.attrs.m_LinkStatusList;
  if (typeof lslOid !== "number") return null;
  const lsl = allObjects[lslOid];
  const infoOids = lsl?.sub_refs[0] ?? [];
  for (const infoOid of infoOids) {
    const info = allObjects[infoOid];
    if (info && info.attrs.m_oRessBeleg === ressOid) return info;
  }
  return null;
}

/**
 * Liest den Link-Status einer Ressource innerhalb einer Belegung — 1:1 zu
 * C++ `PAssozBeleg::GetBaseLinkStatus` → `m_LinkStatusList->GetLinkStatus`.
 * Default ABL_STD, wenn kein Info existiert (häufig: OTX ohne explizite
 * Status-Liste ⇒ alle belegten Zellen sind "standard").
 */
function getLinkStatus(
  assoc: OBaseObj,
  ressOid: number,
  allObjects: Record<number, OBaseObj>,
): number {
  const info = findLinkInfo(assoc, ressOid, allObjects);
  const st = info?.attrs.m_eStatus;
  return typeof st === "number" ? st : ABL_STD;
}

interface MatrixCellValue {
  /** Die PAssozBeleg-Belegung, die (Ressource, Knoten) verbindet. */
  assoc: OBaseObj;
  /** Effektiver Link-Status der Ressource in dieser Belegung. */
  status: number;
}

interface MatrixState {
  rows: OBaseObj[];
  cols: OBaseObj[];
  cellMap: Map<string, MatrixCellValue>;
}

/**
 * Setzt den Link-Status einer Ressource in einer Belegung — 1:1 zu C++
 * `PAssozBeleg::SetBaseLinkStatus` → `m_LinkStatusList->SetLinkStatus(beleg,
 * status, asBase=TRUE)`. Legt die `PAssozBelegLinkStatusList` und das
 * `PAssozBelegLinkInfo` bei Bedarf lazy an (AddLinkSTD).
 *
 * Liest den Store-State frisch (nach evtl. vorausgehenden createObject-
 * Calls), statt einer veralteten `allObjects`-Closure zu vertrauen.
 */
function setLinkStatus(assocOid: number, ressOid: number, status: number): void {
  const store = useModelStore.getState();
  const objects = store.wire?.objects;
  if (!objects) return;
  const assoc = objects[assocOid];
  if (!assoc) return;

  // 1. m_LinkStatusList-Wrapper sicherstellen.
  let lslOid = assoc.attrs.m_LinkStatusList;
  if (typeof lslOid !== "number") {
    lslOid = store.createObject("PAssozBelegLinkStatusList", {});
    store.patchObject(assocOid, { m_LinkStatusList: lslOid });
  }

  // 2. Bestehendes Info? (frischer State nach evtl. Create)
  const fresh = useModelStore.getState().wire?.objects ?? {};
  const existingInfo = findLinkInfo(
    fresh[assocOid] ?? assoc,
    ressOid,
    fresh,
  );
  if (existingInfo) {
    store.patchObject(existingInfo.oid, { m_eStatus: status, m_eBaseStatus: status });
    return;
  }

  // 3. Neues PAssozBelegLinkInfo anlegen + in die Liste einhängen (AddLinkSTD).
  const infoOid = store.createObject("PAssozBelegLinkInfo", {
    m_oRessBeleg: ressOid,
    m_eStatus: status,
    m_eBaseStatus: status,
  });
  store.appendSubRef(lslOid as number, 0, infoOid);
}

// ---------------------------------------------------------------------
// MatrixStatusCell — 1:1 zum C++-Original (PRessBelegMatrixGObj::DrawSymbol +
// PRessBelegMatrixOGCtrl::OnLButtonDown/OnRButtonDown).
//
// KEIN In-Cell-Dropdown (das gab es im Original nie und zog die Spalte auf).
// Die Zelle zeichnet nur den Status-Text. Der zu setzende Status kommt aus
// der Toolbar-Combobox (m_cbVerkStatus). Interaktion:
//   - Linksklick auf LEERE Cell  → Belegung mit Toolbar-Status anlegen
//     (OnLButtonDown Z.861-893).
//   - Linksklick auf BELEGTE Cell → nichts (OnLButtonDown: gobj != NULL → kein
//     Else-Zweig).
//   - Rechtsklick auf BELEGTE Cell → löschen (OnRButtonDown Z.990-1016).
//   - Ctrl/Shift+Klick → Block-Selektion (kein Paint; OnLButtonDown Z.842
//     `if (nFlags&MK_CONTROL) return;`).
// ---------------------------------------------------------------------

/**
 * Farb-Pill pro Link-Status — Status-Pill-Pattern (Style-Guide §6.3) auf
 * Basis der Status-Badge-Tokens (§3.2 Sektion 6, bewährte bg+text-Kontrast-
 * Paare). Semantik: bevorzugt=positiv/grün, standard=neutral/grau,
 * notfalls=Achtung/amber, geblockt=blockiert/rot. Status zusätzlich als Text
 * (§8.3: nicht nur via Farbe).
 */
const STATUS_PILL: Record<number, string> = {
  0: "bg-[var(--status-finished-bg)] text-[var(--status-finished-text)] border-[var(--color-success-border)]", // bevorzugt → grün
  1: "bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] border-[var(--color-primary)]", // standard → brand-blau
  2: "bg-[var(--status-aborted-bg)] text-[var(--status-aborted-text)] border-[var(--color-warning-border)]", // notfalls → amber
  3: "bg-[var(--status-failed-bg)] text-[var(--status-failed-text)] border-[var(--color-danger-border)]", // geblockt → rot
};

interface MatrixStatusCellProps {
  cellId: string;
  rowOid: number;
  colOid: number;
  rowIdx: number;
  colIdx: number;
  /** Effektiver Link-Status der Zelle, oder null wenn keine Belegung. */
  status: number | null;
  /** OID der Belegung (für E2E/Diagnostik); undefined wenn leer. */
  assocOid?: number;
  disabled: boolean;
  selected: boolean;
  /** Toolbar-Status (m_cbVerkStatus), der beim Paint gesetzt wird. */
  defaultStatus: number;
  onCellEdit: (rowOid: number, colOid: number, newStatus: number | null) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClearSelection: () => void;
}

const MatrixStatusCellImpl: React.FC<MatrixStatusCellProps> = ({
  cellId,
  rowOid,
  colOid,
  rowIdx,
  colIdx,
  status,
  assocOid,
  disabled,
  selected,
  defaultStatus,
  onCellEdit,
  onPointerDown,
  onClearSelection,
}) => {
  const occupied = status !== null;

  const statusLabel = React.useMemo(() => {
    if (status === null) return "";
    const found = VERK_STATUS.find((s) => s.value === status);
    return found?.label ?? String(status);
  }, [status]);

  // Linksklick (1:1 OnLButtonDown): Ctrl/Shift = Selektion → kein Paint;
  // leere Cell = Belegung mit Toolbar-Status anlegen; belegte Cell = No-Op.
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;
      if (occupied) return;
      onClearSelection();
      onCellEdit(rowOid, colOid, defaultStatus);
    },
    [disabled, occupied, onClearSelection, onCellEdit, rowOid, colOid, defaultStatus],
  );

  // Rechtsklick (1:1 OnRButtonDown): belegte Cell → löschen.
  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled || !occupied) return;
      onClearSelection();
      onCellEdit(rowOid, colOid, null);
    },
    [disabled, occupied, onClearSelection, onCellEdit, rowOid, colOid],
  );

  return (
    <div
      data-testid="matrix-cell"
      data-cell-id={cellId}
      data-matrix-row={rowIdx}
      data-matrix-col={colIdx}
      data-oid={assocOid}
      data-matrix-cell-selected={selected ? "true" : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={onPointerDown}
      title={
        occupied
          ? `${statusLabel} — Rechtsklick zum Löschen`
          : "Linksklick: Belegung anlegen"
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
      {occupied && (
        <span
          className={
            "inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium leading-none " +
            (STATUS_PILL[status ?? ABL_STD] ?? STATUS_PILL[ABL_STD])
          }
        >
          {statusLabel}
        </span>
      )}
    </div>
  );
};

const MatrixStatusCell = React.memo(MatrixStatusCellImpl);

// ---------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------

export function PRessBelegMatrixViewer(props: ViewerProps) {
  const { obj, allObjects, disabled = false } = props;

  // Lokaler UI-State (Toolbar-Modi + Revision-Bump fuer Re-Build nach Mutation).
  const [revision, setRevision] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<"ALL" | "PERS" | "RESS">("ALL");
  const [verkMode, setVerkMode] = React.useState<"AND" | "OR">("AND");
  const [defaultStatus, setDefaultStatus] = React.useState<number>(1); // standard

  const bumpRevision = React.useCallback(() => setRevision((r) => r + 1), []);

  // Block-Select (Foundation-Hook). Aktuell nur Visual-Highlight; Block-Copy
  // ist Welle 1.2-E Plan 06 Task 3 (separate Spec / Listener).
  const blockSelection = useBlockSelection();

  // ----- Wire-Daten-Lookup (memoized) -----
  const matrix: MatrixState = React.useMemo(() => {
    const rows = filterRows(allObjects, viewMode);

    const knotenOidsRaw = obj.attrs.m_lKnoten;
    const knotenOids = Array.isArray(knotenOidsRaw)
      ? (knotenOidsRaw as number[])
      : (obj.sub_refs[0] ?? []);
    const cols = knotenOids
      .map((oid) => allObjects[oid])
      .filter((k): k is OBaseObj => Boolean(k));

    // cellMap: rowOid:colOid → { assoc, status }. Eine PAssozBeleg kann
    // MEHRERE Ressourcen tragen (m_lRessourcen-Liste); jede hat ihren eigenen
    // Link-Status in m_LinkStatusList (Default ABL_STD). 1:1 C++ dFillMatrix.
    const cellMap = new Map<string, MatrixCellValue>();
    for (const col of cols) {
      const assozOids = readWrapperList(col, "m_lAssozRess", allObjects);
      for (const assozOid of assozOids) {
        const assoz = allObjects[assozOid];
        if (!assoz || assoz.klass !== "PAssozBeleg") continue;
        const ressOids = readWrapperList(assoz, "m_lRessourcen", allObjects);
        for (const rOid of ressOids) {
          cellMap.set(`${rOid}:${col.oid}`, {
            assoc: assoz,
            status: getLinkStatus(assoz, rOid, allObjects),
          });
        }
      }
    }
    return { rows, cols, cellMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.oid, allObjects, viewMode, revision]);

  // ----- Cell-Edit-Dispatcher -----
  // newStatus === null → Delete. Sonst → Status-Edit ODER Cell-Create.
  const onCellEdit = React.useCallback(
    (rowOid: number, colOid: number, newStatus: number | null) => {
      const store = useModelStore.getState();
      const rowRess = allObjects[rowOid];
      const colKnoten = allObjects[colOid];
      if (!rowRess || !colKnoten) return;

      const existing = matrix.cellMap.get(`${rowOid}:${colOid}`) ?? null;

      if (existing && newStatus !== null) {
        // Status-Edit auf bestehende Belegung (z.B. via Paste): Link-Status
        // der Ressource in DIESER Belegung setzen — 1:1 C++ SetBaseLinkStatus.
        setLinkStatus(existing.assoc.oid, rowOid, newStatus);
        bumpRevision();
        return;
      }

      if (existing && newStatus === null) {
        // Cell-Delete (1:1 OnRButtonDown → knoten->RemovePSimObj(beleg)):
        // Ressource aus der Belegung lösen + ihr LinkInfo entfernen.
        const assoc = existing.assoc;
        const info = findLinkInfo(assoc, rowOid, allObjects);
        if (info) {
          const lslOid = assoc.attrs.m_LinkStatusList;
          if (typeof lslOid === "number") {
            store.removeSubRef(lslOid, 0, info.oid);
          }
          store.deleteObject(info.oid);
        }
        const belegWrapperOidRaw = assoc.attrs.m_lRessourcen;
        if (typeof belegWrapperOidRaw === "number") {
          const wrapper = allObjects[belegWrapperOidRaw];
          const ressList = wrapper?.sub_refs[0] ?? [];
          if (ressList.length <= 1) {
            // Letzte Ressource → komplette PAssozBeleg-Instanz löschen.
            // deleteObject filtert auch den Pointer aus dem Knoten-Wrapper.
            store.deleteObject(assoc.oid);
          } else {
            store.removeSubRef(belegWrapperOidRaw, 0, rowOid);
          }
        } else {
          store.deleteObject(assoc.oid);
        }
        bumpRevision();
        return;
      }

      if (!existing && newStatus !== null) {
        // Cell-Create (1:1 OnLButtonDown): neue Belegung + Ressource +
        // Link-Status. verkMode=AND (Default) ⇒ neue PAssozBeleg pro Cell.
        // Schritt 1 — Knoten-Wrapper (PAssozRessourceLList) sicherstellen.
        const knotenWrapperOidRaw = colKnoten.attrs.m_lAssozRess;
        let knotenWrapperOid: number;
        if (typeof knotenWrapperOidRaw === "number") {
          knotenWrapperOid = knotenWrapperOidRaw;
        } else {
          knotenWrapperOid = store.createObject("PAssozRessourceLList", {});
          store.patchObject(colKnoten.oid, { m_lAssozRess: knotenWrapperOid });
        }

        // Schritt 2 — Neue PAssozBeleg (OHNE m_eStatus — den gibt es nicht;
        // der Status lebt per Ressource in m_LinkStatusList, Schritt 5).
        const neueAssozOid = store.createObject("PAssozBeleg", {});

        // Schritt 3 — Beleg-Wrapper (PRessBelegLList) + Ressource einhängen.
        const belegWrapperOid = store.createObject("PRessBelegLList", {});
        store.patchObject(neueAssozOid, { m_lRessourcen: belegWrapperOid });
        store.appendSubRef(belegWrapperOid, 0, rowOid);

        // Schritt 4 — PAssozBeleg in den Knoten-Wrapper einhängen.
        store.appendSubRef(knotenWrapperOid, 0, neueAssozOid);

        // Schritt 5 — Link-Status der Ressource setzen (SetBaseLinkStatus).
        setLinkStatus(neueAssozOid, rowOid, newStatus);

        bumpRevision();
        return;
      }

      // Leerer Klick / leere Cell + null-Status → no-op.
    },
    [allObjects, matrix.cellMap, bumpRevision],
  );

  // ----- Document-Level-Clipboard-Listener (SC-5) -----
  // Welle 1.2-E Task 3: bei aktiver Block-Selection ODER Edit-Mode
  // einen Copy/Paste am Document abfangen und die Matrix-Foundation-
  // Pure-Functions (writeToDataTransfer / readFromDataTransfer)
  // aufrufen. Ohne Selection und ohne Edit-Mode → Pass-through.
  React.useEffect(() => {
    if (disabled) return undefined;

    const onCopy = (e: ClipboardEvent) => {
      const sel = blockSelection.selection;
      if (!sel || !sel.range) return; // Pass-through
      const dt = e.clipboardData;
      if (!dt) return;
      const { startRow, endRow, startCol, endCol } = sel.range;
      const cells: MatrixClipboardPayload<number | null>["cells"] = [];
      for (let r = startRow; r <= endRow; r += 1) {
        for (let c = startCol; c <= endCol; c += 1) {
          const row = matrix.rows[r];
          const col = matrix.cols[c];
          if (!row || !col) continue;
          const cell = matrix.cellMap.get(`${row.oid}:${col.oid}`) ?? null;
          cells.push({
            row: r - startRow,
            col: c - startCol,
            value: cell ? cell.status : null,
          });
        }
      }
      e.preventDefault();
      writeToDataTransfer<number | null>(dt, {
        origin: "PRessBelegMatrixViewer",
        cells,
      });
    };

    const onPaste = (e: ClipboardEvent) => {
      const sel = blockSelection.selection;
      if (!sel || !sel.range) return; // Pass-through ohne Ziel-Cell
      const dt = e.clipboardData;
      if (!dt) return;
      const payload = readFromDataTransfer<number | null>(dt);
      if (!payload) return;
      e.preventDefault();
      // Ziel-Ursprung = Anchor der Selection.
      const baseRow = sel.range.startRow;
      const baseCol = sel.range.startCol;
      for (const cell of payload.cells) {
        const targetRow = matrix.rows[baseRow + cell.row];
        const targetCol = matrix.cols[baseCol + cell.col];
        if (!targetRow || !targetCol) continue;
        // value === null → kein Insert; sonst onCellEdit (Status-Edit
        // wenn belegt, Cell-Create wenn leer).
        if (typeof cell.value === "number") {
          onCellEdit(targetRow.oid, targetCol.oid, cell.value);
        }
      }
    };

    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [disabled, blockSelection, matrix, onCellEdit]);

  // Label des aktuell in der Toolbar gewählten Paint-Status (m_cbVerkStatus)
  // für den Interaktions-Hinweis im Dialog-Header.
  const planName =
    typeof obj.attrs.m_sName === "string" ? obj.attrs.m_sName : `oid ${obj.oid}`;
  const paintLabel =
    VERK_STATUS.find((s) => s.value === defaultStatus)?.label ?? "standard";
  const dialogDescription = `Plan: ${planName} · Linksklick legt »${paintLabel}« an · Rechtsklick löscht`;

  // ----- Empty-State -----
  if (matrix.cols.length === 0 || matrix.rows.length === 0) {
    return (
      <ChildDialog
        title={`Ressourcen-Belegung — ${matrix.rows.length} Ressourcen × ${matrix.cols.length} Knoten`}
        description={`Plan: ${
          typeof obj.attrs.m_sName === "string" ? obj.attrs.m_sName : `oid ${obj.oid}`
        }`}
        footer={
          <PRessBelegMatrixToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            verkMode={verkMode}
            onVerkModeChange={setVerkMode}
            defaultStatus={defaultStatus}
            onDefaultStatusChange={setDefaultStatus}
            disabled={disabled}
          />
        }
      >
        <div
          data-viewer="PRessBelegMatrixViewer"
          data-matrix-grid="PRessBeleg"
          className="p-8 text-center text-sm text-muted-foreground"
        >
          {matrix.cols.length === 0
            ? "Keine Knoten im Durchlaufplan"
            : "Keine Ressourcen im Modell"}
        </div>
      </ChildDialog>
    );
  }

  // ----- Render -----
  return (
    <ChildDialog
      title={`Ressourcen-Belegung — ${matrix.rows.length} Ressourcen × ${matrix.cols.length} Knoten`}
      description={dialogDescription}
      footer={
        <PRessBelegMatrixToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          verkMode={verkMode}
          onVerkModeChange={setVerkMode}
          defaultStatus={defaultStatus}
          onDefaultStatusChange={setDefaultStatus}
          disabled={disabled}
        />
      }
    >
      <div
        data-viewer="PRessBelegMatrixViewer"
        data-matrix-grid="PRessBeleg"
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
              <MatrixStatusCell
                cellId={cellId}
                rowOid={r.oid}
                colOid={c.oid}
                rowIdx={rowIdx}
                colIdx={colIdx}
                status={val ? val.status : null}
                assocOid={val?.assoc.oid}
                disabled={disabled}
                selected={selected}
                defaultStatus={defaultStatus}
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
