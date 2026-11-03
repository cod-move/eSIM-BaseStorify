import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { NumberPicker } from "@/components/esim/number-picker";
import { translator } from "@/lib/esim/i18n/server";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { numberShop, type PremiumFilter, type ShopNumberFilters } from "@/lib/esim/numbers/storefront";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const PREMIUM: PremiumFilter[] = ["all", "standard", "premium"];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const tr = await translator(locale);
  const title = tr("esim.numbers.seoTitle", "Phone number eSIM");
  const description = tr("esim.numbers.seoDescription", "Choose a mobile number on an eSIM: calls, texts and data, with credit and a data package if you like.");
  return { title, description, openGraph: { title, description } };
}

/** The numbers page (NUM-03): anyone can browse; buying needs an account. */
export default async function EsimNumbersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const premium = one(query.premium);
  const filters: ShopNumberFilters = {
    dialCode: one(query.code),
    digits: one(query.digits),
    premium: PREMIUM.find((entry) => entry === premium) ?? "all",
    page: Number(one(query.page)) || 1,
  };
  const [tr, { storeDefault }, shop] = await Promise.all([translator(locale), getLocaleRouting(), numberShop(filters)]);

  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <StoreBreadcrumb
        className="mb-4"
        locale={locale}
        storeDefault={storeDefault}
        items={[{ label: tr("esim.browse.title", "eSIM destinations"), href: "/esim" }, { label: tr("esim.numbers.title", "Phone numbers") }]}
      />
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{tr("esim.numbers.title", "Phone numbers")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {tr("esim.numbers.description", "A real mobile number on an eSIM, for calls, texts and data. Pick a number, add credit and a data package if you like.")}
        </p>
      </div>
      <NumberPicker shop={shop} filters={filters} locale={locale} />
    </div>
  );
}
