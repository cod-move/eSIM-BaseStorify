import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey, formatMb, isTimezone, looksLikeEmail, parseCommand, periodStart, rollMb, withinCap } from "@/lib/esim/telegram/rules";

describe("Telegram check-in rules", () => {
  it("counts the day in the store's time zone", () => {
    // 2026-11-17 17:30 UTC is already the 18th in Shanghai, still the 17th in New York.
    const at = new Date("2026-11-17T17:30:00Z");
    assert.equal(dayKey(at, "Asia/Shanghai"), "2026-11-18");
    assert.equal(dayKey(at, "America/New_York"), "2026-11-17");
    assert.equal(dayKey(at, "Not/AZone"), "2026-11-17");
    assert.equal(isTimezone("Asia/Shanghai"), true);
    assert.equal(isTimezone("Not/AZone"), false);
  });

  it("rolls a whole amount within the range, both ends included", () => {
    const seen: number[] = [];
    rollMb(10, 100, (low, high) => {
      seen.push(low, high);
      return low;
    });
    assert.deepEqual(seen, [10, 101]);
    assert.equal(rollMb(100, 10, (low) => low), 10);
    assert.equal(rollMb(0, 0, (low) => low), 1);
    for (let i = 0; i < 200; i += 1) {
      const value = rollMb(5, 8);
      assert.ok(value >= 5 && value <= 8 && Number.isInteger(value));
    }
  });

  it("cuts a check-in to what is left of the day's cap", () => {
    assert.equal(withinCap(50, 0, 0), 50);
    assert.equal(withinCap(50, 980, 1000), 20);
    assert.equal(withinCap(50, 1000, 1000), 0);
    assert.equal(withinCap(50, 1200, 1000), 0);
  });

  it("prints MB and GB the way plans do", () => {
    assert.equal(formatMb(850), "850 MB");
    assert.equal(formatMb(1024), "1 GB");
    assert.equal(formatMb(1536), "1.5 GB");
    assert.equal(formatMb(-2048), "-2 GB");
  });

  it("reads check-ins, linking and other commands", () => {
    assert.deepEqual(parseCommand("/checkin", "CodsimBot"), { name: "checkin" });
    assert.deepEqual(parseCommand("/checkin@codsimbot", "CodsimBot"), { name: "checkin" });
    assert.equal(parseCommand("/checkin@OtherBot", "CodsimBot"), null);
    assert.deepEqual(parseCommand(" 签到 ", null), { name: "checkin" });
    assert.deepEqual(parseCommand("簽到", null), { name: "checkin" });
    assert.deepEqual(parseCommand("/start abcDEF_123-xyzxyzxyz", null), { name: "start", arg: "abcDEF_123-xyzxyzxyz" });
    assert.deepEqual(parseCommand("/bind  Name@Example.com ", null), { name: "bind", arg: "Name@Example.com" });
    assert.deepEqual(parseCommand("123456", null), { name: "code", arg: "123456" });
    assert.deepEqual(parseCommand("/chatid", null), { name: "chatid" });
    assert.equal(parseCommand("hello there", null), null);
    assert.equal(parseCommand("/unknown", null), null);
    assert.equal(parseCommand("签到吧", null), null);
  });

  it("tells an email from anything else", () => {
    assert.equal(looksLikeEmail("a@b.co"), true);
    assert.equal(looksLikeEmail("not an email"), false);
    assert.equal(looksLikeEmail("a@b"), false);
  });

  it("starts a limit period on the day, the Monday, or the 1st", () => {
    assert.equal(periodStart("2026-11-21", "day"), "2026-11-21");
    assert.equal(periodStart("2026-11-21", "month"), "2026-11-01");
    assert.equal(periodStart("2026-11-21", "week"), "2026-11-16", "a Saturday's week began on Monday");
    assert.equal(periodStart("2026-11-16", "week"), "2026-11-16", "a Monday is its own start");
    assert.equal(periodStart("2026-11-22", "week"), "2026-11-16", "Sunday ends the week");
    assert.equal(periodStart("2026-03-01", "week"), "2026-02-23", "across a month");
  });

  it("cuts a roll to what is left of the period's limit", () => {
    assert.equal(withinCap(80, 250, 300), 50);
    assert.equal(withinCap(80, 300, 300), 0);
    assert.equal(withinCap(30, 100, 300), 30);
  });
});
