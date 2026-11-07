export function usageBarColorClass(usedPercent: number): string {
  if (usedPercent >= 95) return "bg-destructive";
  if (usedPercent >= 80) return "bg-warning";
  return "bg-primary";
}

export function formatUsageReset(resetsAt: string | null): string | null {
  if (resetsAt === null) return null;
  const reset = new Date(resetsAt);
  if (Number.isNaN(reset.getTime())) return null;
  const diffMs = reset.getTime() - Date.now();
  if (diffMs <= 0) return "Resetting now";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Resets in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0
      ? `Resets in ${hours} hr`
      : `Resets in ${hours} hr ${remainingMinutes} min`;
  }
  const withinWeek = diffMs < 7 * 24 * 60 * 60_000;
  const formatted = reset.toLocaleString(undefined, {
    weekday: withinWeek ? "short" : undefined,
    month: withinWeek ? undefined : "short",
    day: withinWeek ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Resets ${formatted}`;
}

export function formatUsdCents(
  cents: number,
  alwaysShowCents: boolean,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: alwaysShowCents || cents % 100 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const HOUR_MS = 3_600_000;
const WINDOW_DURATIONS: [RegExp, number][] = [
  [/^Five-hour/u, 5 * HOUR_MS],
  [/^Daily/u, 24 * HOUR_MS],
  [/^Weekly/u, 7 * 24 * HOUR_MS],
];

export function projectedUsagePercent(
  window: { label: string; usedPercent: number; resetsAt: string | null },
  now: number,
): number | null {
  const duration = WINDOW_DURATIONS.find(([pattern]) =>
    pattern.test(window.label),
  )?.[1];
  if (duration === undefined || window.resetsAt === null) return null;
  const resetsAt = Date.parse(window.resetsAt);
  if (Number.isNaN(resetsAt)) return null;
  const remaining = Math.min(duration, Math.max(0, resetsAt - now));
  const elapsed = Math.max(duration / 20, duration - remaining);
  return window.usedPercent + (window.usedPercent / elapsed) * remaining;
}

export function projectedToneClass(projectedPercent: number): string {
  return projectedPercent >= 100 ? "text-destructive" : "text-subtle-foreground";
}
