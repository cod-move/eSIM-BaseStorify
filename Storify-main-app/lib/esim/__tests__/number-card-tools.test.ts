import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterCardTransferLeg, parseCardAmount } from "../numbers/op-policy";
import { TopConnectClient } from "../providers/topconnect";
import { fakeTopConnectFetch, newFakeTopConnectState } from "../providers/topconnect-fake";

describe("credit moved between a shopper's numbers", () => {
  it("takes it off the source, then puts it on the target", () => {
    assert.equal(afterCardTransferLeg("debit", "done"), "credit");
    assert.equal(afterCardTransferLeg("credit", "done"), "completed");
  });
  it("moves nothing when the source refuses", () => {
    assert.equal(afterCardTransferLeg("debit", "refused"), "failed");
  });
  it("puts it back when the target refuses", () => {
    assert.equal(afterCardTransferLeg("credit", "refused"), "refund");
    assert.equal(afterCardTransferLeg("refund", "done"), "returned");
  });
  it("asks a person when putting it back fails, and waits on an unclear answer", () => {
    assert.equal(afterCardTransferLeg("refund", "refused"), "manual");
    assert.equal(afterCardTransferLeg("credit", "manual"), "manual");
    assert.equal(afterCardTransferLeg("debit", "wait"), "wait");
  });
  it("reads amounts in cents, without floating point", () => {
    assert.equal(parseCardAmount("12"), 1200);
    assert.equal(parseCardAmount("12.5"), 1250);
    assert.equal(parseCardAmount("0,07"), 7);
    assert.equal(parseCardAmount("0"), null);
    assert.equal(parseCardAmount("1.234"), null);
    assert.equal(parseCardAmount("-3"), null);
  });
});

describe("an SMS to the shopper's own number", () => {
  const setup = () => {
    const state = newFakeTopConnectState();
    return { state, client: new TopConnectClient({ username: "u", password: "p", fetch: fakeTopConnectFetch(state) }) };
  };
  it("is sent with sms2 from the sender named", async () => {
    const { state, client } = setup();
    await client.sendSms({ from: "37259500001", to: "37255501234", message: "Hello" });
    assert.deepEqual(state.sms, [{ command: "sms2", from: "37259500001", to: "37255501234", message: "Hello" }]);
  });
  it("refuses an empty or over-long message, or a bad sender, before calling", async () => {
    const { state, client } = setup();
    await assert.rejects(client.sendSms({ from: "37259500001", to: "37255501234", message: "  " }));
    await assert.rejects(client.sendSms({ from: "37259500001", to: "37255501234", message: "x".repeat(161) }));
    await assert.rejects(client.sendSms({ from: "ab", to: "37255501234", message: "Hi" }));
    assert.equal(state.calls.size, 0);
  });
});
