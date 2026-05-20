// Plan 01-04 Task 1: Platzhalter fuer die "models"-Liste (kommt in Plan 05).
// Phase 1 default-landing nach Login: zeigt eine kurze Status-Karte mit
// Tenant-Info und ein "TODO Plan 05"-Hinweis.
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/auth/use-auth";

export const Route = createFileRoute("/_authenticated/workspace")({
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const a = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h2 className="text-xl font-semibold">Workspace</h2>

      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">E-Mail</dt>
          <dd>{a.email ?? "—"}</dd>
          <dt className="text-gray-500">Tenant-ID</dt>
          <dd>
            <code>{a.tenantId ?? "—"}</code>
          </dd>
          <dt className="text-gray-500">Rolle</dt>
          <dd>{a.role ?? "—"}</dd>
          <dt className="text-gray-500">Bootstrap</dt>
          <dd>
            {a.bootstrapped
              ? "Neuer Tenant gerade angelegt"
              : "Bestehender Tenant"}
          </dd>
        </dl>
      </div>

      <p className="text-sm text-gray-600">
        Die Modell-Liste und die Viewer kommen in Plan 05–08.
      </p>
    </div>
  );
}
