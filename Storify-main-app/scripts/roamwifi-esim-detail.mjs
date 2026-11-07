#!/usr/bin/env node
/**
 * Prints RoamWifi's getESIMDetail answer for one ICCID (doc v2.11 §2.27), signed
 * the way lib/esim/providers/roamwifi.ts signs it. Run it on a server whose IP
 * RoamWifi has whitelisted. No dependencies; reads nothing from the store.
 *
 *   ROAMWIFI_PHONE='<account phone>' ROAMWIFI_PASSWORD='<password>' \
 *     node scripts/roamwifi-esim-detail.mjs 8985xxxxxxxxxxxxxxx
 *
 * Optional: ROAMWIFI_SIGN_KEY (when RoamWifi issued a private one),
 * ROAMWIFI_BASE_URL, ROAMWIFI_DETAIL_URL.
 */
import { createHash } from "node:crypto";

const iccid = process.argv[2];
const phone = process.env.ROAMWIFI_PHONE;
const password = process.env.ROAMWIFI_PASSWORD;
if (!iccid || !phone || !password) {
  console.error("Usage: ROAMWIFI_PHONE=… ROAMWIFI_PASSWORD=… node scripts/roamwifi-esim-detail.mjs <iccid>");
  process.exit(1);
}
const signKey = process.env.ROAMWIFI_SIGN_KEY || "1234567890qwertyuiopasdfghjklzxc";
const baseUrl = (process.env.ROAMWIFI_BASE_URL || "https://bpm.roamwifi.hk").replace(/\/+$/, "");
const detailUrl = process.env.ROAMWIFI_DETAIL_URL || "https://www.roamesim.net/api/base/getESIMDetail";

const rawUrlEncode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const sign = (params) => {
  const pairs = Object.entries(params).filter(([key, value]) => key !== "sign" && value !== "").map(([key, value]) => `${key}=${value}`).sort();
  return createHash("md5").update(rawUrlEncode(pairs.join("") + signKey)).digest("hex").toUpperCase();
};
const post = async (url, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, sign: sign(params) }),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
};

const login = await post(`${baseUrl}/api_order/login`, { phonenumber: phone, password });
const token = login.body?.data?.token;
if (!token) {
  console.error("Login refused:", JSON.stringify(login.body));
  process.exit(1);
}
const detail = await post(detailUrl, { iccid, token });
console.log(`HTTP ${detail.status}`);
console.log(typeof detail.body === "string" ? detail.body : JSON.stringify(detail.body, null, 2));
