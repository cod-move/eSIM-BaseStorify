import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";

/**
 * Opens Airwallex's Hosted Payment Page for one PaymentIntent
 * (lib/esim/payments/plugins/airwallex.ts). The page can only be opened by
 * Airwallex's script, so this tiny page loads it and calls
 * redirectToCheckout. The shopper comes back only to our own eSIM payment
 * page; anything else is refused.
 */
const SDK = "https://static.airwallex.com/components/sdk/v1/index.js";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const intent = query.get("intent") ?? "";
  const secret = query.get("secret") ?? "";
  const currency = (query.get("currency") ?? "").toUpperCase();
  const env = query.get("env") === "demo" ? "demo" : "prod";
  const locale = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(query.get("locale") ?? "") ? query.get("locale")! : "en";
  const methods = (query.get("methods") ?? "").split(",").filter((type) => /^[a-z_]{2,40}$/.test(type));
  let back: URL | null = null;
  try {
    back = new URL(query.get("back") ?? "");
  } catch {
    back = null;
  }
  // Behind a proxy this request's own origin is the internal one (http://localhost:3000), so the
  // way back is matched by the host the browser used, or the configured public origin.
  const hosts = new Set(
    [request.headers.get("x-forwarded-host")?.split(",")[0], request.headers.get("host"), request.nextUrl.host]
      .map((host) => host?.trim().toLowerCase())
      .filter(Boolean),
  );
  const ownPage = Boolean(back) && (hosts.has(back!.host.toLowerCase()) || back!.origin === appBaseUrl()) && /^\/(?:[a-z-]+\/)?esim\/pay\//.test(back!.pathname);
  // Which part is wrong (never the values), so a refused link can be told apart in the logs.
  const wrong = !/^int_[A-Za-z0-9_-]{6,80}$/.test(intent)
    ? "intent"
    : !/^[A-Za-z0-9_.-]{10,4096}$/.test(secret) // a JWT, often longer than 400 characters
      ? "secret"
      : !/^[A-Z]{3}$/.test(currency)
        ? "currency"
        : !ownPage || !back
          ? "back"
          : null;
  if (wrong || !back) {
    console.warn(`[esim] Airwallex launch refused: bad ${wrong} (secret ${secret.length} chars, back host ${back?.host ?? "none"}, hosts ${[...hosts].join(" ")})`);
    return new NextResponse(`Invalid payment link (${wrong})`, { status: 400 });
  }

  const options = {
    env,
    mode: "payment",
    intent_id: intent,
    client_secret: secret,
    currency,
    locale,
    successUrl: back.toString(),
    ...(methods.length ? { methods } : {}),
  };
  // JSON inside a script: "<" escaped so nothing can close the tag.
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Airwallex</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#555}a{color:inherit}</style></head>
<body><p id="m">Opening Airwallex…</p>
<script src="${SDK}"></script>
<script>
(async function () {
  try {
    var r = await window.AirwallexComponentsSDK.init({ env: ${json(env)}, enabledElements: ["payments"] });
    r.payments.redirectToCheckout(${json(options)});
  } catch (e) {
    document.getElementById("m").innerHTML = 'Airwallex could not be opened. <a href=' + ${json(json(back.toString()))} + '>Back</a>';
  }
})();
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
