import type { FetchLike } from "@/lib/esim/providers/http";

/**
 * The contract every extension-payment plugin implements (PAY, patch P15).
 *
 * Storify sees one gateway, "extension"; checkout lists each method on its
 * own row (lib/esim/payments/method-names.ts). A plugin only talks to its gateway and checks what the
 * gateway sends back — it never touches the database, orders or the ledger,
 * and never returns credentials. Amounts are in minor units (cents).
 */

export interface PayRequest {
  /** Ours, unique per try; the gateway's merchant order number. */
  reference: string;
  amountMinor: number;
  currency: string;
  /** What the shopper is paying for, as the gateway shows it. */
  subject: string;
  /** Where the shopper comes back to (the eSIM payment page). */
  returnUrl: string;
  /** Where the gateway posts its notification. */
  notifyUrl: string;
  email: string;
  name: string;
  /** Two letters, when the billing address has one. */
  country: string;
  clientIp: string;
  userAgent: string;
  locale: string;
  /** Shown to the gateway as the payer's id, when signed in. */
  payerId: string;
  /** The checkout's billing address, for gateways that ask for one. */
  billing: {
    firstName: string;
    lastName: string;
    phone: string;
    state: string;
    city: string;
    street: string;
    postalCode: string;
  };
}

/** What the shopper does next. */
export type PayStart =
  /** Go to the gateway's page. */
  | { kind: "redirect"; url: string; gatewayPaymentId?: string }
  /** Scan this (or open it in a wallet app); no page to go to. */
  | { kind: "qr"; data: string; gatewayPaymentId?: string };

export type PayState = "pending" | "paid" | "failed" | "expired";

/** A notification the plugin has verified (signature, merchant). */
export interface PayNotice {
  reference: string;
  state: PayState;
  gatewayPaymentId?: string;
  /** As the gateway reports them, for the service to compare. */
  amountMinor: number | null;
  currency: string | null;
}

export type Credentials = Record<string, string>;

/** The notification as it arrived, for gateways that sign the raw body (Stripe). */
export interface NoticeContext {
  raw: string;
  /** Lower-case header names. */
  headers: Record<string, string>;
  /** Milliseconds; the clock a signature's age is judged by. */
  now: number;
}

/** An authentic notification about nothing to act on (another kind of event): answered "accepted". */
export const IGNORED_NOTICE = "ignore" as const;

export interface PaymentPlugin {
  readonly code: string;
  readonly credentialKeys: readonly string[];
  readonly secretKeys: readonly string[];
  /** Settlement currencies the plugin can be asked to charge. */
  readonly currencies: readonly string[];
  start(request: PayRequest, credentials: Credentials, fetcher: FetchLike): Promise<PayStart>;
  /**
   * Reads a notification body (JSON or form fields). `null` when it is not
   * authentic or not one of ours — the caller answers with `rejected`;
   * `IGNORED_NOTICE` when it is authentic but about nothing to act on.
   */
  readNotice(body: Record<string, unknown>, credentials: Credentials, context?: NoticeContext): PayNotice | typeof IGNORED_NOTICE | null;
  /** The plain-text answers the gateway expects. */
  readonly acknowledge: { accepted: string; rejected: string };
}

export class PaymentPluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentPluginError";
  }
}
