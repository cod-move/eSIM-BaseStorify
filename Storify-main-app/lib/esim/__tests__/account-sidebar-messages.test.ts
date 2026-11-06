import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { pickStorefrontMessages } from "@/lib/i18n/surface-messages";

/**
 * Patch P42: the account area draws the dashboards' Sidebar, which reads
 * `admin.sidebar`; the storefront bundle must carry its labels (and not the
 * rest of the admin menu), or the page throws MISSING_MESSAGE.
 */
describe("the account's sidebar labels", () => {
  const en = JSON.parse(readFileSync(path.join(process.cwd(), "locales", "en.json"), "utf8"));
  const picked = pickStorefrontMessages(en) as { admin?: { sidebar?: Record<string, string> } };

  it("are in the storefront bundle", () => {
    for (const key of ["mobileTitle", "mobileDescription", "landmark", "toggle"]) {
      assert.equal(picked.admin?.sidebar?.[key], en.admin.sidebar[key], key);
    }
  });

  it("without the admin menu", () => {
    assert.deepEqual(Object.keys(picked.admin?.sidebar ?? {}).sort(), ["landmark", "mobileDescription", "mobileTitle", "toggle"]);
  });
});
