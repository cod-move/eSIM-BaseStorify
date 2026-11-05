import "server-only";

import { mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { rechargeMinOf } from "@/lib/esim/numbers/settings";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import {
  numberLineLabel,
  numberLinePriceMinor,
  rechargeProblem,
  cardChargeRate,
  cardUsdMinor,
  type NumberLineChoice,
  type NumberLineSnapshot,
} from "@/lib/esim/numbers/line";

/**
 * A number-card cart line priced and, at checkout, the number held
 * (NUM-03/04).
 *
 * Adding to the cart only checks the number is free: it is held when the
 * shopper starts paying — every checkout re-pricing (`esimLinePrices`) holds
 * it for `RESERVATION_MINUTES` in one atomic write, so of two shoppers paying
 * for the same number one is told it is taken. Re-pricing again renews the
 * same shopper's hold. A hold nobody paid for runs out and is released by the
 * fulfilment cron (`releaseExpiredReservations`); a payment that arrives
 * after its hold ran out still gets the number if nobody took it meanwhile,
 * else it is refunded (lib/esim/numbers/fulfil.ts).
 */

export const RESERVATION_MINUTES = 10;

export interface NumberCartLine {
  lineAttributes: { number: NumberLineSnapshot; label: string };
  priceMinor: number;
  label: string;
}

/** Free, held by this shopper, or held by someone whose hold ran out. */
function obtainable(userId: string, now: Date): Record<string, unknown> {
  return {
    $or: [
      { status: "available" },
      { status: "reserved", "reservation.customer": new mongoose.Types.ObjectId(userId) },
      { status: "reserved", "reservation.until": { $lt: now } },
    ],
  };
}

/** The TopConnect supplier's settlement currency: what every number price is in, and what recharges are put on the card in. */
async function cardCurrency(): Promise<string> {
  const provider = await EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean();
  return provider?.settlementCurrency ?? "EUR";
}

/**
 * The line's priced snapshot, or why it cannot be bought. With `reserve`
 * the number is held for the shopper as well (checkout).
 */
export async function numberCartLine(choice: NumberLineChoice | undefined, userId: string | undefined, options: { reserve?: boolean } = {}): Promise<NumberCartLine | string> {
  if (!userId || !mongoose.isValidObjectId(userId)) return "Sign in to buy a phone number";
  if (!choice?.id || !mongoose.isValidObjectId(choice.id)) return "Choose a number from the numbers page";
  const recharge = choice.recharge ?? 0;
  const settings = await getEsimSettings();
  const problem = recharge ? rechargeProblem(recharge, rechargeMinOf(settings)) : "Choose the first credit to put on the number";
  if (problem) return problem;

  const now = new Date();
  const filter: Record<string, unknown> = { _id: choice.id, ...obtainable(userId, now) };
  const number = options.reserve
    ? await EsimNumber.findOneAndUpdate(
        filter,
        {
          $set: {
            status: "reserved",
            reservation: { customer: new mongoose.Types.ObjectId(userId), until: new Date(now.getTime() + RESERVATION_MINUTES * 60_000) },
          },
        },
        { returnDocument: "after" },
      ).lean()
    : await EsimNumber.findOne(filter).lean();
  if (!number) return "This number has just been taken: choose another one";

  const currency = await cardCurrency();
  let packet: { id: string; packetId: string; name: string; cost: { amountMinor: number; currency: string }; priceMinor: number } | null = null; // priceMinor: card currency
  if (choice.packet) {
    const row = mongoose.isValidObjectId(choice.packet) ? await EsimNumberPackage.findOne({ _id: choice.packet, status: "active" }).lean() : null;
    if (!row || !(row.retailPriceMinor > 0)) return "This data package is no longer offered: choose another one";
    packet = { id: String(row._id), packetId: row.packetId, name: row.name, cost: row.cost, priceMinor: row.retailPriceMinor };
  }

  // Every part is priced in the card currency and charged in USD at the day's rate plus the buffer.
  const rate = (await currentRates([currency])).get(currency);
  if (!rate) return "This number cannot be priced right now: try again later";
  const chargeRate = cardChargeRate(rate.usdPerUnit, settings.fxBufferPercent);

  const snapshot: NumberLineSnapshot = {
    id: String(number._id),
    msisdn: number.msisdn,
    numberMinor: number.priceMinor,
    premiumMinor: number.premiumMinor,
    numberUsdMinor: cardUsdMinor(number.priceMinor + number.premiumMinor, chargeRate),
    recharge,
    rechargeCurrency: currency,
    rechargeUsdMinor: cardUsdMinor(recharge, chargeRate),
    ...(packet ? { packet: packet.id, packetId: packet.packetId, packetName: packet.name, packetCost: packet.cost, packetMinor: packet.priceMinor } : {}),
    packetUsdMinor: cardUsdMinor(packet?.priceMinor ?? 0, chargeRate),
  };
  const label = numberLineLabel({ dialCode: number.dialCode, nationalNumber: number.nationalNumber, recharge, rechargeCurrency: currency, packetName: packet?.name });
  return { lineAttributes: { number: snapshot, label }, priceMinor: numberLinePriceMinor(snapshot), label };
}

/** Hands back numbers whose hold ran out without a payment (the fulfilment cron). */
export async function releaseExpiredReservations(now = new Date()): Promise<number> {
  const result = await EsimNumber.updateMany(
    { status: "reserved", "reservation.until": { $lt: now }, customer: null },
    { $set: { status: "available", reservation: null } },
  );
  return result.modifiedCount;
}
