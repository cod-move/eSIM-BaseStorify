import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { TEMPLATE_COPY, templateText } from "../storefront/template-text";
import { ESIM_HOME_PRESET } from "../storefront/theme";

const LOCALES = path.join(process.cwd(), "locales", "esim");

describe("eSIM template text in every language", () => {
  it("has a translation of every shipped sentence in every eSIM locale", () => {
    const ids = new Set(Object.values(TEMPLATE_COPY));
    for (const file of fs.readdirSync(LOCALES).filter((name) => name.endsWith(".json"))) {
      const copy = JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8")).esim?.copy ?? {};
      const missing = [...ids].filter((id) => typeof copy[id] !== "string" || !copy[id].trim());
      assert.deepEqual(missing, [], `${file} misses esim.copy entries`);
    }
  });

  it("knows the English it translates: en.json says the same", () => {
    const en = JSON.parse(fs.readFileSync(path.join(LOCALES, "en.json"), "utf8")).esim.copy;
    for (const [text, id] of Object.entries(TEMPLATE_COPY)) assert.equal(en[id], text, id);
  });

  it("covers every sentence of the eSIM home page preset", () => {
    const texts: string[] = [];
    for (const section of ESIM_HOME_PRESET) {
      for (const value of Object.values(section.settings)) if (typeof value === "string" && /[a-z] /i.test(value)) texts.push(value);
      for (const block of section.blocks ?? []) for (const value of Object.values(block.settings)) if (typeof value === "string" && /[a-z] /i.test(value)) texts.push(value);
    }
    assert.ok(texts.length > 10);
    assert.deepEqual(texts.filter((text) => !TEMPLATE_COPY[text]), []);
  });

  it("translates shipped text and leaves an admin's own words alone", () => {
    const tr = (key: string, fallback: string) => (key === "esim.copy.popularTitle" ? "热门目的地" : fallback);
    assert.equal(templateText("Popular destinations", tr), "热门目的地");
    assert.equal(templateText("Our favourite places", tr), "Our favourite places");
  });
});
