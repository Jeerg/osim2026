// Side-Effect-Import: registriert alle 8 Phase-1-Viewer in der ViewerRegistry
// und setzt PGObjBaseViewer als Fallback. MUSS vor dem Router-Setup laufen,
// damit die Registry beim ersten Render eines Workspace-Routes gefüllt ist.
import "@/viewers/setup";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { routeTree } from "./routeTree.gen";

// QueryClient mit sinnvollen Defaults für Phase 1 (1:1 aus tbx_stzrim/portal/src/app.tsx).
//  - staleTime 5 min: Tenant-/Modell-Listen ändern sich selten ohne User-Aktion.
//  - retry 1: bei transientem Backend-Hickup einmal nachfassen, danach UI-Error.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Router-Instanz wird vor der React-Tree-Initialisierung gebaut, weil
// TanStack-Router den routeTree für Type-Inferenz braucht. `context.auth` ist
// hier ein `undefined as any`-Placeholder — der echte Wert wird in `InnerApp`
// pro Render via `<RouterProvider context={{ auth }}>` injected.
const router = createRouter({
  routeTree,
  context: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth: undefined as any,
  },
});

// Type-Registration für `<Link to="..." />`-Autocomplete + beforeLoad-Context.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Inner-Wrapper, der den Auth-Context konsumiert und an den Router weiterreicht.
 * Muss INSIDE des AuthProvider mounten, damit `useAuth()` nicht wirft.
 */
function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

/**
 * App-Root. Provider-Reihenfolge (outermost → innermost):
 *   QueryClientProvider → AuthProvider → InnerApp + Toaster.
 *
 * QueryClientProvider muss außen, damit AuthProvider ggf. useMutation/useQuery
 * nutzen kann. Toaster ist Sibling von InnerApp (nicht im Router-Tree), damit
 * Toasts auch außerhalb von Routes (z.B. globale Fetch-Errors) gemounted sind.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
