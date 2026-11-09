"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberPacketPicker } from "@/components/esim/number-packet-picker";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { cardUsdMinor, formatAmount, rechargeProblem } from "@/lib/esim/numbers/line";
import type { NumberShop } from "@/lib/esim/numbers/storefront";

/**
 * A number's page actions (NUM-08/09): add credit or buy a data package —
 * an ordinary cart line paid at checkout, put on the number only after the
 * payment — and cancel a package on the card.
 */

type Options = Pick<NumberShop, "packets" | "recharge" | "product">;

/** `children`: more of the number's buttons, shown after "Add credit" (number-card-tools.tsx). */
export function NumberTopupActions({ numberId, title, options, children }: { numberId: string; title: string; options: Options; children?: ReactNode }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { addItem } = useCart();
  const { formatPrice } = useCurrency();
  const [open, setOpen] = useState<"recharge" | "packet" | null>(null);
  const [amount, setAmount] = useState(options.recharge.presetMinor);
  const [custom, setCustom] = useState("");
  const [packet, setPacket] = useState(options.packets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const { currency, usdPerUnit } = options.recharge;
  const rechargeMinor = custom ? Number(custom) * 100 : amount;
  const problem = rechargeMinor ? rechargeProblem(rechargeMinor, options.recharge.minMinor) : t("esim.number.chooseAmount", "Choose an amount");
  // Prices are in the card currency; checkout charges them in USD (usdPerUnit carries the FX buffer).
  const amountMinor = open === "packet" ? options.packets.find((entry) => entry.id === packet)?.priceMinor ?? 0 : rechargeMinor;
  const priceMinor = usdPerUnit && amountMinor ? cardUsdMinor(amountMinor, usdPerUnit) : 0;

  if (!options.product) return children ? <div className="flex flex-wrap gap-2">{children}</div> : null;

  async function buy() {
    if (!options.product) return;
    setBusy(true);
    try {
      await addItem({
        productId: options.product.productId,
        variantId: options.product.variantId,
        quantity: 1,
        price: priceMinor / 100,
        name: title,
        lineAttributes: { numberTopup: open === "packet" ? { number: numberId, packet } : { number: numberId, recharge: rechargeMinor } },
      });
      router.push("/checkout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {usdPerUnit ? (
          <Button size="sm" onClick={() => setOpen("recharge")}>
            <Plus className="me-1 h-4 w-4" /> {t("esim.number.addCredit", "Add credit")}
          </Button>
        ) : null}
        {children}
        {options.packets.length ? (
          <Button size="sm" variant="outline" onClick={() => setOpen("packet")}>
            <Wifi className="me-1 h-4 w-4" /> {t("esim.number.buyPacket", "Buy data package")}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (next) return;
          setOpen(null);
          setBusy(false);
        }}
      >
        <DialogContent className={open === "packet" ? "max-w-3xl" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle>{open === "packet" ? t("esim.number.buyPacket", "Buy data package") : t("esim.number.addCredit", "Add credit")}</DialogTitle>
            <DialogDescription>{t("esim.number.topupHint", "Paid at checkout, then added to {number} within a few minutes.", { number: title })}</DialogDescription>
          </DialogHeader>
          {open === "recharge" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {options.recharge.suggestions.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={!custom && amount === value ? "default" : "outline"}
                    onClick={() => {
                      setCustom("");
                      setAmount(value);
                    }}
                  >
                    {formatAmount(value, currency)}
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
                  ? t("esim.numbers.rechargeAmounts", "Whole amounts from {min} to {max}.", {
                      min: formatAmount(options.recharge.minMinor, currency),
                      max: formatAmount(options.recharge.maxMinor, currency),
                    })
                  : currency.toUpperCase() === "USD"
                    ? null
                    : t("esim.numbers.chargedAtRate", "At the current exchange rate {amount} = {price}, so you pay {price} at checkout.", { amount: formatAmount(rechargeMinor, currency), price: formatPrice(priceMinor / 100) })}
              </p>
            </div>
          ) : open === "packet" ? (
            <div className="space-y-2">
              <NumberPacketPicker packets={options.packets} currency={currency} value={packet} onChange={setPacket} />
              {priceMinor && currency.toUpperCase() !== "USD" ? (
                <p className="text-xs text-muted-foreground">{t("esim.numbers.chargedAtRate", "At the current exchange rate {amount} = {price}, so you pay {price} at checkout.", { amount: formatAmount(amountMinor, currency), price: formatPrice(priceMinor / 100) })}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button className="w-full" disabled={busy || !priceMinor || (open === "recharge" && Boolean(problem))} onClick={buy}>
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("esim.number.payFor", "Pay {price}", { price: formatAmount(amountMinor, currency) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CancelPacketButton({ numberId, packetId, name }: { numberId: string; packetId: string; name: string }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-destructive"
      disabled={busy}
      onClick={async () => {
        const ok = await confirm({
          title: t("esim.number.cancelPacketTitle", "Cancel {name}?", { name }),
          description: t("esim.number.cancelPacketHint", "The package stops now. Data left on it is not refunded."),
        });
        if (!ok) return;
        setBusy(true);
        try {
          await apiClient.post(`/api/esim/me/numbers/${numberId}/packets`, { action: "cancel", packetId });
          toast.success(t("esim.number.packetCancelled", "Package cancelled"));
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : null}
      {t("esim.number.cancelPacket", "Cancel")}
    </Button>
  );
}
