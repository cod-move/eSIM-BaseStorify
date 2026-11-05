import { SectionHeading } from "@/components/store/sections/section-shell";
import { AppImage } from "@/components/ui/app-image";
import { DestinationCard } from "@/components/esim/destination-card";
import { DestinationBrowser } from "@/components/esim/destination-browser";
import { PlanSelector } from "@/components/esim/plan-selector";
import { HeroSearch } from "@/components/esim/sections/hero-search";
import { translator } from "@/lib/esim/i18n/server";
import { localizeDestination, localizeDestinations } from "@/lib/esim/storefront/destination-names";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText, SectionDefinition, SectionRenderContext } from "@/lib/storefront/sections/types";
import {
  destinationsBySlug,
  getDestination,
  listDestinations,
  popularDestinations,
  regionNamesFor,
  toBrowserDestination,
} from "@/lib/esim/storefront/catalog";

/**
 * The eSIM blocks that draw destinations (WEB-10..13): the search hero, the
 * popular grid, the countries / regions / global tabs and the plan selector.
 * Each reads the published catalogue (lib/esim/storefront/catalog.ts) and
 * draws nothing while nothing is on sale.
 */

const text = (value: unknown, ctx: SectionRenderContext) => lt(value as LocalizedText, ctx.locale, ctx.defaultLanguage);
const slugsOf = (blocks: Array<{ visible: boolean; settings: Record<string, unknown> }>) =>
  blocks.filter((block) => block.visible).map((block) => String(block.settings.destination ?? "")).filter(Boolean);

const DESTINATION_BLOCK = {
  type: "destination",
  max: 24,
  fields: [
    {
      key: "destination",
      type: "text" as const,
      default: "",
      hint: "The destination's address after /esim/, e.g. japan or europe-35-areas.",
    },
  ],
};

export const esimHero: SectionDefinition = {
  type: "esim-hero",
  version: 1,
  category: "content",
  suggested: true,
  fields: [
    { key: "title", type: "text", translatable: true, default: "Stay connected in 190+ countries" },
    { key: "subtitle", type: "textarea", translatable: true, default: "Prepaid travel eSIMs. Install in minutes, no roaming bills." },
    { key: "placeholder", type: "text", translatable: true, default: "Where are you going?" },
    { key: "image", type: "image", default: "" },
    { key: "popularCount", type: "number", default: 6, min: 0, max: 12, hint: "Quick links under the search when none are picked below." },
  ],
  blocks: [DESTINATION_BLOCK],
  async Render({ settings, blocks, ctx }) {
    const all = await listDestinations();
    const picked = slugsOf(blocks);
    const popular = picked.length
      ? await destinationsBySlug(picked)
      : await popularDestinations(Number(settings.popularCount ?? 6));
    const image = String(settings.image ?? "");
    return (
      <section className="relative isolate overflow-hidden">
        {image ? (
          <AppImage src={image} alt="" fill className="-z-10 object-cover" />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
        )}
        {image ? <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/40" /> : null}
        <div className={`container mx-auto px-4 py-16 text-center lg:py-24 ${image ? "text-white" : ""}`}>
          <h1 className="mx-auto max-w-3xl text-[length:var(--sec-title,2rem)] font-bold tracking-tight sm:text-[length:var(--sec-title-lg,3rem)]">
            {text(settings.title, ctx)}
          </h1>
          <p className={`mx-auto mt-3 max-w-2xl text-base sm:text-lg ${image ? "text-white/85" : "text-muted-foreground"}`}>
            {text(settings.subtitle, ctx)}
          </p>
          <div className="mt-8">
            <HeroSearch
              destinations={(await localizeDestinations(all, ctx.locale)).map(toBrowserDestination)}
              placeholder={text(settings.placeholder, ctx)}
              popular={(await localizeDestinations(popular, ctx.locale)).map(toBrowserDestination)}
            />
          </div>
        </div>
      </section>
    );
  },
};

export const esimPopular: SectionDefinition = {
  type: "esim-popular",
  version: 1,
  category: "products",
  suggested: true,
  fields: [
    { key: "title", type: "text", translatable: true, default: "Popular destinations" },
    { key: "source", type: "select", options: ["auto", "manual"], default: "auto", hint: "Auto: best sellers of the last 90 days. Manual: the destinations below." },
    { key: "scope", type: "select", options: ["all", "local", "regional", "global"], default: "local", showWhen: { key: "source", values: ["auto"] } },
    { key: "limit", type: "number", default: 8, min: 2, max: 24, width: "half" },
    { key: "desktopColumns", type: "number", default: 4, min: 2, max: 6, width: "half" },
    { key: "showPrice", type: "toggle", default: true },
  ],
  blocks: [DESTINATION_BLOCK],
  async Render({ settings, blocks, ctx }) {
    const limit = Number(settings.limit ?? 8);
    const scope = String(settings.scope ?? "local");
    const items =
      settings.source === "manual"
        ? (await destinationsBySlug(slugsOf(blocks))).slice(0, limit)
        : await popularDestinations(limit, scope === "all" ? undefined : (scope as "local" | "regional" | "global"));
    if (!items.length) return null;
    const columns = Math.min(6, Math.max(2, Number(settings.desktopColumns ?? 4)));
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={text(settings.title, ctx)} className="mb-6" viewAllHref="/esim" viewAllLabel={(await translator(ctx.locale))("esim.browse.viewAll", "View all destinations")} />
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--esim-cols),minmax(0,1fr))]"
            style={{ ["--esim-cols" as string]: columns }}
          >
            {(await localizeDestinations(items, ctx.locale)).map((destination) => (
              <DestinationCard key={destination.slug} destination={toBrowserDestination(destination)} showPrice={settings.showPrice !== false} />
            ))}
          </div>
        </div>
      </section>
    );
  },
};

export const esimDestinationTabs: SectionDefinition = {
  type: "esim-destination-tabs",
  version: 1,
  category: "products",
  fields: [
    { key: "title", type: "text", translatable: true, default: "Find your plan" },
    { key: "localTitle", type: "text", translatable: true, default: "Countries", width: "third" },
    { key: "regionalTitle", type: "text", translatable: true, default: "Regions", width: "third" },
    { key: "globalTitle", type: "text", translatable: true, default: "Global", width: "third" },
    { key: "limit", type: "number", default: 12, min: 4, max: 48 },
    { key: "showPrice", type: "toggle", default: true },
  ],
  async Render({ settings, ctx }) {
    const all = await listDestinations();
    if (!all.length) return null;
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={text(settings.title, ctx)} className="mb-4" />
          <DestinationBrowser
            destinations={(await localizeDestinations(all, ctx.locale)).map(toBrowserDestination)}
            search={false}
            grouped={false}
            limit={Number(settings.limit ?? 12)}
            labels={{
              local: text(settings.localTitle, ctx),
              regional: text(settings.regionalTitle, ctx),
              global: text(settings.globalTitle, ctx),
            }}
            viewAllHref="/esim"
            showPrice={settings.showPrice !== false}
          />
        </div>
      </section>
    );
  },
};

export const esimPlanSelector: SectionDefinition = {
  type: "esim-plan-selector",
  version: 1,
  category: "products",
  fields: [
    { key: "title", type: "text", translatable: true, default: "" },
    {
      key: "destination",
      type: "text",
      default: "",
      hint: "The destination's address after /esim/, e.g. japan, europe-35-areas or global.",
    },
  ],
  isEmpty: ({ settings }) => !String(settings.destination ?? "").trim(),
  async Render({ settings, ctx }) {
    const slug = String(settings.destination ?? "").trim().toLowerCase().replace(/-esim$/, "");
    if (!slug) return null;
    const found = (await getDestination(slug, "local")) ?? (await getDestination(slug, "multi"));
    if (!found) return null;
    const destination = await localizeDestination(found, ctx.locale);
    const regionNames = regionNamesFor(destination, ctx.locale);
    const title = text(settings.title, ctx) || `${destination.name} eSIM`;
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto max-w-3xl px-4">
          <SectionHeading title={title} className="mb-4" />
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <PlanSelector
              productId={destination.productId}
              name={`${destination.name} eSIM`}
              variants={destination.variants}
              countryCodes={destination.countries.map((country) => country.code)}
              regionNames={regionNames}
              image={destination.image}
            />
          </div>
        </div>
      </section>
    );
  },
};
