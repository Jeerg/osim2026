// Plan 01-04 Task 3: Re-Export aller 9 OCtrl-Komponenten.
//
// Konsumenten (ChildDialog-Implementierungen aus Plan 05+) importieren
// die OCtrls aus diesem Index — keine direkten Imports der Einzeldateien.

export { OCtrlVariable } from "./OCtrlVariable";
export { OCtrlBool } from "./OCtrlBool";
export { OCtrlEnum } from "./OCtrlEnum";
export { OCtrlLink } from "./OCtrlLink";
export { OCtrlList } from "./OCtrlList";
export { OCtrlMethod } from "./OCtrlMethod";
export type { OCtrlMethodProps } from "./OCtrlMethod";
export { OCtrlTabViewer } from "./OCtrlTabViewer";
export type { OCtrlTabViewerProps, TabSpec } from "./OCtrlTabViewer";
export {
  OCtrlCOLORREF,
  colorrefToHex,
  hexToColorref,
} from "./OCtrlCOLORREF";
export { OCtrlLOGFONT } from "./OCtrlLOGFONT";
export type { LogFontValue } from "./OCtrlLOGFONT";
