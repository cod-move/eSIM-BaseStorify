import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCardBytes, numberValidUntil, packageLeftPercent, parseLpa } from "../numbers/install";

describe("number card install details", () => {
  it("splits an LPA code for installing by hand", () => {
    assert.deepEqual(parseLpa("LPA:1$rsp.example.com$ABC-123"), { smdpAddress: "rsp.example.com", matchingId: "ABC-123" });
    assert.deepEqual(parseLpa("not a code"), { smdpAddress: null, matchingId: null });
    assert.deepEqual(parseLpa(null), { smdpAddress: null, matchingId: null });
  });

  it("keeps a number a year after its last use, or after the sale", () => {
    assert.equal(numberValidUntil({ lastUsedAt: new Date("2026-03-01T10:00:00Z"), soldAt: new Date("2025-01-01T00:00:00Z") })!.toISOString(), "2027-03-01T10:00:00.000Z");
    assert.equal(numberValidUntil({ soldAt: new Date("2026-11-04T00:00:00Z") })!.toISOString(), "2027-11-04T00:00:00.000Z");
    assert.equal(numberValidUntil({}), null);
  });

  it("shows TopConnect's bytes in its own megabytes", () => {
    assert.equal(formatCardBytes(10_240_000), "10 MB");
    assert.equal(formatCardBytes(5_120 * 1_024_000), "5 GB");
    assert.equal(formatCardBytes(5_000 * 1_024_000), "4.9 GB");
    assert.equal(formatCardBytes(51_200 * 1_024_000), "50 GB");
    assert.equal(formatCardBytes(null), null);
    assert.equal(packageLeftPercent(1000, 250), 25);
    assert.equal(packageLeftPercent(0, 10), null);
    assert.equal(packageLeftPercent(1000, null), null);
  });
});
