/**
 * Validierung des @osim/graphobject-react-flow-Package-Vertrags (Track C3).
 *
 * Stellt sicher dass die RF-Adapter-API über den Workspace-Alias
 * importierbar ist und die richtigen Symbole exportiert.
 */

import { describe, expect, it } from "vitest";
import * as RfPkg from "@osim/graphobject-react-flow";

describe("@osim/graphobject-react-flow — Public-API-Vertrag", () => {
  it("exportiert View-Adapter-Funktionen", () => {
    expect(typeof RfPkg.ogGridToReactFlow).toBe("function");
    expect(typeof RfPkg.applyPositionUpdate).toBe("function");
  });

  it("exportiert Custom-Node-Komponenten", () => {
    expect(RfPkg.OsimNode).toBeDefined();
    expect(RfPkg.OsimGroupNode).toBeDefined();
    expect(RfPkg.osimNodeTypes).toBeDefined();
    expect(typeof RfPkg.osimNodeTypes).toBe("object");
  });

  it("exportiert Canvas-Wrapper", () => {
    expect(RfPkg.GraphFlowCanvas).toBeDefined();
  });

  it("exportiert Grid-Hintergrund", () => {
    expect(RfPkg.GridBackground).toBeDefined();
  });

  it("exportiert Interaction-Helpers", () => {
    expect(typeof RfPkg.findObjectByNodeId).toBe("function");
    expect(typeof RfPkg.onNodeDragStop).toBe("function");
    expect(typeof RfPkg.onConnect).toBe("function");
    expect(typeof RfPkg.findEdgeCell).toBe("function");
    expect(typeof RfPkg.onNodesDelete).toBe("function");
    expect(typeof RfPkg.onEdgesDelete).toBe("function");
    expect(typeof RfPkg.onNodeDoubleClick).toBe("function");
  });
});
