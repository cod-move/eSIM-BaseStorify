import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withEsimMessages } from "../messages";

type Tree = Record<string, unknown>;
const at = (tree: Tree, path: string) => path.split(".").reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);

describe("withEsimMessages", () => {
  it("adds the eSIM messages under Storify's, in the locale's language", () => {
    const merged = withEsimMessages("zh", { common: { save: "保存" } });
    assert.equal(at(merged, "esim.account.title"), "我的 eSIM");
    assert.equal(at(merged, "common.save"), "保存");
  });

  it("keeps Storify's wording where both define a key", () => {
    const merged = withEsimMessages("fr", { admin: { storeBuilder: { options: { global: "Mondial" } } } });
    assert.equal(at(merged, "admin.storeBuilder.options.global"), "Mondial");
    assert.equal(at(merged, "esim.browse.title"), "Destinations eSIM");
  });

  it("falls back to English under a locale with no eSIM file", () => {
    const merged = withEsimMessages("xx", {});
    assert.equal(at(merged, "esim.browse.title"), "eSIM destinations");
  });
});
