"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, Loader2, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminDevice } from "@/lib/esim/admin/devices";

/** The device-compatibility list the storefront's device check reads (ADM-11). */
export function EsimDevicesAdmin({
  list,
  search: initialSearch,
  canManage,
}: {
  list: { rows: AdminDevice[]; usingBuiltIn: boolean; builtInCount: number };
  search: string;
  canManage: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [editing, setEditing] = useState<Partial<AdminDevice> | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await apiClient.post("/api/esim/admin/devices", body);
      toast.success(done);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimDevices", "Devices")}</h1>
          <p className="text-sm text-muted-foreground">
            {list.usingBuiltIn
              ? t("admin.esim.devicesBuiltIn", "The store shows the built-in list of {count} models. Import it to change it, or add models one by one.", { count: list.builtInCount })
              : t("admin.esim.devicesHint", "The phones and tablets the device check on the store knows.")}
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => post({ action: "import" }, t("admin.esim.imported", "Built-in list imported"))}>
              <Download className="mr-2 h-4 w-4" /> {t("admin.esim.importBuiltIn", "Import built-in list")}
            </Button>
            <Button onClick={() => setEditing({ brand: "", model: "", supported: true, note: "" })}>
              <Plus className="mr-2 h-4 w-4" /> {t("admin.esim.addDevice", "Add model")}
            </Button>
          </div>
        ) : null}
      </div>

      <form
        className="relative max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => router.push(search.trim() ? `${pathname}?search=${encodeURIComponent(search.trim())}` : pathname));
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.searchDevices", "Brand or model")} className="pl-9" />
      </form>

      <Card>
        <CardContent className="pt-6">
          {isPending ? <Loader2 className="mb-2 h-4 w-4 animate-spin" /> : null}
          {list.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.esim.brand", "Brand")}</TableHead>
                  <TableHead>{t("admin.esim.model", "Model")}</TableHead>
                  <TableHead>{t("admin.esim.supportsEsim", "eSIM")}</TableHead>
                  <TableHead>{t("admin.esim.note", "Note")}</TableHead>
                  {canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.brand}</TableCell>
                    <TableCell className="font-medium">{row.model}</TableCell>
                    <TableCell>{row.supported ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">{row.note ?? ""}</TableCell>
                    {canManage ? (
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            if (await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description: `${row.brand} ${row.model}` })) {
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
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.esim.noDevices", "No models in the list yet.")}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("admin.esim.editDevice", "Edit model") : t("admin.esim.addDevice", "Add model")}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="device-brand">{t("admin.esim.brand", "Brand")}</Label>
                  <Input id="device-brand" value={editing.brand ?? ""} onChange={(event) => setEditing({ ...editing, brand: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="device-model">{t("admin.esim.model", "Model")}</Label>
                  <Input id="device-model" value={editing.model ?? ""} onChange={(event) => setEditing({ ...editing, model: event.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device-note">{t("admin.esim.note", "Note")}</Label>
                <Input id="device-note" value={editing.note ?? ""} maxLength={300} onChange={(event) => setEditing({ ...editing, note: event.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="device-supported" checked={editing.supported ?? true} onCheckedChange={(supported) => setEditing({ ...editing, supported })} />
                <Label htmlFor="device-supported">{t("admin.esim.supportsEsimLabel", "Supports eSIM")}</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              disabled={busy || !editing?.brand?.trim() || !editing?.model?.trim()}
              onClick={() =>
                editing &&
                post(
                  { action: "save", id: editing.id, brand: editing.brand, model: editing.model, supported: editing.supported ?? true, note: editing.note || null },
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
    </div>
  );
}
