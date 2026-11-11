import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numberReasonOf } from "../number-refusals";

describe("a refused number action, as the app's reason", () => {
  it("names the refusals the website's services give", () => {
    assert.equal(numberReasonOf("This number has just been taken: choose another one"), "NUMBER_TAKEN");
    assert.equal(numberReasonOf("This number is blocked"), "BLOCKED");
    assert.equal(numberReasonOf("Number services are not available right now"), "UNAVAILABLE");
    assert.equal(numberReasonOf("Enter the number with its country code"), "BAD_NUMBER");
    assert.equal(numberReasonOf("The number has €4.50"), "NOT_ENOUGH_CREDIT");
    assert.equal(numberReasonOf("The number was reconnected a few minutes ago; wait before trying again"), "RECONNECT_WAIT");
    assert.equal(numberReasonOf("This SIM cannot be reconnected from here"), "RECONNECT_UNSUPPORTED");
    assert.equal(numberReasonOf("Choose an amount between 2 and 300"), "BAD_AMOUNT");
    assert.equal(numberReasonOf("Type the number exactly to confirm"), "CONFIRM_MISMATCH");
    assert.equal(numberReasonOf("The balance could not be read; refresh and try again"), "REFRESH_RETRY");
  });

  it("sends anything else as REFUSED, with the sentence itself", () => {
    assert.equal(numberReasonOf("Voucher already used"), "REFUSED");
  });
});
