// Plan 01-04 Task 1: Authenticated-Layout mit Auth-Guard.
//
// beforeLoad-Guard: nur authentifizierte User mit aktivem Tenant duerfen
// rein. Phase 1 hat noch kein "suspended"-Konzept (Plan 02 macht nur den
// Lazy-Bootstrap), deshalb pruefen wir nur isAuthenticated.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { signOut } from "firebase/auth";
import { auth } from "@/auth/firebase";
import { useAuth } from "@/auth/use-auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) {
      return;
    }
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const a = useAuth();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">osim-ui</span>
          {a.tenantId && (
            <span className="text-xs text-gray-500">
              Tenant: <code>{a.tenantId}</code>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {a.email && <span className="text-gray-700">{a.email}</span>}
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Abmelden
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
