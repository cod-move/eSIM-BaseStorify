import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { localizeNotice, timeAgoIn, type NoticeTranslator } from "../localize";

type Tree = Record<string, unknown>;

/** A next-intl-like translator over a locale's eSIM file, English underneath. */
function translator(code: string): NoticeTranslator {
  const read = (c: string) => JSON.parse(readFileSync(path.join(process.cwd(), "locales", "esim", `${c}.json`), "utf8")) as Tree;
  const at = (tree: Tree, key: string) => key.split(".").reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
  const trees = [read(code), read("en")];
  const lookup = (key: string) => trees.map((tree) => at(tree, key)).find((value) => typeof value === "string") as string | undefined;
  const t = ((key: string, values?: Record<string, string | number>) =>
    (lookup(key) ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""))) as NoticeTranslator;
  t.has = (key) => lookup(key) !== undefined;
  return t;
}

/** Every sentence the notification writers store, as they write it today. */
const TITLES = [
  "Order Confirmed",
  "Order Pending",
  "Order Processing",
  "Order Shipped",
  "Order Delivered",
  "Order Cancelled",
  "Order Complete",
  "Part of your order could not be supplied",
  "Store credit added",
  "Email verified",
  "Verify your email",
  "Verification email delivery delayed",
  "New chat reply",
  "New message from Ana",
  "Your eSIM is ready",
  "Your eSIMs are ready",
  "Your number is ready",
  "Your numbers are ready",
  "Added to your number",
  "Your top-up is on your eSIM",
  "Order ES-1001: your eSIM will follow shortly",
  "Order ES-1001: your eSIMs will follow shortly",
  "Order ES-1001: 2 of your 3 eSIMs will follow shortly",
  "Refund for order ES-1001",
  "Your number top-up is delayed",
  "Your eSIM is connected",
  "Your eSIM is running low",
  "Your eSIM plan ends soon",
  "Install your eSIM soon",
  "Identity verified",
  "Identity check not passed",
  "Money added to your balance",
  "Referral reward added",
];

const MESSAGES = [
  "Your order #ES-1001 has been placed and confirmed.",
  "Your order #ES-1001 has been placed and is now pending.",
  "Your POS order #ES-1001 is complete.",
  "Your order #ES-1001 is now pending.",
  "Your order #ES-1001 is now processing.",
  "Your order #ES-1001 has been shipped.",
  "Your order #ES-1001 has been delivered. How was it? Rate your items to help other shoppers.",
  "Your order #ES-1001 has been cancelled.",
  "$5.00 in store credit was added to your account.",
  "Your email address has been verified successfully.",
  "A verification link was sent to ana@example.com.",
  "We could not deliver your verification email yet. Please use resend shortly.",
  "Order ES-1001: open it to install before you travel.",
  "Order ES-1001: +44 7700 900123. Open it to install.",
  "We are completing the rest of your order. We will email the eSIM as soon as it is issued, or refund it.",
  "We could not issue your eSIM; 4.50 USD is back in your balance.",
  "We could not complete 1 of your 2 top-ups; 4.50 USD is back in your balance.",
  "We could not issue your eSIMs right away. We will complete it or refund you shortly.",
  "We could not complete 1 of your 2 items right away. We will complete it or refund you shortly.",
  "Japan 5GB is now in use. Check your remaining data any time in My eSIMs.",
  "200 MB left on Japan 5GB.",
  "200 MB left on Japan 5GB. Add data so you stay connected.",
  "Japan 5GB ends Fri, 06 Nov 2026 10:00 UTC.",
  "Japan 5GB ends Fri, 06 Nov 2026 10:00 UTC. Top up to keep it going.",
  "Japan 5GB must be installed before Fri, 06 Nov 2026 10:00 UTC.",
  "Your identity is verified. You can now buy eSIMs that need it.",
  "We could not verify your identity: the photo is blurry. You can send your details again.",
  "$10.00 was added to your balance. Use it at checkout.",
  "$1.20 was added to your balance for an order by someone you invited.",
];

describe("localizeNotice", () => {
  it("translates every stored English sentence into another language", () => {
    const t = translator("ja");
    for (const title of TITLES) {
      assert.notEqual(localizeNotice({ title, message: "" }, t, "ja").title, title, title);
    }
    for (const message of MESSAGES) {
      assert.notEqual(localizeNotice({ title: "", message }, t, "ja").message, message, message);
    }
  });

  it("keeps the values a sentence carries", () => {
    const t = translator("zh");
    const notice = localizeNotice(
      { title: "Order ES-1001: 2 of your 3 eSIMs will follow shortly", message: "200 MB left on Japan 5GB. Add data so you stay connected." },
      t,
      "zh",
    );
    for (const value of ["ES-1001", "2", "3"]) assert.ok(notice.title.includes(value), notice.title);
    for (const value of ["200 MB", "Japan 5GB"]) assert.ok(notice.message.includes(value), notice.message);
    assert.ok(!notice.message.includes("。 "), "no space between Chinese sentences");
  });

  it("reads back the same English, so each pattern takes the whole sentence", () => {
    const t = translator("en");
    // Dates are re-formatted, and a failure is told without its item kind.
    for (const message of MESSAGES.filter((text) => !/UTC|^We could not (issue|complete)/.test(text))) {
      assert.equal(localizeNotice({ title: "", message }, t, "en").message, message);
    }
  });

  it("leaves text it does not know as stored", () => {
    const notice = { title: "Summer sale starts today", message: "Hello there" };
    assert.deepEqual(localizeNotice(notice, translator("ja"), "ja"), notice);
  });

  it("says how long ago in the page's language", () => {
    const now = Date.UTC(2026, 10, 6, 12);
    assert.equal(timeAgoIn("en", new Date(now - 3 * 60_000), now), "3 minutes ago");
    assert.equal(timeAgoIn("en", new Date(now - 86_400_000), now), "yesterday");
  });
});
