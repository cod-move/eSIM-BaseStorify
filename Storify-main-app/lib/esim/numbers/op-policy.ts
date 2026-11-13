/**
 * What to do after each TopConnect answer while moving money onto a number
 * card or switching a package on (NUM-08/09). Pure.
 *
 * A transfer carries the account's next sequential order id. The id is kept
 * on the operation before it is sent, and a retry sends the same id, so:
 *
 * - "must be N" on the first send of an id: the store's counter was behind
 *   (another sender used the account). Nothing moved; send again with N.
 * - "must be N" on a resend, N past our id: our id was used. Either our
 *   earlier send went through (the answer was lost) or someone else took the
 *   id. The card's transfer log tells which; without it, a person decides.
 * - "must be N" on a resend, N not past our id: our id was never used; send N.
 * - No answer / a server error: unknown whether it moved. Wait and resend the
 *   same id, a few times, then a person decides.
 * - "Unable to retry completed order" (`taken`) on the first send of an id:
 *   another sender's completed order has it. Nothing moved; send again with
 *   a fresh id from the account.
 * - `taken` on a resend: our earlier send may be that order. The card's
 *   transfer log tells which; without it, a person decides.
 * - A refusal: nothing moved.
 */

export type TransferAnswer =
  | { kind: "ok" }
  | { kind: "clash"; expected: number }
  | { kind: "taken" }
  | { kind: "uncertain"; message: string }
  | { kind: "refused"; message: string };

export type TransferStep =
  | { do: "done"; last: number }
  | { do: "resend"; orderId: number }
  /** Send again with a fresh id, asked of the account. */
  | { do: "fresh_id" }
  | { do: "check_log" }
  | { do: "wait" }
  | { do: "refused"; message: string }
  | { do: "manual"; reason: string };

/** Unclear answers in a row before a person is asked. */
export const MAX_UNCERTAIN_TRANSFERS = 5;
/** Unclear answers to switching a package on before the money is moved back. */
export const MAX_UNCERTAIN_ACTIVATIONS = 3;

/**
 * @param sent the id just sent and how many times it had been sent before this answer
 * @param logged after `check_log`: whether the card's log shows our id for our amount (null: the log could not be read)
 */
export function afterTransfer(sent: { orderId: number; tries: number }, answer: TransferAnswer, logged?: boolean | null): TransferStep {
  switch (answer.kind) {
    case "ok":
      return { do: "done", last: sent.orderId };
    case "refused":
      return { do: "refused", message: answer.message };
    case "uncertain":
      return sent.tries + 1 >= MAX_UNCERTAIN_TRANSFERS
        ? { do: "manual", reason: `TopConnect did not confirm transfer ${sent.orderId} after ${sent.tries + 1} tries: ${answer.message}` }
        : { do: "wait" };
    case "clash": {
      if (sent.tries === 0 || answer.expected <= sent.orderId) return { do: "resend", orderId: answer.expected };
      if (logged === undefined) return { do: "check_log" };
      if (logged === true) return { do: "done", last: sent.orderId };
      if (logged === false) return { do: "resend", orderId: answer.expected };
      return { do: "manual", reason: `Order id ${sent.orderId} was used, and the card's transfer log could not be read to tell whether by this transfer` };
    }
    case "taken": {
      if (sent.tries === 0) return { do: "fresh_id" };
      if (logged === undefined) return { do: "check_log" };
      if (logged === true) return { do: "done", last: sent.orderId };
      if (logged === false) return { do: "fresh_id" };
      return { do: "manual", reason: `Order id ${sent.orderId} belongs to a completed order, and the card's transfer log could not be read to tell whether it is this transfer` };
    }
  }
}

export type ActivationAnswer = { kind: "ok" } | { kind: "uncertain"; listed: boolean } | { kind: "refused"; message: string };

/** After asking TopConnect to switch a package on; `listed`: the card's packages show it now. */
export function afterActivation(tries: number, answer: ActivationAnswer): { do: "done" } | { do: "wait" } | { do: "roll_back"; reason: string } {
  if (answer.kind === "ok") return { do: "done" };
  if (answer.kind === "refused") return { do: "roll_back", reason: answer.message };
  if (answer.listed) return { do: "done" };
  return tries + 1 >= MAX_UNCERTAIN_ACTIVATIONS
    ? { do: "roll_back", reason: "TopConnect did not confirm the package, and the card does not show it" }
    : { do: "wait" };
}

/** One leg of a card-to-card credit move: take off the source, put on the target, or put back on the source. */
export type CardTransferLeg = "debit" | "credit" | "refund";
export type LegResult = "done" | "wait" | "refused" | "manual";

/**
 * What a card-to-card move does after one leg's answer (NUM, "Transfer
 * balance"): a refused debit moved nothing; a refused credit puts the money
 * back; a refund that fails leaves the money on the dealer account, for a
 * person.
 */
export function afterCardTransferLeg(leg: CardTransferLeg, result: LegResult): "credit" | "refund" | "completed" | "failed" | "returned" | "wait" | "manual" {
  if (result === "wait") return "wait";
  if (result === "manual") return "manual";
  if (leg === "debit") return result === "done" ? "credit" : "failed";
  if (leg === "credit") return result === "done" ? "completed" : "refund";
  return result === "done" ? "returned" : "manual";
}

/** "12.5" or "12.50" in a card's currency → 1250 cents; null when it is not an amount. No floating point. */
export function parseCardAmount(value: string): number | null {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}
