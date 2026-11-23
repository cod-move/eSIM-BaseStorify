import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { couponCopyFrom } from "@/lib/catalog/coupon-words";
import { withEsimMessages } from "@/lib/esim/i18n/messages";
import { isRecord } from "@/lib/utils";
import enMessages from "@/locales/en.json";
import zhMessages from "@/locales/zh.json";
import deMessages from "@/locales/de.json";

/**
 * The coupon lines (My coupons, the app's coupon list, checkout) come from
 * Storify's own keys, which Storify translates only in English. The request
 * config puts English under every language first, so those strings must be
 * translated in locales/esim/store/, which goes over Storify's messages.
 */

type Tree = Record<string, unknown>;
function mergeDeep(base: Tree, override: Tree): Tree {
  const result: Tree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? mergeDeep(current as Tree, value as Tree) : value;
  }
  return result;
}

function copyFor(locale: string, own: Tree) {
  // As lib/i18n/request.ts builds a locale's messages.
  const messages = withEsimMessages(locale, mergeDeep(enMessages as Tree, own));
  const read = (key: string) => key.split(".").reduce<unknown>((node, part) => (isRecord(node) ? node[part] : undefined), messages);
  return couponCopyFrom((key, fallback, values) => {
    const text = read(key);
    if (typeof text !== "string") return fallback;
    return Object.entries(values ?? {}).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text);
  }, locale);
}

describe("coupon lines in the shopper's language", () => {
  it("are Chinese on a Chinese page", () => {
    const copy = copyFor("zh", zhMessages as Tree);
    assert.equal(copy.offerFixed("$1.00"), "立减 $1.00");
    assert.equal(copy.minOrder("$5.00"), "订单满 $5.00 可用");
    assert.equal(copy.selectedProducts(), "仅限指定商品");
    assert.equal(copy.perCustomer(1), "每人限用 1 次");
    assert.match(copy.ends(new Date("2026-12-01T00:00:00Z")), /到期$/);
  });

  it("are German on a German page", () => {
    const copy = copyFor("de", deMessages as Tree);
    assert.equal(copy.offerFixed("1,00 $"), "1,00 $ Rabatt");
    assert.equal(copy.perCustomer(1), "Einmal pro Kunde");
  });
});
