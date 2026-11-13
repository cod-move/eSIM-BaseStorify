import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../http";
import { TopConnectClient, TopConnectOrderIdError, TopConnectOrderUsedError, formatMinor, money, probeTopConnect } from "../topconnect";
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
    const xml = "<discount><packetrequired>false</packetrequired><datapacket><packetname>Data package 1 week</packetname><packetcode>2</packetcode><volume>1024000</volume><duration>168</duration><price>4.99500</price></datapacket></discount>";
    const [packet] = await client(answering(xml).fetch).dataPackages("37282360017");
    assert.deepEqual(packet, { code: "2", name: "Data package 1 week", volumeBytes: 1024000, durationHours: 168, priceMinor: 500, currency: null });
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

  it("names the order id a completed order already has", async () => {
    const gateway = answering("<sbalance><type>ERROR</type><text>Unable to retry completed order: 3153</text></sbalance>");
    await assert.rejects(
      client(gateway.fetch).transfer({ msisdn: "37254515257", amountMinor: 500, currency: "EUR", orderId: 3153 }),
      (error: unknown) => error instanceof TopConnectOrderUsedError && error.orderId === 3153,
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

describe("TopConnect services and history", () => {
  const fake = () => {
    const state = newFakeTopConnectState();
    return { state, tc: client(fakeTopConnectFetch(state)) };
  };

  it("switches data, texts and calls and reads them back", async () => {
    const { tc } = fake();
    for (const service of ["data", "sms", "voice"] as const) {
      assert.equal(await tc.serviceStatus("37254515257", service), true);
      assert.equal(await tc.setService("37254515257", service, false), false);
      assert.equal(await tc.serviceStatus("37254515257", service), false);
      assert.equal(await tc.setService("37254515257", service, true), true);
    }
  });

  it("reads the manual's srvsms answer, whose <status> is closed by </service>", async () => {
    const { fetch } = answering("<service><msisdn>372</msisdn><service>sms</service><status>off</service><result>Ok</result></service>");
    assert.equal(await client(fetch).serviceStatus("37254515257", "sms"), false);
    const failed = answering("<service><result>error</result><msg>Service unavailable</msg></service>");
    await assert.rejects(client(failed.fetch).serviceStatus("37254515257", "sms"), /Service unavailable/);
  });

  it("turns voicemail off and lists its messages", async () => {
    const { tc } = fake();
    assert.deepEqual(await tc.voicemail("37254515257"), { active: true, email: null });
    assert.equal((await tc.setVoicemail("37254515257", false)).active, false);
    const messages = await tc.voicemailMessages("37254515257", "2026-10-01", "2026-10-31");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].from, "4915112345678");
    assert.equal(messages[0].at, "2026-10-20T09:15:00Z");
  });

  it("forwards calls, replaces the forward, and stops it", async () => {
    const { tc, state } = fake();
    assert.equal(await tc.redirect("37254515257"), null);
    assert.equal(await tc.setRedirect("37254515257", "+44 7700 900123"), "447700900123");
    assert.equal(await tc.setRedirect("37254515257", "33612345678"), "33612345678");
    assert.equal(await tc.redirect("37254515257"), "33612345678");
    assert.equal(await tc.setRedirect("37254515257", null), null);
    assert.equal(state.cards.get("37254515257")?.redirect, null);
    // Setting what is already set asks nothing more.
    const before = state.calls.get("redirect");
    assert.equal(await tc.setRedirect("37254515257", null), null);
    assert.equal(state.calls.get("redirect"), (before ?? 0) + 1);
  });

  it("lists calls, texts and data sessions, newest first", async () => {
    const { tc } = fake();
    const calls = await tc.callRecords("37254515257", "2026-10-01", "2026-10-31");
    assert.deepEqual(calls.map((entry) => [entry.kind, entry.direction]), [["sms", "out"], ["call", "out"], ["call", "in"]]);
    assert.equal(calls[1].seconds, 125);
    assert.equal(calls[1].costMinor, 42);
    assert.equal(calls[2].destination, "Germany Mobile");
    const data = await tc.dataRecords("37254515257", "2026-10-01", "2026-10-31");
    assert.deepEqual(data.map((entry) => entry.bytes), [20600, 36177280]);
    assert.equal(data[1].operator, "China Unicom");
  });

  it("lists the card's recharges without the dealer's side", async () => {
    const { tc } = fake();
    await tc.transfer({ msisdn: "37254515257", amountMinor: 500, currency: "EUR", orderId: 1 });
    const recharges = await tc.recharges("37254515257", "2026-01-01", "2030-01-01");
    assert.equal(recharges.length, 1);
    assert.deepEqual([recharges[0].kind, recharges[0].amountMinor, recharges[0].currency], ["transfer", 500, "EUR"]);
    // The manual's report: vouchers, transfers, automatic and web top-ups, with spaces in the section names.
    const report = answering(
      "<recharges><pin recharge><records><record><used>2012-04-28 07:36:35</used><pin>3668828254773228</pin><amount>5.00</amount><currency>USD</currency></record></records></pin recharge>" +
        "<web recharge><records><record><added>2014-03-07 10:28:48</added><type>web</type><amount>+68.15 USD</amount></record></records></web recharge><recharge_amount>73.15 USD</recharge_amount></recharges>",
    );
    const parsed = await client(report.fetch).recharges("37254515257", "2012-01-01", "2015-01-01");
    assert.deepEqual(parsed.map((entry) => [entry.kind, entry.amountMinor, entry.currency]), [["web", 6815, "USD"], ["voucher", 500, "USD"]]);
    assert.equal(JSON.stringify(parsed).includes("3668828254773228"), false);
  });
});

describe("TopConnect troubleshooting", () => {
  it("reads the latest activity, registrations and data session, and reconnects", async () => {
    const state = newFakeTopConnectState();
    const tc = client(fakeTopConnectFetch(state));
    const activity = await tc.lastActivity("37254515257");
    assert.deepEqual(activity.map((entry) => entry.type), ["sms_inbound_nonclassic", "data", "outbound_call"]);
    assert.equal(activity[1].bytes, 20600);
    assert.equal(activity[2].party, "33612345678");
    const updates = await tc.locationUpdates("37254515257");
    assert.deepEqual(updates.map((entry) => [entry.type, entry.mcc, entry.mnc]), [["gprs_lu", "460", "01"], ["voice_lu", "460", "01"]]);
    assert.equal(await tc.dataSession("37254515257"), null);
    await tc.reconnect("37254515257");
    assert.deepEqual(state.reconnects, ["37254515257"]);
  });

  it("reads the manual's answers", async () => {
    const session = answering("<checkdatasession><msisdn>1</msisdn><sessions><session><starttime>2017-12-21 17:15:48</starttime><mccmnc>24801</mccmnc></session></sessions></checkdatasession>");
    assert.deepEqual(await client(session.fetch).dataSession("37254515257"), { startedAt: "2017-12-21T17:15:48Z", mccmnc: "24801" });
    const refused = answering("<makerequest><error_code>2</error_code><error_text>Not allowed</error_text><result>FAIL</result></makerequest>");
    await assert.rejects(client(refused.fetch).reconnect("37254515257"), /cannot be reconnected/);
  });
});

describe("TopConnect data limit and vouchers", () => {
  it("sets, changes and removes a daily data limit", async () => {
    const tc = client(fakeTopConnectFetch(newFakeTopConnectState()));
    assert.equal(await tc.dataLimit("37254515257"), null);
    assert.equal((await tc.setDataLimit("37254515257", 50))?.valueMinor, 50);
    assert.equal((await tc.setDataLimit("37254515257", 120))?.valueMinor, 120);
    assert.equal((await tc.dataLimit("37254515257"))?.period, "day");
    assert.equal(await tc.setDataLimit("37254515257", null), null);
    assert.equal(await tc.dataLimit("37254515257"), null);
    assert.equal(await tc.setDataLimit("37254515257", null), null);
  });

  it("reads the manual's limit answer", async () => {
    const status = answering("<gprslimit><onum>1</onum><result>success</result><active>2013-07-04 14:34:56.917</active><expire>2013-07-05 14:34:56</expire><period>day</period><count>3</count><value>20.00</value><usedvalue>0.01</usedvalue></gprslimit>");
    assert.deepEqual(await client(status.fetch).dataLimit("37254515257"), { valueMinor: 2000, usedMinor: 1, period: "day", periodStart: "2013-07-04T14:34:56Z", periodEnd: "2013-07-05T14:34:56Z" });
  });

  it("puts a voucher on the card once", async () => {
    const state = newFakeTopConnectState();
    const tc = client(fakeTopConnectFetch(state));
    await tc.redeemVoucher("37254515257", "1234 5678 9012 3456");
    assert.equal(state.cards.get("37254515257")?.balanceMinor, 500);
    await assert.rejects(tc.redeemVoucher("37254515257", "1234567890123456"), /valid PIN/);
    await assert.rejects(tc.redeemVoucher("37254515257", "abc"), /valid PIN/);
  });
});

describe("TopConnect package status", () => {
  const byCommand = (answers: Record<string, string>): FetchLike => async (input) => {
    const command = new URL(input).searchParams.get("command") ?? "";
    return new Response(answers[command] ?? "<error><type>ERROR</type><text>Unknown command</text></error>", { status: 200 });
  };
  const packet = "<gprs><packet><package_code>7</package_code><activation_date>2026-11-01 10:00:00</activation_date><expire_date>2026-12-01 10:00:00</expire_date><type>EU 5GB</type><amount>5120000000</amount><dataLeft>4000000000</dataLeft></packet></gprs>";

  it("reads packages from discountm, as the live gateway answers them", async () => {
    const packages = await client(byCommand({ discountm: `<discountm>${packet}</discountm>` })).activePackages("37254515257");
    assert.deepEqual(packages.map((entry) => [entry.packetId, entry.name]), [["7", "EU 5GB"]]);
  });

  it("falls back to discount when discountm names none", async () => {
    const packages = await client(byCommand({ discountm: "<discountm><gprs><text>No Data Package activated</text></gprs></discountm>", discount: `<discount>${packet}</discount>` })).activePackages("37254515257");
    assert.equal(packages.length, 1);
  });
});

describe("TopConnect voicemail calls", () => {
  it("lists calls that went to voicemail with the calls", async () => {
    const answer = answering("<records><voicemail><calldate>2026-11-01 09:00:00</calldate><onum>37254515257</onum><anum>4915112345678</anum><bnum>37254515257</bnum><duration>20</duration><ccost>0.00</ccost><curr>EUR</curr></voicemail></records>");
    const records = await client(answer.fetch).callRecords("37254515257", "2026-11-01", "2026-11-02");
    assert.deepEqual(records.map((entry) => [entry.kind, entry.direction, entry.from]), [["voicemail", "in", "4915112345678"]]);
  });
});
