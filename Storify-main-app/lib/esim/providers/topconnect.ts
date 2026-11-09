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
/** One text message. */
export const SMS_MAX_CHARS = 160;
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

/** A service on the card that can be switched on and off. */
export type TopConnectService = "data" | "sms" | "voice";

export interface TopConnectVoicemail {
  active: boolean;
  email: string | null;
}

export interface TopConnectVoicemailMessage {
  at: string | null;
  /** Who called; null when hidden. */
  from: string | null;
  /** The gateway's download link for the recording. */
  link: string;
}

/** A call or text message from `gccdr`. */
export interface TopConnectCallRecord {
  kind: "call" | "sms";
  at: string | null;
  /** Calls: "in" or "out"; texts: the number's own on the sending side is "out". */
  direction: "in" | "out" | null;
  from: string | null;
  to: string | null;
  /** Billed seconds (calls). */
  seconds: number | null;
  /** "sms", "ussd" (texts). */
  smsType: string | null;
  /** Where the call went or came from, as the gateway names it ("Russia Mobile"). */
  destination: string | null;
  costMinor: number | null;
  currency: string | null;
}

/** A data session from `gprscdr`. */
export interface TopConnectDataRecord {
  at: string | null;
  endedAt: string | null;
  country: string | null;
  operator: string | null;
  bytes: number | null;
  costMinor: number | null;
  currency: string | null;
}

/** Money put on the card, from `rechargereport`; dealer-side rows are left out. */
export interface TopConnectRecharge {
  at: string | null;
  kind: "voucher" | "transfer" | "automatic" | "web";
  amountMinor: number | null;
  currency: string | null;
}

/** The latest record of one kind of activity (`get_last_activity`). */
export interface TopConnectActivity {
  /** The gateway's own name: "outbound_call", "inbound_call", "data", "sms_outbound", "sms_inbound_nonclassic", … */
  type: string;
  at: string | null;
  /** The other party (calls, texts). */
  party: string | null;
  seconds: number | null;
  bytes: number | null;
  country: string | null;
  operator: string | null;
  costMinor: number | null;
  currency: string | null;
}

/** A daily data spending limit (`gprslimit`), in cents of the card's currency. */
export interface TopConnectDataLimit {
  valueMinor: number | null;
  usedMinor: number | null;
  period: string | null;
  /** The current 24-hour period: it starts when the limit was set, not at midnight. */
  periodStart: string | null;
  periodEnd: string | null;
}

/** The latest network registration of one kind (`get_lu`). */
export interface TopConnectLocationUpdate {
  /** "voice_lu", "voice_lu_first", "gprs_lu", "gprs_lu_first". */
  type: string;
  at: string | null;
  mcc: string | null;
  mnc: string | null;
  vlr: string | null;
  /** U registration updated, I registered in a new country, G data attached, P data session up. */
  luType: string | null;
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

  /**
   * Data packages this card can take. TopConnect lists those of the network
   * the card is on; a card on no network (stock not in use) needs the
   * network named: `mccmnc` (e.g. "24801") or the SGSN IP.
   */
  async dataPackages(msisdn: string, network: { mccmnc?: string; sgsnip?: string } = {}): Promise<TopConnectDataPackage[]> {
    if (network.mccmnc !== undefined && !/^\d{5,6}$/.test(network.mccmnc)) throw new ProviderError("rejected", "mccmnc must be 5 or 6 digits", null, "topconnect");
    const xml = await this.call("getdiscount", {
      onum: digitsOnly(msisdn, "msisdn"),
      mccmnc: network.mccmnc,
      sgsnip: network.sgsnip ? identifier(network.sgsnip, "sgsnip") : undefined,
    });
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

  /**
   * Sends a text message to a card. `sms2` shows any sender number the
   * caller names (the live store's "send SMS to myself"); `sms` sends from
   * the gateway's own. At most 160 characters.
   */
  async sendSms(input: { from: string; to: string; message: string; command?: "sms" | "sms2" }): Promise<void> {
    const message = input.message.trim();
    if (!message) throw new ProviderError("rejected", "The message is empty", null, "topconnect");
    if ([...message].length > SMS_MAX_CHARS) throw new ProviderError("rejected", `The message is over ${SMS_MAX_CHARS} characters`, null, "topconnect");
    const from = input.from.replace(/[\s()+-]/g, "");
    if (!/^\d{3,15}$/.test(from)) throw new ProviderError("rejected", "The sender must be 3 to 15 digits", null, "topconnect");
    await this.call(input.command ?? "sms2", { anum: from, bnum: digitsOnly(input.to, "bnum"), msg: message });
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

  // ── services on the card (manual 3.10, 3.13, 4.2, 4.5, 4.6) ─────────────

  /** Whether data, texts or calls are on (`gprsauth block=c`, `srvsms`/`srvvoice active=status`). */
  async serviceStatus(msisdn: string, service: TopConnectService): Promise<boolean> {
    const onum = digitsOnly(msisdn, "msisdn");
    if (service === "data") return gprsState(await this.call("gprsauth", { onum, block: "c" }));
    return switchState(await this.call(service === "sms" ? "srvsms" : "srvvoice", { onum, active: "status" }));
  }

  /** Switches data, texts or calls on or off; answers the state the gateway reports. */
  async setService(msisdn: string, service: TopConnectService, on: boolean): Promise<boolean> {
    const onum = digitsOnly(msisdn, "msisdn");
    if (service === "data") {
      const xml = await this.call("gprsauth", { onum, block: on ? "f" : "t" });
      // The answer carries "OK", and usually the new state.
      if (/<GPRS>/i.test(xml)) return gprsState(xml);
      if (!/^ok$/i.test(tag(xml, "text") ?? "")) throw new ProviderError("invalid_response", "TopConnect did not confirm the data setting", 200, "topconnect");
      return on;
    }
    const state = switchState(await this.call(service === "sms" ? "srvsms" : "srvvoice", { onum, active: on ? "on" : "off" }));
    if (state !== on) throw new ProviderError("invalid_response", "TopConnect did not confirm the change", 200, "topconnect");
    return state;
  }

  async voicemail(msisdn: string): Promise<TopConnectVoicemail> {
    return parseVoicemail(await this.call("svmail", { onum: digitsOnly(msisdn, "msisdn") }));
  }

  async setVoicemail(msisdn: string, on: boolean): Promise<TopConnectVoicemail> {
    const result = parseVoicemail(await this.call("svmail", { onum: digitsOnly(msisdn, "msisdn"), activate: on ? "yes" : "no" }));
    if (result.active !== on) throw new ProviderError("invalid_response", "TopConnect did not confirm the voicemail setting", 200, "topconnect");
    return result;
  }

  /** Recorded messages between two days (YYYY-MM-DD), newest first. */
  async voicemailMessages(msisdn: string, from: string, to: string): Promise<TopConnectVoicemailMessage[]> {
    const xml = await this.call("svmail", { onum: digitsOnly(msisdn, "msisdn"), mode: "gmessages", started: day(from), finished: day(to) });
    return nodes(xml, "message")
      .flatMap((node) => {
        const link = tag(node, "link");
        return link ? [{ at: timestamp(tag(node, "messagedate")), from: tag(node, "anum"), link }] : [];
      })
      .sort(newestFirst);
  }

  /** The number calls are forwarded to; null when they are not. */
  async redirect(msisdn: string): Promise<string | null> {
    try {
      return tag(await this.call("redirect", { onum: digitsOnly(msisdn, "msisdn") }), "redirect");
    } catch (error) {
      if (error instanceof ProviderError && /not activated|not present/i.test(error.message)) return null;
      throw error;
    }
  }

  /**
   * Forwards every call to `target` (digits with the country code), or stops
   * forwarding with null. The gateway will not replace a forward in place, so
   * a different one is removed first.
   */
  async setRedirect(msisdn: string, target: string | null): Promise<string | null> {
    const onum = digitsOnly(msisdn, "msisdn");
    const wanted = target === null ? null : digitsOnly(target, "redirect");
    const current = await this.redirect(onum);
    if (current === wanted) return current;
    if (current !== null) {
      try {
        await this.call("redirect", { onum, redirect: "" });
      } catch (error) {
        if (!(error instanceof ProviderError && /not present/i.test(error.message))) throw error;
      }
    }
    if (wanted === null) return null;
    const set = tag(await this.call("redirect", { onum, redirect: wanted }), "redirect");
    if (set !== wanted) throw new ProviderError("invalid_response", "TopConnect did not confirm the forwarding number", 200, "topconnect");
    return set;
  }

  // ── history (manual 3.1, 3.18, 4.2) ──────────────────────────────────────

  /** Calls and text messages between two days (YYYY-MM-DD), newest first. */
  async callRecords(msisdn: string, from: string, to: string): Promise<TopConnectCallRecord[]> {
    const onum = digitsOnly(msisdn, "msisdn");
    const xml = await this.call("gccdr", { onum, started: day(from), finished: day(to) });
    const calls = nodes(xml, "call").map((node): TopConnectCallRecord => {
      const direction = (tag(node, "cdir") ?? "").toUpperCase();
      return {
        kind: "call",
        at: timestamp(tag(node, "calldate")),
        direction: direction === "I" ? "in" : direction === "O" ? "out" : null,
        from: tag(node, "anum"),
        to: tag(node, "bnum"),
        seconds: integer(tag(node, "billsec")) ?? integer(tag(node, "duration")),
        smsType: null,
        destination: decodeUrl(direction === "I" ? tag(node, "adest") : tag(node, "bdest")),
        costMinor: money(tag(node, "ccost")),
        currency: tag(node, "curr"),
      };
    });
    const texts = nodes(xml, "sms").map((node): TopConnectCallRecord => {
      const sender = tag(node, "anum");
      return {
        kind: "sms",
        at: timestamp(tag(node, "calldate")),
        direction: sender === null ? null : sender.replace(/\D/g, "") === onum ? "out" : "in",
        from: sender,
        to: tag(node, "bnum"),
        seconds: null,
        smsType: tag(node, "smst"),
        destination: null,
        costMinor: money(tag(node, "ccost")),
        currency: tag(node, "curr"),
      };
    });
    return [...calls, ...texts].sort(newestFirst);
  }

  /** Data sessions between two days (YYYY-MM-DD), newest first. */
  async dataRecords(msisdn: string, from: string, to: string): Promise<TopConnectDataRecord[]> {
    const xml = await this.call("gprscdr", { onum: digitsOnly(msisdn, "msisdn"), started: day(from), finished: day(to), extended: "yes" });
    return nodes(xml, "call")
      .map((node): TopConnectDataRecord => {
        const counted = integer(tag(node, "usage_b"));
        const inBytes = integer(tag(node, "inb"));
        const outBytes = integer(tag(node, "outb"));
        return {
          at: timestamp(tag(node, "calldate")),
          endedAt: timestamp(tag(node, "end_session")),
          country: tag(node, "country"),
          operator: tag(node, "operator"),
          bytes: counted ?? (inBytes === null && outBytes === null ? null : (inBytes ?? 0) + (outBytes ?? 0)),
          costMinor: money(tag(node, "cost")),
          currency: tag(node, "curr"),
        };
      })
      .sort(newestFirst);
  }

  /**
   * Money put on the card between two days (YYYY-MM-DD), newest first:
   * vouchers, transfers (the card's side only: the dealer's side and its
   * login, address and voucher PINs never leave here), automatic and web
   * top-ups.
   */
  async recharges(msisdn: string, from: string, to: string): Promise<TopConnectRecharge[]> {
    const xml = await this.call("rechargereport", { onum: digitsOnly(msisdn, "msisdn"), started: day(from), finished: day(to) });
    const sections: Array<[string, TopConnectRecharge["kind"]]> = [
      ["pin recharge", "voucher"],
      ["money transfer", "transfer"],
      ["automatic transfer", "automatic"],
      ["web recharge", "web"],
    ];
    return sections
      .flatMap(([name, kind]) =>
        nodes(section(xml, name), "record").flatMap((node): TopConnectRecharge[] => {
          const side = tag(node, "type");
          if (kind === "transfer" && side !== "card") return [];
          const amount = tag(node, "amount");
          return [{
            at: timestamp(tag(node, "used") ?? tag(node, "added")),
            kind,
            amountMinor: money(amount),
            currency: tag(node, "currency") ?? currencyOf(amount),
          }];
        }),
      )
      .sort(newestFirst);
  }

  // ── spending limit on data, and vouchers (manual 4.4, 3.5) ───────────────

  /** The daily data spending limit now; null when there is none. */
  async dataLimit(msisdn: string): Promise<TopConnectDataLimit | null> {
    try {
      return parseDataLimit(await this.call("gprslimit", { onum: digitsOnly(msisdn, "msisdn"), option: "status" }));
    } catch (error) {
      if (error instanceof ProviderError && /not active|not defined|deactivated/i.test(error.message)) return null;
      throw error;
    }
  }

  /**
   * Sets a repeating daily data spending limit, in cents of the card's
   * currency (a new one, or a new value for the one running), or removes it
   * with null.
   */
  async setDataLimit(msisdn: string, valueMinor: number | null): Promise<TopConnectDataLimit | null> {
    const onum = digitsOnly(msisdn, "msisdn");
    const current = await this.dataLimit(onum);
    if (valueMinor === null) {
      if (!current) return null;
      try {
        await this.call("gprslimit", { onum, option: "deactive" });
      } catch (error) {
        if (!(error instanceof ProviderError && /deactivated|not defined/i.test(error.message))) throw error;
      }
      return null;
    }
    if (!Number.isSafeInteger(valueMinor) || valueMinor < 1) throw new ProviderError("rejected", "The limit must be a positive amount", null, "topconnect");
    const value = formatMinor(valueMinor);
    const xml = current
      ? await this.call("gprslimit", { onum, option: "update", value })
      : await this.call("gprslimit", { onum, option: "active", period: "day", value, count: "0" });
    return parseDataLimit(xml);
  }

  /** Puts a TopConnect recharge voucher (its PIN) on the card. */
  async redeemVoucher(msisdn: string, pin: string): Promise<void> {
    const code = pin.replace(/[\s-]/g, "");
    if (!/^\d{6,32}$/.test(code)) throw new ProviderError("rejected", "Please provide valid PIN to recharge", null, "topconnect");
    await this.call("recharge", { onum: digitsOnly(msisdn, "msisdn"), pin: code });
  }

  // ── troubleshooting (manual 6.1) ─────────────────────────────────────────

  /** The latest of each kind of activity: calls, texts, data, recharge, location update. */
  async lastActivity(msisdn: string): Promise<TopConnectActivity[]> {
    const xml = await this.call("get_last_activity", { onum: digitsOnly(msisdn, "msisdn") });
    const body = nodes(xml, "get_last_activity")[0] ?? xml;
    return children(body)
      .map(([type, node]): TopConnectActivity => {
        const counted = integer(tag(node, "usage_b"));
        const inBytes = integer(tag(node, "inb"));
        const outBytes = integer(tag(node, "outb"));
        const outgoing = /outbound|^ussd/i.test(type);
        return {
          type: type.toLowerCase(),
          at: timestamp(tag(node, "calldate") ?? tag(node, "date_time") ?? tag(node, "added")),
          party: outgoing ? tag(node, "bnum") : tag(node, "anum"),
          seconds: integer(tag(node, "billsec")) ?? integer(tag(node, "duration")),
          bytes: counted ?? (inBytes === null && outBytes === null ? null : (inBytes ?? 0) + (outBytes ?? 0)),
          country: tag(node, "country"),
          operator: tag(node, "operator"),
          costMinor: money(tag(node, "ccost") ?? tag(node, "cost")),
          currency: tag(node, "curr"),
        };
      })
      .sort(newestFirst);
  }

  /** The latest network registration of each kind. */
  async locationUpdates(msisdn: string): Promise<TopConnectLocationUpdate[]> {
    const xml = await this.call("get_lu", { onum: digitsOnly(msisdn, "msisdn") });
    const body = nodes(xml, "get_lu")[0] ?? xml;
    return children(body)
      .map(([type, node]) => ({
        type: type.toLowerCase(),
        at: timestamp(tag(node, "date_time")),
        mcc: tag(node, "MCC"),
        mnc: tag(node, "MNC"),
        vlr: tag(node, "vlr"),
        luType: tag(node, "lu_type"),
      }))
      .sort(newestFirst);
  }

  /** The data session open right now, if any. */
  async dataSession(msisdn: string): Promise<{ startedAt: string | null; mccmnc: string | null } | null> {
    const xml = await this.call("checkdatasession", { onum: digitsOnly(msisdn, "msisdn") });
    const session = nodes(xml, "session")[0];
    return session === undefined ? null : { startedAt: timestamp(tag(session, "starttime")), mccmnc: tag(session, "mccmnc") };
  }

  /**
   * Restarts the SIM's software so it registers on the network again
   * (`makerequest scenarioid=1`). Some SIM versions are not allowed it
   * (error 2).
   */
  async reconnect(msisdn: string): Promise<void> {
    const xml = await this.call("makerequest", { onum: digitsOnly(msisdn, "msisdn"), scenarioid: "1" });
    const code = integer(tag(xml, "error_code"));
    if (code !== 0 || !/success/i.test(tag(xml, "result") ?? "")) {
      const message = tag(xml, "error_text") ?? "TopConnect did not reconnect the SIM";
      throw new ProviderError(code === 1 ? "not_found" : "rejected", code === 2 ? "This SIM cannot be reconnected from here" : message, 200, "topconnect");
    }
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
    return tag(xml, "text") ?? tag(xml, "msg") ?? tag(xml, "error") ?? "TopConnect answered with an error";
  }
  return null;
}

/** `<GPRS>enabled|disabled</GPRS>`. */
function gprsState(xml: string): boolean {
  const state = (tag(xml, "GPRS") ?? "").toLowerCase();
  if (state !== "enabled" && state !== "disabled") throw new ProviderError("invalid_response", "TopConnect did not say whether data is on", 200, "topconnect");
  return state === "enabled";
}

/** `srvsms`/`srvvoice`: `<status>on|off`, closed by `</status>` or, as the manual shows it, `</service>`. */
function switchState(xml: string): boolean {
  const state = /<status>\s*(on|off)\s*</i.exec(xml)?.[1]?.toLowerCase();
  if (!state || !/<result>\s*ok\s*<\/result>/i.test(xml)) throw new ProviderError("invalid_response", "TopConnect did not say whether the service is on", 200, "topconnect");
  return state === "on";
}

function parseVoicemail(xml: string): TopConnectVoicemail {
  const active = bool(tag(xml, "activated"));
  if (active === null) throw new ProviderError("invalid_response", "TopConnect did not say whether voicemail is on", 200, "topconnect");
  return { active, email: tag(xml, "email") };
}

/** The part of `rechargereport` under `<name>`; its section names have spaces, so they are not XML elements. */
function section(xml: string, name: string): string {
  const open = xml.toLowerCase().indexOf(`<${name}>`);
  if (open === -1) return "";
  const close = xml.toLowerCase().indexOf(`</${name}>`, open);
  return xml.slice(open + name.length + 2, close === -1 ? undefined : close);
}

function parseDataLimit(xml: string): TopConnectDataLimit {
  if (!/^success$/i.test(tag(xml, "result") ?? "")) throw new ProviderError("invalid_response", "TopConnect did not confirm the data limit", 200, "topconnect");
  // "2013-07-04 14:34:56.917": the fraction is dropped.
  const time = (value: string | null) => timestamp(value ? value.replace(/\.\d+$/, "") : null);
  return {
    valueMinor: money(tag(xml, "value")),
    usedMinor: money(tag(xml, "usedvalue")),
    period: tag(xml, "period"),
    periodStart: time(tag(xml, "active")),
    periodEnd: time(tag(xml, "expire")),
  };
}

/** The top-level elements of `body`, as [name, inner XML]; the gateway uses no attributes here. */
function children(body: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const pattern = /<([A-Za-z_][\w]*)>([\s\S]*?)<\/\1\s*>/g;
  for (const match of body.matchAll(pattern)) result.push([match[1], match[2]]);
  return result;
}

/** "+10.00 USD" → "USD". */
function currencyOf(amount: string | null): string | null {
  return amount ? (/\b([A-Z]{3})\s*$/.exec(amount.trim())?.[1] ?? null) : null;
}

/** Destinations come URL-encoded ("Extra%20Number"). */
function decodeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const newestFirst = (a: { at: string | null }, b: { at: string | null }) => (b.at ?? "").localeCompare(a.at ?? "");

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
