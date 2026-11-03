"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadCloud, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminNumberPackage, AdminNumberPackageList, PacketLoadReport } from "@/lib/esim/admin/number-packages";

/** Admin → eSIM → Number data packages (NUM-02): the packets a number owner can buy. */

const money = (minor: number) => (minor / 100).toFixed(2);
const toCents = (value: string) => {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
};
const wholeNumber = (value: string) => (/^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : null);

interface Draft {
  id: string | null;
  packetId: string;
  name: string;
  validityDays: string;
  volumeMb: string;
  incrementStepKb: string;
  cost: string;
  currency: string;
  countries: string;
  manualPrice: boolean;
  price: string;
  active: boolean;
  sortOrder: string;
}

const draftOf = (row: AdminNumberPackage | null, nextSort: number): Draft =>
  row
    ? {
        id: row.id,
        packetId: row.packetId,
        name: row.name,
        validityDays: String(row.validityDays),
        volumeMb: row.volumeMb === null ? "" : String(row.volumeMb),
        incrementStepKb: String(row.incrementStepKb),
        cost: money(row.costMinor),
        currency: row.currency,
        countries: row.countryCodes.join(", "),
        manualPrice: row.retailPriceManual,
        price: money(row.retailPriceMinor),
        active: row.status === "active",
        sortOrder: String(row.sortOrder),
      }
    : { id: null, packetId: "", name: "", validityDays: "7", volumeMb: "", incrementStepKb: "1", cost: "", currency: "EUR", countries: "", manualPrice: false, price: "", active: false, sortOrder: String(nextSort) };

export function EsimNumberPackagesAdmin({ list, canManage }: { list: AdminNumberPackageList; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function post<T>(body: Record<string, unknown>, done: string | ((result: T) => string)) {
    setBusy(true);
    try {
      const result = await apiClient.post<T>("/api/esim/admin/number-packages", body);
      toast.success(typeof done === "string" ? done : done(result));
      setDraft(null);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const volume = (row: AdminNumberPackage) =>
    row.volumeMb === null ? t("admin.esim.unlimited", "Unlimited") : row.volumeMb >= 1000 && row.volumeMb % 1000 === 0 ? `${row.volumeMb / 1000} GB` : `${row.volumeMb} MB`;
  const nextSort = (list.rows.at(-1)?.sortOrder ?? 0) + 10;

  const values = draft
    ? {
        packetId: draft.packetId.trim(),
        name: draft.name.trim(),
        validityDays: wholeNumber(draft.validityDays),
        volumeMb: draft.volumeMb.trim() ? wholeNumber(draft.volumeMb) : null,
        incrementStepKb: wholeNumber(draft.incrementStepKb),
        costMinor: toCents(draft.cost),
        currency: draft.currency.trim().toUpperCase(),
        countryCodes: draft.countries.split(/[\s,;]+/).map((code) => code.trim().toUpperCase()).filter(Boolean),
        retailPriceMinor: draft.manualPrice ? toCents(draft.price) : null,
        status: draft.active ? "active" : "hidden",
        sortOrder: wholeNumber(draft.sortOrder) ?? 0,
      }
    : null;
  const valid =
    values !== null &&
    /^\d{1,9}$/.test(values.packetId) &&
    values.name.length > 0 &&
    values.validityDays !== null &&
    (draft!.volumeMb.trim() === "" || (values.volumeMb !== null && values.volumeMb > 0)) &&
    values.incrementStepKb !== null &&
    values.incrementStepKb > 0 &&
    values.costMinor !== null &&
    /^[A-Z]{3}$/.test(values.currency) &&
    values.countryCodes.every((code) => /^[A-Z]{2}$/.test(code)) &&
    (!draft!.manualPrice || values.retailPriceMinor !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimNumberPackages", "Number data packages")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "admin.esim.numberPackagesHint",
              "Data packets a number owner can buy. The cost is TopConnect's price, moved onto the card before the packet is switched on; the price follows the pricing rules unless you set it.",
            )}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !list.canLoad}
              title={list.canLoad ? undefined : t("admin.esim.loadPacketsNeeds", "Needs the TopConnect supplier switched on and a number in stock")}
              onClick={() =>
                post<PacketLoadReport>({ action: "load" }, (report) =>
                  t("admin.esim.packetsLoaded", "Asked for +{msisdn}: {added} added, {updated} updated, {unchanged} unchanged", {
                    msisdn: report.msisdn,
                    added: report.added.length,
                    updated: report.updated.length,
                    unchanged: report.unchanged,
                  }),
                )
              }
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
              {t("admin.esim.loadPackets", "Load from TopConnect")}
            </Button>
            <Button onClick={() => setDraft(draftOf(null, nextSort))}>
              <Plus className="mr-2 h-4 w-4" /> {t("admin.esim.addPacket", "Add packet")}
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          {list.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.esim.packet", "Packet")}</TableHead>
                  <TableHead>{t("admin.esim.packetData", "Data")}</TableHead>
                  <TableHead>{t("admin.esim.packetCountries", "Countries")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.cost", "Cost")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.priceUsd", "Price (USD)")}</TableHead>
                  <TableHead>{t("admin.esim.status", "Status")}</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id} className={row.status === "hidden" ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">#{row.packetId}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {volume(row)} · {t("admin.esim.packetDays", "{days} days", { days: row.validityDays })}
                    </TableCell>
                    <TableCell className="max-w-56 text-xs" title={row.countryCodes.join(", ")}>
                      {row.countryCodes.length ? (
                        <span className="line-clamp-2">{row.countryCodes.join(", ")}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {money(row.costMinor)} {row.currency}
                      {row.costUsdMinor !== null && row.currency !== "USD" ? <div className="text-xs text-muted-foreground">≈ ${money(row.costUsdMinor)}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {row.retailPriceManual || row.retailPriceMinor ? `$${money(row.retailPriceMinor)}` : "—"}
                      <div className="text-xs text-muted-foreground">
                        {row.retailPriceManual ? t("admin.esim.priceManual", "set by hand") : t("admin.esim.priceAuto", "by the rules")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "outline"}>
                        {row.status === "active" ? t("admin.esim.onSale", "On sale") : t("admin.esim.hidden", "Hidden")}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={row.status === "active" ? t("admin.esim.hide", "Hide") : t("admin.esim.putOnSale", "Put on sale")}
                          title={row.status === "active" ? t("admin.esim.hide", "Hide") : t("admin.esim.putOnSale", "Put on sale")}
                          onClick={() =>
                            post(
                              { action: "status", id: row.id, status: row.status === "active" ? "hidden" : "active" },
                              row.status === "active" ? t("admin.esim.packetHidden", "Hidden") : t("admin.esim.packetOnSale", "On sale"),
                            )
                          }
                        >
                          {row.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={t("admin.esim.edit", "Edit")} onClick={() => setDraft(draftOf(row, nextSort))}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={busy}
                          aria-label={t("admin.esim.remove", "Remove")}
                          onClick={async () => {
                            if (await confirm({ title: t("admin.esim.removePacket", "Remove this data package?"), description: `${row.name} (#${row.packetId})` })) {
                              await post({ action: "delete", id: row.id }, t("admin.esim.deleted", "Removed"));
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("admin.esim.noPackets", "No data packages yet. Load them from TopConnect or add one by hand.")}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("admin.esim.editPacket", "Edit data package") : t("admin.esim.addPacket", "Add packet")}</DialogTitle>
            <DialogDescription>
              {t("admin.esim.packetIdHint", "The packet ID is TopConnect's packet code, the one switched on for the card.")}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <Field id="packet-id" label={t("admin.esim.packetId", "Packet ID")}>
                  <Input id="packet-id" inputMode="numeric" value={draft.packetId} onChange={(event) => setDraft({ ...draft, packetId: event.target.value })} />
                </Field>
                <Field id="packet-name" label={t("admin.esim.packetName", "Name")}>
                  <Input id="packet-name" maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="packet-volume" label={t("admin.esim.packetVolumeMb", "Data (MB, empty = unlimited)")}>
                  <Input id="packet-volume" inputMode="numeric" value={draft.volumeMb} onChange={(event) => setDraft({ ...draft, volumeMb: event.target.value })} />
                </Field>
                <Field id="packet-days" label={t("admin.esim.packetValidity", "Valid for (days)")}>
                  <Input id="packet-days" inputMode="numeric" value={draft.validityDays} onChange={(event) => setDraft({ ...draft, validityDays: event.target.value })} />
                </Field>
                <Field id="packet-step" label={t("admin.esim.packetStep", "Billing step (KB)")}>
                  <Input id="packet-step" inputMode="numeric" value={draft.incrementStepKb} onChange={(event) => setDraft({ ...draft, incrementStepKb: event.target.value })} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr]">
                <Field id="packet-cost" label={t("admin.esim.packetCost", "TopConnect price")}>
                  <Input id="packet-cost" inputMode="decimal" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} />
                </Field>
                <Field id="packet-currency" label={t("admin.esim.currency", "Currency")}>
                  <Input id="packet-currency" maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} />
                </Field>
                <Field id="packet-price" label={t("admin.esim.priceUsd", "Price (USD)")}>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.manualPrice}
                      onCheckedChange={(manualPrice) => setDraft({ ...draft, manualPrice })}
                      aria-label={t("admin.esim.setPriceByHand", "Set the price by hand")}
                    />
                    {draft.manualPrice ? (
                      <Input id="packet-price" inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("admin.esim.priceAuto", "by the rules")}</span>
                    )}
                  </div>
                </Field>
              </div>
              <Field id="packet-countries" label={t("admin.esim.packetCountriesHint", "Countries where it works (codes, e.g. FR, DE, IT)")}>
                <Input id="packet-countries" value={draft.countries} onChange={(event) => setDraft({ ...draft, countries: event.target.value })} />
              </Field>
              <div className="grid items-end gap-3 sm:grid-cols-2">
                <Field id="packet-sort" label={t("admin.esim.sortOrder", "Sort order")}>
                  <Input id="packet-sort" inputMode="numeric" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} />
                  {t("admin.esim.onSale", "On sale")}
                </label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button disabled={busy || !valid} onClick={() => draft && values && post({ action: "save", id: draft.id, values }, t("admin.esim.saved", "Saved"))}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("admin.esim.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
