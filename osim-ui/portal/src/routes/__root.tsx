// Plan 01-04 Task 1: Root-Route mit Auth-Context.
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "@/auth/use-auth";

interface RouterContext {
  auth: AuthState;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
