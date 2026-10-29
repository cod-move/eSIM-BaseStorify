"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Tag } from "lucide-react";
import Link from "@/components/language/link";
import { Button } from "@/components/ui/button";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";

/**
 * A running campaign's banner (WEB-19): its headline, the discount and the
 * code to copy, and when it ends. On the overview and destination pages it
 * links to the campaign's page; on that page it is the page's header.
 * `endsLabel` is formatted on the server so both renders agree.
 */

export interface CampaignBannerData {
  slug: string;
  name: string;
  headline: string;
  imageUrl: string | null;
  discountPercent: number;
  couponCode: string;
  endsLabel: string;
}

export function CampaignBanner({ campaign, large = false }: { campaign: CampaignBannerData; large?: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(campaign.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The code is on screen to type.
    }
  };

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-primary/5",
        large ? "p-6 sm:p-8" : "p-4",
      )}
      aria-label={campaign.name}
    >
      {campaign.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- an admin's URL from anywhere; next/image would need every host allowed.
        <img src={campaign.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
      ) : null}
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Tag className="h-4 w-4" />
            {t("esim.campaign.off", "{percent}% off", { percent: campaign.discountPercent })}
          </div>
          {large ? (
            <h1 className="text-3xl font-bold tracking-tight">{campaign.headline || campaign.name}</h1>
          ) : (
            <p className="text-lg font-semibold">{campaign.headline || campaign.name}</p>
          )}
          <p className="text-sm text-muted-foreground">{t("esim.campaign.ends", "Ends {date}", { date: campaign.endsLabel })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("esim.campaign.useCode", "Use code")}</span>
          <Button type="button" variant="outline" className="font-mono tracking-wider" onClick={copy} aria-label={t("esim.campaign.copy", "Copy the code {code}", { code: campaign.couponCode })}>
            {campaign.couponCode}
            {copied ? <Check className="ms-2 h-4 w-4" /> : <Copy className="ms-2 h-4 w-4" />}
          </Button>
          {!large ? (
            <Button asChild variant="link" size="sm">
              <Link href={`/esim/campaign/${campaign.slug}`}>{t("esim.campaign.see", "See the offer")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
