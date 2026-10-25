/**
 * English country name → ISO 3166-1 alpha-2, for providers that only send
 * names (RoamWifi). Built from the runtime's own region names, so it needs no
 * hand-kept table; the aliases cover spellings providers use that ICU does
 * not (carried over from the esim_php RoamWifi adapter).
 */

const ALIASES: Record<string, string> = {
  "china mainland": "CN",
  "mainland china": "CN",
  prc: "CN",
  "people s republic of china": "CN",
  "hong kong sar": "HK",
  "china hong kong": "HK",
  "china hongkong": "HK",
  "hong kong china": "HK",
  macao: "MO",
  macau: "MO",
  "macau china": "MO",
  "macao china": "MO",
  "china macau": "MO",
  "china macao": "MO",
  usa: "US",
  "united states of america": "US",
  czechia: "CZ",
  "czech republic": "CZ",
  "lao pdr": "LA",
  laos: "LA",
  burma: "MM",
  "russian federation": "RU",
  "korea republic of": "KR",
  "republic of korea": "KR",
  "korea south": "KR",
  "south korea": "KR",
  "korea democratic peoples republic of": "KP",
  "north korea": "KP",
  "taiwan china": "TW",
  "ivory coast": "CI",
  "cote d ivoire": "CI",
  "reunion france": "RE",
  "curacao netherlands": "CW",
  uk: "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  uae: "AE",
  turkey: "TR",
};

export function normalizeCountryName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[&\/\-(),.'’]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ (sar|prc)$/, "")
    .trim();
}

let lookup: Map<string, string> | null = null;

function buildLookup(): Map<string, string> {
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const map = new Map<string, string>();
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = names.of(code);
      if (name) map.set(normalizeCountryName(name), code);
    }
  }
  for (const [alias, code] of Object.entries(ALIASES)) map.set(normalizeCountryName(alias), code);
  return map;
}

export function countryCodeFromName(name: string): string | null {
  lookup ??= buildLookup();
  return lookup.get(normalizeCountryName(name)) ?? null;
}

export function countryNameFromCode(code: string): string {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}
