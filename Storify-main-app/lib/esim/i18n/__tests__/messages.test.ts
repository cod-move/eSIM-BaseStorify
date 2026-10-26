import assert from "node:assert/strict";
import { describe, it } from "node:test";
import en from "@/locales/esim/en.json";
import zh from "@/locales/esim/zh.json";
import { withEsimMessages } from "../messages";

type Tree = Record<string, unknown>;
const at = (tree: Tree, path: string) => path.split(".").reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);
const leaves = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === "object" ? leaves(value as Tree, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

describe("withEsimMessages", () => {
  it("adds the eSIM messages under Storify's, in the locale's language", () => {
    const merged = withEsimMessages("zh", { common: { save: "保存" } });
    assert.equal(at(merged, "esim.account.title"), "我的 eSIM");
    assert.equal(at(merged, "common.save"), "保存");
  });

  it("keeps Storify's wording where both define a key", () => {
    const merged = withEsimMessages("fr", { admin: { storeBuilder: { options: { global: "Mondial" } } } });
    assert.equal(at(merged, "admin.storeBuilder.options.global"), "Mondial");
    assert.equal(at(merged, "esim.browse.title"), "eSIM destinations", "English under a locale with no eSIM file");
  });

  it("translates every English message into Chinese, with the same placeholders", () => {
    const enKeys = leaves(en as Tree);
    const zhKeys = new Set(leaves(zh as Tree));
    assert.deepEqual(enKeys.filter((key) => !zhKeys.has(key)), []);
    for (const key of enKeys) {
      const placeholders = (text: unknown) => String(text).match(/\{\w+\}/g)?.sort() ?? [];
      assert.deepEqual(placeholders(at(zh as Tree, key)), placeholders(at(en as Tree, key)), key);
    }
  });
});
