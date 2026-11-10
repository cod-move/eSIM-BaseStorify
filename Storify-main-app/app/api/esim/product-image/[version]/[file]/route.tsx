import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { connectDB } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { getStoreFacts } from "@/lib/storefront/store-facts";
import { COVER_VERSION, coverFacts, nameFromSlug, type CoverPlan } from "@/lib/esim/catalog/cover";
import { coverImage } from "@/lib/esim/catalog/cover-image";

/**
 * GET /api/esim/product-image/v1/japan-esim.png — the cover of an eSIM
 * product that has no picture of its own (lib/esim/catalog/cover.ts): its
 * flags, its name and "eSIM" on the store's colour, 1000×1000.
 *
 * Public and cached: the product list, the app, emails and catalogue feeds
 * load it without a session.
 */

/** A flag file as a data URL the renderer can draw; null when it cannot be read. */
async function flagData(src: string, origin: string): Promise<string | null> {
  try {
    const svg = await readFile(path.join(process.cwd(), "public", src), "utf8");
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    try {
      const response = await fetch(`${origin}${src}`);
      if (!response.ok) return null;
      return `data:image/svg+xml;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
    } catch {
      return null;
    }
  }
}

export const GET = withApi<{ version: string; file: string }>(
  { auth: "optional", rateLimit: { action: "esim:product-image", preset: "lenient" } },
  async ({ request, params }) => {
    const productSlug = params.file.replace(/\.png$/, "");
    if (params.version !== COVER_VERSION || !/^[a-z0-9-]{1,120}$/.test(productSlug)) return new NextResponse(null, { status: 404 });

    await connectDB();
    const plans = await EsimPlan.find({ productSlug })
      .select({ destination: 1, emoji: 1, "coverage.scope": 1, "coverage.countries.code": 1 })
      .limit(200)
      .lean<CoverPlan[]>();
    if (!plans.length) return new NextResponse(null, { status: 404 });
    const facts = coverFacts(plans, nameFromSlug(productSlug));
    const store = await getStoreFacts().catch(() => null);
    const primary = /^#[0-9a-f]{3,8}$/i.test(store?.primaryColor ?? "") ? store!.primaryColor : "#2563eb";
    const origin = request.nextUrl.origin;
    const flags = (await Promise.all(facts.flags.map((src) => flagData(src, origin)))).filter((src): src is string => Boolean(src));

    return coverImage({
      facts,
      flags,
      primary,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" },
    });
  },
);
