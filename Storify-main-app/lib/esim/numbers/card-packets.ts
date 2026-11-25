/**
 * The packet code of each package on a number card (NUM-09), which
 * cancelling one needs. TopConnect's card reads (`card_stat`, `discountm`)
 * name the packages but often leave the code out, and name a package
 * differently from the price list: packet 618 "EU + Unlimited Data 升级包"
 * shows on the card as "EU + Unlimited Data Auto Package". As the live store
 * did, a missing code is taken from what we know:
 *
 * 1. a package on our price list with that name, or with it as a name the
 *    card shows for it (`cardNames`: set by an admin, or learned by 2.);
 * 2. else the number's latest completed package purchase made while the
 *    package could have started (before it ends, within its validity), whose
 *    card name is then learned for the other cards that show it.
 *
 * Pure: the card read (lib/esim/numbers/account.ts) supplies the rows.
 */

export interface CardPackageRef {
  packetId: string | null;
  name: string | null;
  expiresAt: Date | null;
}

export interface CatalogPacket {
  packetId: string;
  name: string;
  cardNames?: string[] | null;
  validityDays: number;
}

export interface PacketPurchase {
  packetId: string;
  at: Date;
}

const DAY_MS = 86_400_000;
/** TopConnect's times are its local time read as UTC, and a purchase may start a little later: room either side. */
const SLACK_MS = 2 * DAY_MS;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function resolveCardPacketIds(
  entries: CardPackageRef[],
  catalog: CatalogPacket[],
  /** Completed package purchases on this number, any order. */
  purchases: PacketPurchase[],
): { packetIds: Array<string | null>; learned: Array<{ packetId: string; cardName: string }> } {
  const newestFirst = [...purchases].sort((a, b) => b.at.getTime() - a.at.getTime());
  const learned: Array<{ packetId: string; cardName: string }> = [];
  const packetIds = entries.map((entry) => {
    if (entry.packetId) return entry.packetId;
    const name = entry.name?.trim();
    if (name) {
      const named = new Set(
        catalog.filter((packet) => same(packet.name, name) || (packet.cardNames ?? []).some((alias) => same(alias, name))).map((packet) => packet.packetId),
      );
      if (named.size === 1) return [...named][0];
      if (named.size > 1) return null;
    }
    const bought = newestFirst.find((purchase) => {
      if (!entry.expiresAt) return true;
      const validity = catalog.find((packet) => packet.packetId === purchase.packetId)?.validityDays ?? 31;
      const ends = entry.expiresAt.getTime();
      return purchase.at.getTime() <= ends + SLACK_MS && purchase.at.getTime() >= ends - validity * DAY_MS - SLACK_MS;
    });
    if (!bought) return null;
    const listed = catalog.find((packet) => packet.packetId === bought.packetId);
    if (name && listed && !same(listed.name, name) && !learned.some((entry) => entry.packetId === bought.packetId && same(entry.cardName, name))) {
      learned.push({ packetId: bought.packetId, cardName: name });
    }
    return bought.packetId;
  });
  return { packetIds, learned };
}
