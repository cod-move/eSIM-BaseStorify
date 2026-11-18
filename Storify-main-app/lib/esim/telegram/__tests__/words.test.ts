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
});
