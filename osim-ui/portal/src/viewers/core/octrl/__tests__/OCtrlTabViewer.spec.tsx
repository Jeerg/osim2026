import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlTabViewer } from "@/viewers/core/octrl/OCtrlTabViewer";

const tabs = [
  { id: "std", label: "Standard", content: <div>Std-Body</div> },
  { id: "design", label: "Design", content: <div>Design-Body</div> },
];

describe("OCtrlTabViewer", () => {
  it("rendert 2 Tab-Trigger mit Labels", () => {
    render(
      <OCtrlTabViewer tabs={tabs} value="std" onChange={() => {}} />,
    );

    expect(screen.getByRole("tab", { name: "Standard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Design" })).toBeInTheDocument();
  });

  it("zeigt initial den aktiven Tab-Body", () => {
    render(
      <OCtrlTabViewer tabs={tabs} value="std" onChange={() => {}} />,
    );

    expect(screen.getByText("Std-Body")).toBeInTheDocument();
  });

  it("ruft onChange mit neuer Tab-ID bei click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <OCtrlTabViewer tabs={tabs} value="std" onChange={onChange} />,
    );

    await user.click(screen.getByRole("tab", { name: "Design" }));

    expect(onChange).toHaveBeenCalledWith("design");
  });

  it("wechselt sichtbaren Body wenn value-prop sich ändert", () => {
    const { rerender } = render(
      <OCtrlTabViewer tabs={tabs} value="std" onChange={() => {}} />,
    );
    expect(screen.getByText("Std-Body")).toBeInTheDocument();

    rerender(
      <OCtrlTabViewer tabs={tabs} value="design" onChange={() => {}} />,
    );

    expect(screen.getByText("Design-Body")).toBeInTheDocument();
  });
});
