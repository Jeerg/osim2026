/**
 * OsimIcon — zentrale Komponente für OSim-spezifische SVG-Symbole.
 *
 * Welle 8 der Phase-1.1-Foundation. Die Symbole sind handgemachte moderne
 * Re-Designs der Original-OSim2004-Symbole (~199 BMPs in OSim2004/bmp/).
 * Statt 256-Farben-BMPs auto-zu-tracen, wurden die essentiellen Symbole von
 * Hand neu gezeichnet — kleiner, schärfer, brand-konform via `currentColor`.
 *
 * Inline-Implementation (keine Vite-svgr-Plugin-Dependency) — die SVG-
 * Sourcen liegen auch als .svg-Files in diesem Verzeichnis (für Asset-
 * Bundling / direkte Image-Embeds wenn nötig).
 */

import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

const baseProps = (size?: number, className?: string): React.SVGProps<SVGSVGElement> => ({
  width: size ?? 24,
  height: size ?? 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className,
});

export const OsimLogoIcon: React.FC<IconProps> = ({ size = 32, className, ...rest }) => (
  <svg viewBox="0 0 32 32" {...baseProps(size, className)} strokeWidth={2} {...rest}>
    <circle cx="16" cy="16" r="13" />
    <circle cx="16" cy="16" r="5" fill="currentColor" />
    <line x1="3" y1="16" x2="11" y2="16" />
    <line x1="21" y1="16" x2="29" y2="16" />
    <line x1="16" y1="3" x2="16" y2="11" />
    <line x1="16" y1="21" x2="16" y2="29" />
  </svg>
);

export const DurchlaufplanIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <rect x="2" y="9" width="5" height="6" rx="0.5" />
    <rect x="9.5" y="4" width="5" height="6" rx="0.5" />
    <rect x="9.5" y="14" width="5" height="6" rx="0.5" />
    <rect x="17" y="9" width="5" height="6" rx="0.5" />
    <path d="M 7 12 L 9.5 7" />
    <path d="M 7 12 L 9.5 17" />
    <path d="M 14.5 7 L 17 12" />
    <path d="M 14.5 17 L 17 12" />
  </svg>
);

export const SimulatorIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M 7 8 L 7 16" />
    <path d="M 7 8 L 12 11 L 7 14" fill="currentColor" />
    <line x1="13" y1="12" x2="17" y2="12" />
  </svg>
);

export const KnotenKonstantIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <rect x="4" y="6" width="16" height="12" rx="1" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </svg>
);

export const KnotenAlternativIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <path d="M 4 6 L 20 6 L 20 18 L 4 18 Z" />
    <path d="M 4 12 L 12 6" />
    <path d="M 4 12 L 12 18" />
    <path d="M 12 6 L 20 12" />
    <path d="M 12 18 L 20 12" />
  </svg>
);

export const KnotenSpeicherIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <ellipse cx="12" cy="6" rx="8" ry="2.5" />
    <path d="M 4 6 L 4 18" />
    <path d="M 20 6 L 20 18" />
    <ellipse cx="12" cy="18" rx="8" ry="2.5" />
    <path d="M 4 12 C 4 13.5, 20 13.5, 20 12" strokeDasharray="2 2" />
  </svg>
);

export const AusloeserIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <path d="M 14 2 L 5 13 L 11 13 L 10 22 L 19 11 L 13 11 L 14 2 Z" fill="currentColor" fillOpacity={0.15} />
  </svg>
);

export const BetriebsmittelIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <circle cx="12" cy="12" r="3" />
    <path d="M 12 1 L 12 5" />
    <path d="M 12 19 L 12 23" />
    <path d="M 1 12 L 5 12" />
    <path d="M 19 12 L 23 12" />
    <path d="M 4 4 L 7 7" />
    <path d="M 17 17 L 20 20" />
    <path d="M 4 20 L 7 17" />
    <path d="M 17 7 L 20 4" />
  </svg>
);

export const RessourceMengeIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <rect x="3" y="8" width="6" height="12" rx="0.5" />
    <rect x="9" y="4" width="6" height="16" rx="0.5" />
    <rect x="15" y="11" width="6" height="9" rx="0.5" />
  </svg>
);

export const PersonalgruppeIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <circle cx="9" cy="8" r="3" />
    <path d="M 3 20 C 3 16, 6 14, 9 14 C 12 14, 15 16, 15 20" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M 14 16 C 14.5 14, 16 13, 17 13 C 19 13, 21 15, 21 18" />
  </svg>
);

export const EinsatzwunschIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 6 12 12 16 14" />
    <path d="M 12 12 L 8 8" strokeDasharray="1 2" />
  </svg>
);

export const KanteIcon: React.FC<IconProps> = ({ size, className, ...rest }) => (
  <svg viewBox="0 0 24 24" {...baseProps(size, className)} {...rest}>
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="19" cy="12" r="2.5" />
    <line x1="7.5" y1="12" x2="16.5" y2="12" />
    <path d="M 14 9.5 L 16.5 12 L 14 14.5" />
  </svg>
);

/**
 * Map: Symbol-Name → React-Komponente. Konsumenten können dynamisch wählen.
 */
export const OsimSymbols = {
  logo: OsimLogoIcon,
  durchlaufplan: DurchlaufplanIcon,
  simulator: SimulatorIcon,
  knotenKonstant: KnotenKonstantIcon,
  knotenAlternativ: KnotenAlternativIcon,
  knotenSpeicher: KnotenSpeicherIcon,
  ausloeser: AusloeserIcon,
  betriebsmittel: BetriebsmittelIcon,
  ressourceMenge: RessourceMengeIcon,
  personalgruppe: PersonalgruppeIcon,
  einsatzwunsch: EinsatzwunschIcon,
  kante: KanteIcon,
} as const;

export type OsimSymbolName = keyof typeof OsimSymbols;

/** Liefert das richtige Symbol für eine OSim-Klasse. */
export function symbolForKlass(klass: string): OsimSymbolName {
  if (klass.startsWith("PDurchlaufplan")) return "durchlaufplan";
  if (klass.startsWith("PSimulator") || klass === "ASimulator") return "simulator";
  if (klass.startsWith("PDpKnKonstant")) return "knotenKonstant";
  if (klass.startsWith("PDpKnAlternativ")) return "knotenAlternativ";
  if (klass.startsWith("PDpKnSpeicher") || klass === "PRessMenge") return "knotenSpeicher";
  if (klass.startsWith("PAsl") || klass.includes("Ausloeser")) return "ausloeser";
  if (klass.startsWith("PBetriebs")) return "betriebsmittel";
  if (klass.startsWith("PRess")) return "ressourceMenge";
  if (klass.startsWith("AGruppe") || klass === "APerson") return "personalgruppe";
  if (klass.startsWith("AEinsatz") || klass.startsWith("AKap")) return "einsatzwunsch";
  if (klass === "PDlplKante") return "kante";
  return "durchlaufplan";
}

/** Liefert das richtige Symbol für ein Tree-Group-Label. */
export function symbolForGroup(groupLabel: string): OsimSymbolName {
  const map: Record<string, OsimSymbolName> = {
    "Auslöser": "ausloeser",
    "Durchlaufpläne": "durchlaufplan",
    Knoten: "knotenKonstant",
    Kanten: "kante",
    Belegungsressourcen: "betriebsmittel",
    Mengenressourcen: "ressourceMenge",
    Personalgruppen: "personalgruppe",
    "Einsatzwünsche": "einsatzwunsch",
  };
  return map[groupLabel] ?? "durchlaufplan";
}
