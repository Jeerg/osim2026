import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// osim-ui Vite-Config (1:1-Subset aus tbx_stzrim/portal/vite.config.ts).
//
// Plan 01-03 reaktiviert das TanStackRouterVite-Plugin — es generiert
// `src/routeTree.gen.ts` automatisch aus den Files unter `src/routes/`.
// Port 3002 (3fls liegt auf 3003, demo-Backend auf 8000).
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Workspace-Pakete (Track C1 — Architektur-Audit 2026-05-28 §5.4).
      // Foundation-Files leben Stand 2026-05-28b noch unter src/graph/foundation/;
      // diese Aliase definieren bereits den Package-Vertrag, sodass neue Code-
      // Wellen "@osim/graphobject" als Import-Pfad nutzen können. Die
      // tatsaechliche Dateiverschiebung kommt in einer Folge-Welle (mechanisch).
      "@osim/graphobject": path.resolve(
        __dirname,
        "./packages/graphobject/src/index.ts",
      ),
      "@osim/graphobject-react-flow": path.resolve(
        __dirname,
        "./packages/graphobject-react-flow/src/index.ts",
      ),
      "@osim/graphobject-canvas": path.resolve(
        __dirname,
        "./packages/graphobject-canvas/src/index.ts",
      ),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
  },
});
