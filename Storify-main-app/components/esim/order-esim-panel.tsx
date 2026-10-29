import { ChevronRight, Smartphone } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccountSession } from "@/lib/customers/account-data";
import { translator } from "@/lib/esim/i18n/server";
import { orderEsimUnits, type OrderEsimUnit } from "@/lib/esim/orders/order-panel";
import type { UnitOutcome } from "@/lib/esim/orders/unit-status";

/**
 * The eSIMs and top-ups of an order on Storify's order pages (ORD-11, patch
 * P13): where each stands and a way to it. The shopper's page shows it only
 * for their own order; the admin's adds the supplier, the job state and the
 * last error, with links to the eSIM and to Problems. Renders nothing for an
 * order without eSIMs.
 */

const TONE: Record<UnitOutcome, "default" | "secondary" | "outline" | "destructive"> = {
  issued: "default",
  preparing: "secondary",
  refunded: "outline",
  refund_pending: "destructive",
  cancelled: "outline",
};

export async function OrderEsimPanel({ orderId, locale, audience }: { orderId: string; locale: string; audience: "shopper" | "admin" }) {
  let units: OrderEsimUnit[] | null;
  try {
    if (audience === "shopper") {
      const session = await getAccountSession();
      if (!session) return null;
      units = await orderEsimUnits(orderId, { shopperId: session.user.id });
    } else {
      units = await orderEsimUnits(orderId);
    }
  } catch (error) {
    // The order page never fails because of the eSIM part.
    console.error("[esim] order panel:", error);
    return null;
  }
  if (!units?.length) return null;
  const tr = await translator(locale);
  const admin = audience === "admin";

  const outcome = (unit: OrderEsimUnit) => {
    switch (unit.outcome) {
      case "issued":
        return unit.kind === "topup" ? tr("esim.order.topupDone", "Added") : tr("esim.order.issued", "Ready to install");
      case "preparing":
        return unit.kind === "topup" ? tr("esim.order.topupPreparing", "Being added") : tr("esim.order.preparing", "Being prepared");
      case "refunded":
        return tr("esim.order.refunded", "Could not be issued · refunded {amount}", { amount: (unit.refundAmount ?? 0).toFixed(2) });
      case "refund_pending":
        return tr("esim.order.refundPending", "Could not be issued · refund on its way");
      case "cancelled":
        return tr("esim.order.cancelled", "Cancelled");
    }
  };
  const href = (unit: OrderEsimUnit) => (unit.esimId ? (admin ? `/admin/esim/esims/${unit.esimId}` : `/account/esims/${unit.esimId}`) : null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" /> {tr("esim.order.title", "eSIMs in this order")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {units.map((unit, index) => {
          const link = href(unit);
          const body = (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {unit.kind === "topup" ? `${tr("esim.order.topup", "Top-up")}: ` : ""}
                  {unit.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[unit.iccid ? `ICCID ${unit.iccid}` : null, admin ? unit.providerCode : null, admin ? unit.jobState : null].filter(Boolean).join(" · ")}
                </div>
                {admin && unit.lastError && unit.outcome !== "issued" ? <div className="text-xs text-destructive">{unit.lastError}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={TONE[unit.outcome]}>{outcome(unit)}</Badge>
                {link ? <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" /> : null}
              </div>
            </div>
          );
          return link ? (
            <Link key={index} href={link} className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40">
              {body}
            </Link>
          ) : (
            <div key={index} className="rounded-lg border p-3 text-sm">
              {body}
            </div>
          );
        })}
        {admin && units.some((unit) => unit.outcome === "preparing" || unit.outcome === "refund_pending") ? (
          <Link href="/admin/esim/problems" className="inline-block text-sm text-primary underline-offset-2 hover:underline">
            {tr("esim.order.openProblems", "Open eSIM → Problems")}
          </Link>
        ) : null}
        {!admin && units.some((unit) => unit.outcome === "issued" && unit.kind === "esim") ? (
          <p className="text-xs text-muted-foreground">{tr("esim.order.installHint", "Open an eSIM for its QR code and install steps. The same details were emailed to you.")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
