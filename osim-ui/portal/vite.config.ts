import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// Vite-Config fuer osim-ui-portal (Build + Dev-Server).
//
// Plan 01-04 Task 1: Foundation-Setup.
// - Port 3000 (osim-ui-Konvention; 3fls nutzt 3003).
// - Proxy /api -> http://localhost:8000 damit der Browser keine CORS-Konfig
//   braucht und apiFetch einfach mit relativen Pfaden arbeiten kann
//   (Phase-1-pragmatisch; voller CORS-Stack waere die Alternative).
// - TanStack-Router-Plugin generiert routeTree.gen.ts automatisch aus
//   src/routes/.
// - Tailwind 4 als Vite-Plugin (kein PostCSS-Setup noetig).
// - Vitest hat seine eigene Konfig in vitest.config.ts (vermeidet
//   Type-Konflikte zwischen vitest's gebundle-ter vite-Version und der
//   Projekt-vite-Version).
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
