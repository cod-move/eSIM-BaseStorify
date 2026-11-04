"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, Phone, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useSession } from "@/lib/auth/auth-client";
import { buildLoginUrl, currentBrowserPath } from "@/lib/auth/return-path";
import { useCurrency } from "@/providers/currency-provider";
import { cn } from "@/lib/utils";
import { formatAmount, numberLineLabel, rechargeProblem } from "@/lib/esim/numbers/line";
import type { NumberShop, PremiumFilter, ShopNumber, ShopNumberFilters, ShopPacket } from "@/lib/esim/numbers/storefront";

/**
 * The numbers page (NUM-03): filter by country code, digits and premium,
 * pick a number, add a first recharge (in the card's own currency) and a data
 * package, then straight to checkout. The query string is the list's state.
 * Buying needs an account: a guest is sent to sign in and comes back here.
 * The cart prices the line again on the server; the number is held only once
 * the shopper starts paying (NUM-04).
 */

const PREMIUM: PremiumFilter[] = ["all", "standard", "premium"];

export function NumberPicker({ shop, filters, locale }: { shop: NumberShop; filters: ShopNumberFilters; locale: string }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const { formatPrice } = useCurrency();
  const [isPending, startTransition] = useTransition();
  const [digits, setDigits] = useState(filters.digits ?? "");
  const [chosen, setChosen] = useState<ShopNumber | null>(null);

  function go(next: Partial<ShopNumberFilters>) {
    const merged = { ...filters, ...next };
    const query = new URLSearchParams();
    if (merged.dialCode) query.set("code", merged.dialCode);
    if (merged.digits?.trim()) query.set("digits", merged.digits.trim());
    if (merged.premium && merged.premium !== "all") query.set("premium", merged.premium);
    if (merged.page && merged.page > 1) query.set("page", String(merged.page));
    startTransition(() => router.push(query.size ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const premiumLabel = (value: PremiumFilter) =>
    ({
      all: t("esim.numbers.all", "All numbers"),
      standard: t("esim.numbers.standard", "Standard"),
      premium: t("esim.numbers.premium", "Memorable"),
    })[value];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.dialCode ?? "any"} onValueChange={(value) => go({ dialCode: value === "any" ? undefined : value, page: 1 })}>
          <SelectTrigger className="w-48" aria-label={t("esim.numbers.countryCode", "Country code")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("esim.numbers.anyCode", "Every country code")}</SelectItem>
            {shop.dialCodes.map((entry) => (
              <SelectItem key={entry.code} value={entry.code}>
                +{entry.code}
                {entry.country ? ` ${entry.country}` : ""} ({entry.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            go({ digits, page: 1 });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={digits}
            inputMode="numeric"
            onChange={(event) => setDigits(event.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            placeholder={t("esim.numbers.digits", "Digits in the number, e.g. 888")}
            className="pl-9"
            aria-label={t("esim.numbers.digits", "Digits in the number, e.g. 888")}
          />
        </form>
        <div className="flex gap-1 rounded-full border p-1">
          {PREMIUM.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={(filters.premium ?? "all") === value ? "default" : "ghost"}
              className="rounded-full"
              onClick={() => go({ premium: value, page: 1 })}
            >
              {premiumLabel(value)}
            </Button>
          ))}
        </div>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>

      {shop.rows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shop.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setChosen(row)}
              className="group flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  +{row.dialCode}
                  {row.country ? ` · ${row.country}` : ""}
                </span>
                {row.premiumMinor ? (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" /> {t("esim.numbers.premium", "Memorable")}
                  </Badge>
                ) : null}
              </div>
              <div className="font-mono text-lg font-semibold tracking-wide">{groupDigits(row.nationalNumber)}</div>
              <div className="text-sm font-medium text-primary">{formatPrice((row.priceMinor + row.premiumMinor) / 100)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {shop.product
            ? t("esim.numbers.none", "No numbers match. Try another country code or fewer digits.")
            : t("esim.numbers.soon", "Numbers are not on sale yet.")}
        </div>
      )}

      {shop.pages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="icon" variant="outline" disabled={shop.page <= 1} onClick={() => go({ page: shop.page - 1 })} aria-label={t("esim.numbers.previous", "Previous")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">
            {t("esim.numbers.pageOf", "Page {page} of {pages}", { page: shop.page, pages: shop.pages })}
          </span>
          <Button size="icon" variant="outline" disabled={shop.page >= shop.pages} onClick={() => go({ page: shop.page + 1 })} aria-label={t("esim.numbers.next", "Next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <NumberDialog shop={shop} number={chosen} locale={locale} onClose={() => setChosen(null)} />
    </div>
  );
}

/** "55501234" → "5550 1234": easier to read and to judge a memorable number. */
function groupDigits(digits: string) {
  return digits.replace(/(\d{3,4})(?=(\d{4})+$)/g, "$1 ");
}

function volumeLabel(packet: ShopPacket, unlimited: string) {
  if (packet.volumeMb === null) return unlimited;
  return packet.volumeMb >= 1000 && packet.volumeMb % 1000 === 0 ? `${packet.volumeMb / 1000} GB` : `${packet.volumeMb} MB`;
}

function NumberDialog({ shop, number, locale, onClose }: { shop: NumberShop; number: ShopNumber | null; locale: string; onClose: () => void }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { addItem } = useCart();
  const { formatPrice } = useCurrency();
  const { data: session } = useSession();
  const [recharge, setRecharge] = useState(0);
  const [custom, setCustom] = useState("");
  const [packet, setPacket] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const { currency, usdPerUnit } = shop.recharge;

  const rechargeMinor = custom ? Number(custom) * 100 : recharge;
  const problem = rechargeProblem(rechargeMinor);
  const chosenPacket = shop.packets.find((entry) => entry.id === packet) ?? null;
  const rechargeUsd = rechargeMinor && usdPerUnit ? Math.ceil(rechargeMinor * usdPerUnit - 1e-9) : 0;
  const totalMinor = number ? number.priceMinor + number.premiumMinor + rechargeUsd + (chosenPacket?.priceMinor ?? 0) : 0;
  const rechargeUnpriced = rechargeMinor > 0 && !usdPerUnit;
  const label = useMemo(
    () =>
      number
        ? numberLineLabel({ dialCode: number.dialCode, nationalNumber: number.nationalNumber, recharge: rechargeMinor, rechargeCurrency: currency, packetName: chosenPacket?.name })
        : "",
    [number, rechargeMinor, currency, chosenPacket],
  );

  async function buy() {
    if (!number || !shop.product || problem || rechargeUnpriced) return;
    if (!session?.user) {
      toast.info(t("esim.numbers.signIn", "Sign in to buy a number; you will come back here."));
      window.location.assign(buildLoginUrl(locale, currentBrowserPath()));
      return;
    }
    setBusy(true);
    try {
      await addItem({
        productId: shop.product.productId,
        variantId: shop.product.variantId,
        quantity: 1,
        price: totalMinor / 100,
        name: label,
        lineAttributes: { number: { id: number.id, ...(rechargeMinor ? { recharge: rechargeMinor } : {}), ...(chosenPacket ? { packet: chosenPacket.id } : {}) } },
      });
      router.push("/checkout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={number !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setBusy(false);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-xl">
            <Phone className="h-5 w-5 text-primary" />
            {number ? `+${number.dialCode} ${groupDigits(number.nationalNumber)}` : ""}
          </DialogTitle>
          <DialogDescription>
            {t("esim.numbers.holdHint", "The number is held for you for 10 minutes once you start paying. Install details are in your account after payment.")}
          </DialogDescription>
        </DialogHeader>

        {number ? (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{t("esim.numbers.rechargeTitle", "First credit on the number")}</legend>
              <div className="flex flex-wrap gap-2">
                {shop.recharge.suggestions.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    size="sm"
                    variant={!custom && recharge === amount ? "default" : "outline"}
                    onClick={() => {
                      setCustom("");
                      setRecharge(amount);
                    }}
                  >
                    {amount ? formatAmount(amount, currency) : t("esim.numbers.noCredit", "None")}
                  </Button>
                ))}
                <Input
                  className="w-28"
                  inputMode="numeric"
                  value={custom}
                  placeholder={t("esim.numbers.otherAmount", "Other")}
                  aria-label={t("esim.numbers.otherAmount", "Other")}
                  onChange={(event) => setCustom(event.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </div>
              <p className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
                {problem
                  ? t("esim.numbers.rechargeRange", "Whole amounts from {min} to {max}, or none.", {
                      min: formatAmount(shop.recharge.minMinor, currency),
                      max: formatAmount(shop.recharge.maxMinor, currency),
                    })
                  : rechargeUnpriced
                    ? t("esim.numbers.rechargeUnpriced", "Credit cannot be priced right now; buy the number without it, or try again later.")
                    : rechargeMinor
                      ? t("esim.numbers.rechargePrice", "{amount} lands on the number; you pay {price}.", { amount: formatAmount(rechargeMinor, currency), price: formatPrice(rechargeUsd / 100) })
                      : t("esim.numbers.rechargeLater", "You can add credit later from the number's page.")}
              </p>
            </fieldset>

            {shop.packets.length ? (
              <div className="space-y-2">
                <Label htmlFor="number-packet" className="text-sm font-semibold">
                  {t("esim.numbers.packetTitle", "Data package")}
                </Label>
                <Select value={packet} onValueChange={setPacket}>
                  <SelectTrigger id="number-packet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("esim.numbers.noPacket", "No data package")}</SelectItem>
                    {shop.packets.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name} · {volumeLabel(entry, t("esim.numbers.unlimited", "Unlimited"))} ·{" "}
                        {t("esim.numbers.days", "{days} days", { days: entry.validityDays })} · {formatPrice(entry.priceMinor / 100)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chosenPacket?.countryCodes.length ? (
                  <p className="text-xs text-muted-foreground">
                    {t("esim.numbers.packetCountries", "Works in: {countries}", { countries: chosenPacket.countryCodes.join(", ") })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <dl className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <Row label={t("esim.numbers.numberPrice", "Number")} value={formatPrice(number.priceMinor / 100)} />
              {number.premiumMinor ? <Row label={t("esim.numbers.premiumFee", "Memorable number")} value={formatPrice(number.premiumMinor / 100)} /> : null}
              {rechargeMinor && !rechargeUnpriced ? (
                <Row label={t("esim.numbers.credit", "Credit {amount}", { amount: formatAmount(rechargeMinor, currency) })} value={formatPrice(rechargeUsd / 100)} />
              ) : null}
              {chosenPacket ? <Row label={chosenPacket.name} value={formatPrice(chosenPacket.priceMinor / 100)} /> : null}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>{t("esim.numbers.total", "Total")}</dt>
                <dd>{formatPrice(totalMinor / 100)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!shop.product ? (
            <p className="text-center text-xs text-destructive">{t("esim.numbers.notReady", "Numbers cannot be bought right now. Please try again later or contact us.")}</p>
          ) : null}
          <Button className="w-full" size="lg" disabled={busy || !shop.product || Boolean(problem) || rechargeUnpriced} onClick={buy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {session?.user ? t("esim.numbers.buy", "Buy this number") : t("esim.numbers.signInToBuy", "Sign in to buy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
