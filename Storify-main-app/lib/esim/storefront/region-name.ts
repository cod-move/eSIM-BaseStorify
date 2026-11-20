/**
 * A regional or multi-country destination's name in another language (WEB-01),
 * read from the supplier's English name. Pure, no server imports.
 *
 * Supplier names follow a few shapes, each translated piece by piece:
 * - a region and a count: "Europe (35 countries)", "Caribbean (20+ areas)",
 *   "Asia 30", "Global (140 countries)";
 * - countries or regions joined: "China + Hong Kong + Macao", "Japan & Korea",
 *   "France,Germany,Italy & UK", "Middle East & North Africa",
 *   "Europe 40 & Middle East";
 * - a tag after it: "(Promo)", "(New)", "1GB/Day", "eSIM Unlimited".
 *
 * Regions are named as the Unicode CLDR names them (Intl.DisplayNames with UN
 * M.49 codes: "150" is Europe), a few CLDR has no code for (Global, Middle
 * East) from REGION_WORDS. A name with any piece not understood, or a
 * language without the words needed, is null: the caller shows the
 * supplier's English name rather than a half-translated one.
 */

/** English region names (as plainName reduces them) and their UN M.49 code, or a REGION_WORDS key. */
const REGIONS: Record<string, string | readonly string[]> = {
  global: "global",
  world: "global",
  worldwide: "global",
  africa: "002",
  america: "019",
  americas: "019",
  asia: "142",
  europe: "150",
  oceania: "009",
  caribbean: "029",
  "south america": "005",
  "north america": "003",
  "north and south america": ["003", "005"],
  "latin america": "419",
  "central america": "013",
  "west asia": "145",
  "western asia": "145",
  "north africa": "015",
  "northern africa": "015",
  "west africa": "011",
  "western africa": "011",
  "east africa": "014",
  "eastern africa": "014",
  "southern africa": "018",
  "southeast asia": "035",
  "south east asia": "035",
  "east asia": "030",
  "eastern asia": "030",
  "south asia": "034",
  "southern asia": "034",
  "central asia": "143",
  "eastern europe": "151",
  "western europe": "155",
  "northern europe": "154",
  nordic: "154",
  nordics: "154",
  scandinavia: "154",
  "southern europe": "039",
  eu: "EU",
  "european union": "EU",
  "middle east": "middleEast",
  mena: ["middleEast", "015"],
  "asia pacific": "asiaPacific",
  apac: "asiaPacific",
  balkans: "balkans",
};

/** Regions CLDR has no code for, by language. A language missing one leaves names with it in English. */
const REGION_WORDS: Record<string, Record<string, string>> = {
  global: {
    af: "Wêreldwyd", ar: "عالمي", bn: "বিশ্বব্যাপী", de: "Weltweit", es: "Global", fr: "Monde", ha: "Duniya", hi: "वैश्विक",
    ig: "Ụwa", ja: "グローバル", nl: "Wereldwijd", sw: "Dunia", tr: "Küresel", xh: "Ihlabathi", yo: "Àgbáyé", zh: "全球",
    "zh-hant": "全球", zu: "Umhlaba",
  },
  middleEast: {
    af: "Midde-Ooste", ar: "الشرق الأوسط", bn: "মধ্যপ্রাচ্য", de: "Naher Osten", es: "Oriente Medio", fr: "Moyen-Orient",
    ha: "Gabas ta Tsakiya", hi: "मध्य पूर्व", ja: "中東", nl: "Midden-Oosten", sw: "Mashariki ya Kati", tr: "Orta Doğu",
    yo: "Àárín Ìlà-Oòrùn", zh: "中东", "zh-hant": "中東",
  },
  asiaPacific: {
    af: "Asië-Stille Oseaan", ar: "آسيا والمحيط الهادئ", bn: "এশিয়া-প্রশান্ত মহাসাগরীয় অঞ্চল", de: "Asien-Pazifik", es: "Asia-Pacífico",
    fr: "Asie-Pacifique", hi: "एशिया-प्रशांत", ja: "アジア太平洋", nl: "Azië-Pacific", sw: "Asia-Pasifiki", tr: "Asya-Pasifik",
    zh: "亚太", "zh-hant": "亞太",
  },
  balkans: {
    af: "Balkan", ar: "البلقان", bn: "বলকান", de: "Balkan", es: "Balcanes", fr: "Balkans", hi: "बाल्कन", ja: "バルカン",
    nl: "Balkan", sw: "Balkani", tr: "Balkanlar", zh: "巴尔干", "zh-hant": "巴爾幹",
  },
};

/** "{name} (35 countries)" in each language; `count` is "35" or "20+". */
const WITH_COUNT: Record<string, (name: string, count: string, n: number) => string> = {
  af: (name, count) => `${name} (${count} lande)`,
  ar: (name, count, n) => `${name} (${count} ${n >= 3 && n <= 10 ? "دول" : "دولة"})`,
  bn: (name, count) => `${name} (${count}টি দেশ)`,
  de: (name, count) => `${name} (${count} Länder)`,
  es: (name, count) => `${name} (${count} países)`,
  fr: (name, count) => `${name} (${count} pays)`,
  ha: (name, count) => `${name} (ƙasashe ${count})`,
  hi: (name, count) => `${name} (${count} देश)`,
  ig: (name, count) => `${name} (mba ${count})`,
  ja: (name, count) => `${name}（${count}か国・地域）`,
  nl: (name, count) => `${name} (${count} landen)`,
  sw: (name, count) => `${name} (nchi ${count})`,
  tr: (name, count) => `${name} (${count} ülke)`,
  xh: (name, count) => `${name} (amazwe ${count})`,
  yo: (name, count) => `${name} (orílẹ̀-èdè ${count})`,
  zh: (name, count) => `${name}（${count} 个国家/地区）`,
  "zh-hant": (name, count) => `${name}（${count} 個國家/地區）`,
  zu: (name, count) => `${name} (amazwe ${count})`,
};

type Tag = { kind: "promo" | "new" | "unlimited" } | { kind: "daily"; amount: string };

/** Tags after a name, by language; a language without one shows the tag in English. */
const TAG_WORDS: Record<string, { promo: string; new: string; unlimited: string; daily: (amount: string) => string }> = {
  af: { promo: "Promosie", new: "Nuut", unlimited: "Onbeperk", daily: (a) => `${a}/dag` },
  ar: { promo: "عرض", new: "جديد", unlimited: "غير محدود", daily: (a) => `${a} يوميًا` },
  bn: { promo: "অফার", new: "নতুন", unlimited: "আনলিমিটেড", daily: (a) => `দৈনিক ${a}` },
  de: { promo: "Aktion", new: "Neu", unlimited: "Unbegrenzt", daily: (a) => `${a}/Tag` },
  es: { promo: "Promo", new: "Nuevo", unlimited: "Ilimitado", daily: (a) => `${a}/día` },
  fr: { promo: "Promo", new: "Nouveau", unlimited: "Illimité", daily: (a) => `${a}/jour` },
  hi: { promo: "ऑफ़र", new: "नया", unlimited: "अनलिमिटेड", daily: (a) => `${a}/दिन` },
  ja: { promo: "キャンペーン", new: "新着", unlimited: "無制限", daily: (a) => `1日${a}` },
  nl: { promo: "Actie", new: "Nieuw", unlimited: "Onbeperkt", daily: (a) => `${a}/dag` },
  sw: { promo: "Ofa", new: "Mpya", unlimited: "Bila kikomo", daily: (a) => `${a}/siku` },
  tr: { promo: "Kampanya", new: "Yeni", unlimited: "Sınırsız", daily: (a) => `Günlük ${a}` },
  zh: { promo: "特惠", new: "新", unlimited: "无限流量", daily: (a) => `每天 ${a}` },
  "zh-hant": { promo: "特惠", new: "新", unlimited: "無限流量", daily: (a) => `每天 ${a}` },
};

const SHORT_NAMED = new Set(["HK", "MO"]);

const ENGLISH_TAG ={ promo: "Promo", new: "New", unlimited: "Unlimited" } as const;

/** The store's language as the tables above key it: "zh-Hant", "zh-TW" and "zh-HK" are "zh-hant". */
function languageOf(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "zh-hant" || lower.startsWith("zh-hant-") || lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo") return "zh-hant";
  return lower.split("-")[0];
}

function displayName(locale: string, code: string, style: "long" | "short" = "long"): string | null {
  try {
    const name = new Intl.DisplayNames([locale], { type: "region", style, fallback: "none" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** A region word's name in `locale`, or null when the language has none. */
function regionIn(key: string, locale: string): string | null {
  if (/^(\d{3}|EU)$/.test(key)) {
    const name = displayName(locale, key);
    // CLDR writes some in lower case ("wêreld", "ihlabathi"); a name in a list starts with a capital.
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : null;
  }
  return REGION_WORDS[key]?.[languageOf(locale)] ?? null;
}

/** Same reduction as destination-name.ts's plainName (kept here so this file stands alone). */
function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bst\.?(?=\s)/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Country codes by their English names: Intl's, the supplier's own, and the other names suppliers use. */
let englishCountries: Map<string, string> | null = null;
function countryIndex(aliases: Record<string, readonly string[]>): Map<string, string> {
  if (englishCountries) return englishCountries;
  const index = new Map<string, string>();
  const english = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = english.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code) index.set(plain(name), code);
    }
  }
  for (const [code, names] of Object.entries(aliases)) for (const name of names) index.set(plain(name), code);
  englishCountries = index;
  return index;
}

const PLACES = String.raw`(?:countries\s*(?:\/|&|and)\s*regions|countries|country|areas|area|regions|region|destinations)`;
const IN_BRACKETS = new RegExp(String.raw`^(.*?)\s*\(\s*(\d+)\s*(\+)?\s*${PLACES}\s*\)$`, "i");
const SPELLED_OUT = new RegExp(String.raw`^(.*?)\s+(\d+)\s*(\+)?\s+${PLACES}$`, "i");

/** A count read off the end of a name: "(35 countries)", "(20+ areas)", "35 areas", " 30", "8". */
function takeCount(value: string): { rest: string; count: string | null; n: number } {
  const bracket = value.match(IN_BRACKETS) ?? value.match(SPELLED_OUT);
  if (bracket) return { rest: bracket[1], count: `${bracket[2]}${bracket[3] ?? ""}`, n: Number(bracket[2]) };
  const trailing = value.match(/^(.*?[a-z)])\s*(\d+)(\+)?$/i);
  if (trailing) return { rest: trailing[1], count: `${trailing[2]}${trailing[3] ?? ""}`, n: Number(trailing[2]) };
  return { rest: value, count: null, n: 0 };
}

/** Tags read off the end of a name, in the order they were written. */
function takeTags(value: string): { rest: string; tags: Tag[] } {
  let rest = value.replace(/[\s\-–—]+$/, "");
  const tags: Tag[] = [];
  for (;;) {
    let match = rest.match(/^(.*?)\s*\(\s*(promo|promotion|new)\s*\)$/i);
    if (match) {
      tags.unshift({ kind: /^new$/i.test(match[2]) ? "new" : "promo" });
      rest = match[1];
      continue;
    }
    match = rest.match(/^(.*?)\s*(\d+(?:\.\d+)?\s*(?:GB|MB))\s*\/\s*day$/i);
    if (match) {
      tags.unshift({ kind: "daily", amount: match[2].replace(/\s+/g, "").toUpperCase() });
      rest = match[1];
      continue;
    }
    match = rest.match(/^(.*?)\s*(?:esim\s+)?unlimited$/i);
    if (match && match[1]) {
      tags.unshift({ kind: "unlimited" });
      rest = match[1];
      continue;
    }
    return { rest: rest.trim(), tags };
  }
}

function tagIn(tag: Tag, locale: string): string {
  const words = TAG_WORDS[languageOf(locale)];
  if (tag.kind === "daily") return words ? words.daily(tag.amount) : `${tag.amount}/Day`;
  return words?.[tag.kind] ?? ENGLISH_TAG[tag.kind];
}

/**
 * One piece ("Europe 40", "Hong Kong", "Middle East") in `locale`, and
 * whether it is a region; null when not understood.
 */
function pieceIn(piece: string, locale: string, aliases: Record<string, readonly string[]>): { name: string; region: boolean } | null {
  const { rest, count, n } = takeCount(piece.trim());
  const key = plain(rest);
  if (!key) return null;
  const region = REGIONS[key];
  if (region !== undefined) {
    const parts = (typeof region === "string" ? [region] : region).map((code) => regionIn(code, locale));
    if (parts.some((part) => part === null)) return null;
    const name = parts.join(" + ");
    if (!count) return { name, region: true };
    const withCount = WITH_COUNT[languageOf(locale)];
    return withCount ? { name: withCount(name, count, n), region: true } : null;
  }
  // A number after a country is not a count of countries ("Japan 5"): left as the supplier wrote it.
  if (count) return null;
  const code = countryIndex(aliases).get(key);
  // Hong Kong and Macao by their short names ("香港", not "中国香港特别行政区"); the
  // others' short names are abbreviations ("RU" for the UK in Spanish).
  const name = code ? displayName(locale, code, SHORT_NAMED.has(code) ? "short" : "long") : null;
  return name ? { name, region: false } : null;
}


/**
 * `name` (the supplier's English) in `locale`, or null when it is not one of
 * the shapes above or the language lacks a word it needs. `aliases` are the
 * other English names countries go by (destination-name.ts's ALSO_KNOWN_AS).
 */
export function regionNameIn(name: string, locale: string, aliases: Record<string, readonly string[]> = {}): string | null {
  const { rest, tags } = takeTags(name.trim());
  if (!rest) return null;
  const { rest: core, count, n } = takeCount(rest);
  let body: string;
  // A whole name first ("North and South America", "Trinidad and Tobago"), then its pieces.
  const whole = pieceIn(core, locale, aliases);
  if (whole) {
    // "Japan (3 countries)" says something else than the country: left in English.
    if (count && !whole.region) return null;
    body = whole.name;
  } else {
    const pieces = core.split(/\s*(?:\+|&|,|\band\b)\s*/i).filter(Boolean);
    if (pieces.length < 2) return null;
    const named = pieces.map((piece) => pieceIn(piece, locale, aliases));
    if (named.some((piece) => piece === null)) return null;
    body = named.map((piece) => piece!.name).join(" + ");
  }
  if (count) {
    const withCount = WITH_COUNT[languageOf(locale)];
    if (!withCount) return null;
    body = withCount(body, count, n);
  }
  return tags.length ? [body, ...tags.map((tag) => tagIn(tag, locale))].join(" · ") : body;
}
