import * as z from "zod";

/** A pricing change as the admin page sends it, for the preview and the save alike. */
export const RuleSchema = z.object({
  providerCode: z.string().max(40).nullable(),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).nullable(),
  scope: z.enum(["local", "regional", "global"]).nullable(),
  markupPercent: z.number().min(-100).max(1000),
  fixedMarkupMinor: z.number().int().min(0).max(1_000_000).default(0),
  priority: z.number().int().min(-1000).max(1000).default(0),
  enabled: z.boolean().default(true),
  note: z.string().max(200).optional(),
});

export const PricingChangeSchema = z.object({
  settings: z
    .object({
      fxBufferPercent: z.number().min(0).max(50),
      defaultMarkupPercent: z.number().min(-100).max(1000),
      minMarginPercent: z.number().min(0).max(500),
      rounding: z.enum(["none", "99", "49_99"]),
      repriceThresholdPercent: z.number().min(0).max(100),
    })
    .partial()
    .optional(),
  rule: z
    .object({
      id: z.string().max(40).optional(),
      values: RuleSchema.optional(),
      remove: z.boolean().optional(),
    })
    .optional(),
});
