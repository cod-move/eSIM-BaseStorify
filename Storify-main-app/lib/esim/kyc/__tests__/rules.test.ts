import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KycFormError, checkAnswers, kycRequiredFor, normalizeForm, type KycField } from "../rules";

describe("normalizeForm", () => {
  it("tidies fields and makes keys from labels", () => {
    const [name, id] = normalizeForm([
      { label: " Full name ", type: "text", required: true },
      { label: "ID type", type: "select", options: ["Passport", " Passport ", "ID card", ""] },
    ]);
    assert.deepEqual(name, { key: "full_name", label: "Full name", type: "text", required: true, options: [], help: null });
    assert.deepEqual(id.options, ["Passport", "ID card"], "choices trimmed and de-duplicated");
  });

  it("refuses forms that would not work", () => {
    assert.throws(() => normalizeForm([]), KycFormError);
    assert.throws(() => normalizeForm([{ label: "", type: "text" }]), /needs a label/);
    assert.throws(() => normalizeForm([{ label: "x", type: "colour" as never }]), /no known type/);
    assert.throws(() => normalizeForm([{ label: "Pick", type: "select", options: ["only one"] }]), /two choices/);
    assert.throws(() => normalizeForm([{ label: "Name", type: "text" }, { label: "name", type: "text" }]), /share the key/);
  });
});

describe("checkAnswers", () => {
  const fields: KycField[] = normalizeForm([
    { label: "Full name", type: "text", required: true },
    { label: "Born", type: "date", required: true },
    { label: "ID type", type: "select", required: true, options: ["Passport", "ID card"] },
    { label: "Notes", type: "textarea" },
    { label: "ID photo", type: "file", required: true },
  ]);

  it("accepts good answers", () => {
    const result = checkAnswers(fields, { full_name: " Ada ", born: "1990-02-03", id_type: "Passport" }, { id_photo: { name: "id.jpg", mime: "image/jpeg", size: 1000 } });
    assert.deepEqual(result, { ok: true, values: { full_name: "Ada", born: "1990-02-03", id_type: "Passport" } });
  });

  it("lists every problem by field", () => {
    const result = checkAnswers(fields, { born: "yesterday", id_type: "Licence", notes: "x".repeat(2001) }, { id_photo: { name: "id.exe", mime: "application/x-msdownload", size: 10 } });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.ok ? {} : result.errors).sort(), ["born", "full_name", "id_photo", "id_type", "notes"]);
    const big = checkAnswers(fields, { full_name: "A", born: "1990-01-01", id_type: "ID card" }, { id_photo: { name: "id.pdf", mime: "application/pdf", size: 11 * 1024 * 1024 } });
    assert.match(big.ok ? "" : big.errors.id_photo, /larger than 10 MB/);
  });
});

describe("kycRequiredFor", () => {
  it("the plan's own setting, else a listed country, else the supplier", () => {
    assert.equal(kycRequiredFor({ kycRequired: false, countryCodes: ["CN"] }, true, ["CN"]), false, "the plan says no");
    assert.equal(kycRequiredFor({ kycRequired: true, countryCodes: ["JP"] }, false, []), true, "the plan says yes");
    assert.equal(kycRequiredFor({ kycRequired: null, countryCodes: ["JP", "cn"] }, false, ["CN"]), true, "a listed country");
    assert.equal(kycRequiredFor({ kycRequired: null, countryCodes: ["JP"] }, true, ["CN"]), true, "the supplier default");
    assert.equal(kycRequiredFor({ kycRequired: null, countryCodes: ["JP"] }, false, ["CN"]), false);
  });
});
