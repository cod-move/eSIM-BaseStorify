import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { getMessageAt, withRouteMessages } from "../surface-messages";

const localesDir = new URL("../../../locales/", import.meta.url);

for (const file of readdirSync(localesDir).filter((file) => file.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  test(`${locale}: account bundle includes shared sidebar labels`, () => {
    const messages = JSON.parse(readFileSync(new URL(file, localesDir), "utf8")) as AbstractIntlMessages;
    const account = withRouteMessages(messages, ["account", "orders", "checkout"]);
    const t = createTranslator({
      locale,
      messages: account,
      namespace: "admin.sidebar",
      onError(error) { throw error; },
    });
    for (const key of ["mobileTitle", "mobileDescription", "landmark", "toggle"]) {
      assert.equal(t(key), getMessageAt(messages, `admin.sidebar.${key}`));
    }
    assert.equal(getMessageAt(account, "admin.sidebar.orders"), undefined);
    assert.equal(getMessageAt(account, "admin.customers"), undefined);
  });
}
