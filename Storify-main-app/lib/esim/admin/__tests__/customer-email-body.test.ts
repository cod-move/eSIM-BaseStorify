import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerEmailHtml, customerEmailText, messageHtml } from "../customer-email-body";

describe("messageHtml", () => {
  it("turns blank lines into paragraphs and single breaks into <br>", () => {
    const html = messageHtml("Hello,\r\n\r\nLine one\nLine two\n\n\nBye");
    const paragraphs = html.split("\n");
    assert.equal(paragraphs.length, 3);
    assert.match(paragraphs[0], />Hello,<\/p>$/);
    assert.match(paragraphs[1], />Line one<br>Line two<\/p>$/);
    assert.match(paragraphs[2], />Bye<\/p>$/);
  });

  it("escapes what the admin typed: nothing is read as HTML", () => {
    const html = messageHtml(`<script>alert("x")</script> & 'quotes'`);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;"));
  });

  it("makes web addresses links, leaving trailing punctuation outside", () => {
    const html = messageHtml("See https://codsim.cc/help?a=1&b=2. Thanks");
    assert.ok(html.includes(`<a href="https://codsim.cc/help?a=1&amp;b=2" style="color:#2563eb">https://codsim.cc/help?a=1&amp;b=2</a>. Thanks`));
  });

  it("does not link other schemes", () => {
    const html = messageHtml("javascript:alert(1)");
    assert.ok(!html.includes("<a "));
  });

  it("does not let a quote run into a link", () => {
    const html = messageHtml(`"https://codsim.cc/x"`);
    assert.ok(html.includes(`&quot;<a href="https://codsim.cc/x" style="color:#2563eb">https://codsim.cc/x</a>&quot;`));
  });
});

describe("customer email", () => {
  it("signs with the store's name, escaped", () => {
    assert.ok(customerEmailHtml({ message: "Hi", storeName: "A & B" }).includes(">A &amp; B</p>"));
    assert.equal(customerEmailText({ message: " Hi\r\nthere \n", storeName: "Shop" }), "Hi\nthere\n\nShop");
  });
});
