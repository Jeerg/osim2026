// Plan 01-04 Task 1: Root-Index — Weiterleitung.
//
// Wenn eingeloggt: nach /workspace; sonst nach /login. Die Login-Seite
// uebernimmt den Self-Service-Signup-Flow.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.auth?.isLoading) {
      return;
    }
    if (context.auth?.isAuthenticated) {
      throw redirect({ to: "/workspace" });
    }
    throw redirect({ to: "/login" });
  },
});
