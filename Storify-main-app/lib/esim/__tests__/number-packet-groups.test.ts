import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packetGroups, packetVolume, perGbMinor } from "@/lib/esim/numbers/packet-groups";

describe("number data package groups", () => {
  const names: Record<string, string> = { FR: "France", DE: "Germany", CN: "China" };
  const nameOf = (code: string) => names[code] ?? code;

  it("puts packages covering the same countries together, in the admin's order", () => {
    const groups = packetGroups(
      [
        { id: "a", countryCodes: ["de", "FR"] },
        { id: "b", countryCodes: ["CN"] },
        { id: "c", countryCodes: ["FR", "DE"] },
      ],
      nameOf,
    );
    assert.deepEqual(groups.map((group) => [group.codes, group.packets.map((packet) => packet.id)]), [
      [["FR", "DE"], ["a", "c"]],
      [["CN"], ["b"]],
    ]);
    assert.deepEqual(groups[0].names, ["France", "Germany"]);
  });

  it("shows volume and the price per GB", () => {
    assert.equal(packetVolume(5000), "5 GB");
    assert.equal(packetVolume(1500), "1.5 GB");
    assert.equal(packetVolume(500), "500 MB");
    assert.equal(packetVolume(null), null);
    assert.equal(perGbMinor(800, 5000), 160);
    assert.equal(perGbMinor(800, null), null);
  });
});
