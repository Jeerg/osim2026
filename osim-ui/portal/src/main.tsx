import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
// Plan 01-05: Side-effect-Import registriert alle Property-Viewer
// (PSimulatorViewer, PGObjBaseViewer, PDurchlaufplanViewerStd, AGruppeViewer)
// + TYPE_MAP-Eintraege. MUSS vor dem App-Mount geschehen, damit
// ClientCtrl.pickChildDialog die Viewer findet.
import "@/viewers/property";
import { App } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
