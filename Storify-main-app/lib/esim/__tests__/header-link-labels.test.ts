import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headerLinksIn } from "@/lib/esim/storefront/menu-labels";

describe("header nav links in the page's language", () => {
  const layout = {
    rows: [
      {
        columns: [
          {
            items: [
              {
                kind: "nav",
                links: [
                  { id: "a", label: "Destinations", labels: { zh: "目的地", ja: "目的地" }, children: [{ id: "b", label: "Asia", labels: { zh: "亚洲" }, children: [] }] },
                  { id: "c", label: "Help", children: [] },
                ],
              },
              { kind: "button", label: "Shop" },
            ],
          },
        ],
      },
    ],
  };

  it("shows each link's label in that language, sub-links too", () => {
    const zh = headerLinksIn(layout, "zh");
    const links = zh.rows[0].columns[0].items[0].links!;
    assert.equal(links[0].label, "目的地");
    assert.equal(links[0].children[0].label, "亚洲");
  });

  it("keeps the label where none was given, and leaves the rest alone", () => {
    const fr = headerLinksIn(layout, "fr");
    assert.equal(fr.rows[0].columns[0].items[0].links![0].label, "Destinations");
    const zh = headerLinksIn(layout, "zh");
    assert.equal(zh.rows[0].columns[0].items[0].links![1].label, "Help");
    assert.equal(zh.rows[0].columns[0].items[1].label, "Shop");
    assert.equal(layout.rows[0].columns[0].items[0].links![0].label, "Destinations", "the saved layout is not changed");
  });
});
