import * as React from "react";
import { Button } from "@/components/ui/button";
import type { PropertyMeta } from "@/viewers/core/types";

/**
 * OCtrlMethod — Button-OCtrl für Methoden-Aufrufe ("Zurücksetzen",
 * "Initialisieren", …). C++-Pendant: `OCtrlDumperButton` /
 * `OCtrlCommandButton`.
 *
 * Phase 1: reiner UI-Button. Der Parent (Plan 08-Viewer-Implementation)
 * verdrahtet den `onClick` so, dass ein `ViewerCommand({type:"method", …})`
 * über `props.onCommand` gefeuert wird. Hier KEINE direkte Backend-Anbindung
 * — die Method-API auf der Engine kommt frühestens in Phase 2.
 *
 * Wenn kein onClick verdrahtet ist, wird beim Klick eine console.warn-
 * Meldung ausgegeben — verhindert lautlose Nicht-Aktionen während der
 * Entwicklung.
 *
 * Bewusste Abweichung von OCtrlBaseProps: ein Method-OCtrl hat keinen
 * `value`/`onChange` — Methoden produzieren Side-Effects, keine Properties.
 */
export interface OCtrlMethodProps {
  schema: PropertyMeta;
  onClick?: () => void;
  disabled?: boolean;
}

export const OCtrlMethod: React.FC<OCtrlMethodProps> = ({
  schema,
  onClick,
  disabled,
}) => {
  const handleClick = () => {
    if (!onClick) {
      console.warn(
        `[OCtrlMethod] Schema "${schema.name}" hat keinen onClick-Handler. ` +
          `Method-Aufruf ist no-op (vermutlich noch nicht verdrahtet).`,
      );
      return;
    }
    onClick();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled || schema.readonly === true}
      data-octrl-id={schema.name}
    >
      {schema.label_de}
    </Button>
  );
};
