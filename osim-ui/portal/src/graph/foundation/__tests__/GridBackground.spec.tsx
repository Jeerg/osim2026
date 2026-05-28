/**
 * GridBackground — Welle G3: Raster sichtbar machen.
 *
 * Vertrag:
 * 1. Leeres Grid → kein SVG, kein Crash.
 * 2. Gefülltes Grid → SVG mit N Spalten-Linien (Start+End) und M Zeilen-Linien.
 * 3. Linien-Positionen entsprechen pColHead.m_StartPos / pRowHead.m_StartPos.
 *
 * @xyflow/react.ViewportPortal ist als Pass-Through gemockt — wir testen
 * nur die SVG-Logik, nicht die Viewport-Projection.
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({
  ViewportPortal: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="vp-portal">{children}</div>
  ),
}));

import { GridBackground } from "@/graph/foundation/GridBackground";
import { OGraphGrid } from "@/graph/foundation/OGraphGrid";
import { GObjLink } from "@/graph/foundation/GObjLink";

function mkNode(id: string): GObjLink {
  const o = new GObjLink();
  o.SetViewedObject(id);
  o.SetText(id);
  return o;
}

describe("GridBackground Welle G3", () => {
  it("rendert nichts bei leerem Grid", () => {
    const grid = new OGraphGrid();
    const { container } = render(<GridBackground grid={grid} />);
    expect(container.querySelector('[data-testid="grid-background"]')).toBeNull();
  });

  it("rendert SVG mit Spalten- und Zeilen-Linien für gefülltes Grid", () => {
    const grid = new OGraphGrid();
    grid.GOIns(mkNode("A"), 0, 0, false);
    grid.GOIns(mkNode("B"), 1, 0, false);
    grid.GOIns(mkNode("C"), 0, 1, false);

    const { container } = render(<GridBackground grid={grid} />);
    const svg = container.querySelector('[data-testid="grid-background"]');
    expect(svg).not.toBeNull();

    // Welle G21: 3D-Win32-Effekt 1:1 zum OSim2004-_DrawGrid.
    // Pro Spalte: 1 Shadow-Linie (StartPos) + 1 Highlight-Linie (EndPos).
    // Pro Zeile: analog.
    // 2 Spalten × 2 Linien = 4 Spalten-Linien
    // 2 Zeilen × 2 Linien = 4 Zeilen-Linien
    // = 8 <line>-Elemente total. Plus 1 <rect> für den Grenzrahmen.
    const lines = svg!.querySelectorAll("line");
    expect(lines.length).toBe(8);
    const borderRect = svg!.querySelector("rect");
    expect(borderRect).not.toBeNull();
  });

  it("respektiert custom shadow/highlight/border-Farben und strokeWidth", () => {
    const grid = new OGraphGrid();
    grid.GOIns(mkNode("A"), 0, 0, false);

    const { container } = render(
      <GridBackground
        grid={grid}
        shadowStroke="#ff0000"
        highlightStroke="#00ff00"
        borderStroke="#0000ff"
        strokeWidth={2}
      />,
    );
    const svg = container.querySelector('[data-testid="grid-background"]');
    expect(svg).not.toBeNull();
    // Erste 2 Linien: vertikale Shadow + Highlight (m_GColList-Iteration).
    const lines = svg!.querySelectorAll("line");
    expect(lines[0].getAttribute("stroke")).toBe("#ff0000");
    expect(lines[0].getAttribute("stroke-width")).toBe("2");
    expect(lines[1].getAttribute("stroke")).toBe("#00ff00");
    const borderRect = svg!.querySelector("rect");
    expect(borderRect!.getAttribute("stroke")).toBe("#0000ff");
  });
});
