import type { EsimDestinationsBlock, EsimDeviceCheckBlock } from "@/contracts/mobile/shop/v1/esim";
import type { Currency } from "@/lib/intl/currencies";
import { connectDB } from "@/lib/db";
import { destinationsBySlug, popularDestinations } from "@/lib/esim/storefront/catalog";
import type { DrawnSection } from "@/lib/storefront/sections/drawn";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText } from "@/lib/storefront/sections/types";
import { toEsimDestination } from "./dto";

/**
 * The website's eSIM sections as GET /home blocks (APP-01), spread into
 * Storify's `HOME_BLOCK_MAPPERS` by patch P7. Read through the same catalogue
 * the sections render (lib/esim/storefront/catalog.ts). A section with
 * nothing to show is left out, as the website draws nothing for it.
 */

type Context = { locale: string; defaultLanguage: string; currency: Pick<Currency, "code" | "locale"> };
type Mapper = (section: DrawnSection, ctx: Context) => Promise<EsimDestinationsBlock | EsimDeviceCheckBlock | null>;

const text = (value: unknown, ctx: Context) => lt(value as LocalizedText, ctx.locale, ctx.defaultLanguage).trim() || undefined;
const slugsOf = (section: DrawnSection) =>
  (section.instance.blocks ?? [])
    .filter((block) => block.visible)
    .map((block) => String(block.settings.destination ?? ""))
    .filter(Boolean);
const count = (value: unknown, fallback: number, max: number) => Math.min(max, Math.max(0, Number(value ?? fallback) || fallback));

async function destinationsBlock(
  section: DrawnSection,
  ctx: Context,
  pick: () => Promise<Awaited<ReturnType<typeof popularDestinations>>>,
  extra: Partial<EsimDestinationsBlock> = {},
): Promise<EsimDestinationsBlock | null> {
  await connectDB();
  const settings = section.instance.settings;
  const destinations = (await pick()).map((destination) => toEsimDestination(destination, ctx.currency));
  if (!destinations.length && !extra.searchPlaceholder) return null;
  const title = text(settings.title, ctx);
  const subtitle = text(settings.subtitle, ctx);
  return {
    type: "ESIM_DESTINATIONS",
    id: section.instance.id,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    destinations,
    showPrice: settings.showPrice !== false,
    ...extra,
  };
}

const hero: Mapper = async (section, ctx) => {
  const slugs = slugsOf(section);
  const limit = count(section.instance.settings.popularCount, 6, 12);
  const placeholder = text(section.instance.settings.placeholder, ctx) ?? "";
  return destinationsBlock(
    section,
    ctx,
    async () => (slugs.length ? await destinationsBySlug(slugs) : limit ? await popularDestinations(limit, "local") : []),
    { searchPlaceholder: placeholder },
  );
};

const popular: Mapper = async (section, ctx) => {
  const settings = section.instance.settings;
  const limit = count(settings.limit, 8, 24);
  const scope = String(settings.scope ?? "local");
  return destinationsBlock(section, ctx, async () =>
    settings.source === "manual"
      ? (await destinationsBySlug(slugsOf(section))).slice(0, limit)
      : popularDestinations(limit, scope === "all" ? undefined : (scope as "local" | "regional" | "global")),
  );
};

/** The tabs' first page: the most popular of every kind, the full list a tap away. */
const tabs: Mapper = async (section, ctx) => destinationsBlock(section, ctx, () => popularDestinations(count(section.instance.settings.limit, 12, 48)));

const deviceCheck: Mapper = async (section, ctx) => {
  const title = text(section.instance.settings.title, ctx);
  if (!title) return null;
  const subtitle = text(section.instance.settings.subtitle, ctx);
  return { type: "ESIM_DEVICE_CHECK", id: section.instance.id, title, ...(subtitle ? { subtitle } : {}) };
};

export const ESIM_HOME_BLOCK_MAPPERS: Record<string, Mapper> = {
  "esim-hero": hero,
  "esim-popular": popular,
  "esim-destination-tabs": tabs,
  "esim-device-check": deviceCheck,
};
