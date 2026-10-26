import { Gauge, Globe2, PlugZap, RefreshCw, Shield, Signal, Wifi } from "lucide-react";
import { SectionHeading } from "@/components/store/sections/section-shell";
import { sectionEmptyState } from "@/components/store/sections/section-empty-state";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText, SectionDefinition } from "@/lib/storefront/sections/types";
import { productEsimFacts } from "@/lib/esim/storefront/catalog";
import { flagEmoji } from "@/lib/esim/storefront/continents";
import { translator } from "@/lib/esim/i18n/server";

/**
 * The eSIM facts of the product on its page (WEB-34): coverage, networks and
 * speed, the kind of data, when the plan starts, hotspot, top-up, extras.
 * Read from the plans behind the product's variants; a fact the plans differ
 * on says so instead of promising one value. Draws nothing on a product that
 * is not an eSIM (a hint in the page builder's preview).
 */
export const esimProductDetails: SectionDefinition = {
  type: "esim-product-details",
  version: 1,
  category: "products",
  templates: ["product"],
  maxPerPage: 1,
  resourceType: "product",
  fields: [{ key: "title", type: "text", translatable: true, default: "" }],
  async Render({ settings, ctx }) {
    const resource = ctx.resource;
    if (resource?.type !== "product") return null;
    const tr = await translator(ctx.locale);
    const title = lt(settings.title as LocalizedText, ctx.locale, ctx.defaultLanguage).trim() || tr("esim.details.title", "About this eSIM");
    const facts = await productEsimFacts(String(resource.product._id));
    if (!facts) return sectionEmptyState(ctx, { title, hint: "Shown on eSIM products only." });

    const regionNames = new Intl.DisplayNames([ctx.locale, "en"], { type: "region" });
    const region = (code: string) => {
      try {
        return regionNames.of(code) ?? code;
      } catch {
        return code;
      }
    };
    const dataLabel: Record<string, string> = {
      total: tr("esim.details.dataTotal", "A fixed amount of data for the whole trip"),
      unlimited: tr("esim.details.dataUnlimited", "Unlimited data"),
      daily_throttled: tr("esim.details.dataDailyThrottled", "A daily allowance, then reduced speed"),
      daily_cutoff: tr("esim.details.dataDailyCutoff", "A daily allowance, renewed each day"),
      lifetime: tr("esim.details.dataLifetime", "Data that does not expire"),
    };
    const startLabel: Record<string, string> = {
      first_connection: tr("esim.details.startConnection", "The plan starts when the eSIM first connects at your destination."),
      first_installation: tr("esim.details.startInstall", "The plan starts when you install the eSIM."),
      on_purchase: tr("esim.details.startPurchase", "The plan starts at purchase."),
    };
    const topupLabel = facts.topupModes.includes("stack")
      ? tr("esim.details.topupStack", "Can be topped up from My eSIMs.")
      : facts.topupModes.includes("addon")
        ? tr("esim.details.topupAddon", "More packages can be added from My eSIMs.")
        : tr("esim.details.topupNone", "No top-up: buy another plan if you need more.");
    const mixed = tr("esim.details.depends", "Depends on the plan you choose.");

    const items: Array<{ icon: typeof Globe2; label: string; body: React.ReactNode }> = [
      {
        icon: Globe2,
        label: tr("esim.details.coverage", "Coverage"),
        body:
          facts.scope === "local" && facts.countries.length === 1 ? (
            `${flagEmoji(facts.countries[0].code)} ${facts.countries[0].name}`
          ) : (
            <details>
              <summary className="cursor-pointer">{tr("esim.browse.countries", "{count} countries", { count: facts.countries.length })}</summary>
              <p className="mt-1 text-xs">{facts.countries.map((country) => country.name).join(", ")}</p>
            </details>
          ),
      },
      {
        icon: Signal,
        label: tr("esim.details.networks", "Networks"),
        body: facts.networks.length
          ? facts.networks
              .slice(0, 12)
              .map((network) => `${facts.scope === "local" ? "" : `${network.countryCode} `}${network.operator}${network.network ? ` (${network.network})` : ""}`)
              .join(" · ") + (facts.networks.length > 12 ? " …" : "")
          : tr("esim.details.bestAvailable", "The best network available locally."),
      },
      {
        icon: Gauge,
        label: tr("esim.details.data", "Data"),
        body: facts.dataTypes.length === 1 ? dataLabel[facts.dataTypes[0]] : facts.dataTypes.map((type) => dataLabel[type]).join(" · "),
      },
      ...(facts.topSpeed ? [{ icon: Signal, label: tr("esim.details.speed", "Speed"), body: tr("esim.details.upTo", "Up to {speed}", { speed: facts.topSpeed }) }] : []),
      {
        icon: PlugZap,
        label: tr("esim.details.activation", "Activation"),
        body: (
          <>
            {facts.billingStarts.length === 1 ? startLabel[facts.billingStarts[0]] : mixed}
            {facts.installWithinDays ? ` ${tr("esim.details.installWithin", "Install it within {days} days of purchase.", { days: facts.installWithinDays })}` : ""}
          </>
        ),
      },
      {
        icon: Wifi,
        label: tr("esim.details.hotspot", "Hotspot"),
        body:
          facts.hotspot === true
            ? tr("esim.details.hotspotYes", "Share your connection with other devices.")
            : facts.hotspot === false
              ? tr("esim.details.hotspotNo", "Sharing the connection is not allowed.")
              : mixed,
      },
      { icon: RefreshCw, label: tr("esim.details.topup", "Top-up"), body: topupLabel },
      ...(facts.breakoutIp.length
        ? [
            {
              icon: Shield,
              label: tr("esim.details.ip", "IP address"),
              body: tr("esim.details.ipFrom", "Your traffic leaves from {countries}.", { countries: facts.breakoutIp.map(region).join(", ") }),
            },
          ]
        : []),
      ...(facts.vpn !== "none" || facts.voice || facts.sms
        ? [
            {
              icon: Shield,
              label: tr("esim.details.extras", "Included"),
              body: [
                facts.vpn === "all" ? tr("esim.details.vpn", "A free VPN") : facts.vpn === "some" ? tr("esim.details.vpnSome", "A free VPN on some plans") : null,
                facts.voice ? tr("esim.details.voice", "Calls") : null,
                facts.sms ? tr("esim.details.sms", "Texts") : null,
              ]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : []),
    ];

    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={title} className="mb-4" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <div key={index} className="flex gap-3 rounded-xl border bg-card p-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 text-sm">
                  <dt className="font-medium">{item.label}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{item.body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  },
};
