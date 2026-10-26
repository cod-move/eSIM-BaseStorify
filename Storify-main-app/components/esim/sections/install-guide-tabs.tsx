"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppImage } from "@/components/ui/app-image";

/** The install guide's iOS / Android tabs (WEB-17). Steps arrive translated. */
export interface GuideStep {
  id: string;
  title: string;
  text: string;
  image: string;
}

export function InstallGuideTabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; steps: GuideStep[] }>;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className="space-y-6">
      <div role="tablist" className="mx-auto flex w-fit gap-1 rounded-full border bg-muted/40 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
              tab.id === current.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {current.steps.map((step, index) => (
          <li key={step.id} className="space-y-3 rounded-2xl border bg-card p-4">
            {step.image ? (
              <AppImage src={step.image} alt={step.title} width={480} height={640} className="aspect-[3/4] w-full rounded-xl object-cover" />
            ) : null}
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <div className="font-medium">{step.title}</div>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
