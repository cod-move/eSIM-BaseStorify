import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COVER_VERSION, coverFacts, coverImages, coverPath, isGeneratedCover, nameFontSize, nameFromSlug } from "@/lib/esim/catalog/cover";

const plan = (destination: string, scope: "local" | "regional" | "global", codes: string[], emoji: string | null = null) => ({
  destination,
  emoji,
  coverage: { scope, countries: codes.map((code) => ({ code })) },
});

describe("eSIM product covers", () => {
  it("lives under a versioned path, which is told apart from uploads", () => {
    assert.equal(coverPath("japan-esim"), `/api/esim/product-image/${COVER_VERSION}/japan-esim.png`);
    assert.equal(isGeneratedCover(coverPath("japan-esim")), true);
    assert.equal(isGeneratedCover("https://shop.example.com/api/esim/product-image/v0/japan-esim.png"), true);
    assert.equal(isGeneratedCover("https://cdn.example.com/uploads/japan.png"), false);
    assert.equal(isGeneratedCover(null), false);
  });

  it("is given only to a product without pictures, and replaces only an older cover", () => {
    assert.deepEqual(coverImages("japan-esim", { images: [], media: [] }), [coverPath("japan-esim")]);
    assert.deepEqual(coverImages("japan-esim", {}), [coverPath("japan-esim")]);
    assert.equal(coverImages("japan-esim", { images: [], media: [{ url: "x" }] }), null);
    assert.equal(coverImages("japan-esim", { images: ["https://cdn.example.com/japan.png"] }), null);
    assert.equal(coverImages("japan-esim", { images: [coverPath("japan-esim")] }), null);
    assert.deepEqual(coverImages("japan-esim", { images: ["/api/esim/product-image/v0/japan-esim.png"] }), [coverPath("japan-esim")]);
  });

  it("draws a country's flag, a region's own flag, or up to four of its countries", () => {
    assert.deepEqual(coverFacts([plan("Japan", "local", ["JP"])], "x"), { name: "Japan", scope: "local", flags: ["/esim/flags/JP.svg"], countryCount: 1 });
    assert.deepEqual(coverFacts([plan("Europe", "regional", ["FR", "DE", "IT"], "🇪🇺")], "x").flags, ["/esim/flags/EU.svg"]);
    const asia = coverFacts([plan("Asia", "regional", ["JP", "KR", "TH", "VN", "SG"]), plan("Asia", "regional", ["TH", "VN"])], "x");
    assert.deepEqual(asia.flags, ["/esim/flags/TH.svg", "/esim/flags/VN.svg", "/esim/flags/JP.svg", "/esim/flags/KR.svg"]);
    assert.equal(asia.countryCount, 5);
    assert.deepEqual(coverFacts([plan("Global", "global", [])], "x").flags, []);
  });

  it("is named as most plans are, else from the slug", () => {
    assert.equal(coverFacts([plan("USA", "local", ["US"]), plan("United States", "local", ["US"]), plan("United States", "local", ["US"])], "x").name, "United States");
    assert.equal(coverFacts([], nameFromSlug("hong-kong-esim")).name, "Hong Kong");
    assert.ok(nameFontSize("Japan") > nameFontSize("Europe & Mediterranean 40 areas"));
  });
});
