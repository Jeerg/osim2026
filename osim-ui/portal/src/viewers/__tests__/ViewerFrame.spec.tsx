/**
 * ViewerFrame.spec.tsx — Toolbar-„+"-Verhalten (P1-Regression).
 *
 * Bug (Handoff 2026-05-27): der „+"-Knopf sendete `objKlass: ""` → der
 * onCommand-Handler in $id.tsx konnte mit leerem Klass nichts anlegen (no-op).
 *
 * Original-Vertrag (OSim2004 `OViewerFrameDlgLList::OnLstAppendObj`):
 * ein neues Objekt wird in der Klasse der gerade betrachteten LList angelegt
 * (`m_pLList->GetClassID()` → `pMeta->New`). In osim-ui ist der Listen-Kontext
 * die Klasse des aktuell angezeigten Objekts. Ohne Selektion fehlt der Kontext
 * → „+" inaktiv.
 *
 * Die ViewerRegistry wird gemockt (resolve → undefined), damit ViewerFrame den
 * EmptyState rendert und nur die Toolbar unter Test steht — unabhängig davon,
 * welcher konkrete Viewer für eine Klasse registriert ist.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/viewers/core/ViewerRegistry", () => ({
  viewerRegistry: { resolve: () => undefined },
}));

import { ViewerFrame } from "@/viewers/core/ViewerFrame";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

const schema: ClassSchema = {
  klass: "PBetriebsmittel",
  label_de: "Betriebsmittel",
  viewer_hints: ["std"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
  ],
};

const beleg: OBaseObj = {
  oid: 42,
  klass: "PBetriebsmittel",
  attrs: { m_sName: "Drehmaschine" },
  sub_refs: [],
};

function renderFrame(props: Partial<React.ComponentProps<typeof ViewerFrame>>) {
  const onCommand = vi.fn();
  render(
    <TooltipProvider>
      <ViewerFrame
        selection={null}
        objects={{ 42: beleg }}
        getSchemaFor={() => schema}
        onPatch={vi.fn()}
        onCommand={onCommand}
        {...props}
      />
    </TooltipProvider>,
  );
  return { onCommand };
}

describe("ViewerFrame Toolbar — Neues Objekt anlegen", () => {
  it("sendet create mit der Klasse des aktuell angezeigten Objekts (nicht leer)", () => {
    const { onCommand } = renderFrame({ selection: 42 });
    const btn = screen.getByRole("button", {
      name: /Neues Objekt anlegen \(PBetriebsmittel\)/,
    });
    expect(btn).toBeEnabled();
    btn.click();
    expect(onCommand).toHaveBeenCalledWith({
      type: "create",
      objKlass: "PBetriebsmittel",
    });
  });

  it("deaktiviert „+\" ohne Selektion (kein Listen-Kontext)", () => {
    renderFrame({ selection: null });
    const btn = screen.getByRole("button", { name: /Neues Objekt anlegen/ });
    expect(btn).toBeDisabled();
  });
});
