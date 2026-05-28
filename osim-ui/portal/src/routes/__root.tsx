import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "@/auth/use-auth";

/**
 * Router-Context für osim-ui — wird in app.tsx beim createRouter() befüllt
 * und enthält den Auth-State, damit `_authenticated.tsx` synchron in
 * `beforeLoad` entscheiden kann (kein React-Render-Cycle nötig).
 */
interface RouterContext {
  auth: AuthState;
}

/** Root-Route. Reicht den Outlet durch — Layout-Wahl passiert in `_authenticated.tsx` und `login.tsx`. */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
