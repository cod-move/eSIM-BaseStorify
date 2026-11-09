import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimLegacyLink, type LegacyLinkKind } from "@/models/esim-legacy.model";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimReferral } from "@/models/esim-referral.model";
import { LEDGER_ACCOUNT, LEDGER_BOOK } from "@/lib/finance/accounts";
import { postLedgerEntries, postingKey } from "@/lib/finance/ledger";
import { migrateEsim, migrateNumber, migrateUser, type MigratedEsim, type MigratedUser, type SkipReason } from "./legacy-rows";
import type { LegacySnapshot } from "./legacy-source";
import { phoneNumber } from "@/lib/esim/numbers/import";

/**
 * Writes the old store's users, balances, referrals and active eSIMs here
 * (MIG), or — without `apply` — only counts what it would do.
 *
 * Every row is linked to what it became (`EsimLegacyLink`), so a second run
 * finds the links and changes nothing, and a run that stopped half way is
 * finished by the next one. Old orders, payments and number cards are not
 * imported (number cards come with the number-card module).
 *
 *  - user: created with the old bcrypt hash (patch P16 upgrades it at first
 *    sign-in), or linked to the account that already has the email — whose
 *    password is then left alone.
 *  - balance: store credit (source wallet_topup, which posts nothing by
 *    itself) and one ledger entry, debit opening balance equity / credit
 *    store-credit payable (patch P20): owed to the shopper, never paid in here.
 *  - referral: the old "referred by", where the shopper has none here yet.
 *  - esim: an EsimProfile on the shopper's import order (one per shopper,
 *    zero value, paid and delivered, posting nothing), on the plan of the
 *    same supplier and supplier plan id. A plan the supplier no longer lists
 *    (or an order line that lost its plan) gets a stand-in plan, disabled and
 *    unavailable, named after the old plan — so an eSIM still in use is never
 *    left behind. Only a supplier not set up here leaves it out.
 *  - number: every number card in the old stock (`inventory_esims`).
 *    Unsold ones stay for sale; sold ones belong to their buyer, or are
 *    retired when the buyer was not imported.
 */

export interface ImportOptions {
  apply: boolean;
  now?: Date;
  currency?: string;
  /** Hidden product the import orders list eSIMs under; needed with `apply` and eSIMs. */
  product?: { productId: string; variantId: string } | null;
  vendorId?: string | null;
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
            status: user.status,
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

  // 4. eSIMs.
  const esimLinks = await linksOf("esim");
  const usersByLegacy = new Map(users.map((user) => [user.legacyId, user]));
  const pending: MigratedEsim[] = [];
  for (const row of snapshot.esims) {
    const esim = migrateEsim(row, now);
    if (isSkip(esim)) {
      skipped.add(esim);
      continue;
    }
    if (esimLinks.has(esim.legacyId)) {
      report.add("esims.already");
      continue;
    }
    if (!usersByLegacy.has(esim.userLegacyId)) {
      skipped.add("esim.no-user");
      continue;
    }
    pending.push(esim);
  }
  const planKey = (esim: MigratedEsim) => `${esim.providerCode} ${esim.providerPlanId ?? LEGACY_UNKNOWN_PLAN}`;
  const wanted = [...new Set(pending.map(planKey))];
  type PlanRow = { _id: Id; providerCode: string; providerPlanId: string; name?: string };
  const plans = new Map<string, PlanRow>(
    wanted.length
      ? (
          await EsimPlan.find({ $or: wanted.map((key) => ({ providerCode: key.split(" ")[0], providerPlanId: key.slice(key.indexOf(" ") + 1) })) })
            .select("_id providerCode providerPlanId name")
            .lean<PlanRow[]>()
        ).map((plan) => [`${plan.providerCode} ${plan.providerPlanId}`, plan])
      : [],
  );
  const providers = new Map(
    (await EsimProvider.find({ code: { $in: [...new Set(pending.map((esim) => esim.providerCode))] } }).select("_id code").lean<Array<{ _id: Id; code: string }>>()).map((row) => [row.code, row._id]),
  );
  const orderLinks = await linksOf("order");
  for (const esim of pending) {
    let plan = plans.get(planKey(esim));
    if (!plan) {
      const provider = providers.get(esim.providerCode);
      if (!provider) {
        skipped.add(`esim.no-provider:${esim.providerCode}`);
        continue;
      }
      report.add(`plans.stand-in:${esim.providerCode}`);
      if (options.apply) {
        plan = await standInPlan(provider, esim, now);
        plans.set(planKey(esim), plan);
      }
    }
    if (!plan) {
      // A check: the stand-in plan is not written, the eSIM counted as an import would.
      report.add((await EsimProfile.exists({ iccid: esim.iccid })) ? "esims.matched" : "esims.new");
      continue;
    }
    const existing = await EsimProfile.findOne({ iccid: esim.iccid }).select("_id").lean();
    if (existing) {
      report.add("esims.matched");
      if (options.apply) await link("esim", esim.legacyId, existing._id, true);
      continue;
    }
    report.add("esims.new");
    if (!options.apply) continue;
    const customer = userIds.get(esim.userLegacyId);
    const user = usersByLegacy.get(esim.userLegacyId)!;
    if (!customer) continue;
    if (!options.product) throw new Error("The migrated-eSIM product is required to apply eSIMs");

    // The shopper's import order, made once; each eSIM is a line on it.
    const orderNumber = `MIG-${esim.userLegacyId}`;
    let orderId = orderLinks.get(esim.userLegacyId);
    if (!orderId) {
      // Written by a run that stopped before linking it.
      const written = await Order.collection.findOne({ orderNumber }, { projection: { _id: 1 } });
      if (written) {
        orderId = written._id as Id;
        await link("order", esim.userLegacyId, orderId);
        orderLinks.set(esim.userLegacyId, orderId);
      }
    }
    const line = {
      _id: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(options.product.productId),
      variantId: new mongoose.Types.ObjectId(options.product.variantId),
      ...(options.vendorId ? { vendorId: new mongoose.Types.ObjectId(options.vendorId) } : {}),
      name: esim.planName || plan.name || "eSIM",
      sku: "ESIM-MIGRATED",
      price: 0,
      quantity: 1,
    };
    let lineIndex = 0;
    if (!orderId) {
      orderId = new mongoose.Types.ObjectId();
      await Order.collection.insertOne({
        _id: orderId,
        orderNumber,
        customerId: customer,
        status: "delivered",
        paymentStatus: "paid",
        paymentMethod: "migration",
        channel: "online",
        currency,
        subtotal: 0,
        discount: 0,
        tax: 0,
        shippingCost: 0,
        total: 0,
        digitalOnly: true,
        items: [line],
        ...(options.vendorId
          ? { subOrders: [{ _id: new mongoose.Types.ObjectId(), vendorId: new mongoose.Types.ObjectId(options.vendorId), status: "delivered", paymentStatus: "paid", subtotal: 0, items: [{ productId: line.productId, variantId: line.variantId, quantity: 1 }] }] }
          : {}),
        billingAddress: { fullName: user.name, street: user.address.street ?? "", city: user.address.city ?? "", state: user.address.state ?? "", postalCode: user.address.postalCode ?? "", country: user.address.country ?? "" },
        customerNote: "eSIMs carried over from the old store",
        paidAt: now,
        deliveredAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await link("order", esim.userLegacyId, orderId);
      orderLinks.set(esim.userLegacyId, orderId);
    } else {
      const updated = await Order.collection.findOneAndUpdate({ _id: orderId }, { $push: { items: line } as never, $set: { updatedAt: now } }, { returnDocument: "after", projection: { items: 1 } });
      lineIndex = ((updated?.items as unknown[] | undefined)?.length ?? 1) - 1;
    }
    report.add("orders.lines");

    const profile = await EsimProfile.create({
      customer,
      email: user.email,
      order: orderId,
      orderNumber,
      lineIndex,
      unit: 1,
      plan: plan._id,
      providerCode: esim.providerCode,
      providerOrderId: esim.providerOrderId,
      simId: esim.simId,
      iccid: esim.iccid,
      status: "fulfilled",
      usageAvailable: true,
      lifecycle: { profileStatus: esim.profileStatus },
      installation: { activationCode: esim.activationCode, smdpAddress: esim.smdpAddress, matchingId: esim.matchingId },
      fulfilledAt: esim.createdAt,
      expiresAt: esim.expiresAt,
      activationDeadline: esim.activationDeadline,
      remark: esim.remark,
      raw: { legacy: { esimId: esim.legacyId, userId: esim.userLegacyId } },
    });
    await link("esim", esim.legacyId, profile._id);
  }

  // 5. Number cards: the whole old stock.
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

  report.add("users.read", snapshot.users.length);
  report.add("esims.read", snapshot.esims.length);
  report.add("numbers.read", snapshot.numbers?.length ?? 0);
  return { report: report.counts, skipped: skipped.counts };
}

/** What a stand-in plan is called when the old order line lost its plan. */
const LEGACY_UNKNOWN_PLAN = "legacy-unknown";

/**
 * A plan for an eSIM whose plan the supplier no longer lists: disabled and
 * unavailable, so it is never sold, and found again by the next run. A later
 * catalogue sync that sees the plan again updates it in place.
 */
async function standInPlan(provider: Id, esim: MigratedEsim, now: Date) {
  const providerPlanId = esim.providerPlanId ?? LEGACY_UNKNOWN_PLAN;
  const name = esim.providerPlanId ? esim.planName || providerPlanId : "Old store plan";
  const row = await EsimPlan.findOneAndUpdate(
    { provider, providerPlanId },
    {
      $setOnInsert: {
        provider,
        providerCode: esim.providerCode,
        providerPlanId,
        name,
        slug: `legacy-${esim.providerCode}-${providerPlanId}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 120),
        productSlug: "legacy-plans",
        coverage: { scope: "global", countries: [], networks: [], breakoutIp: [] },
        data: { megabytes: 0, label: "", type: "total" },
        validityDays: 0,
        duration: { configurable: false, defaultDays: 0, minDays: 0, maxDays: 0 },
        cost: { currency: "USD", amountMinor: 0, billingUnit: "plan" },
        available: false,
        status: "disabled",
        syncedAt: now,
        contentHash: "legacy-stand-in",
      },
    },
    { upsert: true, returnDocument: "after", projection: { _id: 1, providerCode: 1, providerPlanId: 1, name: 1 } },
  ).lean<{ _id: Id; providerCode: string; providerPlanId: string; name?: string }>();
  return row!;
}
