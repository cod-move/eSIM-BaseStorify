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
 * funds") whatever the balance.
 */

interface FakeCard {
  msisdn: string;
  iccid: string;
  balanceMinor: number;
  packages: Array<{ code: string; name: string; bytes: number; activatedAt: string; expiresAt: string }>;
}

export interface FakeTopConnectState {
  accountMinor: number;
  lastOrderId: number;
  cards: Map<string, FakeCard>;
  /** Calls seen, as `command` → count, for tests. */
  calls: Map<string, number>;
}

const PACKETS = [
  { code: "1", name: "Data 1 GB 7 days", bytes: 1024 ** 3, days: 7, priceMinor: 500 },
  { code: "2", name: "Data 3 GB 30 days", bytes: 3 * 1024 ** 3, days: 30, priceMinor: 1200 },
  { code: "9", name: "Always refused", bytes: 1024 ** 2, days: 1, priceMinor: 100 },
];

export function newFakeTopConnectState(): FakeTopConnectState {
  return { accountMinor: 100_000, lastOrderId: 0, cards: new Map(), calls: new Map() };
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
        found = { msisdn: key, iccid: iccid ?? `8937204${key.padStart(12, "0").slice(-12)}`, balanceMinor: 0, packages: [] };
        state.cards.set(key, found);
      }
      return found;
    };

    switch (command) {
      case "getpermissions":
        return xml("<permissions><command>card_stat</command><command>sbalance</command><command>discountm</command></permissions>");
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
        if (params.get("started")) return xml("<records></records>");
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
        return xml(
          `<sbalance><onum>${found.msisdn}</onum><amount>${formatMinor(amount)} EUR</amount><orderid>${state.lastOrderId}</orderid><card><balance>${formatMinor(found.balanceMinor)} EUR</balance></card><client><balance>${formatMinor(state.accountMinor)} EUR</balance></client></sbalance>`,
        );
      }
      default:
        return error("error", `Unknown command ${command}`);
    }
  };
}
