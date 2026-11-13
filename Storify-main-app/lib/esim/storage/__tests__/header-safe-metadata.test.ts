import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headerSafeMetadata } from "../header-safe-metadata";

describe("header-safe object metadata", () => {
  it("keeps ASCII values and encodes the rest", () => {
    const safe = headerSafeMetadata({ uploadedBy: "65f0c0ffee", originalName: "微信图片_2026.jpg" });
    assert.equal(safe?.uploadedBy, "65f0c0ffee");
    assert.equal(safe?.originalName, encodeURIComponent("微信图片_2026.jpg"));
    assert.equal(decodeURIComponent(safe!.originalName!), "微信图片_2026.jpg");
    assert.match(safe!.originalName!, /^[\x20-\x7E]+$/);
  });

  it("leaves no metadata as none", () => {
    assert.equal(headerSafeMetadata(undefined), undefined);
    assert.deepEqual(headerSafeMetadata({ originalName: "photo.jpg" }), { originalName: "photo.jpg" });
  });
});
