import type { FetchLike } from "./http";
import { formatMinor, money } from "./topconnect";

/**
 * A TopConnect XML gateway in memory, answering the commands the module uses
 * in the gateway's own XML, so the real client is what gets tested. Used by
 * the unit tests and, with ESIM_ENABLE_FAKE_PROVIDER=true and the base URL
 * `fake://topconnect`, by a developer's store — never in production.
 *
 * Any 5- to 32-digit MSISDN is a card the first time it is seen (balance 0,
 * EUR); an MSISDN ending in "0000" is unknown. Packet "9" fails ("Not enough
 * funds") whatever the balance. Every card has data, texts, calls and
 * voicemail on, no call forwarding, and a little history (two calls, a text,
 * two data sessions, a voicemail message) for the history commands. The
 * voucher PIN 1234567890123456 puts 5.00 on a card, once.
 */

interface FakeCard {
  msisdn: string;
  iccid: string;
  balanceMinor: number;
  packages: Array<{ code: string; name: string; bytes: number; activatedAt: string; expiresAt: string }>;
  services: { data: boolean; sms: boolean; voice: boolean };
  voicemail: boolean;
  redirect: string | null;
  dataLimit: { valueMinor: number; since: string; until: string } | null;
}

export interface FakeTopConnectState {
  accountMinor: number;
  lastOrderId: number;
  cards: Map<string, FakeCard>;
  /** Calls seen, as `command` → count, for tests. */
  calls: Map<string, number>;
  /** Accepted transfers, for the card's transfer log. */
  transfers: Array<{ at: string; orderId: number; msisdn: string; amountMinor: number }>;
  /** Voucher PINs already used. */
  vouchersUsed: string[];
  /** Cards asked to reconnect to the network. */
  reconnects: string[];
  /** Text messages sent. */
  sms: Array<{ command: string; from: string; to: string; message: string }>;
  /** Tests: the next `sbalance` transfers are applied but answered with a server error, as if the answer were lost. */
  loseAnswers: number;
}

const PACKETS = [
  { code: "1", name: "Data 1 GB 7 days", bytes: 1024 ** 3, days: 7, priceMinor: 500 },
  { code: "2", name: "Data 3 GB 30 days", bytes: 3 * 1024 ** 3, days: 30, priceMinor: 1200 },
  { code: "9", name: "Always refused", bytes: 1024 ** 2, days: 1, priceMinor: 100 },
];

export function newFakeTopConnectState(): FakeTopConnectState {
  return { accountMinor: 100_000, lastOrderId: 0, cards: new Map(), calls: new Map(), transfers: [], sms: [], reconnects: [], vouchersUsed: [], loseAnswers: 0 };
}

/** The store's one fake gateway, kept while the server process runs. */
const shared = newFakeTopConnectState();

const iso = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");

export function fakeTopConnectFetch(state: FakeTopConnectState = shared): FetchLike {
  return async (input) => {
    const url = new URL(input);
    const params = url.searchParams;
    const command = params.get("command") ?? "";
    state.calls.set(command, (state.calls.get(command) ?? 0) + 1);
    const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/xml" } });
    const error = (root: string, message: string) => xml(`<${root}><type>ERROR</type><text>${message}</text></${root}>`);

    const card = (msisdn: string | null, iccid?: string | null): FakeCard | null => {
      const key = msisdn ?? [...state.cards.values()].find((entry) => entry.iccid === iccid)?.msisdn ?? null;
      if (!key || key.endsWith("0000")) return null;
      let found = state.cards.get(key);
      if (!found) {
        found = {
          msisdn: key,
          iccid: iccid ?? `8937204${key.padStart(12, "0").slice(-12)}`,
          balanceMinor: 0,
          packages: [],
          services: { data: true, sms: true, voice: true },
          voicemail: true,
          redirect: null,
          dataLimit: null,
        };
        state.cards.set(key, found);
      }
      return found;
    };

    switch (command) {
      case "getpermissions":
        return xml("<permissions><command>card_stat</command><command>sbalance</command><command>discountm</command><command>gprsauth</command><command>srvsms</command><command>srvvoice</command><command>svmail</command><command>redirect</command><command>gccdr</command><command>gprscdr</command><command>rechargereport</command></permissions>");
      case "account":
        return xml(
          `<account><name>Fake dealer</name><balance>${formatMinor(state.accountMinor)}</balance><currency>EUR</currency><orderid>${state.lastOrderId}</orderid></account>`,
        );
      case "card_stat": {
        const found = card(params.get("msisdn"), params.get("iccid"));
        if (!found) return xml("<card_stat><error_code>1</error_code><error_text>MSISDN not found</error_text></card_stat>");
        if (params.get("iccid") && found.iccid !== params.get("iccid")) {
          return xml("<card_stat><error_code>3</error_code><error_text>ICCID is not match to MSISDN</error_text></card_stat>");
        }
        const gprs = found.packages
          .map((entry) => `<gprs><status>on</status><activation_date>${entry.activatedAt}</activation_date><expire_date>${entry.expiresAt}</expire_date><name>${entry.name}</name><init_volume>${entry.bytes}</init_volume><left_volume>${entry.bytes}</left_volume><currency>EUR</currency></gprs>`)
          .join("");
        return xml(
          `<card_stat><card><tsimid>${found.msisdn.slice(-6)}</tsimid><iccid>${found.iccid}</iccid><onum>${found.msisdn}</onum><inum>${found.msisdn}</inum><create_date>2026-01-01 00:00:00</create_date><prepaid>true</prepaid><blocked>false</blocked><balance>${formatMinor(found.balanceMinor)}</balance><curr>EUR</curr></card><discount>${gprs}</discount><error_code>0</error_code><error_text>Ok</error_text></card_stat>`,
        );
      }
      case "getdiscount": {
        if (!card(params.get("onum"))) return error("discount", "Card not found");
        // Like the live gateway for a card on no network (stock): the network must be named.
        if (!params.get("mccmnc") && !params.get("sgsnip")) return error("discount", "Please provide mccmnc or sgsnip");
        const packets = PACKETS.map(
          (packet) => `<datapacket><packetname>${packet.name}</packetname><packetcode>${packet.code}</packetcode><volume>${packet.bytes}</volume><duration>${packet.days}</duration><price>${formatMinor(packet.priceMinor)}000</price><currency>EUR</currency></datapacket>`,
        ).join("");
        return xml(`<discount><packetrequired>false</packetrequired>${packets}</discount>`);
      }
      case "discount":
      case "discountm": {
        const found = card(params.get("onum"));
        if (!found) return error(command, "Card not found");
        const activate = params.get("activate");
        if (!activate) {
          const packets = found.packages
            .map((entry) => `<packet><package_code>${entry.code}</package_code><activation_date>${entry.activatedAt}</activation_date><expire_date>${entry.expiresAt}</expire_date><type>${entry.name}</type><amount>${entry.bytes}</amount><dataLeft>${entry.bytes}</dataLeft><multistatus>active</multistatus></packet>`)
            .join("");
          return xml(packets ? `<${command}><gprs>${packets}</gprs></${command}>` : `<${command}><gprs><text>No Data Package activated</text></gprs></${command}>`);
        }
        const code = params.get("packetid") ?? "";
        if (activate === "no") {
          const before = found.packages.length;
          found.packages = found.packages.filter((entry) => entry.code !== code);
          return found.packages.length < before ? xml(`<${command}><result>Ok</result></${command}>`) : error(command, "Packet not ordered");
        }
        const packet = PACKETS.find((entry) => entry.code === code);
        if (!packet) return error(command, "Packet not found");
        if (found.packages.some((entry) => entry.code === code)) return error(command, `${packet.name} Packet already activated`);
        if (packet.code === "9" || found.balanceMinor < packet.priceMinor) return error(command, "Not enough funds");
        found.balanceMinor -= packet.priceMinor;
        const now = new Date();
        found.packages.push({
          code,
          name: packet.name,
          bytes: packet.bytes,
          activatedAt: iso(now),
          expiresAt: iso(new Date(now.getTime() + packet.days * 86_400_000)),
        });
        return xml(`<${command}><result>Ok</result></${command}>`);
      }
      case "sbalance": {
        const found = card(params.get("onum"));
        if (!found) return error("sbalance", "Card not found");
        if (params.get("started")) {
          const records = state.transfers
            .filter((entry) => entry.msisdn === found.msisdn)
            .map((entry) => `<record><added>${entry.at}</added><orderid>${entry.orderId}</orderid><type>card</type><amount>${formatMinor(entry.amountMinor)}</amount></record>`)
            .join("");
          return xml(`<records>${records}</records>`);
        }
        if (params.get("orderid") !== String(state.lastOrderId + 1)) {
          return error("sbalance", `Incorrect OrderID value, must be: ${state.lastOrderId + 1}`);
        }
        const amount = money(params.get("amount"));
        if (amount === null || amount === 0) return error("sbalance", "Incorrect amount");
        if (amount > state.accountMinor) return error("sbalance", "Debit balance limit exceeded");
        if (-amount > found.balanceMinor) return error("sbalance", "Not enough funds on card");
        state.lastOrderId += 1;
        state.accountMinor -= amount;
        found.balanceMinor += amount;
        state.transfers.push({ at: iso(new Date()), orderId: state.lastOrderId, msisdn: found.msisdn, amountMinor: amount });
        if (state.loseAnswers > 0) {
          state.loseAnswers -= 1;
          return new Response("gateway timeout", { status: 504 });
        }
        return xml(
          `<sbalance><onum>${found.msisdn}</onum><amount>${formatMinor(amount)} EUR</amount><orderid>${state.lastOrderId}</orderid><card><balance>${formatMinor(found.balanceMinor)} EUR</balance></card><client><balance>${formatMinor(state.accountMinor)} EUR</balance></client></sbalance>`,
        );
      }
      case "gprsauth": {
        const found = card(params.get("onum"));
        if (!found) return error("gprsauth", "Card not found");
        const block = params.get("block");
        if (block === "t" || block === "f") found.services.data = block === "f";
        else if (block !== "c") return error("gprsauth", "Incorrect block value");
        return xml(`<records><result><text>OK</text><GPRS>${found.services.data ? "enabled" : "disabled"}</GPRS></result></records>`);
      }
      case "srvsms":
      case "srvvoice": {
        const found = card(params.get("onum"));
        if (!found) return xml("<service><result>error</result><msg>Card not found</msg></service>");
        const service = command === "srvsms" ? "sms" : "voice";
        const active = params.get("active");
        if (active === "on" || active === "off") found.services[service] = active === "on";
        else if (active !== "status") return xml("<service><result>error</result><msg>Incorrect active value</msg></service>");
        // As the manual prints it: <status> closed by </service>.
        return xml(`<service><msisdn>${found.msisdn}</msisdn><service>${service}</service><status>${found.services[service] ? "on" : "off"}</service><result>Ok</result></service>`);
      }
      case "svmail": {
        const found = card(params.get("onum"));
        if (!found) return error("voicemail", "Card not found");
        if (params.get("mode") === "gmessages") {
          return xml(
            `<voicemail><message><tsimid>1</tsimid><messagedate>2026-10-20 09:15:00</messagedate><anum>4915112345678</anum><onum>${found.msisdn}</onum><link>https://xml2.travelsim.com/tsim_xml/service/download/rp/fake/${found.msisdn}</link></message></voicemail>`,
          );
        }
        const activate = params.get("activate");
        if (activate === "yes" || activate === "no") found.voicemail = activate === "yes";
        return xml(`<voicemail><tsimid>1</tsimid><inum>${found.msisdn}</inum><onum>${found.msisdn}</onum><activated>${found.voicemail ? "yes" : "no"}</activated><email/></voicemail>`);
      }
      case "redirect": {
        const found = card(params.get("onum"));
        if (!found) return error("redirect", "Card not found");
        const cardXml = () =>
          `<card><tsimid>1</tsimid><onum>${found.msisdn}</onum>${found.redirect ? `<redirect>${found.redirect}</redirect><added>2026-10-01</added>` : "<redirect/><added/>"}</card>`;
        if (!params.has("redirect")) return found.redirect ? xml(cardXml()) : error("redirect", "Unconditional redirect number not activated");
        const target = params.get("redirect") ?? "";
        if (!target) {
          if (!found.redirect) return error("redirect", "Unconditional redirect number not present");
          found.redirect = null;
          return xml(cardXml());
        }
        if (found.redirect) return error("redirect", "Unconditional redirect number already present");
        found.redirect = target;
        return xml(cardXml());
      }
      case "gccdr": {
        const found = card(params.get("onum"));
        if (!found) return error("gccdr", "Card not found");
        return xml(
          `<records><call><tsimid>1</tsimid><calldate>2026-10-21 18:02:11</calldate><onum>${found.msisdn}</onum><anum>4915112345678</anum><bnum>${found.msisdn}</bnum><cdir>I</cdir><duration>64</duration><billsec>62</billsec><ccost>0.00</ccost><curr>EUR</curr><adest>Germany%20Mobile</adest><bdest/></call>` +
            `<call><tsimid>1</tsimid><calldate>2026-10-22 08:40:00</calldate><onum>${found.msisdn}</onum><anum>${found.msisdn}</anum><bnum>33612345678</bnum><cdir>O</cdir><duration>130</duration><billsec>125</billsec><ccost>0.42</ccost><curr>EUR</curr><adest/><bdest>France%20Mobile</bdest></call>` +
            `<sms><tsimid>1</tsimid><calldate>2026-10-22 08:45:30</calldate><onum>${found.msisdn}</onum><anum>${found.msisdn}</anum><bnum>33612345678</bnum><smst>sms</smst><ccost>0.24</ccost><curr>EUR</curr><part>1/1</part></sms></records>`,
        );
      }
      case "gprscdr": {
        const found = card(params.get("onum"));
        if (!found) return error("gprscdr", "Card not found");
        return xml(
          `<records><call><tsimid>1</tsimid><calldate>2026-10-22 20:43:00</calldate><onum>${found.msisdn}</onum><opercode>46001</opercode><country>China</country><operator>China Unicom</operator><sessionid>a</sessionid><inb>30000000</inb><outb>6177280</outb><cost>0.16</cost><curr>EUR</curr><end_session>2026-10-22 21:10:00</end_session><usage_b>36177280</usage_b></call>` +
            `<call><tsimid>1</tsimid><calldate>2026-10-23 11:21:53</calldate><onum>${found.msisdn}</onum><opercode>46001</opercode><country>China</country><operator>China Unicom</operator><sessionid>b</sessionid><inb>15000</inb><outb>5600</outb><cost>0.00</cost><curr>EUR</curr></call></records>`,
        );
      }
      case "rechargereport": {
        const found = card(params.get("onum"));
        if (!found) return error("rechargereport", "Card not found");
        const records = state.transfers
          .filter((entry) => entry.msisdn === found.msisdn)
          .map(
            (entry) =>
              `<record><added>${entry.at}</added><type>card</type><orderid>${entry.orderId}</orderid><uname>dealer</uname><address>10.0.0.1</address><command>sbalance</command><onum>${found.msisdn}</onum><balance>0.00 EUR</balance><amount>${entry.amountMinor > 0 ? "+" : ""}${formatMinor(entry.amountMinor)} EUR</amount></record>` +
              `<record><added>${entry.at}</added><type>client</type><orderid>${entry.orderId}</orderid><uname>dealer</uname><command>sbalance</command><balance>0.00 EUR</balance><amount>${formatMinor(-entry.amountMinor)} EUR</amount></record>`,
          )
          .join("");
        return xml(`<recharges>${records ? `<money transfer><records>${records}</records></money transfer>` : ""}<recharge_amount>0.00 EUR</recharge_amount></recharges>`);
      }
      case "get_last_activity": {
        const found = card(params.get("onum"));
        if (!found) return error("get_last_activity", "Card not found");
        return xml(
          `<get_last_activity><outbound_call><calldate>2026-10-22 08:40:00</calldate><onum>${found.msisdn}</onum><anum>${found.msisdn}</anum><bnum>33612345678</bnum><cdir>O</cdir><duration>130</duration><billsec>125</billsec><ccost>0.42</ccost><curr>EUR</curr></outbound_call>` +
            `<data><calldate>2026-10-23 11:21:53</calldate><onum>${found.msisdn}</onum><opercode>46001</opercode><country>China</country><operator>China Unicom</operator><inb>15000</inb><outb>5600</outb><cost>0.0000</cost><curr>EUR</curr><usage_b>20600</usage_b></data>` +
            `<sms_inbound_nonclassic><calldate>2026-11-08 16:38:06</calldate><onum>${found.msisdn}</onum></sms_inbound_nonclassic></get_last_activity>`,
        );
      }
      case "get_lu": {
        const found = card(params.get("onum"));
        if (!found) return error("get_lu", "Card not found");
        return xml(
          `<get_lu><voice_lu><msisdn>${found.msisdn}</msisdn><vlr>8615644263</vlr><MCC>460</MCC><MNC>01</MNC><lu_type>U</lu_type><date_time>2026-10-23 11:11:28</date_time></voice_lu>` +
            `<gprs_lu><msisdn>${found.msisdn}</msisdn><MCC>460</MCC><MNC>01</MNC><lu_type>P</lu_type><date_time>2026-10-23 11:21:50</date_time></gprs_lu></get_lu>`,
        );
      }
      case "checkdatasession": {
        const found = card(params.get("onum"));
        if (!found) return error("checkdatasession", "Card not found");
        return xml(`<checkdatasession><msisdn>${found.msisdn}</msisdn><sessions></sessions></checkdatasession>`);
      }
      case "makerequest": {
        const found = card(params.get("onum"));
        if (!found) return xml("<makerequest><error_code>1</error_code><error_text>MSISDN not found</error_text><result>FAIL</result></makerequest>");
        state.reconnects.push(found.msisdn);
        return xml(`<makerequest><msisdn>${found.msisdn}</msisdn><scenario_id>1</scenario_id><error_code>0</error_code><error_text>OK</error_text><result>SUCCESS</result></makerequest>`);
      }
      case "gprslimit": {
        const found = card(params.get("onum"));
        if (!found) return error("gprslimit", "Can't found ONUM");
        const option = params.get("option");
        const answer = () => {
          const limit = found.dataLimit!;
          return xml(
            `<gprslimit><onum>${found.msisdn}</onum><result>success</result><active>${limit.since}</active><expire>${limit.until}</expire><period>day</period><count>0</count><value>${formatMinor(limit.valueMinor)}</value><usedvalue>0.00</usedvalue></gprslimit>`,
          );
        };
        const failed = (text: string) => xml(`<gprslimit><onum>${found.msisdn}</onum><result>error</result><text>${text}</text></gprslimit>`);
        if (option === "status") return found.dataLimit ? answer() : failed("The service is not active");
        if (option === "deactive") {
          if (!found.dataLimit) return failed("The service is not defined");
          found.dataLimit = null;
          return xml(`<gprslimit><onum>${found.msisdn}</onum><result>success</result></gprslimit>`);
        }
        const value = money(params.get("value"));
        if (value === null || value <= 0) return failed("Incorrect value");
        if (option === "active") {
          if (found.dataLimit) return failed("The service is activated yet");
          const now = new Date();
          found.dataLimit = { valueMinor: value, since: iso(now), until: iso(new Date(now.getTime() + 86_400_000)) };
          return answer();
        }
        if (option === "update") {
          if (!found.dataLimit) return failed("The service is not active");
          found.dataLimit.valueMinor = value;
          return answer();
        }
        return failed("Incorrect option");
      }
      case "recharge": {
        const found = card(params.get("onum"));
        if (!found) return error("recharge", "Card not found");
        // One voucher works, once: 5.00.
        const pin = params.get("pin") ?? "";
        if (pin !== "1234567890123456" || state.vouchersUsed.includes(pin)) return error("recharge", "Please provide valid PIN to recharge");
        state.vouchersUsed.push(pin);
        found.balanceMinor += 500;
        return xml(`<recharge><onum>${found.msisdn}</onum><amount>5.00</amount><currency>EUR</currency><result>Ok</result></recharge>`);
      }
      case "sms":
      case "sms2": {
        const found = card(params.get("bnum"));
        if (!found) return error(command, "Card not found");
        const message = params.get("msg") ?? "";
        if (!message || !params.get("anum")) return error(command, "Missing parameters");
        state.sms.push({ command, from: params.get("anum") ?? "", to: found.msisdn, message });
        return xml(`<${command}><result>Ok</result></${command}>`);
      }
      default:
        return error("error", `Unknown command ${command}`);
    }
  };
}

/** The store's shared fake gateway, for development scripts that need to steer it (lost answers). */
export const sharedFakeTopConnectState = (): FakeTopConnectState => shared;
