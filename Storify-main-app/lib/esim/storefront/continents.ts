/**
 * Which part of the world a country is filed under on the destination
 * overview (WEB-30). Pure. Grouped as travellers look for them rather than by
 * strict geography: the Gulf and the Levant are "Middle East", Turkey and
 * Cyprus are "Europe", Central America and the Caribbean are "North America".
 */

export const CONTINENTS = [
  "europe",
  "asia",
  "middle_east",
  "north_america",
  "south_america",
  "oceania",
  "africa",
  "other",
] as const;

export type Continent = (typeof CONTINENTS)[number];

export const CONTINENT_LABELS: Record<Continent, string> = {
  europe: "Europe",
  asia: "Asia",
  middle_east: "Middle East",
  north_america: "North America",
  south_america: "South America",
  oceania: "Oceania",
  africa: "Africa",
  other: "Other",
};

const CODES: Record<Exclude<Continent, "other">, string> = {
  europe:
    "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA VA XK",
  asia: "AF AM AZ BD BN BT CN GE HK ID IN JP KG KH KP KR KZ LA LK MM MN MO MV MY NP PH PK SG TH TJ TL TM TW UZ VN",
  middle_east: "AE BH IL IQ IR JO KW LB OM PS QA SA SY YE",
  north_america:
    "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
  south_america: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  oceania: "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS",
  africa:
    "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
};

const BY_CODE = new Map<string, Continent>(
  Object.entries(CODES).flatMap(([continent, codes]) =>
    codes.split(" ").map((code) => [code, continent as Continent] as const),
  ),
);

export function continentOf(countryCode: string | null | undefined): Continent {
  return (countryCode && BY_CODE.get(countryCode.toUpperCase())) || "other";
}

/** "JP" → "🇯🇵"; anything that is not two letters → "". */
export function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}
