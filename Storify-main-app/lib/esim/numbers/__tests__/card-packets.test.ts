import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCardPacketIds } from "@/lib/esim/numbers/card-packets";

const catalog = [
  { packetId: "618", name: "EU + Unlimited Data 升级包", cardNames: [], validityDays: 30 },
  { packetId: "614", name: "EU + Data Package 5GB", cardNames: [], validityDays: 30 },
];
const auto = { packetId: null, name: "EU + Unlimited Data Auto Package", expiresAt: new Date("2026-12-15T22:37:55Z") };

describe("packet codes for the packages on a number card", () => {
  it("keeps the code the card gives", () => {
    assert.deepEqual(resolveCardPacketIds([{ ...auto, packetId: "9" }], catalog, []).packetIds, ["9"]);
  });

  it("takes the code of the price-list package with the card's name", () => {
    const result = resolveCardPacketIds([{ packetId: null, name: "eu + data package 5gb", expiresAt: null }], catalog, []);
    assert.deepEqual(result, { packetIds: ["614"], learned: [] });
  });

  it("takes a purchase made within the package's validity, and learns the card's name for it", () => {
    // Bought 2026-11-15 20:37 UTC; the card says it started 22:37 its local time and runs 30 days.
    const result = resolveCardPacketIds([auto], catalog, [{ packetId: "618", at: new Date("2026-11-15T20:37:59Z") }]);
    assert.deepEqual(result, { packetIds: ["618"], learned: [{ packetId: "618", cardName: "EU + Unlimited Data Auto Package" }] });
  });

  it("matches a learned card name on a card with no purchase here (a migrated number)", () => {
    const learned = catalog.map((packet) => (packet.packetId === "618" ? { ...packet, cardNames: ["EU + Unlimited Data Auto Package"] } : packet));
    assert.deepEqual(resolveCardPacketIds([auto], learned, []).packetIds, ["618"]);
  });

  it("leaves the code unknown for a purchase long before the package started, or a name two packages share", () => {
    assert.deepEqual(resolveCardPacketIds([auto], catalog, [{ packetId: "618", at: new Date("2026-08-01T00:00:00Z") }]).packetIds, [null]);
    const shared = [...catalog, { packetId: "700", name: "Other", cardNames: ["EU + Unlimited Data Auto Package"], validityDays: 30 }];
    const both = shared.map((packet) => (packet.packetId === "618" ? { ...packet, cardNames: ["EU + Unlimited Data Auto Package"] } : packet));
    assert.deepEqual(resolveCardPacketIds([auto], both, [{ packetId: "618", at: new Date("2026-11-15T20:37:59Z") }]).packetIds, [null]);
  });
});
