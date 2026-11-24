import { Fragment, type ReactNode } from "react";
import Link from "@/components/language/link";
import { SCOPE_NAMES_SHOWN, type CouponScope, type ScopeItem } from "@/lib/esim/account/coupon-scope-words";

/**
 * A coupon's products on My coupons: "Only for: Japan eSIM, Thailand eSIM"
 * with each name linking to its page. `onlyFor` / `notFor` are the raw
 * messages ("Only for: {items}"), `more` is "{count} more" already filled.
 */
export function CouponScopeLines({
  scope,
  locale,
  onlyFor,
  notFor,
  more,
}: {
  scope: CouponScope;
  locale: string;
  onlyFor: string;
  notFor: string;
  more: (count: number) => string;
}) {
  return (
    <>
      {scope.only.length ? <Line template={onlyFor} items={scope.only} locale={locale} more={more} /> : null}
      {scope.notFor.length ? <Line template={notFor} items={scope.notFor} locale={locale} more={more} /> : null}
    </>
  );
}

function Line({ template, items, locale, more }: { template: string; items: ScopeItem[]; locale: string; more: (count: number) => string }) {
  const [before, after = ""] = template.split("{items}");
  return (
    <li>
      {before}
      <NameList items={items} locale={locale} more={more} />
      {after}
    </li>
  );
}

function NameList({ items, locale, more }: { items: ScopeItem[]; locale: string; more: (count: number) => string }) {
  const shown = items.slice(0, SCOPE_NAMES_SHOWN);
  const rest = items.length - shown.length;
  const nodes: ReactNode[] = shown.map((item) =>
    item.href ? (
      <Link key={item.name} href={item.href} className="font-medium text-foreground underline-offset-2 hover:underline">
        {item.name}
      </Link>
    ) : (
      <span key={item.name} className="font-medium text-foreground">
        {item.name}
      </span>
    ),
  );
  if (rest > 0) nodes.push(more(rest));
  // The locale's own separators ("A, B and C", "A、B和C"), with the names as nodes.
  let parts: Array<{ type: string; value: string }>;
  try {
    parts = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(nodes.map((_, index) => `\u0000${index}\u0000`));
  } catch {
    parts = nodes.flatMap((_, index) => (index ? [{ type: "literal", value: ", " }] : []).concat({ type: "element", value: `\u0000${index}\u0000` }));
  }
  return (
    <>
      {parts.map((part, index) => {
        const match = part.type === "element" ? /^\u0000(\d+)\u0000$/.exec(part.value) : null;
        return <Fragment key={index}>{match ? nodes[Number(match[1])] : part.value}</Fragment>;
      })}
    </>
  );
}
