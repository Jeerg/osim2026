/**
 * PEinsatzViewer — Arbeits-/Einsatzzeiten-Matrix (Ressourcen × Tage).
 *
 * 1:1-Port von OSim2004 `PEinsatzViewer` + `PEinsatzzeitViewerOGCtrl`
 * (OSimPro/PEinsatzViewer.cpp + PEinsatzzeitViewerOGCtrl.cpp), beide auf
 * `PMatrixBaseViewer`/-OGCtrl (gleiche Basis wie PRessBelegMatrixViewer).
 *
 * Layout (PEinsatzViewer::OViewInit Z.385-401 + dKnotenFill Z.417-460):
 *   - Grid = (m_itage Spalten × pers Zeilen). Spalten = Tage (m_itage =
 *     Enddatum − Startdatum). Zeilen = Ressourcen (sim.m_lRessBeleg).
 *   - Zellen: iteriere sim.m_lEinsatz → je PEinsatzzeitTag dessen m_lTagRess →
 *     pro PTagRess: Zelle bei x=m_iTag, y=PersonIndex(m_oRessBeleg) mit
 *     Text = m_sName + Hintergrundfarbe = GetColor(Muster).
 *   - Wochen-Combobox (m_cbWoche / m_iGesamtWoche / m_iAktWoche).
 *
 * Interaktion (PEinsatzzeitViewerOGCtrl::OnLButtonDown Z.870-993 /
 * OnRButtonDown Z.1084-1145), 1:1:
 *   - Linksklick LEERE Zelle  → das in der Legende AKTIVE Muster zuweisen
 *     (neues PTagRess{m_iTag, m_oRessBeleg} in pattern.m_lTagRess->AddTail,
 *      ressBeleg.m_lEinsatz = pattern).
 *   - Linksklick BELEGTE Zelle → zum NÄCHSTEN Muster zyklen (PTagRess aus
 *     aktuellem entfernen, in nächstes einfügen) — GetZeit(pos, FALSE).
 *   - Rechtsklick BELEGTE Zelle → Zuordnung löschen (PTagRess aus m_lTagRess
 *     entfernen + Objekt löschen, m_lEinsatz = ONULL).
 *   - Legende = PEinsatzzeitListBoxLList: Klick wählt das aktive Muster
 *     (GetListCtrl()->GetCurSel()).
 *
 * Datenmodell (OSimPro/PEinsatzzeit.odh):
 *   PEinsatzzeitTag: m_sName, m_lTagesEinsatzzeit → PTagesEinsatzzeit
 *     (m_iEinsatzAnfang/m_iEinsatzEnde), m_lTagRess → PTagRess(m_iTag,
 *      m_oRessBeleg), m_lPausen → PPauseZyklus.
 *
 * Hinweis Persistenz: neu angelegte PTagRess werden vom Save-Pfad
 * materialisiert; die m_lTagRess-Container-Verkettung (LList) round-trippt
 * erst mit der Phase-2-LList-Mutation (wie bei PAssozBeleg). In-Session ist
 * die Bearbeitung vollständig wirksam.
 */

import * as React from "react";
import { ClockIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { MatrixGrid } from "@/graph/foundation/matrix/MatrixGrid";
import { useModelStore } from "@/stores/model-store";
import { cn } from "@/lib/utils";
import type { AttrValue, OBaseObj, ViewerProps } from "@/viewers/core/types";

// ---------------------------------------------------------------------------
// Muster-Farbpalette (token-basiert, 1:1 zur STATUS_PILL-Konvention im
// Belegungs-Matrix-Viewer — kein ad-hoc Hex). Pro Muster-Index zyklisch,
// analog OSim2004 PEinsatzzeitViewerOGCtrl::GetColor(zeit, index).
// ---------------------------------------------------------------------------

const PATTERN_PALETTE: string[] = [
  "bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] border-[var(--color-primary)]",
  "bg-[var(--status-finished-bg)] text-[var(--status-finished-text)] border-[var(--color-success-border)]",
  "bg-[var(--status-aborted-bg)] text-[var(--status-aborted-text)] border-[var(--color-warning-border)]",
  "bg-[var(--status-failed-bg)] text-[var(--status-failed-text)] border-[var(--color-danger-border)]",
];

const DAYS_PER_WEEK = 7;

// ---------------------------------------------------------------------------
// Datenmodell-Helfer
// ---------------------------------------------------------------------------

interface CellInfo {
  /** OID des zugeordneten Musters (PEinsatzzeitTag). */
  patternOid: number;
  /** OID des PTagRess-Tupels (für Löschen/Zyklen). */
  tagRessOid: number;
  patternName: string;
  color: string;
  /** Schichtfenster-Label, z.B. "6–14" (PTagesEinsatzzeit Anfang–Ende). */
  shiftLabel: string;
}

interface PatternInfo {
  oid: number;
  name: string;
  color: string;
  shiftLabel: string;
  dayCount: number;
  /** OID der ersten PTagesEinsatzzeit (für Zeiten-Edit), oder null. */
  tezOid: number | null;
  /** Schicht-Anfang in Stunden (erste PTagesEinsatzzeit). */
  anfang: number;
  /** Schicht-Ende in Stunden (erste PTagesEinsatzzeit). */
  ende: number;
}

/** Parst ein deutsches Datum "D.M.YYYY" → Date | null. */
function parseGermanDate(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Deutsche Wochentage (getDay(): 0=So..6=Sa) — kurz + voll.
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAY_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

/**
 * Spalten-Header für Tag N (1-indexed, ab Sim-Start). 1:1 zu OSim2004
 * PEinsatzzeitViewerOGCtrl::OnDrawFrame (Z.418, `ttime.Format("%A\n %d.%m")`):
 * Wochentag + Datum, beginnend beim Startdatum, +1 Tag pro Spalte.
 */
function dayHeader(
  start: Date | null,
  dayNumber: number,
): { weekdayShort: string; weekdayLong: string; date: string } {
  if (!start) {
    return { weekdayShort: `Tag ${dayNumber}`, weekdayLong: `Tag ${dayNumber}`, date: "" };
  }
  const d = new Date(start.getTime());
  d.setDate(d.getDate() + (dayNumber - 1));
  const wd = d.getDay();
  return {
    weekdayShort: WEEKDAY_SHORT[wd],
    weekdayLong: WEEKDAY_LONG[wd],
    date: `${d.getDate()}.${d.getMonth() + 1}.`,
  };
}

/** Formatiert eine Stunden-Zahl (z.B. 6.0 / 14.5) als "6" / "14:30". */
function formatHour(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "");
  const h = Math.floor(value);
  const min = Math.round((value - h) * 60);
  return min === 0 ? String(h) : `${h}:${String(min).padStart(2, "0")}`;
}

/** Schichtfenster eines Musters aus m_lTagesEinsatzzeit als "6–14[, 14–22]". */
function shiftLabelOf(
  pattern: OBaseObj,
  allObjects: Record<number, OBaseObj>,
): string {
  const tezOids = (pattern.attrs.m_lTagesEinsatzzeit as number[] | undefined) ?? [];
  const parts: string[] = [];
  for (const oid of tezOids) {
    const tez = allObjects[oid];
    if (!tez || tez.klass !== "PTagesEinsatzzeit") continue;
    parts.push(
      `${formatHour(tez.attrs.m_iEinsatzAnfang)}–${formatHour(tez.attrs.m_iEinsatzEnde)}`,
    );
  }
  return parts.join(", ");
}

/**
 * Baut den Cell-Index `${ressOid}:${tag}` → CellInfo + die geordnete
 * Muster-Liste. 1:1 dKnotenFill: über sim.m_lEinsatz → PEinsatzzeitTag.
 */
function buildEinsatzIndex(
  sim: OBaseObj,
  allObjects: Record<number, OBaseObj>,
): { cellMap: Map<string, CellInfo>; patterns: PatternInfo[] } {
  const cellMap = new Map<string, CellInfo>();
  const patterns: PatternInfo[] = [];

  const patternOids = (sim.attrs.m_lEinsatz as number[] | undefined) ?? [];
  let idx = 0;
  for (const pOid of patternOids) {
    const pattern = allObjects[pOid];
    if (!pattern || pattern.klass !== "PEinsatzzeitTag") continue;

    const color = PATTERN_PALETTE[idx % PATTERN_PALETTE.length];
    const name =
      (typeof pattern.attrs.m_sName === "string" && pattern.attrs.m_sName) ||
      `Muster #${pattern.oid}`;
    const shiftLabel = shiftLabelOf(pattern, allObjects);

    // Erste PTagesEinsatzzeit (Schichtfenster) für den Zeiten-Edit.
    const tezOids = (pattern.attrs.m_lTagesEinsatzzeit as number[] | undefined) ?? [];
    const firstTez = tezOids
      .map((o) => allObjects[o])
      .find((o) => o?.klass === "PTagesEinsatzzeit");
    const tezOid = firstTez?.oid ?? null;
    const anfang =
      typeof firstTez?.attrs.m_iEinsatzAnfang === "number"
        ? firstTez.attrs.m_iEinsatzAnfang
        : 0;
    const ende =
      typeof firstTez?.attrs.m_iEinsatzEnde === "number"
        ? firstTez.attrs.m_iEinsatzEnde
        : 0;

    const tagRessOids = (pattern.attrs.m_lTagRess as number[] | undefined) ?? [];
    let dayCount = 0;
    for (const trOid of tagRessOids) {
      const tr = allObjects[trOid];
      if (!tr || tr.klass !== "PTagRess") continue;
      const ressOid = tr.attrs.m_oRessBeleg;
      const tag = tr.attrs.m_iTag;
      if (typeof ressOid === "number" && typeof tag === "number") {
        cellMap.set(`${ressOid}:${tag}`, {
          patternOid: pattern.oid,
          tagRessOid: tr.oid,
          patternName: name,
          color,
          shiftLabel,
        });
        dayCount += 1;
      }
    }

    patterns.push({
      oid: pattern.oid,
      name,
      color,
      shiftLabel,
      dayCount,
      tezOid,
      anfang,
      ende,
    });
    idx += 1;
  }

  return { cellMap, patterns };
}

/** Anzahl Tage (Spalten): Enddatum − Startdatum, Fallback = max m_iTag. */
function computeTage(sim: OBaseObj, cellMap: Map<string, CellInfo>): number {
  const start = parseGermanDate(sim.attrs.m_sStartDate);
  const end = parseGermanDate(sim.attrs.m_sEndDate);
  let byDate = 0;
  if (start && end) {
    byDate = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }
  let maxTag = 0;
  for (const key of cellMap.keys()) {
    const tag = Number(key.split(":")[1]);
    if (tag > maxTag) maxTag = tag;
  }
  return Math.max(byDate, maxTag, 1);
}

// ---------------------------------------------------------------------------
// Zelle (interaktiv, 1:1 OnLButtonDown / OnRButtonDown)
// ---------------------------------------------------------------------------

interface EinsatzCellProps {
  rowOid: number;
  day: number;
  value: CellInfo | null;
  disabled: boolean;
  onSet: (rowOid: number, day: number) => void;
  onCycle: (rowOid: number, day: number, cell: CellInfo) => void;
  onDelete: (rowOid: number, day: number, cell: CellInfo) => void;
}

const EinsatzCellImpl: React.FC<EinsatzCellProps> = ({
  rowOid,
  day,
  value,
  disabled,
  onSet,
  onCycle,
  onDelete,
}) => {
  const occupied = value !== null;

  // Linksklick (OnLButtonDown): leer → aktives Muster zuweisen; belegt →
  // zum nächsten Muster zyklen.
  const handleClick = React.useCallback(() => {
    if (disabled) return;
    if (value) onCycle(rowOid, day, value);
    else onSet(rowOid, day);
  }, [disabled, value, onCycle, onSet, rowOid, day]);

  // Rechtsklick (OnRButtonDown): belegt → Zuordnung löschen.
  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled || !value) return;
      onDelete(rowOid, day, value);
    },
    [disabled, value, onDelete, rowOid, day],
  );

  return (
    <div
      data-testid="einsatz-cell"
      data-einsatz-row={rowOid}
      data-einsatz-day={day}
      data-oid={value?.tagRessOid}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={
        occupied
          ? `${value.patternName}${value.shiftLabel ? ` · ${value.shiftLabel} Uhr` : ""} — Linksklick: nächstes Muster, Rechtsklick: löschen`
          : "Linksklick: aktives Muster zuweisen"
      }
      className={cn(
        "flex h-7 w-full select-none items-center justify-center px-1.5",
        !disabled && "cursor-pointer hover:bg-accent",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {occupied && (
        <span
          className={cn(
            "inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium leading-none",
            value.color,
          )}
        >
          {value.shiftLabel || value.patternName}
        </span>
      )}
    </div>
  );
};

const EinsatzCell = React.memo(EinsatzCellImpl);

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

function isSimulatorKlass(klass: string): boolean {
  return klass === "ASimulator" || klass === "PSimulator";
}

export function PEinsatzViewer(props: ViewerProps) {
  const { obj, allObjects, disabled = false } = props;

  // Der Viewer arbeitet immer auf dem Simulator (liest m_lEinsatz /
  // m_lRessBeleg / m_sStartDate). Wird er auf einer einzelnen Schicht
  // (PEinsatzzeitTag aus dem Tree-Knoten "Arbeitszeiten") oder einem
  // Sub-Objekt geöffnet, lösen wir den Simulator aus allObjects auf und
  // setzen die angeklickte Schicht als aktives Muster.
  const sim = React.useMemo<OBaseObj>(() => {
    if (isSimulatorKlass(obj.klass)) return obj;
    const found = Object.values(allObjects).find((o) =>
      isSimulatorKlass(o.klass),
    );
    return found ?? obj;
  }, [obj, allObjects]);
  const clickedPatternOid = obj.klass === "PEinsatzzeitTag" ? obj.oid : null;

  const [revision, setRevision] = React.useState(0);
  const bumpRevision = React.useCallback(() => setRevision((r) => r + 1), []);

  const { cellMap, patterns } = React.useMemo(
    () => buildEinsatzIndex(sim, allObjects),
    // revision triggert Re-Build nach Store-Mutation (allObjects-Identität
    // ändert sich durch immer ebenfalls, revision ist die explizite Quelle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, allObjects, revision],
  );

  const tage = React.useMemo(
    () => computeTage(sim, cellMap),
    [sim, cellMap],
  );
  const startDate = React.useMemo(
    () => parseGermanDate(sim.attrs.m_sStartDate),
    [sim],
  );
  const gesamtWoche = Math.max(1, Math.ceil(tage / DAYS_PER_WEEK));

  // Wochen-Combobox (m_cbWoche). 0 = "Alle Wochen".
  const [aktWoche, setAktWoche] = React.useState<number>(0);

  // Aktives Muster (= GetListCtrl()->GetCurSel()). Default = im Tree
  // angeklickte Schicht, sonst erstes Muster.
  const [activePatternOid, setActivePatternOid] = React.useState<number | null>(
    clickedPatternOid,
  );
  // "State beim Prop-Wechsel anpassen" (React-Pattern statt Effect): wird der
  // Viewer auf eine andere Schicht (Tree-Klick) geöffnet, diese aktiv setzen.
  const [prevClicked, setPrevClicked] = React.useState<number | null>(
    clickedPatternOid,
  );
  if (clickedPatternOid !== prevClicked) {
    setPrevClicked(clickedPatternOid);
    if (clickedPatternOid !== null) setActivePatternOid(clickedPatternOid);
  }
  const effectiveActive =
    activePatternOid !== null &&
    patterns.some((p) => p.oid === activePatternOid)
      ? activePatternOid
      : (patterns[0]?.oid ?? null);

  // Zeilen = Ressourcen (sim.m_lRessBeleg), 1:1 GetAnzahlPerson.
  const rows: OBaseObj[] = React.useMemo(() => {
    const ressOids = (sim.attrs.m_lRessBeleg as number[] | undefined) ?? [];
    return ressOids
      .map((oid) => allObjects[oid])
      .filter((o): o is OBaseObj => o !== undefined);
  }, [sim, allObjects]);

  // Spalten = Tage 1..tage, ggf. auf die aktive Woche gefiltert.
  const cols: number[] = React.useMemo(() => {
    const all = Array.from({ length: tage }, (_, i) => i + 1);
    if (aktWoche === 0) return all;
    return all.filter((d) => Math.ceil(d / DAYS_PER_WEEK) === aktWoche);
  }, [tage, aktWoche]);

  // ----- Mutations-Handler (direkter Store-Dispatch, wie Belegungs-Matrix) ---

  // Helper: aktuelle m_lTagRess-Liste eines Musters aus dem FRISCHEN Store.
  const tagRessList = (patternOid: number): number[] => {
    const fresh = useModelStore.getState().wire?.objects ?? {};
    const p = fresh[patternOid];
    const list = p?.attrs.m_lTagRess;
    return Array.isArray(list) ? (list as number[]) : [];
  };

  // Linksklick leer (OnLButtonDown Fall 1): aktives Muster zuweisen.
  const handleSet = React.useCallback(
    (rowOid: number, day: number) => {
      if (effectiveActive === null) return;
      const store = useModelStore.getState();
      const newOid = store.createObject("PTagRess", {
        m_iTag: day,
        m_oRessBeleg: rowOid,
      });
      const fresh = store.wire?.objects ?? {};
      const cur = Array.isArray(fresh[effectiveActive]?.attrs.m_lTagRess)
        ? (fresh[effectiveActive]!.attrs.m_lTagRess as number[])
        : [];
      store.patchObject(effectiveActive, {
        m_lTagRess: [...cur, newOid] as unknown as AttrValue,
      });
      // ressBeleg.m_lEinsatz = pattern (1:1 C++ Z.954).
      store.patchObject(rowOid, { m_lEinsatz: effectiveActive });
      bumpRevision();
    },
    [effectiveActive, bumpRevision],
  );

  // Linksklick belegt (OnLButtonDown Fall 2): zum nächsten Muster zyklen.
  const handleCycle = React.useCallback(
    (rowOid: number, _day: number, cell: CellInfo) => {
      if (patterns.length < 2) return; // nichts zu zyklen
      const idx = patterns.findIndex((p) => p.oid === cell.patternOid);
      if (idx === -1) return;
      const next = patterns[(idx + 1) % patterns.length];
      const store = useModelStore.getState();
      // aus aktuellem Muster entfernen …
      store.patchObject(cell.patternOid, {
        m_lTagRess: tagRessList(cell.patternOid).filter(
          (o) => o !== cell.tagRessOid,
        ) as unknown as AttrValue,
      });
      // … in nächstes einfügen.
      store.patchObject(next.oid, {
        m_lTagRess: [...tagRessList(next.oid), cell.tagRessOid] as unknown as AttrValue,
      });
      store.patchObject(rowOid, { m_lEinsatz: next.oid });
      bumpRevision();
    },
    [patterns, bumpRevision],
  );

  // Rechtsklick belegt (OnRButtonDown): Zuordnung löschen.
  const handleDelete = React.useCallback(
    (rowOid: number, _day: number, cell: CellInfo) => {
      const store = useModelStore.getState();
      store.patchObject(cell.patternOid, {
        m_lTagRess: tagRessList(cell.patternOid).filter(
          (o) => o !== cell.tagRessOid,
        ) as unknown as AttrValue,
      });
      store.deleteObject(cell.tagRessOid);
      // ressBeleg.m_lEinsatz = ONULL (1:1 C++ Z.1133).
      store.patchObject(rowOid, { m_lEinsatz: null as unknown as AttrValue });
      bumpRevision();
    },
    [bumpRevision],
  );

  // ----- Schicht-Modellierung (1:1 AGruppeViewer.cpp Z.3986-4055) -----------

  // Neue Schicht: PEinsatzzeitTag + PTagesEinsatzzeit, an sim.m_lEinsatz.
  const handleCreateShift = React.useCallback(() => {
    if (disabled) return;
    const store = useModelStore.getState();
    const tezOid = store.createObject("PTagesEinsatzzeit", {
      m_iEinsatzAnfang: 6,
      m_iEinsatzEnde: 14,
    });
    const patternOid = store.createObject("PEinsatzzeitTag", {
      m_sName: "Neue Schicht",
      m_lTagesEinsatzzeit: [tezOid] as unknown as AttrValue,
      m_lTagRess: [] as unknown as AttrValue,
      m_lPausen: [] as unknown as AttrValue,
    });
    const fresh = store.wire?.objects ?? {};
    const cur = Array.isArray(fresh[sim.oid]?.attrs.m_lEinsatz)
      ? (fresh[sim.oid]!.attrs.m_lEinsatz as number[])
      : [];
    store.patchObject(sim.oid, {
      m_lEinsatz: [...cur, patternOid] as unknown as AttrValue,
    });
    setActivePatternOid(patternOid);
    bumpRevision();
  }, [disabled, sim.oid, bumpRevision]);

  // Schicht umbenennen.
  const handleRenameShift = React.useCallback(
    (patternOid: number, name: string) => {
      if (disabled) return;
      useModelStore.getState().patchObject(patternOid, { m_sName: name });
      bumpRevision();
    },
    [disabled, bumpRevision],
  );

  // Schicht-Zeiten (Anfang/Ende der ersten PTagesEinsatzzeit) setzen. Legt
  // eine PTagesEinsatzzeit lazy an, falls die Schicht noch keine hat.
  const handleEditTime = React.useCallback(
    (pattern: PatternInfo, field: "m_iEinsatzAnfang" | "m_iEinsatzEnde", value: number) => {
      if (disabled) return;
      const store = useModelStore.getState();
      if (pattern.tezOid !== null) {
        store.patchObject(pattern.tezOid, { [field]: value });
      } else {
        const tezOid = store.createObject("PTagesEinsatzzeit", {
          m_iEinsatzAnfang: field === "m_iEinsatzAnfang" ? value : 0,
          m_iEinsatzEnde: field === "m_iEinsatzEnde" ? value : 0,
        });
        store.patchObject(pattern.oid, {
          m_lTagesEinsatzzeit: [tezOid] as unknown as AttrValue,
        });
      }
      bumpRevision();
    },
    [disabled, bumpRevision],
  );

  // Schicht löschen: aus sim.m_lEinsatz + Objekt + Owner-Kinder
  // (PTagesEinsatzzeit, PTagRess) löschen (1:1 ezeit.Delete()).
  const handleDeleteShift = React.useCallback(
    (patternOid: number) => {
      if (disabled) return;
      const store = useModelStore.getState();
      const fresh = store.wire?.objects ?? {};
      const pattern = fresh[patternOid];
      // Owner-Kinder einsammeln.
      const childOids = [
        ...((pattern?.attrs.m_lTagesEinsatzzeit as number[] | undefined) ?? []),
        ...((pattern?.attrs.m_lTagRess as number[] | undefined) ?? []),
        ...((pattern?.attrs.m_lPausen as number[] | undefined) ?? []),
      ];
      const cur = Array.isArray(fresh[sim.oid]?.attrs.m_lEinsatz)
        ? (fresh[sim.oid]!.attrs.m_lEinsatz as number[])
        : [];
      store.patchObject(sim.oid, {
        m_lEinsatz: cur.filter((o) => o !== patternOid) as unknown as AttrValue,
      });
      for (const childOid of childOids) store.deleteObject(childOid);
      store.deleteObject(patternOid);
      bumpRevision();
    },
    [disabled, sim.oid, bumpRevision],
  );

  const cellLookup = React.useCallback(
    (row: OBaseObj, day: number): CellInfo | null =>
      cellMap.get(`${row.oid}:${day}`) ?? null,
    [cellMap],
  );

  const renderCell = React.useCallback(
    (row: OBaseObj, day: number, value: CellInfo | null): React.ReactNode => (
      <EinsatzCell
        rowOid={row.oid}
        day={day}
        value={value}
        disabled={disabled}
        onSet={handleSet}
        onCycle={handleCycle}
        onDelete={handleDelete}
      />
    ),
    [disabled, handleSet, handleCycle, handleDelete],
  );

  return (
    <div
      data-viewer="PEinsatzViewer"
      className="flex h-full flex-col bg-background"
    >
      {/* Toolbar: Wochen-Auswahl + Muster-Legende (PEinsatzzeitListBoxLList). */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2" data-testid="einsatz-toolbar">
          <ClockIcon className="h-4 w-4 shrink-0 text-brand-500" />
          <label
            htmlFor="einsatz-combo-woche"
            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Woche
          </label>
          <select
            id="einsatz-combo-woche"
            data-testid="einsatz-combo-woche"
            value={String(aktWoche)}
            onChange={(e) => setAktWoche(Number(e.target.value))}
            className="rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="0">Alle Wochen</option>
            {Array.from({ length: gesamtWoche }, (_, i) => i + 1).map((w) => (
              <option key={w} value={String(w)}>
                Woche {w}
              </option>
            ))}
          </select>
        </div>

        {/* Schicht-Editor (= PEinsatzzeitListBoxLList + Modellierung): pro
            Schicht Auswahl-Pill (aktives Muster) + Name + Von/Bis + Löschen,
            plus "Neue Schicht". 1:1 Datenmodell PEinsatzzeitTag /
            PTagesEinsatzzeit. */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="einsatz-legend"
        >
          {patterns.map((p) => {
            const isActive = p.oid === effectiveActive;
            return (
              <div
                key={p.oid}
                data-testid={`einsatz-shift-${p.oid}`}
                data-active={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1",
                  isActive && "ring-2 ring-primary",
                )}
              >
                {/* Aktiv-Auswahl (Listbox-CurSel) + Farb-Swatch. */}
                <button
                  type="button"
                  data-testid={`einsatz-pattern-${p.oid}`}
                  data-active={isActive ? "true" : undefined}
                  onClick={() => setActivePatternOid(p.oid)}
                  disabled={disabled}
                  title={`${p.dayCount} Tage zugeordnet${isActive ? " · aktiv" : " · als aktiv wählen"}`}
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full border",
                    p.color,
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                  aria-label={`Schicht ${p.name} als aktiv wählen`}
                />
                {/* Name (m_sName). */}
                <input
                  type="text"
                  data-testid={`einsatz-shift-name-${p.oid}`}
                  defaultValue={p.name}
                  disabled={disabled}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.name) handleRenameShift(p.oid, v);
                  }}
                  className="w-24 rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                {/* Von/Bis (PTagesEinsatzzeit m_iEinsatzAnfang/Ende, Stunden). */}
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  data-testid={`einsatz-shift-anfang-${p.oid}`}
                  defaultValue={p.anfang}
                  disabled={disabled}
                  onBlur={(e) =>
                    handleEditTime(p, "m_iEinsatzAnfang", Number(e.target.value))
                  }
                  className="w-12 rounded-[var(--radius-sm)] border border-border bg-background px-1 py-0.5 text-[11px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  title="Schicht-Beginn (Uhr)"
                />
                <span className="text-[10px] text-muted-foreground">–</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  data-testid={`einsatz-shift-ende-${p.oid}`}
                  defaultValue={p.ende}
                  disabled={disabled}
                  onBlur={(e) =>
                    handleEditTime(p, "m_iEinsatzEnde", Number(e.target.value))
                  }
                  className="w-12 rounded-[var(--radius-sm)] border border-border bg-background px-1 py-0.5 text-[11px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  title="Schicht-Ende (Uhr)"
                />
                {/* Löschen. */}
                <button
                  type="button"
                  data-testid={`einsatz-shift-delete-${p.oid}`}
                  onClick={() => handleDeleteShift(p.oid)}
                  disabled={disabled}
                  title="Schicht löschen"
                  aria-label={`Schicht ${p.name} löschen`}
                  className={cn(
                    "ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-surface-500 hover:bg-destructive/10 hover:text-destructive",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {/* Neue Schicht. */}
          <button
            type="button"
            data-testid="einsatz-shift-add"
            onClick={handleCreateShift}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-medium text-surface-600 hover:border-primary hover:text-primary",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Neue Schicht
          </button>
        </div>
      </div>

      {/* Matrix: Ressourcen × Tage. */}
      <div className="flex-1 overflow-auto">
        <MatrixGrid<OBaseObj, number, CellInfo>
          rows={rows}
          cols={cols}
          cellLookup={cellLookup}
          renderCell={renderCell}
          rowKey={(r) => `oid:${r.oid}`}
          colKey={(d) => `tag:${d}`}
          renderColHeader={(d) => {
            const h = dayHeader(startDate, d);
            const wd = new Date((startDate ?? new Date()).getTime());
            wd.setDate(wd.getDate() + (d - 1));
            const isWeekend = startDate && (wd.getDay() === 0 || wd.getDay() === 6);
            return (
              <span
                className={cn(
                  "flex flex-col items-center leading-tight",
                  isWeekend && "text-muted-foreground",
                )}
                title={`${h.weekdayLong} ${h.date} (Tag ${d})`}
              >
                <span className="font-medium">{h.weekdayShort}</span>
                <span className="font-mono text-[10px]">{h.date}</span>
              </span>
            );
          }}
          cornerLabel="Ressource / Wochentag"
          emptyMessage="Keine Einsatzzeiten im Modell"
          revision={revision}
          disabled={disabled}
          colWidth={84}
          rowHeaderWidth={200}
        />
      </div>
    </div>
  );
}
