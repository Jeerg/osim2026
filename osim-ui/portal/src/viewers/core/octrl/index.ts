/**
 * Barrel-Export der vollständigen 9-er OCtrl-Familie.
 *
 * Konsumenten (Plan 08+): `import { OCtrlVariable, OCtrlBool, ... } from
 * "@/viewers/core/octrl";`
 *
 * Die Reihenfolge folgt der C++-Original-Hierarchie aus
 * `OSim2004/inc/OViewer.h` (Variable → Bool → Enum → Link → List → Method →
 * TabViewer → COLORREF → LOGFONT).
 */
export { OCtrlVariable } from "./OCtrlVariable";
export { OCtrlBool } from "./OCtrlBool";
export { OCtrlEnum } from "./OCtrlEnum";
export { OCtrlLink } from "./OCtrlLink";
export { OCtrlList } from "./OCtrlList";
export { OCtrlMethod } from "./OCtrlMethod";
export { OCtrlTabViewer } from "./OCtrlTabViewer";
export { OCtrlColorRef } from "./OCtrlColorRef";
export { OCtrlLogFont } from "./OCtrlLogFont";

export type { LogFontValue } from "./OCtrlLogFont";
export type { OCtrlTabViewerTab, OCtrlTabViewerProps } from "./OCtrlTabViewer";
export type { OCtrlBaseProps } from "../types";
