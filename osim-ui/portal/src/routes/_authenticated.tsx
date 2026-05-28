import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";

/**
 * Layout-Route mit Auth-Guard. Schützt alle Routen unter `/_authenticated/*`.
 *
 * Pitfall #8 (Auth-Race): solange `context.auth.isLoading === true`, NICHT
 * navigieren — sonst landet ein gerade-eingeloggter User auf /login.
 * `isLoading` wird vom AuthProvider auf `false` gesetzt, sobald
 * `onAuthStateChanged` erstmals gefeuert hat. Bis dahin lässt der Guard die
 * Route stehen (TanStack-Router rendert nichts weiter, bis beforeLoad return).
 *
 * Phase 1: kein tenantStatus-Check — Lazy-Bootstrap garantiert "active".
 * Phase 2+ ggf. Suspended-Redirect ergänzen.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) {
      // Auth noch nicht resolved — kein Redirect, kein Throw. Der nächste
      // Render-Cycle nach setState im AuthProvider triggert beforeLoad neu.
      return;
    }
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: () => (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  ),
});
