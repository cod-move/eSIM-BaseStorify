"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Gauge, Loader2, MessageSquare, PhoneCall, PhoneForwarded, RefreshCw, Voicemail, Wallet, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast-notification";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatAmount } from "@/lib/esim/numbers/line";
import { parseCardAmount } from "@/lib/esim/numbers/op-policy";
import type { TopConnectDataLimit } from "@/lib/esim/providers/topconnect";
import { forwardingAllowed, formatSeconds, formatTraffic, HISTORY_DAYS, historyTotals, type HistoryDays } from "@/lib/esim/numbers/service-policy";
import type { NumberHistory, NumberServices, NumberSwitch } from "@/lib/esim/numbers/services";
import { cn } from "@/lib/utils";

/**
 * A number's services and history on its page, read from TopConnect when the
 * page opens (not on the server render, so the page does not wait for them):
 * data, texts, calls and voicemail switched on and off, call forwarding, and
 * the calls, texts, data sessions, recharges and voicemail messages of the
 * last days.
 */

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export function NumberServicesCard({ numberId, currency }: { numberId: string; currency: string }) {
  const t = useFallbackTranslator(useTranslations());
  const [services, setServices] = useState<NumberServices | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<NumberSwitch | "forward" | null>(null);
  const [forwardInput, setForwardInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const next = await apiClient.get<NumberServices>(`/api/esim/me/numbers/${numberId}/services`);
      setServices(next);
      setForwardInput(next.forwardTo ? `+${next.forwardTo}` : "");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [numberId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(service: NumberSwitch, on: boolean) {
    setBusy(service);
    try {
      const result = await apiClient.post<{ on: boolean }>(`/api/esim/me/numbers/${numberId}/services`, { service, on });
      setServices((current) => (current ? { ...current, [service]: result.on } : current));
      toast.success(result.on ? t("esim.services.turnedOn", "Turned on") : t("esim.services.turnedOff", "Turned off"));
    } catch (error) {
      toast.error(errorMessage(error, t("esim.services.failed", "The change could not be made")));
    } finally {
      setBusy(null);
    }
  }

  async function forward(to: string | null) {
    setBusy("forward");
    try {
      const result = await apiClient.post<{ forwardTo: string | null }>(`/api/esim/me/numbers/${numberId}/forward`, { to });
      setServices((current) => (current ? { ...current, forwardTo: result.forwardTo } : current));
      setForwardInput(result.forwardTo ? `+${result.forwardTo}` : "");
      toast.success(result.forwardTo ? t("esim.services.forwardSet", "Calls are forwarded") : t("esim.services.forwardOff", "Forwarding stopped"));
    } catch (error) {
      toast.error(errorMessage(error, t("esim.services.failed", "The change could not be made")));
    } finally {
      setBusy(null);
    }
  }

  const switches: Array<{ key: NumberSwitch; icon: typeof Wifi; title: string; hint: string }> = [
    { key: "data", icon: Wifi, title: t("esim.services.data", "Mobile data"), hint: t("esim.services.dataHint", "Stays on so the number keeps its signal; it cannot be turned off here.") },
    {
      key: "sms",
      icon: MessageSquare,
      title: t("esim.services.sms", "Text messages"),
      hint: t("esim.services.smsHint", "When off, outgoing texts are blocked. This stops unexpected charges from phones that send activation texts on their own."),
    },
    { key: "voice", icon: PhoneCall, title: t("esim.services.voice", "Calls"), hint: t("esim.services.voiceHint", "When off, all calls are blocked.") },
    { key: "voicemail", icon: Voicemail, title: t("esim.services.voicemail", "Voicemail"), hint: t("esim.services.voicemailHint", "Records messages from unanswered calls, free of charge.") },
  ];
  const digits = forwardInput.replace(/[\s()+-]/g, "");
  const forwardValid = forwardingAllowed(digits);
  const blocked = services?.blocked === true;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{t("esim.services.title", "Services")}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label={t("esim.services.refresh", "Refresh")}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !services ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("esim.services.loading", "Asking the network…")}
          </div>
        ) : failed && !services ? (
          <p className="text-sm text-muted-foreground">{t("esim.services.unavailable", "The network did not answer. Try again in a moment.")}</p>
        ) : services ? (
          <>
            {blocked ? <p className="text-sm text-destructive">{t("esim.services.blocked", "This number is blocked, so its services cannot be changed.")}</p> : null}
            <ul className="divide-y rounded-lg border">
              {switches.map(({ key, icon: Icon, title, hint }) => {
                const value = services[key];
                return (
                  <li key={key} className="flex items-start gap-3 p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{title}</div>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                      {value === null ? <p className="text-xs text-muted-foreground">{t("esim.services.unknown", "The network did not say whether this is on.")}</p> : null}
                    </div>
                    {busy === key ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={value === true}
                        disabled={value === null || blocked || busy !== null || (key === "data" && value === true)}
                        onCheckedChange={(next) => void toggle(key, next)}
                        aria-label={title}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
                {t("esim.services.forward", "Call forwarding")}
                <span className={cn("ms-auto rounded-full px-2 py-0.5 text-xs", services.forwardTo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {services.forwardTo ? `+${services.forwardTo}` : t("esim.services.forwardInactive", "Off")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("esim.services.forwardHint", "Forward every incoming call to another number, in any country. Forwarded calls are paid from the number's credit.")}
              </p>
              {services.forwardTo === undefined ? (
                <p className="text-xs text-muted-foreground">{t("esim.services.unknown", "The network did not say whether this is on.")}</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    inputMode="tel"
                    placeholder="+1 212 555 0123"
                    value={forwardInput}
                    onChange={(event) => setForwardInput(event.target.value)}
                    disabled={blocked || busy !== null}
                    aria-label={t("esim.services.forwardTo", "Forward to")}
                  />
                  <Button onClick={() => void forward(digits)} disabled={!forwardValid || blocked || busy !== null || digits === services.forwardTo}>
                    {busy === "forward" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                    {t("esim.services.forwardSave", "Forward")}
                  </Button>
                  {services.forwardTo ? (
                    <Button variant="outline" onClick={() => void forward(null)} disabled={blocked || busy !== null}>
                      {t("esim.services.forwardStop", "Stop")}
                    </Button>
                  ) : null}
                </div>
              )}
              {digits && !forwardValid ? <p className="text-xs text-destructive">{t("esim.services.forwardInvalid", "Enter the number with its country code, e.g. +44 7700 900123.")}</p> : null}
            </div>
            <DataLimitSection numberId={numberId} currency={currency} blocked={blocked} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

type DataLimitView = { limit: TopConnectDataLimit | null } | { unavailable: true };

/** A repeating daily spending limit on data (TopConnect's `gprslimit`): experimental, as TopConnect itself warns. */
function DataLimitSection({ numberId, currency, blocked }: { numberId: string; currency: string; blocked: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const [view, setView] = useState<DataLimitView | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await apiClient.get<DataLimitView>(`/api/esim/me/numbers/${numberId}/data-limit`);
      setView(next);
      if ("limit" in next && next.limit?.valueMinor) setInput((next.limit.valueMinor / 100).toFixed(2));
    } catch {
      setView({ unavailable: true });
    }
  }, [numberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cents = parseCardAmount(input);
  const valid = cents !== null && cents >= 10 && cents <= 10_000;

  async function save(valueMinor: number | null) {
    setBusy(true);
    try {
      const result = await apiClient.post<{ limit: TopConnectDataLimit | null }>(`/api/esim/me/numbers/${numberId}/data-limit`, { valueMinor });
      setView({ limit: result.limit });
      if (!result.limit) setInput("");
      toast.success(result.limit ? t("esim.services.limitSet", "Daily limit set") : t("esim.services.limitRemoved", "Daily limit removed"));
    } catch (error) {
      toast.error(errorMessage(error, t("esim.services.failed", "The change could not be made")));
    } finally {
      setBusy(false);
    }
  }

  const limit = view && "limit" in view ? view.limit : null;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        {t("esim.services.limit", "Daily data spending limit")}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{t("esim.services.experimental", "Experimental")}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "esim.services.limitHint",
          "Data stops for the day once this much ({currency}) is spent on it. It may not always hold: charges can go past it, and data may stay off until the next period. It does not limit calls, texts or packages. Each period is 24 hours from when the limit was set.",
          { currency },
        )}
      </p>
      {view === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : "unavailable" in view ? (
        <p className="text-xs text-muted-foreground">{t("esim.services.unknown", "The network did not say whether this is on.")}</p>
      ) : (
        <>
          <p className="text-xs">
            {limit
              ? t("esim.services.limitNow", "{value} a day; {used} used in this period, until {until}.", {
                  value: limit.valueMinor !== null ? formatAmount(limit.valueMinor, currency) : "—",
                  used: limit.usedMinor !== null ? formatAmount(limit.usedMinor, currency) : "—",
                  until: limit.periodEnd ? new Date(limit.periodEnd).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—",
                })
              : t("esim.services.limitNone", "No daily limit.")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input inputMode="decimal" placeholder="1.00" value={input} onChange={(event) => setInput(event.target.value)} disabled={blocked || busy} aria-label={t("esim.services.limit", "Daily data spending limit")} />
            <Button onClick={() => cents !== null && void save(cents)} disabled={!valid || blocked || busy || cents === limit?.valueMinor}>
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("esim.services.limitSave", "Set daily limit")}
            </Button>
            {limit ? (
              <Button variant="outline" onClick={() => void save(null)} disabled={blocked || busy}>
                {t("esim.services.limitRemove", "Remove")}
              </Button>
            ) : null}
          </div>
          {input && !valid ? <p className="text-xs text-destructive">{t("esim.services.limitInvalid", "Enter an amount between 0.10 and 100.")}</p> : null}
        </>
      )}
    </div>
  );
}

export function NumberHistoryCard({ numberId, currency }: { numberId: string; currency: string }) {
  const t = useFallbackTranslator(useTranslations());
  const [days, setDays] = useState<HistoryDays>(30);
  const [history, setHistory] = useState<NumberHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (period: HistoryDays) => {
    setLoading(true);
    setFailed(false);
    try {
      setHistory(await apiClient.get<NumberHistory>(`/api/esim/me/numbers/${numberId}/history?days=${period}`));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [numberId]);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const when = (at: string | null) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
  const money = (minor: number | null, code: string | null) => (minor === null ? "—" : formatAmount(minor, code ?? currency));
  const totals = historyTotals(history?.calls ?? null, history?.data ?? null);
  const none = (list: unknown[] | null) =>
    list === null ? (
      <p className="py-4 text-sm text-muted-foreground">{t("esim.history.unavailable", "The network did not answer for this list.")}</p>
    ) : list.length === 0 ? (
      <p className="py-4 text-sm text-muted-foreground">{t("esim.history.empty", "Nothing in this period.")}</p>
    ) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("esim.history.title", "Usage history")}</CardTitle>
        <div className="flex items-center gap-1">
          {HISTORY_DAYS.map((value) => (
            <Button key={value} size="sm" variant={value === days ? "default" : "outline"} onClick={() => setDays(value)} disabled={loading}>
              {t("esim.history.days", "{days} days", { days: value })}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !history ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("esim.services.loading", "Asking the network…")}
          </div>
        ) : failed && !history ? (
          <p className="text-sm text-muted-foreground">{t("esim.services.unavailable", "The network did not answer. Try again in a moment.")}</p>
        ) : history ? (
          <>
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", loading && "opacity-60")}>
              {[
                [t("esim.history.calls", "Calls"), String(totals.calls)],
                [t("esim.history.texts", "Texts"), String(totals.texts)],
                [t("esim.history.data", "Data"), formatTraffic(totals.dataBytes)],
                [t("esim.history.cost", "Cost"), formatAmount(totals.costMinor, currency)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-2.5">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <Tabs defaultValue="calls">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="calls">{t("esim.history.callsTab", "Calls and texts")}</TabsTrigger>
                <TabsTrigger value="data">{t("esim.history.data", "Data")}</TabsTrigger>
                <TabsTrigger value="recharges">{t("esim.history.recharges", "Recharges")}</TabsTrigger>
                <TabsTrigger value="voicemail">{t("esim.services.voicemail", "Voicemail")}</TabsTrigger>
              </TabsList>

              <TabsContent value="calls">
                {none(history.calls) ?? (
                  <ul className="divide-y">
                    {history.calls!.map((entry, index) => {
                      const outgoing = entry.direction === "out";
                      const other = outgoing ? entry.to : entry.from;
                      return (
                        <li key={index} className="flex items-center gap-3 py-2.5 text-sm">
                          {entry.kind === "voicemail" ? (
                            <Voicemail className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : entry.kind === "sms" ? (
                            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : outgoing ? (
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ArrowDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {entry.kind === "voicemail"
                                ? t("esim.history.voicemailCall", "Voicemail: call from {number}", { number: other ? `+${other}` : "—" })
                                : entry.kind === "sms"
                                ? outgoing
                                  ? t("esim.history.smsOut", "Text to {number}", { number: other ? `+${other}` : "—" })
                                  : t("esim.history.smsIn", "Text from {number}", { number: other ? `+${other}` : "—" })
                                : outgoing
                                  ? t("esim.history.callOut", "Call to {number}", { number: other ? `+${other}` : "—" })
                                  : t("esim.history.callIn", "Call from {number}", { number: other ? `+${other}` : "—" })}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[when(entry.at), entry.kind === "call" ? formatSeconds(entry.seconds) : null, entry.destination].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <span className="shrink-0 tabular-nums">{money(entry.costMinor, entry.currency)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="data">
                {none(history.data) ?? (
                  <ul className="divide-y">
                    {history.data!.map((entry, index) => (
                      <li key={index} className="flex items-center gap-3 py-2.5 text-sm">
                        <Wifi className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{[entry.operator, entry.country].filter(Boolean).join(" · ") || "—"}</div>
                          <div className="text-xs text-muted-foreground">{when(entry.at)}</div>
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="tabular-nums">{formatTraffic(entry.bytes)}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{money(entry.costMinor, entry.currency)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="recharges">
                {none(history.recharges) ?? (
                  <ul className="divide-y">
                    {history.recharges!.map((entry, index) => (
                      <li key={index} className="flex items-center gap-3 py-2.5 text-sm">
                        <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {entry.kind === "voucher"
                              ? t("esim.history.rechargeVoucher", "Voucher")
                              : entry.kind === "automatic"
                                ? t("esim.history.rechargeAutomatic", "Automatic top-up")
                                : (entry.amountMinor ?? 0) < 0
                                  ? t("esim.history.rechargeOut", "Credit moved out")
                                  : t("esim.history.rechargeIn", "Credit added")}
                          </div>
                          <div className="text-xs text-muted-foreground">{when(entry.at)}</div>
                        </div>
                        <span className={cn("shrink-0 tabular-nums", (entry.amountMinor ?? 0) >= 0 && "text-emerald-600")}>
                          {entry.amountMinor !== null && entry.amountMinor > 0 ? "+" : ""}
                          {money(entry.amountMinor, entry.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="voicemail">
                {none(history.voicemails) ?? (
                  <ul className="divide-y">
                    {history.voicemails!.map((entry) => (
                      <li key={entry.id} className="space-y-2 py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <Voicemail className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{t("esim.history.voicemailFrom", "Message from {number}", { number: entry.from ? `+${entry.from}` : "—" })}</div>
                            <div className="text-xs text-muted-foreground">{when(entry.at)}</div>
                          </div>
                        </div>
                        <audio controls preload="none" className="h-9 w-full" src={`/api/esim/me/numbers/${numberId}/voicemail/${entry.id}`} />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">{t("esim.history.note", "From the network's records; the newest calls and sessions may take a few minutes to appear.")}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
