import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redact } from "../redact";

describe("redact", () => {
  it("hides what installs an eSIM or authenticates, wherever it sits", () => {
    const out = redact({
      installation: { activation_code: "LPA:1$a$b", apn: "e-ideas" },
      card: { code: "LPA:1$x$y", pin: "1234", puk: "5678", iccid: "8985" },
      token: "t",
      vpn: { account_number: "8906" },
      nested: [{ note: "LPA:1$p$q" }],
    }) as Record<string, Record<string, unknown>> & { token: unknown; nested: Array<{ note: unknown }> };
    assert.equal(out.installation.activation_code, "[redacted]");
    assert.equal(out.installation.apn, "e-ideas");
    assert.equal(out.card.code, "[redacted]");
    assert.equal(out.card.pin, "[redacted]");
    assert.equal(out.card.puk, "[redacted]");
    assert.equal(out.card.iccid, "8985");
    assert.equal(out.token, "[redacted]");
    assert.equal(out.vpn.account_number, "[redacted]");
    assert.equal(out.nested[0].note, "[redacted]");
  });

  it("cuts long arrays", () => {
    const out = redact({ list: Array.from({ length: 30 }, (_, index) => index) }) as { list: unknown[] };
    assert.equal(out.list.length, 21);
    assert.equal(out.list[20], "[+10 more]");
  });
});
