/**
 * Menu item labels by language (patch P36).
 *
 * Storify's menu items have one `label`. A menu item may also carry
 * `labels`: the label in other languages, set in the menu editor
 * (Online store → Navigation). The storefront shows the page language's
 * label when there is one, the item's own label otherwise. Pure.
 */

export type MenuLabels = Record<string, string>;

const LOCALE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/** The stored per-language labels, cleaned: known-looking locales, non-empty text. */
export function menuLabelsOf(raw: unknown): MenuLabels | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, string] => LOCALE.test(entry[0]) && typeof entry[1] === "string" && entry[1].trim() !== "")
    .map(([locale, label]) => [locale, label.trim().slice(0, 120)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

type LabelledItem = { label: string; labels?: MenuLabels; children?: LabelledItem[] };

/** The items with each label in `locale` where one was given; the tree's shape is unchanged. */
export function menuItemsIn<T extends LabelledItem>(items: readonly T[], locale: string): T[] {
  return items.map((item) => ({
    ...item,
    label: item.labels?.[locale]?.trim() || item.label,
    ...(item.children ? { children: menuItemsIn(item.children, locale) } : {}),
  }));
}

/** A menu (or none) with its labels in `locale`. */
export function menuIn<T extends { items: LabelledItem[] }>(menu: T, locale: string): T;
export function menuIn<T extends { items: LabelledItem[] }>(menu: T | null, locale: string): T | null;
export function menuIn<T extends { items: LabelledItem[] }>(menu: T | null, locale: string): T | null {
  return menu ? { ...menu, items: menuItemsIn(menu.items, locale) } : null;
}

/**
 * A header layout (Online store → Customize → Header) with every nav link's
 * label in `locale` (patch P43): a link carries `labels` like a menu item.
 * Walks the whole tree, so links in any row, column or dropdown are covered;
 * anything without `labels` is returned as it is. Pure.
 */
export function headerLinksIn<T>(layout: T, locale: string): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) next[key] = key === "labels" ? value : walk(value);
    const labels = menuLabelsOf(record.labels);
    if (labels && typeof record.label === "string") next.label = labels[locale] ?? record.label;
    return next;
  };
  return walk(layout) as T;
}
