/**
 * PEinsatzViewer.spec.tsx — Arbeits-/Einsatzzeiten-Matrix + Interaktion.
 *
 * Layout (OSim2004 PEinsatzViewer::dKnotenFill): Zeilen = Ressourcen, Spalten
 * = Tage, Zellen = Muster (PEinsatzzeitTag) bei (m_oRessBeleg, m_iTag).
 *
 * Interaktion (PEinsatzzeitViewerOGCtrl): Linksklick leer = aktives Muster
 * zuweisen (PTagRess + m_lTagRess), Linksklick belegt = nächstes Muster,
 * Rechtsklick belegt = löschen.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

let nextOid = 9001;
const createObjectMock = vi.fn().mockImplementation(() => nextOid++);
const patchObjectMock = vi.fn();
const deleteObjectMock = vi.fn();

// Der Viewer liest m_lTagRess aus dem frischen Store-Wire — wir spiegeln das
// Fixture-allObjects in wire.objects.
let wireObjects: Record<number, unknown> = {};

vi.mock("@/stores/model-store", () => ({
  useModelStore: {
    getState: () => ({
      createObject: createObjectMock,
      patchObject: patchObjectMock,
      deleteObject: deleteObjectMock,
      wire: { objects: wireObjects },
    }),
  },
}));

import { PEinsatzViewer } from "@/viewers/PEinsatz/PEinsatzViewer";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

const schema: ClassSchema = {
  klass: "ASimulator",
  label_de: "Simulator",
  viewer_hints: ["std", "einsatzzeit"],
  properties: [],
};

function fixture(): { sim: OBaseObj; allObjects: Record<number, OBaseObj> } {
  const sim: OBaseObj = {
    oid: 0,
    klass: "ASimulator",
    attrs: {
      m_lEinsatz: [10, 11],
      m_lRessBeleg: [100, 101],
      m_sStartDate: "1.1.2002",
      m_sEndDate: "8.1.2002", // 7 Tage
    },
    sub_refs: [],
  };
  const pattern1: OBaseObj = {
    oid: 10,
    klass: "PEinsatzzeitTag",
    attrs: { m_sName: "Frueh", m_lTagesEinsatzzeit: [20], m_lTagRess: [30] },
    sub_refs: [],
  };
  const pattern2: OBaseObj = {
    oid: 11,
    klass: "PEinsatzzeitTag",
    attrs: { m_sName: "Spaet", m_lTagesEinsatzzeit: [21], m_lTagRess: [] },
    sub_refs: [],
  };
  const tez1: OBaseObj = {
    oid: 20,
    klass: "PTagesEinsatzzeit",
    attrs: { m_iEinsatzAnfang: 6, m_iEinsatzEnde: 14 },
    sub_refs: [],
  };
  const tez2: OBaseObj = {
    oid: 21,
    klass: "PTagesEinsatzzeit",
    attrs: { m_iEinsatzAnfang: 14, m_iEinsatzEnde: 22 },
    sub_refs: [],
  };
  const tr1: OBaseObj = {
    oid: 30,
    klass: "PTagRess",
    attrs: { m_iTag: 1, m_oRessBeleg: 100 },
    sub_refs: [],
  };
  const m1: OBaseObj = {
    oid: 100,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "M1" },
    sub_refs: [],
  };
  const m2: OBaseObj = {
    oid: 101,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "M2" },
    sub_refs: [],
  };
  return {
    sim,
    allObjects: { 0: sim, 10: pattern1, 11: pattern2, 20: tez1, 21: tez2, 30: tr1, 100: m1, 101: m2 },
  };
}

function renderViewer(disabled = false) {
  const { sim, allObjects } = fixture();
  wireObjects = allObjects;
  render(
    <PEinsatzViewer
      obj={sim}
      schema={schema}
      allObjects={allObjects}
      onChange={vi.fn()}
      onCommand={vi.fn()}
      disabled={disabled}
    />,
  );
}

/** Rendert den Viewer geöffnet auf einem einzelnen Objekt (z.B. einer Schicht). */
function renderViewerOn(objOid: number) {
  const { allObjects } = fixture();
  wireObjects = allObjects;
  render(
    <PEinsatzViewer
      obj={allObjects[objOid]}
      schema={schema}
      allObjects={allObjects}
      onChange={vi.fn()}
      onCommand={vi.fn()}
    />,
  );
}

function cell(rowOid: number, day: number): HTMLElement {
  const el = document.querySelector(
    `[data-testid="einsatz-cell"][data-einsatz-row="${rowOid}"][data-einsatz-day="${day}"]`,
  );
  if (!el) throw new Error(`Zelle (${rowOid},${day}) nicht gefunden`);
  return el as HTMLElement;
}

beforeEach(() => {
  createObjectMock.mockClear();
  patchObjectMock.mockClear();
  deleteObjectMock.mockClear();
  nextOid = 9001;
});

describe("PEinsatzViewer — Layout", () => {
  it("rendert Ressourcen-Zeilen + Wochentag/Datum-Spalten (1:1 %A %d.%m)", () => {
    renderViewer();
    expect(document.querySelector('[data-viewer="PEinsatzViewer"]')).not.toBeNull();
    expect(screen.getByText("M1")).toBeInTheDocument();
    expect(screen.getByText("M2")).toBeInTheDocument();
    // Start 1.1.2002 = Dienstag → Tag 1 zeigt "1.1.", Tag 7 "7.1.".
    expect(screen.getByText("1.1.")).toBeInTheDocument();
    expect(screen.getByText("7.1.")).toBeInTheDocument();
    // Wochentags-Kürzel vorhanden (mind. ein "Di").
    expect(screen.getAllByText("Di").length).toBeGreaterThanOrEqual(1);
  });

  it("zeigt die Schichten als editierbare Zeilen (Name-Felder)", () => {
    renderViewer();
    expect(
      (screen.getByTestId("einsatz-shift-name-10") as HTMLInputElement).value,
    ).toBe("Frueh");
    expect(
      (screen.getByTestId("einsatz-shift-name-11") as HTMLInputElement).value,
    ).toBe("Spaet");
    // Auswahl-Pills + Add-Button vorhanden.
    expect(screen.getByTestId("einsatz-pattern-10")).toBeInTheDocument();
    expect(screen.getByTestId("einsatz-shift-add")).toBeInTheDocument();
  });

  it("paintet die bestehende Zuordnung (M1 Tag 1 = Frueh 6–14)", () => {
    renderViewer();
    expect(within(cell(100, 1)).getByText("6–14")).toBeInTheDocument();
    // M2 Tag 1 leer.
    expect(within(cell(101, 1)).queryByText("6–14")).toBeNull();
  });

  it("bietet eine Wochen-Auswahl (m_cbWoche)", () => {
    renderViewer();
    expect(screen.getByTestId("einsatz-combo-woche")).toBeInTheDocument();
  });

  it("öffnet auf einer Schicht (Tree-Kind): löst Simulator auf + Schicht aktiv", () => {
    renderViewerOn(10); // obj = PEinsatzzeitTag "Frueh"
    // Matrix rendert (Simulator aus allObjects aufgelöst).
    expect(document.querySelector('[data-viewer="PEinsatzViewer"]')).not.toBeNull();
    expect(screen.getByText("M1")).toBeInTheDocument();
    // Die angeklickte Schicht ist aktiv.
    expect(
      screen.getByTestId("einsatz-pattern-10").getAttribute("data-active"),
    ).toBe("true");
  });
});

describe("PEinsatzViewer — Interaktion (1:1 OnLButtonDown/OnRButtonDown)", () => {
  it("Linksklick auf leere Zelle weist das aktive Muster zu (PTagRess + m_lTagRess)", () => {
    renderViewer();
    fireEvent.click(cell(101, 3)); // M2, Tag 3, leer → aktives Muster (Frueh=10)
    expect(createObjectMock).toHaveBeenCalledWith("PTagRess", {
      m_iTag: 3,
      m_oRessBeleg: 101,
    });
    // m_lTagRess des aktiven Musters (10) wird um die neue OID erweitert.
    expect(patchObjectMock).toHaveBeenCalledWith(10, {
      m_lTagRess: [30, 9001],
    });
    // ressBeleg.m_lEinsatz = pattern.
    expect(patchObjectMock).toHaveBeenCalledWith(101, { m_lEinsatz: 10 });
  });

  it("Auswahl eines anderen Musters in der Legende ändert das Paint-Ziel", () => {
    renderViewer();
    fireEvent.click(screen.getByTestId("einsatz-pattern-11")); // Spaet aktiv
    fireEvent.click(cell(101, 2)); // leer → jetzt Muster 11
    expect(patchObjectMock).toHaveBeenCalledWith(11, { m_lTagRess: [9001] });
  });

  it("Rechtsklick auf belegte Zelle löscht die Zuordnung (PTagRess entfernt + gelöscht)", () => {
    renderViewer();
    fireEvent.contextMenu(cell(100, 1)); // M1 Tag 1 = tagRess 30 im Muster 10
    expect(patchObjectMock).toHaveBeenCalledWith(10, { m_lTagRess: [] });
    expect(deleteObjectMock).toHaveBeenCalledWith(30);
    expect(patchObjectMock).toHaveBeenCalledWith(100, { m_lEinsatz: null });
  });

  it("Linksklick auf belegte Zelle zykelt zum nächsten Muster", () => {
    renderViewer();
    fireEvent.click(cell(100, 1)); // belegt (Muster 10) → nächstes (11)
    // aus 10 entfernt …
    expect(patchObjectMock).toHaveBeenCalledWith(10, { m_lTagRess: [] });
    // … in 11 eingefügt (tagRess 30).
    expect(patchObjectMock).toHaveBeenCalledWith(11, { m_lTagRess: [30] });
  });

  it("read-only: kein Edit bei disabled", () => {
    renderViewer(true);
    fireEvent.click(cell(101, 3));
    fireEvent.contextMenu(cell(100, 1));
    expect(createObjectMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("PEinsatzViewer — Schicht-Modellierung (1:1 AGruppeViewer.cpp)", () => {
  it("Neue Schicht legt PEinsatzzeitTag + PTagesEinsatzzeit an + hängt in m_lEinsatz", () => {
    renderViewer();
    fireEvent.click(screen.getByTestId("einsatz-shift-add"));
    // 1. PTagesEinsatzzeit (Default 6–14) → 9001.
    expect(createObjectMock).toHaveBeenCalledWith("PTagesEinsatzzeit", {
      m_iEinsatzAnfang: 6,
      m_iEinsatzEnde: 14,
    });
    // 2. PEinsatzzeitTag mit Name + Tages-Einsatzzeit → 9002.
    expect(createObjectMock).toHaveBeenCalledWith("PEinsatzzeitTag", {
      m_sName: "Neue Schicht",
      m_lTagesEinsatzzeit: [9001],
      m_lTagRess: [],
      m_lPausen: [],
    });
    // 3. sim.m_lEinsatz wird um die neue Schicht erweitert.
    expect(patchObjectMock).toHaveBeenCalledWith(0, {
      m_lEinsatz: [10, 11, 9002],
    });
  });

  it("Schicht umbenennen patcht m_sName", () => {
    renderViewer();
    const nameInput = screen.getByTestId("einsatz-shift-name-10");
    fireEvent.change(nameInput, { target: { value: "Morgen" } });
    fireEvent.blur(nameInput);
    expect(patchObjectMock).toHaveBeenCalledWith(10, { m_sName: "Morgen" });
  });

  it("Schicht-Zeiten patchen m_iEinsatzAnfang/Ende der PTagesEinsatzzeit", () => {
    renderViewer();
    const anfang = screen.getByTestId("einsatz-shift-anfang-10");
    fireEvent.change(anfang, { target: { value: "7" } });
    fireEvent.blur(anfang);
    expect(patchObjectMock).toHaveBeenCalledWith(20, { m_iEinsatzAnfang: 7 });
  });

  it("Schicht löschen entfernt aus m_lEinsatz + löscht Muster + Owner-Kinder", () => {
    renderViewer();
    fireEvent.click(screen.getByTestId("einsatz-shift-delete-10"));
    // aus sim.m_lEinsatz entfernt.
    expect(patchObjectMock).toHaveBeenCalledWith(0, { m_lEinsatz: [11] });
    // Owner-Kinder (PTagesEinsatzzeit 20, PTagRess 30) + Muster 10 gelöscht.
    expect(deleteObjectMock).toHaveBeenCalledWith(20);
    expect(deleteObjectMock).toHaveBeenCalledWith(30);
    expect(deleteObjectMock).toHaveBeenCalledWith(10);
  });
});
