"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminNumber, AdminNumberFilters, AdminNumberList, NumberImportReport } from "@/lib/esim/admin/numbers";
import type { EsimNumberStatus } from "@/models/esim-number.model";

/** Admin → eSIM → Numbers (NUM-01): the number-card stock. The query string is the table's state. */

const STATUSES: Array<EsimNumberStatus | "all"> = ["all", "available", "reserved", "sold", "retired"];
const STATUS_VARIANT: Record<EsimNumberStatus, "default" | "secondary" | "outline" | "destructive"> = {
  available: "default",
  reserved: "outline",
  sold: "secondary",
  retired: "destructive",
};

const dollars = (minor: number) => (minor / 100).toFixed(2);
const toCents = (value: string) => {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
};

const PROBLEM_LABELS: Record<NumberImportReport["problems"][number]["reason"], [string, string]> = {
  fields: ["admin.esim.numberProblemFields", "too few fields"],
  msisdn: ["admin.esim.numberProblemMsisdn", "not a phone number"],
  iccid: ["admin.esim.numberProblemIccid", "ICCID is not 18–22 digits"],
  lpa: ["admin.esim.numberProblemLpa", "no valid LPA"],
  price: ["admin.esim.numberProblemPrice", "price is not an amount"],
  duplicate: ["admin.esim.numberProblemDuplicate", "repeated in this batch"],
};

export function EsimNumbersAdmin({ list, filters, canManage }: { list: AdminNumberList; filters: AdminNumberFilters; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search ?? "");
  const [editing, setEditing] = useState<{ row: AdminNumber; price: string; premium: string; note: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const statusLabel = (status: EsimNumberStatus | "all") =>
    ({
      all: t("admin.esim.numbersAll", "All"),
      available: t("admin.esim.numberAvailable", "Free"),
      reserved: t("admin.esim.numberReserved", "Held"),
      sold: t("admin.esim.numberSold", "Sold"),
      retired: t("admin.esim.numberRetired", "Off sale"),
    })[status];

  function go(next: Partial<AdminNumberFilters>) {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();
    if (merged.status && merged.status !== "all") query.set("status", merged.status);
    if (merged.dialCode) query.set("dialCode", merged.dialCode);
    if (merged.search?.trim()) query.set("search", merged.search.trim());
    if (merged.page && merged.page > 1) query.set("page", String(merged.page));
    startTransition(() => router.push(query.size ? `${pathname}?${query}` : pathname));
  }

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await apiClient.post("/api/esim/admin/numbers", body);
      toast.success(done);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const free = (row: AdminNumber) => row.status === "available" || row.status === "retired";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimNumbers", "Numbers")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.esim.numbersHint", "TopConnect number cards held as stock. {available} free · {reserved} held · {sold} sold · {retired} off sale", list.counts)}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setImporting(true)}>
            <Upload className="mr-2 h-4 w-4" /> {t("admin.esim.importNumbers", "Import numbers")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border p-1">
          {STATUSES.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={(filters.status ?? "all") === status ? "default" : "ghost"}
              onClick={() => go({ status, page: 1 })}
            >
              {statusLabel(status)}
            </Button>
          ))}
        </div>
        <Select value={filters.dialCode ?? "any"} onValueChange={(value) => go({ dialCode: value === "any" ? undefined : value, page: 1 })}>
          <SelectTrigger className="w-36" aria-label={t("admin.esim.dialCode", "Country code")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("admin.esim.anyDialCode", "Any code")}</SelectItem>
            {list.dialCodes.map((code) => (
              <SelectItem key={code} value={code}>
                +{code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="relative min-w-60 flex-1 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            go({ search, page: 1 });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.esim.searchNumbers", "Number, ICCID, batch or customer email")}
            className="pl-9"
          />
        </form>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          {list.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.esim.number", "Number")}</TableHead>
                  <TableHead>ICCID</TableHead>
                  <TableHead className="text-right">{t("admin.esim.numberPrice", "Price")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.numberPremium", "Premium")}</TableHead>
                  <TableHead>{t("admin.esim.status", "Status")}</TableHead>
                  <TableHead>{t("admin.esim.customer", "Customer")}</TableHead>
                  <TableHead>{t("admin.esim.batch", "Batch")}</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      +{row.dialCode} {row.nationalNumber}
                      {row.country ? <span className="ml-1 text-xs text-muted-foreground">{row.country}</span> : null}
                      {row.note ? <div className="max-w-56 truncate text-xs font-normal text-muted-foreground">{row.note}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.iccid}</TableCell>
                    <TableCell className="text-right tabular-nums">{dollars(row.priceMinor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.premiumMinor ? dollars(row.premiumMinor) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{statusLabel(row.status)}</Badge>
                      {row.reservedUntil && row.status === "reserved" ? (
                        <div className="text-xs text-muted-foreground">
                          {t("admin.esim.heldUntil", "until {time}", { time: new Date(row.reservedUntil).toLocaleTimeString() })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{row.customer ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.batch ?? ""}</TableCell>
                    {canManage ? (
                      <TableCell className="whitespace-nowrap text-right">
                        {free(row) ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("admin.esim.edit", "Edit")}
                              onClick={() => setEditing({ row, price: dollars(row.priceMinor), premium: dollars(row.premiumMinor), note: row.note ?? "" })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={t("admin.esim.remove", "Remove")}
                              onClick={async () => {
                                if (await confirm({ title: t("admin.esim.removeNumber", "Remove this number from stock?"), description: `+${row.msisdn}` })) {
                                  await post({ action: "delete", ids: [row.id] }, t("admin.esim.deleted", "Removed"));
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.esim.noNumbers", "No numbers match.")}</p>
          )}
          {list.pages > 1 ? (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">{t("admin.esim.pageOf", "Page {page} of {pages} · {total} numbers", { page: list.page, pages: list.pages, total: list.total })}</span>
              <Button size="icon" variant="outline" disabled={list.page <= 1} onClick={() => go({ page: list.page - 1 })} aria-label={t("admin.esim.previous", "Previous")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" disabled={list.page >= list.pages} onClick={() => go({ page: list.page + 1 })} aria-label={t("admin.esim.next", "Next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `+${editing.row.dialCode} ${editing.row.nationalNumber}` : ""}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="number-price">{t("admin.esim.numberPriceUsd", "Price (USD)")}</Label>
                  <Input id="number-price" inputMode="decimal" value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="number-premium">{t("admin.esim.numberPremiumUsd", "Premium for a memorable number (USD)")}</Label>
                  <Input id="number-premium" inputMode="decimal" value={editing.premium} onChange={(event) => setEditing({ ...editing, premium: event.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="number-note">{t("admin.esim.note", "Note")}</Label>
                <Input id="number-note" maxLength={500} value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  post(
                    { action: "update", id: editing.row.id, status: editing.row.status === "retired" ? "available" : "retired" },
                    editing.row.status === "retired" ? t("admin.esim.numberBackOnSale", "Back on sale") : t("admin.esim.numberTakenOff", "Taken off sale"),
                  )
                }
              >
                {editing.row.status === "retired" ? t("admin.esim.putOnSale", "Put back on sale") : t("admin.esim.takeOffSale", "Take off sale")}
              </Button>
            ) : null}
            <Button
              disabled={busy || !editing || toCents(editing.price) === null || toCents(editing.premium) === null}
              onClick={() =>
                editing &&
                post(
                  { action: "update", id: editing.row.id, priceMinor: toCents(editing.price), premiumMinor: toCents(editing.premium), note: editing.note || null },
                  t("admin.esim.saved", "Saved"),
                )
              }
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("admin.esim.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          setImporting(false);
          router.refresh();
        }}
        problemLabel={(reason) => t(...PROBLEM_LABELS[reason])}
      />
    </div>
  );
}

function ImportDialog({
  open,
  onClose,
  onImported,
  problemLabel,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  problemLabel: (reason: NumberImportReport["problems"][number]["reason"]) => string;
}) {
  const t = useFallbackTranslator(useTranslations());
  const [form, setForm] = useState({ text: "", dialCode: "", price: "", premium: "0", batch: "" });
  const [report, setReport] = useState<{ dryRun: boolean; result: NumberImportReport } | null>(null);
  const [busy, setBusy] = useState(false);
  const price = toCents(form.price);
  const premium = toCents(form.premium || "0");
  const ready = form.text.trim() && price !== null && premium !== null;

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const result = await apiClient.post<NumberImportReport>("/api/esim/admin/numbers", {
        action: "import",
        text: form.text,
        dialCode: form.dialCode.trim(),
        priceMinor: price,
        premiumMinor: premium,
        batch: form.batch.trim() || undefined,
        dryRun,
      });
      setReport({ dryRun, result });
      if (!dryRun) {
        toast.success(t("admin.esim.numbersImported", "{count} numbers imported", { count: result.imported }));
        if (!result.problems.length) {
          setForm({ text: "", dialCode: form.dialCode, price: form.price, premium: form.premium, batch: "" });
          setReport(null);
          onImported();
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("admin.esim.importNumbers", "Import numbers")}</DialogTitle>
          <DialogDescription>
            {t(
              "admin.esim.importNumbersHint",
              "One card per line, as TopConnect sends them: MSISDN ICCID LPA PIN1 PUK1 PIN2 PUK2, separated by spaces, tabs or commas. A line may end with its own price and premium. Numbers already in stock are skipped.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            rows={8}
            className="font-mono text-xs"
            value={form.text}
            placeholder="37255501234 8937204017000000001 LPA:1$rsp.example.com$ABC 1234 12345678 5678 87654321"
            onChange={(event) => {
              setForm({ ...form, text: event.target.value });
              setReport(null);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="import-dial">{t("admin.esim.dialCode", "Country code")}</Label>
              <Input id="import-dial" placeholder="372" value={form.dialCode} onChange={(event) => setForm({ ...form, dialCode: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-price">{t("admin.esim.numberPriceUsd", "Price (USD)")}</Label>
              <Input id="import-price" inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-premium">{t("admin.esim.numberPremiumShort", "Premium (USD)")}</Label>
              <Input id="import-premium" inputMode="decimal" value={form.premium} onChange={(event) => setForm({ ...form, premium: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-batch">{t("admin.esim.batch", "Batch")}</Label>
              <Input id="import-batch" maxLength={80} value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.esim.dialCodeHint", "Leave the country code empty when every number already starts with its own.")}
          </p>
          {report ? (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">
                {report.dryRun
                  ? t("admin.esim.numbersCheckResult", "{imported} would be imported · {existing} already in stock · {problems} lines with problems", {
                      imported: report.result.imported,
                      existing: report.result.existing,
                      problems: report.result.problems.length,
                    })
                  : t("admin.esim.numbersImportResult", "{imported} imported · {existing} already in stock · {problems} lines with problems", {
                      imported: report.result.imported,
                      existing: report.result.existing,
                      problems: report.result.problems.length,
                    })}
              </div>
              {report.result.problems.length ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {report.result.problems.slice(0, 100).map((problem) => (
                    <li key={problem.line}>
                      <span className="font-medium text-destructive">
                        {t("admin.esim.lineNumber", "Line {line}", { line: problem.line })}: {problemLabel(problem.reason)}
                      </span>{" "}
                      <span className="font-mono text-muted-foreground">{problem.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy || !ready} onClick={() => run(true)}>
            {t("admin.esim.check", "Check")}
          </Button>
          <Button disabled={busy || !ready} onClick={() => run(false)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("admin.esim.import", "Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
