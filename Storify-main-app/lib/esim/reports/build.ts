/**
 * The eSIM report (ADM-17), from rows already read. Pure.
 *
 * Sales are eSIMs issued and top-ups completed in the range, at what the
 * shopper paid (the sale snapshot, ORD-04). Margin counts only the sales
 * whose supplier cost is known in USD; the rest are counted in `costUnknown`
 * so a missing rate never reads as pure profit. An eSIM later cancelled or
 * refunded leaves the sales and is counted as voided. Days are UTC.
 */

export interface SaleRow {
  kind: "esim" | "topup";
  at: Date;
  providerCode: string;
  destination: string;
  scope: string;
  saleMinor: number;
  costUsdMinor: number | null;
  voided: boolean;
}

export interface JobRow {
  state: "review" | "queued" | "purchasing" | "provider_pending" | "fulfilled" | "failed";
  createdAt: Date;
  /** When it was issued; null unless fulfilled. */
  doneAt: Date | null;
}

export type Bucket = "day" | "month";

export interface Figures {
  units: number;
  salesMinor: number;
  costMinor: number;
  marginMinor: number;
  /** Margin over the sales whose cost is known; null when none is. */
  marginPercent: number | null;
  costUnknown: number;
}

export interface EsimReport {
  totals: Figures & { esims: number; topups: number; voidedUnits: number; voidedMinor: number };
  byProvider: Array<Figures & { key: string }>;
  byDestination: Array<Figures & { key: string; scope: string }>;
  series: Array<Figures & { key: string }>;
  fulfilment: {
    total: number;
    fulfilled: number;
    failed: number;
    open: number;
    /** Fulfilled over fulfilled and failed; null before anything finished. */
    successRate: number | null;
    avgSeconds: number | null;
    medianSeconds: number | null;
  };
}

const empty = (): Figures => ({ units: 0, salesMinor: 0, costMinor: 0, marginMinor: 0, marginPercent: null, costUnknown: 0 });

/** Sales with a known cost, kept apart so the margin percent uses only those. */
type Tally = Figures & { knownSalesMinor: number };

function add(tally: Tally, row: SaleRow) {
  tally.units += 1;
  tally.salesMinor += row.saleMinor;
  if (row.costUsdMinor === null) {
    tally.costUnknown += 1;
    return;
  }
  tally.costMinor += row.costUsdMinor;
  tally.marginMinor += row.saleMinor - row.costUsdMinor;
  tally.knownSalesMinor += row.saleMinor;
}

function done({ knownSalesMinor, ...figures }: Tally): Figures {
  return {
    ...figures,
    marginPercent: knownSalesMinor > 0 ? Math.round((figures.marginMinor / knownSalesMinor) * 1000) / 10 : null,
  };
}

export function bucketKey(at: Date, bucket: Bucket): string {
  const iso = at.toISOString();
  return bucket === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

/** Every bucket from `from` up to (not including) `to`, so quiet days still show. */
export function bucketsBetween(from: Date, to: Date, bucket: Bucket): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), bucket === "day" ? from.getUTCDate() : 1));
  while (cursor < to && keys.length < 400) {
    keys.push(bucketKey(cursor, bucket));
    if (bucket === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export function buildReport(
  input: { sales: SaleRow[]; jobs: JobRow[] },
  options: { from: Date; to: Date; bucket: Bucket; topDestinations?: number },
): EsimReport {
  const total: Tally = { ...empty(), knownSalesMinor: 0 };
  const providers = new Map<string, Tally>();
  const destinations = new Map<string, Tally & { scope: string }>();
  const series = new Map<string, Tally>(
    bucketsBetween(options.from, options.to, options.bucket).map((key) => [key, { ...empty(), knownSalesMinor: 0 }]),
  );
  let esims = 0;
  let topups = 0;
  let voidedUnits = 0;
  let voidedMinor = 0;

  for (const row of input.sales) {
    if (row.voided) {
      voidedUnits += 1;
      voidedMinor += row.saleMinor;
      continue;
    }
    if (row.kind === "esim") esims += 1;
    else topups += 1;
    add(total, row);
    const provider = providers.get(row.providerCode) ?? { ...empty(), knownSalesMinor: 0 };
    add(provider, row);
    providers.set(row.providerCode, provider);
    const destinationKey = row.destination || "—";
    const destination = destinations.get(destinationKey) ?? { ...empty(), knownSalesMinor: 0, scope: row.scope };
    add(destination, row);
    destinations.set(destinationKey, destination);
    const key = bucketKey(row.at, options.bucket);
    const slot = series.get(key) ?? { ...empty(), knownSalesMinor: 0 };
    add(slot, row);
    series.set(key, slot);
  }

  const durations: number[] = [];
  let fulfilled = 0;
  let failed = 0;
  for (const job of input.jobs) {
    if (job.state === "fulfilled") {
      fulfilled += 1;
      if (job.doneAt) durations.push(Math.max(0, Math.round((job.doneAt.getTime() - job.createdAt.getTime()) / 1000)));
    } else if (job.state === "failed") {
      failed += 1;
    }
  }
  const finished = fulfilled + failed;

  return {
    totals: { ...done(total), esims, topups, voidedUnits, voidedMinor },
    byProvider: [...providers.entries()]
      .map(([key, tally]) => ({ key, ...done(tally) }))
      .sort((a, b) => b.salesMinor - a.salesMinor || a.key.localeCompare(b.key)),
    byDestination: [...destinations.entries()]
      .map(([key, { scope, ...tally }]) => ({ key, scope, ...done(tally) }))
      .sort((a, b) => b.units - a.units || b.salesMinor - a.salesMinor || a.key.localeCompare(b.key))
      .slice(0, options.topDestinations ?? 20),
    series: [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, tally]) => ({ key, ...done(tally) })),
    fulfilment: {
      total: input.jobs.length,
      fulfilled,
      failed,
      open: input.jobs.length - finished,
      successRate: finished ? Math.round((fulfilled / finished) * 1000) / 10 : null,
      avgSeconds: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      medianSeconds: median(durations),
    },
  };
}

/** The range a request asks for: `from`/`to` as YYYY-MM-DD (to inclusive), the last 30 days by default, at most a year. */
export function reportRange(input: { from?: string; to?: string }, now = new Date()) {
  const day = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const toDay = day(input.to) ?? today;
  const to = new Date(toDay.getTime() + 86_400_000);
  let from = day(input.from) ?? new Date(to.getTime() - 30 * 86_400_000);
  if (from >= to) from = new Date(to.getTime() - 86_400_000);
  if (to.getTime() - from.getTime() > 366 * 86_400_000) from = new Date(to.getTime() - 366 * 86_400_000);
  const bucket: Bucket = to.getTime() - from.getTime() > 62 * 86_400_000 ? "month" : "day";
  return { from, to, bucket, fromKey: from.toISOString().slice(0, 10), toKey: toDay.toISOString().slice(0, 10) };
}
