// Plan 01-08 Task 2: AEinsatzWunschViewer.
//
// Schicht-Editor: Wunsch-Praeferenz pro Person/Gruppe ueber die Woche.
// Layout: 7 Spalten (Wochentage Mo..So) × 24 Zeilen (Stunden 0..23),
// Cells = boolean (Wunsch-Block aktiv ja/nein).
//
// Portierung von AEinsatzWunschViewer.h (C++): das Original ist deutlich
// reichhaltiger (Gantt-aehnliche horizontale Zeitachse mit Drag-bar-
// Schicht-Bloecken, Wochen-Selektor m_cbWoche, OEFunktionCtrl). Phase 1
// macht eine pragmatische Wochen-Stunden-Tabelle (siehe Plan 01-08
// PLAN.md decisions: Schicht-Layout-Pragmatismus); Gantt-Optik in
// spaeterer Phase.
//
// Reuse MatrixGrid + schicht-helpers.
//
// Registrierung:
//   - synthetische Folder-Klasse "AEINSATZWUNSCH_GROUP" (Sidebar-Eintrag,
//     read-only Demo wenn das Backend keinen AEinsatzWunsch-Knoten liefert)
//   - echte Klasse "AEinsatzWunsch" (last-wins ueber die Registry, sobald
//     der Backend-Tree solche Knoten liefert).

import { useMemo, useCallback } from "react";
import { MatrixGrid } from "@/viewers/matrix/MatrixGrid";
import {
  WEEKDAYS,
  WEEKDAY_INDICES,
  HOURS_OF_DAY,
  formatHourLabel,
  parseEinsatzWuensche,
  isWunschActive,
  type EinsatzWunschSlot,
} from "./schicht-helpers";
import {
  SYNTHETIC_AEINSATZWUNSCH_KLASS,
  SYNTHETIC_AEINSATZWUNSCH_OID,
  setSyntheticProperty,
} from "@/viewers/matrix/synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import type { ChildDialogComponent } from "@/viewers/core/types";

/**
 * Phase-1-Storage fuer Wunsch-Cell-Edits (analog Matrix-Viewer Plan 01-06):
 *   Property "m_aWunschGrid" als Record<"weekday:hour", true> auf dem obj.
 *
 * - Wenn obj NICHT synthetisch ist (echter AEinsatzWunsch-Knoten aus dem
 *   Tree), wird der Edit-Pfad spaeter (Plan 09) auf echte
 *   AEinsatzzeitWunsch-Sub-Nodes geroutet — Phase 1 macht dort einen
 *   No-Op mit Warning.
 * - Wenn obj synthetisch ist, geht's in den modul-lokalen synth-Store.
 */
const PROPERTY_KEY = "m_aWunschGrid";

type WunschGrid = Record<string, true>;

function wunschKey(weekday: number, hour: number): string {
  return `${weekday}:${hour}`;
}

export const AEinsatzWunschViewer: ChildDialogComponent = ({ obj }) => {
  // Lese Wunsch-Slots: bei einem echten AEinsatzWunsch-Knoten aus dem
  // Tree liefert parseEinsatzWuensche die AEinsatzzeitWunsch-Sub-Nodes.
  // Bei einem synthetischen Knoten ist children leer → slots leer →
  // Tabelle ist initial leer.
  const slots: EinsatzWunschSlot[] = useMemo(
    () => parseEinsatzWuensche(obj),
    [obj],
  );

  // Phase-1-Cell-Edit-Storage (synthetisch).
  const storedGrid = (obj.properties[PROPERTY_KEY] ?? null) as WunschGrid | null;
  const wunschGrid: WunschGrid = useMemo(() => storedGrid ?? {}, [storedGrid]);

  const isSynthetic = obj.klass === SYNTHETIC_AEINSATZWUNSCH_KLASS;

  const getCellValue = useCallback(
    (weekday: number, hour: number): boolean => {
      // Read-Pfad: echte AEinsatzzeitWunsch-Sub-Nodes haben Vorrang;
      // synthetischer Edit-Store als Overlay.
      if (isWunschActive(slots, weekday, hour)) return true;
      return Boolean(wunschGrid[wunschKey(weekday, hour)]);
    },
    [slots, wunschGrid],
  );

  const onCellChange = useCallback(
    (weekday: number, hour: number, value: boolean) => {
      if (!isSynthetic) {
        console.warn(
          `[AEinsatzWunschViewer] Edit-Operation auf echtem AEinsatzWunsch-` +
            `Knoten (oid=${obj.oid}) noch nicht verdrahtet (Plan 09). ` +
            `Edit (weekday=${weekday}, hour=${hour}, value=${value}) ignoriert.`,
        );
        return;
      }
      const k = wunschKey(weekday, hour);
      const next: WunschGrid = { ...wunschGrid };
      if (value) {
        next[k] = true;
      } else {
        delete next[k];
      }
      setSyntheticProperty(obj.oid, PROPERTY_KEY, next);
    },
    [isSynthetic, obj.oid, wunschGrid],
  );

  return (
    <div className="p-6" data-testid="aeinsatz-wunsch-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Einsatz-Wunsch{!isSynthetic && obj.name ? `: ${obj.name}` : ""}
        </h2>
        <p className="text-xs text-gray-500">
          Wochen-Stunden-Raster (Mo..So × 0..23 Uhr). Checkbox = Wunsch
          in dieser Stunde aktiv.
        </p>
      </header>

      <MatrixGrid<number, number, boolean>
        rows={HOURS_OF_DAY}
        columns={WEEKDAY_INDICES}
        rowHeader={(h) => formatHourLabel(h)}
        colHeader={(d) => WEEKDAYS[d] ?? String(d)}
        rowKey={(h) => `h:${h}`}
        colKey={(d) => `wd:${d}`}
        getCellValue={(h, d) => getCellValue(d, h)}
        onCellChange={(h, d, v) => onCellChange(d, h, v)}
        testId="aeinsatz-wunsch-matrix"
        ariaLabel="Einsatz-Wunsch-Wochenraster"
      />

      <p
        className="mt-3 text-xs text-gray-500"
        data-testid="aeinsatz-wunsch-note"
      >
        Phase-1-Pragmatismus: einfaches Wochen-Stunden-Raster ohne
        Range-Coalescing (eine Stunde = ein Schalter). Komplexere
        Schicht-Modelle (PEinsatzzeit-Listen, AGruppe-Schicht-Pool)
        kommen in einer spaeteren Phase.
      </p>
    </div>
  );
};

AEinsatzWunschViewer.displayName = "AEinsatzWunschViewer";

// Registrierung sowohl auf der synthetischen Folder-Klasse als auch auf
// der echten OSim-Klasse. Bei doppelter Registrierung gewinnt die letzte
// (last-wins, viewer-registry-Konvention) — beide Mountpoints zeigen
// denselben Viewer.
registerViewer({
  klass: SYNTHETIC_AEINSATZWUNSCH_KLASS,
  component: AEinsatzWunschViewer,
  displayName: "Einsatz-Wunsch",
});

registerViewer({
  klass: "AEinsatzWunsch",
  component: AEinsatzWunschViewer,
  displayName: "Einsatz-Wunsch",
});

export { SYNTHETIC_AEINSATZWUNSCH_OID };
