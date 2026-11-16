#!/usr/bin/env node
/**
 * Makes the CodSIM Business app's icons from the shopper app's CodSIM fish:
 * the fish on a golden-yellow tile with a blue briefcase badge, so the two apps tell
 * apart at a glance on a phone.
 *
 *   node tools/brand/business-icons.js
 *
 * Reads storify-customer-app/assets/images/android-icon-foreground.png (the
 * fish on transparent) and writes into Storify-business-app/assets/images:
 * icon.png, android-icon.png, android-icon-foreground.png,
 * android-icon-monochrome.png, splash-icon.png, favicon.png,
 * notification-icon.png. Uses the web app's sharp.
 */
const path = require("node:path");
const sharp = require(path.join(__dirname, "../../Storify-main-app/node_modules/sharp"));

const ROOT = path.join(__dirname, "../..");
const FISH = path.join(ROOT, "storify-customer-app/assets/images/android-icon-foreground.png");
const OUT = path.join(ROOT, "Storify-business-app/assets/images");

/** The tile behind the fish; also the adaptive icon's background colour in app.json. */
const TILE_TOP = "#FFD24D";
const TILE_BOTTOM = "#FFB31A";

function tile(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${TILE_TOP}"/><stop offset="1" stop-color="${TILE_BOTTOM}"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`);
}

/** A briefcase in a 100×100 box: the handle, the case, the line across it. */
function briefcase(fill, band) {
  return `<path d="M37 33v-5a7 7 0 0 1 7-7h12a7 7 0 0 1 7 7v5" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>
  <rect x="15" y="33" width="70" height="48" rx="10" fill="${fill}"/>
  <rect x="15" y="52" width="70" height="6" fill="${band}"/>
  <rect x="44" y="49" width="12" height="12" rx="3" fill="${fill}"/>`;
}

/** The blue badge, `size` across, with a white ring. */
function badge(size) {
  const ring = size * 0.055;
  const glyph = size * 0.58;
  const offset = (size - glyph) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5B9BFF"/><stop offset="1" stop-color="#1F5FE0"/>
  </linearGradient></defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - ring / 2}" fill="url(#b)" stroke="#FFFFFF" stroke-width="${ring}"/>
  <svg x="${offset}" y="${offset}" width="${glyph}" height="${glyph}" viewBox="0 0 100 100">${briefcase("#FFFFFF", "#2A6CF0")}</svg>
</svg>`);
}

/** The badge as a silhouette with the briefcase cut out, for the monochrome icons. */
function badgeSilhouette(size) {
  const glyph = size * 0.58;
  const offset = (size - glyph) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><mask id="m"><rect width="${size}" height="${size}" fill="white"/>
    <svg x="${offset}" y="${offset}" width="${glyph}" height="${glyph}" viewBox="0 0 100 100">${briefcase("black", "white")}</svg>
  </mask></defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white" mask="url(#m)"/>
</svg>`);
}

/**
 * The fish and its badge on transparent, `size` square, the pair `scale` of
 * it across (an adaptive icon keeps to the middle two thirds).
 */
async function mark(size, scale, { silhouette = false } = {}) {
  const box = Math.round(size * scale);
  const fishSize = Math.round(box * 0.86);
  let fish = sharp(FISH).trim().resize(fishSize, fishSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (silhouette) {
    const alpha = await fish.clone().extractChannel("alpha").toBuffer();
    fish = sharp({ create: { width: fishSize, height: fishSize, channels: 3, background: "#FFFFFF" } }).joinChannel(alpha);
  }
  const fishPng = await fish.png().toBuffer();
  const badgeSize = Math.round(box * 0.4);
  const badgePng = await sharp(silhouette ? badgeSilhouette(badgeSize) : badge(badgeSize)).png().toBuffer();
  const left = Math.round((size - box) / 2);
  const top = Math.round((size - box) / 2);
  const badgeLeft = left + box - badgeSize;
  const badgeTop = top + box - badgeSize;
  // A silhouette has no white ring: a gap is cut around the badge instead, so it stays apart from the fish.
  const gap = Math.round(badgeSize * 0.14);
  const cut = silhouette
    ? [{
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${badgeSize + gap * 2}" height="${badgeSize + gap * 2}"><circle cx="${badgeSize / 2 + gap}" cy="${badgeSize / 2 + gap}" r="${badgeSize / 2 + gap}" fill="black"/></svg>`),
        left: badgeLeft - gap,
        top: badgeTop - gap,
        blend: "dest-out",
      }]
    : [];
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: fishPng, left, top },
      ...cut,
      { input: badgePng, left: badgeLeft, top: badgeTop },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const write = (name, input) => sharp(input).png().toFile(path.join(OUT, name)).then(() => console.log("wrote", name));

  // The full icon (iOS, Android before adaptive icons, the web): the yellow tile under the mark.
  const icon = await sharp(tile(1024)).composite([{ input: await mark(1024, 0.74) }]).png().toBuffer();
  await write("icon.png", icon);
  await write("android-icon.png", icon);
  await write("favicon.png", await sharp(icon).resize(96, 96).png().toBuffer());

  // Adaptive icon: the mark alone in the safe middle; app.json gives the tile's colour behind it.
  await write("android-icon-foreground.png", await mark(1024, 0.56));
  await write("android-icon-monochrome.png", await mark(1024, 0.56, { silhouette: true }));

  // Launch screen (on app.json's splash colour) and the notification icon (white on transparent).
  await write("splash-icon.png", await mark(1024, 0.92));
  await write("notification-icon.png", await sharp(await mark(1024, 0.92, { silhouette: true })).resize(96, 96).png().toBuffer());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
