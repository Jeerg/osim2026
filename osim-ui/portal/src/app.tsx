// Plan 01-04 Task 1: App-Shell mit QueryClient + AuthProvider + Router.
// Folgt dem 3fls-Muster (tbx_stzrim/portal/src/app.tsx), aber ohne i18n
// (Phase 1 ist deutsch-only) und ohne shadcn-Toaster (Plan 05+ kann
// nachziehen, wenn die Viewer-Konsumenten Toast-Feedback brauchen).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";
import { routeTree } from "./routeTree.gen";

// React-Query: 5-Minuten staleTime, 1 Retry. Reicht fuer Phase 1; in
// spaeteren Phasen ggf. ueberdenken (Sim-Status braucht haeufigere Updates).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Router-Instance. auth-Context wird zur Laufzeit von InnerApp injiziert.
const router = createRouter({
  routeTree,
  context: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth: undefined as any,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
