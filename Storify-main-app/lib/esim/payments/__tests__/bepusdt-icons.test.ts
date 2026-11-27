import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bepusdtIcons } from "../plugins/bepusdt";

const BASE = "https://pay.example.com/checkout/langge/assets/web3icons";

describe("bepusdtIcons", () => {
  it("finds the coin's and the network's pictures as the cashier page does", () => {
    assert.deepEqual(bepusdtIcons("https://pay.example.com/", "usdt", "tron", "TRC20"), {
      currencyIcon: `${BASE}/token/USDT.svg`,
      networkIcon: `${BASE}/network/tron.svg`,
    });
    assert.equal(bepusdtIcons("https://pay.example.com", "USDC", "bsc", "BEP20").networkIcon, `${BASE}/network/bsc.svg`);
    assert.equal(bepusdtIcons("https://pay.example.com", "USDT", "erc20").networkIcon, `${BASE}/network/ethereum.svg`);
  });

  it("leaves out what the page has no picture for", () => {
    assert.deepEqual(bepusdtIcons("https://pay.example.com", "DOGE", "dogecoin"), {});
    assert.deepEqual(bepusdtIcons(undefined, "USDT", "tron"), {});
    assert.deepEqual(bepusdtIcons("pay.example.com", "USDT", "tron"), {});
  });
});
