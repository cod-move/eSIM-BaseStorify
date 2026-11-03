import type { FetchLike } from "./http";
import {
  ProviderError,
  type CancelResult,
  type EsimProviderAdapter,
  type JsonObject,
  type ProviderEsim,
  type ProviderPlan,
  type ProviderTopupPlan,
  type ProviderUsage,
  type PurchaseResult,
  type TopupResult,
} from "./types";

/**
 * TopConnect (TravelSim) XML gateway, for number cards (NUM-01..09).
 *
 * Unlike the eSIM suppliers nothing is bought here: the cards are bought in
 * advance and imported as stock, and the gateway only reads and changes a
 * card already ours — its state (`card_stat`), its balance (`sbalance`), its
 * data packages (`getdiscount`, `discountm`, `discount`). Pure TS, no
 * database; amounts cross this boundary in minor units.
 *
 * The gateway answers only to the IP addresses registered with TopConnect
 * support (at most five), and has no test environment: development uses the
 * fake gateway (`topconnect-fake.ts`).
 *
 * `sbalance` takes an `orderid` that must be exactly the account's last one
 * plus one. A wrong one is refused with the expected value
 * (`TopConnectOrderIdError`), which also tells a caller whose earlier call
 * timed out whether it went through: the expected value moved past it.
 */

export const TOPCONNECT_DEFAULT_BASE_URL = "https://xml2.travelsim.com/tsim_xml/service/xmlgate";

const TIMEOUT_MS = 35_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export interface TopConnectOptions {
  username: string;
  password: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface TopConnectCard {
  cardId: string | null;
  serviceId: string | null;
  iccid: string | null;
  /** The number calls reach (iNum); `msisdn` is the SIM's own (oNum). */
  inum: string | null;
  msisdn: string | null;
  prepaid: boolean | null;
  blocked: boolean | null;
  balanceMinor: number | null;
  currency: string | null;
  createdAt: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
}

export type TopConnectPackageKind = "gprs" | "voice" | "sms" | "turbo";

export interface TopConnectActivePackage {
  kind: TopConnectPackageKind;
  /** The packet code, when the answer carries one (`detailed=true`). */
  packetId: string | null;
  name: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  costMinor: number | null;
  currency: string | null;
  totalBytes: number | null;
  leftBytes: number | null;
  /** active / blocked (multi-packages), on / off, or ordered when it starts with the next data session. */
  status: string | null;
}

export interface TopConnectDataPackage {
  code: string;
  name: string;
  volumeBytes: number | null;
  durationDays: number | null;
  priceMinor: number | null;
  currency: string | null;
}

export interface TopConnectTransfer {
  orderId: number;
  cardBalanceMinor: number | null;
  accountBalanceMinor: number | null;
}

export interface TopConnectTransferRecord {
  at: string | null;
  orderId: number | null;
  side: "card" | "client" | null;
  amountMinor: number | null;
}

/** `sbalance` refused the order id; `expected` is the one it wants. */
export class TopConnectOrderIdError extends ProviderError {
  constructor(readonly expected: number, message: string) {
    super("rejected", message, 200, "topconnect");
    this.name = "TopConnectOrderIdError";
  }
}

export class TopConnectClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(private readonly options: TopConnectOptions) {
    this.baseUrl = options.baseUrl?.trim() || TOPCONNECT_DEFAULT_BASE_URL;
    this.fetcher = options.fetch ?? fetch;
  }

  /** The commands this login may use: proves the credentials and the registered IP. */
  async permissions(): Promise<string[]> {
    const xml = await this.call("getpermissions", {});
    return nodes(xml, "command").map((node) => text(node)).filter((value): value is string => Boolean(value));
  }

  /** The dealer account: its balance and the last `sbalance` order id. */
  async account(): Promise<{ name: string | null; balanceMinor: number | null; currency: string | null; lastOrderId: number }> {
    const xml = await this.call("account", {});
    const lastOrderId = integer(tag(xml, "orderid"));
    if (lastOrderId === null || lastOrderId < 0) {
      throw new ProviderError("invalid_response", "TopConnect account answer has no order id", 200, "topconnect");
    }
    return {
      name: tag(xml, "name"),
      balanceMinor: money(tag(xml, "balance")),
      currency: tag(xml, "currency"),
      lastOrderId,
    };
  }

  /** A card's state and its packages. Either number identifies it; both must agree. */
  async cardStatus(ref: { msisdn?: string; iccid?: string }): Promise<{ card: TopConnectCard; packages: TopConnectActivePackage[] }> {
    if (!ref.msisdn && !ref.iccid) throw new ProviderError("rejected", "An MSISDN or ICCID is needed", null, "topconnect");
    const xml = await this.call("card_stat", {
      msisdn: ref.msisdn ? digitsOnly(ref.msisdn, "msisdn") : undefined,
      iccid: ref.iccid ? digitsOnly(ref.iccid, "iccid") : undefined,
    });
    const code = integer(tag(xml, "error_code"));
    if (code !== null && code !== 0) {
      const message = tag(xml, "error_text") ?? `card_stat error ${code}`;
      throw new ProviderError(code === 1 || code === 2 ? "not_found" : "rejected", message, 200, "topconnect");
    }
    const cardNode = nodes(xml, "card")[0];
    if (cardNode === undefined) throw new ProviderError("not_found", "TopConnect returned no card", 200, "topconnect");
    return { card: parseCard(cardNode), packages: parsePackages(xml) };
  }

  /** Data packages this card can take now. */
  async dataPackages(msisdn: string): Promise<TopConnectDataPackage[]> {
    const xml = await this.call("getdiscount", { onum: digitsOnly(msisdn, "msisdn") });
    return nodes(xml, "datapacket").flatMap((node) => {
      const code = tag(node, "packetcode");
      if (!code) return [];
      return [{
        code,
        name: tag(node, "packetname") ?? code,
        volumeBytes: integer(tag(node, "volume")),
        durationDays: integer(tag(node, "duration")),
        priceMinor: money(tag(node, "price")),
        currency: tag(node, "currency"),
      }];
    });
  }

  /** The packages on the card now, with their packet codes. */
  async activePackages(msisdn: string): Promise<TopConnectActivePackage[]> {
    const xml = await this.call("discount", { onum: digitsOnly(msisdn, "msisdn"), detailed: "true" });
    return parsePackages(xml);
  }

  /**
   * Orders a data package, paid from the card's balance. `discountm` will not
   * order a package already running ("… Packet already activated"), so a
   * repeated call cannot buy it twice.
   */
  async activateDataPackage(msisdn: string, packetId: string): Promise<void> {
    await this.call("discountm", {
      onum: digitsOnly(msisdn, "msisdn"),
      activate: "yes",
      packettype: "dailygprs",
      packetid: identifier(packetId, "packetid"),
    });
  }

  /**
   * Cancels one data package, as the live store does (`activate=no` with its
   * code; the manual's `activate=close` would end every data package on the
   * card). Unused data is not refunded.
   */
  async cancelDataPackage(msisdn: string, packetId: string): Promise<void> {
    await this.call("discount", {
      onum: digitsOnly(msisdn, "msisdn"),
      activate: "no",
      packettype: "dailygprs",
      packetid: identifier(packetId, "packetid"),
    });
  }

  /**
   * Moves money from the dealer account onto the card, or back with a
   * negative amount. `orderId` must be the account's last one plus one.
   */
  async transfer(input: { msisdn: string; amountMinor: number; currency: string; orderId: number }): Promise<TopConnectTransfer> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) {
      throw new ProviderError("rejected", "Transfer amount must be a non-zero number of cents", null, "topconnect");
    }
    if (!Number.isSafeInteger(input.orderId) || input.orderId < 1) {
      throw new ProviderError("rejected", "Order id must be a positive integer", null, "topconnect");
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ProviderError("rejected", "Currency must be an ISO code", null, "topconnect");
    const xml = await this.call("sbalance", {
      onum: digitsOnly(input.msisdn, "msisdn"),
      amount: formatMinor(input.amountMinor),
      curr: currency,
      orderid: String(input.orderId),
    });
    return {
      orderId: integer(tag(xml, "orderid")) ?? input.orderId,
      cardBalanceMinor: money(tag(nodes(xml, "card")[0] ?? "", "balance")),
      accountBalanceMinor: money(tag(nodes(xml, "client")[0] ?? "", "balance")),
    };
  }

  /** The card's `sbalance` records between two days (YYYY-MM-DD), for checking a transfer whose answer was lost. */
  async transferLog(msisdn: string, from: string, to: string): Promise<TopConnectTransferRecord[]> {
    const xml = await this.call("sbalance", { onum: digitsOnly(msisdn, "msisdn"), started: day(from), finished: day(to) });
    return nodes(xml, "record").map((node) => {
      const side = tag(node, "type");
      return {
        at: timestamp(tag(node, "added")),
        orderId: integer(tag(node, "orderid")),
        side: side === "card" || side === "client" ? side : null,
        amountMinor: money(tag(node, "amount")),
      };
    });
  }

  /** One gateway call; returns the XML when it is not an error answer. */
  async call(command: string, params: Record<string, string | undefined>): Promise<string> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("uname", this.options.username);
    url.searchParams.set("upass", this.options.password);
    url.searchParams.set("plain", "1");
    url.searchParams.set("command", command);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        method: "GET",
        headers: { Accept: "application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError("uncertain", `TopConnect ${command} did not complete`, null, "topconnect");
    }
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ProviderError("uncertain", `TopConnect ${command} answer was cut off`, response.status, "topconnect");
    }
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new ProviderError("invalid_response", "TopConnect answer is too large", response.status, "topconnect");
    }
    if (!response.ok) {
      // A server error may come after the gateway acted.
      const code = response.status >= 500 ? "uncertain" : "rejected";
      throw new ProviderError(code, `TopConnect ${command} answered HTTP ${response.status}`, response.status, "topconnect");
    }
    if (!body.trim().startsWith("<")) {
      throw new ProviderError("invalid_response", `TopConnect ${command} answer is not XML`, response.status, "topconnect");
    }
    const error = errorText(body);
    if (error !== null) {
      const expected = /Incorrect OrderID value, must be:\s*(\d+)/i.exec(error);
      if (expected) throw new TopConnectOrderIdError(Number(expected[1]), error);
      throw new ProviderError(/not found/i.test(error) ? "not_found" : "rejected", error, response.status, "topconnect");
    }
    return body;
  }
}

/**
 * TopConnect on the supplier list: its credentials and connection test live
 * on the Suppliers page like any supplier's, but it sells no eSIM plans, so
 * the catalogue is empty and every eSIM call is unsupported. Number cards use
 * `client` directly (lib/esim/numbers).
 */
export class TopConnectAdapter implements EsimProviderAdapter {
  readonly code = "topconnect";
  readonly displayName = "TopConnect";
  readonly capabilities = { listPlans: false, purchase: false, usage: false, topup: false, cancel: false, planLookup: false } as const;

  constructor(readonly client: TopConnectClient) {}

  probe() {
    return probeTopConnect(this.client);
  }

  async *listPlans(): AsyncIterable<ProviderPlan> {}

  async getPlan(): Promise<ProviderPlan | null> {
    return null;
  }

  private unsupported(): never {
    throw new ProviderError("unsupported", "TopConnect sells number cards, not eSIM plans", null, "topconnect");
  }

  async purchase(): Promise<PurchaseResult> {
    return this.unsupported();
  }

  async queryPurchase(): Promise<PurchaseResult> {
    return this.unsupported();
  }

  async getEsim(): Promise<ProviderEsim> {
    return this.unsupported();
  }

  async getUsage(): Promise<ProviderUsage> {
    return this.unsupported();
  }

  async listTopupPlans(): Promise<ProviderTopupPlan[]> {
    return [];
  }

  async topup(): Promise<TopupResult> {
    return this.unsupported();
  }

  async cancel(): Promise<CancelResult> {
    return this.unsupported();
  }
}

/** For the supplier page's connection test. */
export async function probeTopConnect(client: TopConnectClient): Promise<{ message: string; metadata: JsonObject }> {
  const account = await client.account();
  const balance = account.balanceMinor === null ? "unknown" : `${formatMinor(account.balanceMinor)} ${account.currency ?? ""}`.trim();
  return {
    message: `Connected to TopConnect${account.name ? ` (${account.name})` : ""}: balance ${balance}, last order id ${account.lastOrderId}`,
    metadata: { balanceMinor: account.balanceMinor, currency: account.currency, lastOrderId: account.lastOrderId },
  };
}

function parseCard(node: string): TopConnectCard {
  return {
    cardId: tag(node, "tsimid"),
    serviceId: tag(node, "aserviceid"),
    iccid: tag(node, "iccid"),
    inum: tag(node, "inum"),
    msisdn: tag(node, "onum"),
    prepaid: bool(tag(node, "prepaid") ?? tag(node, "prepayed")),
    blocked: bool(tag(node, "blocked")),
    balanceMinor: money(tag(node, "balance")),
    currency: tag(node, "curr"),
    createdAt: timestamp(tag(node, "create_date")),
    firstUsedAt: timestamp(tag(node, "FUsage_date")),
    lastUsedAt: timestamp(tag(node, "LUsage_date")),
  };
}

const PACKAGE_KINDS: readonly TopConnectPackageKind[] = ["gprs", "voice", "sms", "turbo"];

/** Packages under `<discount>` (card_stat, discount, discountm); a gprs block may wrap several `<packet>`s. */
function parsePackages(xml: string): TopConnectActivePackage[] {
  const scopes = [...nodes(xml, "discount"), ...nodes(xml, "discountm")];
  const source = scopes.length ? scopes.join("\n") : xml;
  return PACKAGE_KINDS.flatMap((kind) =>
    nodes(source, kind).flatMap((node) => {
      const packets = nodes(node, "packet");
      return (packets.length ? packets : [node]).map((packet) => parsePackage(packet, kind));
    }),
  ).filter((entry) => entry.name || entry.activatedAt || entry.expiresAt || entry.totalBytes !== null);
}

function parsePackage(node: string, kind: TopConnectPackageKind): TopConnectActivePackage {
  const activatedAt = timestamp(tag(node, "activation_date"));
  const pendingText = tag(node, "text");
  return {
    kind,
    packetId: tag(node, "package_code") ?? tag(node, "packetid") ?? tag(node, "packet_id") ?? tag(node, "packetcode"),
    name: tag(node, "type") ?? tag(node, "name"),
    activatedAt,
    expiresAt: timestamp(tag(node, "expire_date")),
    costMinor: money(tag(node, "cost")),
    currency: tag(node, "currency"),
    totalBytes: integer(tag(node, "amount")) ?? integer(tag(node, "init_volume")),
    leftBytes: integer(tag(node, "dataLeft")) ?? integer(tag(node, "left_volume")),
    status:
      tag(node, "multistatus") ??
      tag(node, "status") ??
      (!activatedAt && pendingText && /next data\s+session/i.test(pendingText) ? "ordered" : null),
  };
}

/** The gateway signals failure with `<type>ERROR</type>` and a `<text>`, sometimes `<error>`. */
function errorText(xml: string): string | null {
  if (/<type>\s*error\s*<\/type>/i.test(xml) || /<error(\s|>)/i.test(xml) || /<result>\s*error\s*<\/result>/i.test(xml)) {
    return tag(xml, "text") ?? tag(xml, "error") ?? "TopConnect answered with an error";
  }
  return null;
}

function nodes(xml: string, name: string): string[] {
  const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/\\s*${name}\\s*>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function text(node: string): string | null {
  const value = decode(node.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  return value || null;
}

function tag(xml: string, name: string): string | null {
  const node = nodes(xml, name)[0];
  return node === undefined ? null : text(node);
}

function decode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function integer(value: string | null): number | null {
  if (!value || !/^-?\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** "10022.21", "-10.00 USD" or "+10.00 USD" → cents; anything else → null. */
export function money(value: string | null): number | null {
  const match = value ? /^([+-]?)(\d+)(?:\.(\d{1,5}))?(?:\s+[A-Z]{3})?$/.exec(value.trim()) : null;
  if (!match) return null;
  const fraction = (match[3] ?? "").padEnd(5, "0");
  // Prices come with five decimals ("0.99000"); round half up to the cent.
  const cents = Number(match[2]) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  return match[1] === "-" ? -cents : cents;
}

/** Cents → "X.XX", the gateway's amount format. */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function bool(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["true", "yes", "on", "1"].includes(normalized)) return true;
  if (["false", "no", "off", "0"].includes(normalized)) return false;
  return null;
}

/** The gateway's times carry no zone; they are read as UTC. */
function timestamp(value: string | null): string | null {
  const match = value ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value.trim()) : null;
  return match ? `${match[1]}T${match[2]}Z` : null;
}

function digitsOnly(value: string, field: string): string {
  const cleaned = value.replace(/[\s()+-]/g, "");
  if (!/^\d{5,32}$/.test(cleaned)) throw new ProviderError("rejected", `${field} must be digits`, null, "topconnect");
  return cleaned;
}

function identifier(value: string, field: string): string {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,40}$/.test(cleaned)) throw new ProviderError("rejected", `${field} is not valid`, null, "topconnect");
  return cleaned;
}

function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ProviderError("rejected", "Dates must be YYYY-MM-DD", null, "topconnect");
  return value;
}
