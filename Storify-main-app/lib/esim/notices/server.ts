import "server-only";

import { getTranslations } from "next-intl/server";
import { localizeNotice, type NoticeTranslator } from "./localize";

type Notice = { title: string; message: string };

/**
 * The stored notifications in `locale` for the store's apps (patch P75): the
 * same sentence rules the website's notification list uses (P37), applied
 * where GET /notifications reads its page, so the app shows each notice in
 * its language. Text no rule knows, or a language without the words, stays as
 * stored. Never throws: a notice that cannot be translated shows as stored.
 */
export async function noticesIn<T extends Notice>(locale: string, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  try {
    const t = (await getTranslations({ locale })) as unknown as NoticeTranslator;
    return items.map((item) => ({ ...item, ...localizeNotice(item, t, locale) }));
  } catch (error) {
    console.error("Translating the notifications failed:", error);
    return items;
  }
}
