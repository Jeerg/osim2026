import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlMethod } from "@/viewers/core/octrl/OCtrlMethod";
import type { PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "reset",
  label_de: "Zurücksetzen",
  octrl_type: "Method",
};

describe("OCtrlMethod", () => {
  it("rendert Button mit label_de und data-octrl-id", () => {
    render(<OCtrlMethod schema={schema} />);

    const button = screen.getByRole("button", { name: "Zurücksetzen" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-octrl-id", "reset");
  });

  it("ruft onClick-Callback wenn click", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<OCtrlMethod schema={schema} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Zurücksetzen" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ist disabled wenn disabled-prop gesetzt", () => {
    render(<OCtrlMethod schema={schema} disabled />);

    expect(screen.getByRole("button", { name: "Zurücksetzen" })).toBeDisabled();
  });

  it("ruft ohne onClick nichts auf und warned in der console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<OCtrlMethod schema={schema} />);

    await user.click(screen.getByRole("button", { name: "Zurücksetzen" }));

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
