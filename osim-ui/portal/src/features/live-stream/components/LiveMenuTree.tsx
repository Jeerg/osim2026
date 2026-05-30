/**
 * LiveMenuTree — zweistufiger Navigations-Baum der /live-Sicht (LIVE-LAYOUT-SPEC).
 *
 * Spiegelt das PSim-Menü: Gruppe "Simulation" (Grafikfenster-Modi) + Gruppe
 * "Auswertung" (KPI-Viewer). Ein Lauf, viele Sichten — die Lauf-Steuerleiste
 * liegt OBERHALB und ist nicht Teil dieses Baums.
 *
 * Reine Präsentation: die Auswahl-id + Callback kommen von /live. Optik 3FLS
 * (Tree-View-Pattern aus osim-ui/CLAUDE.md: Header neutral-grau, aktives Blatt
 * hervorgehoben, Indentation). Keine ad-hoc-Farben.
 */

import * as React from "react";
import { LIVE_MENU } from "../viewer-config";

export interface LiveMenuTreeProps {
  /** id des aktiven Blatts. */
  activeLeafId: string;
  /** Auswahl-Callback (Blatt-id). */
  onSelect: (leafId: string) => void;
}

export function LiveMenuTree({
  activeLeafId,
  onSelect,
}: LiveMenuTreeProps): React.ReactElement {
  return (
    <nav
      className="flex w-56 shrink-0 flex-col gap-3 border-r border-border bg-card p-2"
      aria-label="Simulator-Menü"
      data-testid="live-menu-tree"
    >
      {LIVE_MENU.map((group) => (
        <div key={group.id} className="flex flex-col">
          <div
            className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            data-testid={`live-menu-group-${group.id}`}
          >
            {group.label}
          </div>
          <ul className="flex flex-col">
            {group.children.map((leaf) => {
              const active = leaf.id === activeLeafId;
              return (
                <li key={leaf.id}>
                  <button
                    type="button"
                    data-testid={`live-menu-leaf-${leaf.id}`}
                    data-active={active ? "" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelect(leaf.id)}
                    className={[
                      "flex w-full items-center rounded-md py-1 pl-[22px] pr-2 text-left text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {leaf.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
