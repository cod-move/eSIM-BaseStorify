import "server-only";

import { getTranslations } from "next-intl/server";

export type Translate = (key: string, fallback: string, values?: Record<string, string | number>) => string;

/**
 * `t(key)` when the key exists, the English fallback with `{name}` filled in
 * otherwise — the server-side twin of `useFallbackTranslator`.
 */
export async function translator(locale: string): Promise<Translate> {
  const t = await getTranslations({ locale });
  return (key, fallback, values) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
}
