import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Style-Guide §4.1 (rev. 2026-05-26): Segoe UI als systemnativer Body-Font —
// kein Web-Font-Bundle nötig (siehe --font-sans in tokens.css).
import "@/styles/globals.css";
import { App } from "./app";

// 1:1-Subset aus tbx_stzrim/portal/src/main.tsx — KEIN i18n-Import in Phase 1.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
