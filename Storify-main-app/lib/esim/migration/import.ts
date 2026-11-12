import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimLegacyLink, type LegacyLinkKind } from "@/models/esim-legacy.model";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimReferral } from "@/models/esim-referral.model";
import { LEDGER_ACCOUNT, LEDGER_BOOK } from "@/lib/finance/accounts";
import { postLedgerEntries, postingKey } from "@/lib/finance/ledger";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { migrateEsim, migrateNumber, migrateUser, type MigratedUser, type SkipReason } from "./legacy-rows";
import type { LegacySnapshot } from "./legacy-source";
import { phoneNumber } from "@/lib/esim/numbers/import";

/**
 * Writes the old store's users, balances, referrals and number cards here
 * (MIG), or — without `apply` — only counts what it would do.
 *
 * Every row is linked to what it became (`EsimLegacyLink`), so a second run
 * finds the links and changes nothing, and a run that stopped half way is
 * finished by the next one. Old orders and payments are not imported.
 *
 *  - user: only email-verified accounts that are not banned. Created with the
 *    old bcrypt hash (patch P16 upgrades it at first sign-in), or linked to
 *    the account that already has the email — whose password is then left
 *    alone.
 *  - balance: store credit (source wallet_topup, which posts nothing by
 *    itself) and one ledger entry, debit opening balance equity / credit
 *    store-credit payable (patch P20): owed to the shopper, never paid in here.
 *  - referral: the old "referred by", where both are imported and the
 *    shopper has none here yet.
 *  - number: every number card in the old stock (`inventory_esims`).
 *    Unsold ones stay for sale; sold ones belong to their buyer, or are
 *    retired when the buyer was not imported.
 *  - esim: data eSIMs still in use (lib/esim/migration/legacy-rows.ts
 *    migrateEsim), of imported shoppers, on a plan the catalogue here has.
 *    Issued as they are, under "LEGACY-<old order number>" and no order
 *    here; the usage sync then brings what is left from the supplier.
 */

export interface ImportOptions {
  apply: boolean;
  now?: Date;
  currency?: string;
  referralValidityDays?: number;
  ensureReferralCode?: (userId: string) => Promise<string>;
  ensureCustomerProfile?: (userId: string) => Promise<unknown>;
  issueBalance?: (input: { customerId: string; amountMinor: number; currency: string; legacyId: number }) => Promise<{ _id: mongoose.Types.ObjectId }>;
}

export interface ImportResult {
  report: Record<string, number>;
  skipped: Record<string, number>;
}

type Id = mongoose.Types.ObjectId;

function counter() {
  const counts: Record<string, number> = {};
  return {
    counts,
    add: (key: string, by = 1) => {
      counts[key] = (counts[key] ?? 0) + by;
    },
  };
}

async function linksOf(kind: LegacyLinkKind) {
  const rows = await EsimLegacyLink.find({ kind }).select("legacyId targetId").lean();
  return new Map(rows.map((row) => [row.legacyId, row.targetId as Id]));
}

async function link(kind: LegacyLinkKind, legacyId: number, targetId: unknown, existing = false, session?: mongoose.ClientSession) {
  await EsimLegacyLink.updateOne(
    { kind, legacyId },
    { $setOnInsert: { kind, legacyId, targetId, existing, createdAt: new Date() } },
    { upsert: true, session },
  );
}

const isSkip = (value: unknown): value is SkipReason => typeof value === "string";

export async function runLegacyImport(snapshot: LegacySnapshot, options: ImportOptions): Promise<ImportResult> {
  await connectDB();
  const now = options.now ?? new Date();
  const currency = (options.currency ?? "USD").toUpperCase();
  const report = counter();
  const skipped = counter();

  // 1. Users.
  const users: MigratedUser[] = [];
  for (const row of snapshot.users) {
    const migrated = migrateUser(row, now);
    if (isSkip(migrated)) skipped.add(migrated);
    else users.push(migrated);
  }
  const userLinks = await linksOf("user");
  const userIds = new Map<number, Id>(userLinks);
  const byEmail = new Map(
    (await User.find({ email: { $in: users.filter((user) => !userLinks.has(user.legacyId)).map((user) => user.email) } }).select("_id email").lean<Array<{ _id: Id; email: string }>>()).map((row) => [row.email, row._id]),
  );
  for (const user of users) {
    if (userLinks.has(user.legacyId)) {
      report.add("users.already");
      continue;
    }
    const found = byEmail.get(user.email);
    if (found) {
      report.add("users.matched");
      if (options.apply) await link("user", user.legacyId, found, true);
      userIds.set(user.legacyId, found);
      continue;
    }
    report.add("users.new");
    const userId = new mongoose.Types.ObjectId();
    if (!options.apply) {
      // A stand-in, so a check counts what follows (referrals between new shoppers) as an import would.
      userIds.set(user.legacyId, userId);
      continue;
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await User.collection.insertOne(
          {
            _id: userId,
            name: user.name,
            email: user.email,
            emailVerified: true,
            emailVerifiedAt: user.updatedAt,
            role: "customer",
            roles: ["customer"],
            status: "active",
            twoFactorEnabled: false,
            ...(user.phone ? { phone: user.phone } : {}),
            ...(user.address.street && user.address.city && user.address.country
              ? {
                  addresses: [
                    {
                      _id: new mongoose.Types.ObjectId(),
                      fullName: user.name,
                      street: user.address.street,
                      city: user.address.city,
                      state: user.address.state ?? "",
                      postalCode: user.address.postalCode ?? "",
                      country: user.address.country,
                      phone: user.phone ?? undefined,
                      isDefault: true,
                    },
                  ],
                }
              : {}),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          { session },
        );
        await mongoose.connection.db!.collection("account").insertOne(
          { accountId: String(userId), providerId: "credential", userId, password: user.passwordHash, createdAt: now, updatedAt: now },
          { session },
        );
        await link("user", user.legacyId, userId, false, session);
      });
    } finally {
      await session.endSession();
    }
    userIds.set(user.legacyId, userId);
    await options.ensureCustomerProfile?.(String(userId)).catch((error) => console.error("Customer profile for an imported user failed:", error));
  }

  // 2. Balances.
  const balanceLinks = await linksOf("balance");
  for (const user of users) {
    if (user.balanceMinor <= 0) continue;
    if (balanceLinks.has(user.legacyId)) {
      report.add("balances.already");
      continue;
    }
    report.add("balances.new");
    report.add("balances.totalMinor", user.balanceMinor);
    const customerId = userIds.get(user.legacyId);
    if (!options.apply || !customerId) continue;
    if (!options.issueBalance) throw new Error("issueBalance is required to apply balances");
    const lot = await options.issueBalance({ customerId: String(customerId), amountMinor: user.balanceMinor, currency, legacyId: user.legacyId });
    await postLedgerEntries(
      [
        {
          date: now,
          book: LEDGER_BOOK.OWN,
          debit: LEDGER_ACCOUNT.OPENING_BALANCE_EQUITY,
          credit: LEDGER_ACCOUNT.STORE_CREDIT_PAYABLE,
          amount: user.balanceMinor / 100,
          currency,
          source: { kind: "store_credit", id: lot._id, ref: `legacy-user-${user.legacyId}` },
          key: postingKey("store_credit", lot._id, "legacy-opening-balance"),
          note: "Balance carried over from the old store",
        },
      ],
      { strict: true },
    );
    await link("balance", user.legacyId, lot._id);
  }

  // 3. Referrals: "referred by" where both are here and the shopper has none yet.
  const referralLinks = await linksOf("referral");
  for (const user of users) {
    if (!user.refByLegacyId) continue;
    if (referralLinks.has(user.legacyId)) {
      report.add("referrals.already");
      continue;
    }
    const referee = userIds.get(user.legacyId);
    const referrer = userIds.get(user.refByLegacyId);
    if (!referrer || (referee && String(referee) === String(referrer))) {
      skipped.add("referral.no-referrer");
      continue;
    }
    if (referee && (await EsimReferral.exists({ referee }))) {
      skipped.add("referral.has-one");
      continue;
    }
    report.add("referrals.new");
    if (!options.apply || !referee || !options.ensureReferralCode) continue;
    const days = options.referralValidityDays ?? 0;
    const created = await EsimReferral.create({
      referrer,
      referee,
      code: await options.ensureReferralCode(String(referrer)),
      validUntil: days > 0 ? new Date(user.createdAt.getTime() + days * 86_400_000) : null,
      couponCode: null,
    });
    await link("referral", user.legacyId, created._id);
  }

  // 4. Number cards: the whole old stock.
  const numberLinks = await linksOf("number");
  for (const row of snapshot.numbers ?? []) {
    const number = migrateNumber(row, now);
    if (isSkip(number)) {
      skipped.add(number);
      continue;
    }
    if (numberLinks.has(number.legacyId)) {
      report.add("numbers.already");
      continue;
    }
    const existing = await EsimNumber.findOne({ $or: [{ iccid: number.iccid }, { msisdn: number.msisdn }] }).select("_id").lean();
    if (existing) {
      report.add("numbers.matched");
      if (options.apply) await link("number", number.legacyId, existing._id, true);
      continue;
    }
    const customer = number.userLegacyId ? (userIds.get(number.userLegacyId) ?? null) : null;
    // Sold to someone not imported (an unverified account): kept, but not for sale again.
    const status = !number.sold ? "available" : customer ? "sold" : "retired";
    report.add(`numbers.${status}`);
    if (!options.apply) continue;
    const parts = phoneNumber(number.msisdn, number.dialCode || undefined);
    const created = await EsimNumber.create({
      providerCode: "topconnect",
      msisdn: parts?.msisdn ?? number.msisdn,
      dialCode: parts?.dialCode ?? (number.dialCode || number.msisdn.slice(0, 3)),
      nationalNumber: parts?.nationalNumber ?? number.msisdn.slice((number.dialCode || number.msisdn.slice(0, 3)).length),
      country: parts?.country ?? null,
      iccid: number.iccid,
      install: { lpa: number.lpa, pin1: number.pin1, puk1: number.puk1, pin2: number.pin2, puk2: number.puk2 },
      priceMinor: number.priceMinor,
      premiumMinor: number.premiumMinor,
      status,
      customer,
      soldAt: number.soldAt,
      batch: "legacy",
      note: status === "retired" ? "Sold in the old store to an account that was not carried over" : null,
      legacyId: number.legacyId,
    });
    await link("number", number.legacyId, created._id);
  }

  // 5. Data eSIMs still in use, to their owner, on the plan they were bought on.
  const esimLinks = await linksOf("esim");
  const plans = new Map<string, { _id: Id; topup?: { supported?: boolean; window?: string } } | null>();
  for (const row of snapshot.esims ?? []) {
    const esim = migrateEsim(row, now);
    if (isSkip(esim)) {
      skipped.add(esim);
      continue;
    }
    if (esimLinks.has(esim.legacyId)) {
      report.add("esims.already");
      continue;
    }
    const customer = esim.userLegacyId ? (userIds.get(esim.userLegacyId) ?? null) : null;
    if (!customer) {
      skipped.add("esim.no-user");
      continue;
    }
    const planKey = `${esim.providerCode}:${esim.providerPlanId}`;
    if (!plans.has(planKey)) {
      plans.set(
        planKey,
        await EsimPlan.findOne({ providerCode: esim.providerCode, providerPlanId: esim.providerPlanId })
          .select({ _id: 1, topup: 1 })
          .lean<{ _id: Id; topup?: { supported?: boolean; window?: string } }>(),
      );
    }
    const plan = plans.get(planKey);
    if (!plan) {
      // The catalogue here has not got that plan (not synced, or the supplier dropped it): a later run takes it.
      skipped.add(`esim.plan-missing.${esim.providerCode}`);
      continue;
    }
    const existing = await EsimProfile.findOne({ iccid: esim.iccid }).select("_id").lean();
    if (existing) {
      report.add("esims.matched");
      if (options.apply) await link("esim", esim.legacyId, existing._id, true);
      continue;
    }
    report.add(`esims.new.${esim.providerCode}`);
    if (!options.apply) continue;
    const created = await EsimProfile.create({
      customer,
      email: null,
      // Old orders are not imported: the eSIM stands on its own, under the old order number.
      order: new mongoose.Types.ObjectId(),
      orderNumber: esim.orderNumber,
      lineIndex: 0,
      unit: 1,
      plan: plan._id,
      providerCode: esim.providerCode,
      providerOrderId: null,
      providerEsimId: esim.providerEsimId,
      simId: esim.simId,
      iccid: esim.iccid,
      status: "fulfilled",
      // The usage sync asks the supplier for what is left and the real dates.
      usageAvailable: true,
      installation: {
        activationCode: esim.activationCode,
        smdpAddress: esim.smdpAddress,
        matchingId: esim.matchingId,
        qrCodeUrl: esim.qrCodeUrl,
        apn: null,
      },
      fulfilledAt: esim.createdAt,
      expiresAt: esim.expiresAt,
      topupDeadline: plan.topup?.supported && plan.topup.window === "before_expiry" ? esim.expiresAt : null,
      activationDeadline: esim.activationDeadline,
      remark: esim.remark,
      raw: { legacyId: esim.legacyId },
    });
    await link("esim", esim.legacyId, created._id);
  }

  report.add("users.read", snapshot.users.length);
  report.add("numbers.read", snapshot.numbers?.length ?? 0);
  report.add("esims.read", snapshot.esims?.length ?? 0);
  return { report: report.counts, skipped: skipped.counts };
}
