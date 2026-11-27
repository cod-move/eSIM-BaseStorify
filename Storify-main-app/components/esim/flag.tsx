import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { destinationFlag, flagSrc } from "@/lib/esim/storefront/flags";

function FlagImage({ src, className }: { src: string; className?: string }) {
  return (
    // A tiny static SVG: next/image would add nothing but a wrapper.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block h-[1em] w-[1.5em] shrink-0 rounded-[0.12em] object-cover align-[-0.125em] ring-1 ring-black/10 dark:ring-white/15",
        className,
      )}
    />
  );
}

/**
 * A country's flag, sized to the text around it (1em high, 3:2). Draws
 * nothing when there is no flag for the code. Works on server and client.
 */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
  const src = flagSrc(code);
  return src ? <FlagImage src={src} className={className} /> : null;
}

const REGION_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04", "#4f46e5", "#dc2626"];

/** A region's colour, picked from its countries so it stays the same. */
export function regionColor(countryCodes: string[]): string {
  let hash = 0;
  for (const char of countryCodes.join(",")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return REGION_COLORS[hash % REGION_COLORS.length] ?? "#2563eb";
}

/**
 * A destination's picture: a country's own flag; the world a globe; a region
 * a white globe on a colour of its own (the same each time, from its
 * countries). The emoji an admin or supplier stored (🇪🇺, 🌍…) is not drawn.
 */
export function DestinationIcon({
  destination,
  className,
}: {
  destination: { scope: string; countryCodes: string[]; emoji: string | null };
  className?: string;
}) {
  if (destination.scope === "regional") {
    return (
      <span className={cn("inline-flex items-center justify-center", className)} aria-hidden="true">
        <span
          className="inline-flex h-[1.25em] w-[1.25em] items-center justify-center rounded-full"
          style={{ backgroundColor: regionColor(destination.countryCodes) }}
        >
          <Globe2 className="h-[0.8em] w-[0.8em] text-white" strokeWidth={2} />
        </span>
      </span>
    );
  }
  if (destination.scope !== "local") {
    return (
      <span className={cn("inline-flex items-center justify-center", className)} aria-hidden="true">
        <Globe2 className="h-[1em] w-[1em] text-primary" strokeWidth={1.75} />
      </span>
    );
  }
  const src = destinationFlag(destination);
  if (src) return <FlagImage src={src} className={className} />;
  return (
    <span className={className} aria-hidden="true">
      {destination.emoji || "📍"}
    </span>
  );
}
