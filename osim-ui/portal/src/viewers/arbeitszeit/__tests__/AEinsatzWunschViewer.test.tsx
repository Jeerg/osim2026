// Plan 01-08 Task 2: Smoke-Tests fuer AEinsatzWunschViewer.
//
// - Registry-Check: Viewer registriert auf AEINSATZWUNSCH_GROUP + AEinsatzWunsch
// - Render mit synthetischem Knoten: 7×24 Matrix
// - Edit einer Zelle auf synth-Knoten → setSyntheticProperty
// - Render mit echtem AEinsatzWunsch-Knoten (mit AEinsatzzeitWunsch-Children)
//   → die richtigen Cells sind angekreuzt (read-only Display der parsed Slots)
// - Schicht-Helpers: isWunschActive, formatHourLabel

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "@/viewers/property/type-maps";
import "../AEinsatzWunschViewer";
import { AEinsatzWunschViewer } from "../AEinsatzWunschViewer";
import {
  SYNTHETIC_AEINSATZWUNSCH_KLASS,
  SYNTHETIC_AEINSATZWUNSCH_OID,
  _clearSyntheticPropsForTests,
  getSyntheticNode,
  getSyntheticProps,
} from "@/viewers/matrix/synthetic-nodes";
import {
  isWunschActive,
  formatHourLabel,
  parseEinsatzWuensche,
} from "../schicht-helpers";

interface Captured {
  prop: Array<{ oid: Oid; key: string; value: PropertyValue }>;
  method: Array<{ oid: Oid; method: string; args?: MethodArg[] }>;
}

function harness(syntheticObj: OtxJsonNode) {
  const cap: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={syntheticObj}
      onPropertyChange={(o, k, v) =>
        cap.prop.push({ oid: o, key: k, value: v })
      }
      onMethodCall={(o, m, a) =>
        cap.method.push({ oid: o, method: m, args: a })
      }
    >
      <AEinsatzWunschViewer
        obj={syntheticObj}
        onPropertyChange={(o, k, v) =>
          cap.prop.push({ oid: o, key: k, value: v })
        }
        onMethodCall={(o, m, a) =>
          cap.method.push({ oid: o, method: m, args: a })
        }
      />
    </ChildDialog>,
  );
  return cap;
}

afterEach(() => {
  cleanup();
  _clearSyntheticPropsForTests();
});

describe("schicht-helpers", () => {
  it("formatHourLabel padded", () => {
    expect(formatHourLabel(0)).toBe("00:00");
    expect(formatHourLabel(9)).toBe("09:00");
    expect(formatHourLabel(13)).toBe("13:00");
  });

  it("isWunschActive matched intervals correctly", () => {
    const slots = [
      { weekday: 0, startSec: 8 * 3600, endSec: 12 * 3600 }, // Mo 08:00-12:00
      { weekday: 2, startSec: 14 * 3600, endSec: 18 * 3600 }, // Mi 14:00-18:00
    ];
    // Mo 9 Uhr → aktiv
    expect(isWunschActive(slots, 0, 9)).toBe(true);
    // Mo 12 Uhr → grenze offen rechts → inaktiv
    expect(isWunschActive(slots, 0, 12)).toBe(false);
    // Mo 7 Uhr → inaktiv
    expect(isWunschActive(slots, 0, 7)).toBe(false);
    // Mi 15 Uhr → aktiv
    expect(isWunschActive(slots, 2, 15)).toBe(true);
    // Di 15 Uhr → inaktiv (anderer Tag)
    expect(isWunschActive(slots, 1, 15)).toBe(false);
  });

  it("parseEinsatzWuensche aus AEinsatzzeitWunsch-Sub-Nodes", () => {
    const node: OtxJsonNode = {
      oid: 1,
      klass: "AEinsatzWunsch",
      name: "Wunsch-A",
      properties: {},
      children: [
        {
          oid: 2,
          klass: "AEinsatzzeitWunsch",
          name: "Mo-Frueh",
          properties: { m_iWochentag: 0, m_iVon: 28800, m_iBis: 43200 },
          children: [],
        },
        {
          oid: 3,
          klass: "AEinsatzzeitWunsch",
          name: "Di-Spaet",
          properties: { m_iWochentag: 1, m_iVon: 50400, m_iBis: 64800 },
          children: [],
        },
      ],
    };
    const slots = parseEinsatzWuensche(node);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual({
      weekday: 0,
      startSec: 28800,
      endSec: 43200,
      oid: 2,
    });
  });
});

describe("AEinsatzWunschViewer", () => {
  it("ist unter AEINSATZWUNSCH_GROUP in der viewer-registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer(SYNTHETIC_AEINSATZWUNSCH_KLASS)).toBe(
      AEinsatzWunschViewer,
    );
  });

  it("ist auch unter der echten Klasse AEinsatzWunsch registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer("AEinsatzWunsch")).toBe(AEinsatzWunschViewer);
  });

  it("rendert 7×24 Matrix (Wochentage × Stunden) auf synthetischem Knoten", () => {
    const synth = getSyntheticNode(SYNTHETIC_AEINSATZWUNSCH_OID)!;
    harness(synth);
    expect(screen.getByTestId("aeinsatz-wunsch-matrix")).toBeInTheDocument();
    // Header-Stunde 08:00 vorhanden
    expect(
      screen.getByTestId("aeinsatz-wunsch-matrix-row-header-h:8"),
    ).toHaveTextContent("08:00");
    // Wochentag-Spalten
    expect(
      screen.getByTestId("aeinsatz-wunsch-matrix-col-header-wd:0"),
    ).toHaveTextContent("Mo");
    expect(
      screen.getByTestId("aeinsatz-wunsch-matrix-col-header-wd:6"),
    ).toHaveTextContent("So");
    // Eine Zelle (Mo 8 Uhr) — initial uncheckt
    const cell = screen.getByTestId(
      "aeinsatz-wunsch-matrix-cell-h:8-wd:0",
    ) as HTMLInputElement;
    expect(cell.type).toBe("checkbox");
    expect(cell.checked).toBe(false);
    expect(cell.disabled).toBe(false); // editable auf synth-Knoten
  });

  it("Edit einer Zelle (synth) schreibt in den synth-property-store", () => {
    const synth = getSyntheticNode(SYNTHETIC_AEINSATZWUNSCH_OID)!;
    harness(synth);
    const cell = screen.getByTestId(
      "aeinsatz-wunsch-matrix-cell-h:8-wd:1",
    ) as HTMLInputElement;
    fireEvent.click(cell);
    const props = getSyntheticProps(SYNTHETIC_AEINSATZWUNSCH_OID);
    expect(props.m_aWunschGrid).toEqual({ "1:8": true });
  });

  it("rendert echte AEinsatzzeitWunsch-Slots als angekreuzte Cells", () => {
    const realObj: OtxJsonNode = {
      oid: 500,
      klass: "AEinsatzWunsch",
      name: "Wunsch-Hans",
      properties: {},
      children: [
        {
          oid: 501,
          klass: "AEinsatzzeitWunsch",
          name: "Mo-Vormittag",
          properties: { m_iWochentag: 0, m_iVon: 8 * 3600, m_iBis: 12 * 3600 },
          children: [],
        },
      ],
    };
    harness(realObj);
    // Mo 09:00 ist aktiv (im Intervall 08-12)
    const activeCell = screen.getByTestId(
      "aeinsatz-wunsch-matrix-cell-h:9-wd:0",
    ) as HTMLInputElement;
    expect(activeCell.checked).toBe(true);
    // Mo 13:00 ist NICHT aktiv
    const inactiveCell = screen.getByTestId(
      "aeinsatz-wunsch-matrix-cell-h:13-wd:0",
    ) as HTMLInputElement;
    expect(inactiveCell.checked).toBe(false);
  });
});

import React from "react";
void React;
