import type { EsimDestinationsBlock, EsimDeviceCheckBlock, EsimNumbersEntryBlock } from "@/contracts/mobile/shop/v1/esim";
import type { Currency } from "@/lib/intl/currencies";
import { connectDB } from "@/lib/db";
import { destinationsBySlug, popularDestinations } from "@/lib/esim/storefront/catalog";
import { localizeTemplateCopy } from "@/lib/esim/storefront/template-copy";
import { localizeDestinations } from "@/lib/esim/storefront/destination-names";
import type { DrawnSection } from "@/lib/storefront/sections/drawn";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText } from "@/lib/storefront/sections/types";
import { translator } from "@/lib/esim/i18n/server";
import { formatAmount } from "@/lib/esim/numbers/line";
import { numbersTeaser } from "@/lib/esim/numbers/storefront";
import { toEsimDestination } from "./dto";

/**
 * The website's eSIM sections as GET /home blocks (APP-01), spread into
 * Storify's `HOME_BLOCK_MAPPERS` by patch P7. Read through the same catalogue
 * the sections render (lib/esim/storefront/catalog.ts). A section with
 * nothing to show is left out, as the website draws nothing for it.
 */

type Context = { locale: string; defaultLanguage: string; currency: Pick<Currency, "code" | "locale"> };
type Mapper = (section: DrawnSection, ctx: Context) => Promise<EsimDestinationsBlock | EsimDeviceCheckBlock | EsimNumbersEntryBlock | null>;

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
  const destinations = (await localizeDestinations(await pick(), ctx.locale)).map((destination) => toEsimDestination(destination, ctx.currency));
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

/**
 * The tabs' first page: the most popular of every kind, the full list a tap
 * away. `destinations` is all of them together, for an app that draws no tabs.
 */
const tabs: Mapper = async (section, ctx) => {
  const settings = section.instance.settings;
  const limit = count(settings.limit, 12, 48);
  const block = await destinationsBlock(section, ctx, () => popularDestinations(limit));
  if (!block) return null;
  const scopes = [
    { scope: "local", label: text(settings.localTitle, ctx) ?? "Countries" },
    { scope: "regional", label: text(settings.regionalTitle, ctx) ?? "Regions" },
    { scope: "global", label: text(settings.globalTitle, ctx) ?? "Global" },
  ] as const;
  const lists = await Promise.all(
    scopes.map(async ({ scope }) => (await localizeDestinations(await popularDestinations(limit, scope), ctx.locale)).map((destination) => toEsimDestination(destination, ctx.currency))),
  );
  const shown = scopes.map((entry, index) => ({ ...entry, destinations: lists[index] })).filter((entry) => entry.destinations.length);
  return shown.length ? { ...block, tabs: shown } : block;
};

const grouped = (digits: string) => digits.replace(/(\d{3,4})(?=(\d{4})+$)/g, "$1 ");

/** "Need a phone number?" (NUM-03): nothing while no number is on sale, as on the website. */
const numbersEntry: Mapper = async (section, ctx) => {
  const settings = section.instance.settings;
  const teaser = await numbersTeaser(Math.min(6, Math.max(0, Number(settings.sampleCount ?? 3) || 0)));
  if (!teaser) return null;
  const tr = await translator(ctx.locale);
  const subtitle = text(settings.subtitle, ctx);
  return {
    type: "ESIM_NUMBERS_ENTRY",
    id: section.instance.id,
    title: text(settings.title, ctx) ?? tr("esim.numbers.entryTitle", "Need a phone number?"),
    ...(subtitle ? { subtitle } : {}),
    buttonLabel: text(settings.buttonLabel, ctx) ?? tr("esim.numbers.entryButton", "Choose a number"),
    ...(settings.showPrice !== false
      ? { summary: tr("esim.numbers.entryFrom", "{count} numbers · from {price}", { count: teaser.count, price: formatAmount(teaser.fromMinor, teaser.currency) }) }
      : {}),
    samples: teaser.samples.map((sample) => `+${sample.dialCode} ${grouped(sample.nationalNumber)}`),
    path: "/esim/numbers",
  };
};

const deviceCheck: Mapper = async (section, ctx) => {
  const title = text(section.instance.settings.title, ctx);
  if (!title) return null;
  const subtitle = text(section.instance.settings.subtitle, ctx);
  return { type: "ESIM_DEVICE_CHECK", id: section.instance.id, title, ...(subtitle ? { subtitle } : {}) };
};

/** The template's own text in the App's language first, as the website shows it (patch P35). */
const inLanguage = (mapper: Mapper): Mapper => async (section, ctx) =>
  mapper({ ...section, instance: (await localizeTemplateCopy([section.instance], ctx.locale))[0] }, ctx);

export const ESIM_HOME_BLOCK_MAPPERS: Record<string, Mapper> = {
  "esim-hero": inLanguage(hero),
  "esim-popular": inLanguage(popular),
  "esim-destination-tabs": inLanguage(tabs),
  "esim-device-check": inLanguage(deviceCheck),
  "esim-numbers-entry": inLanguage(numbersEntry),
};
