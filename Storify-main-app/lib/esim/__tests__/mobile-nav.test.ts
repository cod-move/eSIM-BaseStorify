import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrangeTabs, tabHref, type MobileNavTab } from "../storefront/mobile-nav";

type Item = { key: string; label?: string };

const bar: Item[] = ["home", "wishlist", "notifications", "menu", "account"].map((key) => ({ key, label: key }));
const extra = (tab: MobileNavTab): Item | null => (tab.href || tab.key === "esim" ? { key: tab.key, label: tab.key } : null);
const relabel = (item: Item, label: string) => ({ ...item, label });
const arrange = (items: Item[], tabs: MobileNavTab[] | undefined) => arrangeTabs(items, tabs, extra, relabel, "zh");

describe("arrangeTabs", () => {
  it("keeps the store's bar when nothing is set", () => {
    assert.deepEqual(arrange(bar, undefined), bar);
    assert.deepEqual(arrange(bar, []), bar);
  });

  it("orders, hides, renames and adds tabs", () => {
    const out = arrange(bar, [
      { key: "home", enabled: true },
      { key: "esim", enabled: true },
      { key: "wishlist", enabled: false },
      { key: "menu", enabled: true, labels: { zh: "更多", en: "More" } },
      { key: "account", enabled: true },
      { key: "notifications", enabled: false },
    ]);
    assert.deepEqual(out.map((item) => [item.key, item.label]), [["home", "home"], ["esim", "esim"], ["menu", "更多"], ["account", "account"]]);
  });

  it("puts a staff role's dashboard where the account tab goes, and skips tabs it has not got", () => {
    const staff: Item[] = [{ key: "home" }, { key: "menu" }, { key: "dashboard" }];
    const out = arrange(staff, [{ key: "account", enabled: true }, { key: "wishlist", enabled: true }, { key: "menu", enabled: true }, { key: "home", enabled: true }]);
    assert.deepEqual(out.map((item) => item.key), ["dashboard", "menu", "home"]);
  });

  it("never loses the menu, and shows at most five", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) => ({ key: `link-${id}`, enabled: true, href: "/x" }));
    const out = arrange(bar, six);
    assert.equal(out.length, 5);
    assert.equal(out.at(-1)?.key, "menu");
  });
});

describe("tabHref", () => {
  it("adds the language to store paths only", () => {
    assert.equal(tabHref("/esim/japan", "zh"), "/zh/esim/japan");
    assert.equal(tabHref("/zh/esim", "zh"), "/zh/esim");
    assert.equal(tabHref("/", "en"), "/en");
    assert.equal(tabHref("https://example.com/help", "zh"), "https://example.com/help");
  });
});
