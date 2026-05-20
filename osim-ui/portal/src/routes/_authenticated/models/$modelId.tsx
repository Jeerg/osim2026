// Plan 01-05 Task 1: /models/{modelId} — Workspace-Route.
// Plan 01-09 Task 2: Erweitert um RecoveryPrompt.
//
// Verwendet useTreeLoader (Lock-Acquire + Tree-Fetch + Recovery-Check)
// und rendert WorkspaceLayout (Sidebar + ViewerHost). Bei Recovery-Bedarf
// blockiert ein Modal das Workspace, bis der User entschieden hat.

import { createFileRoute } from "@tanstack/react-router";
import { useTreeLoader } from "@/hooks/use-tree-loader";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { RecoveryPrompt } from "@/components/recovery-prompt";
import { useModelStore } from "@/state/model-store";

export const Route = createFileRoute("/_authenticated/models/$modelId")({
  component: ModelWorkspacePage,
  parseParams: ({ modelId }) => ({ modelId: Number(modelId) }),
});

function ModelWorkspacePage() {
  const { modelId } = Route.useParams();
  const loader = useTreeLoader(modelId);
  const tree = useModelStore((s) => s.tree);

  if (loader.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Modell wird geladen…
      </div>
    );
  }
  if (loader.error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-700">
        Fehler beim Laden: {loader.error.message}
      </div>
    );
  }
  // Wenn RecoveryPrompt aktiv ist, blocken wir den Workspace
  // (overlay-modal), bis der User entschieden hat. Das Layout bleibt im
  // Hintergrund sichtbar, damit der User sehen kann, was geladen wird —
  // aber tree ist noch null (useTreeLoader haelt setTree zurueck) und
  // der Workspace zeigt seinen leeren Zustand.
  const showRecovery = loader.recoveryCheck !== null;
  const modelName = tree?.name ?? `Modell ${modelId}`;

  return (
    <>
      <WorkspaceLayout
        modelName={modelName}
        modelId={modelId}
        mode={loader.mode}
        lockHolder={loader.lockHolder}
        version={loader.version}
      />
      {showRecovery && loader.recoveryCheck && (
        <RecoveryPrompt
          check={loader.recoveryCheck}
          onAccept={loader.acceptRecovery}
          onDiscard={loader.discardRecovery}
        />
      )}
    </>
  );
}
