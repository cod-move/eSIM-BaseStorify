/** The translator shape (lib/esim/i18n/server.ts); a type only, so a block can import this file. */
type Translate = (key: string, fallback: string) => string;

/**
 * The sentences the eSIM template ships, known by their English text (patch
 * P35): the theme's home page (lib/esim/storefront/theme.ts), the blocks'
 * defaults and starters (lib/esim/storefront/sections/) and the device list
 * (lib/esim/storefront/devices.ts). Their translations are `esim.copy.*` in
 * locales/esim/*.json. No imports beyond types, so a block can use it.
 */

/** English text → its message id under `esim.copy`. */
export const TEMPLATE_COPY: Record<string, string> = {
  // Search hero
  "Stay connected in 190+ countries": "heroTitle",
  "Prepaid travel eSIMs. Install in minutes, no roaming bills.": "heroSubtitle",
  "Where are you going?": "heroPlaceholder",
  // Destinations
  "Popular destinations": "popularTitle",
  "Find your plan": "tabsTitle",
  "Countries, regions or the whole world": "tabsTitleHome",
  Countries: "tabsLocal",
  Regions: "tabsRegional",
  Global: "tabsGlobal",
  // Phone numbers
  "Need a phone number?": "numbersTitle",
  "A real mobile number on an eSIM: calls, texts and data.": "numbersSubtitle",
  "A real mobile number on an eSIM: texts and data.": "numbersSubtitleShort",
  "Choose a number": "numbersButton",
  // How it works
  "How it works": "howTitle",
  "Pick a plan": "howPick",
  "Choose your destination, days and data. Pay securely.": "howPickText",
  "Scan to install": "howScan",
  "We email your QR code at once. Scan it, or tap the one-tap link.": "howScanText",
  "Land and connect": "howLand",
  "Turn on the eSIM when you arrive. No roaming bills.": "howLandText",
  // Install guide
  "How to install your eSIM": "installTitle",
  "Open the email": "installOpen",
  "Open the eSIM email on another screen, or tap the iPhone one-tap link on this phone.": "installOpenIos",
  "Open the eSIM email on another screen, or tap the Android one-tap link on this phone.": "installOpenAndroid",
  "Add eSIM": "installAdd",
  "Settings → Mobile Service (or Cellular) → Add eSIM → Use QR Code, and scan the code.": "installAddIos",
  "Settings → Network & internet → SIMs → Add eSIM (or Download a SIM) and scan the code.": "installAddAndroid",
  "Name it": "installName",
  'Label it "Travel" and keep your usual line for calls and texts.': "installNameText",
  "Turn it on abroad": "installAbroad",
  "On arrival, choose the travel eSIM for Mobile Data and turn on Data Roaming for it.": "installAbroadIos",
  "On arrival, choose the travel eSIM for mobile data and turn on roaming for it.": "installAbroadAndroid",
  // Device check
  "Does my phone support eSIM?": "devicesTitle",
  "Find your phone to check before you buy.": "devicesSubtitle",
  "Most iPhones sold in mainland China, Hong Kong and Macao take two physical SIMs instead of an eSIM.": "deviceChinaIphone",
  "Wi-Fi + Cellular models only.": "deviceCellularOnly",
  "Models sold in mainland China, Hong Kong, Taiwan and some US carrier models do not support eSIM.": "deviceSamsung",
  "Not the models sold in Australia, Taiwan or Japan, nor US models bought from carriers other than Sprint or Google Fi.": "devicePixel3",
  "Global versions only.": "deviceGlobalOnly",
  "Not the P40 Pro+.": "deviceNotP40ProPlus",
  // FAQ
  "Questions travellers ask": "faqTitle",
  "What is an eSIM?": "faqWhatQ",
  "A SIM card built into your phone. You download a data plan by scanning a QR code — nothing to post, nothing to swap.": "faqWhatA",
  "When does my plan start?": "faqStartQ",
  "Most plans start when the eSIM first connects at your destination, so you can install it days before you travel.": "faqStartA",
  "Can I keep my own number for calls?": "faqNumberQ",
  "Yes. The eSIM carries data only; your usual SIM stays on for calls and texts.": "faqNumberA",
  "What if I run out of data?": "faqDataQ",
  "Plans that allow it can be topped up from My eSIMs, or buy another plan for the same trip.": "faqDataA",
};

/** The text in the page's language when the template ships it; anything else as it is. */
export function templateText(text: string, tr: Translate): string {
  const id = TEMPLATE_COPY[text.trim()];
  return id ? tr(`esim.copy.${id}`, text) : text;
}

