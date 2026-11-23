/** A short device name from a user agent: browser and system, or the app. */
export function deviceOf(agent: string | null): string {
  if (!agent) return "—";
  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Firefox\//.test(agent)
          ? "Firefox"
          : /Safari\//.test(agent)
            ? "Safari"
            : /okhttp|Expo|CFNetwork|Dalvik/i.test(agent)
              ? "App"
              : null;
  return [browser, os].filter(Boolean).join(" · ") || agent.slice(0, 40);
}
