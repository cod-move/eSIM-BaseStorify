import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeLines, type ScopeTranslate } from "@/lib/esim/account/coupon-scope-words";
import zh from "@/locales/esim/zh.json";

const item = (name: string) => ({ name, href: null });

const english: ScopeTranslate = (_key, fallback) => fallback;
const chinese: ScopeTranslate = (key, fallback, values) => {
  const text = key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), zh);
  if (typeof text !== "string") return fallback;
  return Object.entries(values ?? {}).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text);
};

describe("a coupon's products, worded", () => {
  it("names them instead of saying 'Selected products only'", () => {
    assert.deepEqual(scopeLines({ only: [item("Japan eSIM"), item("Thailand eSIM")], notFor: [] }, "en", english), [
      "Only for: Japan eSIM and Thailand eSIM",
    ]);
    assert.deepEqual(scopeLines({ only: [item("日本 eSIM"), item("泰国 eSIM")], notFor: [item("手机号码 eSIM")] }, "zh", chinese), [
      "适用商品：日本 eSIM和泰国 eSIM",
      "不适用：手机号码 eSIM",
    ]);
  });

  it("counts the rest after five names", () => {
    const only = ["A", "B", "C", "D", "E", "F", "G"].map(item);
    assert.equal(scopeLines({ only, notFor: [] }, "en", english)[0], "Only for: A, B, C, D, E, and 2 more");
    assert.equal(scopeLines({ only, notFor: [] }, "zh", chinese)[0], "适用商品：A、B、C、D、E和另外 2 件");
  });

  it("says nothing for a coupon on every product", () => {
    assert.deepEqual(scopeLines(undefined, "en", english), []);
    assert.deepEqual(scopeLines({ only: [], notFor: [] }, "en", english), []);
  });
});
