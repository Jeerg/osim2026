// Plan 01-05 Task 1: /models/upload — Upload-Form-Route.
import { createFileRoute } from "@tanstack/react-router";
import { ModelUploadForm } from "@/components/model-upload-form";

export const Route = createFileRoute("/_authenticated/models/upload")({
  component: ModelUploadPage,
});

function ModelUploadPage() {
  return <ModelUploadForm />;
}
