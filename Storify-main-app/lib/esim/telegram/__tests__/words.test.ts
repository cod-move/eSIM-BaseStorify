import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botLanguage, words } from "@/lib/esim/telegram/words";

describe("Telegram bot words", () => {
  it("speaks Chinese to a Chinese Telegram app, English otherwise", () => {
    assert.equal(botLanguage("zh-hans"), "zh");
    assert.equal(botLanguage("zh-TW"), "zh");
    assert.equal(botLanguage("en"), "en");
    assert.equal(botLanguage(null), "en");
  });

  it("after linking, says to check in in the group and gives its link when there is one", () => {
    const withLink = words("zh").linked("a@b.co", "https://t.me/codsim");
    assert.match(withLink, /a@b\.co/);
    assert.match(withLink, /签到/);
    assert.match(withLink, /https:\/\/t\.me\/codsim/);
    const without = words("en").linked("a@b.co", null);
    assert.match(without, /\/checkin/);
    assert.doesNotMatch(without, /t\.me/);
  });

  it("without an eSIM in use, says the period's limit is reached: buy one, or come back next period", () => {
    const zh = words("zh").limitReached("小明", "month", "300 MB", "https://shop.test");
    assert.match(zh, /本月/);
    assert.match(zh, /300 MB/);
    assert.match(zh, /购买/);
    assert.ok(zh.includes("https://shop.test/esim"));
    assert.match(zh, /下个月/);
    const en = words("en").limitReached("Ann", "week", "300 MB", "https://shop.test");
    assert.match(en, /this week/);
    assert.match(en, /next week/);
    const full = words("zh").limitFull("month", "300 MB", "https://shop.test");
    assert.match(full, /本月的签到流量已领满 300 MB/);
    assert.match(full, /下个月/);
  });
});
