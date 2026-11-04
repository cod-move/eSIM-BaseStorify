import { rechargeProblem } from "@/lib/esim/numbers/line";

/** A number top-up line's option (NUM-08/09), the part with no database: shape and checks. Pure. */

export interface NumberTopupChoice {
  number: string;
  recharge?: number;
  packet?: string;
}

export interface NumberTopupSnapshot extends NumberTopupChoice {
  msisdn: string;
  kind: "recharge" | "packet";
  amountMinor: number;
  currency: string;
  packetId?: string;
  packetName?: string;
  priceMinor: number;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** The request's `numberTopup` option, checked for shape; throws a message for the shopper. */
export function parseNumberTopupChoice(value: unknown): NumberTopupChoice {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose the number to top up");
  const input = value as Record<string, unknown>;
  if (typeof input.number !== "string" || !OBJECT_ID.test(input.number)) throw new Error("Choose the number to top up");
  const recharge = input.recharge === undefined || input.recharge === null ? undefined : input.recharge;
  const packet = input.packet === undefined || input.packet === null || input.packet === "" ? undefined : input.packet;
  if ((recharge === undefined) === (packet === undefined)) throw new Error("Choose either credit or a data package");
  if (recharge !== undefined) {
    if (typeof recharge !== "number" || recharge === 0) throw new Error("Choose a whole amount to put on the number");
    const problem = rechargeProblem(recharge);
    if (problem) throw new Error(problem);
    return { number: input.number, recharge };
  }
  if (typeof packet !== "string" || !OBJECT_ID.test(packet)) throw new Error("Unknown data package");
  return { number: input.number, packet };
}
