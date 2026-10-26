import "server-only";

import { connectDB } from "@/lib/db";
import { revalidateLocalizedPaths } from "@/lib/cache-invalidation";
import { buildLandingKey } from "@/lib/storefront/pages/handles";
import { buildPublishState } from "@/lib/storefront/pages/lifecycle";
import { prepareSectionsForWrite } from "@/lib/storefront/sections/write";
import type { SectionInstance } from "@/lib/storefront/sections/types";
import { INSTALL_GUIDE_STEPS } from "@/lib/esim/storefront/sections/guides";
import { buildStorePageIdentity, StorePage } from "@/models/store-page.model";

/**
 * The eSIM help pages (WEB-35): "Does my phone support eSIM?" and "How to
 * install", as ordinary landing pages built from the eSIM blocks — the admin
 * edits them in the page builder like any other page afterwards. Created
 * once; a page that already exists under the handle is never touched.
 */

function section(page: string, n: number, type: string, settings: Record<string, unknown> = {}, blocks?: Array<{ type: string; settings?: Record<string, unknown> }>): SectionInstance {
  return {
    id: `esim-help-${page}-${n}`,
    type,
    version: 1,
    visible: true,
    settings,
    ...(blocks
      ? { blocks: blocks.map((block, index) => ({ id: `esim-help-${page}-${n}-${index + 1}`, type: block.type, visible: true, settings: block.settings ?? {} })) }
      : {}),
  };
}

const faq = (items: Array<[string, string]>) => items.map(([question, answer]) => ({ type: "item", settings: { question, answer } }));

export const HELP_PAGES: Array<{ handle: string; title: string; sections: SectionInstance[] }> = [
  {
    handle: "esim-compatibility",
    title: "Does my phone support eSIM?",
    sections: [
      section("compat", 1, "esim-device-check"),
      section("compat", 2, "faq", { title: "About compatibility" }, faq([
        ["My phone is on the list. Will it work?", "Most likely. The phone must also be carrier-unlocked, and some models sold in mainland China, Hong Kong and Macao take two physical SIMs instead of an eSIM."],
        ["How do I know if my phone is unlocked?", "Ask your carrier, or look in the phone's settings: on iPhone, Settings → General → About shows \"No SIM restrictions\" when it is unlocked."],
        ["My phone is not on the list.", "It may still support eSIM. On iPhone look for \"Digital SIM\" or \"Available SIM\" under Settings → General → About; on Android dial *#06# and look for an EID."],
      ])),
    ],
  },
  {
    handle: "esim-install",
    title: "How to install your eSIM",
    sections: [
      section("install", 1, "esim-install-guide", {}, INSTALL_GUIDE_STEPS),
      section("install", 2, "esim-steps", {}, [
        { type: "step", settings: { icon: "cart", heading: "Pick a plan", text: "Choose your destination, days and data. Pay securely." } },
        { type: "step", settings: { icon: "qr", heading: "Scan to install", text: "We email your QR code at once. Scan it, or tap the one-tap link." } },
        { type: "step", settings: { icon: "wifi", heading: "Land and connect", text: "Turn on the eSIM when you arrive. No roaming bills." } },
      ]),
      section("install", 3, "faq", { title: "Installing" }, faq([
        ["When should I install it?", "Before you travel, while you have Wi-Fi. Most plans start counting only when they first connect at your destination."],
        ["Can I install the QR code twice?", "Usually not: a QR code can be installed once. Keep the eSIM on your phone; turn it off when you do not need it."],
        ["I installed it but have no data.", "On arrival, choose the travel eSIM for mobile data and turn on data roaming for it. Your plan's details are in My eSIMs."],
      ])),
    ],
  },
];

export async function helpPagesState() {
  await connectDB();
  const pages = await StorePage.find({ key: { $in: HELP_PAGES.map((page) => buildLandingKey(page.handle)) } })
    .select({ key: 1, published: 1 })
    .lean();
  return HELP_PAGES.map((page) => {
    const doc = pages.find((entry) => entry.key === buildLandingKey(page.handle));
    return { handle: page.handle, title: page.title, exists: Boolean(doc), published: Boolean(doc?.published) };
  });
}

/** Creates (and publishes) the help pages that do not exist yet. */
export async function createHelpPages(actorId: string) {
  await connectDB();
  const created: string[] = [];
  for (const page of HELP_PAGES) {
    const key = buildLandingKey(page.handle);
    const sections = prepareSectionsForWrite(page.sections, {});
    const now = new Date();
    const result = await StorePage.updateOne(
      { key },
      {
        $setOnInsert: {
          ...buildStorePageIdentity(key),
          title: page.title,
          draft: { sections, updatedAt: now, updatedBy: actorId },
          published: null,
          history: [],
        },
      },
      { upsert: true },
    );
    if (!result.upsertedCount) continue;
    const state = buildPublishState(sections, null, [], actorId, now);
    await StorePage.updateOne({ key }, { $set: { published: state.published, history: state.history } });
    created.push(page.handle);
  }
  if (created.length) {
    try {
      revalidateLocalizedPaths(created.map((handle) => `/pages/${handle}`));
    } catch {
      // Outside a request.
    }
  }
  return { created };
}
