"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, BarChart3, Settings2, SlidersHorizontal, QrCode, Wallet, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A number's page in tabs (balance, install, services, usage, diagnose,
 * manage), as other number shops lay it out. The open tab is in the
 * address (#services), so a link or a reload keeps it. A tab's content is
 * drawn only while it is open, so the cards that ask TopConnect do so only
 * when looked at.
 */
/** Icons by tab, here: a server page cannot hand a component to a client one. */
const ICONS: Record<string, LucideIcon> = { balance: Wallet, install: QrCode, services: SlidersHorizontal, usage: BarChart3, diagnose: Activity, manage: Settings2 };

export function NumberTabs({ tabs }: { tabs: Array<{ value: string; label: string; content: ReactNode }> }) {
  const [value, setValue] = useState(tabs[0]?.value ?? "");

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (tabs.some((tab) => tab.value === hash)) setValue(hash);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const choose = (next: string) => {
    setValue(next);
    window.history.replaceState(null, "", next === tabs[0]?.value ? window.location.pathname + window.location.search : `#${next}`);
  };

  return (
    <Tabs value={value} onValueChange={choose} className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="h-auto w-max min-w-full justify-start gap-1 p-1">
          {tabs.map(({ value: key, label }) => {
            const Icon = ICONS[key] ?? Wallet;
            return (
            <TabsTrigger key={key} value={key} className="gap-1.5 px-3 py-1.5">
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0 space-y-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
