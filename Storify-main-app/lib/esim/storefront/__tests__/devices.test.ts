import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchDevices } from "../devices";

describe("searchDevices", () => {
  it("finds models by name, across brands or within one", () => {
    assert.ok(searchDevices("iphone 15").some((model) => model.name === "iPhone 15 Pro"));
    assert.ok(searchDevices("pixel 8", "Google").every((model) => model.brand === "Google"));
    assert.deepEqual(searchDevices("iphone", "Samsung"), []);
  });

  it("carries the regional caveats", () => {
    const [pixel3] = searchDevices("Pixel 3 XL");
    assert.match(pixel3.note ?? "", /Japan/);
  });
});
