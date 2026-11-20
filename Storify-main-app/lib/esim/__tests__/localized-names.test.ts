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

  it("translates a country the supplier names another way", () => {
    const one = (name: string, code: string) => ({ slug: name.toLowerCase(), name, scope: "local", countries: [{ code, name }] });
    for (const [name, code] of [["Palestine", "PS"], ["Curaçao", "CW"], ["Curacao", "CW"], ["Macao", "MO"], ["Macau", "MO"], ["Antigua and Barbuda", "AG"], ["St. Kitts and Nevis", "KN"], ["Trinidad and Tobago", "TT"], ["Hong Kong", "HK"], ["Turkey", "TR"]] as const) {
      const shown = destinationNameIn(one(name, code), "zh");
      assert.notEqual(shown, name, name);
      assert.equal(shown, new Intl.DisplayNames(["zh"], { type: "region" }).of(code), name);
    }
    assert.equal(destinationNameIn({ ...china, name: "China 5G" }, "zh"), "China 5G", "still only a plain name");
  });

  it("keeps English pages and names that say more than the country", () => {
    assert.equal(destinationNameIn(china, "en"), "China");
    assert.equal(destinationNameIn(mainland, "zh"), "China mainland");
    assert.equal(destinationNameIn(europe, "en"), "Europe 35 areas");
  });

  it("puts together regions and several countries in the page's language", () => {
    const region = (name: string) => destinationNameIn({ slug: "x", name, scope: "regional", countries: [] }, "zh");
    assert.equal(region("Europe 35 areas"), "欧洲（35 个国家/地区）");
    assert.equal(region("Europe (35 countries)"), "欧洲（35 个国家/地区）");
    assert.equal(region("Global (140 countries)"), "全球（140 个国家/地区）");
    assert.equal(region("Caribbean (20+ areas)"), "加勒比地区（20+ 个国家/地区）");
    assert.equal(region("Asia 30"), "亚洲（30 个国家/地区）");
    assert.equal(region("West Asia8"), "西亚（8 个国家/地区）");
    assert.equal(region("North and South America18"), "北美洲 + 南美洲（18 个国家/地区）");
    assert.equal(region("Middle East & North Africa"), "中东 + 北非");
    assert.equal(region("Europe 40 & Middle East"), "欧洲（40 个国家/地区） + 中东");
    assert.equal(region("China + Hong Kong + Macao"), "中国 + 香港 + 澳门");
    assert.equal(region("Japan & Korea"), "日本 + 韩国");
    assert.equal(region("France,Germany,Italy & UK"), "法国 + 德国 + 意大利 + 英国");
    assert.equal(region("Saudi Arabia + United Arab Emirates"), "沙特阿拉伯 + 阿拉伯联合酋长国");
    assert.equal(region("Australia(Promo)"), "澳大利亚 · 特惠");
    assert.equal(region("Mexico(New)"), "墨西哥 · 新");
    assert.equal(region("Caribbean (20+ areas) 1GB/Day"), "加勒比地区（20+ 个国家/地区） · 每天 1GB");
    assert.equal(region("South America (15+ areas) eSIM Unlimited -"), "南美洲（15+ 个国家/地区） · 无限流量");
    assert.equal(destinationNameIn({ slug: "x", name: "Europe (35 countries)", scope: "regional", countries: [] }, "de"), "Europa (35 Länder)");
    assert.equal(destinationNameIn({ slug: "x", name: "Europe (35 countries)", scope: "regional", countries: [] }, "zh-hant"), "歐洲（35 個國家/地區）");
  });

  it("leaves a name it does not fully understand in English", () => {
    const region = (name: string, locale = "zh") => destinationNameIn({ slug: "x", name, scope: "regional", countries: [] }, locale);
    assert.equal(region("Europe Plus"), "Europe Plus");
    assert.equal(region("China + Atlantis"), "China + Atlantis");
    assert.equal(region("Japan (3 countries)"), "Japan (3 countries)", "a count after one country");
    assert.equal(region("Japan 5"), "Japan 5");
    assert.equal(region("Middle East (5 countries)", "ig"), "Middle East (5 countries)", "a language without the region's word");
  });

  it("uses the name an admin gave for the language first", () => {
    const names = { "china-mainland": { zh: "中国大陆" }, "europe-35-areas": { zh: "欧洲 35 国" } };
    assert.equal(destinationNameIn(mainland, "zh", names), "中国大陆");
    assert.equal(destinationNameIn(europe, "zh", names), "欧洲 35 国");
    assert.equal(destinationNameIn(europe, "ja", names), "ヨーロッパ（35か国・地域）", "another language without one is put together");
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
