"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import type { Figures } from "@/lib/esim/reports/build";
import type { EsimReportPage } from "@/lib/esim/reports/service";

/**
 * eSIM sales, gross margin by supplier, destination and period, and how
 * reliably and quickly eSIMs are issued (ADM-17). Amounts are USD; days UTC.
 */

const money = (minor: number) => `${(minor / 100).toFixed(2)} USD`;
const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function EsimReportsAdmin({ report }: { report: EsimReportPage }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [from, setFrom] = useState(report.range.from);
  const [to, setTo] = useState(report.range.to);

  const go = (range: { from: string; to: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", range.from);
    params.set("to", range.to);
    setFrom(range.from);
    setTo(range.to);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };
  const lastDays = (days: number) => {
    const today = new Date();
    go({ from: isoDay(new Date(today.getTime() - (days - 1) * 86_400_000)), to: isoDay(today) });
  };

  const duration = (seconds: number | null) => {
    if (seconds === null) return "—";
    if (seconds < 120) return t("admin.esim.reportSeconds", "{count} s", { count: seconds });
    return t("admin.esim.reportMinutes", "{count} min", { count: Math.round(seconds / 6) / 10 });
  };
  const { totals, fulfilment } = report;

  const stats = [
    {
      label: t("admin.esim.reportSales", "Sales"),
      value: money(totals.salesMinor),
      note: t("admin.esim.reportUnits", "{esims} eSIMs · {topups} top-ups", { esims: totals.esims, topups: totals.topups }),
    },
    {
      label: t("admin.esim.reportMargin", "Gross margin"),
      value: money(totals.marginMinor),
      note: t("admin.esim.reportMarginNote", "{percent} of sales with a known cost", { percent: percent(totals.marginPercent) }),
    },
    {
      label: t("admin.esim.reportSuccess", "Issued first time"),
      value: percent(fulfilment.successRate),
      note: t("admin.esim.reportSuccessNote", "{fulfilled} issued · {failed} failed · {open} in progress", {
        fulfilled: fulfilment.fulfilled,
        failed: fulfilment.failed,
        open: fulfilment.open,
      }),
    },
    {
      label: t("admin.esim.reportTime", "Time to issue"),
      value: duration(fulfilment.avgSeconds),
      note: t("admin.esim.reportTimeNote", "average · median {median}", { median: duration(fulfilment.medianSeconds) }),
    },
  ];

  const notes = [
    totals.costUnknown > 0
      ? t("admin.esim.reportCostUnknown", "{count} sales have no supplier cost in USD (no exchange rate at the time) and are left out of the margin.", { count: totals.costUnknown })
      : null,
    report.withoutSnapshot > 0
      ? t("admin.esim.reportNoSnapshot", "{count} eSIMs issued in this range were bought before sale records were kept, or imported, and are not counted.", { count: report.withoutSnapshot })
      : null,
    totals.voidedUnits > 0
      ? t("admin.esim.reportVoided", "{count} eSIMs ({amount}) were cancelled or refunded and are not counted as sales.", { count: totals.voidedUnits, amount: money(totals.voidedMinor) })
      : null,
  ].filter(Boolean) as string[];

  const table = (title: string, keyLabel: string, rows: Array<Figures & { key: string; scope?: string }>, empty: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pe-3 font-medium">{keyLabel}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t("admin.esim.reportColUnits", "Sold")}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t("admin.esim.reportSales", "Sales")}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t("admin.esim.reportColCost", "Cost")}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t("admin.esim.reportMargin", "Gross margin")}</th>
                  <th className="py-2 text-end font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-2 pe-3">
                      {row.key}
                      {row.scope ? <span className="ms-2 text-xs text-muted-foreground">{row.scope}</span> : null}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">{row.units}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">{money(row.salesMinor)}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {money(row.costMinor)}
                      {row.costUnknown ? <span className="ms-1 text-xs text-muted-foreground">(+{row.costUnknown}?)</span> : null}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">{money(row.marginMinor)}</td>
                    <td className="py-2 text-end tabular-nums">{percent(row.marginPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const noSales = t("admin.esim.reportNoSales", "No sales in this range.");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimReports", "Reports")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.reportsHint", "eSIM sales and gross margin at the prices and supplier costs recorded when each eSIM was bought. Amounts in USD; days in UTC.")}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            go({ from, to });
          }}
        >
          <Input type="date" aria-label={t("admin.esim.from", "From")} value={from} onChange={(event) => setFrom(event.target.value)} className="w-40" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" aria-label={t("admin.esim.to", "To")} value={to} onChange={(event) => setTo(event.target.value)} className="w-40" />
          <Button type="submit" variant="outline" size="sm">{t("admin.esim.reportApply", "Show")}</Button>
        </form>
        <div className="flex flex-wrap gap-1">
          {[7, 30, 90, 365].map((days) => (
            <Button key={days} type="button" variant="ghost" size="sm" onClick={() => lastDays(days)}>
              {t("admin.esim.reportLastDays", "Last {days} days", { days })}
            </Button>
          ))}
        </div>
        {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="space-y-1 pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-semibold tabular-nums">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.note}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {notes.length ? (
        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {notes.map((note) => (
            <p key={note} className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {note}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {table(t("admin.esim.reportBySupplier", "By supplier"), t("admin.esim.supplier", "Supplier"), report.byProvider, noSales)}
        {table(t("admin.esim.reportTopDestinations", "Top destinations"), t("admin.esim.reportDestination", "Destination"), report.byDestination, noSales)}
      </div>

      {table(
        report.range.bucket === "day" ? t("admin.esim.reportByDay", "By day") : t("admin.esim.reportByMonth", "By month"),
        t("admin.esim.reportPeriod", "Period"),
        [...report.series].reverse(),
        noSales,
      )}
    </div>
  );
}
