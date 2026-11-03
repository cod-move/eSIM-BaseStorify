import type { PricedPlanInput } from "@/lib/esim/pricing/price";
import type { TopConnectDataPackage } from "@/lib/esim/providers/topconnect";

/**
 * Number-card data packages (NUM-02), the parts with no database: how a
 * packet is priced like a plan, and how TopConnect's own list (`getdiscount`)
 * folds into the stored price list.
 */

/** TopConnect counts a megabyte as 1,024,000 bytes ("Daily package 10 MB" = 10240000). */
export const TOPCONNECT_MB = 1_024_000;

export interface NumberPackageCost {
  amountMinor: number;
  currency: string;
}

/**
 * The plan-shaped input `priceOf` takes: one country prices as a local plan
 * (so a country rule applies), several as regional, none as global. Rules
 * naming TopConnect apply to every packet.
 */
export function packagePricingInput(pkg: { countryCodes: string[]; cost: NumberPackageCost }, usdPerUnit: number): PricedPlanInput {
  return {
    providerCode: "topconnect",
    scope: pkg.countryCodes.length === 1 ? "local" : pkg.countryCodes.length ? "regional" : "global",
    countryCodes: pkg.countryCodes,
    costMinor: pkg.cost.amountMinor,
    usdPerUnit,
  };
}

export interface SupplierPacketFields {
  packetId: string;
  name: string;
  validityDays: number;
  volumeMb: number | null;
  cost: NumberPackageCost;
}

/** A `getdiscount` entry as stored fields; null when it has no usable price. */
export function packetFields(packet: TopConnectDataPackage, fallbackCurrency: string): SupplierPacketFields | null {
  if (!/^\d{1,9}$/.test(packet.code) || packet.priceMinor === null || packet.priceMinor < 0) return null;
  return {
    packetId: packet.code,
    name: packet.name.trim().slice(0, 120) || packet.code,
    validityDays: Math.max(0, packet.durationDays ?? 0),
    volumeMb: packet.volumeBytes && packet.volumeBytes > 0 ? Math.round(packet.volumeBytes / TOPCONNECT_MB) : null,
    cost: { amountMinor: packet.priceMinor, currency: (packet.currency ?? fallbackCurrency).toUpperCase() },
  };
}

export interface StoredPacket {
  id: string;
  packetId: string;
  cost: NumberPackageCost;
  validityDays: number;
  volumeMb: number | null;
}

export interface PacketMerge {
  /** Not on the list yet: added hidden, for an admin to name, place and switch on. */
  create: SupplierPacketFields[];
  /** On the list with a different cost, validity or volume: those are refreshed; the name an admin gave stays. */
  update: Array<{ id: string; packetId: string; set: Pick<SupplierPacketFields, "cost" | "validityDays" | "volumeMb">; before: Pick<StoredPacket, "cost" | "validityDays" | "volumeMb"> }>;
  unchanged: number;
  /** Lines TopConnect sent without a usable code or price. */
  skipped: number;
}

export function mergeSupplierPackets(stored: StoredPacket[], packets: TopConnectDataPackage[], fallbackCurrency: string): PacketMerge {
  const byPacket = new Map(stored.map((row) => [row.packetId, row]));
  const seen = new Set<string>();
  const merge: PacketMerge = { create: [], update: [], unchanged: 0, skipped: 0 };
  for (const packet of packets) {
    const fields = packetFields(packet, fallbackCurrency);
    if (!fields || seen.has(fields.packetId)) {
      merge.skipped += fields ? 0 : 1;
      continue;
    }
    seen.add(fields.packetId);
    const row = byPacket.get(fields.packetId);
    if (!row) {
      merge.create.push(fields);
      continue;
    }
    const same =
      row.cost.amountMinor === fields.cost.amountMinor &&
      row.cost.currency === fields.cost.currency &&
      row.validityDays === fields.validityDays &&
      row.volumeMb === fields.volumeMb;
    if (same) {
      merge.unchanged += 1;
      continue;
    }
    merge.update.push({
      id: row.id,
      packetId: row.packetId,
      set: { cost: fields.cost, validityDays: fields.validityDays, volumeMb: fields.volumeMb },
      before: { cost: row.cost, validityDays: row.validityDays, volumeMb: row.volumeMb },
    });
  }
  return merge;
}
