import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { locales } from "@/config/i18n.config";

/**
 * Every `locales/esim/<code>.json` must be a full translation of `en.json`:
 * the same keys, every value a non-empty string, and the same `{placeholders}`
 * per key — a missing key falls back to English, a renamed placeholder renders
 * as an empty gap. Every language the store offers needs its own file.
 */

type Tree = Record<string, unknown>;

const DIR = path.join(process.cwd(), "locales", "esim");
const read = (code: string) => JSON.parse(readFileSync(path.join(DIR, `${code}.json`), "utf8")) as Tree;

const leaves = (tree: Tree, prefix = ""): [string, unknown][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? leaves(value as Tree, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

const en = new Map(leaves(read("en")));
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".json") && name !== "en.json")
  .map((name) => name.replace(/\.json$/, ""));

describe("eSIM locale files", () => {
  it("has a file for every language the store offers", () => {
    assert.deepEqual(
      locales.filter((code) => code !== "en" && !files.includes(code)),
      [],
    );
  });

  for (const code of files) {
    it(`${code}.json matches en.json key for key, with the same placeholders`, () => {
      const translated = new Map(leaves(read(code)));
      assert.deepEqual([...en.keys()].filter((key) => !translated.has(key)), [], "missing keys");
      assert.deepEqual([...translated.keys()].filter((key) => !en.has(key)), [], "keys not in en.json");
      for (const [key, value] of translated) {
        assert.ok(typeof value === "string" && value.trim() !== "", `${key} is empty`);
        assert.deepEqual(placeholders(value as string), placeholders(en.get(key) as string), key);
      }
    });
  }
});
