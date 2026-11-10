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

const relativeDay = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
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
