import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage, type EsimNumberPackageStatus } from "@/models/esim-number-package.model";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { repriceNumberPackages } from "@/lib/esim/pricing/reprice";
import { mergeSupplierPackets } from "@/lib/esim/numbers/packages";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { ProviderError } from "@/lib/esim/providers/types";
import { getEsimSettings } from "@/models/esim-pricing.model";

/**
 * Admin → eSIM → Number data packages (NUM-02): the price list a number
 * owner buys data from. A packet is added by hand or loaded from TopConnect
 * (its `getdiscount` list, asked for one of our numbers); either way it
 * starts hidden. Its selling price follows the pricing rules unless an admin
 * fixes it.
 */

export interface AdminNumberPackage {
  id: string;
  packetId: string;
  name: string;
  validityDays: number;
  volumeMb: number | null;
  incrementStepKb: number;
  costMinor: number;
  currency: string;
  /** The cost in USD cents at today's rate (no buffer); null without a rate. */
  costUsdMinor: number | null;
  countryCodes: string[];
  retailPriceMinor: number;
  retailPriceManual: boolean;
  status: EsimNumberPackageStatus;
  sortOrder: number;
}

export interface AdminNumberPackageList {
  rows: AdminNumberPackage[];
  /** USD per unit of each cost currency now; missing = no rate, so no automatic price. */
  rates: Record<string, number>;
  /** Whether TopConnect is set up and a number is in stock to ask its list for. */
  canLoad: boolean;
  /** The network code last used to load packages, to start from. */
  packetMccmnc: string | null;
}

export async function listNumberPackagesAdmin(): Promise<AdminNumberPackageList> {
  await connectDB();
  const [rows, provider, anyNumber, settings] = await Promise.all([
    EsimNumberPackage.find().sort({ sortOrder: 1, createdAt: 1 }).lean(),
    findProvider("topconnect"),
    EsimNumber.exists({}),
    getEsimSettings(),
  ]);
  const rates = await currentRates(rows.map((row) => row.cost.currency));
  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      packetId: row.packetId,
      name: row.name,
      validityDays: row.validityDays,
      volumeMb: row.volumeMb,
      incrementStepKb: row.incrementStepKb,
      costMinor: row.cost.amountMinor,
      currency: row.cost.currency,
      costUsdMinor: rates.has(row.cost.currency) ? Math.round(row.cost.amountMinor * rates.get(row.cost.currency)!.usdPerUnit) : null,
      countryCodes: row.countryCodes,
      retailPriceMinor: row.retailPriceMinor,
      retailPriceManual: row.retailPriceManual,
      status: row.status,
      sortOrder: row.sortOrder,
    })),
    rates: Object.fromEntries([...rates.values()].map((rate) => [rate.currency, rate.usdPerUnit])),
    canLoad: Boolean(provider && provider.status === "active" && anyNumber),
    packetMccmnc: settings.numbers?.packetMccmnc ?? null,
  };
}

export interface NumberPackageInput {
  packetId: string;
  name: string;
  validityDays: number;
  volumeMb: number | null;
  incrementStepKb: number;
  costMinor: number;
  currency: string;
  countryCodes: string[];
  /** null: priced by the rules. */
  retailPriceMinor: number | null;
  status: EsimNumberPackageStatus;
  sortOrder: number;
}

const snapshot = (row: { packetId: string; name: string; cost: unknown; retailPriceMinor: number; retailPriceManual: boolean; status: string; countryCodes: string[] }) => ({
  packetId: row.packetId,
  name: row.name,
  cost: row.cost,
  retailPriceMinor: row.retailPriceMinor,
  retailPriceManual: row.retailPriceManual,
  status: row.status,
  countryCodes: row.countryCodes,
});

/** Adds a packet (no id) or changes one; returns what it was and is, for the audit log. */
export async function saveNumberPackage(id: string | null, input: NumberPackageInput) {
  await connectDB();
  if (id && !mongoose.isValidObjectId(id)) throw new Error("Unknown data package");
  const doc = id ? await EsimNumberPackage.findById(id) : new EsimNumberPackage({ providerCode: "topconnect" });
  if (!doc) throw new Error("Unknown data package");
  const before = id ? snapshot(doc.toObject()) : null;
  const clash = await EsimNumberPackage.exists({ providerCode: "topconnect", packetId: input.packetId, _id: { $ne: doc._id } });
  if (clash) throw new Error(`Packet ${input.packetId} is already on the list`);
  doc.set({
    packetId: input.packetId,
    name: input.name,
    validityDays: input.validityDays,
    volumeMb: input.volumeMb,
    incrementStepKb: input.incrementStepKb,
    cost: { amountMinor: input.costMinor, currency: input.currency.toUpperCase() },
    countryCodes: [...new Set(input.countryCodes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))],
    retailPriceManual: input.retailPriceMinor !== null,
    ...(input.retailPriceMinor !== null ? { retailPriceMinor: input.retailPriceMinor, pricing: null } : {}),
    status: input.status,
    sortOrder: input.sortOrder,
  });
  await doc.save();
  if (input.retailPriceMinor === null) await repriceNumberPackages({ ids: [String(doc._id)] });
  const saved = await EsimNumberPackage.findById(doc._id).lean();
  if (input.status === "active" && saved && !saved.retailPriceManual && !saved.pricing) {
    // No rate for its currency yet: it would sell for nothing, so it stays off the list.
    await EsimNumberPackage.updateOne({ _id: doc._id }, { $set: { status: "hidden" } });
    throw new Error(`No exchange rate for ${saved.cost.currency}: set a price by hand or add the rate first`);
  }
  return { id: String(doc._id), packetId: input.packetId, before, after: saved ? snapshot(saved) : null };
}

export async function setNumberPackageStatus(id: string, status: EsimNumberPackageStatus) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) throw new Error("Unknown data package");
  const row = await EsimNumberPackage.findById(id).lean();
  if (!row) throw new Error("Unknown data package");
  if (status === "active" && !row.retailPriceManual && !row.pricing) {
    throw new Error(`No exchange rate for ${row.cost.currency}: set a price by hand or add the rate first`);
  }
  await EsimNumberPackage.updateOne({ _id: id }, { $set: { status } });
  return { packetId: row.packetId, name: row.name, before: row.status };
}

export async function deleteNumberPackage(id: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) throw new Error("Unknown data package");
  const row = await EsimNumberPackage.findByIdAndDelete(id).lean();
  if (!row) throw new Error("Unknown data package");
  return snapshot(row);
}

export interface PacketLoadReport {
  msisdn: string;
  added: string[];
  updated: string[];
  unchanged: number;
  skipped: number;
}

/**
 * Asks TopConnect which packets a card can take (`getdiscount`) and folds
 * them in: new ones are added hidden, known ones get TopConnect's current
 * cost, validity and volume (and so a new price). The card asked about is
 * the one named, else any number in stock. TopConnect lists the packets of
 * the network the card is on, so a stock card (on no network) needs the
 * network code (`mccmnc`); the one used is remembered for next time.
 */
export async function loadPacketsFromTopConnect(msisdn?: string, mccmnc?: string): Promise<PacketLoadReport> {
  await connectDB();
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") throw new Error("Set up and switch on the TopConnect supplier first");
  const number = msisdn ?? (await EsimNumber.findOne().sort({ status: -1, createdAt: 1 }).select({ msisdn: 1 }).lean())?.msisdn;
  if (!number) throw new Error("Import a number first: TopConnect lists packets for a card");

  const client = topConnectClient(credentialsOf(provider));
  const packets = await withProviderLog(
    { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", operation: "numbers.packets", request: { msisdn: number } },
    () => client.dataPackages(number, mccmnc ? { mccmnc } : {}),
  ).catch((error: unknown) => {
    if (error instanceof ProviderError && /mccmnc|sgsnip/i.test(error.message)) {
      throw new Error(
        mccmnc
          ? `TopConnect has no packages for network ${mccmnc} on +${number}: check the network code`
          : `+${number} is not on a network now, so TopConnect needs a network code: enter the MCC-MNC of the network the packages are for (e.g. 24801) and load again`,
      );
    }
    throw error;
  });
  if (mccmnc) await getEsimSettings().then((settings) => { settings.set("numbers.packetMccmnc", mccmnc); return settings.save(); });
  const stored = await EsimNumberPackage.find({ providerCode: "topconnect" }).select({ packetId: 1, cost: 1, validityDays: 1, volumeMb: 1 }).lean();
  const merge = mergeSupplierPackets(
    stored.map((row) => ({ id: String(row._id), packetId: row.packetId, cost: row.cost, validityDays: row.validityDays, volumeMb: row.volumeMb })),
    packets,
    provider.settlementCurrency,
  );

  const last = await EsimNumberPackage.findOne().sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean();
  let sortOrder = last?.sortOrder ?? 0;
  const created = merge.create.length
    ? await EsimNumberPackage.insertMany(
        merge.create.map((fields) => ({ ...fields, providerCode: "topconnect", status: "hidden", sortOrder: (sortOrder += 10) })),
        { ordered: false },
      )
    : [];
  if (merge.update.length) {
    await EsimNumberPackage.bulkWrite(merge.update.map((entry) => ({ updateOne: { filter: { _id: entry.id }, update: { $set: entry.set } } })));
  }
  const touched = [...created.map((row) => String(row._id)), ...merge.update.map((entry) => entry.id)];
  if (touched.length) await repriceNumberPackages({ ids: touched });
  return {
    msisdn: number,
    added: merge.create.map((fields) => fields.packetId),
    updated: merge.update.map((entry) => entry.packetId),
    unchanged: merge.unchanged,
    skipped: merge.skipped,
  };
}
