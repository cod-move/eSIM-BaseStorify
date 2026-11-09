/**
 * A number's data packages grouped by the countries they cover, for the
 * package picker (components/esim/number-packet-picker.tsx). Pure.
 */

export interface GroupablePacket {
  countryCodes: string[];
}

export interface PacketGroup<T extends GroupablePacket> {
  /** The sorted codes, joined: packages covering the same countries share it. */
  key: string;
  codes: string[];
  /** The countries' names, sorted, for the group's line. */
  names: string[];
  packets: T[];
}

/**
 * Packages covering the same countries together, in the order the first of
 * each comes (the admin's order); a group's countries sorted by name.
 */
export function packetGroups<T extends GroupablePacket>(packets: readonly T[], nameOf: (code: string) => string): Array<PacketGroup<T>> {
  const groups = new Map<string, PacketGroup<T>>();
  for (const packet of packets) {
    const codes = [...new Set(packet.countryCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))].sort();
    const key = codes.join(",");
    let group = groups.get(key);
    if (!group) {
      const named = codes.map((code) => ({ code, name: nameOf(code) })).sort((a, b) => a.name.localeCompare(b.name));
      group = { key, codes: named.map((entry) => entry.code), names: named.map((entry) => entry.name), packets: [] };
      groups.set(key, group);
    }
    group.packets.push(packet);
  }
  return [...groups.values()];
}

/** TopConnect's megabytes (1 GB = 1,000 MB in its packages) as "5 GB", "500 MB". */
export function packetVolume(volumeMb: number | null | undefined): string | null {
  if (volumeMb === null || volumeMb === undefined || !(volumeMb > 0)) return null;
  if (volumeMb >= 1000) {
    const gb = volumeMb / 1000;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Math.round(volumeMb)} MB`;
}

/** The price per GB, in the same minor units; null without a volume. */
export function perGbMinor(priceMinor: number, volumeMb: number | null | undefined): number | null {
  if (volumeMb === null || volumeMb === undefined || !(volumeMb > 0)) return null;
  return Math.round((priceMinor * 1000) / volumeMb);
}
