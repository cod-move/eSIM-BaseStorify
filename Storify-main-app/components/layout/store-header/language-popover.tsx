"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The language picker a header control opens: the Language item, or the
 * icons cluster's language glyph. Each trigger owns its picker. With one
 * open state shared by every trigger, a header holding both controls opened
 * the two pickers on a click, each closed the other as focus moved into it,
 * and neither ever showed.
 *
 * [esim-patch] P31 — the picker is a list: a click on a language switches to
 * it, where it was a select and a Save button.
 */
export function LanguagePopover({
  trigger,
  currentCode,
  languages,
  onSave,
}: {
  trigger: ReactNode;
  /** The page's language; it is ticked. */
  currentCode: string;
  languages: ReadonlyArray<{ code: string; name: string }>;
  /** The language the shopper picked. */
  onSave: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="max-h-[70vh] w-52 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_40px_rgba(15,23,42,0.2)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
      >
        <ul role="listbox" aria-activedescendant={`language-${currentCode}`}>
          {languages.map((lang) => {
            const current = lang.code === currentCode;
            return (
              <li key={lang.code} id={`language-${lang.code}`} role="option" aria-selected={current}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!current) onSave(lang.code);
                  }}
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-start text-[14px] transition-colors hover:bg-accent",
                    current && "font-semibold",
                  )}
                >
                  {lang.name}
                  {current ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
