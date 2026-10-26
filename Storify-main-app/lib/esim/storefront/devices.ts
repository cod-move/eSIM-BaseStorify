/**
 * Phones and tablets known to take an eSIM (WEB-16). Pure data, shipped with
 * the module until the admin's device table (ADM) replaces it.
 *
 * A model listed here supports eSIM in general; whether a given handset does
 * also depends on where it was bought and on its carrier lock, which is what
 * `note` and the block's general caution say.
 */

export interface DeviceBrand {
  brand: string;
  models: Array<{ name: string; note?: string }>;
}

const list = (names: string, note?: string) => names.split("|").map((name) => ({ name: name.trim(), ...(note ? { note } : {}) }));

const CHINA_IPHONE = "Most iPhones sold in mainland China, Hong Kong and Macao take two physical SIMs instead of an eSIM.";

export const ESIM_DEVICES: DeviceBrand[] = [
  {
    brand: "Apple",
    models: [
      ...list(
        "iPhone 17 Pro Max|iPhone 17 Pro|iPhone Air|iPhone 17|iPhone 16e|iPhone 16 Pro Max|iPhone 16 Pro|iPhone 16 Plus|iPhone 16|" +
          "iPhone 15 Pro Max|iPhone 15 Pro|iPhone 15 Plus|iPhone 15|iPhone 14 Pro Max|iPhone 14 Pro|iPhone 14 Plus|iPhone 14|" +
          "iPhone 13 Pro Max|iPhone 13 Pro|iPhone 13|iPhone 13 mini|iPhone 12 Pro Max|iPhone 12 Pro|iPhone 12|iPhone 12 mini|" +
          "iPhone 11 Pro Max|iPhone 11 Pro|iPhone 11|iPhone XS Max|iPhone XS|iPhone XR|iPhone SE (2022)|iPhone SE (2020)",
        CHINA_IPHONE,
      ),
      ...list(
        "iPad Pro (M4 and later)|iPad Pro 12.9-inch (3rd generation and later)|iPad Pro 11-inch (all)|iPad Air (3rd generation and later)|" +
          "iPad (7th generation and later)|iPad mini (5th generation and later)",
        "Wi-Fi + Cellular models only.",
      ),
    ],
  },
  {
    brand: "Samsung",
    models: list(
      "Galaxy S25 Ultra|Galaxy S25+|Galaxy S25|Galaxy S25 Edge|Galaxy S24 Ultra|Galaxy S24+|Galaxy S24|Galaxy S24 FE|" +
        "Galaxy S23 Ultra|Galaxy S23+|Galaxy S23|Galaxy S23 FE|Galaxy S22 Ultra|Galaxy S22+|Galaxy S22|" +
        "Galaxy S21 Ultra 5G|Galaxy S21+ 5G|Galaxy S21 5G|Galaxy S20 Ultra|Galaxy S20+|Galaxy S20|" +
        "Galaxy Z Fold7|Galaxy Z Fold6|Galaxy Z Fold5|Galaxy Z Fold4|Galaxy Z Fold3|Galaxy Z Fold2|" +
        "Galaxy Z Flip7|Galaxy Z Flip6|Galaxy Z Flip5|Galaxy Z Flip4|Galaxy Z Flip3|Galaxy Z Flip|" +
        "Galaxy Note20 Ultra|Galaxy Note20|Galaxy A56|Galaxy A55|Galaxy A54|Galaxy A36|Galaxy A35",
      "Models sold in mainland China, Hong Kong, Taiwan and some US carrier models do not support eSIM.",
    ),
  },
  {
    brand: "Google",
    models: list(
      "Pixel 10 Pro XL|Pixel 10 Pro|Pixel 10|Pixel 9 Pro XL|Pixel 9 Pro Fold|Pixel 9 Pro|Pixel 9|Pixel 9a|" +
        "Pixel 8 Pro|Pixel 8|Pixel 8a|Pixel 7 Pro|Pixel 7|Pixel 7a|Pixel Fold|Pixel 6 Pro|Pixel 6|Pixel 6a|" +
        "Pixel 5|Pixel 5a|Pixel 4 XL|Pixel 4|Pixel 4a|Pixel 3 XL|Pixel 3",
    ).map((model) =>
      /Pixel 3/.test(model.name)
        ? { ...model, note: "Not the models sold in Australia, Taiwan or Japan, nor US models bought from carriers other than Sprint or Google Fi." }
        : model,
    ),
  },
  {
    brand: "Motorola",
    models: list("razr 2024|razr+ 2024|razr 40 Ultra|razr 2022|Edge 50 Pro|Edge 40 Pro|Edge 40|Edge+ (2023)|Moto G Stylus 5G (2024)"),
  },
  {
    brand: "Xiaomi",
    models: list("Xiaomi 15 Ultra|Xiaomi 15|Xiaomi 14T Pro|Xiaomi 14 Pro|Xiaomi 14|Xiaomi 13T Pro|Xiaomi 13 Pro|Xiaomi 13|Xiaomi 12T Pro", "Global versions only."),
  },
  {
    brand: "OPPO",
    models: list("Find X8 Pro|Find X5 Pro|Find X5|Find X3 Pro|Find N2 Flip|Reno 5A"),
  },
  {
    brand: "Huawei",
    models: list("P40 Pro|P40|Mate 40 Pro", "Not the P40 Pro+."),
  },
  {
    brand: "Sony",
    models: list("Xperia 1 VI|Xperia 1 V|Xperia 1 IV|Xperia 10 VI|Xperia 10 V|Xperia 10 IV|Xperia 5 V|Xperia 5 IV"),
  },
  {
    brand: "OnePlus",
    models: list("OnePlus 13|OnePlus 12|OnePlus 11|OnePlus Open"),
  },
];

/** Models of every brand whose name contains the query; at most `limit`. */
export function searchDevices(query: string, brand?: string, limit = 20) {
  const needle = query.trim().toLowerCase();
  return ESIM_DEVICES.filter((entry) => !brand || entry.brand === brand)
    .flatMap((entry) => entry.models.map((model) => ({ brand: entry.brand, ...model })))
    .filter((model) => !needle || `${model.brand} ${model.name}`.toLowerCase().includes(needle))
    .slice(0, limit);
}
