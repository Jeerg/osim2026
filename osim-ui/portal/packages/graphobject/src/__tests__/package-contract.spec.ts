/**
 * Validierung des @osim/graphobject-Package-Vertrags (Track C1).
 *
 * Stellt sicher dass die Public-API tatsächlich über den Workspace-Alias
 * `@osim/graphobject` importierbar ist und dieselben Klassen/Funktionen
 * exportiert wie der bestehende `@/graph/foundation`-Barrel.
 *
 * **Warum dieser Test sinnvoll bleibt auch nach physischer Migration:**
 * er fixiert die Public-API. Wenn ein Folge-Move versehentlich einen
 * Export wegnimmt, wird das hier bemerkt.
 */

import { describe, expect, it } from "vitest";

// Import über den Workspace-Alias — DAS ist der Vertrag.
import * as Pkg from "@osim/graphobject";

describe("@osim/graphobject — Public-API-Vertrag", () => {
  it("exportiert die Basis-Typen + Konstanten", () => {
    expect(typeof Pkg.cpoint).toBe("function");
    expect(typeof Pkg.csize).toBe("function");
    expect(typeof Pkg.crect).toBe("function");
    expect(typeof Pkg.crectEmpty).toBe("function");
    expect(typeof Pkg.crectContains).toBe("function");
    expect(typeof Pkg.LNULL).toBe("object");
    expect(typeof Pkg.isLNull).toBe("function");
  });

  it("exportiert die Enums", () => {
    expect(Pkg.GORegion).toBeDefined();
    expect(Pkg.GObjState).toBeDefined();
    expect(Pkg.GLDirection).toBeDefined();
    expect(Pkg.GOStateSub).toBeDefined();
    expect(Pkg.DrawLayer).toBeDefined();
    expect(Pkg.GObjType).toBeDefined();
    expect(Pkg.GSqrType).toBeDefined();
    expect(Pkg.GElementLinkinList).toBeDefined();
    expect(Pkg.GObjElementKlickAction).toBeDefined();
  });

  it("exportiert die Domain-Klassen", () => {
    expect(typeof Pkg.GObject).toBe("function");
    expect(typeof Pkg.GObjLink).toBe("function");
    expect(typeof Pkg.GObjSub).toBe("function");
    expect(typeof Pkg.GObjElements).toBe("function");
    expect(typeof Pkg.GElement).toBe("function");
    expect(typeof Pkg.GObjCEdit).toBe("function");
    expect(typeof Pkg.GObjOSimDlp).toBe("function");
    expect(typeof Pkg.GObjSquare).toBe("function");
    expect(typeof Pkg.GObjRect).toBe("function");
    expect(typeof Pkg.GLink).toBe("function");
    expect(typeof Pkg.GLinkPoint).toBe("function");
    expect(typeof Pkg.GLinkSquare).toBe("function");
  });

  it("exportiert die Container", () => {
    expect(typeof Pkg.OGraphCollection).toBe("function");
    expect(typeof Pkg.OGraphList).toBe("function");
    expect(typeof Pkg.OGraphView).toBe("function");
    expect(typeof Pkg.OGraphGrid).toBe("function");
    expect(typeof Pkg.OGGridAlt).toBe("function");
    expect(typeof Pkg.OGPosition).toBe("function");
    expect(typeof Pkg.OGPositionList).toBe("function");
    expect(typeof Pkg.OGPositionGrid).toBe("function");
    expect(typeof Pkg.GOGridCol).toBe("function");
    expect(typeof Pkg.GOGridRow).toBe("function");
  });

  it("exportiert die 4-Layer-Drawing-API + Phantom", () => {
    expect(typeof Pkg.NullDrawContext).toBe("function");
    expect(typeof Pkg.RecordingDrawContext).toBe("function");
    expect(typeof Pkg.PhantomController).toBe("function");
    expect(Pkg.phantomController).toBeDefined();
  });

  it("Instanziierung einer Domain-Klasse funktioniert via Package-Alias", () => {
    const g = new Pkg.GObject();
    expect(g).toBeInstanceOf(Pkg.GObject);
    const link = new Pkg.GObjLink();
    expect(link).toBeInstanceOf(Pkg.GObjLink);
    expect(link).toBeInstanceOf(Pkg.GObject);
  });

  it("Konstanten haben die erwarteten Werte (1:1 zu C++)", () => {
    expect(Pkg.STD_ROUND_CORNER).toBe(30);
    expect(Pkg.STD_PEAK_WIDTH).toBe(20);
    expect(Pkg.MAX_POINT_NUM).toBeDefined();
    expect(Pkg.OGGRIDALT_DEFAULT_TEXT_SPACE).toBe(120);
  });
});
