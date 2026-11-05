import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * `locales/esim/store/<code>.json` translates Storify's own strings it leaves
 * untranslated (lib/esim/i18n/messages.ts). Each must be a non-empty string
 * with the same `{placeholders}` as Storify's English, where Storify has it.
 */

type Tree = Record<string, unknown>;
const ROOT = path.join(process.cwd(), "locales");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Tree;
const leaves = (tree: Tree, prefix = ""): [string, unknown][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value) ? leaves(value as Tree, `${prefix}${key}.`) : [[`${prefix}${key}`, value] as [string, unknown]],
  );
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
const english = new Map(leaves(read(path.join(ROOT, "en.json"))));
/** Strings the checkout writes with a code fallback only; their placeholders, from that fallback. */
const CODE_ONLY: Record<string, string[]> = {
  "checkout.continueWith": ["{name}"],
  "checkout.payment.codBelowMinimum": ["{amount}"],
  "checkout.payment.codAboveMaximum": ["{amount}"],
};

describe("store string translations", () => {
  const dir = path.join(ROOT, "esim", "store");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    it(`${file}: non-empty, with Storify's placeholders`, () => {
      for (const [key, value] of leaves(read(path.join(dir, file)))) {
        assert.ok(typeof value === "string" && value.trim() !== "", `${key} is empty`);
        const source = english.get(key);
        const expected = typeof source === "string" ? placeholders(source) : CODE_ONLY[key];
        if (expected) assert.deepEqual(placeholders(value as string), [...expected].sort(), key);
      }
    });
  }
});
