import path from "node:path";
import { defineConfig } from "vitest/config";

// Eigenstaendige Vitest-Konfig.
//
// Die TanStack-Router- und Tailwind-Plugins sind im Test-Lauf nicht
// noetig (Tests rendern Komponenten in happy-dom ohne Route-Tree und
// ohne CSS); wir laden sie hier bewusst nicht, was Type-Konflikte
// zwischen vitest's gebundle-ter vite-Version und der Projekt-vite-
// Version vermeidet.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
