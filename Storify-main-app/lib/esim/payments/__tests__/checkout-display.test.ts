import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appDisplayRank, arrangeMethods, EMPTY_CHECKOUT_DISPLAY, isIconUrl, shownOn } from "../checkout-display";

const rows = ["store_credit", "card", "paypal", "extension:stripe", "extension:bepusdt", "cod"].map((value) => ({ value }));
const values = (list: Array<{ value: string }>) => list.map((row) => row.value);

describe("checkout display", () => {
  it("orders the rows as set, the balance first, unlisted ones after in checkout's own order", () => {
    const display = { order: ["extension:bepusdt", "cod", "card"], defaultMethod: null, icons: {}, webHidden: [], appHidden: [] };
    assert.deepEqual(values(arrangeMethods(rows, display)), ["store_credit", "extension:bepusdt", "cod", "card", "paypal", "extension:stripe"]);
    assert.deepEqual(values(arrangeMethods(rows, EMPTY_CHECKOUT_DISPLAY)), values(rows), "nothing set: as checkout has them");
    assert.deepEqual(values(arrangeMethods(rows, null)), values(rows));
  });

  it("puts the app's single eSIM entry where the first eSIM method is", () => {
    const display = { order: ["cod", "extension:stripe", "card"], defaultMethod: null, icons: {}, webHidden: [], appHidden: [] };
    const app = ["card", "extension", "cod"].map((id) => ({ id, rank: appDisplayRank(display, id) })).sort((a, b) => a.rank - b.rank);
    assert.deepEqual(app.map((entry) => entry.id), ["cod", "extension", "card"]);
    assert.equal(appDisplayRank(EMPTY_CHECKOUT_DISPLAY, "extension"), Number.MAX_SAFE_INTEGER);
  });

  it("takes only site paths and https addresses as icons", () => {
    assert.ok(isIconUrl("/uploads/alipay.png"));
    assert.ok(isIconUrl("https://cdn.example.test/wechat.svg"));
    assert.ok(!isIconUrl("http://cdn.example.test/x.png"));
    assert.ok(!isIconUrl("//evil.test/x.png"));
    assert.ok(!isIconUrl("javascript:alert(1)"));
    assert.ok(!isIconUrl('https://x.test/a.png" onerror="x'));
    assert.ok(!isIconUrl(undefined));
  });

  it("hides a method from the website's or the app's checkout only, never the balance", () => {
    const display = { ...EMPTY_CHECKOUT_DISPLAY, webHidden: ["extension:bepusdt"], appHidden: ["cod", "store_credit"] };
    assert.equal(shownOn(display, "web", "extension:bepusdt"), false);
    assert.equal(shownOn(display, "app", "extension:bepusdt"), true);
    assert.equal(shownOn(display, "app", "cod"), false);
    assert.equal(shownOn(display, "web", "cod"), true);
    assert.equal(shownOn(display, "app", "store_credit"), true);
    assert.equal(shownOn(undefined, "app", "cod"), true);
  });
});
