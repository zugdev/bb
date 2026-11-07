export const WEEK_MS = 7 * 86_400_000;
const HOUR_MS = 3_600_000;

export interface WeeklyForecast {
  usedPercent: number;
  resetsAt: number;
  remainingMs: number;
  projectedPercent: number;
}

export interface StartPolicy {
  startWithinHours: number;
  targetPercent: number;
}

export function forecastWeekly(
  window: { usedPercent: number; resetsAt: string },
  now: number,
): WeeklyForecast {
  const resetsAt = Date.parse(window.resetsAt);
  const remainingMs = Math.min(WEEK_MS, Math.max(0, resetsAt - now));
  const elapsedMs = Math.max(HOUR_MS, WEEK_MS - remainingMs);
  const ratePerMs = window.usedPercent / elapsedMs;
  return {
    usedPercent: window.usedPercent,
    resetsAt,
    remainingMs,
    projectedPercent: window.usedPercent + ratePerMs * remainingMs,
  };
}

export function shouldStartIdeas(forecast: WeeklyForecast, policy: StartPolicy): boolean {
  return (
    forecast.remainingMs > 0 &&
    forecast.remainingMs <= policy.startWithinHours * HOUR_MS &&
    forecast.projectedPercent < policy.targetPercent
  );
}
