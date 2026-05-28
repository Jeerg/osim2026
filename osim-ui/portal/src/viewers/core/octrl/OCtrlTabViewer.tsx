import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * OCtrlTabViewer — Container-OCtrl, der zwischen mehreren ChildDialog-
 * Layouts auf demselben Objekt wechselt. C++-Pendant: `OCtrlTabViewer`.
 *
 * Typisches Beispiel: ein Durchlaufplan-Editor bietet "Standard" (Tabellen-
 * Sicht) und "Design" (graphisch) als Tabs. Beide arbeiten auf demselben
 * Objekt, nur die Darstellung wechselt.
 *
 * Bewusst KEINE OCtrlBaseProps-Signatur — TabViewer hat keinen
 * Property-Wert, sondern einen Tab-Selector. Der Parent verdrahtet `value` +
 * `onChange` typischerweise mit dem ClientCtrl-`viewerHint`.
 */
export interface OCtrlTabViewerTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface OCtrlTabViewerProps {
  tabs: OCtrlTabViewerTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export const OCtrlTabViewer: React.FC<OCtrlTabViewerProps> = ({
  tabs,
  value,
  onChange,
  className,
}) => {
  return (
    <Tabs
      value={value}
      onValueChange={onChange}
      className={cn("flex h-full flex-col", className)}
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger value={t.id} key={t.id}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent value={t.id} key={t.id} className="flex-1 overflow-auto">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};
