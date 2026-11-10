import { ImageResponse } from "next/og";
import { readableForegroundColor } from "@/lib/site-config/appearance-colors";
import { nameFontSize, type CoverFacts } from "@/lib/esim/catalog/cover";

/**
 * Draws an eSIM product's cover (lib/esim/catalog/cover.ts): its flags (as
 * data URLs), its name and "eSIM" on the store's colour, 1000×1000.
 */

const SIZE = 1000;

/** A hex colour mixed toward black by `amount` (0..1). */
function darker(hex: string, amount: number): string {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? digits.split("").map((d) => d + d).join("") : digits.slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!/^[0-9a-f]{6}$/i.test(full) || Number.isNaN(value)) return "#1f2937";
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function Globe({ color }: { color: string }) {
  return (
    <svg width="420" height="420" viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="3">
      <circle cx="50" cy="50" r="44" />
      <ellipse cx="50" cy="50" rx="20" ry="44" />
      <line x1="6" y1="50" x2="94" y2="50" />
      <path d="M12 28 H88 M12 72 H88" />
    </svg>
  );
}

export function coverImage({ facts, flags, primary, headers }: { facts: CoverFacts; flags: string[]; primary: string; headers?: Record<string, string> }) {
  const ink = readableForegroundColor(primary);
  const subtitle =
    facts.scope === "local" ? "eSIM data plan" : facts.countryCount > 1 ? `eSIM · ${facts.countryCount} countries` : "eSIM data plan";
  const one = flags.length === 1;
  const flagWidth = one ? 540 : 330;

    return new ImageResponse(
      (
        <div
          style={{
            width: SIZE,
            height: SIZE,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "72px 64px 80px",
            backgroundColor: primary,
            backgroundImage: `linear-gradient(145deg, ${primary} 0%, ${darker(primary, 0.35)} 100%)`,
            color: ink,
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", alignSelf: "flex-start", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", padding: "10px 26px", borderRadius: 999, border: `3px solid ${ink}`, fontSize: 36, fontWeight: 700, letterSpacing: 2 }}>
              eSIM
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 28, width: one ? flagWidth : flagWidth * 2 + 28 }}>
            {flags.length ? (
              flags.map((src, index) => (
                // The image renderer draws plain <img> only; next/image does not exist there.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  alt=""
                  src={src}
                  width={flagWidth}
                  height={Math.round((flagWidth * 2) / 3)}
                  style={{ borderRadius: one ? 28 : 20, border: "6px solid rgba(255,255,255,0.9)", boxShadow: "0 24px 60px rgba(0,0,0,0.28)" }}
                />
              ))
            ) : (
              <Globe color={ink} />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
            <div style={{ display: "flex", fontSize: nameFontSize(facts.name), fontWeight: 800, lineHeight: 1.05, maxWidth: SIZE - 128, justifyContent: "center" }}>
              {facts.name}
            </div>
            <div style={{ display: "flex", fontSize: 40, opacity: 0.85 }}>{subtitle}</div>
          </div>
        </div>
      ),
      { width: SIZE, height: SIZE, headers },
    );
}
