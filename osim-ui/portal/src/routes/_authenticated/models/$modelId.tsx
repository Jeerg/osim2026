// Plan 01-05 Task 1: /models/{modelId} — Workspace-Route.
//
// Verwendet useTreeLoader (Lock-Acquire + Tree-Fetch) und rendert
// WorkspaceLayout (Sidebar + ViewerHost).

import { createFileRoute } from "@tanstack/react-router";
import { useTreeLoader } from "@/hooks/use-tree-loader";
import { WorkspaceLayout } from "@/components/workspace-layout";
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
  const modelName = tree?.name ?? `Modell ${modelId}`;

  return (
    <WorkspaceLayout
      modelName={modelName}
      mode={loader.mode}
      lockHolder={loader.lockHolder}
      version={loader.version}
    />
  );
}
