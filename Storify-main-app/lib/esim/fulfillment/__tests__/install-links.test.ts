import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installLinks } from "../install-links";

describe("installLinks", () => {
  it("builds the Apple and Android one-tap links with the code URL-encoded", () => {
    const links = installLinks("LPA:1$rsp.example.com$ABC-123");
    assert.equal(
      links?.ios,
      "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.com%24ABC-123",
    );
    assert.equal(
      links?.android,
      "https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.com%24ABC-123",
    );
  });

  it("refuses anything that is not an LPA code", () => {
    assert.equal(installLinks(null), null);
    assert.equal(installLinks("https://example.com"), null);
    assert.equal(installLinks("LPA:1$only-host"), null);
  });
});
