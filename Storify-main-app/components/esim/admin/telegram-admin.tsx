"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatMb } from "@/lib/esim/telegram/format";
import type { AdminRewardRow, TelegramSettingsView } from "@/lib/esim/telegram/service";

interface Props {
  settings: TelegramSettingsView;
  variants: Array<{ productId: string; variantId: string; name: string; priceMinor: number }>;
  stats: { day: string; todayCheckins: number; todayMb: number; linkedAccounts: number; balanceMb: number; earnedMb: number; spentMb: number };
  entries: AdminRewardRow[];
  canManage: boolean;
}

type BotStatus = {
  configured: boolean;
  username?: string | null;
  readsAllMessages?: boolean;
  webhookUrl?: string | null;
  expectedUrl: string;
  pending?: number;
  lastError?: string | null;
  lastErrorAt?: string | null;
  error?: string;
};

type Draft = {
  enabled: boolean;
  groupIds: string;
  groupLink: string;
  minMb: number;
  maxMb: number;
  dailyCapMb: number;
  timezone: string;
  items: Array<{ id?: string; variantId: string; costMb: number; enabled: boolean }>;
};

const draftOf = (settings: TelegramSettingsView): Draft => ({
  enabled: settings.enabled,
  groupIds: settings.groupIds.join("\n"),
  groupLink: settings.groupLink ?? "",
  minMb: settings.minMb,
  maxMb: settings.maxMb,
  dailyCapMb: settings.dailyCapMb,
  timezone: settings.timezone,
  items: settings.items.map((item) => ({ id: item.id, variantId: item.variantId, costMb: item.costMb, enabled: item.enabled })),
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Telegram check-in rewards: connect the bot (its token and secret are in
 * .env), the groups where check-ins count, how much one gives and the day's
 * cap, which eSIMs the saved data buys and for how much, a hand adjustment of
 * a shopper's balance, and the latest ledger rows.
 */
export function EsimTelegramAdmin({ settings, variants, stats, entries, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const [saving, setSaving] = useState(false);
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [adjust, setAdjust] = useState({ email: "", mb: "", note: "" });
  const [adjusting, setAdjusting] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(draftOf(settings));
  const variantName = useMemo(() => new Map(variants.map((variant) => [variant.variantId, variant.name])), [variants]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const fetchBot = () =>
    apiClient.get<BotStatus>("/api/esim/admin/telegram/connect").catch((error): BotStatus => ({ configured: false, expectedUrl: "", error: errorText(error) }));
  const loadBot = async () => setBot(await fetchBot());
  useEffect(() => {
    let alive = true;
    void fetchBot().then((status) => {
      if (alive) setBot(status);
    });
    return () => {
      alive = false;
    };
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      await apiClient.post("/api/esim/admin/telegram/connect", {});
      toast.success(t("admin.esim.telegramConnected", "The bot is connected"));
      await loadBot();
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/telegram", {
        ...draft,
        groupIds: draft.groupIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean),
        minMb: Number(draft.minMb),
        maxMb: Number(draft.maxMb),
        dailyCapMb: Number(draft.dailyCapMb),
        items: draft.items.filter((item) => item.variantId).map((item) => ({ ...item, costMb: Number(item.costMb) })),
      });
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const submitAdjust = async () => {
    setAdjusting(true);
    try {
      const result = await apiClient.post<{ balanceMb: number }>("/api/esim/admin/telegram/adjust", { email: adjust.email, mb: Number(adjust.mb), note: adjust.note });
      toast.success(t("admin.esim.telegramAdjusted", "Done. Balance now {amount}", { amount: formatMb(result.balanceMb) }));
      setAdjust({ email: "", mb: "", note: "" });
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setAdjusting(false);
    }
  };

  const kindLabel: Record<AdminRewardRow["kind"], string> = {
    checkin: t("admin.esim.telegramKindCheckin", "Check-in"),
    redeem: t("admin.esim.telegramKindRedeem", "Exchange"),
    refund: t("admin.esim.telegramKindRefund", "Given back"),
    adjust: t("admin.esim.telegramKindAdjust", "Adjustment"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.esim.telegramTitle", "Telegram check-in")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.telegramIntro", "Shoppers link Telegram to their account, check in once a day in your group for a random amount of data, and exchange the data saved for an eSIM.")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          [t("admin.esim.telegramToday", "Today ({day})", { day: stats.day }), `${stats.todayCheckins} · ${formatMb(stats.todayMb)}`],
          [t("admin.esim.telegramLinked", "Linked accounts"), String(stats.linkedAccounts)],
          [t("admin.esim.telegramOutstanding", "Data held by shoppers"), formatMb(stats.balanceMb)],
          [t("admin.esim.telegramSpent", "Exchanged so far"), formatMb(stats.spentMb)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">{t("admin.esim.telegramBot", "Bot")}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void loadBot()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!bot ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !bot.configured ? (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p>{t("admin.esim.telegramNoToken", "The bot is not set up. Make a bot with @BotFather, then add these two lines to the site's .env and restart the site:")}</p>
              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">ESIM_TELEGRAM_BOT_TOKEN=123456:ABC…{"\n"}ESIM_TELEGRAM_WEBHOOK_SECRET=a-long-random-string</pre>
            </div>
          ) : (
            <div className="space-y-1">
              {bot.error ? <p className="text-destructive">{bot.error}</p> : null}
              {bot.username ? (
                <p>
                  <a className="font-medium text-primary hover:underline" href={`https://t.me/${bot.username}`} target="_blank" rel="noreferrer">
                    @{bot.username}
                  </a>
                </p>
              ) : null}
              <p className="text-muted-foreground">
                Webhook: {bot.webhookUrl || "—"}{" "}
                {bot.webhookUrl === bot.expectedUrl ? (
                  <Badge variant="secondary">{t("admin.esim.telegramWebhookOk", "connected")}</Badge>
                ) : (
                  <Badge variant="destructive">{t("admin.esim.telegramWebhookOff", "not pointing here")}</Badge>
                )}
              </p>
              {bot.lastError ? (
                <p className="text-destructive">
                  {t("admin.esim.telegramLastError", "Last delivery error")}: {bot.lastError}
                  {bot.lastErrorAt ? ` (${new Date(bot.lastErrorAt).toLocaleString()})` : ""}
                </p>
              ) : null}
              {bot.readsAllMessages === false ? (
                <p className="text-muted-foreground">
                  {t("admin.esim.telegramPrivacy", "Privacy mode is on: in groups the bot only sees /checkin. To let a plain \"签到\" count, turn privacy mode off in @BotFather (Bot Settings → Group Privacy) or make the bot a group admin.")}
                </p>
              ) : null}
            </div>
          )}
          {canManage && bot?.configured ? (
            <Button size="sm" onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {bot.webhookUrl === bot.expectedUrl ? t("admin.esim.telegramReconnect", "Connect again") : t("admin.esim.telegramConnect", "Connect the bot")}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("admin.esim.telegramGroupHelp", "Add the bot to your group and send /chatid there: it answers with the group's ID to paste below.")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.esim.telegramRules", "Check-in rules")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(value) => set("enabled", value)} disabled={!canManage} />
            {t("admin.esim.telegramEnabled", "Check-in rewards are open")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.esim.telegramGroups", "Group IDs (one per line)")}</Label>
              <Textarea rows={3} value={draft.groupIds} onChange={(event) => set("groupIds", event.target.value)} placeholder="-1001234567890" disabled={!canManage} />
              <Label className="block pt-2">{t("admin.esim.telegramGroupLink", "Group link (shown to shoppers)")}</Label>
              <Input value={draft.groupLink} onChange={(event) => set("groupLink", event.target.value)} placeholder="https://t.me/your_group" disabled={!canManage} />
              <p className="text-xs text-muted-foreground">
                {t("admin.esim.telegramGroupLinkHelp", "The bot sends it right after a shopper links their account, and the rewards page shows it.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.esim.telegramMin", "Smallest (MB)")}</Label>
                <Input type="number" min={1} value={draft.minMb} onChange={(event) => set("minMb", Number(event.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.telegramMax", "Largest (MB)")}</Label>
                <Input type="number" min={1} value={draft.maxMb} onChange={(event) => set("maxMb", Number(event.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.telegramCap", "Day's total cap (MB, 0 = none)")}</Label>
                <Input type="number" min={0} value={draft.dailyCapMb} onChange={(event) => set("dailyCapMb", Number(event.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.telegramTimezone", "Day starts in time zone")}</Label>
                <Input value={draft.timezone} onChange={(event) => set("timezone", event.target.value)} placeholder="Asia/Shanghai" disabled={!canManage} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">{t("admin.esim.telegramItems", "eSIMs the data buys")}</CardTitle>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => set("items", [...draft.items, { variantId: "", costMb: 1024, enabled: true }])}>
              <Plus className="me-1 h-4 w-4" />
              {t("admin.esim.telegramAddItem", "Add")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.items.length ? null : <p className="text-sm text-muted-foreground">{t("admin.esim.telegramNoItems", "Nothing yet: add the eSIMs shoppers may exchange their data for.")}</p>}
          {draft.items.map((item, index) => (
            <div key={item.id ?? `new-${index}`} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
              <div className="min-w-[240px] flex-1 space-y-1.5">
                <Label>{t("admin.esim.telegramItemEsim", "eSIM")}</Label>
                <NativeSelect
                  value={item.variantId}
                  disabled={!canManage}
                  onChange={(event) => set("items", draft.items.map((entry, at) => (at === index ? { ...entry, variantId: event.target.value } : entry)))}
                >
                  <option value="">{t("admin.esim.telegramPick", "Choose an eSIM…")}</option>
                  {item.variantId && !variantName.has(item.variantId) ? <option value={item.variantId}>{t("admin.esim.telegramGone", "(no longer published)")}</option> : null}
                  {variants.map((variant) => (
                    <option key={variant.variantId} value={variant.variantId}>
                      {variant.name} — ${(variant.priceMinor / 100).toFixed(2)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="w-36 space-y-1.5">
                <Label>{t("admin.esim.telegramCost", "Costs (MB)")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.costMb}
                  disabled={!canManage}
                  onChange={(event) => set("items", draft.items.map((entry, at) => (at === index ? { ...entry, costMb: Number(event.target.value) } : entry)))}
                />
              </div>
              <div className="pb-2 text-xs text-muted-foreground">{formatMb(Number(item.costMb) || 0)}</div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Switch
                  checked={item.enabled}
                  disabled={!canManage}
                  onCheckedChange={(value) => set("items", draft.items.map((entry, at) => (at === index ? { ...entry, enabled: value } : entry)))}
                />
                {t("admin.esim.telegramItemOn", "On")}
              </label>
              {canManage ? (
                <Button variant="ghost" size="sm" onClick={() => set("items", draft.items.filter((_, at) => at !== index))} aria-label={t("admin.esim.remove", "Remove")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <div className="flex justify-end">
              <Button onClick={save} disabled={!changed || saving}>
                {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                {t("admin.esim.save", "Save")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.esim.telegramAdjust", "Adjust a shopper's balance")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label>{t("admin.esim.email", "Email")}</Label>
              <Input value={adjust.email} onChange={(event) => setAdjust({ ...adjust, email: event.target.value })} />
            </div>
            <div className="w-36 space-y-1.5">
              <Label>{t("admin.esim.telegramAdjustMb", "MB (+ add, − take)")}</Label>
              <Input type="number" value={adjust.mb} onChange={(event) => setAdjust({ ...adjust, mb: event.target.value })} />
            </div>
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label>{t("admin.esim.telegramReason", "Reason (the shopper sees it)")}</Label>
              <Input value={adjust.note} maxLength={500} onChange={(event) => setAdjust({ ...adjust, note: event.target.value })} />
            </div>
            <Button onClick={submitAdjust} disabled={adjusting || !adjust.email || !Number(adjust.mb) || !adjust.note.trim()}>
              {t("admin.esim.apply", "Apply")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.esim.telegramLedger", "Latest activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.esim.when", "When")}</TableHead>
                <TableHead>{t("admin.esim.email", "Email")}</TableHead>
                <TableHead>{t("admin.esim.telegramKind", "What")}</TableHead>
                <TableHead className="text-end">MB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length ? (
                entries.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{row.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {kindLabel[row.kind]}
                      {row.itemName ? ` · ${row.itemName}` : ""}
                      {row.orderNumber ? ` · ${row.orderNumber}` : ""}
                      {row.status === "failed" ? ` · ${t("admin.esim.failed", "failed")}` : row.status === "pending" ? ` · ${t("admin.esim.pending", "pending")}` : ""}
                      {row.note ? ` · ${row.note}` : ""}
                    </TableCell>
                    <TableCell className="text-end text-xs">
                      {row.mb > 0 ? "+" : ""}
                      {formatMb(row.mb)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {t("admin.esim.telegramNoActivity", "No check-ins yet.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
