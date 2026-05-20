// Plan 01-05 Task 1: /models — Index-Route mit Modell-Liste.
import { createFileRoute } from "@tanstack/react-router";
import { ModelsList } from "@/components/models-list";

export const Route = createFileRoute("/_authenticated/models/")({
  component: ModelsIndexPage,
});

function ModelsIndexPage() {
  return <ModelsList />;
}
