import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decimalToMinor, migrateEsim, UNKNOWN_LEGACY_PLAN, migrateNumber, migrateUser, type LegacyEsimRow, type LegacyNumberRow, type LegacyUserRow } from "../legacy-rows";

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
    assert.equal(migrated.balanceMinor, 1235);
    assert.equal(migrated.refByLegacyId, 3);
    assert.equal(migrated.address.country, "GB");
  });

  it("leaves out unverified emails, bad emails and passwords that are not bcrypt", () => {
    assert.equal(migrateUser(user({ ev: 0 }), now), "user.unverified");
    assert.equal(migrateUser(user({ email: "not-an-email" }), now), "user.bad-email");
    assert.equal(migrateUser(user({ password: "plain" }), now), "user.bad-password");
  });

  it("leaves out banned users, and falls back for names and phones", () => {
    assert.equal(migrateUser(user({ status: 0 }), now), "user.banned");
    assert.equal(migrateUser(user({ status: 2 }), now), "user.banned");
    const bare = migrateUser(user({ firstname: null, lastname: null, username: null, mobile: null, ref_by: 0 }), now);
    assert.ok(typeof bare === "object");
    assert.equal(bare.name, "ada");
    assert.equal(bare.phone, null);
    assert.equal(bare.refByLegacyId, null);
    const prefixed = migrateUser(user({ mobile: "447700900123" }), now);
    assert.equal(typeof prefixed === "object" && prefixed.phone, "+447700900123", "a number that already has its dial code");
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

const esim = (overrides: Partial<LegacyEsimRow> = {}): LegacyEsimRow => ({
  id: 31,
  user_id: 7,
  iccid: "8985 2400 0000 1234 567",
  phone_number: null,
  qr_code: "LPA:1$rsp.esimaccess.com$ABC123",
  serial_number: null,
  provider_sim_id: null,
  info: JSON.stringify({ esimTranNo: "T-99", order_num: "R-5", license_cli: "L-1", order_id: "M-2", stellar_esim_id: "S-E" }),
  status: 1,
  profile_status: "IN_USE",
  expiry_date: new Date("2026-11-20T00:00:00Z"),
  activation_deadline: null,
  remark: " trip ",
  created_at: new Date("2026-10-01T00:00:00Z"),
  provider_slug: "esimaccess",
  provider_plan_id: "CKH491",
  order_number: "ORD123",
  ...overrides,
});

describe("legacy data eSIMs", () => {
  it("carries an eSIM still in use, with the supplier's own id", () => {
    const migrated = migrateEsim(esim(), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.providerCode, "esimaccess");
    assert.equal(migrated.providerPlanId, "CKH491");
    assert.equal(migrated.iccid, "8985240000001234567");
    assert.equal(migrated.providerEsimId, "T-99");
    assert.equal(migrated.activationCode, "LPA:1$rsp.esimaccess.com$ABC123");
    assert.equal(migrated.smdpAddress, "rsp.esimaccess.com");
    assert.equal(migrated.matchingId, "ABC123");
    assert.equal(migrated.orderNumber, "LEGACY-ORD123");
    assert.equal(migrated.remark, "trip");
    assert.equal(migrated.userLegacyId, 7);
  });

  it("leaves out what has ended", () => {
    assert.equal(migrateEsim(esim({ expiry_date: new Date("2026-10-26T00:00:00Z") }), now), "esim.expired");
    assert.equal(migrateEsim(esim({ expiry_date: null, activation_deadline: new Date("2026-10-01T00:00:00Z") }), now), "esim.expired");
    assert.equal(migrateEsim(esim({ profile_status: "USED_EXPIRED" }), now), "esim.expired");
    assert.equal(migrateEsim(esim({ profile_status: "REVOKED" }), now), "esim.expired");
    assert.equal(migrateEsim(esim({ status: 3 }), now), "esim.cancelled");
  });

  it("keeps one that has not started counting down", () => {
    const migrated = migrateEsim(esim({ expiry_date: null, profile_status: "GOT_RESOURCE" }), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.expiresAt, null);
  });

  it("only data eSIMs of the suppliers served here; number cards are the number import's", () => {
    assert.equal(migrateEsim(esim({ provider_slug: "topconnect" }), now), "esim.not-data");
    assert.equal(migrateEsim(esim({ provider_slug: "airalo" }), now), "esim.not-data");
  });

  it("keeps one without an ICCID that the supplier knows by another id", () => {
    const stellar = migrateEsim(esim({ provider_slug: "stellar", iccid: null, provider_sim_id: "SIM-9" }), now);
    assert.ok(typeof stellar === "object");
    assert.equal(stellar.iccid, null);
    assert.equal(stellar.simId, "SIM-9");
    const bad = migrateEsim(esim({ iccid: "123" }), now);
    assert.ok(typeof bad === "object");
    assert.equal(bad.iccid, null);
    assert.equal(bad.providerEsimId, "T-99");
    // bnesim's own id is its ICCID: without either, nothing to ask about.
    assert.equal(migrateEsim(esim({ provider_slug: "bnesim", iccid: null, info: "{}" }), now), "esim.no-id");
  });

  it("keeps one whose plan is gone", () => {
    const migrated = migrateEsim(esim({ provider_plan_id: null }), now);
    assert.ok(typeof migrated === "object");
    assert.equal(migrated.providerPlanId, UNKNOWN_LEGACY_PLAN);
    assert.equal(migrated.legacyPlan.name, "Old store plan");
  });

  it("reads the old plan's name, days and data", () => {
    const plan = (extra: Partial<LegacyEsimRow>) => {
      const migrated = migrateEsim(esim({ plan_name: "Japan 3GB 7 Days", plan_period: 7, ...extra }), now);
      assert.ok(typeof migrated === "object");
      return migrated.legacyPlan;
    };
    assert.deepEqual(plan({ plan_data_volume: String(3 * 1024 ** 3), plan_data_type: 1 }), {
      providerPlanId: "CKH491", name: "Japan 3GB 7 Days", validityDays: 7, megabytes: 3072, dataType: "total", label: "3 GB",
    });
    assert.equal(plan({ plan_data_volume: "-1" }).dataType, "unlimited");
    assert.equal(plan({ plan_data_volume: "-1" }).megabytes, 0);
    assert.equal(plan({ plan_data_volume: String(500 * 1024 ** 2), plan_data_type: 2 }).label, "500 MB");
    assert.equal(plan({ plan_data_volume: String(500 * 1024 ** 2), plan_data_type: 2 }).dataType, "daily_throttled");
    assert.equal(plan({ plan_data_volume: String(1024 ** 3), plan_traffic_type: "daypass_plan" }).dataType, "daily_cutoff");
  });

  it("finds each supplier's id where the old store kept it", () => {
    const of = (slug: string, extra: Partial<LegacyEsimRow> = {}) => {
      const migrated = migrateEsim(esim({ provider_slug: slug, ...extra }), now);
      assert.ok(typeof migrated === "object");
      return { providerEsimId: migrated.providerEsimId, simId: migrated.simId };
    };
    assert.deepEqual(of("stellar", { provider_sim_id: "SIM-1" }), { providerEsimId: "S-E", simId: "SIM-1" });
    assert.deepEqual(of("roamwifi"), { providerEsimId: "R-5", simId: null });
    assert.deepEqual(of("bnesim"), { providerEsimId: "8985240000001234567", simId: "L-1" });
    assert.deepEqual(of("mobimatter"), { providerEsimId: "M-2", simId: null });
  });

  it("reads a bare activation code and a QR address", () => {
    const bare = migrateEsim(esim({ qr_code: "smdp.example.com$XYZ" }), now);
    assert.ok(typeof bare === "object");
    assert.equal(bare.activationCode, "LPA:1$smdp.example.com$XYZ");
    const url = migrateEsim(esim({ qr_code: "https://example.com/qr.png" }), now);
    assert.ok(typeof url === "object");
    assert.equal(url.activationCode, null);
    assert.equal(url.qrCodeUrl, "https://example.com/qr.png");
  });
});
