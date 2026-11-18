import { z } from "zod";

const DONE_TODO_KEEP_MS = 7 * 86_400_000;

export const reminderSchema = z.object({
  id: z.string(),
  name: z.string(),
  nextRunAt: z.number(),
  repeats: z.boolean(),
});
export type Reminder = z.infer<typeof reminderSchema>;

const automationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
  trigger: z.object({ triggerType: z.string() }),
});

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfTomorrow(now: number): number {
  const date = new Date(startOfDay(now));
  date.setDate(date.getDate() + 2);
  return date.getTime();
}

export function readableName(name: string): string {
  if (/\s/.test(name) || !/[-_]/.test(name)) return name;
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function upcomingReminders(rows: readonly unknown[], now: number): Reminder[] {
  const horizon = endOfTomorrow(now);
  return rows
    .flatMap((row) => {
      const parsed = automationRowSchema.safeParse(row);
      if (!parsed.success) return [];
      const { id, name, enabled, nextRunAt, trigger } = parsed.data;
      if (!enabled || nextRunAt === null || nextRunAt >= horizon) return [];
      return [{ id, name: readableName(name), nextRunAt, repeats: trigger.triggerType !== "once" }];
    })
    .sort((a, b) => a.nextRunAt - b.nextRunAt);
}

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueAt: z.number().nullable(),
  doneAt: z.number().nullable(),
});
export type Todo = z.infer<typeof todoSchema>;

export function openTodos(todos: readonly Todo[]): Todo[] {
  return todos
    .filter((todo) => todo.doneAt === null)
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
}

export function completeTodo(todos: readonly Todo[], id: string, at: number): Todo[] {
  if (!todos.some((todo) => todo.id === id)) throw new Error(`No to-do with id ${id}.`);
  return todos
    .map((todo) => (todo.id === id ? { ...todo, doneAt: at } : todo))
    .filter((todo) => todo.doneAt === null || at - todo.doneAt < DONE_TODO_KEEP_MS);
}

export const dollarSchema = z.object({ brl: z.number(), pctChange: z.number() });
export type Dollar = z.infer<typeof dollarSchema>;

const awesomeApiQuoteSchema = z.object({
  USDBRL: z.object({ bid: z.coerce.number(), pctChange: z.coerce.number() }),
});

export function parseDollarQuote(body: unknown): Dollar {
  const { bid, pctChange } = awesomeApiQuoteSchema.parse(body).USDBRL;
  return { brl: bid, pctChange };
}

export const newsBriefSchema = z.object({ day: z.string(), items: z.array(z.string()) });
export type NewsBrief = z.infer<typeof newsBriefSchema>;

export function localDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const relativeDay =new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function formatUpcoming(at: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const time = timeFormat.format(at);
  if (Math.abs(days) <= 1) return `${relativeDay.format(days, "day")} ${time}`;
  if (Math.abs(days) < 7) return `${weekdayFormat.format(at)} ${time}`;
  return `${dateFormat.format(at)} ${time}`;
}

export const habitSchema = z.object({
  id: z.string(),
  title: z.string(),
  remindHour: z.number().int().min(0).max(23).nullable(),
  days: z.array(z.string()),
});
export type Habit = z.infer<typeof habitSchema>;

export const habitProgressSchema = z.object({
  id: z.string(),
  title: z.string(),
  doneToday: z.boolean(),
  streak: z.number(),
  last30: z.number(),
  total: z.number(),
});
export type HabitProgress = z.infer<typeof habitProgressSchema>;

function daysBefore(now: number, count: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() - count);
  return localDay(date.getTime());
}

export function habitProgress(habit: Habit, now: number): HabitProgress {
  const done = new Set(habit.days);
  const doneToday = done.has(localDay(now));
  let streak = 0;
  while (done.has(daysBefore(now, doneToday ? streak : streak + 1))) streak += 1;
  const since = daysBefore(now, 29);
  return {
    id: habit.id,
    title: habit.title,
    doneToday,
    streak,
    last30: habit.days.filter((day) => day >= since).length,
    total: done.size,
  };
}

export function toggleHabitDay(habits: readonly Habit[], id: string, day: string): Habit[] {
  if (!habits.some((habit) => habit.id === id)) throw new Error(`No habit with id ${id}.`);
  return habits.map((habit) => {
    if (habit.id !== id) return habit;
    const days = habit.days.includes(day) ? habit.days.filter((d) => d !== day) : [...habit.days, day].sort();
    return { ...habit, days };
  });
}

export function habitsToRemind(habits: readonly Habit[], now: number): Habit[] {
  const hour = new Date(now).getHours();
  const today = localDay(now);
  return habits.filter((habit) => habit.remindHour === hour && !habit.days.includes(today));
}
