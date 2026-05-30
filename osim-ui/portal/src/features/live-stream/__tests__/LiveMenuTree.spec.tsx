/**
 * Tests für LiveMenuTree + LIVE_MENU (LIVE-LAYOUT-SPEC).
 *
 * Prüft die PSim-treue Struktur der /live-Navigation:
 *  - Zwei Gruppen: Simulation (Grafik-Modi) + Auswertung (KPI-Viewer).
 *  - Default-Blatt = Simulation → Belegung (NICHT Durchlaufplan-Gantt).
 *  - Durchlaufplan/Einsatzzeit erscheinen NICHT im Menü.
 *  - Auswahl-Callback liefert die Blatt-id.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LiveMenuTree } from "../components/LiveMenuTree";
import {
  LIVE_MENU,
  DEFAULT_MENU_LEAF_ID,
  liveMenuLeafById,
} from "../viewer-config";

describe("LIVE_MENU (Struktur)", () => {
  it("hat genau zwei Gruppen: Simulation + Auswertung", () => {
    expect(LIVE_MENU.map((g) => g.id)).toEqual(["simulation", "auswertung"]);
  });

  it("Default-Blatt ist Simulation → Belegung (Grafik, nicht Gantt)", () => {
    expect(DEFAULT_MENU_LEAF_ID).toBe("grafik-belegung");
    const leaf = liveMenuLeafById(DEFAULT_MENU_LEAF_ID);
    expect(leaf?.kind).toBe("grafik");
    expect(leaf?.modus).toBe("belegung");
  });

  it("Simulation enthält die drei Grafik-Modi", () => {
    const sim = LIVE_MENU.find((g) => g.id === "simulation")!;
    expect(sim.children.map((c) => c.modus)).toEqual([
      "belegung",
      "warteschlangen",
      "qualifikation",
    ]);
    expect(sim.children.every((c) => c.kind === "grafik")).toBe(true);
  });

  it("enthält KEINEN Durchlaufplan- oder Einsatzzeit-Eintrag (Modellierung/redundant)", () => {
    const allTabIds = LIVE_MENU.flatMap((g) => g.children.map((c) => c.tabId));
    expect(allTabIds).not.toContain("durchlaufplan");
    expect(allTabIds).not.toContain("einsatzzeit");
  });

  it("Auswertung-Blätter sind alle kind=viewer mit tabId", () => {
    const ausw = LIVE_MENU.find((g) => g.id === "auswertung")!;
    expect(ausw.children.length).toBeGreaterThan(0);
    expect(
      ausw.children.every((c) => c.kind === "viewer" && !!c.tabId),
    ).toBe(true);
  });
});

describe("LiveMenuTree (Komponente)", () => {
  afterEach(() => cleanup());

  it("rendert beide Gruppen-Header + das aktive Blatt hervorgehoben", () => {
    render(<LiveMenuTree activeLeafId="grafik-belegung" onSelect={() => {}} />);
    expect(screen.getByTestId("live-menu-group-simulation")).toBeInTheDocument();
    expect(screen.getByTestId("live-menu-group-auswertung")).toBeInTheDocument();
    const active = screen.getByTestId("live-menu-leaf-grafik-belegung");
    expect(active).toHaveAttribute("data-active");
  });

  it("meldet die Blatt-id beim Klick", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onSelect = vi.fn();
    render(<LiveMenuTree activeLeafId="grafik-belegung" onSelect={onSelect} />);
    await userEvent.setup().click(
      screen.getByTestId("live-menu-leaf-grafik-warteschlangen"),
    );
    expect(onSelect).toHaveBeenCalledWith("grafik-warteschlangen");
  });
});
