/**
 * Notifications are stored in English — Storify's own (orders, store credit,
 * email verification, chat) and the eSIM module's (delivery, reminders, KYC,
 * balance, referrals). The account's notification list shows them in the
 * page's language by recognising each fixed English sentence and rendering
 * `esim.notices.title.*` / `esim.notices.message.*` instead (patch P37).
 * Rows stored before this, and rows whose text no pattern knows (a merchant's
 * broadcast, a chat preview), show as stored.
 *
 * Titles and messages are matched apart: "Order Pending" is the title both
 * of a new pending order and of a status change, while their messages differ.
 * When an English sentence here changes in the code that writes it, its
 * pattern must change too (`__tests__/localize.test.ts` holds the sentences).
 */

export interface NoticeTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

interface Text {
  title: string;
  message: string;
}

type Values = Record<string, string | number>;

interface Rule {
  re: RegExp;
  /** Builds the localized text from the match; null when this rule does not fit after all. */
  render: (m: RegExpMatchArray, t: Tr) => string | null;
}

/** Translates `esim.notices.<key>`; null when the locale has no such key. */
type Tr = (key: string, values?: Values) => string | null;

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** An eSIM reminder's date, written as `Date#toUTCString` without seconds. */
function dateIn(locale: string, text: string): string {
  const time = Date.parse(text.replace(/ UTC$/, " GMT"));
  if (Number.isNaN(time)) return text;
  return `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(time)} UTC`;
}

const KINDS: Record<string, string> = {
  eSIM: "esim",
  "top-up": "topup",
  number: "number",
  "number top-up": "numberTopup",
  item: "item",
};

const fixed = (re: RegExp, key: string): Rule => ({ re, render: (_m, t) => t(key) });

const TITLES: Rule[] = [
  fixed(/^Order Confirmed$/, "title.orderConfirmed"),
  fixed(/^Order Complete$/, "title.orderComplete"),
  ...ORDER_STATUSES.map((status) => fixed(new RegExp(`^Order ${capitalized(status)}$`), `title.order${capitalized(status)}`)),
  fixed(/^Part of your order could not be supplied$/, "title.itemsDropped"),
  fixed(/^Store credit added$/, "title.storeCredit"),
  fixed(/^Email verified$/, "title.emailVerified"),
  fixed(/^Verify your email$/, "title.verifyEmail"),
  fixed(/^Verification email delivery delayed$/, "title.verifyDelayed"),
  fixed(/^New chat reply$/, "title.chatReply"),
  { re: /^New message from (.+)$/, render: (m, t) => t("title.chatFrom", { name: m[1] }) },
  fixed(/^Your eSIM is ready$/, "title.esimReady"),
  fixed(/^Your eSIMs are ready$/, "title.esimsReady"),
  fixed(/^Your number is ready$/, "title.numberReady"),
  fixed(/^Your numbers are ready$/, "title.numbersReady"),
  fixed(/^Added to your number$/, "title.numberAdded"),
  fixed(/^Your top-up is on your eSIM$/, "title.topupDone"),
  {
    re: /^Order (\S+): (?:your eSIM|(your eSIMs)|(\d+) of your (\d+) eSIMs) will follow shortly$/,
    render: (m, t) =>
      m[3]
        ? t("title.delayedSome", { order: m[1], count: m[3], total: m[4] })
        : t(m[2] ? "title.delayedMany" : "title.delayedOne", { order: m[1] }),
  },
  { re: /^Refund for order (\S+)$/, render: (m, t) => t("title.refund", { order: m[1] }) },
  {
    re: /^Your (eSIM|top-up|number|number top-up|item) is delayed$/,
    render: (m, t) => {
      const kind = t(`kind.${KINDS[m[1]]}`);
      return kind === null ? null : t("title.kindDelayed", { kind });
    },
  },
  fixed(/^Your eSIM is connected$/, "title.connected"),
  fixed(/^Your eSIM is running low$/, "title.lowData"),
  fixed(/^Your eSIM plan ends soon$/, "title.endsSoon"),
  fixed(/^Install your eSIM soon$/, "title.installSoon"),
  fixed(/^Identity verified$/, "title.kycApproved"),
  fixed(/^Identity check not passed$/, "title.kycRejected"),
  fixed(/^Money added to your balance$/, "title.walletAdded"),
  fixed(/^Referral reward added$/, "title.referralAdded"),
];

/** Two sentences, the second optional: both must translate, or neither is used. */
function joined(first: string | null, second: string | null | undefined) {
  if (first === null || second === null) return null;
  if (!second) return first;
  // Chinese and Japanese run sentences on without a space.
  return /[。！？]$/.test(first) ? `${first}${second}` : `${first} ${second}`;
}

function messageRules(locale: string): Rule[] {
  return [
    { re: /^Your order #(\S+) has been placed and confirmed\.$/, render: (m, t) => t("message.orderConfirmed", { order: m[1] }) },
    { re: /^Your order #(\S+) has been placed and is now pending\.$/, render: (m, t) => t("message.orderPlacedPending", { order: m[1] }) },
    { re: /^Your POS order #(\S+) is complete\.$/, render: (m, t) => t("message.orderComplete", { order: m[1] }) },
    { re: /^Your order #(\S+) is now (pending|processing)\.$/, render: (m, t) => t(`message.order${capitalized(m[2])}`, { order: m[1] }) },
    { re: /^Your order #(\S+) has been shipped\.$/, render: (m, t) => t("message.orderShipped", { order: m[1] }) },
    {
      re: /^Your order #(\S+) has been delivered\. How was it\? Rate your items to help other shoppers\.$/,
      render: (m, t) => t("message.orderDelivered", { order: m[1] }),
    },
    { re: /^Your order #(\S+) has been cancelled\.$/, render: (m, t) => t("message.orderCancelled", { order: m[1] }) },
    { re: /^(\S+) in store credit was added to your account\.$/, render: (m, t) => t("message.storeCredit", { amount: m[1] }) },
    { re: /^Your email address has been verified successfully\.$/, render: (_m, t) => t("message.emailVerified") },
    { re: /^A verification link was sent to (\S+)\.$/, render: (m, t) => t("message.verifyEmail", { email: m[1] }) },
    {
      re: /^We could not deliver your verification email yet\. Please use resend shortly\.$/,
      render: (_m, t) => t("message.verifyDelayed"),
    },
    { re: /^Order (\S+): open it to install before you travel\.$/, render: (m, t) => t("message.esimReady", { order: m[1] }) },
    { re: /^Order (\S+): (.+)\. Open it to install\.$/, render: (m, t) => t("message.numberReady", { order: m[1], numbers: m[2] }) },
    {
      re: /^We are completing the rest of your order\. We will email the eSIM as soon as it is issued, or refund it\.$/,
      render: (_m, t) => t("message.delayed"),
    },
    {
      re: /^We could not (?:issue|complete) (?:your .+|(\d+) of your (\d+) .+); (\d+(?:\.\d+)? \w+) is back in your balance\.$/,
      render: (m, t) =>
        m[1]
          ? t("message.failedRefundedSome", { count: m[1], total: m[2], amount: m[3] })
          : t("message.failedRefundedAll", { amount: m[3] }),
    },
    {
      re: /^We could not (?:issue|complete) (?:your .+|(\d+) of your (\d+) .+) right away\. We will complete it or refund you shortly\.$/,
      render: (m, t) =>
        m[1] ? t("message.failedPendingSome", { count: m[1], total: m[2] }) : t("message.failedPendingAll"),
    },
    {
      re: /^(.+) is now in use\. Check your remaining data any time in My eSIMs\.$/,
      render: (m, t) => t("message.connected", { name: m[1] }),
    },
    {
      re: /^(.+) left on (.+?)\.( Add data so you stay connected\.)?$/,
      render: (m, t) => joined(t("message.lowData", { left: m[1], name: m[2] }), m[3] ? t("message.addData") : undefined),
    },
    {
      re: /^(.+) ends (\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2} UTC)\.( Top up to keep it going\.)?$/,
      render: (m, t) =>
        joined(t("message.endsOn", { name: m[1], date: dateIn(locale, m[2]) }), m[3] ? t("message.topUpToKeep") : undefined),
    },
    {
      re: /^(.+) must be installed before (\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2} UTC)\.$/,
      render: (m, t) => t("message.installBy", { name: m[1], date: dateIn(locale, m[2]) }),
    },
    {
      re: /^Your identity is verified\. You can now buy eSIMs that need it\.$/,
      render: (_m, t) => t("message.kycApproved"),
    },
    {
      re: /^We could not verify your identity: ([\s\S]*)\. You can send your details again\.$/,
      render: (m, t) => t("message.kycRejected", { reason: m[1] }),
    },
    { re: /^(\S+) was added to your balance\. Use it at checkout\.$/, render: (m, t) => t("message.walletAdded", { amount: m[1] }) },
    {
      re: /^(\S+) was added to your balance for an order by someone you invited\.$/,
      render: (m, t) => t("message.referralAdded", { amount: m[1] }),
    },
  ];
}

function localizeOne(text: string, rules: Rule[], tr: Tr): string {
  for (const rule of rules) {
    const match = text.match(rule.re);
    if (!match) continue;
    return rule.render(match, tr) ?? text;
  }
  return text;
}

/** The notification's title and message in the page's language, where known. */
export function localizeNotice(notice: Text, t: NoticeTranslator, locale: string): Text {
  const tr: Tr = (key, values) => {
    const full = `esim.notices.${key}`;
    return t.has(full) ? t(full, values) : null;
  };
  return {
    title: localizeOne(notice.title ?? "", TITLES, tr),
    message: localizeOne(notice.message ?? "", messageRules(locale), tr),
  };
}

/** "3 minutes ago" in the page's language. */
export function timeAgoIn(locale: string, date: Date, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "second");
}
