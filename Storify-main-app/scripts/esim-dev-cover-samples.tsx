/**
 * Draws sample eSIM product covers to files, without a database or a
 * server: `pnpm exec tsx scripts/esim-dev-cover-samples.tsx <out-dir>`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { coverFacts } from "@/lib/esim/catalog/cover";
import { coverImage } from "@/lib/esim/catalog/cover-image";

const samples = [
  { slug: "japan", primary: "#2563eb", plans: [{ destination: "Japan", emoji: null, coverage: { scope: "local" as const, countries: [{ code: "JP" }] } }] },
  { slug: "europe", primary: "#0f766e", plans: [{ destination: "Europe 35 areas", emoji: "🇪🇺", coverage: { scope: "regional" as const, countries: [{ code: "FR" }, { code: "DE" }] } }] },
  { slug: "asia", primary: "#f59e0b", plans: [{ destination: "Asia 12 areas", emoji: null, coverage: { scope: "regional" as const, countries: ["JP", "KR", "TH", "SG", "VN"].map((code) => ({ code })) } }] },
  { slug: "global", primary: "#111827", plans: [{ destination: "Global 120 areas", emoji: "🌍", coverage: { scope: "global" as const, countries: [] } }] },
];

async function main() {
  const out = process.argv[2] ?? "cover-samples";
  await mkdir(out, { recursive: true });
  for (const sample of samples) {
    const facts = coverFacts(sample.plans, sample.slug);
    const flags = await Promise.all(
      facts.flags.map(async (src) => `data:image/svg+xml;base64,${(await readFile(path.join(process.cwd(), "public", src))).toString("base64")}`),
    );
    const response = coverImage({ facts, flags, primary: sample.primary });
    await writeFile(path.join(out, `${sample.slug}.png`), Buffer.from(await response.arrayBuffer()));
    console.log("wrote", sample.slug);
  }
}

void main();
