import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decimalToMinor, migrateEsim, migrateNumber, migrateUser, parseLpa, type LegacyEsimRow, type LegacyNumberRow, type LegacyUserRow } from "../legacy-rows";

const HASH = `$2y$10$${"a".repeat(53)}`;
const now = new Date("2026-10-27T00:00:00Z");

const user = (overrides: Partial<LegacyUserRow> = {}): LegacyUserRow => ({
  id: 7,
  firstname: " Ada ",
  lastname: "Lovelace",
  username: "ada",
  email: " Ada@Example.TEST ",
  dial_code: "44",
  mobile: "7700 900123",
  ref_by: 3,
  balance: "12.34500000",
  password: HASH,
  country_code: "gb",
  city: "London",
  state: null,
  zip: "N1",
  address: "1 Street",
  status: 1,
  ev: 1,
  sv: 1,
  created_at: new Date("2025-01-01T00:00:00Z"),
  updated_at: null,
  ...overrides,
});

const esim = (overrides: Partial<LegacyEsimRow> = {}): LegacyEsimRow => ({
  id: 70,
  user_id: 7,
  provider_slug: " Stellar ",
  provider_plan_id: "plan-1",
  plan_name: "Japan 5GB",
  purchase_id: null,
  serial_number: null,
  provider_sim_id: "sim-9",
  iccid: "8985 2000 0000 0000 001",
  phone_number: null,
  qr_code: "LPA:1$smdp.example$MATCH-1",
  activation_deadline: null,
  expiry_date: new Date("2026-12-01T00:00:00Z"),
  profile_status: "INSTALLED",
  remark: null,
  info: JSON.stringify({ order_num: "B2025" }),
  status: 1,
  created_at: new Date("2026-06-01T00:00:00Z"),
  ...overrides,
});

describe("decimalToMinor", () => {
  it("turns the old 8-decimal balances into cents, half up, without floats", () => {
    assert.equal(decimalToMinor("12.34500000"), 1235);
    assert.equal(decimalToMinor("12.34499999"), 1234);
    assert.equal(decimalToMinor("0.00000000"), 0);
    assert.equal(decimalToMinor("1000"), 100_000);
    assert.equal(decimalToMinor("0.1"), 10);
    assert.throws(() => decimalToMinor("-1"), /Invalid/);
  });
});

describe("migrateUser", () => {
  it("keeps the bcrypt hash and tidies the rest", () => {
    const migrated = migrateUser(user(), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.email, "ada@example.test");
    assert.equal(migrated.passwordHash, HASH);
    assert.equal(migrated.name, "Ada Lovelace");
    assert.equal(migrated.phone, "+447700900123");
    assert.equal(migrated.status, "active");
    assert.equal(migrated.balanceMinor, 1235);
    assert.equal(migrated.refByLegacyId, 3);
    assert.equal(migrated.address.country, "GB");
  });

  it("leaves out unverified emails, bad emails and passwords that are not bcrypt", () => {
    assert.equal(migrateUser(user({ ev: 0 }), now), "user.unverified");
    assert.equal(migrateUser(user({ email: "not-an-email" }), now), "user.bad-email");
    assert.equal(migrateUser(user({ password: "plain" }), now), "user.bad-password");
  });

  it("bans every status but 1, and falls back for names and phones", () => {
    const banned = migrateUser(user({ status: 0, firstname: null, lastname: null, username: null, mobile: null, ref_by: 0 }), now);
    assert.ok(typeof banned === "object");
    assert.equal(banned.status, "banned");
    assert.equal(banned.name, "ada");
    assert.equal(banned.phone, null);
    assert.equal(banned.refByLegacyId, null);
    const prefixed = migrateUser(user({ mobile: "447700900123" }), now);
    assert.equal(typeof prefixed === "object" && prefixed.phone, "+447700900123", "a number that already has its dial code");
  });
});

describe("migrateEsim", () => {
  it("maps an active eSIM onto the supplier's plan id and its install details", () => {
    const migrated = migrateEsim(esim(), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.providerCode, "stellar");
    assert.equal(migrated.providerPlanId, "plan-1");
    assert.equal(migrated.iccid, "8985200000000000001");
    assert.equal(migrated.simId, "sim-9");
    assert.equal(migrated.providerOrderId, "B2025", "from info when the order line has none");
    assert.equal(migrated.smdpAddress, "smdp.example");
    assert.equal(migrated.matchingId, "MATCH-1");
    assert.equal(migrated.profileStatus, "installed");
  });

  it("leaves out cancelled, expired, unidentified and planless eSIMs", () => {
    assert.equal(migrateEsim(esim({ status: 3 }), now), "esim.not-active");
    assert.equal(migrateEsim(esim({ expiry_date: new Date("2026-01-01T00:00:00Z") }), now), "esim.not-active");
    assert.equal(migrateEsim(esim({ iccid: null }), now), "esim.no-iccid");
    assert.equal(migrateEsim(esim({ provider_slug: null }), now), "esim.no-provider");
    const lostPlan = migrateEsim(esim({ provider_plan_id: null }), now);
    assert.ok(typeof lostPlan === "object" && lostPlan.providerPlanId === null, "a lost plan goes to a stand-in plan, not skipped");
    assert.ok(typeof migrateEsim(esim({ expiry_date: null }), now) === "object", "no expiry is still active");
  });

  it("parses only real LPA codes", () => {
    assert.deepEqual(parseLpa("LPA:1$a.b$C"), { smdpAddress: "a.b", matchingId: "C" });
    assert.deepEqual(parseLpa("https://qr.example/1.png"), { smdpAddress: null, matchingId: null });
  });
});

describe("migrateNumber", () => {
  const number = (overrides: Partial<LegacyNumberRow> = {}): LegacyNumberRow => ({
    id: 5,
    iccid: "8937204017171234567",
    msisdn: "55501234",
    dial_country_code: "+372",
    lpa: "LPA:1$smdp.example$ABC-1",
    pin1: "1234",
    puk1: "12345678",
    pin2: null,
    puk2: "x",
    price: "12.50000000",
    premium_price: "0.00000000",
    status: 0,
    user_id: null,
    sold_at: null,
    created_at: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  });

  it("keeps unsold stock for sale with its install details", () => {
    const migrated = migrateNumber(number(), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.msisdn, "37255501234");
    assert.equal(migrated.dialCode, "372");
    assert.equal(migrated.priceMinor, 1250);
    assert.equal(migrated.sold, false);
    assert.equal(migrated.userLegacyId, null);
    assert.equal(migrated.puk2, null, "not a PIN code");
  });

  it("gives sold numbers to their buyer and accepts an LPA without its prefix", () => {
    const migrated = migrateNumber(number({ status: 1, user_id: 7, msisdn: "37255501234", lpa: "smdp.example$ABC-1" }), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.msisdn, "37255501234", "the code is not added twice");
    assert.equal(migrated.lpa, "LPA:1$smdp.example$ABC-1");
    assert.equal(migrated.userLegacyId, 7);
    assert.ok(migrated.soldAt instanceof Date);
  });

  it("leaves out rows it cannot install", () => {
    assert.equal(migrateNumber(number({ iccid: "12" }), now), "number.no-iccid");
    assert.equal(migrateNumber(number({ msisdn: null, dial_country_code: null }), now), "number.no-msisdn");
    assert.equal(migrateNumber(number({ lpa: "" }), now), "number.no-lpa");
  });
});

describe("legacy columns that are not text", () => {
  it("reads numbers and buffers MySQL hands back as text", () => {
    const migrated = migrateUser(user({ zip: 10115 as unknown as string, city: Buffer.from(" Berlin ") as unknown as string, state: 0 as unknown as string }), now);
    assert.equal(typeof migrated, "object");
    const address = JSON.stringify(migrated);
    assert.match(address, /"postalCode":"10115"/);
    assert.match(address, /"city":"Berlin"/);
  });
});
