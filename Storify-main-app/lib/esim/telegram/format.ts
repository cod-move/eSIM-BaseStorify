/** "850 MB", "1.5 GB", "2 GB" (1 GB = 1024 MB, as eSIM plans count). Safe in the browser. */
export function formatMb(mb: number): string {
  const sign = mb < 0 ? "-" : "";
  const value = Math.abs(Math.round(mb));
  if (value < 1024) return `${sign}${value} MB`;
  const gb = value / 1024;
  return `${sign}${Number.isInteger(gb) ? gb : gb.toFixed(gb < 10 ? 2 : 1).replace(/0+$/, "").replace(/\.$/, "")} GB`;
}
