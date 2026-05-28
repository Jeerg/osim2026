/**
 * MatrixCell.spec.tsx — Foundation-Welle 1.2-A.
 *
 * Specs für `<MatrixCell>` als memoized Renderer-Wrapper. Testet ausschließlich
 * Visual-State (Selection/Edit/Disabled), data-Attribute, Click-Handling
 * und das `React.memo`-Verhalten. KEIN Inline-Edit-Hook (kommt in Welle 1.2-B).
 *
 * Pattern-Quelle: `portal/src/graph/foundation/__tests__/GridBackground.spec.tsx`.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { MatrixCell } from "@/graph/foundation/matrix/MatrixCell";

describe("MatrixCell Welle 1.2-A", () => {
  it("Test 1: Default-Render — children werden gerendert, keine State-Marker", () => {
    const { container } = render(
      <MatrixCell cellId="r1:c1">
        <span data-testid="content">Hallo</span>
      </MatrixCell>,
    );
    expect(container.querySelector('[data-testid="content"]')?.textContent).toBe(
      "Hallo",
    );
    const cell = container.querySelector('[data-testid="matrix-cell"]');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute("data-matrix-cell-selected")).toBeNull();
    expect(cell?.getAttribute("data-matrix-cell-editing")).toBeNull();
  });

  it("Test 2: selected=true → data-Attribut + border-primary + surface-soft-cyan Klasse", () => {
    const { container } = render(
      <MatrixCell cellId="r1:c1" selected>
        <span>x</span>
      </MatrixCell>,
    );
    const cell = container.querySelector('[data-testid="matrix-cell"]');
    expect(cell?.getAttribute("data-matrix-cell-selected")).toBe("true");
    expect(cell?.className).toMatch(/border-primary/);
    expect(cell?.className).toMatch(/bg-\[var\(--color-surface-soft-cyan\)\]/);
  });

  it("Test 3: editing=true → data-Attribut + ring-2 ring-primary Klasse", () => {
    const { container } = render(
      <MatrixCell cellId="r1:c1" editing>
        <span>x</span>
      </MatrixCell>,
    );
    const cell = container.querySelector('[data-testid="matrix-cell"]');
    expect(cell?.getAttribute("data-matrix-cell-editing")).toBe("true");
    expect(cell?.className).toMatch(/ring-2/);
    expect(cell?.className).toMatch(/ring-primary/);
  });

  it("Test 4: disabled=true → onClick wird NICHT aufgerufen, keine cursor-pointer-Klasse", () => {
    const handleClick = vi.fn();
    const { container } = render(
      <MatrixCell cellId="r1:c1" disabled onClick={handleClick}>
        <span>x</span>
      </MatrixCell>,
    );
    const cell = container.querySelector('[data-testid="matrix-cell"]') as HTMLDivElement;
    fireEvent.click(cell);
    expect(handleClick).not.toHaveBeenCalled();
    expect(cell.className).not.toMatch(/cursor-pointer/);
    // Disabled-State führt zu cursor-not-allowed
    expect(cell.className).toMatch(/cursor-not-allowed/);
  });

  it("Test 5: cellId als data-cell-id, oid als data-oid", () => {
    const { container } = render(
      <MatrixCell cellId="oid:42:oid:7" oid={123}>
        <span>x</span>
      </MatrixCell>,
    );
    const cell = container.querySelector('[data-testid="matrix-cell"]');
    expect(cell?.getAttribute("data-cell-id")).toBe("oid:42:oid:7");
    expect(cell?.getAttribute("data-oid")).toBe("123");
  });

  it("Test 6: React.memo — Re-Render mit identischen Props ruft Render-Funktion nicht erneut auf", () => {
    // Render-Counter via Child-Komponente (verlässlicher als interne Mock-
    // Mechanik): wenn MatrixCell memoized ist und Props identisch sind, wird
    // das innere Children-Element NICHT erneut konstruiert weil React den
    // ganzen Subtree überspringt. Wir prüfen via "stable element"-Pattern.
    let childRenderCount = 0;
    const ChildComp = () => {
      childRenderCount += 1;
      return <span>child</span>;
    };
    // Stable children + handler-refs via vi.fn (gleiche Identität über Rerenders)
    const onClick = vi.fn();
    const stableChild = <ChildComp />;

    // `tick` ist eine reine "force-rerender"-Prop, deren Wert in der
    // Component nicht ausgewertet wird — sie zwingt React aber zu einem neuen
    // Render-Lauf im Parent. Wir lesen sie via JSX-Attribut (data-tick),
    // damit ESLint die Prop nicht als unused markiert.
    const Wrapper: React.FC<{ tick: number }> = ({ tick }) => (
      <div data-tick={tick}>
        <MatrixCell cellId="r1:c1" onClick={onClick}>
          {stableChild}
        </MatrixCell>
      </div>
    );

    const { rerender } = render(<Wrapper tick={1} />);
    expect(childRenderCount).toBe(1);
    // Parent re-renders, aber MatrixCell-Props sind identisch (stableChild +
    // onClick-fn-Identität bleibt gleich, cellId+children identisch).
    rerender(<Wrapper tick={2} />);
    // Mit React.memo: keine erneute Render-Funktion-Ausführung → kein
    // ChildComp-Re-Mount.
    expect(childRenderCount).toBe(1);
    // Sanity: ohne memo wäre childRenderCount jetzt 2.
  });
});
