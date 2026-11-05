import "server-only";

import { translator, type Translate } from "@/lib/esim/i18n/server";
import { TEMPLATE_COPY as COPY, templateText } from "@/lib/esim/storefront/template-text";
import { getSectionDefinition } from "@/lib/storefront/sections/registry";
import type { Field, LocalizedText, SectionInstance } from "@/lib/storefront/sections/types";

/**
 * The eSIM template's own words in the shopper's language (patch P35).
 *
 * The eSIM theme's home page (lib/esim/storefront/theme.ts), the blocks'
 * defaults and starters (lib/esim/storefront/sections/) and the device list
 * (lib/esim/storefront/devices.ts) are written in English, and the page
 * builder stores them as they are: a plain string, shown in every language.
 * Here each sentence the template ships (lib/esim/storefront/template-text.ts)
 * is shown in the page's language.
 *
 * Only that text changes. Words an admin wrote, or a translation an admin
 * gave for this language in the page builder's language tabs, are kept.
 */

/** The English text of a stored value: a plain string, or the one entry of a per-language record that is template text. */
function shippedText(value: LocalizedText): string | null {
  if (typeof value === "string") return COPY[value.trim()] ? value : null;
  return Object.values(value).find((entry) => typeof entry === "string" && COPY[entry.trim()]) ?? null;
}

function localize(value: unknown, locale: string, tr: Translate): unknown {
  if (typeof value === "string") return templateText(value, tr);
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, string>;
  // A translation the admin gave for this language wins.
  if (typeof record[locale] === "string" && record[locale].trim()) return value;
  const english = shippedText(record);
  return english ? { ...record, [locale]: templateText(english, tr) } : value;
}

const translatable = (fields: readonly Field[] | undefined) =>
  (fields ?? []).filter((field) => "translatable" in field && field.translatable) as Array<Field & { default?: LocalizedText }>;

/**
 * One instance's settings with the template's text in `locale`. A field the
 * instance never stored shows its definition's default when it is drawn;
 * that default is template text too, so it is given here, translated.
 */
function localizeSettings(settings: Record<string, unknown>, fields: readonly Field[] | undefined, locale: string, tr: Translate) {
  const next = { ...settings };
  for (const field of translatable(fields)) {
    if (field.key in next && next[field.key] !== undefined && next[field.key] !== null) next[field.key] = localize(next[field.key], locale, tr);
    else if (typeof field.default === "string" && COPY[field.default.trim()]) next[field.key] = templateText(field.default, tr);
  }
  return next;
}

/** The sections with the template's own text in `locale`; nothing else changes. Never throws. */
export async function localizeTemplateCopy(sections: SectionInstance[], locale: string): Promise<SectionInstance[]> {
  try {
    const tr = await translator(locale);
    return sections.map((section) => {
      const definition = getSectionDefinition(section.type);
      if (!definition) return section;
      const settings = localizeSettings(section.settings, definition.fields, locale, tr);
      const blocks = section.blocks?.map((block) => {
        const fields = definition.blocks?.find((entry) => entry.type === block.type)?.fields;
        return translatable(fields).length ? { ...block, settings: localizeSettings(block.settings, fields, locale, tr) } : block;
      });
      return { ...section, settings, ...(blocks ? { blocks } : {}) };
    });
  } catch (error) {
    console.error("Translating the eSIM template text failed:", error);
    return sections;
  }
}
