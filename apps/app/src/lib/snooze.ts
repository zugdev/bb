const HOUR_MS = 60 * 60 * 1000;
const WAKE_HOUR = 9;

function atWakeHour(date: Date, addDays: number): number {
  const next = new Date(date);
  next.setDate(next.getDate() + addDays);
  next.setHours(WAKE_HOUR, 0, 0, 0);
  return next.getTime();
}

export const SNOOZE_PRESETS = [
  { id: "1h", label: "1 hour", until: (now: number) => now + HOUR_MS },
  { id: "3h", label: "3 hours", until: (now: number) => now + 3 * HOUR_MS },
  {
    id: "tomorrow",
    label: "Tomorrow 09:00",
    until: (now: number) => atWakeHour(new Date(now), 1),
  },
  {
    id: "monday",
    label: "Monday 09:00",
    until: (now: number) => {
      const date = new Date(now);
      return atWakeHour(date, (8 - date.getDay()) % 7 || 7);
    },
  },
] as const;

export function snoozePresetUntil(id: string, now: number): number | null {
  return SNOOZE_PRESETS.find((preset) => preset.id === id)?.until(now) ?? null;
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function dayIndex(at: number): number {
  const date = new Date(at);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      (24 * HOUR_MS),
  );
}

export function formatSnoozeWake(until: number, now: number): string {
  const time = TIME_FORMAT.format(until);
  const days = dayIndex(until) - dayIndex(now);
  if (days === 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${DAY_FORMAT.format(until)} ${time}`;
  return `${DATE_FORMAT.format(until)} ${time}`;
}
