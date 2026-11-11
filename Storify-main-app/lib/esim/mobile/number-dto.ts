import type { EsimNumberPacketGroup, EsimNumberRecharge } from "@/contracts/mobile/shop/v1/esim";
import { toMoney } from "@/lib/api-core/shop/money";
import type { Translate } from "@/lib/esim/i18n/server";
import { packetGroups, packetVolume, perGbMinor } from "@/lib/esim/numbers/packet-groups";
import type { NumberShop, ShopPacket } from "@/lib/esim/numbers/storefront";

/**
 * The website's number readers (lib/esim/numbers/*) in the mobile
 * contract's shape (NUM-03~09): amounts in the card's currency as `Money`,
 * countries named in the shopper's language.
 */

/** Cents of the card currency as `Money`. */
export const cardMoney = (minor: number, currency: string) => toMoney(minor / 100, currency);

/** "+372 5550 1234": as the website prints a number. */
export function displayNumber(dialCode: string, nationalNumber: string): string {
  return `+${dialCode} ${nationalNumber.replace(/(\d{3,4})(?=(\d{4})+$)/g, "$1 ")}`;
}

/** Region codes named in the locale's language, English where it has none. */
export function regionNamer(locale: string): (code: string) => string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, "en"], { type: "region" });
  } catch {
    names = null;
  }
  return (code) => {
    try {
      return names?.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
}

/** The data packages grouped by the countries they cover, as the website's picker shows them. */
export function packetGroupViews(packets: ShopPacket[], currency: string, locale: string, t: Translate): EsimNumberPacketGroup[] {
  const nameOf = regionNamer(locale);
  const unlimited = t("esim.numbers.unlimited", "Unlimited");
  return packetGroups(packets, nameOf).map((group) => ({
    key: group.key,
    countries: group.codes.map((code, index) => ({ code, name: group.names[index] ?? code })),
    packets: group.packets.map((packet) => {
      const perGb = perGbMinor(packet.priceMinor, packet.volumeMb);
      return {
        id: packet.id,
        name: packet.name,
        volume: packetVolume(packet.volumeMb) ?? unlimited,
        validityDays: packet.validityDays,
        price: cardMoney(packet.priceMinor, currency),
        ...(perGb !== null ? { perGb: cardMoney(perGb, currency) } : {}),
      };
    }),
  }));
}

export function rechargeView(recharge: NumberShop["recharge"]): EsimNumberRecharge {
  return {
    currency: recharge.currency,
    minMinor: recharge.minMinor,
    maxMinor: recharge.maxMinor,
    presetMinor: recharge.presetMinor,
    min: cardMoney(recharge.minMinor, recharge.currency),
    max: cardMoney(recharge.maxMinor, recharge.currency),
    suggestions: recharge.suggestions.map((minor) => ({ minor, money: cardMoney(minor, recharge.currency) })),
    usdPerUnit: recharge.usdPerUnit,
  };
}

/** The risks a buyer accepts first (the website's list, in the shopper's language). */
export function numberRisks(t: Translate): string[] {
  return [
    t("esim.numbers.risk1", "Because of the war and EU sanctions, this eSIM does not work in Russia or Iran. Do not buy it for use there."),
    t("esim.numbers.risk2", "Text messages and one-time codes from third parties (banks, apps, social networks) are not guaranteed; some codes may never be sent to +372 numbers at all."),
    t("esim.numbers.risk3", "Failed verification codes are not refunded. A third party refusing to send to your number is not a reason for a refund."),
    t("esim.numbers.risk4", "Emergency calls are not guaranteed. Do not rely on this eSIM as your only way to reach emergency services; keep another local means of communication."),
    t("esim.numbers.risk5", "Sign-up checks by Google, Telegram, WhatsApp and others are outside our control; failures they cause are not refunded."),
    t("esim.numbers.risk6", "Call forwarding can send calls to a number in any country; forwarded calls are charged to the number's credit."),
    t(
      "esim.numbers.risk7",
      "Some devices and services (including iMessage and FaceTime) may send activation texts automatically when the eSIM is installed or turned on. These are charged as standard outgoing texts; to avoid them, turn off outgoing texts in the line settings before installing.",
    ),
    t("esim.numbers.risk8", "To keep the number, it needs at least one qualifying activity (data, text, call or recharge) every 365 days; otherwise the number may be reclaimed."),
  ];
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : undefined);
export { iso };
