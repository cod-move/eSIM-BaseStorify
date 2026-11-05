import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinationNameIn, destinationsIn } from "../storefront/destination-name";
import { menuIn, menuLabelsOf } from "../storefront/menu-labels";

const china = { slug: "china", name: "China", scope: "local", countries: [{ code: "CN", name: "China" }] };
const mainland = { slug: "china-mainland", name: "China mainland", scope: "local", countries: [{ code: "CN", name: "China" }] };
const europe = { slug: "europe-35-areas", name: "Europe 35 areas", scope: "regional", countries: [{ code: "FR", name: "France" }, { code: "DE", name: "Germany" }] };

describe("destination names by language", () => {
  it("names a plain single country in the page's language", () => {
    assert.equal(destinationNameIn(china, "zh"), "中国");
    assert.equal(destinationNameIn(china, "de"), "China");
    assert.equal(destinationNameIn({ ...china, slug: "japan", name: "Japan", countries: [{ code: "JP", name: "Japan" }] }, "zh"), "日本");
  });

  it("keeps English pages and names that say more than the country", () => {
    assert.equal(destinationNameIn(china, "en"), "China");
    assert.equal(destinationNameIn(mainland, "zh"), "China mainland");
    assert.equal(destinationNameIn(europe, "zh"), "Europe 35 areas");
  });

  it("uses the name an admin gave for the language first", () => {
    const names = { "china-mainland": { zh: "中国大陆" }, "europe-35-areas": { zh: "欧洲 35 国" } };
    assert.equal(destinationNameIn(mainland, "zh", names), "中国大陆");
    assert.equal(destinationNameIn(europe, "zh", names), "欧洲 35 国");
    assert.equal(destinationNameIn(europe, "ja", names), "Europe 35 areas", "another language without one keeps the supplier's");
    const [shown] = destinationsIn([europe], "zh", names);
    assert.equal(shown.englishName, "Europe 35 areas", "the English name stays for search");
  });
});

describe("menu labels by language", () => {
  it("keeps only usable labels", () => {
    assert.deepEqual(menuLabelsOf({ zh: " 目的地 ", de: "", "x y": "bad", ja: 3 }), { zh: "目的地" });
    assert.equal(menuLabelsOf({}), undefined);
    assert.equal(menuLabelsOf("zh"), undefined);
  });

  it("shows the page language's label, the item's own otherwise, down the tree", () => {
    const menu = {
      name: "Header",
      items: [
        { label: "Destinations", labels: { zh: "目的地" }, children: [{ label: "Asia", labels: { zh: "亚洲" }, children: [] }] },
        { label: "My eSIM", children: [] },
      ],
    };
    const zh = menuIn(menu, "zh");
    assert.deepEqual(zh.items.map((item) => item.label), ["目的地", "My eSIM"]);
    assert.equal(zh.items[0].children?.[0].label, "亚洲");
    assert.equal(menuIn(menu, "de").items[0].label, "Destinations");
    assert.equal(menuIn(null, "zh"), null);
  });
});
