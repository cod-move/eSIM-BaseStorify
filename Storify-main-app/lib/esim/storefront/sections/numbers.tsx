import { ArrowRight, Phone, Sparkles } from "lucide-react";
import Link from "@/components/language/link";
import { translator } from "@/lib/esim/i18n/server";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText, SectionDefinition, SectionRenderContext } from "@/lib/storefront/sections/types";
import { numbersTeaser } from "@/lib/esim/numbers/storefront";
import { formatAmount } from "@/lib/esim/numbers/line";

/**
 * "eSIM: phone numbers" (NUM-03): a slim entry to the numbers page for the
 * home page — no picture, one row on a computer: what it is, a few numbers on
 * sale with the starting price, and a button. Reads the stock live and draws
 * nothing while no number is on sale.
 */

const text = (value: unknown, ctx: SectionRenderContext) => lt(value as LocalizedText, ctx.locale, ctx.defaultLanguage);
const grouped = (digits: string) => digits.replace(/(\d{3,4})(?=(\d{4})+$)/g, "$1 ");

export const esimNumbersEntry: SectionDefinition = {
  type: "esim-numbers-entry",
  version: 1,
  category: "products",
  fields: [
    { key: "title", type: "text", translatable: true, default: "Need a phone number?" },
    { key: "subtitle", type: "text", translatable: true, default: "A real mobile number on an eSIM: calls, texts and data." },
    { key: "buttonLabel", type: "text", translatable: true, default: "Choose a number", width: "half" },
    { key: "sampleCount", type: "number", default: 3, min: 0, max: 6, width: "half" },
    { key: "showPrice", type: "toggle", default: true },
  ],
  async Render({ settings, ctx }) {
    const sampleCount = Math.min(6, Math.max(0, Number(settings.sampleCount ?? 3)));
    const teaser = await numbersTeaser(sampleCount);
    if (!teaser) return null;
    const tr = await translator(ctx.locale);
    return (
      <section className="py-3 lg:py-5">
        <div className="container mx-auto px-4">
          <Link
            href="/esim/numbers"
            className="group flex flex-col gap-3 rounded-2xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 transition hover:border-primary/40 hover:shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:px-6"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Phone className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{text(settings.title, ctx)}</div>
                <div className="text-sm text-muted-foreground">{text(settings.subtitle, ctx)}</div>
              </div>
            </div>
            {teaser.samples.length ? (
              // Wide screens only: on narrower ones they would push the text onto several lines.
              <div className="hidden shrink-0 gap-2 xl:flex">
                {teaser.samples.map((sample) => (
                  <span key={`${sample.dialCode}${sample.nationalNumber}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-3 py-1 font-mono text-xs">
                    {sample.premium ? <Sparkles className="h-3 w-3 text-amber-500" /> : null}+{sample.dialCode} {grouped(sample.nationalNumber)}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              {settings.showPrice !== false ? (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {tr("esim.numbers.entryFrom", "{count} numbers · from {price}", { count: teaser.count, price: formatAmount(teaser.fromMinor, teaser.currency) })}
                </span>
              ) : null}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition group-hover:gap-2">
                {text(settings.buttonLabel, ctx)}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </span>
            </div>
          </Link>
        </div>
      </section>
    );
  },
};
