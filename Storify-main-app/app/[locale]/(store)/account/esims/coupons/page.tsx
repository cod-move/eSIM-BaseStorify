import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { myCoupons } from "@/lib/esim/account/coupons";
import { CopyValue } from "@/components/esim/esim-actions";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** My coupons (account menu): the codes this shopper may enter at checkout, theirs alone and the store's. */
export default async function AccountCouponsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const [t, coupons] = await Promise.all([getTranslations(), myCoupons(session.user.id, locale)]);
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.coupons.title", "My coupons")}</h1>
        <p className="text-sm text-muted-foreground">{tr("esim.coupons.description", "Enter a code at checkout to use it.")}</p>
      </div>
      {coupons.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Ticket className="h-5 w-5 shrink-0" aria-hidden />
            {tr("esim.coupons.none", "You have no coupons at the moment.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {coupons.map((coupon) => (
            <Card key={coupon.code} className={coupon.usable ? "border-primary/40" : "opacity-70"}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-primary">{coupon.benefit}</div>
                    {coupon.referralWelcome ? (
                      <div className="text-sm font-medium">{tr("esim.coupons.referralWelcome", "Referral welcome")}</div>
                    ) : coupon.title ? (
                      <div className="text-sm font-medium">{coupon.title}</div>
                    ) : null}
                  </div>
                  {coupon.personal ? <Badge variant="secondary">{tr("esim.coupons.personal", "Just for you")}</Badge> : null}
                </div>
                {coupon.conditions.length ? (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {coupon.conditions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                <CopyValue value={coupon.code} label={tr("esim.coupons.code", "Code")} />
                {!coupon.usable && coupon.reason ? <p className="text-xs text-amber-700 dark:text-amber-400">{coupon.reason}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
