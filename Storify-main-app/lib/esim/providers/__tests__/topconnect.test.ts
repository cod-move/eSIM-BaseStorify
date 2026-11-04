import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../http";
import { TopConnectClient, TopConnectOrderIdError, formatMinor, money, probeTopConnect } from "../topconnect";
import { fakeTopConnectFetch, newFakeTopConnectState } from "../topconnect-fake";
import { ProviderError } from "../types";

/** A gateway answering every call with the same XML, recording the URLs. */
function answering(xml: string, status = 200): { fetch: FetchLike; urls: URL[] } {
  const urls: URL[] = [];
  return {
    urls,
    fetch: async (input) => {
      urls.push(new URL(input));
      return new Response(xml, { status });
    },
  };
}

const client = (fetch: FetchLike) => new TopConnectClient({ username: "dealer", password: "s3cret", fetch });

// From the manual, 2.2 card_stat.
const CARD_STAT = `<card_stat>
<card>
<tsimid>21545763</tsimid>
<aserviceid>9000</aserviceid>
<iccid>123456789012345</iccid>
<onum>37254515257</onum>
<inum>20189889627</inum>
<create_date>2012-12-23 10:16:34</create_date>
<FUsage_date>2012-12-23 10:16:34</ FUsage_date >
<LUsage_date>2013-01-05 08:00:00</ LUsage_date >
<prepaid>true</prepaid>
<blocked>false</blocked>
<balance>100.45</balance>
<overdraft>0</ overdraft >
<curr>USD</curr>
</card>
<discount>
<gprs>
<tsimid>21545763</tsimid>
<status>on</status>
<activation_date>2014-05-10 17:46:54</activation_date>
<expire_date>2014-05-11 17:46:54</expire_date>
<onum>37253100193</onum>
<name>test</name>
<cost>5.00</cost>
<init_volume>10000</init_volume>
<left_volume>500</left_volume>
<currency>USD</currency>
</gprs>
</discount>
<error_code>0</error_code>
<error_text>Ok</error_text>
</card_stat>`;

describe("TopConnect client", () => {
  it("sends the credentials, plain=1 and the command as query parameters", async () => {
    const gateway = answering("<account><name>A</name><balance>514.00</balance><currency>USD</currency><orderid>35</orderid></account>");
    const account = await client(gateway.fetch).account();
    const url = gateway.urls[0]!;
    assert.equal(url.origin + url.pathname, "https://xml2.travelsim.com/tsim_xml/service/xmlgate");
    assert.equal(url.searchParams.get("uname"), "dealer");
    assert.equal(url.searchParams.get("upass"), "s3cret");
    assert.equal(url.searchParams.get("plain"), "1");
    assert.equal(url.searchParams.get("command"), "account");
    assert.deepEqual(account, { name: "A", balanceMinor: 51400, currency: "USD", lastOrderId: 35 });
  });

  it("reads card_stat, closing tags with stray spaces included", async () => {
    const { card, packages } = await client(answering(CARD_STAT).fetch).cardStatus({ msisdn: "+372 5451 5257" });
    assert.equal(card.msisdn, "37254515257");
    assert.equal(card.iccid, "123456789012345");
    assert.equal(card.balanceMinor, 10045);
    assert.equal(card.currency, "USD");
    assert.equal(card.blocked, false);
    assert.equal(card.lastUsedAt, "2013-01-05T08:00:00Z");
    assert.equal(packages.length, 1);
    assert.equal(packages[0]!.kind, "gprs");
    assert.equal(packages[0]!.name, "test");
    assert.equal(packages[0]!.totalBytes, 10000);
    assert.equal(packages[0]!.leftBytes, 500);
    assert.equal(packages[0]!.expiresAt, "2014-05-11T17:46:54Z");
  });

  it("turns card_stat error codes into not_found / rejected", async () => {
    const missing = answering("<card_stat><error_code>1</error_code><error_text>MSISDN not found</error_text></card_stat>");
    await assert.rejects(client(missing.fetch).cardStatus({ msisdn: "37200000001" }), (error: unknown) => error instanceof ProviderError && error.code === "not_found");
    const mismatch = answering("<card_stat><error_code>3</error_code><error_text>ICCID is not match to MSISDN</error_text></card_stat>");
    await assert.rejects(client(mismatch.fetch).cardStatus({ msisdn: "37254515257", iccid: "8937" + "1".repeat(15) }), (error: unknown) => error instanceof ProviderError && error.code === "rejected");
  });

  it("reads several packets inside one gprs block (discount detailed)", async () => {
    const xml = `<discount><gprs>
<packet><package_code>4</package_code><activation_date>2016-07-05 12:40:16</activation_date><expire_date>2017-07-05 12:40:16</expire_date><type>Messaging</type><cost>12.00</cost><amount>1024000000</amount><dataLeft>1024000000</dataLeft><multistatus>blocked/<multistatus></packet>
<packet><package_code>2</package_code><activation_date>2016-07-15 10:32:46</activation_date><expire_date>2016-07-16 10:32:46</expire_date><type>Daily package 10 MB</type><cost>5.00</cost><amount>10240000</amount><dataLeft>10240000</dataLeft><multistatus>active</multistatus></packet>
</gprs></discount>`;
    const packages = await client(answering(xml).fetch).activePackages("37254515257");
    assert.deepEqual(packages.map((entry) => [entry.packetId, entry.name, entry.costMinor]), [
      ["4", "Messaging", 1200],
      ["2", "Daily package 10 MB", 500],
    ]);
  });

  it("reads a package ordered for the next data session", async () => {
    const xml = "<discountm><gprs><tsimid>1</tsimid><activation_date/><expire_date/><type>test</type><cost>1.00</cost><text>Data Package test will be activated with the beginning of the next data session</text><amount>104857600</amount></gprs></discountm>";
    const [entry] = await client(answering(xml).fetch).activePackages("37254962858");
    assert.equal(entry!.status, "ordered");
    assert.equal(entry!.activatedAt, null);
  });

  it("reads getdiscount's packages with five-decimal prices", async () => {
    const xml = "<discount><packetrequired>false</packetrequired><datapacket><packetname>Data package 1 week</packetname><packetcode>2</packetcode><volume>1024000</volume><duration>7</duration><price>4.99500</price></datapacket></discount>";
    const [packet] = await client(answering(xml).fetch).dataPackages("37282360017");
    assert.deepEqual(packet, { code: "2", name: "Data package 1 week", volumeBytes: 1024000, durationDays: 7, priceMinor: 500, currency: null });
  });

  it("names the network for getdiscount when given (a stock card is on none)", async () => {
    const gateway = answering("<discount><packetrequired>false</packetrequired></discount>");
    await client(gateway.fetch).dataPackages("37282360017", { mccmnc: "24802" });
    assert.equal(gateway.urls[0]!.searchParams.get("mccmnc"), "24802");
    await assert.rejects(client(gateway.fetch).dataPackages("37282360017", { mccmnc: "24A02" }), /5 or 6 digits/);
  });

  it("sends a transfer as X.XX with the order id, and reads both balances", async () => {
    const xml = "<sbalance><amount>-10.00 USD</amount><orderid>32</orderid><card><balance>10022.21 USD</balance><amount>-10.00 USD</amount></card><client><balance>499.00 USD</balance><amount>+10.00 USD</amount></client></sbalance>";
    const gateway = answering(xml);
    const result = await client(gateway.fetch).transfer({ msisdn: "37254515257", amountMinor: -1000, currency: "usd", orderId: 32 });
    assert.equal(gateway.urls[0]!.searchParams.get("amount"), "-10.00");
    assert.equal(gateway.urls[0]!.searchParams.get("curr"), "USD");
    assert.equal(gateway.urls[0]!.searchParams.get("orderid"), "32");
    assert.deepEqual(result, { orderId: 32, cardBalanceMinor: 1002221, accountBalanceMinor: 49900 });
  });

  it("names the expected order id when sbalance refuses one", async () => {
    const gateway = answering("<sbalance><type>ERROR</type><text>Incorrect OrderID value, must be: 32</text></sbalance>");
    await assert.rejects(
      client(gateway.fetch).transfer({ msisdn: "37254515257", amountMinor: 500, currency: "EUR", orderId: 7 }),
      (error: unknown) => error instanceof TopConnectOrderIdError && error.expected === 32,
    );
  });

  it("treats a lost connection and a server error as uncertain, a refusal as rejected", async () => {
    const offline: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(client(offline).account(), (error: unknown) => error instanceof ProviderError && error.code === "uncertain");
    await assert.rejects(client(answering("oops", 502).fetch).account(), (error: unknown) => error instanceof ProviderError && error.code === "uncertain");
    const refused = answering("<discount><type>ERROR</type><text>Packet not found</text></discount>");
    await assert.rejects(client(refused.fetch).activateDataPackage("37254515257", "8"), (error: unknown) => error instanceof ProviderError && error.code === "not_found");
    const broke = answering("<sbalance><type>ERROR</type><text>Debit balance limit exceeded</text></sbalance>");
    await assert.rejects(
      client(broke.fetch).transfer({ msisdn: "37254515257", amountMinor: 500, currency: "EUR", orderId: 1 }),
      (error: unknown) => error instanceof ProviderError && error.code === "rejected" && /limit/.test(error.message),
    );
  });

  it("refuses bad input before calling", async () => {
    const gateway = answering("<x/>");
    await assert.rejects(client(gateway.fetch).cardStatus({}));
    await assert.rejects(client(gateway.fetch).transfer({ msisdn: "37254515257", amountMinor: 1.5, currency: "EUR", orderId: 1 }));
    await assert.rejects(client(gateway.fetch).activateDataPackage("37254515257", "1&x=2"));
    assert.equal(gateway.urls.length, 0);
  });

  it("converts amounts both ways in cents", () => {
    assert.equal(money("10022.21"), 1002221);
    assert.equal(money("+10.00 USD"), 1000);
    assert.equal(money("-0.05"), -5);
    assert.equal(money("0.99000"), 99);
    assert.equal(money("12"), 1200);
    assert.equal(money("abc"), null);
    assert.equal(formatMinor(5), "0.05");
    assert.equal(formatMinor(-1000), "-10.00");
    assert.equal(formatMinor(123456), "1234.56");
  });
});

describe("TopConnect fake gateway", () => {
  it("runs a recharge and a data package through the real client", async () => {
    const state = newFakeTopConnectState();
    const fake = client(fakeTopConnectFetch(state));
    assert.match((await probeTopConnect(fake)).message, /last order id 0/);

    await assert.rejects(
      fake.transfer({ msisdn: "37255501234", amountMinor: 500, currency: "EUR", orderId: 2 }),
      (error: unknown) => error instanceof TopConnectOrderIdError && error.expected === 1,
    );
    const transfer = await fake.transfer({ msisdn: "37255501234", amountMinor: 500, currency: "EUR", orderId: 1 });
    assert.equal(transfer.cardBalanceMinor, 500);

    await assert.rejects(fake.dataPackages("37255501234"), /mccmnc or sgsnip/);
    const packets = await fake.dataPackages("37255501234", { mccmnc: "24801" });
    assert.equal(packets[0]!.priceMinor, 500);
    await fake.activateDataPackage("37255501234", "1");
    await assert.rejects(fake.activateDataPackage("37255501234", "1"), /already activated/);
    const status = await fake.cardStatus({ msisdn: "37255501234" });
    assert.equal(status.card.balanceMinor, 0);
    assert.equal(status.packages.length, 1);

    const active = await fake.activePackages("37255501234");
    assert.equal(active[0]!.packetId, "1");
    await fake.cancelDataPackage("37255501234", "1");
    assert.deepEqual(await fake.activePackages("37255501234"), []);
    await assert.rejects(fake.cardStatus({ msisdn: "37212340000" }), (error: unknown) => error instanceof ProviderError && error.code === "not_found");
  });
});
