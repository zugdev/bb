import { describe, expect, it } from "vitest";
import { appendNotification, formatUpcoming, NOTIFICATION_LOG_LIMIT, upcomingReminders } from "./home.js";

describe("upcomingReminders", () => {
  it("keeps enabled automations with a next run, soonest first, and skips read problems", () => {
    const reminders = upcomingReminders([
      { id: "a", name: "Weekly review", enabled: true, nextRunAt: 300 },
      { id: "b", name: "Paused", enabled: false, nextRunAt: 100 },
      { id: "c", name: "Done one off", enabled: true, nextRunAt: null },
      { id: "d", name: "Email at 9", enabled: true, nextRunAt: 200 },
      { automationId: "e", problem: "unreadable" },
    ]);
    expect(reminders.map((reminder) => reminder.id)).toEqual(["d", "a"]);
  });
});

describe("appendNotification", () => {
  it("puts the newest first and drops the oldest past the limit", () => {
    let log = appendNotification([], { title: "first", body: "", at: 1 });
    for (let at = 2; at <= NOTIFICATION_LOG_LIMIT + 1; at++) {
      log = appendNotification(log, { title: `n${at}`, body: "", at });
    }
    expect(log).toHaveLength(NOTIFICATION_LOG_LIMIT);
    expect(log[0]?.at).toBe(NOTIFICATION_LOG_LIMIT + 1);
    expect(log.some((notification) => notification.title === "first")).toBe(false);
  });
});

describe("formatUpcoming", () => {
  it("buckets by calendar day so a late night reminder for the next morning reads as tomorrow", () => {
    const days = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const now = new Date(2026, 10, 8, 23, 30).getTime();
    const nextMorning = new Date(2026, 10, 9, 9, 0).getTime();
    const thursday = new Date(2026, 10, 12, 9, 0).getTime();
    const nextMonth = new Date(2026, 11, 20, 9, 0).getTime();
    expect(formatUpcoming(now + 60_000, now).startsWith(days.format(0, "day"))).toBe(true);
    expect(formatUpcoming(nextMorning, now).startsWith(days.format(1, "day"))).toBe(true);
    expect(formatUpcoming(thursday, now).startsWith(weekday.format(thursday))).toBe(true);
    expect(formatUpcoming(nextMonth, now).startsWith(weekday.format(nextMonth))).toBe(false);
  });
});
