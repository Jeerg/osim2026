// Plan 01-08 Task 2: AKapBedViewer.
//
// Kapazitaetsbedarf-Sicht: zeigt fuer eine Person/Gruppe die benoetigte vs
// verfuegbare Kapazitaet pro Periode. Phase 1: rein read-only — die
// Kapazitaetsbedarfs-Werte entstehen rechnerisch im Simulator-Lauf
// (siehe AKapBedViewer.h Algorithmen-Block: BelegeKapazitaetsfeld,
// AbgleichMinMaxAZeit, etc.). Phase 1 zeigt sie als Tabelle an, ohne
// eigene Berechnung.
//
// Layout: einfache Tabelle Periode × {Bedarf, Verfuegbar, Delta},
// Color-Coding rot wenn Bedarf > Verfuegbar.
//
// Wenn obj synthetisch ist (kein echter AKapBed-Knoten geladen), zeigt
// der Viewer einen Empty-State mit Hinweis: "Kapazitaetsbedarf wird im
// Simulator-Lauf berechnet (Phase 2+)."
//
// Registrierung:
//   - synthetische Klasse "AKAPBED_GROUP" (Sidebar-Eintrag)
//   - echte Klasse "AKapBed" (last-wins, sobald Backend AKapBed liefert)

import { useMemo } from "react";
import { SYNTHETIC_AKAPBED_KLASS, SYNTHETIC_AKAPBED_OID } from "@/viewers/matrix/synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

/**
 * Periode-Eintrag fuer die Anzeige.
 * In Phase 1 erwarten wir, dass AKapBed im JSON-Tree Child-Knoten der
 * Klasse "ATagPerson" o.ae. hat. Wenn nicht, ist `rows` leer.
 */
interface PeriodEntry {
  oid: number;
  label: string;
  periode: number;
  bedarf: number;
  verfuegbar: number;
}

function parsePeriods(node: OtxJsonNode): PeriodEntry[] {
  const out: PeriodEntry[] = [];
  const stack: OtxJsonNode[] = [...node.children];
  while (stack.length > 0) {
    const n = stack.shift()!;
    if (n.klass === "ATagPerson" || n.klass === "AKapBed") {
      const periode =
        typeof n.properties.m_iPeriode === "number"
          ? (n.properties.m_iPeriode as number)
          : typeof n.properties.m_iTag === "number"
            ? (n.properties.m_iTag as number)
            : 0;
      const bedarf =
        typeof n.properties.m_fBedarf === "number"
          ? (n.properties.m_fBedarf as number)
          : 0;
      const verfuegbar =
        typeof n.properties.m_fVerfuegbar === "number"
          ? (n.properties.m_fVerfuegbar as number)
          : typeof n.properties.m_fStunden === "number"
            ? (n.properties.m_fStunden as number)
            : 0;
      out.push({
        oid: n.oid,
        label: n.name || `Periode ${periode}`,
        periode,
        bedarf,
        verfuegbar,
      });
    }
    for (const c of n.children) stack.push(c);
  }
  // Sortiert nach Periode.
  out.sort((a, b) => a.periode - b.periode);
  return out;
}

export const AKapBedViewer: ChildDialogComponent = ({ obj }) => {
  const rows = useMemo<PeriodEntry[]>(() => parsePeriods(obj), [obj]);

  const isSynthetic = obj.klass === SYNTHETIC_AKAPBED_KLASS;

  return (
    <div className="p-6" data-testid="akapbed-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Kapazitaetsbedarf{!isSynthetic && obj.name ? `: ${obj.name}` : ""}
        </h2>
        <p className="text-xs text-gray-500">
          Read-only Sicht — Bedarfs- und Verfuegbarkeits-Werte je Periode.
        </p>
      </header>

      <div
        className="mb-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
        data-testid="akapbed-info-banner"
      >
        Kapazitaetsbedarf wird rechnerisch aus dem Modell ermittelt und
        regulaer beim Simulator-Lauf befuellt. Phase 1 zeigt diese Sicht
        ausschliesslich read-only — Live-Berechnung kommt mit dem
        Simulator-Roundtrip in einer spaeteren Phase.
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded border border-gray-200 bg-gray-50 p-4 text-sm italic text-gray-500"
          data-testid="akapbed-empty"
        >
          Noch keine Kapazitaetsbedarf-Daten vorhanden. Werte werden vom
          Simulator erzeugt (ATagPerson- / AKapBed-Sub-Knoten unter der
          Gruppe).
        </div>
      ) : (
        <div
          className="overflow-auto rounded border border-gray-200"
          data-testid="akapbed-table"
        >
          <table className="w-full border-collapse text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b border-r border-gray-200 px-2 py-1 text-left font-medium text-gray-700">
                  Periode
                </th>
                <th className="border-b border-r border-gray-200 px-2 py-1 text-right font-medium text-gray-700">
                  Bedarf (h)
                </th>
                <th className="border-b border-r border-gray-200 px-2 py-1 text-right font-medium text-gray-700">
                  Verfuegbar (h)
                </th>
                <th className="border-b border-gray-200 px-2 py-1 text-right font-medium text-gray-700">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const delta = r.verfuegbar - r.bedarf;
                const deficit = delta < 0;
                return (
                  <tr
                    key={r.oid}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    data-testid={`akapbed-row-${r.oid}`}
                  >
                    <td className="border-b border-r border-gray-200 px-2 py-1 text-gray-800">
                      {r.label}
                    </td>
                    <td className="border-b border-r border-gray-200 px-2 py-1 text-right text-gray-800">
                      {r.bedarf.toFixed(1)}
                    </td>
                    <td className="border-b border-r border-gray-200 px-2 py-1 text-right text-gray-800">
                      {r.verfuegbar.toFixed(1)}
                    </td>
                    <td
                      className={`border-b border-gray-200 px-2 py-1 text-right font-medium ${
                        deficit ? "text-red-700" : "text-green-700"
                      }`}
                      data-testid={`akapbed-row-${r.oid}-delta`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

AKapBedViewer.displayName = "AKapBedViewer";

// Registrierung auf synthetischer Folder-Klasse und echter Klasse.
registerViewer({
  klass: SYNTHETIC_AKAPBED_KLASS,
  component: AKapBedViewer,
  displayName: "Kapazitaetsbedarf",
});

registerViewer({
  klass: "AKapBed",
  component: AKapBedViewer,
  displayName: "Kapazitaetsbedarf",
});

export { SYNTHETIC_AKAPBED_OID };
