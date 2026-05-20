// Plan 01-05 Task 1: ModelsList-Smoke-Test.
//
// Mock-fetch fuer /api/v1/models und verifiziert, dass die Liste rendert
// (mit Empty-State und mit befuellter Liste).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ModelsList } from "../models-list";

function makeRouter(component: () => React.ReactNode) {
  const rootRoute = createRootRouteWithContext<Record<string, unknown>>()({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

function renderWithProviders(ui: () => React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = makeRouter(ui);
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // happy-dom hat kein fetch by default fuer alle Versionen; sicherstellen.
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("ModelsList", () => {
  it("zeigt Empty-State wenn keine Modelle vorhanden", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderWithProviders(() => <ModelsList />);
    await waitFor(() => {
      expect(screen.getByTestId("models-list-empty")).toBeInTheDocument();
    });
  });

  it("zeigt Tabelle mit Modellen", async () => {
    const models = [
      {
        id: 42,
        name: "Dummy.otx",
        original_filename: "Dummy.otx",
        owner_uid: "uid-1",
        coverage_ratio_at_upload: 0.85,
        current_version_id: 1,
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ];
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(models), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderWithProviders(() => <ModelsList />);
    await waitFor(() => {
      expect(screen.getByTestId("models-list")).toBeInTheDocument();
    });
    expect(screen.getByTestId("models-list-row-42")).toBeInTheDocument();
    // "Dummy.otx" steht sowohl als Name als auch als Original-Filename in
    // der Zeile — wir checken nur den Count > 0.
    expect(screen.getAllByText("Dummy.otx").length).toBeGreaterThan(0);
  });
});

// React-Import fuer Type ohne automatischen jsxImportSource.
import React from "react";
void React;
