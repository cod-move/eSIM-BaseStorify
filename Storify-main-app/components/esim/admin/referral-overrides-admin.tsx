"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { ReferralSettings } from "@/lib/esim/referral/rules";
import type { ReferralOverrideRow } from "@/lib/esim/admin/referrals";
import { formatMb } from "@/lib/esim/telegram/format";

/**
 * Referrers with rules of their own (REF-07): an admin sets a referrer's
 * reward, its limits or turns referrals on/off for them alone; every field
 * left on "store default" follows the settings above.
 */

interface Props {
  settings: ReferralSettings;
  rows: ReferralOverrideRow[];
  canManage: boolean;
}

interface Draft {
  email: string;
  enabled: "" | "on" | "off";
  rewardType: "" | "credit" | "data";
  referrerMb: string;
  referrerOn: "" | "signup" | "first_order";
  inviteeMb: string;
  inviteeOn: "" | "signup" | "first_order";
  commissionType: "" | "percent" | "fixed";
  /** As typed: percent, or USD for a fixed reward. */
  commissionValue: string;
  validityDays: string;
  orderLimit: string;
  deductPercent: string;
  note: string;
}

const EMPTY: Draft = { email: "", enabled: "", rewardType: "", referrerMb: "", referrerOn: "", inviteeMb: "", inviteeOn: "", commissionType: "", commissionValue: "", validityDays: "", orderLimit: "", deductPercent: "", note: "" };

function toDraft(row: ReferralOverrideRow): Draft {
  return {
    email: row.email ?? "",
    enabled: row.enabled === null ? "" : row.enabled ? "on" : "off",
    rewardType: row.rewardType ?? "",
    referrerMb: row.referrerMb === null ? "" : String(row.referrerMb),
    referrerOn: row.referrerOn ?? "",
    inviteeMb: row.inviteeMb === null ? "" : String(row.inviteeMb),
    inviteeOn: row.inviteeOn ?? "",
    commissionType: row.commissionType ?? "",
    commissionValue: row.commissionValue === null ? "" : String(row.commissionType === "fixed" ? row.commissionValue / 100 : row.commissionValue),
    validityDays: row.validityDays === null ? "" : String(row.validityDays),
    orderLimit: row.orderLimit === null ? "" : String(row.orderLimit),
    deductPercent: row.deductPercent === null ? "" : String(row.deductPercent),
    note: row.note ?? "",
  };
}

const int = (text: string) => (text.trim() === "" ? null : Math.max(0, Math.round(Number(text) || 0)));

export function EsimReferralOverridesAdmin({ settings, rows, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);

  const reward = (type: "percent" | "fixed", value: number) => (type === "percent" ? `${value}%` : `${(value / 100).toFixed(2)} USD`);
  const storeDefault = t("admin.esim.referralStoreDefault", "Store default");

  async function save() {
    const type = draft.commissionType || null;
    const typed = draft.commissionValue.trim() === "" ? null : Math.max(0, Number(draft.commissionValue) || 0);
    setBusy("save");
    try {
      await apiClient.post("/api/esim/admin/referrals/users", {
        email: draft.email.trim(),
        enabled: draft.enabled === "" ? null : draft.enabled === "on",
        rewardType: draft.rewardType || null,
        referrerMb: int(draft.referrerMb),
        referrerOn: draft.referrerOn || null,
        inviteeMb: int(draft.inviteeMb),
        inviteeOn: draft.inviteeOn || null,
        commissionType: type,
        commissionValue: typed === null ? null : type === "fixed" ? Math.round(typed * 100) : typed,
        validityDays: int(draft.validityDays),
        orderLimit: int(draft.orderLimit),
        deductPercent: draft.deductPercent.trim() === "" ? null : Math.min(100, int(draft.deductPercent) ?? 0),
        note: draft.note.trim() || null,
      });
      toast.success(t("admin.esim.saved", "Saved"));
      setDraft(EMPTY);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: ReferralOverrideRow) {
    setBusy(row.userId);
    try {
      await apiClient.delete(`/api/esim/admin/referrals/users/${row.userId}`);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const field = (label: string, key: "commissionValue" | "validityDays" | "orderLimit" | "deductPercent" | "referrerMb" | "inviteeMb", placeholder: string, step = "1") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} step={step} disabled={!canManage} placeholder={placeholder} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    </div>
  );

  const effectiveType = draft.commissionType || settings.commissionType;
  const effectiveReward = draft.rewardType || settings.rewardType;
  const whenLabel = (on: "signup" | "first_order") => (on === "signup" ? t("admin.esim.referralOnSignup", "When the friend signs up") : t("admin.esim.referralOnFirstOrder", "On the friend's first order"));
  const trigger = (key: "referrerOn" | "inviteeOn", store: "signup" | "first_order") => (
    <div className="space-y-1.5">
      <Label>{t("admin.esim.referralWhen", "When")}</Label>
      <NativeSelect value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value as Draft["referrerOn"] })}>
        <option value="">{storeDefault} ({whenLabel(store)})</option>
        <option value="signup">{whenLabel("signup")}</option>
        <option value="first_order">{whenLabel("first_order")}</option>
      </NativeSelect>
    </div>
  );
  const rewardLabel = (row: ReferralOverrideRow) => {
    const type = row.rewardType ?? settings.rewardType;
    if (type === "data") {
      const referrer = row.referrerMb ?? settings.data.referrerMb;
      const invitee = row.inviteeMb ?? settings.data.inviteeMb;
      return `${t("admin.esim.referralTypeData", "Bonus data")}: ${formatMb(referrer)} / ${formatMb(invitee)}${row.rewardType === null && row.referrerMb === null && row.inviteeMb === null ? ` (${storeDefault})` : ""}`;
    }
    return row.commissionType ? reward(row.commissionType, row.commissionValue ?? 0) : storeDefault;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.referralOverrides", "Referrers with their own rules")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.referralOverridesHint", "Give one referrer a reward, limits or on/off of their own. Fields left empty follow the settings above. Validity applies to friends who join after the change; a reward is fixed when it is earned.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("admin.esim.referralOverrideEmail", "Referrer's email")}</Label>
                <Input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.referralEnabled", "Referrals on")}</Label>
                <NativeSelect value={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.value as Draft["enabled"] })}>
                  <option value="">{storeDefault} ({settings.enabled ? t("admin.esim.on", "On") : t("admin.esim.off", "Off")})</option>
                  <option value="on">{t("admin.esim.on", "On")}</option>
                  <option value="off">{t("admin.esim.off", "Off")}</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.referralRewardType", "Reward type")}</Label>
                <NativeSelect value={draft.rewardType} onChange={(event) => setDraft({ ...draft, rewardType: event.target.value as Draft["rewardType"] })}>
                  <option value="">
                    {storeDefault} ({settings.rewardType === "data" ? t("admin.esim.referralTypeData", "Bonus data") : t("admin.esim.referralTypeCredit", "Balance commission")})
                  </option>
                  <option value="credit">{t("admin.esim.referralTypeCredit", "Balance commission")}</option>
                  <option value="data">{t("admin.esim.referralTypeData", "Bonus data")}</option>
                </NativeSelect>
              </div>
              {effectiveReward === "data" ? (
                <>
                  <div />
                  <div />
                  {field(`${t("admin.esim.referralDataReferrer", "The inviter gets")} (MB)`, "referrerMb", `${storeDefault}: ${settings.data.referrerMb}`)}
                  {trigger("referrerOn", settings.data.referrerOn)}
                  <div />
                  {field(`${t("admin.esim.referralDataInvitee", "The invited friend gets")} (MB)`, "inviteeMb", `${storeDefault}: ${settings.data.inviteeMb}`)}
                  {trigger("inviteeOn", settings.data.inviteeOn)}
                  <div />
                </>
              ) : null}
              <div className={effectiveReward === "data" ? "hidden" : "space-y-1.5"}>
                <Label>{t("admin.esim.referralReward", "Reward")}</Label>
                <NativeSelect value={draft.commissionType} onChange={(event) => setDraft({ ...draft, commissionType: event.target.value as Draft["commissionType"], commissionValue: "" })}>
                  <option value="">{storeDefault} ({reward(settings.commissionType, settings.commissionValue)})</option>
                  <option value="percent">{t("admin.esim.referralPercent", "% of each order")}</option>
                  <option value="fixed">{t("admin.esim.referralFixed", "Fixed amount per order")}</option>
                </NativeSelect>
              </div>
              {draft.commissionType && effectiveReward === "credit"
                ? field(`${t("admin.esim.referralValue", "Value")} (${effectiveType === "percent" ? "%" : "USD"})`, "commissionValue", "", effectiveType === "percent" ? "0.1" : "0.01")
                : <div />}
              <div />
              {field(t("admin.esim.referralValidity", "Earns for"), "validityDays", `${storeDefault}: ${settings.validityDays}`)}
              {field(t("admin.esim.referralLimit", "Orders that earn"), "orderLimit", `${storeDefault}: ${settings.orderLimit}`)}
              {field(t("admin.esim.referralDeduct", "Deduction (扣量) %"), "deductPercent", `${storeDefault}: ${settings.deductPercent}%`)}
              <div className="space-y-1.5">
                <Label>{t("admin.esim.note", "Note")}</Label>
                <Input value={draft.note} maxLength={300} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!draft.email.trim() || busy !== null}>
                {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("common.save", "Save")}
              </Button>
              {draft !== EMPTY ? <Button size="sm" variant="ghost" onClick={() => setDraft(EMPTY)}>{t("common.clear", "Clear")}</Button> : null}
            </div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("admin.esim.referralOverridesNone", "Every referrer follows the store-wide rules.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.esim.referralReferrer", "Referrer")}</TableHead>
                <TableHead>{t("admin.esim.referralEnabled", "Referrals on")}</TableHead>
                <TableHead>{t("admin.esim.referralReward", "Reward")}</TableHead>
                <TableHead>{t("admin.esim.referralValidity", "Earns for")}</TableHead>
                <TableHead>{t("admin.esim.referralLimit", "Orders that earn")}</TableHead>
                <TableHead>{t("admin.esim.referralDeduct", "Deduction (扣量)")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="text-sm">
                    {row.email ?? row.userId}
                    <div className="text-xs text-muted-foreground">{t("admin.esim.referralOverrideFriends", "{count} friends joined", { count: row.referrals })}{row.note ? ` · ${row.note}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.enabled === null ? storeDefault : row.enabled ? t("admin.esim.on", "On") : t("admin.esim.off", "Off")}</TableCell>
                  <TableCell className="text-sm">{rewardLabel(row)}</TableCell>
                  <TableCell className="text-sm">{row.validityDays === null ? storeDefault : row.validityDays}</TableCell>
                  <TableCell className="text-sm">{row.orderLimit === null ? storeDefault : row.orderLimit}</TableCell>
                  <TableCell className="text-sm">{row.deductPercent === null ? storeDefault : `${row.deductPercent}%`}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {canManage ? (
                      <>
                        <Button size="sm" variant="outline" className="mr-2" disabled={busy !== null} onClick={() => setDraft(toDraft(row))}>{t("common.edit", "Edit")}</Button>
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => remove(row)}>{t("admin.esim.referralOverrideReset", "Use store default")}</Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
