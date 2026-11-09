import { z } from "zod";

export const HOME_ITEM_LIMIT = 5;
export const NOTIFICATION_LOG_LIMIT = 20;
const DONE_TODO_KEEP_MS = 7 * 86_400_000;

export const reminderSchema = z.object({
  id: z.string(),
  name: z.string(),
  nextRunAt: z.number(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const notificationSchema = z.object({
  title: z.string(),
  body: z.string(),
  at: z.number(),
});
export type AssistantNotification = z.infer<typeof notificationSchema>;

const automationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
});

export function upcomingReminders(rows: readonly unknown[]): Reminder[] {
  return rows
    .flatMap((row) => {
      const parsed = automationRowSchema.safeParse(row);
      if (!parsed.success || !parsed.data.enabled || parsed.data.nextRunAt === null) return [];
      return [{ id: parsed.data.id, name: parsed.data.name, nextRunAt: parsed.data.nextRunAt }];
    })
    .sort((a, b) => a.nextRunAt - b.nextRunAt)
    .slice(0, HOME_ITEM_LIMIT);
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

export function appendNotification(
  log: readonly AssistantNotification[],
  notification: AssistantNotification,
): AssistantNotification[] {
  return [notification, ...log].slice(0, NOTIFICATION_LOG_LIMIT);
}

const relativeDay = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatUpcoming(at: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const time = timeFormat.format(at);
  if (days <= 1) return `${relativeDay.format(Math.max(days, 0), "day")} ${time}`;
  if (days < 7) return `${weekdayFormat.format(at)} ${time}`;
  return `${dateFormat.format(at)} ${time}`;
}
