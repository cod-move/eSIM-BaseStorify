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

/**
 * A destination's picture: its flag (a country's, or a region's when its emoji
 * is a flag, like the EU), else its emoji or a globe.
 */
export function DestinationIcon({
  destination,
  className,
}: {
  destination: { scope: string; countryCodes: string[]; emoji: string | null };
  className?: string;
}) {
  const src = destinationFlag(destination);
  if (src) return <FlagImage src={src} className={className} />;
  return (
    <span className={className} aria-hidden="true">
      {destination.emoji || (destination.scope === "local" ? "📍" : "🌐")}
    </span>
  );
}
