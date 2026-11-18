import { describe, expect, it } from "vitest";
import {
  completeTodo,
  formatUpcoming,
  habitProgress,
  habitsToRemind,
  openTodos,
  parseDollarQuote,
  toggleHabitDay,
  upcomingReminders,
} from "./home.js";

describe("upcomingReminders", () => {
  it("keeps enabled reminders due by the end of tomorrow, soonest first, and marks which repeat", () => {
    const tuesdayNoon = new Date(2026, 10, 10, 12, 0).getTime();
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();
    const once = { triggerType: "once" };
    const weekly = { triggerType: "schedule" };
    const reminders = upcomingReminders(
      [
        { id: "monday", name: "Singing lessons", enabled: true, nextRunAt: at(16, 14), trigger: weekly },
        { id: "card", name: "pay-card", enabled: true, nextRunAt: at(11, 9), trigger: once },
        { id: "daily", name: "Inbox check", enabled: true, nextRunAt: at(10, 18), trigger: weekly },
        { id: "late", name: "Late", enabled: true, nextRunAt: at(12, 0), trigger: once },
        { id: "paused", name: "Paused", enabled: false, nextRunAt: at(10, 15), trigger: once },
        { id: "fired", name: "Fired", enabled: true, nextRunAt: null, trigger: once },
        { automationId: "e", problem: "unreadable" },
      ],
      tuesdayNoon,
    );
    expect(reminders.map((reminder) => [reminder.id, reminder.name, reminder.repeats])).toEqual([
      ["daily", "Inbox check", true],
      ["card", "Pay card", false],
    ]);
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
    expect(formatUpcoming(now - 86_400_000, now).startsWith(days.format(-1, "day"))).toBe(true);
    expect(formatUpcoming(thursday, now).startsWith(weekday.format(thursday))).toBe(true);
    expect(formatUpcoming(nextMonth, now).startsWith(weekday.format(nextMonth))).toBe(false);
  });
});

describe("to-dos", () => {
  const day = 86_400_000;
  const todos = [
    { id: "someday", title: "Read the RFC", dueAt: null, doneAt: null },
    { id: "rent", title: "Pay rent", dueAt: 20 * day, doneAt: null },
    { id: "old", title: "Renew passport", dueAt: null, doneAt: 1 },
  ];

  it("lists open to-dos with a due date first, soonest first", () => {
    expect(openTodos(todos).map((todo) => todo.id)).toEqual(["rent", "someday"]);
  });

  it("marks one done, drops ones done over a week ago, and rejects unknown ids", () => {
    const next = completeTodo(todos, "rent", 10 * day);
    expect(next.map((todo) => [todo.id, todo.doneAt])).toEqual([
      ["someday", null],
      ["rent", 10 * day],
    ]);
    expect(() => completeTodo(todos, "missing", 0)).toThrow("missing");
  });
});

describe("parseDollarQuote", () => {
  it("reads the AwesomeAPI USD-BRL bid and daily change, which arrive as strings", () => {
    expect(parseDollarQuote({ USDBRL: { bid: "5.784", pctChange: "-0.42", code: "USD" } })).toEqual({
      brl: 5.784,
      pctChange: -0.42,
    });
    expect(() => parseDollarQuote({ status: 429 })).toThrow();
  });
});

describe("habits", () => {
  const now = new Date(2026, 10, 17, 19, 0).getTime();
  const gym = { id: "gym", title: "Academia", remindHour: 19, days: ["2026-10-01", "2026-11-14", "2026-11-15", "2026-11-16"] };

  it("counts a streak through yesterday until today is checked, and the last 30 days", () => {
    expect(habitProgress(gym, now)).toMatchObject({ doneToday: false, streak: 3, last30: 3, total: 4 });
    const checked = toggleHabitDay([gym], "gym", "2026-11-17")[0]!;
    expect(habitProgress(checked, now)).toMatchObject({ doneToday: true, streak: 4, last30: 4 });
    expect(toggleHabitDay([checked], "gym", "2026-11-17")[0]!.days).toEqual(gym.days);
  });

  it("reminds at the remind hour only on days it is not checked", () => {
    expect(habitsToRemind([gym], now)).toHaveLength(1);
    expect(habitsToRemind([gym], now + 3_600_000)).toHaveLength(0);
    expect(habitsToRemind(toggleHabitDay([gym], "gym", "2026-11-17"), now)).toHaveLength(0);
  });
});
