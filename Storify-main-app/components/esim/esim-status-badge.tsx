import type { Display, Tone } from "@/lib/esim/account/display";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

/** The shopper-facing status of an eSIM; `label` is already translated by the page. */
export function EsimStatusBadge({ display, label }: { display: Display; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[display.tone]}`}>
      {label}
    </span>
  );
}

export function UsageBar({ percent }: { percent: number }) {
  const color = percent <= 10 ? "bg-red-500" : percent <= 25 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
