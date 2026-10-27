"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Check, FileText, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-notification";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import type { KycField, KycFieldType } from "@/lib/esim/kyc/rules";
import type { KycRules, SubmissionRow, SubmissionView } from "@/lib/esim/admin/kyc";

/**
 * Customer KYC (KYC-01..03): submissions to review (documents open through
 * the protected download route), the form — each publish a new version that
 * submissions keep — and which plans need it.
 */

interface Props {
  tab: "review" | "form" | "rules";
  view: SubmissionView;
  search: string;
  list: { rows: SubmissionRow[]; pending: number; pagination: { page: number; total: number; totalPages: number } };
  form: { version: number; fields: KycField[] } | null;
  rules: KycRules;
  /** Private uploads work (Settings → Storage); without it file questions cannot be answered. */
  storageReady: boolean;
  canManage: boolean;
}

const TYPES: KycFieldType[] = ["text", "textarea", "select", "date", "file"];
const STARTER: KycField[] = [
  { key: "full_name", label: "Full name as on your ID", type: "text", required: true, options: [], help: null },
  { key: "date_of_birth", label: "Date of birth", type: "date", required: true, options: [], help: null },
  { key: "id_type", label: "ID document", type: "select", required: true, options: ["Passport", "National ID card", "Driving licence"], help: null },
  { key: "id_number", label: "ID number", type: "text", required: true, options: [], help: null },
  { key: "id_photo", label: "Photo of the ID", type: "file", required: true, options: [], help: "The page with your photo, all corners visible." },
];

export function EsimKycAdmin({ tab, view, search: initialSearch, list, form, rules, storageReady, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<KycField[]>(form?.fields ?? STARTER);
  const [countries, setCountries] = useState(rules.countries.join(", "));
  const [suppliers, setSuppliers] = useState(rules.suppliers);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  async function post(path: string, body: unknown, done: string, key: string) {
    setBusy(key);
    try {
      await apiClient.post(path, body);
      toast.success(done);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const setField = (index: number, patch: Partial<KycField>) => setFields(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)));
  const move = (index: number, by: number) => {
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index + by, 0, field);
    setFields(next);
  };

  const tabs = [
    { id: "review", label: t("admin.esim.kycReview", "Review"), count: list.pending },
    { id: "form", label: t("admin.esim.kycForm", "Form") },
    { id: "rules", label: t("admin.esim.kycRules", "Which plans") },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimKyc", "KYC")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.kycHint", "Shoppers verify their identity once, in My eSIMs. A plan that needs it can then be checked out only by a verified shopper, and never by a guest.")}
        </p>
      </div>
      {!storageReady && (form?.fields ?? fields).some((field) => field.type === "file") ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("admin.esim.kycNoStorage", "File storage is not set up (Settings → Storage), so shoppers cannot upload documents. Set it up, or publish a form without file questions.")}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {tabs.map((entry) => (
          <button key={entry.id} type="button" onClick={() => navigate({ tab: entry.id === "review" ? undefined : entry.id })} className={cn("rounded-full border px-3 py-1 text-sm", tab === entry.id ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40")}>
            {entry.label}
            {"count" in entry && entry.count ? <span className="ml-1 text-xs text-muted-foreground">({entry.count})</span> : null}
          </button>
        ))}
        {isPending ? <Loader2 className="ml-2 h-5 w-5 animate-spin text-muted-foreground" /> : null}
      </div>

      {tab === "review" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NativeSelect value={view} onChange={(event) => navigate({ view: event.target.value === "pending" ? undefined : event.target.value })} className="w-44">
              <option value="pending">{t("admin.esim.kycPending", "Waiting")}</option>
              <option value="approved">{t("admin.esim.kycApproved", "Approved")}</option>
              <option value="rejected">{t("admin.esim.kycRejected", "Rejected")}</option>
              <option value="all">{t("admin.esim.kycAll", "All")}</option>
            </NativeSelect>
            <form className="relative w-full max-w-xs" onSubmit={(event) => { event.preventDefault(); navigate({ search: search.trim() || undefined }); }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.kycSearch", "Shopper email")} className="pl-9" />
            </form>
          </div>
          {list.rows.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("admin.esim.kycNone", "Nothing here.")}</CardContent></Card>
          ) : (
            list.rows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.user ?? "—"}</span>
                      <Badge variant={row.status === "rejected" ? "destructive" : row.status === "approved" ? "secondary" : "default"}>
                        {row.status === "pending" ? t("admin.esim.kycPending", "Waiting") : row.status === "approved" ? t("admin.esim.kycApproved", "Approved") : t("admin.esim.kycRejected", "Rejected")}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{t("admin.esim.kycSent", "Sent {date} · form v{version}", { date: when(row.createdAt), version: row.formVersion })}</span>
                  </div>
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {row.answers.map((answer) => (
                      <div key={answer.label} className="flex justify-between gap-3 border-b py-1">
                        <dt className="text-muted-foreground">{answer.label}</dt>
                        <dd className="text-right">
                          {answer.file ? (
                            <a href={`/api/esim/admin/kyc/file?key=${encodeURIComponent(answer.file.key)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              <FileText className="h-3.5 w-3.5" /> {answer.file.name}
                            </a>
                          ) : (answer.value ?? "—")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {row.status === "rejected" && row.reason ? <p className="text-sm text-destructive">{row.reason}</p> : null}
                  {row.status !== "pending" ? <p className="text-xs text-muted-foreground">{t("admin.esim.kycReviewedBy", "Reviewed by {who}, {date}", { who: row.reviewedBy ?? "—", date: when(row.reviewedAt) })}</p> : null}
                  {canManage && row.status === "pending" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" disabled={busy !== null} onClick={() => post(`/api/esim/admin/kyc/${row.id}`, { decision: "approved" }, t("admin.esim.kycApprovedDone", "Approved; the shopper is told"), row.id)}>
                        <Check className="mr-2 h-4 w-4" /> {t("admin.esim.kycApprove", "Approve")}
                      </Button>
                      <Input value={reasons[row.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [row.id]: event.target.value })} placeholder={t("admin.esim.kycReason", "Why it is rejected")} className="max-w-xs" maxLength={500} />
                      <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null || !(reasons[row.id] ?? "").trim()} onClick={() => post(`/api/esim/admin/kyc/${row.id}`, { decision: "rejected", reason: reasons[row.id] }, t("admin.esim.kycRejectedDone", "Rejected; the shopper is told"), row.id)}>
                        <X className="mr-2 h-4 w-4" /> {t("admin.esim.kycReject", "Reject")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
          {list.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" disabled={list.pagination.page <= 1} onClick={() => navigate({ page: String(list.pagination.page - 1) })}>‹</Button>
              <span className="text-sm text-muted-foreground">{list.pagination.page} / {list.pagination.totalPages}</span>
              <Button size="sm" variant="outline" disabled={list.pagination.page >= list.pagination.totalPages} onClick={() => navigate({ page: String(list.pagination.page + 1) })}>›</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "form" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{form ? t("admin.esim.kycFormVersion", "Form — version {version} is live", { version: form.version }) : t("admin.esim.kycFormNone", "Form — not published yet")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("admin.esim.kycFormHint", "Publishing makes a new version; submissions keep the version they answered.")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_auto]">
                <div className="space-y-2">
                  <Input value={field.label} disabled={!canManage} onChange={(event) => setField(index, { label: event.target.value })} placeholder={t("admin.esim.kycLabel", "Question")} />
                  {field.type === "select" ? (
                    <Input value={field.options.join(", ")} disabled={!canManage} onChange={(event) => setField(index, { options: event.target.value.split(",").map((option) => option.trim()) })} placeholder={t("admin.esim.kycOptions", "Choices, separated by commas")} />
                  ) : null}
                  <Input value={field.help ?? ""} disabled={!canManage} onChange={(event) => setField(index, { help: event.target.value || null })} placeholder={t("admin.esim.kycHelp", "Help text (optional)")} />
                </div>
                <div className="space-y-2">
                  <NativeSelect value={field.type} disabled={!canManage} onChange={(event) => setField(index, { type: event.target.value as KycFieldType })}>
                    {TYPES.map((type) => <option key={type} value={type}>{t(`admin.esim.kycType.${type}`, type)}</option>)}
                  </NativeSelect>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={field.required} disabled={!canManage} onCheckedChange={(required) => setField(index, { required })} />
                    {t("admin.esim.kycRequired", "Required")}
                  </label>
                </div>
                {canManage ? (
                  <div className="flex gap-1 sm:flex-col">
                    <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("admin.esim.moveUp", "Move up")}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label={t("admin.esim.moveDown", "Move down")}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setFields(fields.filter((_, at) => at !== index))} aria-label={t("admin.esim.remove", "Remove")}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ) : null}
              </div>
            ))}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setFields([...fields, { key: "", label: "", type: "text", required: false, options: [], help: null }])}>
                  <Plus className="mr-2 h-4 w-4" /> {t("admin.esim.kycAddField", "Add a question")}
                </Button>
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => post("/api/esim/admin/kyc", { action: "publish", form: { fields } }, t("admin.esim.kycPublished", "Published"), "publish")}>
                  {busy === "publish" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("admin.esim.kycPublish", "Publish as a new version")}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "rules" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.esim.kycRules", "Which plans")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.esim.kycRulesHint", "A plan needs KYC when it is set so in the plan library; otherwise when it covers a listed country; otherwise when its supplier says so. Set in the plan library: {required} need it, {notRequired} do not.", { required: rules.planOverrides.required, notRequired: rules.planOverrides.notRequired })}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="kyc-countries">{t("admin.esim.kycCountries", "Countries that need it (two-letter codes)")}</Label>
              <Input id="kyc-countries" value={countries} disabled={!canManage} onChange={(event) => setCountries(event.target.value.toUpperCase())} placeholder="CN, KR" />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.esim.kycSuppliers", "Suppliers whose plans need it")}</Label>
              {suppliers.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.esim.kycNoSuppliers", "No suppliers yet.")}</p> : null}
              {suppliers.map((supplier, index) => (
                <label key={supplier.code} className="flex items-center gap-3 text-sm">
                  <Switch checked={supplier.required} disabled={!canManage} onCheckedChange={(required) => setSuppliers(suppliers.map((entry, at) => (at === index ? { ...entry, required } : entry)))} />
                  {supplier.name} <span className="text-xs text-muted-foreground">{supplier.code}</span>
                </label>
              ))}
            </div>
            {canManage ? (
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => post("/api/esim/admin/kyc", {
                  action: "rules",
                  rules: { countries: countries.split(/[\s,]+/).filter(Boolean), suppliers: suppliers.map(({ code, required }) => ({ code, required })) },
                }, t("admin.esim.saved", "Saved"), "rules")}
              >
                {busy === "rules" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("common.save", "Save")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
