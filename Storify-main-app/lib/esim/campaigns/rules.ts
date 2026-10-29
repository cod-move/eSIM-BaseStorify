import * as z from "zod";

/**
 * eSIM campaigns (CAT-11, WEB-19): what an admin may save, where a campaign
 * stands on a date, and the price a code brings. Pure.
 */

export const CampaignInputSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens").max(60),
    name: z.string().trim().min(1).max(100),
    headline: z.string().trim().max(140).default(""),
    description: z.string().trim().max(1000).default(""),
    imageUrl: z.string().trim().url().max(500).nullable().default(null),
    seoTitle: z.string().trim().max(70).nullable().default(null),
    seoDescription: z.string().trim().max(320).nullable().default(null),
    destinations: z.array(z.string().trim().min(1).max(80)).min(1, "Choose at least one destination").max(200),
    discountPercent: z.number().int().min(1).max(90),
    couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "3–20 letters, digits, - or _"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: z.enum(["draft", "active"]),
  })
  .refine((input) => input.endsAt > input.startsAt, { message: "The campaign must end after it starts", path: ["endsAt"] });

export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export type CampaignState = "draft" | "scheduled" | "live" | "ended";

export function campaignState(campaign: { status: string; startsAt: Date; endsAt: Date }, now = new Date()): CampaignState {
  if (campaign.status !== "active") return "draft";
  if (now < campaign.startsAt) return "scheduled";
  if (now >= campaign.endsAt) return "ended";
  return "live";
}

/** The price with the campaign's code, as Storify's percentage coupon takes it off (to the cent, down). */
export function campaignPriceMinor(priceMinor: number, discountPercent: number): number {
  return priceMinor - Math.floor((priceMinor * discountPercent) / 100);
}

/** Of the live campaigns, the one to show for a destination: the biggest discount, then the soonest to end. */
export function campaignFor<T extends { destinations: string[]; discountPercent: number; endsAt: Date }>(
  campaigns: T[],
  destinationSlug?: string,
): T | null {
  const matching = destinationSlug ? campaigns.filter((campaign) => campaign.destinations.includes(destinationSlug)) : campaigns;
  return (
    [...matching].sort((a, b) => b.discountPercent - a.discountPercent || a.endsAt.getTime() - b.endsAt.getTime())[0] ?? null
  );
}
