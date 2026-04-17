export type Rung = {
  label: string;
  days?: number;
  months?: number;
  years?: number;
};

export const LADDER: Rung[] = [
  { label: "1d", days: 1 },
  { label: "3d", days: 3 },
  { label: "1w", days: 7 },
  { label: "2w", days: 14 },
  { label: "1mo", months: 1 },
  { label: "2mo", months: 2 },
  { label: "6mo", months: 6 },
  { label: "1y", years: 1 },
  { label: "2y", years: 2 },
  { label: "5y", years: 5 },
  { label: "10y", years: 10 },
];

export const WINDOW_TIERS_DAYS = [3, 7, 14];

export function shiftDateBack(d: Date, rung: Rung): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (rung.years) r.setFullYear(r.getFullYear() - rung.years);
  if (rung.months) r.setMonth(r.getMonth() - rung.months);
  if (rung.days) r.setDate(r.getDate() - rung.days);
  return r;
}

export function windowRangeMs(anchor: Date, tierDays: number): [number, number] {
  const from = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() - tierDays,
    0,
    0,
    0,
    0,
  );
  const to = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + tierDays,
    23,
    59,
    59,
    999,
  );
  return [from.getTime(), to.getTime()];
}

export function journalDayToDate(jd: number): Date {
  const s = String(jd);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return new Date(y, m, d);
}

const GUNK_PATTERNS: RegExp[] = [
  /^\s*$/,
  /^#+\s*$/,
  /^(NOW|LATER|TODO|DONE|DOING|WAITING|CANCELLED)\s*$/i,
  /^\[\[[^\]]+\]\]\s*$/,
  /^#\S+\s*$/,
  /^\(\([0-9a-f-]{36}\)\)\s*$/i,
  /^[A-Za-z_-]+::\s*.*$/,
];

export function isGunk(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 8) return true;
  for (const p of GUNK_PATTERNS) if (p.test(trimmed)) return true;
  const propOnly = trimmed
    .split("\n")
    .every((line) => /^[A-Za-z_-]+::\s*.*$/.test(line) || line.trim() === "");
  return propOnly;
}

export function stripLogseqMarkers(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^[A-Za-z_-]+::\s*.*$/.test(line))
    .join("\n")
    .replace(/^(NOW|LATER|TODO|DONE|DOING|WAITING|CANCELLED)\s+/i, "")
    .replace(/^#+\s+/, "")
    .trim();
}
