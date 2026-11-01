/**
 * Country flags as pictures. Windows draws flag emoji as two letters
 * ("JP"), so the storefront shows SVG files instead: public/esim/flags, taken
 * from country-flag-icons (MIT, licence beside them). Pure.
 */

/** The two-letter codes that have a file, EU included. */
const FLAGS = new Set(
  `
  AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
  BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG
  EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN
  HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI
  LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE
  NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC
  SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV
  TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.split(/\s+/).filter(Boolean),
);

/** "jp" → "/esim/flags/JP.svg"; null when there is no flag for it. */
export function flagSrc(countryCode: string | null | undefined): string | null {
  const code = countryCode?.toUpperCase();
  return code && FLAGS.has(code) ? `/esim/flags/${code}.svg` : null;
}

/** "🇪🇺" → "EU": the country of an emoji flag; null for any other text. */
export function emojiFlagCode(emoji: string | null | undefined): string | null {
  const points = [...(emoji ?? "").trim()].map((char) => char.codePointAt(0) ?? 0);
  if (points.length !== 2 || points.some((point) => point < 0x1f1e6 || point > 0x1f1ff)) return null;
  return String.fromCharCode(...points.map((point) => point - 0x1f1e6 + 65));
}

/**
 * The flag a destination shows: its country's for a single country, else the
 * one its emoji stands for (a region set to "🇪🇺"); null to keep the emoji.
 */
export function destinationFlag(destination: { scope: string; countryCodes: string[]; emoji: string | null }): string | null {
  return destination.scope === "local"
    ? flagSrc(destination.countryCodes[0]) ?? flagSrc(emojiFlagCode(destination.emoji))
    : flagSrc(emojiFlagCode(destination.emoji));
}
